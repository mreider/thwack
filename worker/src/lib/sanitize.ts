// Sanitize Google Docs HTML export into quiet, safe markup for in-app reading.
// Uses the Workers-native HTMLRewriter; formatting that Google expresses via
// CSS classes (bold/italic/underline spans) is preserved by mapping classes to
// inline styles we compose ourselves.
import { extractClassFormats, formatToStyle, safeHref, safeSrc } from './pure/docgate.mjs';

const KEEP = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
  'br', 'hr', 'em', 'strong', 'i', 'b', 'u', 's', 'sub', 'sup',
]);
// Removed together with their contents.
const DROP_ALL = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'head', 'noscript', 'form', 'input', 'button', 'textarea', 'select', 'title', 'meta', 'link', 'base']);

function stripAttrs(el: Element, keep: string[] = []) {
  const names: string[] = [];
  for (const [name] of el.attributes) if (!keep.includes(name)) names.push(name);
  for (const n of names) el.removeAttribute(n);
}

export async function sanitizeExport(html: string): Promise<string> {
  const classFmt = extractClassFormats(html);
  const rewriter = new HTMLRewriter()
    .onDocument({ comments(c) { c.remove(); } })
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP_ALL.has(tag)) { el.remove(); return; }
        if (KEEP.has(tag)) { stripAttrs(el); return; }
        if (tag === 'a') {
          const href = safeHref(el.getAttribute('href'));
          if (!href) { el.removeAndKeepContent(); return; }
          stripAttrs(el);
          el.setAttribute('href', href);
          el.setAttribute('rel', 'noopener nofollow');
          el.setAttribute('target', '_blank');
          return;
        }
        if (tag === 'img') {
          const src = safeSrc(el.getAttribute('src'));
          if (!src) { el.remove(); return; }
          const alt = el.getAttribute('alt') || '';
          stripAttrs(el);
          el.setAttribute('src', src);
          el.setAttribute('alt', alt);
          el.setAttribute('loading', 'lazy');
          return;
        }
        if (tag === 'span') {
          const classes = (el.getAttribute('class') || '').split(/\s+/);
          const fmt: { b?: boolean; i?: boolean; u?: boolean } = {};
          for (const c of classes) Object.assign(fmt, classFmt[c] || {});
          const style = formatToStyle(fmt);
          if (!style) { el.removeAndKeepContent(); return; }
          stripAttrs(el);
          el.setAttribute('style', style);
          return;
        }
        // Everything else (div, table, font, html, body, ...): keep the text, lose the tag.
        el.removeAndKeepContent();
      },
    });
  const out = await rewriter
    .transform(new Response(html, { headers: { 'content-type': 'text/html' } }))
    .text();
  return out.replace(/^\s*<!doctype[^>]*>/i, '').trim();
}
