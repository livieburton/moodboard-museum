/**
 * color-names.js — maps aesthetic and common color names to hex values.
 *
 * getColorHex(query) returns a hex string (e.g. '#F4C2C2') if the query
 * is recognisably a color name, or null otherwise.
 *
 * Matching is fuzzy: the query is normalised (lowercase, collapsed spaces,
 * stripped punctuation) and checked against the table. Partial-word matches
 * are rejected — "red" won't match "red velvet" unless the exact phrase is
 * in the table.
 */

'use strict';

// ---------------------------------------------------------------------------
// Color table — add more entries here as needed.
// Values are approximate hex centroids for that color's visual territory.
// ---------------------------------------------------------------------------

const COLOR_MAP = {
  // ── Pinks ──
  'pink':              '#F4A7B9',
  'millennial pink':   '#F4C2C2',
  'ballet pink':       '#F4C2C2',
  'blush':             '#DE8585',
  'blush pink':        '#DE8585',
  'dusty pink':        '#DCAE96',
  'dusty rose':        '#C08081',
  'rose':              '#C08081',
  'hot pink':          '#FF69B4',
  'powder pink':       '#FFB6C1',
  'baby pink':         '#FFB6C1',
  'salmon':            '#FA8072',
  'bubblegum':         '#FFC1CC',
  'bubblegum pink':    '#FFC1CC',
  'fuchsia':           '#FF00FF',
  'magenta':           '#CC00BB',
  'coral':             '#FF7F50',
  'peach':             '#FFCBA4',

  // ── Mauves / purply-pinks ──
  'mauve':             '#C48080',
  'dusty mauve':       '#C48080',
  'wisteria':          '#C9A0DC',
  'lilac':             '#C8A2C8',
  'lavender':          '#B57EDC',
  'lavender blue':     '#8C9DC3',
  'periwinkle':        '#CCCCFF',

  // ── Purples ──
  'purple':            '#800080',
  'violet':            '#7F00FF',
  'orchid':            '#DA70D6',
  'plum':              '#8E4585',
  'amethyst':          '#9966CC',
  'grape':             '#6F2DA8',
  'eggplant':          '#614051',
  'aubergine':         '#614051',
  'mulberry':          '#C54B8C',

  // ── Reds ──
  'red':               '#CC2200',
  'crimson':           '#DC143C',
  'scarlet':           '#FF2400',
  'cherry':            '#DE3163',
  'raspberry':         '#E30B5D',
  'wine':              '#722F37',
  'burgundy':          '#800020',
  'maroon':            '#800000',
  'oxblood':           '#800020',
  'vermillion':        '#E34234',
  'tomato':            '#FF6347',
  'brick':             '#CB4154',
  'brick red':         '#CB4154',
  'cardinal':          '#C41E3A',
  'ruby':              '#9B111E',

  // ── Oranges ──
  'orange':            '#FF8C00',
  'burnt orange':      '#CC5500',
  'terracotta':        '#E2725B',
  'terra cotta':       '#E2725B',
  'rust':              '#B7410E',
  'clay':              '#C66B4A',
  'copper':            '#B87333',
  'sienna':            '#A0522D',
  'ochre':             '#CC7722',
  'amber':             '#FFBF00',
  'tangerine':         '#F28500',
  'pumpkin':           '#FF7518',
  'apricot':           '#FBCEB1',
  'papaya':            '#FFEFD5',

  // ── Yellows / Golds ──
  'yellow':            '#F5C518',
  'golden':            '#FFD700',
  'gold':              '#C5973A',
  'mustard':           '#FFDB58',
  'mustard yellow':    '#FFDB58',
  'lemon':             '#FFF44F',
  'butter':            '#FFFAA0',
  'butter yellow':     '#FFFAA0',
  'champagne':         '#F7E7CE',
  'honey':             '#F0A500',
  'saffron':           '#F4C430',
  'canary':            '#FFFF99',
  'chartreuse':        '#7FFF00',
  'olive':             '#808000',
  'olive green':       '#808000',

  // ── Browns / Neutrals ──
  'brown':             '#8B5E3C',
  'chocolate':         '#7B3F00',
  'mocha':             '#967259',
  'espresso':          '#4B2F27',
  'caramel':           '#C68642',
  'toffee':            '#A0714F',
  'camel':             '#C19A6B',
  'tan':               '#D2B48C',
  'sand':              '#C2B280',
  'taupe':             '#8B7966',
  'mushroom':          '#A5978B',
  'oatmeal':           '#D4C5A9',
  'linen':             '#FAF0E6',
  'beige':             '#E8D8C4',
  'cream':             '#FFFDD0',
  'ecru':              '#C2B280',
  'ivory':             '#F8F0DC',

  // ── Greens ──
  'green':             '#228B22',
  'sage':              '#87AE73',
  'sage green':        '#87AE73',
  'forest green':      '#228B22',
  'hunter green':      '#355E3B',
  'bottle green':      '#006A4E',
  'pine':              '#01796F',
  'pine green':        '#01796F',
  'emerald':           '#50C878',
  'jade':              '#00A86B',
  'moss':              '#8A9A5B',
  'moss green':        '#8A9A5B',
  'mint':              '#98FF98',
  'mint green':        '#98FF98',
  'seafoam':           '#93E9BE',
  'seafoam green':     '#93E9BE',
  'pistachio':         '#93C572',
  'avocado':           '#568203',
  'avocado green':     '#568203',
  'fern':              '#4F7942',
  'lime':              '#32CD32',
  'lime green':        '#32CD32',
  'teal':              '#008080',
  'dark teal':         '#005F5F',

  // ── Blues ──
  'blue':              '#2054B5',
  'navy':              '#000080',
  'navy blue':         '#000080',
  'cobalt':            '#0047AB',
  'cobalt blue':       '#0047AB',
  'sapphire':          '#0F52BA',
  'royal blue':        '#4169E1',
  'cornflower':        '#6495ED',
  'cornflower blue':   '#6495ED',
  'cerulean':          '#007BA7',
  'sky blue':          '#87CEEB',
  'baby blue':         '#89CFF0',
  'powder blue':       '#B0E0E6',
  'denim':             '#1560BD',
  'denim blue':        '#1560BD',
  'steel blue':        '#4682B4',
  'slate blue':        '#6A5ACD',
  'indigo':            '#4B0082',
  'prussian blue':     '#003153',
  'midnight blue':     '#003366',
  'turquoise':         '#40E0D0',

  // ── Blacks, Whites, Greys ──
  'black':             '#1A1A1A',
  'jet black':         '#1A1A1A',
  'onyx':              '#353935',
  'charcoal':          '#36454F',
  'dark grey':         '#444444',
  'slate grey':        '#708090',
  'slate gray':        '#708090',
  'grey':              '#888888',
  'gray':              '#888888',
  'silver':            '#C0C0C0',
  'dove grey':         '#999999',
  'ash':               '#B2BEB5',
  'off white':         '#FAF9F6',
  'white':             '#F8F8F8',
  'cream white':       '#FFFDD0',

  // ── Aesthetic-specific ──
  'dark academia':     '#6B4423',
  'moody':             '#5A4A6B',
  'dusty blue':        '#7698B3',
  'dusty':             '#A8A0A0',
  'muted':             '#B8B0A8',

  // ── Cultural & pop-culture color associations ──
  'brat':              '#8ACE00',
  'brat summer':       '#8ACE00',
  'brat green':        '#8ACE00',
  'millennial pink':   '#F4C2C2',
  'gen z yellow':      '#FFE227',
  'barbiecore':        '#FF69B4',
  'barbie pink':       '#FF69B4',
  'red velvet':        '#8B1A1A',
  'red velvet cake':   '#8B1A1A',
  'matcha':            '#93B85A',
  'matcha green':      '#93B85A',
  'ballet pink':       '#F4C2C2',
  'old money':         '#C5AD8A',
  'quiet luxury':      '#C5AD8A',
  'coastal grandmother': '#B0C4BE',
  'dopamine':          '#FF6B6B',
  'cottagecore':       '#87AE73',
  'dark romance':      '#4A1428',
  'gothic':            '#2D2D2D',
  'y2k':               '#C9A0DC',
  'bubblegum':         '#FFC1CC',
  'bubblegum pink':    '#FFC1CC',
  'aura':              '#B57EDC',
};

// ---------------------------------------------------------------------------
// Pre-process: build a sorted list of entries (longest key first so "dusty
// rose" matches before "dusty").
// ---------------------------------------------------------------------------

const SORTED_ENTRIES = Object.entries(COLOR_MAP).sort(
  ([a], [b]) => b.length - a.length
);

/**
 * Normalise a query string for matching.
 * Lowercases, strips non-alpha characters except spaces, collapses spaces.
 */
function normalise(str) {
  return str.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns { hex, name } if the query is a known color name, otherwise null.
 *
 * Strategy:
 *  1. Exact match after normalisation.
 *  2. The query is entirely contained by the color name (e.g. "millennial pink" in query).
 *
 * Deliberately conservative — "I want red paintings" won't match.
 * But "dusty rose", "sage green", "burnt orange" all will.
 */
function getColorHex(query) {
  const q = normalise(query);
  if (q.length < 2) return null;

  // Exact match only (normalised). This covers "Millennial Pink" → "millennial pink" etc.
  if (COLOR_MAP[q]) return { hex: COLOR_MAP[q], name: q };

  return null;
}

module.exports = { getColorHex, COLOR_MAP };
