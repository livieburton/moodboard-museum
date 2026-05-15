const { openDb } = require('./db');

openDb().then(({ db }) => {
  const stmt = db.prepare(`
    SELECT ot.tag, COUNT(*) AS cnt
    FROM object_tags ot
    JOIN objects o ON o.object_id = ot.object_id
    WHERE o.primary_image IS NOT NULL
    GROUP BY ot.tag
    ORDER BY cnt DESC
    LIMIT 50
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  db.close();

  console.log('\nTop 50 tags (objects with images only)\n');
  console.log('  #   count  tag');
  console.log('  ' + '-'.repeat(45));
  rows.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}  ${String(r.cnt).padStart(5)}  ${r.tag}`);
  });
  console.log('');
});
