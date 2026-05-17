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

const DEFAULT_LIMIT = 50;

/**
 * Run a theme query against the database.
 *
 * @param {object} recipeInput   - Raw recipe object (will be validated).
 * @param {object} [options]
 * @param {number} [options.limit=50] - Max results to return.
 * @returns {Promise<object>}    - { theme, description, rationale, matchReason,
 *                                   count, results, warnings }
 */
async function queryTheme(recipeInput, { limit = DEFAULT_LIMIT } = {}) {
  const validation = validateRecipe(recipeInput);
  if (!validation.valid) {
    throw new Error(`Invalid recipe: ${validation.errors.join('; ')}`);
  }

  const { recipe } = validation;
  const { db } = await openDb();

  const { sql, params } = buildQuery(recipe.filters, limit);
  const rows = execQuery(db, sql, params);
  const matchReason = recipe.rationale.join(' · ');

  return {
    theme: recipe.label,
    description: recipe.description,
    rationale: recipe.rationale,
    matchReason,
    count: rows.length,
    results: rows.map((row) => ({
      ...row,
      tags: row.tags ? row.tags.split('|') : [],
      matchReason,
    })),
    warnings: validation.warnings || [],
  };
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
