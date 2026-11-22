import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { now, newPid, type Env, type User, type Vars } from '../env';
import { identityFor } from './pure/identity.mjs';
import { keyUser, purge } from './cache';

/** Assign a pen name + avatar (and public id) to any user row that predates them. */
export async function ensureIdentity(env: Env, user: User): Promise<User> {
  if (!user.pid) {
    const pid = newPid();
    await env.DB.prepare('UPDATE users SET pid = ? WHERE id = ? AND pid IS NULL').bind(pid, user.id).run();
    user = { ...user, pid };
  }
  if (user.handle) return user;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = identityFor(user.google_sub + (attempt ? ':' + attempt : ''));
    const clash = await env.DB.prepare('SELECT 1 FROM users WHERE handle = ?').bind(id.handle).first();
    if (clash) continue;
    try {
      await env.DB.prepare('UPDATE users SET handle = ?, hue = ?, animal = ? WHERE id = ? AND handle IS NULL')
        .bind(id.handle, id.hue, id.animal, user.id).run();
      await purge(env, [keyUser(user.pid!)]);
      return { ...user, handle: id.handle, hue: id.hue, animal: id.animal };
    } catch { /* unique race — retry with next attempt */ }
  }
  return user;
}

const SESSION_DAYS = 30;

function randomId(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export async function createSession(c: Ctx, userId: number) {
  const id = randomId();
  const exp = now() + SESSION_DAYS * 86400;
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)')
    .bind(id, userId, exp).run();
  setCookie(c, 'sid', id, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function loadUser(c: Ctx): Promise<User | null> {
  const sid = getCookie(c, 'sid');
  if (!sid) return null;
  const t = now();
  let row = await c.env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?'
  ).bind(sid, t).first<User>();
  if (!row) return null;
  row = await ensureIdentity(c.env, row);
  // Sliding activity marker (cheap, once an hour at most per user).
  if (t - row.last_seen_at > 3600) {
    await c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(t, row.id).run();
    row.last_seen_at = t;
  }
  return row;
}

export async function destroySession(c: Ctx) {
  const sid = getCookie(c, 'sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  deleteCookie(c, 'sid', { path: '/' });
}

/** Short-lived state cookie for OAuth CSRF protection. */
export function setStateCookie(c: Context, name: string): string {
  const v = randomId(16);
  setCookie(c, name, v, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  return v;
}
export function checkStateCookie(c: Context, name: string, got: string | undefined): boolean {
  const want = getCookie(c, name);
  deleteCookie(c, name, { path: '/' });
  return !!want && !!got && want === got;
}

/** Same-origin check for state-changing POSTs (sid cookie is SameSite=Lax too). */
export function sameOrigin(c: Context): boolean {
  const origin = c.req.header('origin');
  if (!origin) return true; // same-origin form posts may omit it; cookies are SameSite anyway
  return origin === new URL(c.req.url).origin;
}
