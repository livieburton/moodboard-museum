const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { pipeline } = require('stream/promises');

const db = path.join(__dirname, '../data/moodboard.sqlite');
const gz = path.join(__dirname, '../data/moodboard.sqlite.snapshot.gz');

async function main() {
  if (fs.existsSync(db)) {
    console.log('Database already exists, skipping decompression.');
    return;
  }

  console.log(`Decompressing ${path.basename(gz)} → ${path.basename(db)}...`);
  await pipeline(
    fs.createReadStream(gz),
    zlib.createGunzip(),
    fs.createWriteStream(db)
  );
  const size = fs.statSync(db).size;
  console.log(`Done. Database ready (${(size / 1024 / 1024).toFixed(2)} MB).`);
}

main().catch(err => {
  console.error('prepare-db failed:', err.message);
  process.exit(1);
});
