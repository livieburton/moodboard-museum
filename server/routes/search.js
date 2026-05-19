const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { generateRecipe } = require('../../src/themes/generate-recipe');
const { queryTheme } = require('../../src/themes/query');
const { getColorHex } = require('../../src/search/color-names');
const { searchByColor, hexToLab, reRankByColor } = require('../../src/search/color-search');

async function inferColorFromPhrase(phrase) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16,
    messages: [{
      role: 'user',
      content: `What single hex color does this phrase most strongly evoke? Reply with only the hex code (e.g. #8B0000), nothing else.\nPhrase: "${phrase}"`,
    }],
  });
  const text = response.content.find((b) => b.type === 'text')?.text?.trim();
  return (text && /^#[0-9A-Fa-f]{6}$/.test(text)) ? text : null;
}

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'You\'ve used all 10 free searches for this hour. Try again later, or pick a curated theme.',
  },
});

router.use(limiter);

router.post('/', async (req, res) => {
  const { query, colorMode } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (query.trim().length > 200) {
    return res.status(400).json({ error: 'query must be 200 characters or fewer' });
  }

  try {
    // ── Color tab paths ──────────────────────────────────────────────────
    if (colorMode) {
      // Fast path: recognisable color name (e.g. "millennial pink", "barbiecore")
      const colorMatch = getColorHex(query);
      if (colorMatch) {
        const labColor = hexToLab(colorMatch.hex);
        const colorResults = searchByColor(labColor, 48);
        const displayName = colorMatch.name.replace(/\b\w/g, (c) => c.toUpperCase());
        return res.json({
          matchReason: colorResults.length > 0
            ? `${colorResults.length} artwork${colorResults.length === 1 ? '' : 's'} closest to ${displayName} (${colorMatch.hex.toUpperCase()})`
            : `No color data yet for ${displayName} — run extract-colors to populate the index`,
          count: colorResults.length,
          results: colorResults,
          colorHex: colorMatch.hex,
          warnings: [],
        });
      }

      // Slow path: ask Claude to infer the hex from the phrase
      const inferredHex = await inferColorFromPhrase(query);
      if (inferredHex) {
        const labColor = hexToLab(inferredHex);
        const colorResults = searchByColor(labColor, 48);
        const displayName = query.replace(/\b\w/g, (c) => c.toUpperCase());
        return res.json({
          matchReason: colorResults.length > 0
            ? `${colorResults.length} artwork${colorResults.length === 1 ? '' : 's'} closest to ${displayName} (${inferredHex.toUpperCase()})`
            : `No color data yet for ${displayName}`,
          count: colorResults.length,
          results: colorResults,
          colorHex: inferredHex,
          warnings: [],
        });
      }
    }

    // ── Normal keyword search ────────────────────────────────────────────
    const { recipe, warnings } = await generateRecipe(query);
    let data = await queryTheme(recipe, { limit: 200 });
    let results = data.results
      .filter((r) => r.is_public_domain === 1)
      .map(({ is_public_domain: _, ...r }) => ({ ...r, museum: 'The Met' }));

    // ── Zero-result fallback ─────────────────────────────────────────────
    // If the recipe returned nothing, progressively relax constraints:
    // Pass 1: strip cultures + dateRange (catches over-constrained cultural refs)
    // Pass 2: also strip departments (catches unenriched/empty departments)
    if (results.length === 0) {
      const hasConstraints = recipe.filters.cultures?.length
        || recipe.filters.dateRange
        || recipe.filters.departments?.length;

      if (hasConstraints) {
        console.log('[search] zero results — retrying without cultures/dateRange for:', query);
        const relaxed = {
          ...recipe,
          filters: { ...recipe.filters, cultures: undefined, dateRange: undefined },
        };
        const fallbackData = await queryTheme(relaxed, { limit: 200 });
        const fallbackResults = fallbackData.results
          .filter((r) => r.is_public_domain === 1)
          .map(({ is_public_domain: _, ...r }) => ({ ...r, museum: 'The Met' }));

        if (fallbackResults.length > 0) {
          data = fallbackData;
          results = fallbackResults;
          warnings.push('Broadened search — removed geographic/date filters to find matching artworks.');
        } else if (recipe.filters.departments?.length) {
          // Pass 2: also drop departments
          console.log('[search] still zero — retrying without departments either for:', query);
          const relaxed2 = {
            ...recipe,
            filters: { ...recipe.filters, cultures: undefined, dateRange: undefined, departments: undefined },
          };
          const fallbackData2 = await queryTheme(relaxed2, { limit: 200 });
          const fallbackResults2 = fallbackData2.results
            .filter((r) => r.is_public_domain === 1)
            .map(({ is_public_domain: _, ...r }) => ({ ...r, museum: 'The Met' }));
          if (fallbackResults2.length > 0) {
            data = fallbackData2;
            results = fallbackResults2;
            warnings.push('Broadened search — removed department filters to find matching artworks.');
          }
        }
      }
    }

    if (recipe.colorHex) {
      // Inject color-matched artworks to fill up to 48 results, then re-rank so
      // on-theme + on-color results rise to the top and pure-color fills the gaps.
      const labColor = hexToLab(recipe.colorHex);
      const colorPool = searchByColor(labColor, 48);
      const thematicIds = new Set(results.map((r) => r.object_id));
      const injections = colorPool
        .filter((r) => !thematicIds.has(r.object_id))
        .slice(0, Math.max(0, 48 - results.length));
      results = reRankByColor([...results, ...injections], recipe.colorHex, 0.4);
    }

    res.json({
      theme: data.theme,
      description: data.description,
      rationale: data.rationale,
      matchReason: data.matchReason,
      count: results.length,
      results,
      warnings: [...(data.warnings || []), ...warnings],
    });
  } catch (err) {
    // Log enough detail to diagnose Anthropic API errors without reading HTML.
    console.error('[search] error:', err.message);
    if (err.status)  console.error('[search] status:', err.status);
    if (err.error)   console.error('[search] api error:', JSON.stringify(err.error));
    if (err.headers) console.error('[search] request-id:', err.headers['request-id']);
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

module.exports = router;
