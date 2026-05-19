/**
 * migrate-add-colors.js — adds the `colors` table to the existing SQLite DB.
 *
 * Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).
 *
 * Usage:
 *   node src/pipeline/migrate-add-colors.js
 *   npm run migrate-colors
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./db');

const db = new DatabaseSync(DB_PATH, { timeout: 30000 });
db.exec('PRAGMA busy_timeout = 30000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS colors (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id INTEGER NOT NULL,
    l         REAL    NOT NULL,
    a         REAL    NOT NULL,
    b         REAL    NOT NULL,
    weight    REAL    NOT NULL,
    hex       TEXT    NOT NULL
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_colors_object_id ON colors (object_id);`);

db.close();
console.log('Migration complete: colors table ready.');
