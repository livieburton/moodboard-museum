const express = require('express');
const router = express.Router();
const { openDb } = require('../../src/pipeline/db');

// Same block-list as query.js — exclude context-sensitive works from the mosaic
const BLOCKED_IDS = [11116];

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 60);

  try {
    const { db } = await openDb();
    const results = db.exec(`
      SELECT object_id, title, primary_image_small, primary_image
      FROM objects
      WHERE is_public_domain = 1
        AND object_id NOT IN (${BLOCKED_IDS.join(',')})
        AND (
          (primary_image_small IS NOT NULL AND primary_image_small != '')
          OR  (primary_image   IS NOT NULL AND primary_image   != '')
        )
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);

    if (!results.length) return res.json({ results: [] });

    const [{ columns, values }] = results;
    const artworks = values.map((row) => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });

    res.json({ results: artworks });
  } catch (err) {
    console.error('[random]', err.message);
    res.status(500).json({ error: 'Failed to fetch random artworks', detail: err.message });
  }
});

module.exports = router;
