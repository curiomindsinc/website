// Copy only the files the live site needs into ../dist, ready for `wrangler pages deploy dist`.
// Keeps private files (CV, notes, backups, .bak files) off the site.
//
// Each sim page in dist/ also gets link-preview and search tags added to its <head>
// (description, canonical, Open Graph, Twitter card, LearningResource data) and the launch
// counter beacon (/api/launch, live site only), built from
// its card in the SIMS array. The sim's own source html is never changed, so the offline
// file stays exactly as built. The preview picture is assets/og/<slug>.jpg, made here
// from the card thumbnail assets/thumbs/<slug>.webp.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://curiomindsinc.pages.dev';
const LIMIT = 25 * 1024 * 1024; // Cloudflare Pages per-file limit
const SUBJECT = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology',
  'earth-science': 'Earth Science', astronomy: 'Astronomy', beyond: 'Life skills' };

// Pull the SIMS array out of index.html and eval it in isolation.
function readSims() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const SIMS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('SIMS array not found in index.html');
  return eval(m[1]);
}

// Same slug as index.html and tools/shoot.js.
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Live address of a sim: no .html (Cloudflare serves clean URLs), hub index.html -> folder/.
const simUrl = href => SITE + '/' + href.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')
  .split('/').map(encodeURIComponent).join('/');

// Make assets/og/<slug>.jpg (1200x630) for every sim whose thumbnail is newer or has no jpg yet.
async function buildOgImages(sims) {
  const sharp = require('sharp');
  const outDir = path.join(ROOT, 'assets', 'og');
  fs.mkdirSync(outDir, { recursive: true });
  let made = 0;
  for (const s of sims) {
    const src = path.join(ROOT, 'assets', 'thumbs', slug(s.title) + '.webp');
    const dst = path.join(outDir, slug(s.title) + '.jpg');
    if (!fs.existsSync(src)) { console.log('NO THUMB', s.title); continue; }
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    await sharp(src).resize(1200, 630, { fit: 'cover', position: 'top' }).jpeg({ quality: 82, mozjpeg: true }).toFile(dst);
    made++;
  }
  if (made) console.log(`assets/og/: ${made} preview image(s) made`);
}

// Add the tags a sim page does not already have, right after its <title>.
function addHeadTags(html, s) {
  const at = html.search(/<\/title>/i);
  if (at < 0) { console.log('NO <title>, tags not added:', s.href); return html; }
  const has = re => re.test(html);
  const url = simUrl(s.href);
  const ogFile = path.join('assets', 'og', slug(s.title) + '.jpg');
  const img = fs.existsSync(path.join(ROOT, ogFile)) ? `${SITE}/assets/og/${slug(s.title)}.jpg` : `${SITE}/assets/og-cover.png`;
  const title = attr(s.title), desc = attr(s.desc);
  const tags = [];
  if (!has(/<meta\s+name=["']description["']/i)) tags.push(`<meta name="description" content="${desc}">`);
  if (!has(/<link\s+rel=["']canonical["']/i)) tags.push(`<link rel="canonical" href="${url}">`);
  if (!has(/<meta\s+property=["']og:/i)) tags.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="CurioMinds.inc">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Screenshot of ${title}">`);
  if (!has(/<meta\s+name=["']twitter:card["']/i)) tags.push(
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${img}">`);
  if (!has(/application\/ld\+json/i)) {
    const ld = {
      '@context': 'https://schema.org', '@type': 'LearningResource',
      name: s.title, description: s.desc, url, image: img,
      learningResourceType: 'Simulation', interactivityType: 'active',
      about: SUBJECT[s.cat] || 'Science',
      educationalLevel: (s.levels && s.levels.length)
        ? s.levels.map(l => ({ sec: 'Lower Secondary (Singapore)', o: 'GCE O-Level', a: 'GCE A-Level' })[l])
        : 'Secondary school (Singapore)',
      ...(s.topics && s.topics.length ? { keywords: s.topics.join(', ') } : {}),
      audience: { '@type': 'EducationalAudience', educationalRole: ['student', 'teacher'] },
      inLanguage: 'en', isAccessibleForFree: true,
      provider: { '@type': 'EducationalOrganization', name: 'CurioMinds.inc', url: SITE + '/' },
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  // Launch counter: one beacon when the page opens on the live site. Never runs from a saved file.
  const host = JSON.stringify(new URL(SITE).hostname);
  const body = JSON.stringify(JSON.stringify({ sim: s.title })).replace(/</g, '\\x3c');
  tags.push(`<script>if(location.hostname===${host}&&navigator.sendBeacon)` +
    `navigator.sendBeacon("/api/launch",new Blob([${body}],{type:"application/json"}))</script>`);
  const cut = at + '</title>'.length;
  return html.slice(0, cut) + '\n' + tags.join('\n') + html.slice(cut);
}

(async () => {
  const sims = readSims().filter(s => s.href && !/^https?:/.test(s.href));
  await buildOgImages(sims);

  const files = ['index.html', 'about.html', 'impact.html', 'robots.txt', 'sitemap.xml', '_redirects',
    'google2ca19aafd4576171.html', // Google Search Console verification
    'stats.html']; // launch counts per sim (not linked, noindex)
  const dirs = ['assets', 'colleagues']; // colleague sims linked from impact.html
  // Raw source files (uncropped screenshots with participant names, feedback PDF) stay private;
  // the page uses the cleaned copies in assets/impact/.
  const SKIP = [path.join('assets', 'professional impact')];
  for (const s of sims) {
    // A hub (folder/index.html) links to sibling pages, so ship the whole folder.
    if (path.basename(s.href) === 'index.html') dirs.push(path.dirname(s.href));
    else files.push(s.href);
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
      .forEach(e => { const r = path.join(rel, e.name); if (SKIP.includes(r) || /\.bak[^\\/]*$/i.test(e.name)) return; e.isDirectory() ? walk(r) : copy(r); });
    walk(d);
  }

  // Link-preview and search tags for each sim page (dist copy only).
  let tagged = 0;
  for (const s of sims) {
    const dst = path.join(DIST, s.href);
    if (!fs.existsSync(dst)) continue;
    const before = fs.readFileSync(dst, 'utf8');
    const after = addHeadTags(before, s);
    if (after !== before) { fs.writeFileSync(dst, after); tagged++; }
  }

  console.log(`dist/: ${count} files, ${(total / 1048576).toFixed(1)} MB, ${tagged} sim pages tagged` + (missing ? `, ${missing} missing` : ''));
  if (missing) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
