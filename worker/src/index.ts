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
  <p class="lede">Share your writing anonymously</p>
  <ol class="steps">
    <li><img class="step-icon" src="/step-add.png" alt=""><strong>Add a Google Doc</strong>
      <span>It shows up here under a pen name.</span></li>
    <li><img class="step-icon" src="/step-send.png" alt=""><strong>Send the link</strong>
      <span>Anyone with the link can read it, no account needed.</span></li>
    <li><img class="step-icon" src="/step-notes.png" alt=""><strong>Trade private comments</strong>
      <span>They stay between you two, pinned to each draft.</span></li>
  </ol>
  <p class="landing-cta"><a class="button" href="/auth/login">Sign in with Google</a></p>
  <p class="demo-link"><a href="/u/demowriter0q">See how it works</a> · <a href="/guide">Read the guide</a></p>
</section>`, { noHeader: true }));
});

app.get('/privacy', (c) => c.html(page('Privacy', c.get('user'), `
<article class="legal">
  <h1>Privacy</h1>
  <p>This page explains what Thwack stores about you and why. The short answer is as little as possible.</p>
  <h2>Account data</h2>
  <p>When you sign in with Google, Thwack keeps your Google account id, name, and email address so it can recognize you when you come back. Nobody else ever sees them. On the site you appear as an assigned pen name and avatar.</p>
  <p>Thwack also stores that pen name and avatar, the rendered drafts of any docs you connect, the comments you write, and your follow and block lists.</p>
  <h2>Google Drive access</h2>
  <p>Thwack asks Google for the narrowest Drive permission, called <code>drive.file</code>. The permission only covers documents you pick in the file picker, so Thwack can't browse your Drive. For a picked doc it checks the sharing setting and fetches the public export. You can revoke the permission at any time at <a href="https://myaccount.google.com/permissions" rel="noopener" target="_blank">myaccount.google.com/permissions</a>.</p>
  <h2>Public and private</h2>
  <p>Portfolios and works are public, so anyone with the link can read them. Comment conversations are private between the author and one reader, and real names and email addresses don't appear anywhere.</p>
  <h2>Cookies</h2>
  <p>Thwack sets one cookie, which keeps you signed in. There are no ads, no analytics, and no trackers, and nothing is sold or shared with anyone.</p>
  <h2>Caching</h2>
  <p>Public pages are cached on Cloudflare's edge, and the cache is cleared whenever the underlying content changes.</p>
  <h2>Removing things</h2>
  <p>You can remove a work at any time, which stops its stored drafts from being served. To delete your account and everything with it, write to <strong>hello@thwack.app</strong>.</p>
  <p class="muted">Any meaningful change to this policy will appear on this page.</p>
  <p class="fineprint"><a href="/">Home</a> · <a href="/terms">Terms</a></p>
</article>`)));

app.get('/terms', (c) => c.html(page('Terms', c.get('user'), `
<article class="legal">
  <h1>Terms</h1>
  <p>These are the rules for using Thwack. They come down to three things: be decent, share only what you have the right to share, and don't unmask anyone.</p>
  <h2>Your writing</h2>
  <p>Connecting a doc gives Thwack permission to store rendered copies of it and show them to readers. All rights to the writing stay with you, and you can remove a work at any time.</p>
  <h2>Rules</h2>
  <p>Only connect documents you have the right to share. Don't post unlawful content, spam, or harassment. Comments are for honest, civil feedback on the writing. Writers go by pen names, so don't try to reveal who is behind one. Blocks are permanent.</p>
  <p>Accounts or content that break these rules can be removed.</p>
  <h2>The service</h2>
  <p>Thwack is free and provided as-is, with no warranty. It may change or shut down someday, and if it does your writing is safe in your own Google Docs. You must be at least 13 to use it.</p>
  <p class="fineprint"><a href="/">Home</a> · <a href="/privacy">Privacy</a></p>
</article>`)));

app.get('/guide', (c) => c.html(page('Guide', c.get('user'), `
<article class="legal">
  <h1>Guide</h1>
  <p>This page explains how to connect a Google Doc to Thwack and how to format it so the published page looks right.</p>
  <p>Thwack has no editor of its own. You write in Google Docs, connect the doc, and Thwack publishes a copy of it on your portfolio. Headings, bold, italics, lists, quotes, and images all come through.</p>
  <h2>Sharing a doc</h2>
  <p>A doc has to be viewable before Thwack can publish it. In Google Docs choose <strong>Share</strong>, then <strong>General access</strong>, then <strong>Anyone with the link</strong>, then <strong>Viewer</strong>. Thwack rejects links that allow commenting or editing, so strangers can't get into the doc itself.</p>
  <h2>Titles</h2>
  <p>The doc's file name in Google Drive becomes the title. If the doc starts with a single Heading&nbsp;1, that works as a title too, and it won't show up in the table of contents.</p>
  <h2>Chapters</h2>
  <p>Use real heading styles (<strong>Heading 1</strong>, <strong>2</strong>, or <strong>3</strong>) for chapters and sections; bolding a line doesn't count. With two or more headings, the page gets a <strong>Contents</strong> list at the top, with each entry linked to its section. <a href="/work/demoworkfou0">Two Cinquains</a> on the example portfolio shows one.</p>
  <p>Long pieces stay on one page, and a floating <strong>Comments</strong> button takes readers to the comment box at the bottom.</p>
  <h2>Drafts</h2>
  <p>Edits in Google Docs don't show up on Thwack right away. Click <strong>Refresh</strong> on the work and, if the text changed, Thwack saves it as the next numbered draft. Comments stay attached to the draft they were written on, so you can revise without losing the conversation.</p>
  <h2>Pen names</h2>
  <p>Readers only ever see your pen name. The link to your Google Doc is hidden from everyone but you, since a doc link points back to the Google account that owns it.</p>
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
