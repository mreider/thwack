// CI gate: the assignment policy. Run with `node --test tools/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG, scoreWork, isPopular, pickWork } from '../worker/src/lib/pure/assign.mjs';

const NOW = 1_800_000_000;
const cand = (over = {}) => ({
  workId: 1, authorId: 10, addedAt: NOW - 86400,
  threads: 0, authorFollowers: 0, authorOrganic30: 0, authorReviews60: 0,
  ...over,
});

test('empty pool → nothing to assign', () => {
  assert.equal(pickWork([], NOW), null);
});

test('popular authors are screened out when humble work exists', () => {
  const popular = cand({ workId: 1, authorFollowers: CFG.popularFollowers });
  const humble = cand({ workId: 2 });
  assert.equal(pickWork([popular, humble], NOW).workId, 2);
});

test('organic attention also counts as popular', () => {
  const organic = cand({ workId: 1, authorOrganic30: CFG.popularOrganic30 });
  const humble = cand({ workId: 2, threads: 3 }); // even a well-reviewed humble work wins
  assert.equal(pickWork([organic, humble], NOW).workId, 2);
});

test('fallback: popular work IS assigned when nobody else needs reviewing', () => {
  const popular = cand({ workId: 1, authorFollowers: 50, authorOrganic30: 9 });
  assert.equal(pickWork([popular], NOW).workId, 1);
});

test('fewer existing threads → assigned first', () => {
  const reviewed = cand({ workId: 1, threads: 4 });
  const unreviewed = cand({ workId: 2, threads: 0 });
  assert.equal(pickWork([reviewed, unreviewed], NOW).workId, 2);
});

test('author with less overall attention is preferred', () => {
  const seen = cand({ workId: 1, authorFollowers: 4, authorReviews60: 6 });
  const unseen = cand({ workId: 2 });
  assert.equal(pickWork([seen, unseen], NOW).workId, 2);
});

test('older unreviewed work rises, but the age bonus caps', () => {
  const young = cand({ workId: 1, addedAt: NOW });
  const old = cand({ workId: 2, addedAt: NOW - 2 * 7 * 86400 });
  assert.equal(pickWork([young, old], NOW).workId, 2);
  const ancient = scoreWork(cand({ addedAt: NOW - 52 * 7 * 86400 }), NOW);
  const capped = scoreWork(cand({ addedAt: NOW - CFG.ageBonusCapWeeks * 7 * 86400 }), NOW);
  assert.equal(ancient, capped);
});

test('isPopular thresholds are exact', () => {
  assert.equal(isPopular(cand({ authorFollowers: CFG.popularFollowers - 1 })), false);
  assert.equal(isPopular(cand({ authorFollowers: CFG.popularFollowers })), true);
  assert.equal(isPopular(cand({ authorOrganic30: CFG.popularOrganic30 - 1 })), false);
  assert.equal(isPopular(cand({ authorOrganic30: CFG.popularOrganic30 })), true);
});
