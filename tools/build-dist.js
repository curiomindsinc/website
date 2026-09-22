// Copy only the files the live site needs into ../dist, ready for `wrangler pages deploy dist`.
// Keeps private files (CV, notes, backups, .bak files) off the site.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const LIMIT = 25 * 1024 * 1024; // Cloudflare Pages per-file limit

// Pull the SIMS array out of index.html and eval it in isolation.
function readSims() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const SIMS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('SIMS array not found in index.html');
  return eval(m[1]);
}

const files = ['index.html', 'about.html', 'robots.txt', 'sitemap.xml'];
const dirs = ['assets'];
for (const s of readSims()) {
  if (s.href && !/^https?:/.test(s.href)) files.push(s.href);
}

fs.rmSync(DIST, { recursive: true, force: true });
let total = 0, count = 0, missing = 0;
const copy = rel => {
  const src = path.join(ROOT, rel), dst = path.join(DIST, rel);
  if (!fs.existsSync(src)) { console.log('MISSING', rel); missing++; return; }
  const size = fs.statSync(src).size;
  if (size > LIMIT) console.log('TOO BIG', rel, (size / 1048576).toFixed(1) + ' MB');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  total += size; count++;
};
files.forEach(copy);
for (const d of dirs) {
  const walk = rel => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })
    .forEach(e => e.isDirectory() ? walk(path.join(rel, e.name)) : copy(path.join(rel, e.name)));
  walk(d);
}

console.log(`dist/: ${count} files, ${(total / 1048576).toFixed(1)} MB` + (missing ? `, ${missing} missing` : ''));
if (missing) process.exit(1);
