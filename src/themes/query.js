/**
 * query.js — turns a theme recipe into database results.
 *
 * The only entry point is queryTheme(). It validates the recipe through
 * theme-recipe.js (the same gate used for LLM-generated themes), builds
 * parameterized SQL, and attaches a plain-language matchReason to every
 * result so the UI can display it without extra work.
 */

const { openDb } = require('../pipeline/db');
const { validateRecipe, GLOBAL_EXCLUDE_TAGS } = require('./theme-recipe');

// Objects excluded from all results regardless of recipe or tags.
// Used for works whose subject matter is inappropriate for a moodboard
// context but cannot be caught by tag filtering alone.
const BLOCKED_OBJECT_IDS = [
  11116,  // "Dressing for the Carnival" — Winslow Homer; depicts Black Americans in a way that reads as slavery imagery without context
];

const RETURN_LIMIT = 50;
const FETCH_LIMIT = 250; // fetch a larger pool so diversification has material to work with
const DIVERSIFY_THRESHOLD = 10;

/**
 * Run a theme query against the database.
 *
 * @param {object} recipeInput   - Raw recipe object (will be validated).
 * @param {object} [options]
 * @param {number} [options.limit=50] - Max results to return after diversification.
 * @returns {Promise<object>}    - { theme, description, rationale, matchReason,
 *                                   count, results, warnings }
 */
async function queryTheme(recipeInput, { limit = RETURN_LIMIT } = {}) {
  const validation = validateRecipe(recipeInput);
  if (!validation.valid) {
    throw new Error(`Invalid recipe: ${validation.errors.join('; ')}`);
  }

  const { recipe } = validation;
  const { db } = await openDb();

  const { sql, params } = buildQuery(recipe.filters, FETCH_LIMIT);
  const rows = execQuery(db, sql, params);
  const matchReason = recipe.rationale.join(' · ');

  const diversified = diversify(rows, limit);

  return {
    theme: recipe.label,
    description: recipe.description,
    rationale: recipe.rationale,
    matchReason,
    count: diversified.length,
    results: diversified.map((row) => ({
      ...row,
      tags: row.tags ? row.tags.split('|') : [],
      matchReason,
    })),
    warnings: validation.warnings || [],
  };
}

// --- diversification --------------------------------------------------------

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Coarsen medium/classification into a small set of buckets so the
 * round-robin can enforce medium variety without needing to know every
 * possible medium string in the Met's data.
 */
function mediumBucket(row) {
  const cls = (row.classification || '').toLowerCase();
  const med = (row.medium || '').toLowerCase();
  if (cls.includes('painting')) return 'painting';
  if (cls.includes('photograph')) return 'photograph';
  if (cls.includes('sculpture') || cls.includes('ceramic') ||
      cls.includes('glass') || cls.includes('metal') ||
      cls.includes('textile') || cls.includes('furniture')) return 'object';
  if (/engraving|etching|lithograph|woodcut|mezzotint|aquatint/.test(med) ||
      cls.includes('print')) return 'print';
  if (/chalk|charcoal|pencil|wash|pastel/.test(med) ||
      cls.includes('drawing')) return 'drawing';
  return 'other';
}

/**
 * Normalize a title to a short subject key so that works depicting the
 * same person or scene cluster together. Strips common portrait prefixes,
 * punctuation, and truncates to 28 chars.
 */
