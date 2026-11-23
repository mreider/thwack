// Server-side HTML helpers: page shell, escaping, small components.
import type { User } from '../env';
import { emojiFor, avatarColor } from './pure/identity.mjs';

export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The assigned avatar: animal emoji in a pastel circle. */
export function avatar(hue: number | null, animal: string | null, cls = ''): string {
  return `<span class="avatar${cls ? ' ' + cls : ''}" style="background:${avatarColor(hue ?? 0)}" aria-hidden="true">${emojiFor(animal || '')}</span>`;
}

type Writer = { pid: string | null; handle: string | null; hue: number | null; animal: string | null };

/** Avatar + pen name, linking to the writer's portfolio. */
export function writerChip(w: Writer, cls = ''): string {
  return `<a class="chip${cls ? ' ' + cls : ''}" href="/u/${esc(w.pid || '')}">${avatar(w.hue, w.animal)}<span>${esc(w.handle || 'A writer')}</span></a>`;
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string)
  );
}

export function timeAgo(ts: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} d ago`;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Bare mode: no header, nav, or footer — a work page opened from a shared
 *  link should read as someone's writing, not as an app. */
export function page(title: string, user: User | null, body: string, opts: { bare?: boolean; noHeader?: boolean } = {}): string {
  if (opts.bare) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="/icon.png?v=5">
<link rel="apple-touch-icon" href="/icon.png?v=5">
<link href="https://fonts.googleapis.com/css?family=PT+Sans:400,400i,700,700i|Gabriela&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body class="bare">
<main>
${body}
</main>
<script src="/app.js" defer></script>
</body>
</html>`;
  }
  const nav = user
    ? `<nav>
         <a class="nav-icon" href="/u/${esc(user.pid || '')}" title="My page"><img src="/nav-home.png" alt="My page"></a>
         <form method="post" action="/auth/logout"><button class="nav-icon" type="submit" title="Sign out"><img src="/nav-exit.png?v=2" alt="Sign out"></button></form>
       </nav>`
    : `<nav><a href="/auth/login">Sign in</a></nav>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="/icon.png?v=5">
<link rel="apple-touch-icon" href="/icon.png?v=5">
<link href="https://fonts.googleapis.com/css?family=PT+Sans:400,400i,700,700i|Gabriela&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body${opts.noHeader ? ' class="home"' : ''}>
${opts.noHeader ? '' : `<header class="site">
  <a class="wordmark" href="/"><img src="/icon.png?v=5" alt="">Thwack</a>
  ${nav}
</header>`}
<main>
${body}
</main>
<footer class="site-foot">
  <a href="/guide">Guide</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="https://github.com/mreider/thwack/issues" rel="noopener" target="_blank">Report a problem</a> · <a href="https://buymeacoffee.com/mreider" rel="noopener" target="_blank">Buy me a coffee</a>
</footer>
<dialog id="confirm">
  <p id="confirm-msg"></p>
  <div class="dialog-actions">
    <button id="confirm-cancel" type="button">Cancel</button>
    <button id="confirm-ok" type="button" class="danger">Yes, I’m sure</button>
  </div>
</dialog>
<script src="/app.js" defer></script>
</body>
</html>`;
}

/** A one-button form whose submit asks for confirmation client-side.
 *  The server never offers an undo for blocks regardless. */
export function confirmForm(action: string, label: string, message: string, danger = false): string {
  return `<form method="post" action="${esc(action)}" data-confirm="${esc(message)}">
    <button type="submit" class="small${danger ? ' danger' : ''}">${esc(label)}</button>
  </form>`;
}

/** Breadcrumb-style back link shown at the top of a page. */
export function backlink(href: string, label: string): string {
  return `<p class="backlink"><a href="${esc(href)}">← ${esc(label)}</a></p>`;
}

export function section(heading: string, inner: string, extra = ''): string {
  return `<section class="panel">
  <div class="panel-head"><h2>${esc(heading)}</h2>${extra}</div>
  ${inner}
</section>`;
}

export function empty(text: string): string {
  return `<p class="empty">${esc(text)}</p>`;
}
