/**
 * enrich-images.js — fills in image URLs for objects in the database.
 *
 *   for each object with no image yet:
 *     -> check the on-disk cache first
 *     -> only if not cached, call the Met API
 *     -> write image URLs back to the database
 *
 * Usage:
 *   node src/pipeline/enrich-images.js [--limit N]
 *
 *   --limit N      only enrich N objects this run (default: all).
 *   --clear-cache  delete null-sentinel cache files before running, so
 *                  previously-blocked objects get a fresh attempt.
 *
 * Only objects in ENRICH_DEPARTMENTS are enriched. European Paintings is
 * excluded entirely — the Met restricts those image files and returns 403s.
 *
 * THE CACHE is the important idea here. The Met's data barely changes, and an
 * artwork's image URL is stable. So we save every API response to a JSON file
 * on disk (data/cache/met-objects/{id}.json). On any later run — after a crash,
 * a Ctrl-C, or just running again tomorrow — cached objects cost zero API
 * calls. This makes the pipeline:
 *   - resumable : stop and restart freely; you never re-fetch
 *   - polite    : the Met's servers see each object requested at most once
 *   - fast      : the second run is disk-speed, not network-speed
 *
 * This is exactly what "consider caching metadata rather than hammering the
 * API" meant, way back at the start — here it is as actual code.
 */

const fs = require('fs');
const path = require('path');
const { openDb, saveDb } = require('./db');
const { fetchObject, extractImageUrls } = require('./met-api');

const CACHE_DIR = path.join('C:\\Users\\livie\\AppData\\Local\\moodboard-museum-cache');

const ENRICH_DEPARTMENTS = [
  'Drawings and Prints',
  'Asian Art',
  'Greek and Roman Art',
  'The American Wing',
];

// --- cache layer -----------------------------------------------------------

/** Path to the cache file for a given object ID. */
const cachePathFor = (objectId) => path.join(CACHE_DIR, `${objectId}.json`);

/**
 * Read a cached API record.
 *
 * Returns one of THREE things, because "not cached" and "cached as null"
 * are genuinely different states and the caller must tell them apart:
 *   - { hit: true,  record: <object> }  — cached, and the API had a record
 *   - { hit: true,  record: null }      — cached, but the API returned nothing (404)
 *   - { hit: false, record: null }      — not in the cache at all
 *
 * The earlier version returned a bare `null` for both of the last two cases,
 * so 404s were re-fetched on every run. Wrapping the result fixes that.
 */
