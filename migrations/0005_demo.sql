-- The example cast: three demo writers whose pages show how Thwack works.
-- Everything is a real row rendered by the real code, so these pages double
-- as stable fixtures for testing. The writing is obscure public-domain work
-- with a citation at the bottom of each piece; the review conversations are
-- written for the demo. Demo accounts are excluded from the assignment pool
-- (worker/src/lib/assigner.ts) and their demo<->demo review threads are
-- world-readable, read-only (worker/src/routes/reviews.ts).
-- Pen names use the identity vocabulary so they look native; fixed pids are
-- intentionally recognizable (tools/demo_test.mjs checks consistency).

INSERT OR IGNORE INTO users (pid, google_sub, email, name, handle, hue, animal, created_at, last_seen_at, is_demo) VALUES
  ('demowriter0q', 'demo-swan',  'swan@example.invalid',  'Demo Swan',  'Wistful Moss Swan',    112, 'Swan',  1792600000, 1792600000, 1),
  ('demoreader0q', 'demo-otter', 'otter@example.invalid', 'Demo Otter', 'Patient Cobalt Otter', 230, 'Otter', 1792600000, 1792600000, 1),
  ('demopoet000q', 'demo-snail', 'snail@example.invalid', 'Demo Snail', 'Hushed Amber Snail',    38, 'Snail', 1792600000, 1792600000, 1);

INSERT OR IGNORE INTO works (pid, user_id, doc_id, title, status, available, added_at) VALUES
  ('demoworkone0', (SELECT id FROM users WHERE pid='demowriter0q'), 'demo-doc-little-rain', 'The Land of Little Rain', 'active', 1, 1792700000),
  ('demoworktwo0', (SELECT id FROM users WHERE pid='demowriter0q'), 'demo-doc-wind-blows',  'The Wind Blows',          'active', 1, 1793100000),
  ('demoworkthr0', (SELECT id FROM users WHERE pid='demoreader0q'), 'demo-doc-notebooks',   'From the Notebooks',      'active', 1, 1792900000),
  ('demoworkfou0', (SELECT id FROM users WHERE pid='demopoet000q'), 'demo-doc-cinquains',   'Two Cinquains',           'active', 1, 1793000000);

-- "The Land of Little Rain" has two drafts, so the version switcher and
-- per-draft reviews are visible on the demo.
INSERT OR IGNORE INTO work_versions (work_id, num, snapshot_html, content_hash, created_at) VALUES
  ((SELECT id FROM works WHERE pid='demoworkone0'), 1,
   '<p>East away from the Sierras, south from Panamint and Amargosa, east and south many an uncounted mile, is the Country of Lost Borders.</p><p>Not the law, but the land sets the limit. Desert is the name it wears upon the maps, but the Indian''s is the better word. Desert is a loose term to indicate land that supports no man; whether the land can be bitted and broken to that purpose is not proven. Void of life it never is, however dry the air and villainous the soil.</p><p><em>An example page. The text is an excerpt, lightly adapted, from Mary Austin''s “The Land of Little Rain” (1903), now in the public domain. It appears here only to show how Thwack works.</em></p>',
   'demo-rain-1', 1792700000),
  ((SELECT id FROM works WHERE pid='demoworkone0'), 2,
   '<p>East away from the Sierras, south from Panamint and Amargosa, east and south many an uncounted mile, is the Country of Lost Borders.</p><p>Not the law, but the land sets the limit. Void of life it never is, however dry the air and villainous the soil; whether the land can be bitted and broken to a man''s purpose is not proven.</p><p>This is the nature of that country. There are hills, rounded, blunt, burned, squeezed up out of chaos, chrome and vermilion painted, aspiring to the snow-line. Between the hills lie high level-looking plains full of intolerable sun glare, or narrow valleys drowned in a blue haze.</p><p><em>An example page. The text is an excerpt, lightly adapted, from Mary Austin''s “The Land of Little Rain” (1903), now in the public domain. It appears here only to show how Thwack works.</em></p>',
   'demo-rain-2', 1794000000),
  ((SELECT id FROM works WHERE pid='demoworktwo0'), 1,
   '<p>Suddenly — dreadfully — she wakes up. What has happened? Something dreadful has happened. No — nothing has happened. It is only the wind shaking the house, rattling the windows, banging a piece of iron on the roof and making her bed tremble.</p><p>Leaves flutter past the window, up and away; down in the avenue a whole newspaper wags in the air like a lost kite and falls, spiked on a pine tree. It is cold. Summer is over — it is autumn — everything is ugly.</p><p><em>An example page. Excerpt, lightly adapted, from Katherine Mansfield''s “The Wind Blows” (1920), public domain. Shown only to demonstrate Thwack.</em></p>',
   'demo-wind-1', 1793100000),
  ((SELECT id FROM works WHERE pid='demoworkthr0'), 1,
   '<p>Life is like playing a violin solo in public and learning the instrument as one goes on.</p><p>All progress is based upon a universal innate desire on the part of every organism to live beyond its income.</p><p><em>An example page. Aphorisms from “The Note-Books of Samuel Butler” (1912), public domain, lightly adapted. Shown only to demonstrate Thwack.</em></p>',
   'demo-notes-1', 1792900000),
  ((SELECT id FROM works WHERE pid='demoworkfou0'), 1,
   '<p><strong>November Night</strong></p><p>Listen…<br>With faint dry sound,<br>Like steps of passing ghosts,<br>The leaves, frost-crisp’d, break from the trees<br>And fall.</p><p><strong>Triad</strong></p><p>These be<br>Three silent things:<br>The falling snow… the hour<br>Before the dawn… the mouth of one<br>Just dead.</p><p><em>An example page. Poems by Adelaide Crapsey (1878–1914), public domain. Shown only to demonstrate Thwack.</em></p>',
   'demo-cinq-1', 1793000000);

INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES
  ((SELECT id FROM users WHERE pid='demoreader0q'), (SELECT id FROM users WHERE pid='demowriter0q'), 1792800000),
  ((SELECT id FROM users WHERE pid='demopoet000q'), (SELECT id FROM users WHERE pid='demowriter0q'), 1792850000),
  ((SELECT id FROM users WHERE pid='demowriter0q'), (SELECT id FROM users WHERE pid='demopoet000q'), 1792860000);

-- Two example review conversations on "The Land of Little Rain":
-- one on draft 1 (three messages, back and forth), one on draft 2.
INSERT OR IGNORE INTO reviews (work_id, version_id, reviewer_id, source, created_at, last_msg_at) VALUES
  ((SELECT id FROM works WHERE pid='demoworkone0'),
   (SELECT id FROM work_versions WHERE num=1 AND work_id=(SELECT id FROM works WHERE pid='demoworkone0')),
   (SELECT id FROM users WHERE pid='demoreader0q'), 'organic', 1792950000, 1793140000),
  ((SELECT id FROM works WHERE pid='demoworkone0'),
   (SELECT id FROM work_versions WHERE num=2 AND work_id=(SELECT id FROM works WHERE pid='demoworkone0')),
   (SELECT id FROM users WHERE pid='demopoet000q'), 'organic', 1794200000, 1794300000);

INSERT INTO review_msgs (review_id, author_id, body, created_at)
SELECT r.id, u.id, m.body, m.ts FROM (
  SELECT 'demoreader0q' AS reviewer_pid, 1 AS draft, 'demoreader0q' AS author_pid, 'The opening line carries the whole first page — trust it more. The second paragraph explains what “Lost Borders” means right after the land has already shown me. Could you cut the map sentence and let the strangeness breathe a little longer?' AS body, 1792950000 AS ts
  UNION ALL SELECT 'demoreader0q', 1, 'demowriter0q', 'That''s fair — I keep over-explaining the desert instead of letting it be dry. I''ll cut the map sentence in the next draft and see if the first paragraph can stand alone.', 1793050000
  UNION ALL SELECT 'demoreader0q', 1, 'demoreader0q', 'Looking forward to it. The “bitted and broken” phrase is the best thing here — whatever you cut, keep that.', 1793140000
  UNION ALL SELECT 'demopoet000q', 2, 'demopoet000q', 'Draft 2 reads much steadier. The new closing paragraph — the hills “squeezed up out of chaos” — gives the piece a horizon it didn''t have before. The blue haze is doing quiet work; don''t touch it.', 1794200000
  UNION ALL SELECT 'demopoet000q', 2, 'demowriter0q', 'Thank you — that paragraph was the one I was least sure about.', 1794300000
) m
JOIN reviews r ON r.reviewer_id = (SELECT id FROM users WHERE pid = m.reviewer_pid)
  AND r.version_id = (SELECT id FROM work_versions WHERE num = m.draft AND work_id = (SELECT id FROM works WHERE pid='demoworkone0'))
JOIN users u ON u.pid = m.author_pid
WHERE NOT EXISTS (SELECT 1 FROM review_msgs x WHERE x.review_id = r.id AND x.created_at = m.ts);
