/**
 * query.js — turns a theme recipe into database results.
 *
 * The only entry point is queryTheme(). It validates the recipe through
 * theme-recipe.js (the same gate used for LLM-generated themes), builds
 * parameterized SQL, and attaches a plain-language matchReason to every
 * result so the UI can display it without extra work.
 *
 * Two-query strategy for title keyword matching:
 *   1. Tag-match query  — top FETCH_LIMIT rows by tag_match_count (existing)
 *   2. Title-match query — top FETCH_LIMIT rows matching title LIKE conditions
 *      (only runs when recipe has titleKeywords; excludes IDs from query 1)
 * Both pools are merged, scored with Porter stemming, re-ranked by
 * (tag_match_count + title_match_count), then passed to diversify().
 * This ensures title-relevant works aren't buried by the tag-score cutoff.
 */

const { PorterStemmer } = require('natural');
const { openDb } = require('../pipeline/db');
const { validateRecipe, GLOBAL_EXCLUDE_TAGS } = require('./theme-recipe');

// Objects excluded from all results regardless of recipe or tags.
const BLOCKED_OBJECT_IDS = [
  11116,  // "Dressing for the Carnival" — Winslow Homer; depicts Black Americans in a way that reads as slavery imagery without context
];

const RETURN_LIMIT = 50;
const FETCH_LIMIT = 250;
const DIVERSIFY_THRESHOLD = 10;

// --- title keyword stemming -------------------------------------------------

function tokenizeAndStem(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => PorterStemmer.stem(w));
}

/**
 * Pre-process titleKeywords into arrays of stems.
 * Multi-word keywords (e.g. "night sky") become [stem1, stem2] —
 * ALL component stems must appear in the title for a match.
 */
function buildKeywordStemGroups(keywords) {
  return keywords.map((kw) =>
    kw.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => PorterStemmer.stem(w))
  );
}

/**
 * Count how many keyword groups have ALL their stems present in the
 * stemmed title tokens. Returns an integer ≥ 0.
 */
