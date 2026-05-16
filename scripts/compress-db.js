const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const input = path.join(__dirname, '../data/moodboard.sqlite.snapshot');
const output = path.join(__dirname, '../data/moodboard.sqlite.snapshot.gz');

const inStream = fs.createReadStream(input);
const outStream = fs.createWriteStream(output);
const gzip = zlib.createGzip({ level: 9 });

inStream.pipe(gzip).pipe(outStream);

outStream.on('finish', () => {
  const inSize = fs.statSync(input).size;
  const outSize = fs.statSync(output).size;
  console.log(`Input:  ${(inSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Output: ${(outSize / 1024 / 1024).toFixed(2)} MB`);
});
