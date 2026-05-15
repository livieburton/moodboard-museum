/**
 * build-db.js — the data foundation pipeline.
 *
 *   CSV (Met bulk export)  ->  filter to public domain  ->  SQLite
 *
 * Usage:
 *   node src/pipeline/build-db.js [path-to-csv]
 *
 * Defaults to the bundled sample fixture so it runs out of the box. Point it
 * at the real MetObjects.csv (from github.com/metmuseum/openaccess) to build
 * the full database:
 *   node src/pipeline/build-db.js ~/Downloads/MetObjects.csv
 *
 * The public-domain filter is applied HERE, at ingest. Nothing that isn't
 * CC0 ever makes it into the database, so every downstream query, API call,
 * and UI render inherits that guarantee for free.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { SCHEMA, CSV_COLUMN_MAP } = require('./schema');
const { openDb, saveDb, DB_PATH } = require('./db');

const DEFAULT_CSV = path.join(__dirname, '..', 'data', 'sample-metobjects.csv');

// --- small parsing helpers -------------------------------------------------

// The Met CSV encodes booleans as the strings "True" / "False".
const toBool = (v) => (v === 'True' ? 1 : 0);

// Numeric date fields can be empty or negative (BC). Empty -> null.
const toInt = (v) => {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

// Empty strings -> null, so the DB has clean NULLs instead of "".
const clean = (v) => {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

// --- the pipeline ----------------------------------------------------------

async function buildDatabase(csvPath) {
  console.log(`\nMoodboard Museum — data pipeline`);
  console.log(`Source CSV: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`\n  ERROR: CSV not found at ${csvPath}`);
    console.error(`  Download the real one from https://github.com/metmuseum/openaccess`);
    console.error(`  or run with no argument to use the bundled sample.\n`);
    process.exit(1);
  }

  // Start from a clean database every build — delete any existing file.
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const { db } = await openDb();
  db.run(SCHEMA);

  // Prepared statements, reused for every row (fast).
  const objectColumns = Object.keys(CSV_COLUMN_MAP);
  const placeholders = objectColumns.map(() => '?').join(', ');
  const insertObject = db.prepare(
    `INSERT OR REPLACE INTO objects (${objectColumns.join(', ')}) VALUES (${placeholders})`
  );
  const insertTag = db.prepare(
    `INSERT INTO object_tags (object_id, tag) VALUES (?, ?)`
  );

  const stats = { read: 0, kept: 0, skippedNotPD: 0, skippedNoId: 0, tags: 0 };

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,           // each record is an object keyed by CSV header
      skip_empty_lines: true,
      relax_quotes: true,      // museum CSVs have messy quoting
      relax_column_count: true // ...and occasionally ragged rows
    })
  );

  db.run('BEGIN');
  for await (const row of parser) {
    stats.read++;

    // FILTER 1: public domain only. This is the whole safety guarantee.
    if (row['Is Public Domain'] !== 'True') {
      stats.skippedNotPD++;
      continue;
    }

    // FILTER 2: must have a usable object ID (it's our primary key).
    const objectId = toInt(row['Object ID']);
    if (objectId === null) {
      stats.skippedNoId++;
      continue;
    }

    // Map CSV columns -> our schema columns, cleaning as we go.
    const values = objectColumns.map((col) => {
      const csvValue = row[CSV_COLUMN_MAP[col]];
      if (col === 'object_id' || col === 'begin_date' || col === 'end_date') {
        return toInt(csvValue);
      }
      if (col === 'is_highlight' || col === 'is_public_domain') {
        return toBool(csvValue);
      }
      return clean(csvValue);
    });
    insertObject.run(values);
    stats.kept++;

    // Tags ship pipe-delimited, e.g. "Cypresses|Wheat|Landscapes".
    // Explode them into the object_tags table.
    const rawTags = row['Tags'];
    if (rawTags && rawTags.trim() !== '') {
      for (const tag of rawTags.split('|')) {
        const t = tag.trim();
        if (t !== '') {
          insertTag.run([objectId, t]);
          stats.tags++;
        }
      }
    }
  }
  db.run('COMMIT');

  insertObject.free();
  insertTag.free();

  saveDb(db);
  db.close();

  // --- report -------------------------------------------------------------
  console.log(`\n  Rows read from CSV:        ${stats.read.toLocaleString()}`);
  console.log(`  Kept (public domain):      ${stats.kept.toLocaleString()}`);
  console.log(`  Skipped (not public domain): ${stats.skippedNotPD.toLocaleString()}`);
  if (stats.skippedNoId) {
    console.log(`  Skipped (no object ID):    ${stats.skippedNoId.toLocaleString()}`);
  }
  console.log(`  Tag links inserted:        ${stats.tags.toLocaleString()}`);
  console.log(`\n  Database written to: ${DB_PATH}\n`);

  return stats;
}

// Run if called directly (not when require()'d by tests).
if (require.main === module) {
  const csvPath = process.argv[2] || DEFAULT_CSV;
  buildDatabase(csvPath).catch((err) => {
    console.error('Pipeline failed:', err);
    process.exit(1);
  });
}

module.exports = { buildDatabase };
