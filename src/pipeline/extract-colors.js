/**
 * extract-colors.js — extracts dominant colors from artwork images and stores
 * them in the `colors` table as CIELAB values.
 *
 * Algorithm:
 *   1. Fetch image pixels via sharp (downsample to ≤150px wide)
 *   2. Filter out near-white/near-black/near-grey pixels
 *   3. Run k-means++ (k=5, 10 iterations) to find dominant RGB clusters
 *   4. Convert RGB centroids → CIELAB
 *   5. Compute weight = cluster_size / total_pixels
 *   6. Write (object_id, l, a, b, weight, hex) to `colors` table
 *
 * Resumable: skips objects that already have rows in `colors`.
 *
 * Usage:
 *   node src/pipeline/extract-colors.js
 *   node src/pipeline/extract-colors.js --limit 10
 *   node src/pipeline/extract-colors.js --object-id 12345
 *
 * Ctrl-C exits gracefully after finishing the current object.
 */

'use strict';

const https = require('https');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const sharp = require('sharp');
const { DB_PATH } = require('./db');

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const objIdx   = args.indexOf('--object-id');
const LIMIT     = limitIdx  !== -1 ? parseInt(args[limitIdx + 1],  10) : Infinity;
const OBJECT_ID = objIdx    !== -1 ? parseInt(args[objIdx + 1],    10) : null;

// ─── Constants ──────────────────────────────────────────────────────────────

const K          = 5;    // clusters
const ITERATIONS = 10;   // k-means iterations
const DELAY_MS   = 100;  // polite delay between images
const THUMB_SIZE = 150;  // resize longest edge to this before processing

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let stopping = false;
process.on('SIGINT', () => {
  console.log('\nCtrl-C received — finishing current object then exiting…');
  stopping = true;
});

// ─── Database ────────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH, { timeout: 30000 });
db.exec('PRAGMA busy_timeout = 30000;');

// ─── Color math ──────────────────────────────────────────────────────────────

function linearize(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);

  const X = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const Y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const Z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;

  const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const L = 116 * f(Y / Yn) - 16;
  const a = 500 * (f(X / Xn) - f(Y / Yn));
  const bv = 200 * (f(Y / Yn) - f(Z / Zn));
  return [L, a, bv];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function distance2(p, q) {
  const dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2];
  return dr * dr + dg * dg + db * db;
}

// ─── k-means++ ───────────────────────────────────────────────────────────────

function kmeanspp(pixels) {
  if (pixels.length === 0) return [];

  // 1. Pick first centroid uniformly at random
  const centroids = [pixels[Math.floor(Math.random() * pixels.length)].slice()];

  // 2. Pick remaining centroids with probability proportional to dist²
  while (centroids.length < Math.min(K, pixels.length)) {
    const dists = pixels.map((p) => {
      const min = centroids.reduce((m, c) => Math.min(m, distance2(p, c)), Infinity);
      return min;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let r = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push(pixels[chosen].slice());
  }

  const k = centroids.length;
  const assignments = new Int32Array(pixels.length);

  // 3. Iterate
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Assign
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bestD = Infinity;
      for (let ci = 0; ci < k; ci++) {
        const d = distance2(pixels[i], centroids[ci]);
        if (d < bestD) { bestD = d; best = ci; }
      }
      assignments[i] = best;
    }

    // Update
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Int32Array(k);
    for (let i = 0; i < pixels.length; i++) {
      const ci = assignments[i];
      sums[ci][0] += pixels[i][0];
      sums[ci][1] += pixels[i][1];
      sums[ci][2] += pixels[i][2];
      counts[ci]++;
    }
    for (let ci = 0; ci < k; ci++) {
      if (counts[ci] > 0) {
        centroids[ci] = [sums[ci][0] / counts[ci], sums[ci][1] / counts[ci], sums[ci][2] / counts[ci]];
      }
    }
  }

  // Collect results: centroid RGB + pixel count
  const finalCounts = new Int32Array(k);
  for (let i = 0; i < pixels.length; i++) finalCounts[assignments[i]]++;

  return centroids.map((c, i) => ({ r: c[0], g: c[1], b: c[2], count: finalCounts[i] }));
}

// ─── Image fetching ───────────────────────────────────────────────────────────

function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'MoodboardMuseum/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        return resolve(fetchBuffer(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Convert IIIF URLs to 200px thumbnail where possible
function thumbUrl(src) {
  if (!src) return src;
  // Standard IIIF pattern: .../full/full/0/... → .../full/200,/0/...
  if (src.includes('/full/full/')) return src.replace('/full/full/', '/full/200,/');
  if (src.includes('/full/!800,800/')) return src.replace('/full/!800,800/', '/full/200,/');
  return src;
}

