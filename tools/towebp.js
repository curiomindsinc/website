// Convert assets/thumbs/*.png -> .webp (960x540, quality 78) and drop the PNG sources.
// Pass --keep to leave the PNGs in place.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.resolve(__dirname, '..', 'assets', 'thumbs');
const KEEP = process.argv.includes('--keep');

(async () => {
  const pngs = fs.readdirSync(DIR).filter(f => f.endsWith('.png'));
  let before = 0, after = 0;

  for (const f of pngs) {
    const src = path.join(DIR, f);
    const dst = src.replace(/\.png$/, '.webp');
    before += fs.statSync(src).size;
    await sharp(src)
      .resize(960, 540, { fit: 'cover', position: 'top' })
      .webp({ quality: 78 })
      .toFile(dst);
    after += fs.statSync(dst).size;
    if (!KEEP) fs.unlinkSync(src);
    console.log('OK  ', path.basename(dst), (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
  }

  console.log(`\n${pngs.length} files: ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024 / 1024).toFixed(2)}MB`);
})();
