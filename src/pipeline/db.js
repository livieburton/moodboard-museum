const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'moodboard.sqlite');
const GZ_PATH = path.join(__dirname, '..', '..', 'data', 'moodboard.sqlite.snapshot.gz');

const gunzip = promisify(zlib.gunzip);

// Cached after first load — the DB is 118 MB so we only want to load it once.
let _db = null;
let _SQL = null;

async function openDb() {
  if (_db) return { db: _db, SQL: _SQL };

  _SQL = await initSqlJs();

  let fileBuffer;

  if (fs.existsSync(DB_PATH)) {
    console.log('[db] Loading from .sqlite file…');
    fileBuffer = fs.readFileSync(DB_PATH);
  } else if (fs.existsSync(GZ_PATH)) {
    // Decompress into memory — works even on read-only filesystems.
    console.log('[db] .sqlite not found, decompressing from .gz snapshot…');
    const compressed = fs.readFileSync(GZ_PATH);
    fileBuffer = await gunzip(compressed);
    // Try to cache to disk so subsequent startups are faster; ignore if read-only.
    try { fs.writeFileSync(DB_PATH, fileBuffer); } catch (_) {}
  } else {
    throw new Error(`Database not found. Checked:\n  ${DB_PATH}\n  ${GZ_PATH}`);
  }

  _db = new _SQL.Database(fileBuffer);
  console.log('[db] Database ready.');
  return { db: _db, SQL: _SQL };
}

function saveDb(db) {
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

module.exports = { openDb, saveDb, DB_PATH };
