/**
 * theme-recipe.js — the contract at the center of Moodboard Museum.
 *
 * A "theme recipe" is a structured description of what artworks match an
 * aesthetic. It is the COMMON LANGUAGE between three things:
 *
 *     hand-curated themes  ─┐
 *     LLM-generated themes ─┼──>  [ recipe ]  ──>  query engine  ──>  results
 *     (later) embeddings   ─┘
 *
 * Nothing queries the database directly. Everything produces a recipe, and
 * the query engine is the only thing that turns a recipe into SQL. That
 * separation is what lets you swap or stack approaches without rewrites.
 */

const KNOWN_CLASSIFICATIONS = [
  'Paintings', 'Drawings', 'Prints', 'Sculpture', 'Photographs',
  'Ceramics', 'Glass', 'Textiles', 'Metalwork', 'Furniture',
  'Arms and Armor', 'Jewelry', 'Costume',
];

const KNOWN_DEPARTMENTS = [
  'European Paintings', 'The American Wing', 'Asian Art',
  'Egyptian Art', 'Greek and Roman Art', 'Drawings and Prints',
  'Modern and Contemporary Art', 'Medieval Art', 'Islamic Art',
  'Costume Institute', 'Photographs', 'The Cloisters',
  'Arms and Armor', 'Musical Instruments',
];

const EARLIEST_YEAR = -4000;
const LATEST_YEAR = new Date().getFullYear();

function validateRecipe(input) {
  const errors = [];

  if (input === null || typeof input !== 'object') {
    return { valid: false, errors: ['Recipe must be an object.'] };
  }

  let label = input.label;
  if (typeof label !== 'string' || label.trim() === '') {
    errors.push('Recipe must have a non-empty "label" string.');
    label = '(unlabeled)';
  }

  const toStringArray = (value, fieldName) => {
    if (value === undefined) return undefined;
    let arr = value;
    if (typeof value === 'string') arr = [value];
    if (!Array.isArray(arr)) {
      errors.push(`Filter "${fieldName}" must be a string or array of strings.`);
      return undefined;
    }
    const cleaned = arr
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v !== '');
    return cleaned.length > 0 ? cleaned : undefined;
  };

  const constrainTo = (values, vocabulary, fieldName) => {
    if (values === undefined) return undefined;
    const known = [];
    for (const v of values) {
      const match = vocabulary.find(
        (k) => k.toLowerCase() === v.toLowerCase()
      );
      if (match) {
        known.push(match);
      } else {
        errors.push(`Note: dropped unknown ${fieldName} "${v}" (not a recognized value).`);
      }
    }
    return known.length > 0 ? known : undefined;
  };

  const rawFilters = input.filters || {};
  if (typeof rawFilters !== 'object' || Array.isArray(rawFilters)) {
    return { valid: false, errors: ['Recipe "filters" must be an object.'] };
  }

  const filters = {};

  filters.classifications = constrainTo(
    toStringArray(rawFilters.classifications, 'classifications'),
    KNOWN_CLASSIFICATIONS, 'classification'
  );
  filters.departments = constrainTo(
    toStringArray(rawFilters.departments, 'departments'),
    KNOWN_DEPARTMENTS, 'department'
  );

  filters.tags = toStringArray(rawFilters.tags, 'tags');
  filters.excludeTags = toStringArray(rawFilters.excludeTags, 'excludeTags');
  filters.cultures = toStringArray(rawFilters.cultures, 'cultures');
  filters.mediumKeywords = toStringArray(rawFilters.mediumKeywords, 'mediumKeywords');

  if (rawFilters.dateRange !== undefined) {
    const dr = rawFilters.dateRange;
    if (typeof dr !== 'object' || dr === null) {
      errors.push('Filter "dateRange" must be an object with start and end.');
    } else {
      const start = Number(dr.start);
      const end = Number(dr.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        errors.push('dateRange.start and dateRange.end must be numbers.');
      } else if (start > end) {
        errors.push(`dateRange.start (${start}) is after end (${end}).`);
      } else if (start < EARLIEST_YEAR || end > LATEST_YEAR) {
        errors.push(`dateRange must be between ${EARLIEST_YEAR} and ${LATEST_YEAR}.`);
      } else {
        filters.dateRange = { start, end };
      }
    }
  }

  if (rawFilters.isHighlight !== undefined) {
    if (typeof rawFilters.isHighlight !== 'boolean') {
      errors.push('Filter "isHighlight" must be true or false.');
    } else {
      filters.isHighlight = rawFilters.isHighlight;
    }
  }

  for (const key of Object.keys(filters)) {
    if (filters[key] === undefined) delete filters[key];
  }

  if (Object.keys(filters).length === 0) {
    errors.push('Recipe has no usable filters — it would match the entire collection.');
  }

  let rationale = input.rationale;
  if (!Array.isArray(rationale) || rationale.length === 0) {
    rationale = describeFilters(filters);
  } else {
    rationale = rationale
      .map((r) => (typeof r === 'string' ? r.trim() : ''))
      .filter((r) => r !== '');
  }

  const validSources = ['curated', 'llm', 'embedding'];
  const source = validSources.includes(input.source) ? input.source : 'unknown';

  const hardErrors = errors.filter((e) => !e.startsWith('Note:'));
  if (hardErrors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    recipe: {
      label: label.trim(),
      description: typeof input.description === 'string'
        ? input.description.trim() : undefined,
      filters,
      rationale,
      source,
    },
    warnings: errors.filter((e) => e.startsWith('Note:')),
  };
}

