import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { now, newPid, type Env, type Vars } from '../env';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
import { accessTokenFor, fileMeta, fetchExportHtml, MAX_SNAPSHOT_CHARS } from '../lib/google';
import { checkDocGate } from '../lib/pure/docgate.mjs';
import { sanitizeExport } from '../lib/sanitize';
import { sameOrigin } from '../lib/session';
import { page, esc, section, empty, timeAgo, fmtDate, writerChip, confirmForm } from '../lib/html';
import { assignNextFor } from '../lib/assigner';
import { servePublicCached, purgeWork, purge, keyUser, keyWork } from '../lib/cache';

export const works = new Hono<{ Bindings: Env; Variables: Vars }>();

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sanitized snapshot, or '' when the doc is too large to store ("too long"). */
async function snapshotOf(exp: { html: string; tooLarge: boolean }): Promise<string> {
  if (exp.tooLarge) return '';
  const clean = await sanitizeExport(exp.html);
  return clean.length > MAX_SNAPSHOT_CHARS ? '' : clean;
}

type TocEntry = { level: number; id: string; text: string };

/** Anchor the snapshot's headings and collect them for a contents list.
 *  A lone leading h1 is the piece's title, not a section — excluded. */
async function withHeadingAnchors(html: string): Promise<{ html: string; toc: TocEntry[] }> {
  const all: TocEntry[] = [];
  const rw = new HTMLRewriter();
  for (const level of [1, 2, 3]) {
    rw.on(`h${level}`, {
      element(el) {
        const id = `s-${all.length + 1}`;
        all.push({ level, id, text: '' });
        el.setAttribute('id', id);
      },
      text(t) {
        if (all.length) all[all.length - 1].text += t.text;
      },
    });
  }
  const out = await rw.transform(new Response(html, { headers: { 'content-type': 'text/html' } })).text();
  const soleLeadingH1 = all[0]?.level === 1 && all.filter((e) => e.level === 1).length === 1;
  return { html: out, toc: soleLeadingH1 ? all.slice(1) : all };
}

function tocHtml(toc: TocEntry[]): string {
  if (toc.length < 2) return '';
  const minLevel = Math.min(...toc.map((e) => e.level));
  return `<details class="toc" open><summary>Contents</summary><ol>${toc.map((e) =>
    `<li class="toc-l${e.level - minLevel}"><a href="#${e.id}">${e.text.trim() || '…'}</a></li>`
  ).join('')}</ol></details>`;
}

// ---- Google Picker config for the "Add work" client flow ----
works.get('/api/picker-config', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  if (!c.env.PICKER_API_KEY || !c.env.GOOGLE_APP_ID) return c.json({ error: 'not_configured' }, 503);
  const accessToken = await accessTokenFor(c.env, user.id);
  if (!accessToken) return c.json({ needsAuth: true });
  return c.json({ accessToken, apiKey: c.env.PICKER_API_KEY, appId: c.env.GOOGLE_APP_ID });
});

// ---- Add a work: the sharing gate, then Draft 1 ----
works.post('/works', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ ok: false, reason: 'Please sign in.' }, 401);
  if (!sameOrigin(c)) return c.json({ ok: false, reason: 'forbidden' }, 403);
  const { fileId } = await c.req.json<{ fileId?: string }>().catch(() => ({ fileId: undefined }));
  if (!fileId || !/^[\w-]{10,100}$/.test(fileId)) return c.json({ ok: false, reason: 'No document selected.' }, 400);

  const token = await accessTokenFor(c.env, user.id);
  if (!token) return c.json({ ok: false, needsAuth: true }, 401);
  const meta = await fileMeta(token, fileId);
  if (!meta) return c.json({ ok: false, reason: 'Could not read that document from Google Drive. Try picking it again.' }, 400);

  const gate = checkDocGate(meta);
  if (!gate.ok) return c.json({ ok: false, code: gate.code, reason: gate.reason }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT pid FROM works WHERE user_id = ? AND doc_id = ? AND status = 'active'"
  ).bind(user.id, fileId).first<{ pid: string }>();
  if (existing) return c.json({ ok: true, work: existing.pid });

  const exp = await fetchExportHtml(fileId);
  if (!exp.ok) return c.json({ ok: false, reason: 'The document’s public link did not open for an anonymous reader yet. Google sometimes takes a minute to apply sharing, so check again shortly.' }, 400);
  const snapshot = await snapshotOf(exp);

  const t = now();
  const pid = newPid();
  const r = await c.env.DB.prepare(
    "INSERT INTO works (pid, user_id, doc_id, title, status, available, added_at) VALUES (?,?,?,?,'active',1,?)"
  ).bind(pid, user.id, fileId, meta.name || 'Untitled', t).run();
  await c.env.DB.prepare(
    'INSERT INTO work_versions (work_id, num, snapshot_html, content_hash, created_at) VALUES (?,1,?,?,?)'
  ).bind(r.meta.last_row_id, snapshot, await sha256(snapshot), t).run();
  c.executionCtx.waitUntil(purge(c.env, [keyUser(user.pid!)]));
  return c.json({ ok: true, work: pid });
});

