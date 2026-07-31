// Capture 16:9 thumbnails for every sim listed in index.html's SIMS array.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/thumbs');
const PORT = 8787;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, d) => {
        if (e) { r.writeHead(404); return r.end('404'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(PORT, () => res(s));
  });
}

// Pull the SIMS array out of index.html and eval it in isolation.
function readSims() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const SIMS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('SIMS array not found in index.html');
  return eval(m[1]);
}

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const only = process.argv.slice(2);
  const server = await serve();
  const sims = readSims().filter(s => s.href && (!only.length || only.includes(slug(s.title))));
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  const report = [];
  for (const s of sims) {
    const name = slug(s.title);
    const url = /^https?:/.test(s.href)
      ? s.href
      : `http://localhost:${PORT}/${s.href.split('/').map(encodeURIComponent).join('/')}`;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await page.waitForTimeout(6000); // let 3D scenes / canvases settle
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      report.push({ name, url, ok: true, errs: errs.slice(0, 2) });
      console.log('OK  ', name);
    } catch (e) {
      report.push({ name, url, ok: false, err: String(e).slice(0, 160) });
      console.log('FAIL', name, String(e).slice(0, 100));
    }
    await page.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, 'shoot-report.json'), JSON.stringify(report, null, 2));
  console.log('\ndone:', report.filter(r => r.ok).length + '/' + report.length);
})();
