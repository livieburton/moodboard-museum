/**
 * make-fixture.js — generates a correctly-aligned sample CSV.
 *
 * The real MetObjects.csv has 54 columns. Hand-aligning test rows across that
 * many fields is hopelessly error-prone, so instead we define each sample
 * artwork as a clean object and let this script place every value in its
 * correct column. Run it to (re)generate the fixture:
 *   node src/data/make-fixture.js
 *
 * To add a sample artwork, just add an object to SAMPLE_ARTWORKS below —
 * unspecified fields are written as empty, exactly like the real export.
 */

const fs = require('fs');
const path = require('path');

// The exact 54-column header of the Met's MetObjects.csv, in order.
const HEADERS = [
  'Object Number', 'Is Highlight', 'Is Timeline Work', 'Is Public Domain',
  'Object ID', 'Gallery Number', 'Department', 'AccessionYear', 'Object Name',
  'Title', 'Culture', 'Period', 'Dynasty', 'Reign', 'Portfolio',
  'Constituent ID', 'Artist Role', 'Artist Prefix', 'Artist Display Name',
  'Artist Display Bio', 'Artist Suffix', 'Artist Alpha Sort',
  'Artist Nationality', 'Artist Begin Date', 'Artist End Date', 'Artist Gender',
  'Artist ULAN URL', 'Artist Wikidata URL', 'Object Date', 'Object Begin Date',
  'Object End Date', 'Medium', 'Dimensions', 'Credit Line', 'Geography Type',
  'City', 'State', 'County', 'Country', 'Region', 'Subregion', 'Locale',
  'Locus', 'Excavation', 'River', 'Classification', 'Rights and Reproduction',
  'Link Resource', 'Object Wikidata URL', 'Metadata Date', 'Repository',
  'Tags', 'Tags AAT URL', 'Tags Wikidata URL',
];