// ---- Refresh: re-fetch the doc; a real change becomes the next draft ----
works.post('/works/:pid/refresh', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const w = await c.env.DB.prepare(
    "SELECT id, pid, user_id, doc_id FROM works WHERE pid = ? AND user_id = ? AND status = 'active'"
  ).bind(c.req.param('pid'), user.id).first<{ id: number; pid: string; user_id: number; doc_id: string }>();
  if (!w) return c.notFound();

  const exp = await fetchExportHtml(w.doc_id);
  if (!exp.ok) {
    await c.env.DB.prepare('UPDATE works SET available = 0 WHERE id = ?').bind(w.id).run();
    await purgeWork(c.env, w.pid, user.pid!);
    return c.redirect(`/work/${w.pid}?refresh=gone`);
  }
  const snapshot = await snapshotOf(exp);
  const hash = await sha256(snapshot);
  const latest = await c.env.DB.prepare(
    'SELECT num, content_hash FROM work_versions WHERE work_id = ? ORDER BY num DESC LIMIT 1'
  ).bind(w.id).first<{ num: number; content_hash: string | null }>();
  if (latest?.content_hash === hash) {
    await c.env.DB.prepare('UPDATE works SET available = 1 WHERE id = ?').bind(w.id).run();
    return c.redirect(`/work/${w.pid}?refresh=same`);
  }
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO work_versions (work_id, num, snapshot_html, content_hash, created_at) VALUES (?,?,?,?,?)')
      .bind(w.id, (latest?.num || 0) + 1, snapshot, hash, t),
    c.env.DB.prepare('UPDATE works SET available = 1 WHERE id = ?').bind(w.id),
  ]);
  // Title may have changed in Drive too; best-effort.
  const token = await accessTokenFor(c.env, user.id);
  if (token) {
    const meta = await fileMeta(token, w.doc_id);
    if (meta?.name) await c.env.DB.prepare('UPDATE works SET title = ? WHERE id = ?').bind(meta.name, w.id).run();
  }
  await purgeWork(c.env, w.pid, user.pid!);
  return c.redirect(`/work/${w.pid}?refresh=new`);
});

works.post('/works/:pid/remove', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const pid = c.req.param('pid');
  await c.env.DB.prepare("UPDATE works SET status = 'removed' WHERE pid = ? AND user_id = ?")
    .bind(pid, user.id).run();
  c.executionCtx.waitUntil(purgeWork(c.env, pid, user.pid!));
  return c.redirect(`/u/${user.pid}`);
});

// ---- Reading pages: /work/:id (latest draft) and /work/:id/v/:num ----
type WorkPage = {
  id: number; pid: string; user_id: number; doc_id: string; title: string; available: number; added_at: number;
  author_pid: string | null; author_demo: number; handle: string | null; hue: number | null; animal: string | null;
};

/** Raw per-draft view counter: fire-and-forget, never blocks a response.
 *  Guests are counted in the GET route (works on cache hits too); signed-in
 *  readers are counted during the live render, except the author. */
function bumpViews(env: Env, workPid: string, num: number | null): Promise<unknown> {
  const byLatest = `SELECT v.id FROM work_versions v JOIN works w ON w.id = v.work_id
     WHERE w.pid = ?1 AND w.status = 'active' ORDER BY v.num DESC LIMIT 1`;
  const byNum = `SELECT v.id FROM work_versions v JOIN works w ON w.id = v.work_id
     WHERE w.pid = ?1 AND w.status = 'active' AND v.num = ?2`;
  const stmt = `UPDATE work_versions SET views = views + 1 WHERE id = (${num === null ? byLatest : byNum})`;
  const q = env.DB.prepare(stmt);
  return (num === null ? q.bind(workPid) : q.bind(workPid, num)).run().catch(() => {});
}

