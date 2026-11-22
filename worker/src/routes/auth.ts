import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { now, newPid, type Env, type Vars } from '../env';
import { authUrl, exchangeCode, parseIdToken, storeRefreshToken, DRIVE_SCOPE } from '../lib/google';
import { createSession, destroySession, setStateCookie, checkStateCookie, sameOrigin } from '../lib/session';

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

function origin(url: string) { return new URL(url).origin; }

auth.get('/login', (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.html('<p>Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.</p>', 503);
  }
  // Where to land after sign-in (e.g. back on the work page a reader came
  // from). Local paths only.
  const next = c.req.query('next') || '';
  if (/^\/[\w\-/]*$/.test(next)) {
    setCookie(c, 'login_next', next, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  }
  const state = setStateCookie(c, 'oauth_state');
  return c.redirect(authUrl(c.env, origin(c.req.url), state));
});

auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code || !checkStateCookie(c, 'oauth_state', c.req.query('state'))) {
    return c.redirect('/?login=failed');
  }
  const tok = await exchangeCode(c.env, origin(c.req.url), code, false);
  const info = parseIdToken(tok.id_token!);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO users (pid, google_sub, email, name, created_at, last_seen_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email, last_seen_at=excluded.last_seen_at`
  ).bind(newPid(), info.sub, info.email, info.name, t, t).run();
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE google_sub = ?')
    .bind(info.sub).first<{ id: number }>();
  await createSession(c, user!.id);
  // Bundled consent: Google returns a refresh token on the first grant.
  if (tok.refresh_token && c.env.TOKEN_KEY) {
    await storeRefreshToken(c.env, user!.id, tok.refresh_token, tok.scope || DRIVE_SCOPE);
  }
  const next = getCookie(c, 'login_next');
  deleteCookie(c, 'login_next', { path: '/' });
  return c.redirect(next && /^\/[\w\-/]*$/.test(next) ? next : '/dashboard');
});

// Incremental consent for drive.file, triggered from "Add work".
auth.get('/drive', (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  const state = setStateCookie(c, 'drive_state');
  return c.redirect(authUrl(c.env, origin(c.req.url), state, { drive: true }));
});

auth.get('/drive/callback', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login');
  const code = c.req.query('code');
  if (!code || !checkStateCookie(c, 'drive_state', c.req.query('state'))) {
    return c.redirect('/dashboard?drive=failed');
  }
  const tok = await exchangeCode(c.env, origin(c.req.url), code, true);
  if (tok.refresh_token) {
    await storeRefreshToken(c.env, user.id, tok.refresh_token, tok.scope || DRIVE_SCOPE);
  }
  return c.redirect('/dashboard?picker=1');
});

auth.post('/logout', async (c) => {
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  await destroySession(c);
  return c.redirect('/');
});

// Local development only: fake sign-in so the app can be clicked through
// without Google credentials. Guarded by DEV_FAKE_AUTH, set in .dev.vars.
auth.get('/dev', async (c) => {
  if (c.env.DEV_FAKE_AUTH !== '1') return c.notFound();
  const u = (c.req.query('u') || 'alice').replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'alice';
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO users (pid, google_sub, email, name, created_at, last_seen_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(google_sub) DO UPDATE SET last_seen_at=excluded.last_seen_at`
  ).bind(newPid(), 'dev-' + u, u + '@example.test', u[0].toUpperCase() + u.slice(1), t, t).run();
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE google_sub = ?')
    .bind('dev-' + u).first<{ id: number }>();
  await createSession(c, user!.id);
  return c.redirect('/dashboard');
});