// Sample artworks as clean structured data. A mix of public-domain and
// copyrighted works, multiple departments, and deliberately messy cases
// (missing titles, missing dates, BC dates, missing artists) so the pipeline
// gets exercised properly.
const SAMPLE_ARTWORKS = [
  {
    'Object ID': 436535, 'Is Highlight': 'True', 'Is Public Domain': 'True',
    'Department': 'European Paintings', 'Object Name': 'Painting',
    'Title': 'Wheat Field with Cypresses', 'Artist Display Name': 'Vincent van Gogh',
    'Artist Display Bio': 'Dutch, Zundert 1853–1890 Auvers-sur-Oise',
    'Artist Nationality': 'Dutch', 'Object Date': '1889',
    'Object Begin Date': 1889, 'Object End Date': 1889, 'Medium': 'Oil on canvas',
    'Credit Line': 'Purchase, The Annenberg Foundation Gift, 1993',
    'Classification': 'Paintings', 'Gallery Number': '822',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/436535',
    'Tags': 'Cypresses|Wheat|Landscapes',
  },
  {
    'Object ID': 459123, 'Is Public Domain': 'True',
    'Department': 'Asian Art', 'Object Name': 'Print',
    'Title': 'The Great Wave off Kanagawa', 'Culture': 'Japan',
    'Period': 'Edo period (1615–1868)', 'Artist Display Name': 'Katsushika Hokusai',
    'Artist Display Bio': 'Japanese, Tokyo (Edo) 1760–1849 Tokyo (Edo)',
    'Artist Nationality': 'Japanese', 'Object Date': 'ca. 1830–32',
    'Object Begin Date': 1830, 'Object End Date': 1832,
    'Medium': 'Polychrome woodblock print; ink and color on paper',
    'Credit Line': 'H. O. Havemeyer Collection, 1929', 'Classification': 'Prints',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/459123',
    'Tags': 'Waves|Mountains|Boats',
  },
  {
    'Object ID': 437853, 'Is Highlight': 'True', 'Is Public Domain': 'True',
    'Department': 'European Paintings', 'Object Name': 'Painting',
    'Title': 'Madame X (Madame Pierre Gautreau)',
    'Artist Display Name': 'John Singer Sargent',
    'Artist Display Bio': 'American, Florence 1856–1925 London',
    'Artist Nationality': 'American', 'Object Date': '1883–84',
    'Object Begin Date': 1883, 'Object End Date': 1884, 'Medium': 'Oil on canvas',
    'Credit Line': 'Arthur Hoppock Hearn Fund, 1916', 'Classification': 'Paintings',
    'Gallery Number': '634',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/437853',
    'Tags': 'Portraits|Women|Dresses',
  },
  {
    // Copyrighted — MUST be filtered out by the pipeline.
    'Object ID': 11207, 'Is Public Domain': 'False',
    'Department': 'Modern and Contemporary Art', 'Object Name': 'Painting',
    'Title': 'Autumn Rhythm (Number 30)', 'Artist Display Name': 'Jackson Pollock',
    'Artist Display Bio': 'American, Cody, Wyoming 1912–1956 East Hampton, New York',
    'Artist Nationality': 'American', 'Object Date': '1950',
    'Object Begin Date': 1950, 'Object End Date': 1950, 'Medium': 'Enamel on canvas',
    'Credit Line': 'George A. Hearn Fund, 1957', 'Classification': 'Paintings',
    'Rights and Reproduction': '© 2024 Pollock-Krasner Foundation',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/11207',
  },
  {
    'Object ID': 436105, 'Is Highlight': 'True', 'Is Public Domain': 'True',
    'Department': 'European Paintings', 'Object Name': 'Painting',
    'Title': 'Self-Portrait with a Straw Hat', 'Artist Display Name': 'Vincent van Gogh',
    'Artist Display Bio': 'Dutch, Zundert 1853–1890 Auvers-sur-Oise',
    'Artist Nationality': 'Dutch', 'Object Date': '1887',
    'Object Begin Date': 1887, 'Object End Date': 1887, 'Medium': 'Oil on canvas',
    'Credit Line': 'Bequest of Miss Adelaide Milton de Groot, 1967',
    'Classification': 'Paintings', 'Gallery Number': '825',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/436105',
    'Tags': 'Self-portraits|Hats|Men',
  },
  {
    'Object ID': 207869, 'Is Public Domain': 'True',
    'Department': 'The American Wing', 'Object Name': 'Vase', 'Title': 'Vase',
    'Culture': 'American', 'Artist Display Name': 'Tiffany & Co.',
    'Artist Display Bio': '1837–present', 'Artist Nationality': 'American',
    'Object Date': '1900', 'Object Begin Date': 1900, 'Object End Date': 1900,
    'Medium': 'Favrile glass', 'Credit Line': 'Gift of H. O. Havemeyer, 1896',
    'Classification': 'Glass', 'City': 'New York', 'State': 'New York',
    'Country': 'United States',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/207869',
    'Tags': 'Flowers',
  },
  {
    // BC dates — exercises negative integer handling. No artist.
    'Object ID': 544442, 'Is Timeline Work': 'True', 'Is Public Domain': 'True',
    'Department': 'Egyptian Art', 'Object Name': 'Statuette',
    'Title': 'Striding figure of Imhotep', 'Culture': 'Egyptian',
    'Period': 'Ptolemaic Period', 'Object Date': '332 BC–30 BC',
    'Object Begin Date': -332, 'Object End Date': -30, 'Medium': 'Bronze',
    'Credit Line': 'Rogers Fund, 1926', 'Classification': 'Sculpture',
    'Country': 'Egypt',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/544442',
    'Tags': 'Men',
  },
  {
    'Object ID': 436121, 'Is Highlight': 'True', 'Is Public Domain': 'True',
    'Department': 'European Paintings', 'Object Name': 'Painting',
    'Title': 'The Harvesters', 'Artist Display Name': 'Pieter Bruegel the Elder',
    'Artist Display Bio': 'Netherlandish, Breda (?) ca. 1525–1569 Brussels',
    'Artist Nationality': 'Netherlandish', 'Object Date': '1565',
    'Object Begin Date': 1565, 'Object End Date': 1565, 'Medium': 'Oil on wood',
    'Credit Line': 'Rogers Fund, 1919', 'Classification': 'Paintings',
    'Gallery Number': '800',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/436121',
    'Tags': 'Landscapes|Harvest|Men|Wheat',
  },
  {
    // BC dates, no artist — another negative-date case.
    'Object ID': 488221, 'Is Public Domain': 'True',
    'Department': 'Greek and Roman Art', 'Object Name': 'Statue',
    'Title': 'Marble statue of a kouros (youth)', 'Culture': 'Greek',
    'Period': 'Archaic', 'Object Date': 'ca. 590–580 BC',
    'Object Begin Date': -590, 'Object End Date': -580, 'Medium': 'Marble',
    'Credit Line': 'Fletcher Fund, 1932', 'Classification': 'Sculpture',
    'Country': 'Greece',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/488221',
    'Tags': 'Men|Nudes',
  },
  {
    // Copyrighted — MUST be filtered out.
    'Object ID': 337134, 'Is Public Domain': 'False',
    'Department': 'Costume Institute', 'Object Name': 'Dress',
    'Title': '"Pivoine" Evening Dress', 'Culture': 'French',
    'Artist Display Name': 'House of Dior', 'Artist Display Bio': 'French, founded 1947',
    'Artist Nationality': 'French', 'Object Date': 'fall/winter 2007–8',
    'Object Begin Date': 2007, 'Object End Date': 2008, 'Medium': 'silk',
    'Credit Line': 'Gift of Christian Dior Couture, 2009', 'Classification': 'Costume',
    'Rights and Reproduction': '© House of Dior', 'Country': 'France',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/337134',
  },
  {
    'Object ID': 435809, 'Is Highlight': 'True', 'Is Public Domain': 'True',
    'Department': 'European Paintings', 'Object Name': 'Painting',
    'Title': 'Madonna and Child', 'Culture': 'Italian',
    'Artist Display Name': 'Raphael (Raffaello Sanzio or Santi)',
    'Artist Display Bio': 'Italian, Urbino 1483–1520 Rome',
    'Artist Nationality': 'Italian', 'Object Date': 'ca. 1505',
    'Object Begin Date': 1505, 'Object End Date': 1505,
    'Medium': 'Oil and gold on wood',
    'Credit Line': 'The Friedsam Collection, 1931', 'Classification': 'Paintings',
    'Gallery Number': '824',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/435809',
    'Tags': 'Madonna and Child|Portraits|Women|Children',
  },
  {
    // Deliberately missing Title — exercises null-title handling.
    'Object ID': 436947, 'Is Timeline Work': 'True', 'Is Public Domain': 'True',
    'Department': 'Drawings and Prints', 'Object Name': 'Print',
    'Title': '', 'Artist Display Name': 'Rembrandt (Rembrandt van Rijn)',
    'Artist Display Bio': 'Dutch, Leiden 1606–1669 Amsterdam',
    'Artist Nationality': 'Dutch', 'Object Date': '1639',
    'Object Begin Date': 1639, 'Object End Date': 1639, 'Medium': 'Etching',
    'Credit Line': 'Gift of Henry Walters, 1917', 'Classification': 'Prints',
    'Link Resource': 'https://www.metmuseum.org/art/collection/search/436947',
    'Tags': 'Self-portraits|Men',
  },
];

// Escape a single CSV field per RFC 4180: wrap in quotes if it contains a
// comma, quote, or newline; double any internal quotes.
function escapeField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function generate() {
  const lines = [HEADERS.join(',')];

  for (const artwork of SAMPLE_ARTWORKS) {
    const row = HEADERS.map((header) => escapeField(artwork[header]));
    lines.push(row.join(','));
  }

  const outPath = path.join(__dirname, 'sample-metobjects.csv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n');

  const pd = SAMPLE_ARTWORKS.filter((a) => a['Is Public Domain'] === 'True').length;
  console.log(`\nWrote ${SAMPLE_ARTWORKS.length} sample artworks to ${outPath}`);
  console.log(`  ${pd} public domain, ${SAMPLE_ARTWORKS.length - pd} copyrighted ` +
    `(should be filtered out by the pipeline)\n`);
}

if (require.main === module) generate();

module.exports = { generate, HEADERS, SAMPLE_ARTWORKS };
