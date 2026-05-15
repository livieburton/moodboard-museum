# Moodboard Museum — Setup Guide

This guide gets the project running on your own computer and hands it off to
Claude Code. It's written for someone who hasn't used a terminal much yet, so
it spells things out. If a step is obvious to you, just do it and move on.

---

## What you're about to do

Right now the project exists as a set of files we built together. You need to:

1. Get these files onto your computer
2. Install Node.js (the thing that runs the code)
3. Install the project's dependencies
4. Run the pipeline to confirm it works
5. Open the project in Claude Code and keep building

Budget about 20–30 minutes, most of which is installing things.

---

## Step 1 — Get the project files

Download the project files from this conversation and put the `moodboard-museum`
folder somewhere you'll find it again — `~/projects/moodboard-museum` is a fine
choice. (The `~` means your home folder.)

You should end up with a folder structure like this:

```
moodboard-museum/
  .gitignore
  package.json
  package-lock.json
  src/
    data/
      make-fixture.js
      sample-metobjects.csv
    pipeline/
      build-db.js
      db.js
      enrich-images.js
      met-api.js
      schema.js
      test-enrich.js
      verify-db.js
```

Note: there's no `node_modules/` folder yet and no `data/` folder yet. Those
get created in later steps. That's expected.

---

## Step 2 — Install Node.js

Node.js is the runtime that executes the project's JavaScript outside a browser.

1. Go to <https://nodejs.org>
2. Download the **LTS** version (LTS = "Long Term Support", the stable one)
3. Run the installer, accepting the defaults
4. Confirm it worked: open your terminal and run

   ```
   node --version
   ```

   You should see a version number like `v22.x.x`. Anything v18 or newer is
   fine for this project.

**Opening a terminal:**
- **macOS** — press Cmd+Space, type "Terminal", hit Enter
- **Windows** — press the Start key, type "PowerShell", hit Enter

---

## Step 3 — Install the project's dependencies

The project uses two external libraries (`sql.js` and `csv-parse`). They're
listed in `package.json`; `npm` installs them.

In your terminal, navigate to the project folder and install:

```
cd ~/projects/moodboard-museum
npm install
```

`cd` means "change directory". If you put the project somewhere else, use that
path instead. After `npm install` finishes (it may take a minute), you'll have
a new `node_modules/` folder. You never edit that folder — it's managed for you.

---

## Step 4 — Run the pipeline

Now confirm everything works. Run these one at a time:

```
npm run foundation
```

This regenerates the sample data, builds the database, and verifies it. You
should see a series of `PASS` lines and `All checks passed.`

```
npm run test-enrich
```

This tests the image-enrichment logic. You should see `10 passed, 0 failed`.

If both of those worked: **the data layer is running on your machine.** That's
the milestone.

### Optional: run enrichment for real

The tests above use mock data. To actually pull image URLs from the Met's API:

```
npm run enrich -- --limit 5
```

This enriches just 5 objects from the sample as a gentle test. (The `--` before
`--limit` is npm syntax — it passes the flag through to the script.) The first
run hits the Met's API; run the same command again and you'll see everything
come from cache instead.

> You'll only get real results here once you load the real Met dataset — the
> 10 sample objects use real Met object IDs, so a few should actually resolve.

### When you're ready for the full dataset

1. Download `MetObjects.csv` from <https://github.com/metmuseum/openaccess>
2. Put it in the project folder (the `.gitignore` is already set up to ignore
   it — it's ~300MB and shouldn't go into version control)
3. Build from it:

   ```
   npm run build-db -- ~/projects/moodboard-museum/MetObjects.csv
   npm run verify-db
   npm run enrich
   ```

   The full enrich will take a while (it's polite to the Met's servers on
   purpose). You can stop it with Ctrl+C and restart anytime — it resumes from
   the cache.

---

## Step 5 — Hand off to Claude Code

Now the part you've been building toward.

1. Open the **Claude Code** tab in your desktop app
2. Point it at the project folder. In the terminal, that's:

   ```
   cd ~/projects/moodboard-museum
   claude
   ```

3. A good first thing to say to Claude Code:

   > I'm building Moodboard Museum. The data pipeline in `src/pipeline/` is
   > done and working — it builds a SQLite database of CC0 artwork from the
   > Met and enriches it with image URLs. Read the pipeline files to get
   > oriented, then help me build the theme-query layer: the part that maps
   > an aesthetic like "dark academia" to a set of metadata filters.

Claude Code can read the files, run the npm scripts, and see real errors — so
it can pick up exactly where this conversation leaves off.

### A note on the npm install issue

Earlier we hit a problem in the chat sandbox where a library called
`better-sqlite3` wouldn't install, and we used `sql.js` instead. On your real
computer `better-sqlite3` will most likely install fine — but you don't need
it. `sql.js` works, all the tests pass with it, and it keeps the door open to
running the database in a browser later. If Claude Code suggests switching,
that's a real option, not a bug fix — just know it's optional.

---

## The map: where things are and what's next

**Done and tested:**
- `src/pipeline/schema.js` — database structure
- `src/pipeline/db.js` — database open/save (the only file tied to `sql.js`)
- `src/pipeline/build-db.js` — CSV in, filtered SQLite out
- `src/pipeline/verify-db.js` — sanity checks
- `src/pipeline/met-api.js` — polite Met API client (rate limiting, retries)
- `src/pipeline/enrich-images.js` — fills in image URLs, with caching
- `src/data/make-fixture.js` — generates the test sample

**Not built yet — your roadmap:**
1. **Theme-query layer** — map aesthetics ("dark academia", "cottagecore") to
   metadata filters. This is the heart of the project.
2. **Search interface** — a web UI to run those theme queries
3. **Moodboard builder** — select images, arrange them, save/export
4. **Polish** — the visual design pass that makes it portfolio-ready

**Later, if you want:** add more museums (the Art Institute of Chicago is the
natural next one — also CC0, also a clean API).

---

## If something goes wrong

- **`command not found: node`** — Node didn't install, or the terminal needs
  restarting. Close the terminal, reopen it, try `node --version` again.
- **`command not found: npm`** — same fix; npm comes bundled with Node.
- **`Cannot find module 'sql.js'`** — you skipped `npm install`, or you're not
  in the project folder. `cd` to the folder and run `npm install`.
- **`command not found: claude`** — Claude Code isn't installed yet. Install it
  per Anthropic's instructions, or open it from the desktop app's Claude Code
  tab directly.
- **Anything else** — paste the exact error into Claude Code and ask. Seeing
  real errors and fixing them is precisely what it's good at.
