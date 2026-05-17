const express = require('express');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use('/api/themes', require('./routes/themes'));
app.use('/api/search', require('./routes/search'));
app.use('/api/image-proxy', require('./routes/image-proxy'));

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Moodboard Museum server on http://localhost:${PORT}`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'API key loaded' : 'API KEY MISSING');
});
