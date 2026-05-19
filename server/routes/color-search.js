/**
 * GET /api/search/color
 *
 * Query params (one required):
 *   hex=RRGGBB       — 6-digit hex color (with or without leading #)
 *   l=&a=&b=         — CIELAB values directly
 *
 * Optional:
 *   limit=N          — max results (default 48, max 96)
 *
 * Returns: { results: [...], matchReason: string }
 */

'use strict';

const express = require('express');
const router = express.Router();
const { searchByColor, hexToLab } = require('../../src/search/color-search');

router.get('/', (req, res) => {
  try {
    const { hex, l, a, b, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam, 10) || 48, 96);

    let labColor;

    if (hex) {
      const clean = String(hex).replace(/^#/, '').toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(clean)) {
        return res.status(400).json({ error: 'Invalid hex color — expected 6 hex digits, e.g. 8B4513' });
      }
      labColor = hexToLab(clean);
    } else if (l !== undefined && a !== undefined && b !== undefined) {
      const lv = parseFloat(l), av = parseFloat(a), bv = parseFloat(b);
      if (isNaN(lv) || isNaN(av) || isNaN(bv)) {
        return res.status(400).json({ error: 'l, a, b must be valid numbers' });
      }
      labColor = { l: lv, a: av, b: bv };
    } else {
      return res.status(400).json({ error: 'Provide ?hex=RRGGBB or ?l=&a=&b=' });
    }

    const results = searchByColor(labColor, limit);
    const displayHex = hex ? `#${String(hex).replace(/^#/, '').toUpperCase()}` : `LAB(${labColor.l.toFixed(0)}, ${labColor.a.toFixed(0)}, ${labColor.b.toFixed(0)})`;

    res.json({
      results,
      matchReason: results.length > 0
        ? `${results.length} artwork${results.length === 1 ? '' : 's'} closest to ${displayHex}`
        : 'No color data yet — run extract-colors to populate the index',
    });
  } catch (err) {
    console.error('[color-search route]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
