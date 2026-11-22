import { Hono } from 'hono';
import { now, newPid, type Env, type Vars } from './env';
import { loadUser } from './lib/session';
import { runAssignments } from './lib/assigner';
import { page } from './lib/html';
import { auth } from './routes/auth';
import { works } from './routes/works';
import { reviews } from './routes/reviews';
import { social } from './routes/social';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('*', async (c, next) => {
  c.set('user', await loadUser(c));
  await next();
  if (c.res.headers.get('content-type')?.includes('text/html')) {
    c.res.headers.set('x-frame-options', 'DENY');
    c.res.headers.set('referrer-policy', 'same-origin');
  }
});

app.get('/', (c) => {
  const user = c.get('user');
  if (user) return c.redirect(`/u/${user.pid}`);
  return c.html(page('Thwack', null, `
<section class="landing">
  <img class="emblem" src="/icon.png?v=5" alt="">
  <h1>Thwack</h1>
  <p class="lede">Share writing anonymously.</p>
  <ol class="steps">
    <li><img class="step-icon" src="/step-add.png" alt=""><strong>Add a Google Doc</strong>
      <span>It appears here under a pen name — never yours.</span></li>
    <li><img class="step-icon" src="/step-send.png" alt=""><strong>Send the link</strong>
      <span>Anyone can read it. No account needed.</span></li>
    <li><img class="step-icon" src="/step-notes.png" alt=""><strong>Trade private comments</strong>
      <span>They stay between you two, pinned to each draft.</span></li>
  </ol>
  <p class="landing-cta"><a class="button" href="/auth/login">Sign in with Google</a></p>
  <p class="demo-link"><a href="/u/demowriter0q">Or see how it works →</a></p>
</section>`));
});

app.get('/privacy', (c) => c.html(page('Privacy', c.get('user'), `
<article class="legal">
  <h1>Privacy</h1>
  <p>Thwack is a small service for sharing writing and trading private comments. This page says what it keeps and why, in plain words.</p>
  <h2>What Thwack stores</h2>
  <p>When you sign in with Google, Thwack stores your Google account id, name, and email address — only to recognize you when you return. <strong>They are never shown to anyone.</strong> Publicly you exist only as an assigned pen name and avatar.</p>
  <p>Thwack also stores: the pen name and avatar it assigned you; rendered copies ("drafts") of the Google Docs you explicitly connect; the comments and replies you write; and who you follow or block.</p>
  <h2>Google Drive access</h2>
  <p>Thwack uses Google's narrowest Drive permission (<code>drive.file</code>): it can only see documents you personally pick in the file picker — it cannot browse your Drive. For a picked doc it checks the sharing setting and fetches the public export to display. You can revoke this at any time at <a href="https://myaccount.google.com/permissions" rel="noopener" target="_blank">myaccount.google.com/permissions</a>.</p>
  <h2>What's public and what's private</h2>
  <p>Your portfolio and the works on it are visible to anyone with the link. Comment conversations are private between the author and one reader. Your real name and email appear nowhere.</p>
  <h2>Cookies and tracking</h2>
  <p>One session cookie keeps you signed in. There are no ads, no analytics, no trackers, and nothing is sold or shared with anyone.</p>
  <h2>Caching</h2>
  <p>Public pages are cached on Cloudflare's edge so they load fast; caches are cleared when the underlying content changes.</p>
  <h2>Removing things</h2>
  <p>You can remove a work at any time — its stored drafts stop being served. To delete your account and everything with it, write to <strong>hello@thwack.app</strong>.</p>
  <p class="muted">This page may change as Thwack does; material changes will be visible here.</p>
  <p class="fineprint"><a href="/">Home</a> · <a href="/terms">Terms</a></p>
</article>`)));

app.get('/terms', (c) => c.html(page('Terms', c.get('user'), `
<article class="legal">
  <h1>Terms</h1>
  <p>Short version: be decent, share only what's yours to share, and don't unmask anyone.</p>
  <h2>Your writing stays yours</h2>
  <p>Connecting a Google Doc gives Thwack permission to store and display rendered copies of it to readers, which is the whole point of the service. All rights remain yours; remove a work whenever you like.</p>
  <h2>House rules</h2>
  <p>Only connect documents you have the right to share. No unlawful content, spam, or harassment — comments are for honest, civil feedback on the writing. Writers here go by pen names: do not attempt to reveal who is behind one. Blocks are permanent by design.</p>
  <p>Accounts or content that break these rules can be removed.</p>
  <h2>The service</h2>
  <p>Thwack is provided as-is, free, with no warranty of any kind. It may change, pause, or shut down — but your writing lives in your own Google Docs either way, which is the safest place for it. You must be at least 13 to use it.</p>
  <p class="fineprint"><a href="/">Home</a> · <a href="/privacy">Privacy</a></p>
</article>`)));

