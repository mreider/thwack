// The assignment algorithm, as pure functions over plain data so the CI gate
// (tools/assign_test.mjs) can exercise it without Cloudflare.
//
// Intent: route review attention toward neglected writers. Popular authors —
// those with followers or recent organic reviews — are screened out of
// assignment entirely, unless the screen would leave nothing to assign.

export const CFG = {
  popularFollowers: 5,   // author with >= this many followers is "popular"
  popularOrganic30: 2,   // ... or >= this many organic reviews in last 30 days
  expiryDays: 7,         // a pending assignment returns to the pool after this
  ageBonusCapWeeks: 3,   // old unreviewed work rises, up to this cap
  reviewerActiveDays: 30 // only assign to reviewers seen within this window
};

const WEEK = 7 * 86400;

/**
 * @typedef {Object} Candidate
 * @property {number} workId
 * @property {number} authorId
 * @property {number} addedAt          unix seconds
 * @property {number} threads          review threads already on this work
 * @property {number} authorFollowers
 * @property {number} authorOrganic30  organic reviews the author received, last 30d
 * @property {number} authorReviews60  all reviews the author received, last 60d
 */

export function scoreWork(c, now) {
  const ageWeeks = Math.min(Math.max(0, (now - c.addedAt) / WEEK), CFG.ageBonusCapWeeks);
  return (
    3 / (1 + c.threads) +
    2 / (1 + c.authorFollowers) +
    2 / (1 + c.authorReviews60) +
    ageWeeks
  );
}

export function isPopular(c) {
  return c.authorFollowers >= CFG.popularFollowers || c.authorOrganic30 >= CFG.popularOrganic30;
}

/**
 * Pick the work a reviewer should be assigned, from candidates that are
 * already filtered for hard constraints (not own work, no block either way,
 * not already reviewed by them, not pending with anyone, never previously
 * assigned to them). Returns null when there is nothing to assign.
 * @param {Candidate[]} cands
 * @param {number} now
 */
export function pickWork(cands, now) {
  if (!cands.length) return null;
  const humble = cands.filter((c) => !isPopular(c));
  const pool = humble.length ? humble : cands; // fallback: only when nobody else needs reviewing
  let best = pool[0];
  let bestScore = -Infinity;
  for (const c of pool) {
    const s = scoreWork(c, now);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return best;
}
