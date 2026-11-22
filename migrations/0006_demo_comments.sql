-- Fuller comment coverage for the example cast: every demo draft carries at
-- least one conversation, busier drafts carry two, and the authors answer.
-- Same conventions as 0005: idempotent inserts, original comment text.

INSERT OR IGNORE INTO reviews (work_id, version_id, reviewer_id, source, created_at, last_msg_at) VALUES
  -- The Land of Little Rain, draft 1: second reader
  ((SELECT id FROM works WHERE pid='demoworkone0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkone0')),
   (SELECT id FROM users WHERE pid='demopoet000q'), 'organic', 1793200000, 1793260000),
  -- The Land of Little Rain, draft 2: second reader
  ((SELECT id FROM works WHERE pid='demoworkone0'),
   (SELECT id FROM work_versions WHERE num=2 AND work_id=(SELECT id FROM works WHERE pid='demoworkone0')),
   (SELECT id FROM users WHERE pid='demoreader0q'), 'organic', 1794400000, 1794520000),
  -- The Wind Blows: two readers
  ((SELECT id FROM works WHERE pid='demoworktwo0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworktwo0')),
   (SELECT id FROM users WHERE pid='demoreader0q'), 'organic', 1793300000, 1793360000),
  ((SELECT id FROM works WHERE pid='demoworktwo0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworktwo0')),
   (SELECT id FROM users WHERE pid='demopoet000q'), 'organic', 1793400000, 1793470000);

-- From the Notebooks (by the reader) and Two Cinquains (by the poet): two readers each
INSERT OR IGNORE INTO reviews (work_id, version_id, reviewer_id, source, created_at, last_msg_at) VALUES
  ((SELECT id FROM works WHERE pid='demoworkthr0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkthr0')),
   (SELECT id FROM users WHERE pid='demowriter0q'), 'organic', 1793500000, 1793560000),
  ((SELECT id FROM works WHERE pid='demoworkthr0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkthr0')),
   (SELECT id FROM users WHERE pid='demopoet000q'), 'organic', 1793600000, 1793650000),
  ((SELECT id FROM works WHERE pid='demoworkfou0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkfou0')),
   (SELECT id FROM users WHERE pid='demowriter0q'), 'organic', 1793700000, 1793760000),
  ((SELECT id FROM works WHERE pid='demoworkfou0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkfou0')),
   (SELECT id FROM users WHERE pid='demoreader0q'), 'organic', 1793800000, 1793860000);

INSERT INTO review_msgs (review_id, author_id, body, created_at)
SELECT r.id, u.id, m.body, m.ts FROM (
  SELECT 'demoworkone0' AS work_pid, 1 AS draft, 'demopoet000q' AS reviewer_pid, 'demopoet000q' AS author_pid, 'There''s a tempo problem in the middle — three sentences in a row carry the same shape, subject then verb then qualifier. Read it aloud and you''ll hear the drumbeat. Break one of them.' AS body, 1793200000 AS ts
  UNION ALL SELECT 'demoworkone0', 1, 'demopoet000q', 'demowriter0q', 'Heard it the moment you said it. I''ll vary the second sentence when I next pass through.', 1793260000
  UNION ALL SELECT 'demoworkone0', 2, 'demoreader0q', 'demoreader0q', 'You did cut the map sentence — and the first paragraph does stand alone. The piece breathes now. My only note on this draft: “intolerable sun glare” might be one adjective too proud of itself.', 1794400000
  UNION ALL SELECT 'demoworkone0', 2, 'demoreader0q', 'demowriter0q', 'I wondered about that too. I''m leaving it one more draft; if it still sticks out, it goes.', 1794460000
  UNION ALL SELECT 'demoworkone0', 2, 'demoreader0q', 'demoreader0q', 'Fair. It''s earned a stay of execution.', 1794520000
) m
JOIN reviews r ON r.reviewer_id = (SELECT id FROM users WHERE pid = m.reviewer_pid)
  AND r.version_id = (SELECT id FROM work_versions WHERE num = m.draft AND work_id = (SELECT id FROM works WHERE pid = m.work_pid))
JOIN users u ON u.pid = m.author_pid
WHERE NOT EXISTS (SELECT 1 FROM review_msgs x WHERE x.review_id = r.id AND x.created_at = m.ts);