function subjectKey(row, index) {
  const raw = (row.title || '').trim();
  if (!raw) return `__notitle_${index}`;
  const normalized = raw
    .replace(/^(portrait of|study of|head of|bust of|figure of|effigy of|sketch of)\s+/i, '')
    .replace(/[,;:()\[\]'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 28);
  return normalized || `__notitle_${index}`;
}

/**
 * Reorder rows so results feel varied from the first screen.
 *
 * Groups by a composite (subject, medium) key so that:
 *   - The same subject (e.g. Mary Queen of Scots) never runs consecutively
 *     regardless of how many different artists depicted her
 *   - The same medium (e.g. print/engraving) doesn't dominate the first page
 *     even when prints vastly outnumber paintings in the match set
 *
 * Round-robin takes one artwork from each group per pass, skipping exhausted
 * groups, so the first screen is maximally varied and later results degrade
 * naturally as smaller groups run out.
 */
function diversify(rows, returnLimit) {
  if (rows.length <= DIVERSIFY_THRESHOLD) {
    return shuffle(rows).slice(0, returnLimit);
  }

  // Build composite (subject, medium) groups.
  const groupMap = new Map();
  rows.forEach((row, i) => {
    const key = `${subjectKey(row, i)}|${mediumBucket(row)}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(row);
  });

  // Shuffle within each group, then shuffle group order.
  const groups = shuffle([...groupMap.values()].map((g) => shuffle(g)));

  // Round-robin: one from each group per pass, skip exhausted groups.
  const result = [];
  const cursors = groups.map(() => 0);

  outer: while (true) {
    let anyAdded = false;
    for (let i = 0; i < groups.length; i++) {
      if (cursors[i] < groups[i].length) {
        result.push(groups[i][cursors[i]++]);
        anyAdded = true;
        if (result.length >= returnLimit) break outer;
      }
    }
    if (!anyAdded) break;
  }

  return result;
}

function buildQuery(filters, limit) {
  const params = [];
  // Always enforced — belt-and-suspenders on top of the ingest-time guarantee.
  const conditions = ['o.is_public_domain = 1', 'o.primary_image IS NOT NULL'];
  if (BLOCKED_OBJECT_IDS.length > 0) {
    conditions.push(`o.object_id NOT IN (${BLOCKED_OBJECT_IDS.join(', ')})`);
  }
  let tagMatchJoin = '';

  // Tag matching: a subquery counts how many recipe tags each object carries.
  // Objects with zero matches are excluded; those with more rise in ranking.
  if (filters.tags && filters.tags.length > 0) {
    const phs = filters.tags.map(() => '?').join(', ');
    tagMatchJoin = `
      LEFT JOIN (
        SELECT object_id, COUNT(*) AS tag_match_count
        FROM object_tags
        WHERE tag IN (${phs})
        GROUP BY object_id
      ) tm ON o.object_id = tm.object_id`;
    params.push(...filters.tags);
    conditions.push('COALESCE(tm.tag_match_count, 0) >= 1');
  }

  // Exclude any object that carries at least one excluded tag.
  // Global excludes are merged with recipe-level excludes and deduplicated.
  const allExcludes = [
    ...GLOBAL_EXCLUDE_TAGS,
    ...(filters.excludeTags || []),
  ].filter((tag, i, arr) => arr.indexOf(tag) === i);
  if (allExcludes.length > 0) {
    const phs = allExcludes.map(() => '?').join(', ');
    conditions.push(
      `o.object_id NOT IN (SELECT object_id FROM object_tags WHERE tag IN (${phs}))`
    );
    params.push(...allExcludes);
  }

  if (filters.classifications) {
    const phs = filters.classifications.map(() => '?').join(', ');
    conditions.push(`(o.classification IN (${phs}) OR o.classification IS NULL)`);
    params.push(...filters.classifications);
  }

  if (filters.departments) {
    const phs = filters.departments.map(() => '?').join(', ');
    conditions.push(`o.department IN (${phs})`);
    params.push(...filters.departments);
  }

  if (filters.cultures) {
    const phs = filters.cultures.map(() => '?').join(', ');
    conditions.push(`o.culture IN (${phs})`);
    params.push(...filters.cultures);
  }

  // Overlap semantics: the artwork's date range must intersect the recipe's.
  // Null dates are treated permissively — they don't disqualify an object.
  if (filters.dateRange) {
    conditions.push('(o.begin_date IS NULL OR o.begin_date <= ?)');
    conditions.push('(o.end_date IS NULL OR o.end_date >= ?)');
    params.push(filters.dateRange.end, filters.dateRange.start);
  }

  if (filters.mediumKeywords) {
    const medClauses = filters.mediumKeywords.map(() => 'o.medium LIKE ?');
    conditions.push(`(${medClauses.join(' OR ')})`);
    params.push(...filters.mediumKeywords.map((k) => `%${k}%`));
  }

  if (filters.isHighlight) {
    conditions.push('o.is_highlight = 1');
  }

  // When there are no tags, emit a literal '0' wrapped in parens so SQLite
  // treats it as a value expression, not a column-position index.
  const tagScoreExpr = filters.tags
    ? 'COALESCE(tm.tag_match_count, 0)'
    : '(0)';
  const where = conditions.length > 0
    ? `WHERE ${conditions.join('\n    AND ')}`
    : '';

  const sql = `
    SELECT
      o.object_id,
      o.title,
      o.artist_name,
      o.artist_nationality,
      o.object_date,
      o.begin_date,
      o.end_date,
      o.medium,
      o.classification,
      o.department,
      o.culture,
      o.is_highlight,
      o.link_resource,
      o.is_public_domain,
      o.primary_image,
      o.primary_image_small,
      all_tags.tags,
      ${tagScoreExpr} AS tag_match_count
    FROM objects o
    ${tagMatchJoin}
    LEFT JOIN (
      SELECT object_id, GROUP_CONCAT(tag, '|') AS tags
      FROM object_tags
      GROUP BY object_id
    ) all_tags ON o.object_id = all_tags.object_id
    ${where}
    ORDER BY tag_match_count DESC, o.is_highlight DESC
    LIMIT ?
  `;
  params.push(limit);

  return { sql, params };
}

function execQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { queryTheme };