app.get('/guide', (c) => c.html(page('Guide', c.get('user'), `
<article class="legal">
  <h1>Guide</h1>
  <p>Thwack renders Google Docs. Writers write in Google Docs and readers read on Thwack. Headings, bold, italics, lists, quotes, and images carry over.</p>
  <h2>Sharing a doc</h2>
  <p>In Google Docs choose <strong>Share</strong>, then <strong>General access</strong>, then <strong>Anyone with the link</strong>, then <strong>Viewer</strong>. Links that allow commenting or editing are rejected. This keeps strangers out of the doc.</p>
  <h2>Titles</h2>
  <p>The document's file name in Google Drive becomes the title. A doc that starts with a single Heading&nbsp;1 is treated the same way - the heading is a title, not a chapter.</p>
  <h2>Chapters</h2>
  <p>Use real heading styles - <strong>Heading 1</strong>, <strong>2</strong>, or <strong>3</strong> - for chapters and sections. Bold text doesn't count. A piece with two or more headings gets a <strong>Contents</strong> list at the top, and each entry jumps to its section. <a href="/work/demoworkfou0">Two Cinquains</a> on the example portfolio shows one.</p>
  <p>Long pieces stay on one page. Readers scroll. A floating <strong>Comments</strong> button jumps to the comment box.</p>
  <h2>Drafts</h2>
  <p>Click <strong>Refresh</strong> on a work to pull in edits from the doc. If the text changed, Thwack stores it as the next numbered draft. Comments stay attached to the draft they were written on.</p>
  <h2>Pen names</h2>
  <p>Readers see a pen name, never a real name. The link to the Google Doc appears for its owner only, since a doc link reveals the Google account behind it.</p>
  <p class="fineprint"><a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
</article>`)));

// The portfolio IS the dashboard; keep the old URL working.
app.get('/dashboard', (c) => {
  const user = c.get('user');
  return user ? c.redirect(`/u/${user.pid}`) : c.redirect('/auth/login');
});

app.route('/auth', auth);
app.route('/', works);
app.route('/', reviews);
app.route('/', social);

// Local development only: seed a few fake users/works so the UI can be
// clicked through without Google. Guarded by DEV_FAKE_AUTH (.dev.vars).
app.get('/dev/seed', async (c) => {
  if (c.env.DEV_FAKE_AUTH !== '1') return c.notFound();
  const t = now();
  const mk = async (sub: string, name: string) => {
    await c.env.DB.prepare(
      `INSERT INTO users (pid, google_sub, email, name, created_at, last_seen_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(google_sub) DO NOTHING`
    ).bind(newPid(), sub, name.toLowerCase() + '@example.test', name, t, t).run();
    return (await c.env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first<{ id: number }>())!.id;
  };
  const bob = await mk('dev-bob', 'Bob');
  const carol = await mk('dev-carol', 'Carol');
  const addWork = async (uid: number, title: string, html: string) => {
    const docId = 'dev-' + title.replace(/\W/g, '');
    const dup = await c.env.DB.prepare('SELECT 1 FROM works WHERE doc_id = ?').bind(docId).first();
    if (dup) return;
    const r = await c.env.DB.prepare(
      `INSERT INTO works (pid, user_id, doc_id, title, status, available, added_at) VALUES (?,?,?,?,'active',1,?)`
    ).bind(newPid(), uid, docId, title, t).run();
    await c.env.DB.prepare(
      'INSERT INTO work_versions (work_id, num, snapshot_html, content_hash, created_at) VALUES (?,1,?,?,?)'
    ).bind(r.meta.last_row_id, html, 'dev-' + title, t).run();
  };
  await addWork(bob, 'The Harbor at Dusk', '<p>The boats came in slow, like old men returning from an argument they had lost.</p><p>Nobody met them at the dock.</p>');
  await addWork(carol, 'Letters I Never Sent', '<p>Dear M — <span style="font-style:italic">you were right about the winter.</span></p>');
  await runAssignments(c.env);
  return c.text('seeded: bob, carol (+works). Sign in via /auth/dev?u=alice');
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAssignments(env));
  },
};
