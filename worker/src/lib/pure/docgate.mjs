// Pure logic for the Google Doc gate and for sanitizing exported HTML.
// Tested by tools/docgate_test.mjs without Cloudflare.

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

/**
 * Decide whether a Drive file may be added as a work.
 * The doc must be a Google Doc whose public ("anyone") link grants exactly
 * reader — commenter/writer links expose the writer and are refused.
 * @param {{mimeType?: string, permissions?: {type: string, role: string}[]}} meta
 * @returns {{ok: true} | {ok: false, code: 'not_doc'|'not_public'|'too_open', reason: string}}
 */
export function checkDocGate(meta) {
  if (meta.mimeType !== GOOGLE_DOC_MIME) {
    return { ok: false, code: 'not_doc', reason: 'That file is not a Google Doc. Only Google Docs can be added as works.' };
  }
  const anyone = (meta.permissions || []).find(
    (p) => p.type === 'anyone' || p.type === 'anyoneWithLink'
  );
  if (!anyone) {
    return {
      ok: false, code: 'not_public',
      reason: 'This doc is not shared publicly, so readers would not be able to open it. In Google Docs: Share → General access → “Anyone with the link” → Viewer. Then check again.'
    };
  }
  if (anyone.role !== 'reader') {
    return {
      ok: false, code: 'too_open',
      reason: 'This doc’s public link lets anyone ' + (anyone.role === 'writer' ? 'edit' : 'comment on') + ' it, which would expose your writing to changes. In Google Docs: Share → General access → “Anyone with the link” → set to Viewer (not Commenter or Editor). Then check again.'
    };
  }
  return { ok: true };
}

/**
 * Google Docs HTML export expresses bold/italic/underline via CSS classes in a
 * <style> block (e.g. .c3{font-style:italic}). Extract a class → format map so
 * the sanitizer can turn classed spans into inline formatting.
 * @param {string} html raw export html
 * @returns {Record<string, {b?: boolean, i?: boolean, u?: boolean}>}
 */
export function extractClassFormats(html) {
  const map = {};
  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  for (const block of styleBlocks) {
    const rules = block.matchAll(/((?:\.[A-Za-z0-9_-]+\s*,?\s*)+)\{([^}]*)\}/g);
    for (const m of rules) {
      const body = m[2];
      const fmt = {};
      if (/font-weight\s*:\s*(700|bold)/.test(body)) fmt.b = true;
      if (/font-style\s*:\s*italic/.test(body)) fmt.i = true;
      if (/text-decoration\s*:\s*underline/.test(body)) fmt.u = true;
      if (!fmt.b && !fmt.i && !fmt.u) continue;
      for (const sel of m[1].split(',')) {
        const cls = sel.trim().replace(/^\./, '');
        if (!cls) continue;
        map[cls] = Object.assign(map[cls] || {}, fmt);
      }
    }
  }
  return map;
}

/** Compose a safe inline style string from a format record (our own values only). */
export function formatToStyle(fmt) {
  if (!fmt) return '';
  const parts = [];
  if (fmt.b) parts.push('font-weight:bold');
  if (fmt.i) parts.push('font-style:italic');
  if (fmt.u) parts.push('text-decoration:underline');
  return parts.join(';');
}

/**
 * Google export wraps links as https://www.google.com/url?q=<real>&... —
 * unwrap them, and allow only http(s) targets.
 * @returns {string|null} safe href or null to drop the link
 */
export function safeHref(href) {
  if (!href) return null;
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.hostname === 'www.google.com' && url.pathname === '/url') {
    const q = url.searchParams.get('q');
    if (q) { try { url = new URL(q); } catch { return null; } }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href;
}

/** img src must be https (Google serves export images from googleusercontent). */
export function safeSrc(src) {
  if (!src) return null;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}
