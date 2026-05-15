/**
 * build-db-from-api.js — builds the database directly from the Met API.
 *
 * Unlike the CSV pipeline, this starts from the API's own object-ID list,
 * so every record that lands in the database is guaranteed to:
 *   - exist in the live API
 *   - be public domain (isPublicDomain: true)
 *   - have a primary image
 *
 * Usage:
 *   node src/pipeline/build-db-from-api.js --test       # 50 objects, dry-run
 *   node src/pipeline/build-db-from-api.js              # full pull
 *   node src/pipeline/build-db-from-api.js --swap       # full pull + auto-swap DB
 *
 * The --test flag writes to a separate file and never touches moodboard.sqlite.
 * Without --swap the full pull writes to moodboard-new.sqlite and prints
 * instructions for swapping manually once you're happy with the result.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { SCHEMA } = require('./schema');
const { DB_PATH, saveDb } = require('./db');
const { readCache, writeCache } = require('./enrich-images');
const { fetchObject } = require('./met-api');

const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';

const NEW_DB_PATH  = path.join(path.dirname(DB_PATH), 'moodboard-new.sqlite');
const TEST_DB_PATH = path.join(path.dirname(DB_PATH), 'moodboard-test.sqlite');

const DEPARTMENTS = [
  { id: 9,  name: 'Drawings and Prints' },
  { id: 6,  name: 'Asian Art' },
  { id: 13, name: 'Greek and Roman Art' },
];

const BATCH_SIZE  = 25;
const TEST_LIMIT  = 50;
const SWAP_THRESHOLD = 100;

// --- helpers -----------------------------------------------------------------

const clean = (v) => (v == null || v === '' ? null : String(v).trim()) || null;
const toBool = (v) => (v ? 1 : 0);
const toInt  = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Fetch all public-domain object IDs for one department. */
async function fetchDeptIds(departmentId) {
  // The Met API uses the plural "departmentIds" — the singular form is silently ignored.
  const url = `${MET_API_BASE}/objects?isPublicDomain=true&departmentIds=${departmentId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch dept ${departmentId}: HTTP ${res.status}`);
  const json = await res.json();
  return json.objectIDs || [];
}

/** Map a raw Met API record to our database column values. */
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

/** Tags come as [{term, AAT_URL, Wikidata_URL}] or null/undefined. */
function extractTags(rec) {
  if (!Array.isArray(rec.tags)) return [];
  return rec.tags.map((t) => clean(t.term)).filter(Boolean);
}

// --- database ----------------------------------------------------------------

