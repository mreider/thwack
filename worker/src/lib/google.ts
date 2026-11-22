// Google OAuth (OIDC login + incremental drive.file consent), Drive metadata,
// refresh-token encryption at rest, and public-doc export fetching.
import { now, type Env } from '../env';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function authUrl(env: Env, origin: string, state: string, opts: { drive?: boolean } = {}): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: origin + (opts.drive ? '/auth/drive/callback' : '/auth/callback'),
    response_type: 'code',
    state,
  });
  if (opts.drive) {
    // Fallback/re-consent path: forces a fresh grant so we get a refresh token.
    p.set('scope', DRIVE_SCOPE);
    p.set('access_type', 'offline');
    p.set('prompt', 'consent');
    p.set('include_granted_scopes', 'true');
  } else {
    // Single bundled consent at login: identity + drive.file together.
    p.set('scope', 'openid email profile ' + DRIVE_SCOPE);
    p.set('access_type', 'offline');
    p.set('include_granted_scopes', 'true');
    p.set('prompt', 'select_account');
  }
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(env: Env, origin: string, code: string, drive: boolean) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: origin + (drive ? '/auth/drive/callback' : '/auth/callback'),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('token exchange failed: ' + res.status);
  return res.json<{ access_token: string; refresh_token?: string; id_token?: string; scope?: string }>();
}

/** The id_token arrives directly from Google's token endpoint over TLS, so we
 * decode its payload without re-verifying the signature. */
export function parseIdToken(idToken: string): { sub: string; email: string; name: string } {
  const payload = idToken.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const d = JSON.parse(json);
  return { sub: d.sub, email: d.email || '', name: d.name || d.email || 'Writer' };
}

// --- refresh-token encryption at rest (AES-256-GCM, key = TOKEN_KEY secret) ---

async function aesKey(env: Env): Promise<CryptoKey> {
  const hex = env.TOKEN_KEY!;
  const raw = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain));
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv); buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

export async function decryptToken(env: Env, b64: string): Promise<string> {
  const buf = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.slice(0, 12) }, await aesKey(env), buf.slice(12)
  );
  return new TextDecoder().decode(pt);
}

export async function storeRefreshToken(env: Env, userId: number, refreshToken: string, scopes: string) {
  const enc = await encryptToken(env, refreshToken);
  await env.DB.prepare(
    `INSERT INTO google_tokens (user_id, refresh_token_enc, scopes, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc=excluded.refresh_token_enc,
       scopes=excluded.scopes, updated_at=excluded.updated_at`
  ).bind(userId, enc, scopes, now()).run();
}

/** Mint a fresh access token from the stored refresh token; null if no grant. */
export async function accessTokenFor(env: Env, userId: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT refresh_token_enc FROM google_tokens WHERE user_id = ?')
    .bind(userId).first<{ refresh_token_enc: string }>();
  if (!row) return null;
  const refresh = await decryptToken(env, row.refresh_token_enc);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      // Grant revoked — drop it so the UI re-asks for consent.
      await env.DB.prepare('DELETE FROM google_tokens WHERE user_id = ?').bind(userId).run();
    }
    return null;
  }
  const d = await res.json<{ access_token: string }>();
  return d.access_token;
}

export type DriveMeta = { id: string; name: string; mimeType: string; permissions?: { type: string; role: string }[] };

export async function fileMeta(accessToken: string, fileId: string): Promise<DriveMeta | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,permissions(type,role)`,
    { headers: { authorization: 'Bearer ' + accessToken } }
  );
  if (!res.ok) return null;
  return res.json<DriveMeta>();
}

// Raw export cap — Google's HTML is 3-6x the sanitized size, so this admits
// novel-length docs; the binding store cap is enforced on the sanitized form.
export const MAX_EXPORT_BYTES = 6_000_000;
// Largest sanitized snapshot we store (D1 bound-parameter headroom; ~novel).
export const MAX_SNAPSHOT_CHARS = 900_000;

/** Fetch the public HTML export of a doc (no auth — this is also the proof
 * that the doc is still publicly readable). */
export async function fetchExportHtml(docId: string): Promise<{ ok: true; html: string; tooLarge: boolean } | { ok: false }> {
  const res = await fetch(
    `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=html`,
    { redirect: 'follow' }
  );
  if (!res.ok) return { ok: false };
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/html')) return { ok: false }; // login page redirect etc.
  const html = await res.text();
  // A private doc redirects to accounts.google.com (also text/html) — detect it.
  if (res.url.includes('accounts.google.com')) return { ok: false };
  return { ok: true, html, tooLarge: html.length > MAX_EXPORT_BYTES };
}
