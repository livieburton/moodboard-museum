/**
 * Thin wrapper around sql.js (SQLite compiled to WebAssembly).
 *
 * Why this file exists: sql.js keeps the database in memory and leaves
 * persistence to you — you call db.export() to get bytes and write them
 * yourself. This module hides that so the rest of the pipeline just calls
 * openDb() / saveDb(). It's also the ONLY file that knows we're using
 * sql.js — switching to better-sqlite3 later (for a conventional Node
 * server) means rewriting just this file.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'moodboard.sqlite');

/**
 * Open the database. If a file already exists on disk, load it; otherwise
 * start an empty in-memory database.
 * @returns {Promise<{db: object, SQL: object}>}
 */
async function openDb() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  return { db, SQL };
}

/**
 * Persist the in-memory database to disk as a .sqlite file.
 * @param {object} db - a sql.js Database instance
 */
function saveDb(db) {
  const data = db.export();              // Uint8Array of the whole DB
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

module.exports = { openDb, saveDb, DB_PATH };
