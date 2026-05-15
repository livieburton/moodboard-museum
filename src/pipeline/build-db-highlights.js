/**
 * build-db-highlights.js — builds the database from Met highlights only.
 *
 * Highlights are curator-designated "must-see" objects. Every highlight is
 * photographed, so image coverage is ~100% — no desert-crawling through
 * undigitized ID ranges.
 *
 * Usage:
 *   node src/pipeline/build-db-highlights.js --test          # 50 objects, dry run
 *   node src/pipeline/build-db-highlights.js                 # full pull
 *   node src/pipeline/build-db-highlights.js --swap          # full pull + swap DB
 *   node src/pipeline/build-db-highlights.js --clear-cache   # purge 404/403 sentinels, then full pull
 */

const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { SCHEMA }               = require('./schema');
const { DB_PATH }              = require('./db');
const { readCache, writeCache } = require('./enrich-images');
const { fetchObject }           = require('./met-api');

const CACHE_DIR    = path.join(__dirname, '..', '..', 'data', 'cache', 'met-objects');
const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const NEW_DB_PATH  = path.join(path.dirname(DB_PATH), 'moodboard-new.sqlite');
const TEST_DB_PATH = path.join(path.dirname(DB_PATH), 'moodboard-test.sqlite');
const BATCH_SIZE   = 25;
const TEST_LIMIT   = 50;
const SWAP_THRESHOLD = 100;

// --- helpers (same as build-db-from-api.js) ----------------------------------

const clean  = (v) => (v == null || v === '' ? null : String(v).trim()) || null;
const toBool = (v) => (v ? 1 : 0);
const toInt  = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

function recordToRow(rec) {
  return {
    object_id:           rec.objectID,
    title:               clean(rec.title),
    artist_name:         clean(rec.artistDisplayName),
    artist_bio:          clean(rec.artistDisplayBio),
    artist_nationality:  clean(rec.artistNationality),
    object_date:         clean(rec.objectDate),
    begin_date:          toInt(rec.objectBeginDate),
    end_date:            toInt(rec.objectEndDate),
    medium:              clean(rec.medium),
    classification:      clean(rec.classification),
    department:          clean(rec.department),
    culture:             clean(rec.culture),
    period:              clean(rec.period),
    credit_line:         clean(rec.creditLine),
    gallery_number:      clean(rec.GalleryNumber),
    is_highlight:        toBool(rec.isHighlight),
    is_public_domain:    toBool(rec.isPublicDomain),
    link_resource:       clean(rec.objectURL),
    wikidata_url:        clean(rec.objectWikidata_URL),
    primary_image:       clean(rec.primaryImage),
    primary_image_small: clean(rec.primaryImageSmall),
  };
}

function extractTags(rec) {
  if (!Array.isArray(rec.tags)) return [];
  return rec.tags.map((t) => clean(t.term)).filter(Boolean);
}

async function createDb() {
  const SQL = await initSqlJs();
  const db  = new SQL.Database();
  db.run(SCHEMA);
  return db;
}

