/**
 * diagnose-european-paintings.js
 *
 * READ-ONLY diagnostic. Samples 100 European Paintings objects with no image,
 * hits the Met API for each one, and reports what's causing the failures.
 *
 * Usage:
 *   node scripts/diagnose-european-paintings.js
 *
 * Does not write to the database or cache.
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/moodboard.sqlite');
const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const DELAY_MS = 150;
const SAMPLE_SIZE = 100;

// Same User-Agent that bypasses Incapsula WAF in the main pipeline.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dateBucket(beginDate, endDate) {
  const year = beginDate ?? endDate ?? null;
  if (year === null) return 'unknown date';
  if (year < 1900) return 'pre-1900';
  if (year < 1950) return '1900–1950';
  return '1950+';
}

async function main() {
  const db = new DatabaseSync(DB_PATH);

  const rows = db.prepare(`
    SELECT object_id, title, begin_date, end_date, object_date
    FROM objects
    WHERE department = 'European Paintings'
      AND (primary_image IS NULL OR primary_image = '')
      AND is_public_domain = 1
    ORDER BY RANDOM()
    LIMIT ?
  `).all(SAMPLE_SIZE);

  db.close();

  if (rows.length === 0) {
    console.log('No European Paintings objects without images found.');
    return;
  }

  console.log(`\nDiagnosing ${rows.length} European Paintings objects (no image, public domain)\n`);
  console.log('─'.repeat(70));

  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const { object_id, title, begin_date, end_date, object_date } = rows[i];
    await sleep(DELAY_MS);

    let status = null;
    let hasPrimaryImage = false;
    let error = null;

    try {
      const res = await fetch(`${MET_API_BASE}/objects/${object_id}`, { headers: HEADERS });
      status = res.status;

      if (res.ok) {
        const json = await res.json();
        hasPrimaryImage = !!(json.primaryImage && json.primaryImage.trim());
      }
    } catch (err) {
      error = err.message;
      status = 'network_error';
    }

    const bucket = dateBucket(begin_date, end_date);
    const label = hasPrimaryImage ? '  has image' : '';
    console.log(`  [${i + 1}/${rows.length}] ${object_id}  ${String(status).padEnd(4)}  ${bucket.padEnd(12)}  ${(object_date || '').padEnd(12)}  ${(title || '').slice(0, 45)}${label}`);

    results.push({ object_id, title, status, hasPrimaryImage, begin_date, end_date, object_date, error });
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(70));
  console.log('SUMMARY\n');

  const counts = {};
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  console.log('Status code breakdown:');
  for (const [code, n] of Object.entries(counts).sort()) {
    console.log(`  ${String(code).padEnd(15)} ${n}`);
  }

  // 200s: how many actually had an image
  const ok = results.filter((r) => r.status === 200);
  if (ok.length > 0) {
    const withImage = ok.filter((r) => r.hasPrimaryImage).length;
    const noImage = ok.length - withImage;
    console.log(`\n200s — image present: ${withImage}, no image in record: ${noImage}`);
    if (noImage > 0) {
      console.log('  (These are public domain but the Met has no photo — nothing we can do)');
    }
  }

  // 403s: date range distribution
  const forbidden = results.filter((r) => r.status === 403);
  if (forbidden.length > 0) {
    console.log(`\n403s — date range distribution (tests "20th century = restricted" hypothesis):`);
    const buckets = {};
    for (const r of forbidden) {
      const b = dateBucket(r.begin_date, r.end_date);
      buckets[b] = (buckets[b] || 0) + 1;
    }
    for (const [b, n] of Object.entries(buckets)) {
      console.log(`  ${b.padEnd(15)} ${n}`);
    }

    console.log('\n403s — sample of up to 10 works:');
    forbidden.slice(0, 10).forEach((r) => {
      console.log(`  ${r.object_id}  ${(r.object_date || 'n/d').padEnd(15)}  ${(r.title || '(untitled)').slice(0, 60)}`);
    });
  }

  // Any unexpected status codes
  const other = results.filter((r) => r.status !== 200 && r.status !== 403 && r.status !== 404 && r.status !== 'network_error');
  if (other.length > 0) {
    console.log(`\nOther status codes:`);
    other.forEach((r) => console.log(`  ${r.object_id}  ${r.status}  ${r.title || ''}`));
  }

  const networkErrors = results.filter((r) => r.status === 'network_error');
  if (networkErrors.length > 0) {
    console.log(`\nNetwork errors: ${networkErrors.length}`);
    networkErrors.slice(0, 5).forEach((r) => console.log(`  ${r.object_id}  ${r.error}`));
  }

  console.log('\n' + '─'.repeat(70));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
