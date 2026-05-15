const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const { generateRecipe } = require('../../src/themes/generate-recipe');
const { queryTheme } = require('../../src/themes/query');

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'You\'ve used all 10 free searches for this hour. Try again later, or pick a curated theme below.',
  },
});

router.use(limiter);

router.post('/', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (query.trim().length > 200) {
    return res.status(400).json({ error: 'query must be 200 characters or fewer' });
  }

  try {
    const { recipe, warnings } = await generateRecipe(query);
    const data = await queryTheme(recipe, { limit: 50 });

    const results = data.results
      .filter((r) => r.is_public_domain === 1)
      .map(({ is_public_domain: _, ...r }) => r);

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
