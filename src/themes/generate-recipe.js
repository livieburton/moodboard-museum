/**
 * generate-recipe.js — translates free-text aesthetics into theme recipes.
 *
 * The only export is generateRecipe(userQuery). It calls claude-opus-4-7
 * with a cached system prompt containing the full recipe vocabulary, then
 * validates the returned JSON through validateRecipe before returning it.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateRecipe, KNOWN_CLASSIFICATIONS, KNOWN_DEPARTMENTS } = require('./theme-recipe');

// All tags present in the database with 20+ uses — Claude must pick from these only.
const KNOWN_TAGS = [
  'Men', 'Women', 'Portraits', 'Flowers', 'Birds', 'Actresses', 'Horses', 'Trees',
  'Landscapes', 'Leaves', 'Human Figures', 'Animals', 'Profiles', 'Architecture',
  'Dogs', 'Athletes', 'Coat of Arms', 'Carriages', 'Christ', 'Buildings', 'Boats',
  'Baseball', 'Ornament', 'Satire', 'Angels', 'Saints', 'Heads', 'Female Nudes',
  'Soldiers', 'Lions', 'Boys', 'Houses', 'Male Nudes', 'Hieroglyphs', 'Children',
  'Dragons', 'Virgin Mary', 'Girls', 'Mountains', 'Musical Instruments', 'Swords',
  'Fish', 'Ships', 'Scarabs', 'Flags', 'Madonna and Child', 'Interiors', 'Faces',
  'Rivers', 'Buddhism', 'Putti', 'Actors', 'Cross', 'Deer', 'Plants', 'Infants',
  'Kings', 'Bridges', 'Ruins', 'Cupid', 'Eagles', 'Working', 'American Civil War',
  'Butterflies', 'Fruit', 'Satyrs', 'Dancing', 'Jesus', 'Crowd', 'Cows', 'Musicians',
  'Weapons', 'Mythical Creatures', 'Crucifixion', 'Battles', 'Bulls', 'Insects',
  'Military', 'Dancers', 'Shields', 'Masks', 'Saint John the Baptist', 'Playing Cards',
  'Goddess', 'Cats', 'Buddha', 'Grapes', 'Snakes', 'Firearms', 'Fans', 'Reading',
  'Death', 'Bodhisattvas', 'Hunting', 'Churches', 'Books', 'Elephants', 'Cities',
  'Chariots', 'Monkeys', 'Sheep', 'Temples', 'Politics', 'Games', 'Queens',
  'Bow and Arrow', 'Gardens', 'Peacocks', 'Vases', 'Couples', 'Mirrors', 'Sculpture',
  'Venus', 'Goats', 'Drinking', 'Columns', 'Generals', 'Roses', 'Skeletons', 'Tables',
  'Rabbits', 'Cranes', 'Roosters', 'Garlands', 'Smoking', 'Ducks', 'Fountains',
  'Hands', 'Donkeys', 'Documents', 'Chairs', 'Hills', 'Arches', 'Spears', 'Coins',
  'Sleeping', 'Sphinx', 'Tombs', 'Holy Family', 'Hercules', 'Chess', 'Griffins',
  'Calligraphy', 'Ceilings', 'Poetry', 'Food', 'Apostles', 'Fishing', 'Suffering',
  'Beds', 'Caricature', 'Demons', 'Shakespeare', 'Skulls', 'Forests', 'Shepherds',
  'Waterfalls', 'Snow', 'Writing', 'Tigers', 'Camels', 'Castles', 'Nymphs', 'Streets',
  'Palaces', 'Rams', 'Apollo', 'Deities', 'Cannons', 'Helmets', 'Swans',
  'Mary Magdalene', 'Eros', 'Sadness', 'Armor', 'Hats', 'Annunciation', 'Bamboo',
  'Vines', 'Hinduism', 'Venice', 'Owls', 'Bowls', 'Towers', 'Fire', 'Waves',
  'Playing', 'Saint Peter', 'Furniture', 'Music', 'Altars', 'Moon', 'Monuments',
  'Wreaths', 'Dining', 'Lotuses', 'Gates', 'Lakes', 'Serpents', 'Roads',
  'Napoleon I', 'Maps', 'Saint Paul', 'Adoration of the Magi', 'Dolphins', 'Still Life',
  'Mothers', 'Theatre', 'Centaurs', 'Foxes', 'Grotesques', 'Artists', 'Bears',
  'Shells', 'Family', 'Nativity', 'Fireplaces', 'Bathing', 'Adam', 'Eve', 'Paris',
  'Servants', 'Villages', 'Drums', 'Self-portraits', 'Towns', 'Monks', 'Saint Jerome',
  'Warriors', 'Clouds', 'Seascapes', 'Parrots', 'Canals', 'New York City', 'Dishes',
  'Cups', 'Diana', 'Bacchus', 'Urns', 'Bishops', 'Obelisks', 'Peonies', 'Windows',
  'Jupiter', 'Violins', 'Fashion', 'Princes', 'Saint Catherine', 'Bedrooms', 'Athena',
  'Mercury', 'Lovers', 'London', 'Sports', 'Doves', 'Medals', 'Popes', 'Dance',
  'Dionysus', 'Leopards', 'Monsters', 'Psyche', 'Curtains', 'Unicorns', 'Globes',
  'Neptune', 'Phoenix', 'Devil', 'Moses', 'Windmills', 'Lambs', 'Sun', 'Boxing',
  'David', 'Winter', 'Farms', 'Saint Francis', 'Entombment', 'Beaches', 'Mars',
  'American Revolution', 'Parks', 'Tools', 'Horus', 'Jugs', 'Rain', 'Trumpets',
  'Knights', 'Corpses', 'Punishment', 'Witches', 'Ballet', 'Fireworks', 'Geese',
  'Vegetables', 'Umbrellas', 'Baskets', 'Allegory', 'Arrows', 'Lyres', 'Prisoners',
  'Stairs', 'Alexander The Great', 'Gods', 'Muses', 'Praying', 'Lamentation',
  'Judith', 'Poets', 'Apocalypse', 'Apples', 'Stars', 'Storms', 'Candlesticks',
  'Crowns', 'Medusa', 'Mosques', 'Last Supper', 'Wars', 'Washing', 'Courtyards',
  'Evening', 'Warriors', 'Lanterns', 'Markets', 'Reliquaries', 'Scrolls',
  'Last Judgement', 'Candles', 'Farmers', 'Jewelry', 'Weddings', 'Banquets',
  'Funerals', 'Ceremony', 'Caves', 'Wine', 'Night', 'Cathedrals', 'Processions',
  'Deserts', 'Castles', 'Summer', 'Spring', 'Autumn', 'Drawing', 'George Washington',
  'Abraham Lincoln', 'Marie Antoinette', 'Queen Victoria', 'Louis XIV', 'Mary Queen of Scots',
  'Don Quixote', 'Hamlet', 'Venus', 'Pastoral', 'Genre Scene', 'Daily Life',
  'Street Scene', 'Still Life', 'Self-portraits', 'Hell', 'Mythology', 'Resurrection',
  'Baptism of Christ', 'Descent from the Cross', 'Assumption of the Virgin',
  'Adoration of the Shepherds', 'French Revolution', 'Libraries', 'Philosophers',
  'Monks', 'Suffering', 'Sadness', 'Fear', 'Anger', 'Love', 'Contemplation',
];

// The system prompt is stable across requests, so we cache it.
const SYSTEM_PROMPT = `You translate aesthetic descriptions into structured art-search recipes for the Metropolitan Museum of Art collection.

Given a short phrase — which may describe a visual mood, aesthetic, book, film, TV show, historical period, place, artist, or cultural reference (e.g. "steampunk", "witchy botanicals", "The Brothers Karamazov", "Versailles", "ukiyo-e", "Film Noir", "Jane Austen") — translate it into the visual world it evokes and return a JSON object in this exact shape:

{
  "label": "Human-readable theme name",
  "description": "One sentence describing the aesthetic.",
  "source": "llm",
  "colorHex": "#RRGGBB",
  "filters": {
    "tags": ["tag1", "tag2"],
    "excludeTags": ["tag3"],
    "classifications": ["..."],
    "departments": ["..."],
    "cultures": ["..."],
    "mediumKeywords": ["..."],
    "dateRange": { "start": 1800, "end": 1950 },
    "isHighlight": false
  },
  "rationale": [
    "Plain-English explanation of filter 1",
    "Plain-English explanation of filter 2"
  ]
}

Rules:
- tags MUST only use values from this list (exact case): ${KNOWN_TAGS.join(', ')}
- classifications MUST only use values from this list (exact case): ${KNOWN_CLASSIFICATIONS.join(', ')}
- departments MUST only use values from this list (exact case): ${KNOWN_DEPARTMENTS.join(', ')}
- For cultural references (books, films, shows, historical figures, places), focus on the VISUAL world they evoke — settings, objects, mood, era — not the literal origin. Good examples:
  • "The Brothers Karamazov" → tags: Christ, Saints, Monks, Suffering, Interiors (NOT culture:"Russian" — Met's Russian collection is mostly textiles/silverware)
  • "Lord of the Rings" → tags: Dragons, Castles, Warriors, Mythical Creatures, Forests, Mountains (NOT culture:"British" or "Norse" — this is fictional; use the imagery)
  • "Pride and Prejudice" → tags: Portraits, Gardens, Interiors, Couples, dateRange 1790-1840
  • "Blade Runner" → tags: Cities, Night, Rain, Architecture
  • "Ancient Egypt" → tags: Hieroglyphs, Scarabs, Sphinx, Tombs, departments: Egyptian Art (here culture IS appropriate)
- excludeTags must also come from the same tag list above.
- mediumKeywords are substrings matched against the raw medium field (e.g. "oil", "watercolor", "bronze", "silk", "engraving", "ink"). Only use common material words — do NOT use stylistic terms like "gilded", "tempera", "icon" as they rarely match.
- cultures are geographic/ethnic origin strings (e.g. "French", "Japanese", "Egyptian"). Use ONLY when the geographic origin is genuinely the core of the aesthetic (e.g. "Japanese woodblock prints", "Ancient Egypt"). Never use cultures for fictional worlds, novels, films, or anything where the culture is inspiration rather than origin.
- dateRange uses years (negative for BC); omit if the aesthetic spans all eras
- isHighlight: true only if the query clearly favors blockbuster/famous works
- rationale: 2-4 short phrases a person would read to understand why these results match
- Use 2-6 tags. Omit any filter that doesn't clearly serve the aesthetic.
- colorHex (optional): a 6-digit hex color for the dominant color the aesthetic most strongly evokes. Include this whenever the aesthetic has a meaningful color association — err on the side of including. Examples: "brat summer" → "#8ACE00", "barbie" → "#FF69B4", "barbiecore" → "#FF69B4", "ocean" → "#006994", "prairiecore" → "#C8A87D", "red velvet" → "#8B1A1A", "forest" → "#228B22", "golden hour" → "#FDB347", "midnight" → "#191970", "cobalt ceramics" → "#0047AB". Omit ONLY when the aesthetic genuinely spans many colors with no single dominant hue (e.g. "dark academia", "steampunk", "art nouveau", "cottagecore").
- Output ONLY the raw JSON object. No markdown, no explanation, no code fences.`;

async function generateRecipe(userQuery) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Aesthetic: ${userQuery.trim()}`,
      },
    ],
  });

  // Extract the text block from the response (skip thinking blocks).
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text in model response');
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text.trim());
  } catch {
    throw new Error(`Model returned non-JSON: ${textBlock.text.slice(0, 200)}`);
  }

  // Always mark LLM-generated recipes as such.
  parsed.source = 'llm';

  const validation = validateRecipe(parsed);
  if (!validation.valid) {
    throw new Error(`Generated recipe failed validation: ${validation.errors.join('; ')}`);
  }

  return { recipe: validation.recipe, warnings: validation.warnings };
}

module.exports = { generateRecipe };
