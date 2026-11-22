// Page cache: rendered public HTML lives in KV, which Cloudflare serves from
// edge memory after first access. Anonymous visitors (the share-link
// audience) never touch D1; signed-in views are personalized and render
// live. Every mutation purges exactly the keys it affects — KV deletes
// propagate globally, unlike per-colo Cache API purges.
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, Vars } from '../env';

const TTL = 86400; // self-heal horizon if a purge is ever missed

export const keyUser = (pid: string) => `u:${pid}`;
export const keyWork = (workPid: string, ver: number | 'latest') => `w:${workPid}:${ver}`;

export async function servePublicCached(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  key: string,
  render: () => Promise<string | null>
): Promise<Response> {
  const anonymous = !getCookie(c, 'sid');
  if (anonymous) {
    const hit = await c.env.CACHE.get(key);
    if (hit !== null) return c.html(hit);
  }
  const html = await render();
  if (html === null) return c.notFound();
  if (anonymous) {
    c.executionCtx.waitUntil(c.env.CACHE.put(key, html, { expirationTtl: TTL }));
  }
  return c.html(html);
}

export async function purge(env: Env, keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => env.CACHE.delete(k)));
}

/** Purge a work's pages (every draft + latest) and its author's portfolio. */
export async function purgeWork(env: Env, workPid: string, authorPid: string): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT v.num FROM work_versions v JOIN works w ON w.id = v.work_id WHERE w.pid = ?'
  ).bind(workPid).all<{ num: number }>();
  const keys = [keyWork(workPid, 'latest'), keyUser(authorPid)];
  for (const r of results || []) keys.push(keyWork(workPid, r.num));
  await purge(env, keys);
}
