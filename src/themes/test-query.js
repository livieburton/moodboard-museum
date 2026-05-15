/**
 * test-query.js — exercises the theme-query layer against the sample database.
 *
 * Run after building the sample DB:
 *   node src/pipeline/build-db.js && node src/themes/test-query.js
 *
 * The sample fixture has 10 public-domain objects:
 *   Paintings (5): Van Gogh Wheat Field, Madame X, Van Gogh Self-Portrait,
 *                  Bruegel Harvesters, Raphael Madonna
 *   Prints    (2): Hokusai Great Wave, Rembrandt etching
 *   Sculpture (2): Egyptian Imhotep, Greek kouros
 *   Glass     (1): Tiffany Vase
 */

const assert = require('assert');
const { queryTheme } = require('./query');
const { validateRecipe, EXAMPLE_RECIPES } = require('./theme-recipe');

async function run() {
  console.log('\nMoodboard Museum — theme-query tests\n');
  let passed = 0;
  let failed = 0;

  const check = (label, fn) => {
    try {
      fn();
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${label}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  };

  const checkAsync = async (label, fn) => {
    try {
      await fn();
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${label}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  };

  // --- validateRecipe unit tests -------------------------------------------

  console.log('  [validator]');

  check('valid recipe passes', () => {
    const result = validateRecipe({
      label: 'Test',
      filters: { tags: ['Portraits'] },
      source: 'curated',
    });
    assert.strictEqual(result.valid, true);
    assert.ok(result.recipe);
  });

  check('recipe with no filters is rejected', () => {
    const result = validateRecipe({ label: 'Empty', filters: {} });
    assert.strictEqual(result.valid, false);
  });

  check('recipe with no label is rejected', () => {
    const result = validateRecipe({ filters: { tags: ['Portraits'] } });
    assert.strictEqual(result.valid, false);
  });

  check('unknown classification is dropped with a warning, not an error', () => {
    const result = validateRecipe({
      label: 'Test',
      filters: { classifications: ['Paintings', 'NotARealType'] },
      source: 'llm',
    });
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.recipe.filters.classifications, ['Paintings']);
    assert.ok(result.warnings.length > 0);
  });

  check('dateRange with start > end is rejected', () => {
    const result = validateRecipe({
      label: 'Bad dates',
      filters: { dateRange: { start: 1900, end: 1600 } },
    });
    assert.strictEqual(result.valid, false);
  });

  check('curated rationale is preserved as-is', () => {
    const result = validateRecipe({
      label: 'Custom Rationale',
      filters: { tags: ['Portraits'] },
      rationale: ['Hand-written reason'],
      source: 'curated',
    });
    assert.deepStrictEqual(result.recipe.rationale, ['Hand-written reason']);
  });

  check('auto-generated rationale is used when none is provided', () => {
    const result = validateRecipe({
      label: 'Auto',
      filters: { tags: ['Landscapes', 'Flowers'] },
      source: 'llm',
    });
    assert.ok(result.recipe.rationale.length > 0);
    assert.ok(result.recipe.rationale.some((r) => r.includes('Landscapes')));
  });

  // --- queryTheme integration tests ----------------------------------------

  console.log('\n  [query — tag filters]');

  await checkAsync('tag filter: Portraits returns objects tagged Portraits', async () => {
    const out = await queryTheme({
      label: 'Portrait query',
      filters: { tags: ['Portraits'] },
      source: 'curated',
    });
    // Sample has 2 objects tagged Portraits: Madame X (437853), Raphael Madonna (435809)
    assert.ok(out.count >= 2, `expected >=2 results, got ${out.count}`);
    const ids = out.results.map((r) => r.object_id);
    assert.ok(ids.includes(437853), 'expected Madame X (437853)');
    assert.ok(ids.includes(435809), 'expected Raphael Madonna (435809)');
  });

  await checkAsync('tag filter: objects with more matching tags rank higher', async () => {
    // Bruegel Harvesters has Landscapes AND Men; Van Gogh Wheat Field has Landscapes only.
    // Query for both tags — Harvesters should rank above Wheat Field.
    const out = await queryTheme({
      label: 'Multi-tag rank',
      filters: { tags: ['Landscapes', 'Men'] },
      source: 'curated',
    });
    const ids = out.results.map((r) => r.object_id);
    const harvesterPos = ids.indexOf(436121);
    const wheatPos = ids.indexOf(436535);
    assert.ok(harvesterPos !== -1, 'Harvesters should be in results');
    assert.ok(wheatPos !== -1, 'Wheat Field should be in results');
    assert.ok(harvesterPos < wheatPos, 'Harvesters (2 tags) should rank above Wheat Field (1 tag)');
  });

  await checkAsync('tag filter: no matching tags returns empty results', async () => {
    const out = await queryTheme({
      label: 'No match',
      filters: { tags: ['Dragons', 'Spaceships'] },
      source: 'curated',
    });
    assert.strictEqual(out.count, 0);
    assert.deepStrictEqual(out.results, []);
  });

  console.log('\n  [query — classification and department filters]');

  await checkAsync('classification filter: Paintings returns only paintings', async () => {
    const out = await queryTheme({
      label: 'Paintings only',
      filters: { classifications: ['Paintings'] },
      source: 'curated',
    });
    assert.strictEqual(out.count, 5, `expected 5 paintings, got ${out.count}`);
    for (const r of out.results) {
      assert.strictEqual(r.classification, 'Paintings', `unexpected classification: ${r.classification}`);
    }
  });

  await checkAsync('classification filter: Sculpture returns only sculpture', async () => {
    const out = await queryTheme({
      label: 'Sculpture only',
      filters: { classifications: ['Sculpture'] },
      source: 'curated',
    });
    assert.strictEqual(out.count, 2, `expected 2 sculptures, got ${out.count}`);
  });

  await checkAsync('combined tag + classification filter narrows results', async () => {
    // Portraits exist in Paintings — Madame X, Raphael Madonna
    const out = await queryTheme({
      label: 'Portrait paintings',
      filters: { tags: ['Portraits'], classifications: ['Paintings'] },
      source: 'curated',
    });
    assert.ok(out.count >= 2);
    for (const r of out.results) {
      assert.strictEqual(r.classification, 'Paintings');
    }
  });

  console.log('\n  [query — date range filter]');

  await checkAsync('date range excludes objects outside the era', async () => {
    // Range 1500–1700 should include Raphael (1505), Bruegel (1565), Rembrandt (1639).
    // Excludes: Van Gogh (~1887-1889), Hokusai (1830-32), Madame X (1883),
    //           Imhotep (-332), kouros (-590), Tiffany (1900).
    const out = await queryTheme({
      label: 'Old Masters era',
      filters: { dateRange: { start: 1500, end: 1700 } },
      source: 'curated',
    });
    for (const r of out.results) {
      const withinEra =
        (r.begin_date === null || r.begin_date <= 1700) &&
        (r.end_date === null || r.end_date >= 1500);
      assert.ok(withinEra, `object ${r.object_id} (${r.begin_date}–${r.end_date}) outside era`);
    }
    const ids = out.results.map((r) => r.object_id);
    assert.ok(ids.includes(435809), 'expected Raphael (1505)');
    assert.ok(ids.includes(436121), 'expected Bruegel (1565)');
    assert.ok(ids.includes(436947), 'expected Rembrandt (1639)');
  });

  console.log('\n  [query — medium filter]');

  await checkAsync('medium keyword filter: oil matches oil paintings', async () => {
    // Van Gogh Wheat (oil on canvas), Madame X (oil on canvas),
    // Van Gogh Self-Portrait (oil on canvas), Raphael (oil and gold on wood),
    // Bruegel (oil on wood) → 5 objects
    const out = await queryTheme({
      label: 'Oil works',
      filters: { mediumKeywords: ['oil'] },
      source: 'curated',
    });
    assert.ok(out.count >= 4, `expected >=4 oil works, got ${out.count}`);
    for (const r of out.results) {
      assert.ok(
        r.medium && r.medium.toLowerCase().includes('oil'),
        `object ${r.object_id} medium "${r.medium}" doesn't contain "oil"`
      );
    }
  });

  console.log('\n  [query — result shape]');

  await checkAsync('results carry matchReason string', async () => {
    const out = await queryTheme({
      label: 'Shape test',
      filters: { tags: ['Portraits'] },
      rationale: ['Portraits are people'],
      source: 'curated',
    });
    assert.ok(out.matchReason.length > 0);
    for (const r of out.results) {
      assert.strictEqual(typeof r.matchReason, 'string');
      assert.ok(r.matchReason.length > 0);
    }
  });

  await checkAsync('result tags is an array, not a pipe-delimited string', async () => {
    const out = await queryTheme({
      label: 'Tags shape',
      filters: { tags: ['Landscapes'] },
      source: 'curated',
    });
    for (const r of out.results) {
      assert.ok(Array.isArray(r.tags), `tags should be an array, got ${typeof r.tags}`);
    }
  });

  await checkAsync('matchReason reflects the recipe rationale', async () => {
    const out = await queryTheme({
      label: 'Rationale test',
      filters: { tags: ['Men'] },
      rationale: ['Works featuring men', 'From the sample collection'],
      source: 'curated',
    });
    assert.strictEqual(out.matchReason, 'Works featuring men · From the sample collection');
    for (const r of out.results) {
      assert.strictEqual(r.matchReason, 'Works featuring men · From the sample collection');
    }
  });

  console.log('\n  [query — error handling]');

  await checkAsync('invalid recipe throws rather than querying the DB', async () => {
    let threw = false;
    try {
      await queryTheme({ filters: { tags: ['Portraits'] } }); // no label
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('Invalid recipe'));
    }
    assert.ok(threw, 'expected queryTheme to throw on invalid recipe');
  });

  console.log('\n  [query — example recipes]');

  await checkAsync('dark-academia example recipe is valid and runs', async () => {
    const out = await queryTheme(EXAMPLE_RECIPES['dark-academia']);
    // Sample DB is small and doesn't have oil paintings from 1600–1900
    // tagged with Portraits/Books/Architecture — that's fine, we just verify it runs.
    assert.ok(typeof out.count === 'number');
    assert.ok(Array.isArray(out.results));
    assert.ok(out.matchReason.length > 0);
  });

  await checkAsync('cottagecore example recipe is valid and runs', async () => {
    const out = await queryTheme(EXAMPLE_RECIPES['cottagecore']);
    assert.ok(typeof out.count === 'number');
    assert.ok(Array.isArray(out.results));
  });

  // --- report ---------------------------------------------------------------
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
