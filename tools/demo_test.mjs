// Consistency checks for the demo cast (migrations/0005_demo.sql): every
// pid reference resolves, pen names use the real identity vocabulary, and
// the landing page's "see how it works" link points at a seeded user.
// The demo rows are seeded by migration in every environment, so these
// pages double as stable fixtures; this test keeps them internally sound.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADJECTIVES, ANIMALS, colorWord } from '../worker/src/lib/pure/identity.mjs';

const sql = readFileSync(new URL('../migrations/0005_demo.sql', import.meta.url), 'utf8')
  + readFileSync(new URL('../migrations/0006_demo_comments.sql', import.meta.url), 'utf8');
const indexTs = readFileSync(new URL('../worker/src/index.ts', import.meta.url), 'utf8');

// Inserted users: ('pid', 'google_sub', 'email', 'name', 'handle', hue, 'Animal', ...)
const userRows = [...sql.matchAll(
  /\('([a-z0-9]{12})',\s*'demo-[a-z]+',\s*'[^']+',\s*'[^']+',\s*'([^']+)',\s*(\d+),\s*'([A-Za-z]+)'/g
)].map((m) => ({ pid: m[1], handle: m[2], hue: Number(m[3]), animal: m[4] }));

// Inserted works: ('pid', (SELECT id FROM users WHERE pid='...'), ...)
const workRows = [...sql.matchAll(
  /\('([a-z0-9]{12})',\s*\(SELECT id FROM users WHERE pid='([a-z0-9]{12})'\),\s*'demo-doc-/g
)].map((m) => ({ pid: m[1], authorPid: m[2] }));

test('demo cast exists and is uniquely identified', () => {
  assert.equal(userRows.length, 3);
  assert.equal(workRows.length, 4);
  assert.equal(new Set(userRows.map((u) => u.pid)).size, 3);
  assert.equal(new Set(workRows.map((w) => w.pid)).size, 4);
});

test('every pid referenced anywhere in the demo SQL is seeded', () => {
  const seeded = new Set([...userRows.map((u) => u.pid), ...workRows.map((w) => w.pid)]);
  for (const [, pid] of sql.matchAll(/pid\s*=\s*'([a-z0-9]{12})'/g)) {
    assert.ok(seeded.has(pid), `referenced but never inserted: ${pid}`);
  }
  for (const w of workRows) assert.ok(seeded.has(w.authorPid), `work author missing: ${w.authorPid}`);
});

test('pen names use the real identity vocabulary', () => {
  const animalNames = new Set(ANIMALS.map(([name]) => name));
  for (const u of userRows) {
    const [adj, color, animal] = u.handle.split(' ');
    assert.ok(ADJECTIVES.includes(adj), `unknown adjective: ${adj}`);
    assert.equal(color, colorWord(u.hue), `${u.handle}: color word does not match hue ${u.hue}`);
    assert.ok(animalNames.has(animal), `unknown animal: ${animal}`);
    assert.equal(animal, u.animal, `${u.handle}: avatar animal column disagrees`);
  }
});

test('landing page links to a seeded demo portfolio', () => {
  const m = indexTs.match(/href="\/u\/([a-z0-9]{12})">See how it works/);
  assert.ok(m, 'landing demo link missing');
  assert.ok(userRows.some((u) => u.pid === m[1]), `landing links to unseeded pid ${m[1]}`);
});

test('demo review messages only quote seeded authors', () => {
  for (const [, pid] of sql.matchAll(/'([a-z0-9]{12})',\s*'[^']*(?:paragraph|sentence|draft|phrase|haze)[^']*'/gi) || []) {
    assert.ok(userRows.some((u) => u.pid === pid), `message author not seeded: ${pid}`);
  }
});