async function renderWork(c: Ctx, workPid: string, wantNum: number | null): Promise<Response> {
  const user = c.get('user');
  const w = await c.env.DB.prepare(
    `SELECT w.id, w.pid, w.user_id, w.doc_id, w.title, w.available, w.added_at,
            u.pid AS author_pid, u.is_demo AS author_demo, u.handle, u.hue, u.animal
     FROM works w JOIN users u ON u.id = w.user_id
     WHERE w.pid = ? AND w.status = 'active'`
  ).bind(workPid).first<WorkPage>();
  if (!w) return c.notFound();

  const { results: versions } = await c.env.DB.prepare(
    'SELECT id, num, created_at, views FROM work_versions WHERE work_id = ? ORDER BY num'
  ).bind(w.id).all<{ id: number; num: number; created_at: number; views: number }>();
  if (!versions?.length) return c.notFound();
  const latest = versions[versions.length - 1];
  const shown = wantNum === null ? latest : versions.find((v) => v.num === wantNum);
  if (!shown) return c.notFound();
  const isLatest = shown.num === latest.num;

  const ver = await c.env.DB.prepare('SELECT snapshot_html FROM work_versions WHERE id = ?')
    .bind(shown.id).first<{ snapshot_html: string | null }>();

  const isAuthor = !!user && user.id === w.user_id;
  if (user && !isAuthor) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE work_versions SET views = views + 1 WHERE id = ?').bind(shown.id).run().catch(() => {})
    );
  }
  const docUrl = `https://docs.google.com/document/d/${encodeURIComponent(w.doc_id)}/`;

  const switcher = versions.length > 1
    ? `<span class="drafts">· drafts: ${versions.map((v) =>
        v.num === shown.num
          ? `<strong>${v.num}</strong>`
          : `<a href="${v.num === latest.num ? `/work/${w.pid}` : `/work/${w.pid}/v/${v.num}`}">${v.num}</a>`
      ).join(' ')}</span>`
    : '';
  const head = `
  <header class="work-head">
    <h1>${esc(w.title)}</h1>
    <p class="muted byline">by ${writerChip({ pid: w.author_pid, handle: w.handle, hue: w.hue, animal: w.animal })} · Draft ${shown.num} · ${fmtDate(shown.created_at)} ${switcher}</p>
    ${isLatest ? '' : `<p class="muted">You are reading an older draft. <a href="/work/${w.pid}">Read the latest →</a></p>`}
  </header>`;

  let bodyHtml: string;
  let contents = '';
  if (ver?.snapshot_html === '') {
    bodyHtml = `<p class="empty">This draft is too long to display here.${isAuthor ? ` <a href="${esc(docUrl)}" rel="noopener" target="_blank">Open the doc</a>.` : ''}</p>`;
  } else {
    const anchored = await withHeadingAnchors(ver?.snapshot_html || '');
    contents = tocHtml(anchored.toc);
    bodyHtml = `<div class="prose">${anchored.html}</div>`;
  }
  // The doc link would reveal the Google account behind the pen name, so
  // only the author ever sees it.
  const authorTools = isAuthor
    ? `<p class="doc-link"><a href="${esc(docUrl)}" rel="noopener" target="_blank">Your Google Doc</a>
       <form class="inline" method="post" action="/works/${w.pid}/refresh"><button type="submit" class="small">Refresh draft</button></form>
       <button type="button" class="small" data-copy-link="/work/${w.pid}">Copy link</button>
       <span class="muted">· ${shown.views} read${shown.views === 1 ? '' : 's'} of this draft</span></p>
      ${!w.available ? '<p class="warn">The doc’s public link is off, so readers see this stored draft instead. Turn link sharing back on in Google Docs, then click Refresh.</p>' : ''}
      ${refreshNote(c.req.query('refresh'))}`
    : '';

  // ---- Review area ----
  // Example pages: review threads between demo accounts are world-readable,
  // so visitors can see what a review conversation looks like. The review
  // box itself is withheld — the cast never writes back.
  if (w.author_demo && !isAuthor) {
    const { results: demoThreads } = await c.env.DB.prepare(
      `SELECT r.id, u.handle FROM reviews r JOIN users u ON u.id = r.reviewer_id
       WHERE r.version_id = ? AND u.is_demo = 1 ORDER BY r.created_at`
    ).bind(shown.id).all<{ id: number; handle: string | null }>();
    const inner = demoThreads?.length
      ? `<ul class="rows">${demoThreads.map((t) =>
          `<li><a href="/review/${t.id}">The conversation with ${esc(t.handle || 'a reader')} →</a></li>`).join('')}</ul>
         <p class="muted">Comments are normally private between the author and one reader. These are open because this is an example page.</p>`
      : `<p class="muted">On a real piece, readers would see a private comment box here.</p>`;
    const demoArea = section('Example comments on this draft', inner);
    return c.html(page(w.title, user, `<article class="work">${head}${contents}${bodyHtml}</article><div id="comments"></div>${demoArea}`, { bare: !user }));
  }

  let reviewArea = '';
  if (!user) {
    reviewArea = `
<section class="review-invite">
  <form id="guest-review" action="/auth/login" method="get" data-work="${w.pid}" class="stack">
    <input type="hidden" name="next" value="/work/${w.pid}">
    <p class="muted">Thoughts for the writer? A comment here is private — only ${esc(w.handle || 'the writer')} will read it.</p>
    <textarea rows="5" maxlength="20000" placeholder="Write ${esc(w.handle || 'the writer')} a note about this piece…"></textarea>
    <button type="submit">Send privately</button>
  </form>
</section>
<dialog id="signin">
  <p>To send this privately, sign in with Google. Your note is kept and sent right after, under your assigned pen name.</p>
  <div class="dialog-actions">
    <button type="button" id="signin-cancel">Not now</button>
    <a class="button" href="/auth/login?next=/work/${w.pid}">Continue with Google</a>
  </div>
</dialog>`;
    return c.html(page(w.title, null, `<article class="work">${head}${contents}${bodyHtml}</article><div id="comments"></div>${reviewArea}`, { bare: true }));
  }

  if (isAuthor) {
    const { results: threads } = await c.env.DB.prepare(
      `SELECT r.id, r.last_msg_at, u.id AS uid, u.handle, u.hue, u.animal FROM reviews r
       JOIN users u ON u.id = r.reviewer_id WHERE r.version_id = ? ORDER BY r.last_msg_at DESC`
    ).bind(shown.id).all<{ id: number; last_msg_at: number; uid: number; handle: string | null; hue: number | null; animal: string | null }>();
    reviewArea = section(`Comments on draft ${shown.num}`,
      threads?.length
        ? `<ul class="rows">${threads.map((t) =>
            `<li><a href="/review/${t.id}">Conversation with ${esc(t.handle || 'a reader')}</a><span class="muted">${timeAgo(t.last_msg_at)}</span></li>`
          ).join('')}</ul>`
        : empty(isLatest ? 'No comments on this draft yet.' : 'No comments were left on this draft.'));
  } else {
    const mine = await c.env.DB.prepare('SELECT id FROM reviews WHERE version_id = ? AND reviewer_id = ?')
      .bind(shown.id, user.id).first<{ id: number }>();
    if (mine) {
      reviewArea = section('Your comments on this draft', `<p><a href="/review/${mine.id}">Continue your conversation with the writer →</a></p>`);
    } else if (isLatest) {
      const assignment = await c.env.DB.prepare(
        "SELECT id FROM assignments WHERE work_id = ? AND reviewer_id = ? AND status = 'pending'"
      ).bind(w.id, user.id).first<{ id: number }>();
      const assignedNote = assignment
        ? `<p class="assigned-note">This piece was assigned to you. Read it, then leave the writer your thoughts. Only the two of you will see them.</p>`
        : '';
      const declineBtn = assignment
        ? confirmForm(`/assignments/${assignment.id}/decline`, 'Decline this assignment', 'Decline this assignment? It will be offered to another reader.')
        : '';
      reviewArea = section(assignment ? 'Assigned to you' : 'Leave a comment',
        `${assignedNote}
         <form method="post" action="/works/${w.pid}/review" class="stack">
           <textarea name="body" required minlength="3" maxlength="20000" rows="6"
             placeholder="Only the writer will see this comment."></textarea>
           <button type="submit">Send privately</button>
         </form>
         ${declineBtn}`);
    } else {
      reviewArea = `<p class="muted center">Comments go on the <a href="/work/${w.pid}">latest draft</a>.</p>`;
    }
  }

  return c.html(page(w.title, user, `<article class="work">${head}${contents}${bodyHtml}${authorTools}</article><div id="comments"></div>${reviewArea}`));
}

