# Moodboard Museum

CC0 art from the Met, organized by aesthetic.

**[Live demo](#)** · Built with Node.js, React, SQLite, and the Anthropic API

---

## What it is

Moodboard Museum bridges internet aesthetics and art history. Type "dark academia" or "cottagecore" and it surfaces real, human-made artwork from the Metropolitan Museum of Art's permanent collection — not AI-generated images.

Every result is a real artwork with a known artist, date, and provenance. Every image is CC0-licensed and links back to its page on metmuseum.org.

## Why Moodboard Museum?

Ask an AI image generator to make a "cottagecore moodboard" and you'll get thatched cottages, wildflowers in ceramic jugs, a woman reading by a window with a cat. It's beautiful. It's also exactly what you expected.

That's how generative AI works: it learns to produce the statistical average of what the internet already agrees an aesthetic looks like. The result is consensus — polished, coherent, and completely unsurprising.

Moodboard Museum runs in the opposite direction.

Search "cottagecore" and you don't get a generated image that looks vaguely right. You get Frederic Church's Hudson River landscapes. Martin Johnson Heade's hummingbird over apple blossoms. A Winslow Homer watercolor of a Bermuda garden. Real paintings by real artists — and not the obvious ones. That's discovery, not generation.

Every result has a name, a date, and a story. You can cite it, research it, follow the thread from a TikTok aesthetic back through 200 years of art history. The feelings we associate with "cottagecore" or "dark academia" didn't emerge from nowhere — they have roots in real artistic traditions, and Moodboard Museum makes that lineage visible.

Gemini shows you what the internet thinks cottagecore looks like. Moodboard Museum shows you where cottagecore came from.

Currently sourcing from the Metropolitan Museum of Art's Open Access collection (CC0). Additional museums coming soon.

## Why it's different

AI image generators give you something that looks vaguely right. Moodboard Museum gives you Gustave Courbet.

Most art archive search tools rely on exact keyword matching — they fail with vibe-based queries. Moodboard Museum uses an LLM to translate aesthetic language ("witchy botanicals", "brat summer") into structured metadata filters, then searches 200,000+ CC0-licensed works from the Met's open access collection.

Each result includes a plain-language explanation of why it matched — "Oil paintings and drawings · From 1600 to 1900 · Tagged with Portraits, Books, or Architecture" — so the tool feels curatorial rather than algorithmic.

## Features

- **Curated themes** — 13 preset aesthetics including Dark Academia, Cottagecore, Goblincore, Hygge, Cats, and Celestial
- **Free-text search** — type any aesthetic and the LLM interprets it into a recipe
- **Match explanations** — every result tells you why it matched
- **CC0 guaranteed** — only public domain works, filtered at ingest
- **Met linkbacks** — every image links to its full record on metmuseum.org

## How it works

1. **Data pipeline** — downloads the Met's bulk CSV (470k objects), filters to ~248k public domain works, loads into SQLite
2. **Image enrichment** — calls the Met API to populate image URLs, with caching and resumability
3. **Theme recipes** — structured filter objects that map aesthetics to metadata (classifications, tags, date ranges, medium keywords)
4. **LLM translator** — for free-text queries, Claude interprets the aesthetic and returns a validated recipe in the same format as curated themes
5. **Query engine** — turns recipes into ranked SQL queries, returning results with match explanations

## Tech stack

- **Backend** — Node.js, Express, SQLite (sql.js)
- **Frontend** — React, Vite
- **AI** — Anthropic Claude API (theme interpretation only)
- **Data** — Met Museum Open Access collection (CC0)

## Running locally


```bash
# Install dependencies
npm install

# Build the database from the Met's bulk CSV
# Download MetObjects.csv from https://github.com/metmuseum/openaccess
npm run build-db -- path/to/MetObjects.csv

# Enrich with image URLs
npm run enrich

# Start the dev server
npm run dev
```


Set `ANTHROPIC_API_KEY` in your environment for free-text search.

## Deploying database updates

1. **Stop enrichment** — if `npm run enrich` is running, kill it so the DB isn't mid-write
2. **Regenerate the snapshot** — `node scripts/compress-db.js` (overwrites `data/moodboard.sqlite.snapshot.gz`)
3. **Commit and push** — `git add data/moodboard.sqlite.snapshot.gz && git commit -m "Update DB snapshot" && git push`
4. **Restart enrichment** — resume `npm run enrich` locally; the deployed server decompresses the new snapshot on next start

## Data sources

All artwork is from the [Metropolitan Museum of Art Open Access collection](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access), released under CC0. The Met asks that reproductions include a credit line linking back to the original object page — this site does so on every result.

## Acknowledgments

Built as a portfolio project. Inspired by the idea that the world's greatest museums have already made extraordinary art freely available — it just needs better search.
