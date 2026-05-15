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

// We self-limit to 10 req/s — far under the Met's stated 80/s ceiling. This
// project is never in a hurry: a gentle pace is kinder to a free public API
// and the difference between a 2-minute and a 12-minute build doesn't matter
// for a dataset you fetch once and cache.
const REQUESTS_PER_SECOND = 10;
const MIN_REQUEST_GAP_MS = 1000 / REQUESTS_PER_SECOND;

const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;

// Module-level timestamp of the last request, for spacing.
let lastRequestTime = 0;

/** Sleep helper. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait just long enough that we don't exceed our self-imposed rate limit.
 */
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
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
      const response = await fetch(url);

      // 404 — the object has no API record. Expected for some CSV rows.
      // 403 — access restricted despite public-domain flag in the CSV
      //        (Met holds rights on the photography for some objects).
      // Both are permanent: return null so the cache layer writes a sentinel
      // and we never re-fetch this object.
      if (response.status === 404 || response.status === 403) {
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

      return await response.json();

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
