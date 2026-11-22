// DB-coupled half of the assignment algorithm: candidate queries + bookkeeping.
// The scoring/selection policy lives in pure/assign.mjs (unit-tested).
import { now, type Env } from '../env';
import { CFG, pickWork } from './pure/assign.mjs';

type Candidate = {
  workId: number; authorId: number; addedAt: number; threads: number;
  authorFollowers: number; authorOrganic30: number; authorReviews60: number;
};

const CANDIDATE_SQL = `
SELECT
  w.id AS workId, w.user_id AS authorId, w.added_at AS addedAt,
  (SELECT COUNT(*) FROM reviews rv WHERE rv.work_id = w.id) AS threads,
  (SELECT COUNT(*) FROM follows f WHERE f.followee_id = w.user_id) AS authorFollowers,
  (SELECT COUNT(*) FROM reviews rv JOIN works w2 ON rv.work_id = w2.id
     WHERE w2.user_id = w.user_id AND rv.source = 'organic' AND rv.created_at > ?1 - 2592000) AS authorOrganic30,
  (SELECT COUNT(*) FROM reviews rv JOIN works w2 ON rv.work_id = w2.id
     WHERE w2.user_id = w.user_id AND rv.created_at > ?1 - 5184000) AS authorReviews60
FROM works w
WHERE w.status = 'active' AND w.available = 1
  AND w.user_id != ?2
  AND (SELECT is_demo FROM users du WHERE du.id = w.user_id) = 0
  AND NOT EXISTS (SELECT 1 FROM blocks b
        WHERE (b.blocker_id = ?2 AND b.blocked_id = w.user_id)
           OR (b.blocker_id = w.user_id AND b.blocked_id = ?2))
  AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.work_id = w.id AND rv.reviewer_id = ?2)
  AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.work_id = w.id AND a.status = 'pending')
  AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.work_id = w.id AND a.reviewer_id = ?2)
`;

async function assignOne(env: Env, reviewerId: number, taken: Set<number>, t: number): Promise<boolean> {
  const { results } = await env.DB.prepare(CANDIDATE_SQL).bind(t, reviewerId).all<Candidate>();
  const cands = (results || []).filter((c) => !taken.has(c.workId));
  const picked = pickWork(cands, t);
  if (!picked) return false;
  await env.DB.prepare(
    'INSERT INTO assignments (reviewer_id, work_id, status, assigned_at, expires_at) VALUES (?,?,?,?,?)'
  ).bind(reviewerId, picked.workId, 'pending', t, t + CFG.expiryDays * 86400).run();
  taken.add(picked.workId);
  return true;
}

/** Hourly cron: expire stale assignments, then give every eligible reviewer a work. */
export async function runAssignments(env: Env): Promise<void> {
  const t = now();
  await env.DB.prepare("UPDATE assignments SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
    .bind(t).run();
  const { results } = await env.DB.prepare(
    `SELECT u.id FROM users u
     WHERE u.last_seen_at > ? AND u.is_demo = 0
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.reviewer_id = u.id AND a.status = 'pending')
     ORDER BY u.last_seen_at DESC`
  ).bind(t - CFG.reviewerActiveDays * 86400).all<{ id: number }>();
  const taken = new Set<number>();
  for (const r of results || []) await assignOne(env, r.id, taken, t);
}

/** Immediately hand one reviewer their next work (after complete/decline). */
export async function assignNextFor(env: Env, reviewerId: number): Promise<void> {
  const pending = await env.DB.prepare(
    "SELECT 1 FROM assignments WHERE reviewer_id = ? AND status = 'pending'"
  ).bind(reviewerId).first();
  if (pending) return;
  await assignOne(env, reviewerId, new Set(), now());
}
