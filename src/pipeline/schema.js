/**
 * Database schema for Moodboard Museum.
 *
 * Two tables:
 *   objects      — one row per artwork (the searchable core)
 *   object_tags  — one row per (object, tag) pair; the Met ships tags
 *                  pipe-delimited, but normalizing them into their own
 *                  table makes theme-matching ("show me everything tagged
 *                  'Cypresses'") a clean indexed query instead of a LIKE scan.
 *
 * Image columns (primary_image, primary_image_small) are intentionally left
 * nullable: the bulk CSV does NOT include image URLs, so they're populated in
 * a later enrichment pass that hits the Met API per object.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS objects (
  object_id           INTEGER PRIMARY KEY,
  title               TEXT,
  artist_name         TEXT,
  artist_bio          TEXT,
  artist_nationality  TEXT,
  object_date         TEXT,     -- human-readable, e.g. "ca. 1830–32"
  begin_date          INTEGER,  -- numeric, for era range filtering
  end_date            INTEGER,
  medium              TEXT,
  classification      TEXT,     -- "Paintings", "Prints", "Sculpture"...
  department          TEXT,
  culture             TEXT,
  period              TEXT,
  credit_line         TEXT,
  gallery_number      TEXT,
  is_highlight        INTEGER,  -- 0/1 — useful for ranking/featuring
  is_public_domain    INTEGER,  -- 0/1 — should always be 1 post-filter
  link_resource       TEXT,     -- URL back to the Met's object page
  wikidata_url        TEXT,
  primary_image       TEXT,     -- nullable; filled by API enrichment
  primary_image_small TEXT      -- nullable; filled by API enrichment
);

CREATE TABLE IF NOT EXISTS object_tags (
  object_id  INTEGER NOT NULL REFERENCES objects(object_id),
  tag        TEXT NOT NULL
);

-- Indexes that match how the theme-query layer will actually search:
CREATE INDEX IF NOT EXISTS idx_objects_classification ON objects(classification);
CREATE INDEX IF NOT EXISTS idx_objects_department     ON objects(department);
CREATE INDEX IF NOT EXISTS idx_objects_dates          ON objects(begin_date, end_date);
CREATE INDEX IF NOT EXISTS idx_objects_highlight      ON objects(is_highlight);
CREATE INDEX IF NOT EXISTS idx_tags_tag               ON object_tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_object            ON object_tags(object_id);
`;

// The columns we pull out of the Met's CSV, in the order the loader maps them.
// Left side = our schema column, right side = exact CSV header string.
const CSV_COLUMN_MAP = {
  object_id:          'Object ID',
  title:              'Title',
  artist_name:        'Artist Display Name',
  artist_bio:         'Artist Display Bio',
  artist_nationality: 'Artist Nationality',
  object_date:        'Object Date',
  begin_date:         'Object Begin Date',
  end_date:           'Object End Date',
  medium:             'Medium',
  classification:     'Classification',
  department:         'Department',
  culture:            'Culture',
  period:             'Period',
  credit_line:        'Credit Line',
  gallery_number:     'Gallery Number',
  is_highlight:       'Is Highlight',
  is_public_domain:   'Is Public Domain',
  link_resource:      'Link Resource',
  wikidata_url:       'Object Wikidata URL',
};

module.exports = { SCHEMA, CSV_COLUMN_MAP };
