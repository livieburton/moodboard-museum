const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use('/api/themes', require('./routes/themes'));
app.use('/api/search', require('./routes/search'));
app.use('/api/random', require('./routes/random'));
app.use('/api/image-proxy', require('./routes/image-proxy'));


if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;

async function ensureDatabase() {
  const dbPath  = path.join(__dirname, '..', 'data', 'moodboard.sqlite');
  const gzPath  = path.join(__dirname, '..', 'data', 'moodboard.sqlite.snapshot.gz');

  if (fs.existsSync(dbPath)) {
    console.log('Database found, skipping decompression.');
    return;
  }

  if (!fs.existsSync(gzPath)) {
    console.error('ERROR: no database or compressed snapshot found at', gzPath);
    process.exit(1);
  }

  console.log('Decompressing database snapshot…');
  await pipeline(
    fs.createReadStream(gzPath),
    zlib.createGunzip(),
    fs.createWriteStream(dbPath),
  );
  const mb = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2);
  console.log(`Database ready (${mb} MB).`);
}

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Moodboard Museum server on http://localhost:${PORT}`);
      console.log(process.env.ANTHROPIC_API_KEY ? 'API key loaded' : 'API KEY MISSING');
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
