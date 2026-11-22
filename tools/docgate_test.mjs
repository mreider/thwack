// CI gate: the Google Doc sharing gate + export-HTML helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_DOC_MIME, checkDocGate, extractClassFormats, formatToStyle, safeHref, safeSrc,
} from '../worker/src/lib/pure/docgate.mjs';

const doc = (perms) => ({ mimeType: GOOGLE_DOC_MIME, permissions: perms });

test('public view-only doc passes', () => {
  assert.deepEqual(checkDocGate(doc([{ type: 'anyone', role: 'reader' }])), { ok: true });
});

test('anyoneWithLink reader also passes', () => {
  assert.equal(checkDocGate(doc([{ type: 'anyoneWithLink', role: 'reader' }])).ok, true);
});

test('not shared publicly → blocked with instructions', () => {
  const r = checkDocGate(doc([{ type: 'user', role: 'owner' }]));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_public');
  assert.match(r.reason, /Anyone with the link/);
});

test('publicly EDITABLE doc → blocked (protects the writer)', () => {
  const r = checkDocGate(doc([{ type: 'anyone', role: 'writer' }]));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'too_open');
  assert.match(r.reason, /edit/);
});

test('publicly COMMENTABLE doc → blocked (protects the writer)', () => {
  const r = checkDocGate(doc([{ type: 'anyone', role: 'commenter' }]));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'too_open');
  assert.match(r.reason, /comment/);
});

test('non-Doc files are refused', () => {
  const r = checkDocGate({ mimeType: 'application/pdf', permissions: [{ type: 'anyone', role: 'reader' }] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_doc');
});

test('missing permissions field → not public', () => {
  assert.equal(checkDocGate({ mimeType: GOOGLE_DOC_MIME }).code, 'not_public');
});

test('class formats are extracted from a Google-style <style> block', () => {
  const html = '<html><head><style type="text/css">.c0{font-weight:700}.c1{font-style:italic}.c2,.c3{text-decoration:underline}.c4{color:#000}</style></head><body></body></html>';
  const map = extractClassFormats(html);
  assert.deepEqual(map.c0, { b: true });
  assert.deepEqual(map.c1, { i: true });
  assert.deepEqual(map.c2, { u: true });
  assert.deepEqual(map.c3, { u: true });
  assert.equal(map.c4, undefined);
  assert.equal(formatToStyle({ b: true, i: true }), 'font-weight:bold;font-style:italic');
  assert.equal(formatToStyle(map.c4), '');
});

test('google redirect links are unwrapped; junk schemes dropped', () => {
  assert.equal(
    safeHref('https://www.google.com/url?q=https://example.com/story&sa=D'),
    'https://example.com/story'
  );
  assert.equal(safeHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('not a url'), null);
});

test('img src must be https', () => {
  assert.equal(safeSrc('https://lh7.googleusercontent.com/x'), 'https://lh7.googleusercontent.com/x');
  assert.equal(safeSrc('http://example.com/x.png'), null);
  assert.equal(safeSrc('data:text/html,hi'), null);
});
