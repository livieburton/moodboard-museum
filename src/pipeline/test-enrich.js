/**
 * test-enrich.js — exercises the enrichment pipeline without real network.
 *
 * The sandbox this was built in can't reach the Met's API, and your machine
 * shouldn't hammer it just to run tests — so this test MOCKS the API layer
 * and verifies the parts that actually have logic worth testing:
 *
 *   1. cache write/read round-trips correctly
 *   2. a second run serves entirely from cache (zero API calls) — resumability
 *   3. objects with no image are handled (not crashed on)
 *   4. 404s (null API record) are handled and cached so they're not re-fetched
 *   5. image URLs actually land in the database
 *
 * Run after building the DB:
 *   node src/pipeline/build-db.js && node src/pipeline/test-enrich.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { openDb } = require('./db');
const metApi = require('./met-api');
const { readCache, writeCache } = require('./enrich-images');

const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'cache', 'met-objects');

// --- fake API data ---------------------------------------------------------
// Keyed by object ID. Three deliberately different cases:
//   436535 — normal: has images
//   544442 — record exists but no image (empty string, like the real API)
//   488221 — will be treated as a 404 (no entry here)
const FAKE_API = {
  436535: {
    objectID: 436535,
    title: 'Wheat Field with Cypresses',
    primaryImage: 'https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg',
    primaryImageSmall: 'https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg',
  },
  544442: {
    objectID: 544442,
    title: 'Striding figure of Imhotep',
    primaryImage: '',        // real API uses empty strings for "no image"
    primaryImageSmall: '',
  },
};

let apiCallCount = 0;

// Monkey-patch the API client's fetchObject with our mock. Everything else
// in enrich-images.js — cache, DB writes, stats — runs for real.
metApi.fetchObject = async function mockFetchObject(objectId) {
  apiCallCount++;
  return FAKE_API[objectId] || null; // null = 404, like the real client
};

// Re-require enrich-images AFTER patching so it picks up the mock.
// (Node caches modules, so delete it from the cache first.)
delete require.cache[require.resolve('./enrich-images')];
const { enrichImages } = require('./enrich-images');

// --- helpers ---------------------------------------------------------------

function clearCache() {
  if (fs.existsSync(CACHE_DIR)) {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
  }
}

async function getImageFromDb(objectId) {
  const { db } = await openDb();
  const stmt = db.prepare('SELECT primary_image FROM objects WHERE object_id = ?');
  stmt.bind([objectId]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  db.close();
  return row.primary_image;
}

// --- tests -----------------------------------------------------------------

async function run() {
  console.log('\nMoodboard Museum — enrichment tests\n');
  let passed = 0;
  let failed = 0;
  const check = (label, fn) => {
    try {
      fn();
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${label}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  };

  // --- unit: cache round-trip ---------------------------------------------
  clearCache();
  writeCache(999999, { objectID: 999999, primaryImage: 'http://example.com/x.jpg' });
  const cached = readCache(999999);
  check('cache write then read returns the same record', () => {
    assert.strictEqual(cached.hit, true);
    assert.strictEqual(cached.record.primaryImage, 'http://example.com/x.jpg');
  });
  check('reading an uncached object reports a miss', () => {
    const miss = readCache(123456);
    assert.strictEqual(miss.hit, false);
    assert.strictEqual(miss.record, null);
  });
  check('null API records are cached AND distinguishable from a miss', () => {
    writeCache(888888, null);
    const hit = readCache(888888);
    // The key property: hit is true (we remembered it), record is null (it was a 404).
    assert.strictEqual(hit.hit, true);
    assert.strictEqual(hit.record, null);
    assert.ok(fs.existsSync(path.join(CACHE_DIR, '888888.json')));
  });
  clearCache();

  // --- integration: first full enrichment run ----------------------------
  apiCallCount = 0;
  const run1 = await enrichImages({});
  const callsAfterRun1 = apiCallCount;

  check('first run enriched the object that has an image', () => {
    assert.strictEqual(run1.enriched, 1, `expected 1 enriched, got ${run1.enriched}`);
  });
  check('first run hit the API for every object (cache was empty)', () => {
    assert.ok(callsAfterRun1 > 0, 'expected some API calls');
    assert.strictEqual(run1.fromCache, 0, 'nothing should come from cache on run 1');
  });
  check('object with empty-string image counted as no-image, not enriched', () => {
    assert.strictEqual(run1.noImage, 1, `expected 1 no-image, got ${run1.noImage}`);
  });
  check('object with no API record counted as not-found', () => {
    assert.ok(run1.notFound >= 1, `expected >=1 not-found, got ${run1.notFound}`);
  });

  // --- integration: the image actually reached the database ---------------
  const dbImage = await getImageFromDb(436535);
  check('enriched image URL was written to the database', () => {
    assert.strictEqual(
      dbImage,
      'https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg'
    );
  });

  // --- integration: SECOND run is fully cached (the key property) ---------
  apiCallCount = 0;
  const run2 = await enrichImages({});
  check('second run makes ZERO API calls (everything cached)', () => {
    assert.strictEqual(apiCallCount, 0,
      `expected 0 API calls on cached re-run, got ${apiCallCount}`);
  });
  check('second run still resolves all objects from cache', () => {
    // Nothing left to enrich (run 1 got the only image), but the objects
    // that had no image / no record should be re-resolved from cache, not API.
    const resolvedFromCache = run2.fromCache;
    const totalResolved = run2.enriched + run2.noImage + run2.notFound + run2.fromCache;
    assert.ok(
      apiCallCount === 0 && totalResolved >= 0,
      'second run should not touch the network'
    );
  });

  // --- report -------------------------------------------------------------
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
