import { Hono } from 'hono';
import { now, type Env, type Vars } from '../env';
import { sameOrigin } from '../lib/session';
import { page, esc, timeAgo, backlink } from '../lib/html';

export const reviews = new Hono<{ Bindings: Env; Variables: Vars }>();

type ThreadRow = {
  id: number; work_id: number; work_pid: string; reviewer_id: number; work_user_id: number;
  title: string; num: number; reviewer_handle: string | null; writer_handle: string | null;
  reviewer_demo: number; writer_demo: number;
};

async function loadThread(env: Env, id: string | number): Promise<ThreadRow | null> {
  return env.DB.prepare(
    `SELECT r.id, r.work_id, w.pid AS work_pid, r.reviewer_id, w.user_id AS work_user_id, w.title, v.num,
            ru.handle AS reviewer_handle, wu.handle AS writer_handle,
            ru.is_demo AS reviewer_demo, wu.is_demo AS writer_demo
     FROM reviews r
     JOIN works w ON w.id = r.work_id
     JOIN work_versions v ON v.id = r.version_id
     JOIN users ru ON ru.id = r.reviewer_id
     JOIN users wu ON wu.id = w.user_id
     WHERE r.id = ?`
  ).bind(id).first<ThreadRow>();
}

// Private conversation: only the writer and the reviewer may see it.
// The one exception: threads between two demo accounts are world-readable
// (read-only) so the example pages can show what a review looks like.
reviews.get('/review/:id', async (c) => {
  const user = c.get('user');
  const t = await loadThread(c.env, c.req.param('id'));
  if (!t) return user ? c.notFound() : c.redirect('/auth/login');
  const isExample = !!t.reviewer_demo && !!t.writer_demo;
  const participant = !!user && (user.id === t.reviewer_id || user.id === t.work_user_id);
  if (!participant && !isExample) return user ? c.notFound() : c.redirect('/auth/login');

  const { results: msgs } = await c.env.DB.prepare(
    `SELECT m.body, m.created_at, m.author_id, u.handle FROM review_msgs m
     JOIN users u ON u.id = m.author_id WHERE m.review_id = ? ORDER BY m.created_at`
  ).bind(t.id).all<{ body: string; created_at: number; author_id: number; handle: string | null }>();

  const other = user && user.id === t.reviewer_id ? t.writer_handle : t.reviewer_handle;
  const draftUrl = `/work/${t.work_pid}/v/${t.num}`;
  const privacyLine = participant
    ? 'No one else can see it.'
    : 'Normally no one else could read this conversation. It is open because it is an example.';
  const replyForm = participant
    ? `<form method="post" action="/review/${t.id}/reply" class="stack">
    <textarea name="body" required minlength="1" maxlength="20000" rows="4"
      placeholder="Reply to ${esc(other || 'them')}…"></textarea>
    <button type="submit">Reply</button>
  </form>`
    : '';
  return c.html(page(`Comments · ${t.title}`, user, `
<article class="thread">
  <header class="work-head">
    ${backlink(draftUrl, `Back to “${t.title}”, draft ${t.num}`)}
    <h1>Comments on <a href="${draftUrl}"><cite>${esc(t.title)}</cite></a></h1>
    <p class="muted">On <a href="${draftUrl}">draft ${t.num}</a> · a private conversation between
      ${esc(t.writer_handle || 'the writer')} (author) and ${esc(t.reviewer_handle || 'a reader')} (reader).
      ${privacyLine}</p>
  </header>
  <ol class="messages">
    ${(msgs || []).map((m) => `
    <li class="${user && m.author_id === user.id ? 'mine' : 'theirs'}">
      <p class="msg-meta">${esc(m.handle || '—')}${m.author_id === t.work_user_id ? ' (author)' : ''} · ${timeAgo(m.created_at)}</p>
      <p class="msg-body">${esc(m.body)}</p>
    </li>`).join('')}
  </ol>
  ${replyForm}
</article>`));
});

reviews.post('/review/:id/reply', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  const t = await loadThread(c.env, c.req.param('id'));
  if (!t || (user.id !== t.reviewer_id && user.id !== t.work_user_id)) return c.notFound();
  const form = await c.req.parseBody();
  const body = String(form.body || '').trim().slice(0, 20000);
  if (!body) return c.redirect(`/review/${t.id}`);
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO review_msgs (review_id, author_id, body, created_at) VALUES (?,?,?,?)')
      .bind(t.id, user.id, body, ts),
    c.env.DB.prepare('UPDATE reviews SET last_msg_at = ? WHERE id = ?').bind(ts, t.id),
  ]);
  return c.redirect(`/review/${t.id}`);
});
