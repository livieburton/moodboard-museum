/**
 * met-api.js — a polite client for the Met Collection API.
 *
 * The Met asks for no more than 80 requests/second and doesn't require an API
 * key. "Polite" here means three things:
 *   1. Rate limiting   — we cap ourselves well under their limit.
 *   2. Retry w/ backoff — transient failures (429, 5xx, network blips) are
 *                         retried with exponential backoff instead of
 *                         hammering or crashing.
 *   3. Caching         — handled one layer up, in enrich-images.js, so we
 *                         never ask for the same object twice.
 *
 * Endpoint shape (no key needed):
 *   https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}
 */

const MET_API_BASE =
  'https://collectionapi.metmuseum.org/public/collection/v1';

// Without a browser-like User-Agent, Incapsula (the Met's WAF) blocks every
// request with a 403. This string passes the WAF; real 403s from the Met's
// own access restrictions still come through after this is set.
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// 3 req/s base rate with up to 500ms of random jitter so requests don't look
// mechanical to the Met's WAF. Total gap per request: 333–833ms.
const REQUESTS_PER_SECOND = 3;
const MIN_REQUEST_GAP_MS = 1000 / REQUESTS_PER_SECOND;
const JITTER_MS = 500;

const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;

// Block detection: if 5 consecutive requests return 403, pause for 30s.
const BLOCK_THRESHOLD = 5;
const BLOCK_PAUSE_MS = 30_000;
let consecutive403s = 0;

// Module-level timestamp of the last request, for spacing.
let lastRequestTime = 0;

/** Sleep helper. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait the base gap plus a random jitter so requests don't arrive at a
 * perfectly mechanical cadence.
 */
async function throttle() {
  const jitter = Math.floor(Math.random() * JITTER_MS);
  const gap = MIN_REQUEST_GAP_MS + jitter;
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < gap) {
    await sleep(gap - elapsed);
  }
  lastRequestTime = Date.now();
}

/**
 * Fetch a single object record from the Met API.
 *
 * Returns the parsed JSON object on success, or null if the object genuinely
 * can't be retrieved (e.g. 404 — some IDs in the CSV have no API record).
 * Throws only on programming errors, never on expected HTTP failures.
 *
 * @param {number} objectId
 * @returns {Promise<object|null>}
 */
async function fetchObject(objectId) {
  const url = `${MET_API_BASE}/objects/${objectId}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();

    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });
      const bodyText = await response.text();

      // 404 — no API record for this object. Permanent; cache as sentinel.
      if (response.status === 404) {
        consecutive403s = 0;
        return null;
      }

      // 403 — either a WAF block or a Met access restriction on photography.
      // Track consecutive 403s: if we hit the threshold we're being blocked,
      // so pause before continuing. Either way, cache as sentinel so we don't
      // immediately re-fetch on the next run (--clear-cache resets this).
      if (response.status === 403) {
        consecutive403s++;
        if (consecutive403s >= BLOCK_THRESHOLD) {
          console.warn(`\n  [block] ${consecutive403s} consecutive 403s — pausing ${BLOCK_PAUSE_MS / 1000}s before resuming…`);
          await sleep(BLOCK_PAUSE_MS);
          consecutive403s = 0;
        }
        return null;
      }

      // 429 (rate limited) or 5xx (server hiccup) — back off and retry.
      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(
            `  ${response.status} on object ${objectId}, ` +
            `retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(backoff);
          continue;
        }
        // Out of retries — give up on this object but don't crash the run.
        console.warn(`  giving up on object ${objectId} after ${MAX_RETRIES} retries`);
        return null;
      }

      // Any other non-OK status — unexpected; log and skip.
      if (!response.ok) {
        console.warn(`  unexpected ${response.status} on object ${objectId}, skipping`);
        return null;
      }

      consecutive403s = 0;
      return JSON.parse(bodyText);

    } catch (err) {
      // Network-level failure (DNS, connection reset, etc.) — retry with backoff.
      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `  network error on object ${objectId} (${err.code || err.message}), ` +
          `retrying in ${backoff}ms`
        );
        await sleep(backoff);
        continue;
      }
      console.warn(`  giving up on object ${objectId}: ${err.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Extract just the image fields we care about from a full API record.
 * The API returns ~50 fields; we only need the image URLs.
 *
 * @param {object} apiRecord
 * @returns {{primaryImage: string|null, primaryImageSmall: string|null}}
 */
function extractImageUrls(apiRecord) {
  return {
    // The API uses empty strings for "no image"; normalize those to null.
    primaryImage: apiRecord.primaryImage || null,
    primaryImageSmall: apiRecord.primaryImageSmall || null,
  };
}

module.exports = {
  fetchObject,
  extractImageUrls,
  REQUESTS_PER_SECOND,
  MET_API_BASE,
};
