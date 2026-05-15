# Moodboard Museum

CC0 art from the Met, organized by aesthetic.

**[Live demo](#)** · Built with Node.js, React, SQLite, and the Anthropic API

---

## What it is

Moodboard Museum bridges internet aesthetics and art history. Type "dark academia" or "cottagecore" and it surfaces real, human-made artwork from the Metropolitan Museum of Art's permanent collection — not AI-generated images.

Every result is a real artwork with a known artist, date, and provenance. Every image is CC0-licensed and links back to its page on metmuseum.org.

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

## Data sources

All artwork is from the [Metropolitan Museum of Art Open Access collection](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access), released under CC0. The Met asks that reproductions include a credit line linking back to the original object page — this site does so on every result.

## Acknowledgments

Built as a portfolio project. Inspired by the idea that the world's greatest museums have already made extraordinary art freely available — it just needs better search.
