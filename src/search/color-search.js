/**
 * color-search.js — in-memory color index + deltaE search.
 *
 * At server startup, call loadColors(db) once to build the index.
 * Then call searchByColor(labColor, limit) to get ranked results.
 *
 * The index is a Map:  object_id → [ { l, a, b, weight }, … ]
 *
 * Scoring: for each candidate, compute the weighted sum of deltaE distances
 * between the query color and each of the artwork's extracted cluster colors,
 * weighted by cluster weight.  Lower score = closer color match.
 */

'use strict';

// In-memory index: Map<number, Array<{l, a, b, weight}>>
let colorIndex = new Map();
// Parallel lookup for object metadata needed by the search results
let metaIndex = new Map(); // object_id → { title, artist_name, museum, primary_image_small, primary_image, link_resource }

/**
 * Build the in-memory color index from the sql.js Database.
 * Call once at server startup.
 *
 * @param {import('sql.js').Database} db
 */
function loadColors(db) {
  colorIndex = new Map();
  metaIndex  = new Map();

  // Load all color rows
  const colorStmt = db.prepare(
    'SELECT object_id, l, a, b, weight FROM colors ORDER BY object_id'
  );
  colorStmt.bind([]);
  while (colorStmt.step()) {
    const row = colorStmt.getAsObject();
    const id = row.object_id;
    if (!colorIndex.has(id)) colorIndex.set(id, []);
    colorIndex.get(id).push({ l: row.l, a: row.a, b: row.b, weight: row.weight });
  }
  colorStmt.free();

  if (colorIndex.size === 0) {
    console.log('[color-search] No color data found — color search will return empty results.');
    return;
  }

  // Load metadata via JOIN (avoids a huge IN clause when index is large)
  const metaStmt = db.prepare(
    `SELECT DISTINCT o.object_id, o.title, o.artist_name,
            o.primary_image_small, o.primary_image, o.link_resource
     FROM   objects o
     INNER JOIN colors c ON c.object_id = o.object_id`
  );
  metaStmt.bind([]);
  while (metaStmt.step()) {
    const row = metaStmt.getAsObject();
    metaIndex.set(row.object_id, row);
  }
  metaStmt.free();

  console.log(`[color-search] Loaded ${colorIndex.size} objects into color index.`);
}

/**
 * Convert a hex color string to CIELAB.
 *
 * @param {string} hex — e.g. '#8B4513' or '8B4513'
 * @returns {{ l: number, a: number, b: number }}
 */
function hexToLab(hex) {
  hex = hex.replace(/^#/, '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return rgbToLab(r, g, b);
}

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
  return { l: L, a, b: bv };
}

/**
 * Search for artworks by color.
 *
 * @param {{ l: number, a: number, b: number }} labColor
 * @param {number} limit — max results to return (default 48)
 * @returns {Array<object>} — ranked artwork objects, closest color first
 */
function searchByColor(labColor, limit = 48) {
  if (colorIndex.size === 0) return [];

  const { l: ql, a: qa, b: qb } = labColor;
  const scored = [];

  for (const [objectId, clusters] of colorIndex) {
    // Weighted deltaE: sum of (weight_i * distance_i)
    let score = 0;
    for (const cluster of clusters) {
      const dl = ql - cluster.l;
      const da = qa - cluster.a;
      const db = qb - cluster.b;
      const deltaE = Math.sqrt(dl * dl + da * da + db * db);
      score += cluster.weight * deltaE;
    }
    scored.push({ objectId, score });
  }

  // Sort ascending (lower score = closer match)
  scored.sort((a, b) => a.score - b.score);

  // Build result objects
  const results = [];
  for (let i = 0; i < Math.min(scored.length, limit); i++) {
    const { objectId } = scored[i];
    const meta = metaIndex.get(objectId);
    if (!meta) continue;
    results.push({
      object_id:           objectId,
      title:               meta.title,
      artist_name:         meta.artist_name,
      museum:              'The Met',
      primary_image_small: meta.primary_image_small,
      primary_image:       meta.primary_image,
      link_resource:       meta.link_resource,
    });
  }

  return results;
}

/**
 * Compute the color proximity score for a single artwork.
 * Returns null if the artwork has no color data.
 * Lower score = closer color match (same scale as searchByColor).
 */
function getColorScore(objectId, labColor) {
  const clusters = colorIndex.get(objectId);
  if (!clusters || clusters.length === 0) return null;
  const { l: ql, a: qa, b: qb } = labColor;
  let score = 0;
  for (const cluster of clusters) {
    const dl = ql - cluster.l;
    const da = qa - cluster.a;
    const db = qb - cluster.b;
    score += cluster.weight * Math.sqrt(dl * dl + da * da + db * db);
  }
  return score;
}

/**
 * Re-rank an array of theme results by blending thematic position with
 * color proximity.  Strong theme fits drift down only slightly when the
 * color doesn't match; on-theme + on-color results rise to the top.
 *
 * Scoring: 70% thematic rank + 30% color proximity (both normalised to [0,1]).
 * Artworks with no color data are treated as neutral (0.5) on the color axis.
 *
 * @param {Array<object>} results   - Ordered theme results (best theme first).
 * @param {string}        colorHex  - Target hex color, e.g. '#0047AB'.
 * @returns {Array<object>}          - Re-ordered results array.
 */
function reRankByColor(results, colorHex) {
  if (!results.length || !colorHex) return results;

  const labColor = hexToLab(colorHex);
  const n = results.length;

  const withScores = results.map((r, i) => {
    const thematicScore = 1 - i / n;
    const rawColorScore = getColorScore(r.object_id, labColor);
    return { r, thematicScore, rawColorScore };
  });

  const validScores = withScores.map((x) => x.rawColorScore).filter((s) => s !== null);
  if (validScores.length === 0) return results;

  const minScore = Math.min(...validScores);
  const maxScore = Math.max(...validScores);
  const range = maxScore - minScore || 1;

  const scored = withScores.map(({ r, thematicScore, rawColorScore }) => {
    const colorNorm = rawColorScore === null
      ? 0.5
      : 1 - (rawColorScore - minScore) / range;
    return { r, score: 0.7 * thematicScore + 0.3 * colorNorm };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.r);
}

module.exports = { loadColors, searchByColor, hexToLab, reRankByColor };
