-- Give one demo work real heading structure so the generated Contents list
-- is visible on the example pages.
UPDATE work_versions SET snapshot_html =
  '<h2>November Night</h2><p>Listen…<br>With faint dry sound,<br>Like steps of passing ghosts,<br>The leaves, frost-crisp’d, break from the trees<br>And fall.</p><h2>Triad</h2><p>These be<br>Three silent things:<br>The falling snow… the hour<br>Before the dawn… the mouth of one<br>Just dead.</p><p><em>An example page. Poems by Adelaide Crapsey (1878–1914), public domain. Shown only to demonstrate Thwack.</em></p>'
WHERE content_hash = 'demo-cinq-1';