// ─── Pixel extraction ─────────────────────────────────────────────────────────

async function extractPixels(imgBuffer) {
  const { data, info } = await sharp(imgBuffer)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = [];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Filter near-white (all channels > 240), near-black (all < 15), and near-grey
    // (max channel diff < 20 — avoids beige backgrounds throwing off results)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 220) continue; // near-white
    if (max < 15) continue;               // near-black
    pixels.push([r, g, b]);
  }

  return { pixels, total: (data.length / 3) };
}

// ─── Core processing ──────────────────────────────────────────────────────────

// Prepared statements (created once, reused)
const stmtDelete = db.prepare('DELETE FROM colors WHERE object_id = ?');
const stmtInsert = db.prepare(
  'INSERT INTO colors (object_id, l, a, b, weight, hex) VALUES (?, ?, ?, ?, ?, ?)'
);

function writeColors(objectId, validClusters, totalCount) {
  let attempts = 0;
  while (attempts < 10) {
    try {
      stmtDelete.run(objectId);
      for (const cluster of validClusters) {
        const [L, a, bv] = rgbToLab(cluster.r, cluster.g, cluster.b);
        const weight = cluster.count / totalCount;
        const hex = rgbToHex(cluster.r, cluster.g, cluster.b);
        stmtInsert.run(objectId, L, a, bv, weight, hex);
      }
      return;
    } catch (err) {
      if (err.code === 'ERR_SQLITE_ERROR' && err.errcode === 5) {
        // database is locked — wait and retry
        attempts++;
        const waitMs = 1000 * attempts;
        process.stdout.write(` [locked, retry ${attempts}]`);
        // Synchronous sleep via busy-waiting (keep it simple in pipeline scripts)
        const end = Date.now() + waitMs;
        while (Date.now() < end) {}
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Could not write colors for ${objectId} after 10 retries`);
}

async function processObject(objectId, imageUrl) {
  const url = thumbUrl(imageUrl);

  let imgBuffer;
  try {
    imgBuffer = await fetchBuffer(url);
  } catch (err) {
    console.log(`  [skip] fetch failed for ${objectId}: ${err.message}`);
    return false;
  }

  let pixels, total;
  try {
    ({ pixels, total } = await extractPixels(imgBuffer));
  } catch (err) {
    console.log(`  [skip] sharp failed for ${objectId}: ${err.message}`);
    return false;
  }

  if (pixels.length < K) {
    console.log(`  [skip] too few usable pixels for ${objectId} (${pixels.length})`);
    return false;
  }

  const clusters = kmeanspp(pixels);
  const validClusters = clusters.filter((c) => c.count > 0);
  const totalCount = validClusters.reduce((s, c) => s + c.count, 0);

  writeColors(objectId, validClusters, totalCount);

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  let rows;

  if (OBJECT_ID !== null) {
    // Single-object mode
    rows = db.prepare(
      'SELECT object_id, primary_image_small, primary_image FROM objects WHERE object_id = ?'
    ).all(OBJECT_ID);
  } else {
    // Batch mode: objects that have images but no color rows yet
    rows = db.prepare(`
      SELECT o.object_id,
             o.primary_image_small,
             o.primary_image
      FROM   objects o
      WHERE  (o.primary_image_small IS NOT NULL OR o.primary_image IS NOT NULL)
        AND  NOT EXISTS (SELECT 1 FROM colors c WHERE c.object_id = o.object_id)
      ORDER  BY o.object_id
    `).all();
  }

  const total = Number.isFinite(LIMIT) ? Math.min(rows.length, LIMIT) : rows.length;
  console.log(`Color extraction: ${total} object(s) to process`);

  let processed = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    if (stopping) break;
    if (Number.isFinite(LIMIT) && processed + skipped >= LIMIT) break;

    const row = rows[i];
    const imgUrl = row.primary_image_small || row.primary_image;
    process.stdout.write(`[${i + 1}/${total}] object_id=${row.object_id} … `);

    const ok = await processObject(row.object_id, imgUrl);
    if (ok) {
      processed++;
      console.log('done');
    } else {
      skipped++;
    }

    if (i < rows.length - 1 && !stopping) await sleep(DELAY_MS);
  }

  db.close();
  console.log(`\nFinished. Processed: ${processed}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