INSERT INTO review_msgs (review_id, author_id, body, created_at)
SELECT r.id, u.id, m.body, m.ts FROM (
  SELECT 'demoworktwo0' AS work_pid, 1 AS draft, 'demoreader0q' AS reviewer_pid, 'demoreader0q' AS author_pid, 'The repetition of “something dreadful has happened / nothing has happened” is doing real work — panic, then the embarrassment after panic. Don''t let anyone talk you out of it.' AS body, 1793300000 AS ts
  UNION ALL SELECT 'demoworktwo0', 1, 'demoreader0q', 'demowriter0q', 'That''s the line I''d defend to the death, so thank you.', 1793360000
  UNION ALL SELECT 'demoworktwo0', 1, 'demopoet000q', 'demopoet000q', 'The newspaper “like a lost kite” is the image I''ll remember. The last sentence tells me it''s ugly after the paragraph already showed me ugly — consider ending on the pine tree.', 1793400000
  UNION ALL SELECT 'demoworktwo0', 1, 'demopoet000q', 'demowriter0q', 'Ending on the tree is tempting. Let me live with it a few days.', 1793470000
) m
JOIN reviews r ON r.reviewer_id = (SELECT id FROM users WHERE pid = m.reviewer_pid)
  AND r.version_id = (SELECT id FROM work_versions WHERE num = m.draft AND work_id = (SELECT id FROM works WHERE pid = m.work_pid))
JOIN users u ON u.pid = m.author_pid
WHERE NOT EXISTS (SELECT 1 FROM review_msgs x WHERE x.review_id = r.id AND x.created_at = m.ts);

INSERT INTO review_msgs (review_id, author_id, body, created_at)
SELECT r.id, u.id, m.body, m.ts FROM (
  SELECT 'demoworkthr0' AS work_pid, 1 AS draft, 'demowriter0q' AS reviewer_pid, 'demowriter0q' AS author_pid, 'Aphorisms are brutal to sequence — each one resets the reader. These two sit well together because the second deflates the first. I''d keep the set short like this.' AS body, 1793500000 AS ts
  UNION ALL SELECT 'demoworkthr0', 1, 'demowriter0q', 'demoreader0q', 'Short is the plan. A third one kept creeping in and cheapening the other two, so it''s gone.', 1793560000
  UNION ALL SELECT 'demoworkthr0', 1, 'demopoet000q', 'demopoet000q', 'The violin line walks the edge of too-clever and stays standing. No notes — just glad I read it.', 1793600000
  UNION ALL SELECT 'demoworkthr0', 1, 'demopoet000q', 'demoreader0q', 'That''s the nicest kind of comment. Thank you for reading.', 1793650000
) m
JOIN reviews r ON r.reviewer_id = (SELECT id FROM users WHERE pid = m.reviewer_pid)
  AND r.version_id = (SELECT id FROM work_versions WHERE num = m.draft AND work_id = (SELECT id FROM works WHERE pid = m.work_pid))
JOIN users u ON u.pid = m.author_pid
WHERE NOT EXISTS (SELECT 1 FROM review_msgs x WHERE x.review_id = r.id AND x.created_at = m.ts);

INSERT INTO review_msgs (review_id, author_id, body, created_at)
SELECT r.id, u.id, m.body, m.ts FROM (
  SELECT 'demoworkfou0' AS work_pid, 1 AS draft, 'demowriter0q' AS reviewer_pid, 'demowriter0q' AS author_pid, '“Frost-crisp''d” earns its apostrophe — the sound is the leaves. In Triad, the ellipses carry the silence; I''d trust them and cut nothing.' AS body, 1793700000 AS ts
  UNION ALL SELECT 'demoworkfou0', 1, 'demowriter0q', 'demopoet000q', 'The apostrophe survives another round, then.', 1793760000
  UNION ALL SELECT 'demoworkfou0', 1, 'demoreader0q', 'demoreader0q', 'Triad lands harder than November Night — the third silent thing turns the poem cold in the best way. If you ever order these for a page, put Triad second.', 1793800000
  UNION ALL SELECT 'demoworkfou0', 1, 'demoreader0q', 'demopoet000q', 'Agreed on the order; that''s how they sit here.', 1793860000
) m
JOIN reviews r ON r.reviewer_id = (SELECT id FROM users WHERE pid = m.reviewer_pid)
  AND r.version_id = (SELECT id FROM work_versions WHERE num = m.draft AND work_id = (SELECT id FROM works WHERE pid = m.work_pid))
JOIN users u ON u.pid = m.author_pid
WHERE NOT EXISTS (SELECT 1 FROM review_msgs x WHERE x.review_id = r.id AND x.created_at = m.ts);