function prepareInserts(db) {
  const insertObj = db.prepare(`
    INSERT OR REPLACE INTO objects (
      object_id, title, artist_name, artist_bio, artist_nationality,
      object_date, begin_date, end_date, medium, classification,
      department, culture, period, credit_line, gallery_number,
      is_highlight, is_public_domain, link_resource, wikidata_url,
      primary_image, primary_image_small
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  const insertTag = db.prepare(
    `INSERT OR IGNORE INTO object_tags (object_id, tag) VALUES (?, ?)`
  );
  return { insertObj, insertTag };
}

function saveDb(db, dbPath) {
  const data = db.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// --- fetch -------------------------------------------------------------------

async function fetchHighlightIds() {
  // The /objects endpoint ignores isHighlight — use /search, which actually
  // applies it. q=* matches everything; hasImages ensures image URLs exist.
  const url = `${MET_API_BASE}/search?isHighlight=true&isPublicDomain=true&hasImages=true&q=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch highlight IDs: HTTP ${res.status}`);
  const json = await res.json();
  return json.objectIDs || [];
}

// --- core loop ---------------------------------------------------------------

async function processIds(ids, db, { label = '', savePath = null, saveEvery = 20 } = {}) {
  let { insertObj, insertTag } = prepareInserts(db);
  const stats = { stored: 0, noImage: 0, notFound: 0, fromCache: 0, fromApi: 0 };
  let batchCount = 0;

  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = ids.slice(start, start + BATCH_SIZE);

    db.run('BEGIN');
    for (const objectId of batch) {
      const cached = readCache(objectId);
      let rec;
      if (cached.hit) {
        rec = cached.record;
        stats.fromCache++;
      } else {
        rec = await fetchObject(objectId);
        writeCache(objectId, rec);
        stats.fromApi++;
      }

      if (rec === null) { stats.notFound++; continue; }
      if (!rec.isPublicDomain || !rec.primaryImage) { stats.noImage++; continue; }

      const row  = recordToRow(rec);
      const tags = extractTags(rec);
      insertObj.run([
        row.object_id, row.title, row.artist_name, row.artist_bio, row.artist_nationality,
        row.object_date, row.begin_date, row.end_date, row.medium, row.classification,
        row.department, row.culture, row.period, row.credit_line, row.gallery_number,
        row.is_highlight, row.is_public_domain, row.link_resource, row.wikidata_url,
        row.primary_image, row.primary_image_small,
      ]);
      for (const tag of tags) insertTag.run([row.object_id, tag]);
      stats.stored++;
    }
    db.run('COMMIT');

    batchCount++;
    const processed = Math.min(start + BATCH_SIZE, ids.length);
    console.log(
      `  ${label}[${processed}/${ids.length}] ` +
      `stored ${stats.stored}, cache ${stats.fromCache}, ` +
      `api ${stats.fromApi}, no-image ${stats.noImage}, not-found ${stats.notFound}`
    );

    if (savePath && batchCount % saveEvery === 0) {
      insertObj.free();
      insertTag.free();
      saveDb(db, savePath);
      console.log(`  [checkpoint] ${stats.stored.toLocaleString()} records saved`);
      ({ insertObj, insertTag } = prepareInserts(db));
    }
  }

  insertObj.free();
  insertTag.free();
  return stats;
}

// --- cache maintenance -------------------------------------------------------

function clearNegativeCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('  Cache directory does not exist — nothing to clear.\n');
    return;
  }
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const SENTINEL = '{"record":null}';
  let removed = 0;
  for (const file of files) {
    const full = path.join(CACHE_DIR, file);
    const content = fs.readFileSync(full, 'utf8').trim();
    if (content === SENTINEL) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  console.log(`  Cleared ${removed.toLocaleString()} sentinel files (${files.length.toLocaleString()} checked).\n`);
}

// --- modes -------------------------------------------------------------------

async function runTest() {
  console.log('\nMoodboard Museum — highlights pipeline (TEST, 50 objects)\n');

  process.stdout.write('  Fetching highlight IDs… ');
  const allIds = await fetchHighlightIds();
  console.log(`${allIds.length.toLocaleString()} total highlights\n`);

  const ids = allIds.slice(0, TEST_LIMIT);
  const db  = await createDb();
  const stats = await processIds(ids, db, { label: 'TEST ' });

  // Sample what was stored.
  const stmt = db.prepare(`
    SELECT o.object_id, o.title, o.department, o.classification, o.artist_name,
           GROUP_CONCAT(ot.tag, ' | ') AS tags
    FROM objects o
    LEFT JOIN object_tags ot ON o.object_id = ot.object_id
    GROUP BY o.object_id
    LIMIT 10
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  db.close();

  console.log('\n  ── Sample results ──────────────────────────────────────────');
  for (const r of rows) {
    console.log(`\n  [${r.object_id}] ${r.title || '(untitled)'}`);
    console.log(`    dept:   ${r.department || '—'}`);
    console.log(`    type:   ${r.classification || '—'}`);
    console.log(`    artist: ${r.artist_name || '—'}`);
    console.log(`    tags:   ${r.tags || '—'}`);
  }

  const hitRate = Math.round(stats.stored / ids.length * 100);
  console.log('\n  ── Summary ─────────────────────────────────────────────────');
  console.log(`    Total highlights: ${allIds.length.toLocaleString()}`);
  console.log(`    Tested:           ${ids.length}`);
  console.log(`    Stored:           ${stats.stored}  (${hitRate}% hit rate)`);
  console.log(`    No image:         ${stats.noImage}`);
  console.log(`    Not found:        ${stats.notFound}`);
  console.log(`    From cache:       ${stats.fromCache}`);
  console.log('\n  Test complete. Existing database untouched.\n');
}

async function runFull({ swap = false } = {}) {
  console.log('\nMoodboard Museum — highlights pipeline (full pull)\n');

  process.stdout.write('  Fetching highlight IDs… ');
  const ids = await fetchHighlightIds();
  console.log(`${ids.length.toLocaleString()} objects\n`);
  console.log(`  Writing to: ${NEW_DB_PATH}\n`);

  const db    = await createDb();
  const stats = await processIds(ids, db, { savePath: NEW_DB_PATH, saveEvery: 20 });

  saveDb(db, NEW_DB_PATH);
  db.close();

  const hitRate = Math.round(stats.stored / ids.length * 100);
  console.log('\n  ── Done ────────────────────────────────────────────────────');
  console.log(`    Stored:     ${stats.stored.toLocaleString()}  (${hitRate}% hit rate)`);
  console.log(`    No image:   ${stats.noImage.toLocaleString()}`);
  console.log(`    Not found:  ${stats.notFound.toLocaleString()}`);
  console.log(`    From cache: ${stats.fromCache.toLocaleString()}`);
  console.log('');

  if (stats.stored < SWAP_THRESHOLD) {
    console.log(`  ✖ Only ${stats.stored} records — below the ${SWAP_THRESHOLD} threshold.`);
    console.log(`    Existing database NOT replaced.\n`);
    return;
  }

  if (swap) {
    const backupPath = DB_PATH.replace('.sqlite', '-backup.sqlite');
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
      console.log(`  Backed up existing DB → ${path.basename(backupPath)}`);
    }
    fs.renameSync(NEW_DB_PATH, DB_PATH);
    console.log(`  Swapped moodboard-new.sqlite → moodboard.sqlite`);
    console.log('  Restart the server to pick up the new database.\n');
  } else {
    console.log(`  New database: ${path.basename(NEW_DB_PATH)}`);
    console.log(`  Existing database untouched.`);
    console.log(`  Rerun with --swap to replace it automatically.\n`);
  }
}

// --- CLI ---------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--clear-cache')) {
      console.log('\nMoodboard Museum — clearing negative cache entries\n');
      clearNegativeCache();
      await runFull({ swap: args.includes('--swap') });
    } else if (args.includes('--test')) {
      await runTest();
    } else {
      await runFull({ swap: args.includes('--swap') });
    }
  } catch (err) {
    console.error('\nPipeline failed:', err.message);
    process.exit(1);
  }
})();
