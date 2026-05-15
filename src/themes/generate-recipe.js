/**
 * generate-recipe.js — translates free-text aesthetics into theme recipes.
 *
 * The only export is generateRecipe(userQuery). It calls claude-opus-4-7
 * with a cached system prompt containing the full recipe vocabulary, then
 * validates the returned JSON through validateRecipe before returning it.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateRecipe, KNOWN_CLASSIFICATIONS, KNOWN_DEPARTMENTS } = require('./theme-recipe');

// The system prompt is stable across requests, so we cache it.
const SYSTEM_PROMPT = `You translate aesthetic descriptions into structured art-search recipes for the Metropolitan Museum of Art collection.

Given a short phrase describing a visual mood or aesthetic (e.g. "steampunk", "witchy botanicals", "1970s sci-fi"), return a JSON object in this exact shape:

{
  "label": "Human-readable theme name",
  "description": "One sentence describing the aesthetic.",
  "source": "llm",
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
- classifications MUST only use values from this list (exact case): ${KNOWN_CLASSIFICATIONS.join(', ')}
- departments MUST only use values from this list (exact case): ${KNOWN_DEPARTMENTS.join(', ')}
- tags should be evocative subject terms likely to appear in museum tag vocabularies (e.g. "Portraits", "Flowers", "Battles", "Animals", "Landscapes", "Skulls", "Ships", "Fire")
- excludeTags: use to remove off-aesthetic content. Examples: if the query is feminine/women-focused, add "Men" to excludeTags; if peaceful, add "Battle", "Military", "Soldiers"; if nature-focused, add "Portraits"
- mediumKeywords are substrings matched against medium field (e.g. "oil", "watercolor", "bronze", "silk", "engraving", "ink")
- cultures are geographic/ethnic origin strings (e.g. "French", "Japanese", "Egyptian")
- dateRange uses years (negative for BC); omit if the aesthetic spans all eras
- isHighlight: true only if the query clearly favors blockbuster/famous works
- rationale: 2-4 short phrases a person would read to understand why these results match
- Use 2-6 tags. Omit any filter that doesn't clearly serve the aesthetic.
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