async function createDb(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
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

function insertRecord(insertObj, insertTag, row, tags) {
  insertObj.run([
    row.object_id, row.title, row.artist_name, row.artist_bio, row.artist_nationality,
    row.object_date, row.begin_date, row.end_date, row.medium, row.classification,
    row.department, row.culture, row.period, row.credit_line, row.gallery_number,
    row.is_highlight, row.is_public_domain, row.link_resource, row.wikidata_url,
    row.primary_image, row.primary_image_small,
  ]);
  for (const tag of tags) {
    insertTag.run([row.object_id, tag]);
  }
}

function saveNewDb(db, dbPath) {
  const data = db.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// --- core pipeline -----------------------------------------------------------

async function processIds(ids, db, { label = '', savePath = null, saveEvery = 500 } = {}) {
  let { insertObj, insertTag } = prepareInserts(db);
  const stats = { fetched: 0, stored: 0, noImage: 0, notFound: 0, fromCache: 0 };
  let batchCount = 0;

  for (let batchStart = 0; batchStart < ids.length; batchStart += BATCH_SIZE) {
    const batch = ids.slice(batchStart, batchStart + BATCH_SIZE);

    db.run('BEGIN');
    for (const objectId of batch) {
      // Try cache first.
      const cached = readCache(objectId);
      let apiRecord;
      if (cached.hit) {
        apiRecord = cached.record;
        stats.fromCache++;
      } else {
        apiRecord = await fetchObject(objectId);
        writeCache(objectId, apiRecord);
        stats.fetched++;
      }

      if (apiRecord === null) {
        stats.notFound++;
        continue;
      }

      // Hard filter: must be public domain and have an image.
      if (!apiRecord.isPublicDomain || !apiRecord.primaryImage) {
        stats.noImage++;
        continue;
      }

      const row  = recordToRow(apiRecord);
      const tags = extractTags(apiRecord);
      insertRecord(insertObj, insertTag, row, tags);
      stats.stored++;
    }
    db.run('COMMIT');

    batchCount++;
    const processed = Math.min(batchStart + BATCH_SIZE, ids.length);
    console.log(
      `  ${label}[${processed}/${ids.length}] ` +
      `stored ${stats.stored}, ` +
      `cache ${stats.fromCache}, api ${stats.fetched}, ` +
      `no-image ${stats.noImage}, not-found ${stats.notFound}`
    );

    // Periodic save so a crash doesn't lose everything.
    if (savePath && batchCount % saveEvery === 0) {
      insertObj.free();
      insertTag.free();
      saveNewDb(db, savePath);
      console.log(`  [checkpoint] saved to disk (${stats.stored.toLocaleString()} records so far)`);
      const fresh = prepareInserts(db);
      insertObj = fresh.insertObj;
      insertTag = fresh.insertTag;
    }
  }

  insertObj.free();
  insertTag.free();
  return stats;
}

// --- modes -------------------------------------------------------------------

async function runTest() {
  console.log('\nMoodboard Museum — API pipeline (TEST MODE, 50 objects)\n');

  // Collect IDs from all three departments, interleaved so the sample
  // represents all of them rather than just the first department.
  const buckets = await Promise.all(
    DEPARTMENTS.map(async (dept) => {
      process.stdout.write(`  Fetching ID list: ${dept.name}… `);
      const ids = await fetchDeptIds(dept.id);
      console.log(`${ids.length.toLocaleString()} objects`);
      return { dept, ids };
    })
  );

  // Same interleave as the full run: highest IDs per department, round-robin.
  const reversedBuckets = buckets.map((b) => b.ids.slice().reverse());
  const allTestIds = [];
  const maxLen = Math.max(...reversedBuckets.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of reversedBuckets) {
      if (i < list.length) allTestIds.push(list[i]);
    }
  }
  const sampled = allTestIds.slice(0, TEST_LIMIT);

  console.log(`\n  Sampling ${sampled.length} objects (round-robin across departments)\n`);

  const db = await createDb(TEST_DB_PATH);
  const stats = await processIds(sampled, db, { label: 'TEST ' });

  // Show a sample of what was stored.
  const stmt = db.prepare(`
    SELECT o.object_id, o.title, o.department, o.classification,
           o.artist_name, o.primary_image_small,
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

  // Clean up test DB.
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  console.log('\n  ── Sample results ──────────────────────────────────────────');
  for (const r of rows) {
    console.log(`\n  [${r.object_id}] ${r.title || '(untitled)'}`);
    console.log(`    dept:   ${r.department || '—'}`);
    console.log(`    type:   ${r.classification || '—'}`);
    console.log(`    artist: ${r.artist_name || '—'}`);
    console.log(`    tags:   ${r.tags || '—'}`);
    console.log(`    image:  ${r.primary_image_small ? 'yes' : 'NO'}`);
  }

  console.log('\n  ── Summary ─────────────────────────────────────────────────');
  console.log(`    Objects stored:    ${stats.stored}`);
  console.log(`    No image / skipped: ${stats.noImage}`);
  console.log(`    Not found (404/403): ${stats.notFound}`);
  console.log(`    From cache:        ${stats.fromCache}`);
  console.log(`    Hit rate:          ${Math.round(stats.stored / sampled.length * 100)}%`);
  console.log('');
  console.log('  Test complete. Existing database untouched.');
  console.log('  Run without --test to do the full pull.\n');
}

async function runFull({ swap = false, limit = null } = {}) {
  console.log('\nMoodboard Museum — API pipeline (full pull)\n');

  const deptLists = [];
  for (const dept of DEPARTMENTS) {
    process.stdout.write(`  Fetching ID list: ${dept.name}… `);
    const ids = await fetchDeptIds(dept.id);
    console.log(`${ids.length.toLocaleString()} objects`);
    deptLists.push(ids);
  }

  // Reverse each department's list independently, then interleave (round-robin).
  // This puts the highest IDs from EVERY department at the front, rather than
  // letting one department's undigitized high-ID ceiling crowd out the others.
  // (Asian Art peaks around 36K and has great coverage there; Drawings and Prints
  // reaches 800K+ but those are recent undigitized acquisitions.)
  const reversed = deptLists.map((ids) => ids.slice().reverse());
  const allIds = [];
  const maxLen = Math.max(...reversed.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of reversed) {
      if (i < list.length) allIds.push(list[i]);
    }
  }
  const ids = limit ? allIds.slice(0, limit) : allIds;

  console.log(`\n  Total IDs available: ${allIds.length.toLocaleString()}`);
  if (limit) console.log(`  Limiting to first ${ids.length.toLocaleString()} (--limit)`);
  console.log(`  Writing to: ${NEW_DB_PATH}`);
  console.log(`  Saving to disk every 500 batches (~12,500 objects)\n`);

  const db = await createDb(NEW_DB_PATH);
  const stats = await processIds(ids, db, { savePath: NEW_DB_PATH, saveEvery: 500 });

  // Final save.
  saveNewDb(db, NEW_DB_PATH);
  db.close();

  console.log('\n  ── Done ────────────────────────────────────────────────────');
  console.log(`    Objects stored:     ${stats.stored.toLocaleString()}`);
  console.log(`    No image / skipped: ${stats.noImage.toLocaleString()}`);
  console.log(`    Not found (404/403): ${stats.notFound.toLocaleString()}`);
  console.log(`    From cache:         ${stats.fromCache.toLocaleString()}`);
  console.log('');

  if (stats.stored < SWAP_THRESHOLD) {
    console.log(`  ✖ Only ${stats.stored} records — below the ${SWAP_THRESHOLD} threshold.`);
    console.log(`    Existing database NOT replaced. Inspect ${NEW_DB_PATH} manually.\n`);
    return;
  }

  if (swap) {
    const backupPath = DB_PATH.replace('.sqlite', '-backup.sqlite');
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
      console.log(`  Backed up existing DB → ${path.basename(backupPath)}`);
    }
    fs.renameSync(NEW_DB_PATH, DB_PATH);
    console.log(`  Swapped: moodboard-new.sqlite → moodboard.sqlite`);
    console.log('  Server restart required to pick up the new database.\n');
  } else {
    console.log(`  New database written to: ${path.basename(NEW_DB_PATH)}`);
    console.log(`  Existing database untouched.`);
    console.log(`  To swap: rename moodboard-new.sqlite → moodboard.sqlite`);
    console.log(`  Or rerun with --swap to do it automatically.\n`);
  }
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    test:  argv.includes('--test'),
    swap:  argv.includes('--swap'),
    limit: null,
  };
  const li = argv.indexOf('--limit');
  if (li !== -1 && argv[li + 1]) {
    const n = parseInt(argv[li + 1], 10);
    if (Number.isFinite(n) && n > 0) args.limit = n;
  }
  return args;
}

(async () => {
  const { test, swap, limit } = parseArgs(process.argv);
  try {
    if (test) {
      await runTest();
    } else {
      await runFull({ swap, limit });
    }
  } catch (err) {
    console.error('\nPipeline failed:', err.message);
    process.exit(1);
  }
})();