function readCache(objectId) {
  const file = cachePathFor(objectId);
  if (!fs.existsSync(file)) {
    return { hit: false, record: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // The file stores { record: <apiRecord|null> }.
    return { hit: true, record: parsed.record };
  } catch {
    // Corrupt cache file (e.g. interrupted write) — treat as a miss.
    return { hit: false, record: null };
  }
}

/**
 * Write an API record to the cache. We wrap it as { record: ... } so that a
 * null (the API had no record for this object) is stored explicitly and
 * remembered — a cached 404 should never be re-requested.
 */
function writeCache(objectId, apiRecord) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // Atomic-ish write: write to a temp file, then rename. Prevents a corrupt
  // cache file if the process is killed mid-write.
  const finalPath = cachePathFor(objectId);
  const tempPath = `${finalPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ record: apiRecord }));
  fs.renameSync(tempPath, finalPath);
}

// --- cache maintenance -----------------------------------------------------

function clearNegativeCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('  Cache directory does not exist — nothing to clear.\n');
    return;
  }
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const SENTINEL = '{"record":null}'; // exactly 15 bytes
  let removed = 0;
  for (const file of files) {
    const full = path.join(CACHE_DIR, file);
    // Size check first — avoids reading every file.
    const { size } = fs.statSync(full);
    if (size === SENTINEL.length && fs.readFileSync(full, 'utf8').trim() === SENTINEL) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  console.log(`  Cleared ${removed.toLocaleString()} sentinel files (${files.length.toLocaleString()} checked).\n`);
}

// --- query helpers ---------------------------------------------------------

/** Run a SELECT and return rows as plain objects. */
function selectRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// --- main ------------------------------------------------------------------

const BATCH_SIZE = 25;

async function enrichImages({ limit } = {}) {
  console.log('\nMoodboard Museum — image enrichment\n');

  // Read the todo list in a short-lived connection, then close it.
  // Each batch below opens its own connection so that saveDb() — which calls
  // db.export() internally — never runs while a prepared statement is open.
  // sql.js's WASM implementation invalidates prepared statements on export(),
  // which caused "Statement closed" errors when saveDb() fired mid-loop.
  const { db: readDb } = await openDb();
  const deptPlaceholders = ENRICH_DEPARTMENTS.map(() => '?').join(', ');
  let sql = `
    SELECT object_id FROM objects
    WHERE primary_image IS NULL
      AND department IN (${deptPlaceholders})
    ORDER BY is_highlight DESC, object_id
  `;
  if (limit && Number.isInteger(limit) && limit > 0) {
    sql += ` LIMIT ${limit}`;
  }
  const fromDb = selectRows(readDb, sql, ENRICH_DEPARTMENTS).map((r) => r.object_id);

  // Also report total objects in those departments so we can spot a wrong DB.
  const deptTotal = selectRows(
    readDb,
    `SELECT COUNT(*) AS n FROM objects WHERE department IN (${deptPlaceholders})`,
    ENRICH_DEPARTMENTS
  )[0]?.n ?? 0;
  const nullTotal = selectRows(
    readDb,
    `SELECT COUNT(*) AS n FROM objects WHERE primary_image IS NULL AND department IN (${deptPlaceholders})`,
    ENRICH_DEPARTMENTS
  )[0]?.n ?? 0;
  readDb.close();

  console.log(`  DB: ${deptTotal.toLocaleString()} objects in target departments, ${nullTotal.toLocaleString()} with no image`);

  const todo = fromDb.filter((id) => !fs.existsSync(cachePathFor(id)));
  console.log(`  SQL returned ${fromDb.length.toLocaleString()} candidates, cache filter left ${todo.length.toLocaleString()}\n`);

  if (todo.length === 0) {
    if (nullTotal === 0) {
      console.log('  Nothing to enrich — every object in the target departments already has an image.\n');
    } else {
      console.log(`  Nothing to enrich — all ${nullTotal.toLocaleString()} unenriched objects are covered by cache files.\n`);
      console.log('  Run with --clear-cache to delete null sentinels and retry those objects.\n');
    }
    return { enriched: 0, fromCache: 0, fromApi: 0, noImage: 0, notFound: 0 };
  }

  console.log(`  ${todo.length} object(s) to enrich`);
  console.log(`  Departments: ${ENRICH_DEPARTMENTS.join(', ')}`);
  console.log(`  Cache directory: ${CACHE_DIR}\n`);

  const stats = { enriched: 0, fromCache: 0, fromApi: 0, noImage: 0, notFound: 0 };
  let processed = 0;

  for (let batchStart = 0; batchStart < todo.length; batchStart += BATCH_SIZE) {
    const batch = todo.slice(batchStart, batchStart + BATCH_SIZE);

    // Fresh connection per batch — statement lifetime never crosses a saveDb().
    const { db } = await openDb();
    const updateStmt = db.prepare(
      `UPDATE objects SET primary_image = ?, primary_image_small = ? WHERE object_id = ?`
    );

    db.run('BEGIN');
    for (const objectId of batch) {
      processed++;

      // 1. Try the cache first.
      const cacheResult = readCache(objectId);
      let apiRecord;

      // 2. Cache miss -> hit the API, then cache whatever we get back.
      //    Cache hit -> use the cached record (even if it's null, i.e. a
      //    remembered 404 — that still counts as resolved, no API call needed).
      if (cacheResult.hit) {
        apiRecord = cacheResult.record;
        stats.fromCache++;
      } else {
        apiRecord = await fetchObject(objectId);
        writeCache(objectId, apiRecord); // caches null too, so 404s aren't re-fetched
        stats.fromApi++;
      }

      // 3. Interpret the record.
      if (apiRecord === null) {
        // The object has no API record at all (404). Leave image columns null.
        stats.notFound++;
      } else {
        const { primaryImage, primaryImageSmall } = extractImageUrls(apiRecord);
        if (primaryImage) {
          updateStmt.run([primaryImage, primaryImageSmall, objectId]);
          stats.enriched++;
        } else {
          // Record exists but has no image (some PD objects aren't photographed).
          stats.noImage++;
        }
      }
    }
    db.run('COMMIT');

    // Free the statement before saving — this is the fix.
    updateStmt.free();
    saveDb(db);
    db.close();

    console.log(
      `  [${processed}/${todo.length}] ` +
      `enriched ${stats.enriched}, ` +
      `cache ${stats.fromCache}, api ${stats.fromApi}, ` +
      `no-image ${stats.noImage}, not-found ${stats.notFound}`
    );
  }

  console.log('\n  Done.');
  console.log(`    Enriched with image:   ${stats.enriched}`);
  console.log(`    Served from cache:     ${stats.fromCache}`);
  console.log(`    Fetched from API:      ${stats.fromApi}`);
  console.log(`    Record had no image:   ${stats.noImage}`);
  console.log(`    No API record (404):   ${stats.notFound}`);
  console.log('');

  return stats;
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      args.limit = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--clear-cache') {
      args.clearCache = true;
    }
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const run = async () => {
    if (args.clearCache) {
      console.log('\nClearing negative cache entries…');
      clearNegativeCache();
    }
    await enrichImages(args);
  };
  run().catch((err) => {
    console.error('Enrichment failed:', err);
    process.exit(1);
  });
}

module.exports = { enrichImages, readCache, writeCache };
