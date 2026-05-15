/**
 * verify-db.js — sanity checks on the built database.
 *
 * Not a formal test suite — just confirms the foundation is sound before we
 * build the theme-query layer on top of it. Run after build-db.js:
 *   node src/pipeline/verify-db.js
 */

const { openDb } = require('./db');

// Run one SQL query and return rows as plain objects.
function query(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function verify() {
  const { db } = await openDb();
  let failures = 0;
  const check = (label, pass, detail = '') => {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!pass) failures++;
  };

  console.log('\nMoodboard Museum — database verification\n');

  // 1. Objects table populated.
  const [{ n: objectCount }] = query(db, 'SELECT COUNT(*) AS n FROM objects');
  check('objects table is populated', objectCount > 0, `${objectCount} rows`);

  // 2. THE big one: every row must be public domain.
  const [{ n: notPD }] = query(
    db, 'SELECT COUNT(*) AS n FROM objects WHERE is_public_domain != 1'
  );
  check('every object is public domain', notPD === 0,
    notPD === 0 ? 'no leaks' : `${notPD} non-PD rows leaked!`);

  // 3. Primary key integrity — no null/zero IDs.
  const [{ n: badIds }] = query(
    db, 'SELECT COUNT(*) AS n FROM objects WHERE object_id IS NULL OR object_id = 0'
  );
  check('all objects have a valid ID', badIds === 0);

  // 4. Tags normalized and linked.
  const [{ n: tagCount }] = query(db, 'SELECT COUNT(*) AS n FROM object_tags');
  const [{ n: orphanTags }] = query(
    db,
    `SELECT COUNT(*) AS n FROM object_tags t
     LEFT JOIN objects o ON o.object_id = t.object_id
     WHERE o.object_id IS NULL`
  );
  check('object_tags is populated', tagCount > 0, `${tagCount} tag links`);
  check('no orphaned tags', orphanTags === 0);

  // 5. Image columns exist and are currently empty (enrichment not run yet).
  const [{ n: withImages }] = query(
    db, 'SELECT COUNT(*) AS n FROM objects WHERE primary_image IS NOT NULL'
  );
  check('image columns present, awaiting enrichment', true,
    `${withImages} enriched so far`);

  // 6. Spot-check: link_resource present (needed for clickable linkbacks).
  const [{ n: noLink }] = query(
    db, 'SELECT COUNT(*) AS n FROM objects WHERE link_resource IS NULL'
  );
  check('every object has a Met linkback URL', noLink === 0);

  // --- a few illustrative queries the theme layer will lean on ------------
  console.log('\n  Sample data:');
  const samples = query(
    db,
    `SELECT object_id, title, artist_name, begin_date FROM objects
     ORDER BY begin_date LIMIT 5`
  );
  for (const s of samples) {
    console.log(`    [${s.object_id}] ${s.title ?? '(untitled)'} — ` +
      `${s.artist_name ?? 'unknown'} (${s.begin_date ?? '?'})`);
  }

  console.log('\n  Most common tags:');
  const topTags = query(
    db,
    `SELECT tag, COUNT(*) AS n FROM object_tags
     GROUP BY tag ORDER BY n DESC, tag LIMIT 5`
  );
  for (const t of topTags) console.log(`    ${t.tag} (${t.n})`);

  db.close();

  console.log(
    `\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

verify().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
