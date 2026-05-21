const express = require('express');
const { queryTheme } = require('../../src/themes/query');
const { EXAMPLE_RECIPES } = require('../../src/themes/theme-recipe');
const { reRankByColor } = require('../../src/search/color-search');

const router = express.Router();

router.get('/', (_req, res) => {
  const themes = Object.entries(EXAMPLE_RECIPES)
    .map(([slug, recipe]) => ({
      slug,
      label: recipe.label,
      description: recipe.description || null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  res.json(themes);
});

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const recipe = EXAMPLE_RECIPES[slug];
  if (!recipe) {
    return res.status(404).json({ error: `Unknown theme: ${slug}` });
  }

  try {
    const result = await queryTheme(recipe, { limit: 200 });

    // Hard public-domain gate at the API boundary. The DB ingest and query
    // engine already enforce this — this is the third and final check.
    let results = result.results
      .filter((r) => r.is_public_domain === 1)
      .map((r) => ({
        object_id: r.object_id,
        title: r.title,
        artist_name: r.artist_name,
        museum: 'The Met',
        primary_image: r.primary_image || null,
        primary_image_small: r.primary_image_small || null,
        link_resource: r.link_resource,
        tags: r.tags,
        matchReason: r.matchReason,
      }));

    if (recipe.colorHex) {
      results = reRankByColor(results, recipe.colorHex);
    }

    res.json({
      theme: result.theme,
      description: result.description || null,
      matchReason: result.matchReason,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error(`[themes/${slug}]`, err.message);
    res.status(500).json({ error: 'Query failed.' });
  }
});

module.exports = router;