function refreshNote(q: string | undefined): string {
  if (q === 'same') return '<p class="muted">The doc hasn’t changed since this draft.</p>';
  if (q === 'new') return '<p class="muted">Saved a new draft.</p>';
  if (q === 'gone') return '<p class="warn">Could not read the doc. Its public link seems to be off.</p>';
  return '';
}

works.get('/work/:pid', (c) => {
  if (!getCookie(c, 'sid')) c.executionCtx.waitUntil(bumpViews(c.env, c.req.param('pid'), null));
  return servePublicCached(c, keyWork(c.req.param('pid'), 'latest'), async () => {
    const res = await renderWork(c, c.req.param('pid'), null);
    return res.status === 200 ? res.text() : null;
  });
});

works.get('/work/:pid/v/:num', (c) => {
  const num = Number(c.req.param('num'));
  if (!Number.isInteger(num) || num < 1) return c.notFound();
  if (!getCookie(c, 'sid')) c.executionCtx.waitUntil(bumpViews(c.env, c.req.param('pid'), num));
  return servePublicCached(c, keyWork(c.req.param('pid'), num), async () => {
    const res = await renderWork(c, c.req.param('pid'), num);
    return res.status === 200 ? res.text() : null;
  });
});

// ---- Start a review thread on the latest draft (assigned or organic) ----
works.post('/works/:pid/review', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const pid = c.req.param('pid');
  const form = await c.req.parseBody();
  const body = String(form.body || '').trim().slice(0, 20000);
  if (body.length < 3) return c.redirect(`/work/${pid}`);

  const w = await c.env.DB.prepare(
    `SELECT w.id, w.user_id, u.is_demo AS author_demo FROM works w
     JOIN users u ON u.id = w.user_id WHERE w.pid = ? AND w.status = 'active'`
  ).bind(pid).first<{ id: number; user_id: number; author_demo: number }>();
  if (!w || w.user_id === user.id) return c.notFound();
  if (w.author_demo) return c.redirect(`/work/${pid}`); // the example cast takes no mail
  const workId = w.id;
  const blocked = await c.env.DB.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)'
  ).bind(user.id, w.user_id).first();
  if (blocked) return c.text('forbidden', 403);

  const latest = await c.env.DB.prepare(
    'SELECT id FROM work_versions WHERE work_id = ? ORDER BY num DESC LIMIT 1'
  ).bind(workId).first<{ id: number }>();
  if (!latest) return c.notFound();
  const existing = await c.env.DB.prepare('SELECT id FROM reviews WHERE version_id = ? AND reviewer_id = ?')
    .bind(latest.id, user.id).first<{ id: number }>();
  if (existing) return c.redirect(`/review/${existing.id}`);

  const t = now();
  const assignment = await c.env.DB.prepare(
    "SELECT id FROM assignments WHERE work_id = ? AND reviewer_id = ? AND status = 'pending'"
  ).bind(workId, user.id).first<{ id: number }>();
  const source = assignment ? 'assigned' : 'organic';
  const r = await c.env.DB.prepare(
    'INSERT INTO reviews (work_id, version_id, reviewer_id, source, created_at, last_msg_at) VALUES (?,?,?,?,?,?)'
  ).bind(workId, latest.id, user.id, source, t, t).run();
  const reviewId = r.meta.last_row_id;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO review_msgs (review_id, author_id, body, created_at) VALUES (?,?,?,?)')
      .bind(reviewId, user.id, body, t),
    ...(assignment
      ? [c.env.DB.prepare("UPDATE assignments SET status = 'completed' WHERE id = ?").bind(assignment.id)]
      : []),
  ]);
  if (assignment) c.executionCtx.waitUntil(assignNextFor(c.env, user.id));
  return c.redirect(`/review/${reviewId}`);
});

works.post('/assignments/:id/decline', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  await c.env.DB.prepare(
    "UPDATE assignments SET status = 'declined' WHERE id = ? AND reviewer_id = ? AND status = 'pending'"
  ).bind(c.req.param('id'), user.id).run();
  c.executionCtx.waitUntil(assignNextFor(c.env, user.id));
  return c.redirect(`/u/${user.pid}`);
});
