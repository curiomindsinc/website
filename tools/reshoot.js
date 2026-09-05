// Re-capture sims whose first frame is a splash / modal: click past the intro first.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/thumbs');
const PORT = 8788;

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

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readSims() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const SIMS = (\[[\s\S]*?\n\]);/);
  return eval(m[1]);
}

// slug -> how many "advance" clicks, whether a name field needs filling, and
// whether the intro is dismissed by clicking anywhere on the canvas (bodyClick).
//
// `preWait` overrides the default 4s pause before the first click — the launcher
// sims pull their code from jsDelivr, so their intro does not exist yet at 4s.
// `until` is the intro's own element: clicking stops as soon as it goes away, so
// a "Skip" that closes the whole deck cannot spill the remaining clicks onto the
// HUD underneath. `clicks` is then just an upper bound.
// `dismiss` names the advance button outright instead of hunting for one by its
// label; `escape` presses Esc afterwards, for sims that open on a cinematic.
// `then` is a list of selectors clicked once each after the intro is gone — for
// putting the sim into the state worth photographing rather than its first frame.
//
// `prep` runs in the page instead of clicking anything, and is what the three
// jsDelivr-hosted EcoVerse sims use. Clicking their intro decks through was
// unreliable — a click would intermittently never settle and wedge the run — and
// the deck is only an overlay over an already-running scene, so removing the node
// gets the same frame without the click loop. Sims with a `prep` take no clicks.
const PLAN = {
  'chemical-equation-balancer':   { fill: 'Class 2E', clicks: 2, settle: 4000 },
  'coral-reef-explorer':          { clicks: 8, settle: 8000 },
  'ecoverse-savanna':             { clicks: 6, settle: 8000 },
  'natural-selection-simulator':  { clicks: 6, settle: 6000 },
  'solar-system-builder':         { clicks: 5, settle: 6000 },
  'ray-diagram-simulator':        { clicks: 2, settle: 4000 },
  'ecoverse-ant-colony':          { clicks: 0, preWait: 9000, settle: 9000,
    prep: `document.querySelector('#intro')?.remove();` },
  'ecoverse-hydrothermal-vent':   { clicks: 0, preWait: 9000, settle: 9000,
    prep: `document.querySelector('#intro-overlay')?.remove();` },
  // Parked at spring low: at high tide the flats are under water and the shore
  // the sim is about is not in the picture at all. The tide panel's own slider
  // holds the waterline, so this is the state a visitor can reach too.
  'ecoverse-chek-jawa':           { clicks: 0, preWait: 9000, settle: 20000,
    prep: `document.querySelector('#intro-overlay')?.remove();
           const s = document.querySelector('#tide-scrub');
           if (s) { s.value = '-0.45';
                    s.dispatchEvent(new Event('input',  { bubbles: true }));
                    s.dispatchEvent(new Event('change', { bubbles: true })); }` },
};

const ADVANCE = /^(next|start|begin|continue|play|got it|skip|enter|let's go|let's dive|launch|go|ok|okay|start session|start simulation|begin voyage|explore|dive in|dive|get started|i'm ready|ready)/i;

async function clickAdvance(page) {
  const els = await page.$$('button, a[role="button"], .btn, [class*="btn"], [class*="button"]');
  for (const el of els) {
    try {
      if (!(await el.isVisible())) continue;
      const t = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ');
      if (t && ADVANCE.test(t)) { await el.click({ timeout: 3000 }); return t; }
    } catch {}
  }
  // Fallback: some intros use a plain div/span as the button, so match on text alone
  // and click the deepest element carrying it.
  const hit = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const nodes = [...document.querySelectorAll('body *')].filter(el => {
      if (el.children.length) return false;                    // leaf nodes only
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 40 || !re.test(t)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 20 && r.height > 10;
    });
    if (!nodes.length) return null;
    const el = nodes[0];
    const t = el.textContent.trim().replace(/\s+/g, ' ');
    (el.closest('button, a, [role="button"]') || el.parentElement || el).click();
    return t;
  }, ADVANCE.source);
  return hit;
}

// Third-party hosting badges (base44 etc.) that would otherwise land in the thumbnail.
async function scrubBadges(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const t = (el.textContent || '').trim();
      const hasBadgeText = /^(Edit with|Made with|Built with|Powered by)\b/i.test(t) && t.length < 40;
      const linksOut = el.tagName === 'A' && /base44\.|lovable\.|vercel\.app\/badge/i.test(el.href || '');
      if (!hasBadgeText && !linksOut) continue;
      const fixed = el.closest('*');
      let node = el;
      while (node && node !== document.body && getComputedStyle(node).position !== 'fixed') node = node.parentElement;
      (node && node !== document.body ? node : fixed).style.display = 'none';
    }
  });
}

(async () => {
  const server = await serve();
  const only = process.argv.slice(2);
  const sims = readSims().filter(s => s.href && PLAN[slug(s.title)] && (!only.length || only.includes(slug(s.title))));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  for (const s of sims) {
    const name = slug(s.title);
    const plan = PLAN[name];
    const url = /^https?:/.test(s.href)
      ? s.href
      : `http://localhost:${PORT}/${s.href.split('/').map(encodeURIComponent).join('/')}`;
    const page = await ctx.newPage();
    const trail = [];
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await page.waitForTimeout(plan.preWait || 4000);

      if (plan.prep) { await page.evaluate(plan.prep); trail.push('(prep)'); await page.waitForTimeout(1000); }

      if (plan.fill) {
        for (const inp of await page.$$('input[type="text"], input:not([type])')) {
          try { if (await inp.isVisible()) await inp.fill(plan.fill); } catch {}
        }
      }
      for (let i = 0; i < (plan.bodyClick || 0); i++) {
        await page.mouse.click(640, 400);
        trail.push('(canvas)');
        await page.waitForTimeout(2000);
      }
      for (let i = 0; i < plan.clicks; i++) {
        if (plan.until && !await page.$(plan.until).then(el => el && el.isVisible()).catch(() => false)) break;
        let hit;
        if (plan.dismiss) {
          const el = await page.$(plan.dismiss);
          if (!el || !await el.isVisible().catch(() => false)) break;
          await el.click({ timeout: 3000 }).catch(() => {});
          hit = ((await el.textContent().catch(() => '')) || plan.dismiss).trim();
        } else {
          hit = await clickAdvance(page);
        }
        if (!hit) break;
        trail.push(hit);
        await page.waitForTimeout(1500);
      }
      if (plan.escape) { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
      for (const sel of plan.then || []) {
        const el = await page.$(sel);
        if (!el) { console.log('  (then: no', sel + ')'); continue; }
        await el.click({ timeout: 3000 }).catch(() => {});
        trail.push(sel);
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(plan.settle);
      await scrubBadges(page);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      console.log('OK  ', name, '| clicked:', trail.join(' > ') || '(nothing)');
    } catch (e) {
      console.log('FAIL', name, String(e).slice(0, 120));
    }
    await page.close();
  }

  await browser.close();
  server.close();
})();
