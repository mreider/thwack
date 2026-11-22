export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  CACHE: KVNamespace;
  // Secrets (set via wrangler secret / dashboard):
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PICKER_API_KEY?: string;
  GOOGLE_APP_ID?: string; // Google Cloud project number, for the Picker + drive.file pairing
  TOKEN_KEY?: string;     // 64 hex chars; AES-GCM key for refresh-token encryption at rest
  // Local development only (.dev.vars). Never set in production.
  DEV_FAKE_AUTH?: string;
};

export type User = {
  id: number;
  pid: string | null;    // public, random, non-sequential id used in URLs
  google_sub: string;
  email: string;
  name: string;          // real name from Google — never rendered anywhere
  handle: string | null; // assigned pen name, e.g. "Cobalt Otter"
  hue: number | null;
  animal: string | null;
  created_at: number;
  last_seen_at: number;
  is_demo: number;       // 1 for the seeded example cast (migration 0005)
};

export type Vars = { user: User | null };

export const now = () => Math.floor(Date.now() / 1000);

/** Random 12-char public id for URLs: ~62 bits, no sequence to walk. */
export function newPid(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => alphabet[b % 36]).join('');
}