function describeFilters(filters) {
  const reasons = [];
  if (filters.classifications) {
    reasons.push(joinNicely(filters.classifications));
  }
  if (filters.departments) {
    reasons.push(`From the ${joinNicely(filters.departments)} ` +
      `department${filters.departments.length > 1 ? 's' : ''}`);
  }
  if (filters.dateRange) {
    reasons.push(formatDateRange(filters.dateRange));
  }
  if (filters.tags) {
    reasons.push(`Tagged with ${joinNicely(filters.tags)}`);
  }
  if (filters.excludeTags) {
    reasons.push(`Excluding works tagged ${joinNicely(filters.excludeTags)}`);
  }
  if (filters.cultures) {
    reasons.push(`${joinNicely(filters.cultures)} in origin`);
  }
  if (filters.mediumKeywords) {
    reasons.push(`Made with ${joinNicely(filters.mediumKeywords)}`);
  }
  if (filters.isHighlight) {
    reasons.push('Curator-designated highlights');
  }
  return reasons;
}

function joinNicely(arr) {
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} or ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, or ${arr[arr.length - 1]}`;
}

function formatDateRange({ start, end }) {
  const fmt = (y) => (y < 0 ? `${Math.abs(y)} BC` : `${y}`);
  if (start === end) return `From ${fmt(start)}`;
  return `From ${fmt(start)} to ${fmt(end)}`;
}

const EXAMPLE_RECIPES = {
  'dark-academia': {
    label: 'Dark Academia',
    description: 'Moody scholarship — old portraits, books, shadowed interiors.',
    filters: {
      classifications: ['Paintings', 'Drawings'],
      tags: ['Portraits', 'Books', 'Architecture', 'Men', 'Women'],
      excludeTags: ['Animals', 'Landscapes', 'Cattle', 'Pastoral', 'Children', 'Infants', 'Mothers', 'Family Groups', 'Mother and Child'],
      mediumKeywords: ['oil', 'ink'],
      dateRange: { start: 1600, end: 1900 },
    },
    rationale: [
      'Oil paintings and drawings',
      'From 1600 to 1900',
      'Tagged with Portraits, Books, or Architecture',
      'Excluding works tagged Animals, Landscapes, Cattle, Pastoral, Children, Infants, Mothers, Family Groups, or Mother and Child',
    ],
    source: 'curated',
  },

  'cottagecore': {
    label: 'Cottagecore',
    description: 'Pastoral calm — landscapes, flowers, rural life.',
    filters: {
      classifications: ['Paintings', 'Prints'],
      tags: ['Landscapes', 'Flowers', 'Gardens', 'Animals', 'Women'],
      excludeTags: ['Nudes', 'Mythology', 'Venus', 'Cupid'],
      mediumKeywords: ['oil', 'watercolor', 'woodblock'],
      dateRange: { start: 1700, end: 1920 },
    },
    rationale: [
      'Paintings and prints',
      'From 1700 to 1920',
      'Tagged with Landscapes, Flowers, Gardens, or Animals',
      'Excluding works tagged Nudes, Mythology, Venus, or Cupid',
    ],
    source: 'curated',
  },

  'goblincore': {
    label: 'Goblincore',
    description: 'Mossy, fungal, feral — the beauty of overlooked natural things.',
    filters: {
      classifications: ['Drawings', 'Prints'],
      tags: ['Insects', 'Plants', 'Animals', 'Flowers', 'Birds'],
      mediumKeywords: ['ink', 'engraving', 'etching', 'woodblock'],
      dateRange: { start: 1500, end: 1900 },
    },
    rationale: [
      'Drawings and prints',
      'From 1500 to 1900',
      'Tagged with Insects, Plants, Animals, or Birds',
      'Made with ink, engraving, or etching',
    ],
    source: 'curated',
  },

  'old-money': {
    label: 'Old Money',
    description: 'Understated inherited wealth — equestrian, nautical, quiet luxury.',
    filters: {
      classifications: ['Paintings', 'Prints'],
      tags: ['Portraits', 'Landscapes', 'Men', 'Horses', 'Ships'],
      mediumKeywords: ['oil', 'engraving'],
      dateRange: { start: 1700, end: 1900 },
    },
    rationale: [
      'Paintings and prints',
      'From 1700 to 1900',
      'Tagged with Portraits, Landscapes, or Horses',
    ],
    source: 'curated',
  },

  'witchy': {
    label: 'Witchy',
    description: 'Candles, herbs, moons, and the occult — magic as aesthetic.',
    filters: {
      classifications: ['Drawings', 'Prints'],
      tags: ['Skulls', 'Plants', 'Flowers', 'Night', 'Death'],
      mediumKeywords: ['ink', 'engraving', 'etching'],
      dateRange: { start: 1400, end: 1800 },
    },
    rationale: [
      'Drawings and prints',
      'From 1400 to 1800',
      'Tagged with Skulls, Plants, Night, or Death',
      'Made with ink, engraving, or etching',
    ],
    source: 'curated',
  },

  'coastal-grandmother': {
    label: 'Coastal Grandmother',
    description: 'Linen, shells, soft blues — the quiet poetry of life by the sea.',
    filters: {
      classifications: ['Paintings', 'Prints'],
      tags: ['Seascapes', 'Ships', 'Landscapes', 'Water', 'Figures'],
      mediumKeywords: ['oil', 'watercolor', 'woodblock'],
      dateRange: { start: 1700, end: 1920 },
    },
    rationale: [
      'Paintings and prints',
      'From 1700 to 1920',
      'Tagged with Seascapes, Ships, or Water',
    ],
    source: 'curated',
  },

  'hygge': {
    label: 'Hygge',
    description: 'Warmth, candlelight, and quiet interiors — the art of cozy.',
    filters: {
      classifications: ['Paintings'],
      tags: ['Interiors', 'Figures', 'Fire', 'Women', 'Men', 'Children'],
      mediumKeywords: ['oil'],
      dateRange: { start: 1600, end: 1900 },
    },
    rationale: [
      'Oil paintings only',
      'From 1600 to 1900',
      'Tagged with Interiors, Fire, or Figures',
    ],
    source: 'curated',
  },

  'plant-mom': {
    label: 'Plant Mom',
    description: 'Lush botanical life — scientific illustration, specimen drawings, garden abundance.',
    filters: {
      classifications: ['Drawings', 'Prints'],
      tags: ['Plants', 'Flowers', 'Botanical', 'Gardens', 'Trees'],
      mediumKeywords: ['ink', 'engraving', 'etching', 'watercolor'],
      dateRange: { start: 1500, end: 1920 },
    },
    rationale: [
      'Botanical drawings and prints',
      'From 1500 to 1920',
      'Tagged with Plants, Flowers, or Botanical',
    ],
    source: 'curated',
  },

  'cats': {
    label: 'Cats',
    description: 'Cats throughout art history — from Egyptian gods to Japanese woodblocks.',
    filters: {
      tags: ['Cats'],
    },
    rationale: [
      'Tagged with Cats',
      'Across all departments and eras',
    ],
    source: 'curated',
  },

  'mermaidcore': {
    label: 'Mermaidcore',
    description: 'Ocean depths and mythological seas — waves, sea creatures, and aquatic gods.',
    filters: {
      classifications: ['Drawings', 'Prints', 'Sculpture'],
      tags: ['Waves', 'Fish', 'Sea', 'Mythology', 'Nudes', 'Women'],
      excludeTags: ['Landscapes', 'Horses', 'Battle'],
      mediumKeywords: ['ink', 'engraving', 'etching', 'woodblock'],
      dateRange: { start: 1400, end: 1920 },
    },
    rationale: [
      'Drawings, prints, and sculpture',
      'From 1400 to 1920',
      'Tagged with Waves, Fish, Sea, or Mythology',
    ],
    source: 'curated',
  },

  'grandmacore': {
    label: 'Grandmacore',
    description: 'Lace, florals, and cozy clutter — the maximalist warmth of a Victorian parlor.',
    filters: {
      classifications: ['Paintings', 'Drawings'],
      tags: ['Interiors', 'Flowers', 'Women', 'Lace', 'Still Life'],
      excludeTags: ['Men', 'Battle', 'Nudes', 'Mythology'],
      mediumKeywords: ['oil', 'watercolor'],
      dateRange: { start: 1750, end: 1920 },
    },
    rationale: [
      'Paintings and drawings',
      'From 1750 to 1920',
      'Tagged with Interiors, Flowers, or Still Life',
    ],
    source: 'curated',
  },

  'brat-summer': {
    label: 'Brat Summer',
    description: 'Chaotic fun and unbothered energy — festivals, dancing, and figures in motion.',
    filters: {
      classifications: ['Paintings', 'Drawings', 'Prints'],
      tags: ['Dancing', 'Figures', 'Women', 'Celebrations', 'Music'],
      excludeTags: ['Portraits', 'Death', 'Battle', 'Skulls'],
      mediumKeywords: ['oil', 'ink', 'engraving'],
      dateRange: { start: 1500, end: 1920 },
    },
    rationale: [
      'Paintings, drawings, and prints',
      'From 1500 to 1920',
      'Tagged with Dancing, Celebrations, or Music',
      'Excluding somber subjects',
    ],
    source: 'curated',
  },

  'celestial': {
    label: 'Celestial',
    description: 'Stars, moons, and the cosmos — astronomical illustration and mythological skies.',
    filters: {
      classifications: ['Drawings', 'Prints'],
      tags: ['Stars', 'Moon', 'Astronomy', 'Night', 'Constellations', 'Sky'],
      mediumKeywords: ['ink', 'engraving', 'etching'],
      dateRange: { start: 1400, end: 1900 },
    },
    rationale: [
      'Drawings and prints',
      'From 1400 to 1900',
      'Tagged with Stars, Moon, Astronomy, or Constellations',
    ],
    source: 'curated',
  },
};

module.exports = {
  validateRecipe,
  describeFilters,
  EXAMPLE_RECIPES,
  KNOWN_CLASSIFICATIONS,
  KNOWN_DEPARTMENTS,
};
