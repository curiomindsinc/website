// One-step deploy: pull the GitHub repo, build dist/, copy it in, commit, push.
// Cloudflare Pages rebuilds curiomindsinc.pages.dev from the push (~20s).
//
//   node tools/deploy.js "what changed"
//   node tools/deploy.js              (asks for a message)
//
// Safety: if a file on GitHub is NEWER than your local copy (e.g. edited on the
// GitHub website), the deploy stops and lists it instead of overwriting it.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const REPO = path.resolve(ROOT, '..', 'curiominds-website-repo');
const REPO_URL = 'https://github.com/curiomindsinc/website.git';
const SITE = 'https://curiomindsinc.pages.dev';
const TEXT = /\.(html?|js|css|json|txt|xml|md|sql|svg)$/i;

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const fail = msg => { console.error('\nSTOPPED: ' + msg); process.exit(1); };
const ask = q => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); res(a.trim()); });
});

// Same content, ignoring Windows vs Unix line endings for text files.
function same(a, b) {
  let x = fs.readFileSync(a), y = fs.readFileSync(b);
  if (TEXT.test(a)) { x = x.toString('utf8').replace(/\r/g, ''); y = y.toString('utf8').replace(/\r/g, ''); }
  return Buffer.isBuffer(x) ? x.equals(y) : x === y;
}

function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    e.isDirectory() ? walk(dir, r, out) : out.push(r);
  }
  return out;
}

(async () => {
  // 1. Get the repo up to date.
  if (!fs.existsSync(path.join(REPO, '.git'))) {
    console.log('Cloning repo into', REPO);
    execFileSync('git', ['clone', REPO_URL, REPO], { stdio: 'inherit' });
  }
  if (git('status', '--porcelain')) fail(`the repo copy has uncommitted changes:\n${REPO}\nCommit or discard them first.`);
  console.log('Pulling latest from GitHub...');
  try { git('pull', '--ff-only', 'origin', 'main'); }
  catch { fail('git pull failed. Open the repo folder and run "git pull" to see why.'); }

  // 2. Build dist/.
  execFileSync(process.execPath, [path.join(__dirname, 'build-dist.js')], { stdio: 'inherit' });

  // 3. Compare dist/ with the repo; refuse to overwrite newer GitHub edits.
  // functions/ holds the Pages Functions (/api/messages, /api/notify); it is not in dist/.
  const files = [...walk(DIST).map(f => ['dist', f]), ['tools', 'build-dist.js'], ['tools', 'deploy.js'],
    ...walk(path.join(ROOT, 'functions')).map(f => ['functions', f]), ['.', 'schema.sql']];
  const changed = [], newerOnGithub = [];
  for (const [from, f] of files) {
    const src = from === 'dist' ? path.join(DIST, f) : path.join(ROOT, from, f);
    const rel = from === 'dist' ? f : path.join(from, f);
    const dst = path.join(REPO, rel);
    if (fs.existsSync(dst) && same(src, dst)) continue;
    if (fs.existsSync(dst)) {
      const orig = path.join(ROOT, rel);
      // build-dist.js adds head tags to sim pages, so dist/ can differ from the project file.
      // If GitHub still holds exactly my project file, nothing was edited there: safe to replace.
      const untouched = from === 'dist' && same(orig, dst);
      if (!untouched) {
        const committed = Number(git('log', '-1', '--format=%ct', '--', rel.replace(/\\/g, '/'))) * 1000;
        // dist/ copies get fresh timestamps, so check the original file in the project.
        // A sim page in dist/ is also built from index.html (title, description) and build-dist.js.
        let local = fs.statSync(orig).mtimeMs;
        if (from === 'dist' && /\.html$/i.test(f)) {
          local = Math.max(local, fs.statSync(path.join(ROOT, 'index.html')).mtimeMs,
            fs.statSync(path.join(__dirname, 'build-dist.js')).mtimeMs);
        }
        if (committed > local) { newerOnGithub.push(rel); continue; }
      }
    }
    changed.push([src, dst, rel]);
  }
  if (newerOnGithub.length) {
    fail('these files are newer on GitHub than on this computer:\n  ' + newerOnGithub.join('\n  ') +
      `\nCopy them from\n  ${REPO}\ninto this project (if the GitHub version is right), then run deploy again.`);
  }
  if (!changed.length) { console.log('\nNothing changed — site is already up to date.'); return; }

  console.log(`\n${changed.length} file(s) to upload:`);
  changed.forEach(([, , rel]) => console.log('  ' + rel));

  // 4. Commit message.
  let msg = process.argv.slice(2).join(' ');
  if (!msg) msg = await ask('\nWhat changed? (commit message, blank = cancel): ');
  if (!msg) fail('cancelled, nothing uploaded.');

  // Coming-soon cards that this deploy turns into live sims (old = live site, new = this build).
  const { simsIn, linkFor } = require('./notify-db');
  let launched = [], vanished = [];
  try {
    const before = simsIn(path.join(REPO, 'index.html')), after = simsIn(path.join(DIST, 'index.html'));
    for (const old of before.filter(s => s.comingSoon)) {
      const now = after.find(s => s.title === old.title);
      if (!now) vanished.push(old.title);
      else if (now.href && !now.comingSoon) launched.push({ title: now.title, link: linkFor(now.href) });
    }
  } catch (e) { console.log('(Could not compare coming-soon cards: ' + e.message + ')'); }

  // 5. Copy, commit, push.
  for (const [src, dst] of changed) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  git('add', '-A');
  git('commit', '-q', '-m', msg);
  console.log('Pushing to GitHub...');
  try { execFileSync('git', ['push', 'origin', 'main'], { cwd: REPO, stdio: 'inherit' }); }
  catch { fail('git push failed (see above). Your commit is saved in the repo copy; run "git push" there to retry.'); }

  console.log(`\nDone: ${git('log', '-1', '--format=%h')} pushed. ${SITE} updates in about 20 seconds.`);

  // 6. Launch emails for "Notify me" sign-ups. Never fails the deploy: it is already pushed.
  if (launched.length || vanished.length) {
    try {
      const { launch } = require('./launch-email');
      const { emailsFor } = require('./notify-db');
      for (const s of launched) await launch(s.title, { link: s.link, confirm: 'ask' });
      for (const t of vanished) {
        const n = emailsFor(t).length;
        if (n) console.log(`\n"${t}" was coming soon and is no longer on the site (renamed?). ${n} people were waiting.` +
          `\n  See them:  node tools/notify-list.js "${t}"`);
      }
    } catch (e) { console.log('\nLaunch email step did not finish: ' + e.message); }
  }
})();
