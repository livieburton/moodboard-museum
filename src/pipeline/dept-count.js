const { openDb } = require('./db');

openDb().then(({ db }) => {
  const stmt = db.prepare(`
    SELECT
      COALESCE(department, '(none)') AS department,
      COUNT(*) AS total,
      SUM(CASE WHEN primary_image IS NOT NULL THEN 1 ELSE 0 END) AS has_image,
      SUM(CASE WHEN primary_image IS NULL THEN 1 ELSE 0 END) AS no_image
    FROM objects
    GROUP BY department
    ORDER BY has_image DESC, total DESC
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  db.close();

  console.log('\nDepartment counts\n');
  console.log('Department'.padEnd(36) + 'total'.padStart(7) + 'images'.padStart(8) + 'missing'.padStart(9));
  console.log('-'.repeat(60));
  for (const r of rows) {
    console.log(r.department.padEnd(36) + String(r.total).padStart(7) + String(r.has_image).padStart(8) + String(r.no_image).padStart(9));
  }
  const t = rows.reduce(
    (a, r) => ({ total: a.total + r.total, has_image: a.has_image + r.has_image, no_image: a.no_image + r.no_image }),
    { total: 0, has_image: 0, no_image: 0 }
  );
  console.log('-'.repeat(60));
  console.log('TOTAL'.padEnd(36) + String(t.total).padStart(7) + String(t.has_image).padStart(8) + String(t.no_image).padStart(9));
  console.log('');
});
