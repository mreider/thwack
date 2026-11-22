import { Hono, type Context } from 'hono';
import { now, type Env, type Vars } from '../env';

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
import { sameOrigin, ensureIdentity } from '../lib/session';
import { page, esc, section, empty, timeAgo, fmtDate, avatar, writerChip, confirmForm } from '../lib/html';
import { servePublicCached, purge, purgeWork, keyUser } from '../lib/cache';
import { identityFor } from '../lib/pure/identity.mjs';

export const social = new Hono<{ Bindings: Env; Variables: Vars }>();

type Person = { id: number; pid: string | null; handle: string | null; hue: number | null; animal: string | null };

const chipList = (rows: Person[] | undefined, none: string) =>
  rows?.length
    ? `<ul class="rows">${rows.map((u) => `<li>${writerChip(u)}</li>`).join('')}</ul>`
    : empty(none);

// ---- The portfolio: one page, public and private views of the same thing ----
social.get('/u/:pid', (c) =>
  servePublicCached(c, keyUser(c.req.param('pid')), () => renderPortfolio(c))
);

async function renderPortfolio(c: Ctx): Promise<string | null> {
  const viewer = c.get('user');
  let target = await c.env.DB.prepare(
    'SELECT id, pid, google_sub, email, name, handle, hue, animal, created_at, last_seen_at, is_demo FROM users WHERE pid = ?'
  ).bind(c.req.param('pid')).first<import('../env').User>();
  if (!target) return null;
  target = await ensureIdentity(c.env, target);
  const isSelf = !!viewer && viewer.id === target.id;

  const [worksQ, followersQ, followingQ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT w.pid, w.title, w.available,
              (SELECT MAX(num) FROM work_versions v WHERE v.work_id = w.id) AS draft,
              (SELECT MAX(created_at) FROM work_versions v WHERE v.work_id = w.id) AS draft_at,
              (SELECT SUM(views) FROM work_versions v WHERE v.work_id = w.id) AS reads
       FROM works w WHERE w.user_id = ? AND w.status = 'active' ORDER BY draft_at DESC`
    ).bind(target.id).all<{ pid: string; title: string; available: number; draft: number; draft_at: number; reads: number }>(),
    c.env.DB.prepare(
      'SELECT u.id, u.pid, u.handle, u.hue, u.animal FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY f.created_at DESC'
    ).bind(target.id).all<Person>(),
    c.env.DB.prepare(
      'SELECT u.id, u.pid, u.handle, u.hue, u.animal FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC'
    ).bind(target.id).all<Person>(),
  ]);

  // -- Head: avatar, pen name, follow/share control --
  let control = '';
  if (isSelf) {
    control = `<div class="head-actions">
      <button type="button" class="small" data-copy-link="/u/${target.pid}">Copy portfolio link</button>
      <form class="inline" method="post" action="/identity/reroll"
        data-confirm="Draw a new pen name and avatar? “${esc(target.handle || '')}” is released for someone else to draw.">
        <button type="submit" class="small">New pen name</button></form>
    </div>`;
  } else if (target.is_demo) {
    control = ''; // example pages are for looking around — nothing to press
  } else if (viewer) {
    const [following, blocked] = await Promise.all([
      c.env.DB.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?')
        .bind(viewer.id, target.id).first(),
      c.env.DB.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)')
        .bind(viewer.id, target.id).first(),
    ]);
    if (!blocked) {
      control = following
        ? `<form method="post" action="/unfollow/${target.pid}" data-confirm="Stop following ${esc(target.handle)}?">
             <button type="submit" class="small">Following ✓ — unfollow</button></form>`
        : `<form method="post" action="/follow/${target.pid}"><button type="submit" class="small">Follow</button></form>`;
    }
  } else {
    control = `<p class="muted"><a href="/auth/login?next=/u/${target.pid}">Sign in</a> to follow.</p>`;
  }

  // -- Works (the portfolio itself) --
  const workRow = (w: { pid: string; title: string; available: number; draft: number; draft_at: number; reads: number }) => `
    <li><a href="/work/${w.pid}"><cite>${esc(w.title)}</cite></a>${w.available ? '' : ' <span class="warn">⚠ doc off</span>'}
      <span class="row-actions"><span class="muted">Draft ${w.draft} · ${fmtDate(w.draft_at)}${isSelf ? ` · ${w.reads || 0} read${w.reads === 1 ? '' : 's'}` : ''}</span>${isSelf ? `
        <button type="button" class="small" data-copy-link="/work/${w.pid}">Copy link</button>
        <form class="inline" method="post" action="/works/${w.pid}/refresh"><button type="submit" class="small">Refresh</button></form>
        ${confirmForm(`/works/${w.pid}/remove`, 'Remove', `Remove “${w.title}”? The Google Doc itself is untouched.`)}` : ''}
      </span>
    </li>`;
  const worksHtml = worksQ.results?.length
    ? `<ul class="rows">${worksQ.results.map(workRow).join('')}</ul>`
    : empty(isSelf ? 'Add a Google Doc to publish your first piece.' : 'Nothing published yet.');
  const addWork = isSelf
    ? `<p class="section-action"><button id="add-work" type="button" class="small">Add work</button>
       <a class="muted guide-hint" href="/guide">How your doc becomes a page →</a></p>
       <p id="add-work-msg" class="gate-msg" hidden></p>`
    : '';

  // -- Private sections, only on your own page --
  let privateSections = '';
  if (isSelf) {
    const [assignmentQ, reviewsOnMineQ, reviewsGivenQ] = await Promise.all([
      c.env.DB.prepare(
        `SELECT a.id, a.expires_at, w.pid AS work_pid, w.title
         FROM assignments a JOIN works w ON w.id = a.work_id
         WHERE a.reviewer_id = ? AND a.status = 'pending'`
      ).bind(viewer!.id).first<{ id: number; expires_at: number; work_pid: string; title: string }>(),
      c.env.DB.prepare(
        `SELECT r.id, r.last_msg_at, w.title, v.num, u.handle
         FROM reviews r JOIN works w ON w.id = r.work_id
         JOIN work_versions v ON v.id = r.version_id
         JOIN users u ON u.id = r.reviewer_id
         WHERE w.user_id = ? AND w.status = 'active' ORDER BY r.last_msg_at DESC LIMIT 20`
      ).bind(viewer!.id).all<{ id: number; last_msg_at: number; title: string; num: number; handle: string | null }>(),
      c.env.DB.prepare(
        `SELECT r.id, r.last_msg_at, w.title, v.num
         FROM reviews r JOIN works w ON w.id = r.work_id
         JOIN work_versions v ON v.id = r.version_id
         WHERE r.reviewer_id = ? AND w.status = 'active' ORDER BY r.last_msg_at DESC LIMIT 20`
      ).bind(viewer!.id).all<{ id: number; last_msg_at: number; title: string; num: number }>(),
    ]);
    const a = assignmentQ;
    const toReview = a
      ? `<p><a href="/work/${a.work_pid}"><cite>${esc(a.title)}</cite></a></p>
         <p class="muted">Yours until ${fmtDate(a.expires_at)} — read it and leave the writer a comment.</p>
         ${confirmForm(`/assignments/${a.id}/decline`, 'Decline', 'Decline this assignment? It will be offered to another reader.')}`
      : empty('Nothing assigned. When a piece needs a reader, it lands here.');
    const reviewsOnMine = reviewsOnMineQ.results?.length
      ? `<ul class="rows">${reviewsOnMineQ.results.map((r: any) =>
          `<li><a href="/review/${r.id}">${esc(r.handle || 'A reader')} on <cite>${esc(r.title)}</cite> (draft ${r.num})</a><span class="muted">${timeAgo(r.last_msg_at)}</span></li>`).join('')}</ul>`
      : empty('None yet. Share a piece’s link to invite notes.');
    const reviewsGiven = reviewsGivenQ.results?.length
      ? `<ul class="rows">${reviewsGivenQ.results.map((r: any) =>
          `<li><a href="/review/${r.id}"><cite>${esc(r.title)}</cite> (draft ${r.num})</a><span class="muted">${timeAgo(r.last_msg_at)}</span></li>`).join('')}</ul>`
      : empty('None yet.');
    privateSections = `
      ${section('To read', toReview)}
      ${section('Comments on my work', reviewsOnMine)}
      ${section('Comments I’ve left', reviewsGiven)}`;
  }

  // Follower rows get a Block button on your own page.
  const followersHtml = isSelf && followersQ.results?.length
    ? `<ul class="rows">${followersQ.results.map((u: any) => `
        <li>${writerChip(u)}
          <span class="row-actions">${confirmForm(`/block/${u.pid}`, 'Block', `Block ${u.handle}? They will no longer follow you and can never follow you again. This cannot be undone.`, true)}</span>
        </li>`).join('')}</ul>`
    : chipList(followersQ.results, 'No one yet.');
  const followingHtml = isSelf && followingQ.results?.length
    ? `<ul class="rows">${followingQ.results.map((u: any) => `
        <li>${writerChip(u)}
          <span class="row-actions">${confirmForm(`/unfollow/${u.pid}`, 'Unfollow', `Stop following ${u.handle}?`)}</span>
        </li>`).join('')}</ul>`
    : chipList(followingQ.results, isSelf ? 'No one yet — follow writers from their pages.' : 'No one yet.');

  return page(target.handle || 'A writer', viewer, `
<header class="page-head portfolio-head">
  ${avatar(target.hue, target.animal, 'avatar-lg')}
  <div>
    <h1>${esc(target.handle || 'A writer')}</h1>
    <p class="muted">${isSelf ? 'Your page, as readers see it · ' : ''}writing here since ${fmtDate(target.created_at)}</p>
    ${target.is_demo ? '<p class="muted">An example page — the writing is public-domain, the writers are made up, but every link works like the real thing.</p>' : ''}
    ${control}
  </div>
</header>
<div class="columns">
  <div class="col-main">
    ${section('Work', worksHtml + addWork)}
    ${privateSections}
  </div>
  <div class="col-side">
    ${section('Followers', followersHtml)}
    ${section('Following', followingHtml)}
  </div>
</div>`);
}

// ---- Reroll: draw a fresh pen name + avatar, release the old one ----
async function purgeIdentityPages(env: Env, user: { id: number; pid: string | null }): Promise<void> {
  // The pen name appears on: own portfolio, every draft page of own works
  // (byline), and follower/following lists on related portfolios.
  const [worksQ, relQ] = await Promise.all([
    env.DB.prepare("SELECT pid FROM works WHERE user_id = ? AND status = 'active'").bind(user.id).all<{ pid: string }>(),
    env.DB.prepare(
      `SELECT u.pid FROM follows f JOIN users u ON u.id = f.follower_id OR u.id = f.followee_id
       WHERE f.follower_id = ?1 OR f.followee_id = ?1`
    ).bind(user.id).all<{ pid: string | null }>(),
  ]);
  await Promise.all((worksQ.results || []).map((w) => purgeWork(env, w.pid, user.pid!)));
  const pids = new Set<string>([user.pid!]);
  for (const r of relQ.results || []) if (r.pid) pids.add(r.pid);
  await purge(env, [...pids].map((p) => keyUser(p)));
}

social.post('/identity/reroll', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = identityFor(crypto.randomUUID());
    const clash = await c.env.DB.prepare('SELECT 1 FROM users WHERE handle = ?').bind(id.handle).first();
    if (clash) continue; // someone already writes under that name
    try {
      await c.env.DB.prepare('UPDATE users SET handle = ?, hue = ?, animal = ? WHERE id = ?')
        .bind(id.handle, id.hue, id.animal, user.id).run();
    } catch { continue; } // unique-index race: draw again
    c.executionCtx.waitUntil(purgeIdentityPages(c.env, user));
    break;
  }
  return c.redirect(`/u/${user.pid}`);
});

// ---- Follow / unfollow / block ----
async function userByPid(env: Env, pid: string): Promise<{ id: number; pid: string } | null> {
  return env.DB.prepare('SELECT id, pid FROM users WHERE pid = ?').bind(pid).first<{ id: number; pid: string }>();
}

social.post('/follow/:pid', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const target = await c.env.DB.prepare('SELECT id, pid, is_demo FROM users WHERE pid = ?')
    .bind(c.req.param('pid')).first<{ id: number; pid: string; is_demo: number }>();
  if (!target || target.id === user.id || target.is_demo) return c.redirect(`/u/${user.pid}`);
  const blocked = await c.env.DB.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)'
  ).bind(user.id, target.id).first();
  if (!blocked) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)')
      .bind(user.id, target.id, now()).run();
    c.executionCtx.waitUntil(purge(c.env, [keyUser(user.pid!), keyUser(target.pid)]));
  }
  return c.redirect(`/u/${target.pid}`);
});

social.post('/unfollow/:pid', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const target = await userByPid(c.env, c.req.param('pid'));
  if (!target) return c.redirect(`/u/${user.pid}`);
  await c.env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?')
    .bind(user.id, target.id).run();
  c.executionCtx.waitUntil(purge(c.env, [keyUser(user.pid!), keyUser(target.pid)]));
  return c.redirect(c.req.header('referer')?.endsWith(`/u/${target.pid}`) ? `/u/${target.pid}` : `/u/${user.pid}`);
});

// Irreversible: there is no unblock endpoint anywhere in the app.
social.post('/block/:pid', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const target = await userByPid(c.env, c.req.param('pid'));
  if (!target || target.id === user.id) return c.redirect(`/u/${user.pid}`);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?)')
      .bind(user.id, target.id, now()),
    c.env.DB.prepare('DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)')
      .bind(user.id, target.id),
  ]);
  c.executionCtx.waitUntil(purge(c.env, [keyUser(user.pid!), keyUser(target.pid)]));
  return c.redirect(`/u/${user.pid}`);
});