function computeTitleMatchCount(title, keywordStemGroups) {
  if (!keywordStemGroups.length) return 0;
  const titleStemSet = new Set(tokenizeAndStem(title));
  let count = 0;
  for (const group of keywordStemGroups) {
    if (group.every((s) => titleStemSet.has(s))) count++;
  }
  return count;
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

function diversify(rows, returnLimit) {
  if (rows.length <= DIVERSIFY_THRESHOLD) {
    return shuffle(rows).slice(0, returnLimit);
  }

  const groupMap = new Map();
  rows.forEach((row, i) => {
    const key = `${subjectKey(row, i)}|${mediumBucket(row)}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(row);
  });

  const groups = shuffle([...groupMap.values()].map((g) => shuffle(g)));

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

// --- query building ---------------------------------------------------------

/** Shared base conditions used by both tag-match and title-match queries. */
function baseConditions(filters, params) {
  const conditions = ['o.is_public_domain = 1', 'o.primary_image IS NOT NULL'];
  if (BLOCKED_OBJECT_IDS.length > 0) {
    conditions.push(`o.object_id NOT IN (${BLOCKED_OBJECT_IDS.join(', ')})`);
  }

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

  if (filters.excludeDepartments && filters.excludeDepartments.length > 0) {
    const phs = filters.excludeDepartments.map(() => '?').join(', ');
    conditions.push(`o.department NOT IN (${phs})`);
    params.push(...filters.excludeDepartments);
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

  return conditions;
}

/** The all_tags LEFT JOIN used by both queries. */
const ALL_TAGS_JOIN = `
  LEFT JOIN (
    SELECT object_id, GROUP_CONCAT(tag, '|') AS tags
    FROM object_tags
    GROUP BY object_id
  ) all_tags ON o.object_id = all_tags.object_id`;

const SELECT_COLS = `
  o.object_id, o.title, o.artist_name, o.artist_nationality,
  o.object_date, o.begin_date, o.end_date, o.medium,
  o.classification, o.department, o.culture, o.is_highlight,
  o.link_resource, o.is_public_domain, o.primary_image,
  o.primary_image_small, all_tags.tags`;

/**
 * Primary query: tag-match candidates ordered by tag_match_count.
 *
 * Tag params must be pushed FIRST — the LEFT JOIN subquery appears before
 * the WHERE clause in SQL, so SQLite binds its ? placeholders first.
 */
function buildQuery(filters, limit) {
  const params = [];
  let tagMatchJoin = '';

  if (filters.tags && filters.tags.length > 0) {
    const phs = filters.tags.map(() => '?').join(', ');
    tagMatchJoin = `
      LEFT JOIN (
        SELECT object_id, COUNT(*) AS tag_match_count
        FROM object_tags
        WHERE tag IN (${phs})
        GROUP BY object_id
      ) tm ON o.object_id = tm.object_id`;
    params.push(...filters.tags); // must precede baseConditions() params
  }

  const conditions = baseConditions(filters, params);

  if (filters.tags && filters.tags.length > 0) {
    conditions.push('COALESCE(tm.tag_match_count, 0) >= 1');
  }

  const tagScoreExpr = filters.tags ? 'COALESCE(tm.tag_match_count, 0)' : '(0)';
  const where = conditions.length > 0 ? `WHERE ${conditions.join('\n    AND ')}` : '';

  const sql = `
    SELECT ${SELECT_COLS},
      ${tagScoreExpr} AS tag_match_count
    FROM objects o
    ${tagMatchJoin}
    ${ALL_TAGS_JOIN}
    ${where}
    ORDER BY tag_match_count DESC, o.is_highlight DESC
    LIMIT ?
  `;
  params.push(limit);
  return { sql, params };
}

/**
 * Secondary query: title-match candidates.
 * Uses LIKE on raw keyword words as a pre-filter; JS-side stemming does
 * the precise count. Excludes IDs already found by the tag query.
 */
function buildTitleQuery(filters, excludeIds, limit) {
  const params = [];
  const conditions = baseConditions(filters, params);

  // Title LIKE conditions — split multi-word keywords into individual words.
  const titleWords = [];
  for (const kw of filters.titleKeywords) {
    const words = kw.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    titleWords.push(...words);
  }
  const uniqueWords = [...new Set(titleWords)];
  const titleClauses = uniqueWords.map(() => 'LOWER(o.title) LIKE ?');
  conditions.push(`(${titleClauses.join(' OR ')})`);
  params.push(...uniqueWords.map((w) => `%${w}%`));

  // Exclude IDs already in the tag pool.
  if (excludeIds.size > 0) {
    conditions.push(`o.object_id NOT IN (${[...excludeIds].join(', ')})`);
  }

  const where = `WHERE ${conditions.join('\n    AND ')}`;

  const sql = `
    SELECT ${SELECT_COLS},
      (0) AS tag_match_count
    FROM objects o
    ${ALL_TAGS_JOIN}
    ${where}
    ORDER BY o.is_highlight DESC
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

// --- main entry point -------------------------------------------------------

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

  // 1. Primary: tag-match candidates.
  const { sql, params } = buildQuery(recipe.filters, FETCH_LIMIT);
  const tagRows = execQuery(db, sql, params);

  // 2. Secondary: title-match candidates (only when recipe has titleKeywords).
  let titleRows = [];
  if (recipe.filters.titleKeywords && recipe.filters.titleKeywords.length > 0) {
    const tagIds = new Set(tagRows.map((r) => r.object_id));
    const { sql: tSql, params: tParams } = buildTitleQuery(recipe.filters, tagIds, FETCH_LIMIT);
    titleRows = execQuery(db, tSql, tParams);
  }

  // 3. Merge pools (tag rows take precedence for dedup).
  const tagIdSet = new Set(tagRows.map((r) => r.object_id));
  const mergedRows = [...tagRows];
  for (const row of titleRows) {
    if (!tagIdSet.has(row.object_id)) mergedRows.push(row);
  }

  // 4. Score each row: tag_match_count + title_match_count.
  const keywordStemGroups = recipe.filters.titleKeywords
    ? buildKeywordStemGroups(recipe.filters.titleKeywords)
    : [];

  const scoredRows = mergedRows.map((row) => ({
    ...row,
    titleMatchCount: computeTitleMatchCount(row.title, keywordStemGroups),
  }));

  // 5. Re-rank by combined score descending.
  // Tiebreaker: prefer higher tag_match_count so a pure title match (0 tags)
  // never outrank a work that actually matches a recipe tag.
  scoredRows.sort(
    (a, b) =>
      (b.tag_match_count + b.titleMatchCount) - (a.tag_match_count + a.titleMatchCount) ||
      b.tag_match_count - a.tag_match_count ||
      b.is_highlight - a.is_highlight
  );

  // Drop rows that matched neither tags nor title keywords (LIKE pre-filter
  // false positives that Porter stemming correctly rejected).
  const qualifiedRows = scoredRows.filter(
    (row) => (row.tag_match_count + row.titleMatchCount) > 0
  );

  const matchReason = recipe.rationale.join(' · ');
  const diversified = diversify(qualifiedRows, limit);

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

module.exports = { queryTheme };
