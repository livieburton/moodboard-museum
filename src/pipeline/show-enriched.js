const { openDb } = require('./db');

async function main() {
  const { db } = await openDb();

  const byDept = db.prepare(`
    SELECT department, COUNT(*) AS n
    FROM objects WHERE primary_image IS NOT NULL
    GROUP BY department ORDER BY n DESC
  `);
  console.log('\n── By department ──────────────────────────');
  while (byDept.step()) {
    const r = byDept.getAsObject();
    console.log(`  ${String(r.n).padStart(3)}  ${r.department}`);
  }
  byDept.free();

  const byClass = db.prepare(`
    SELECT classification, COUNT(*) AS n
    FROM objects WHERE primary_image IS NOT NULL
    GROUP BY classification ORDER BY n DESC
  `);
  console.log('\n── By classification ───────────────────────');
  while (byClass.step()) {
    const r = byClass.getAsObject();
    console.log(`  ${String(r.n).padStart(3)}  ${r.classification}`);
  }
  byClass.free();

  const byTag = db.prepare(`
    SELECT ot.tag, COUNT(*) AS n
    FROM object_tags ot
    JOIN objects o ON o.object_id = ot.object_id
    WHERE o.primary_image IS NOT NULL
    GROUP BY ot.tag ORDER BY n DESC
    LIMIT 30
  `);
  console.log('\n── Top 30 tags ─────────────────────────────');
  while (byTag.step()) {
    const r = byTag.getAsObject();
    console.log(`  ${String(r.n).padStart(3)}  ${r.tag}`);
  }
  byTag.free();

  db.close();
}

main().catch(console.error);
