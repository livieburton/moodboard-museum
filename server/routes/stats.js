const express = require('express');
const router = express.Router();
const { openDb } = require('../../src/pipeline/db');

router.get('/', async (req, res) => {
  try {
    const { db } = await openDb();
    const results = db.exec(`
      SELECT COUNT(*) as total FROM objects
      WHERE primary_image_small IS NOT NULL AND primary_image_small != ''
    `);
    const total = results[0]?.values[0][0] ?? 0;
    res.json({ total });
  } catch (err) {
    console.error('[stats]', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
