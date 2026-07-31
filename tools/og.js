// Build assets/og-cover.png — the 1200x630 link-preview card used by the OG/Twitter tags.
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const W = 1200, H = 630;

const bg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glowRed" cx="62%" cy="34%" r="55%">
      <stop offset="0%" stop-color="#D94F6B" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#D94F6B" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBlue" cx="18%" cy="76%" r="60%">
      <stop offset="0%" stop-color="#2B4A8A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#2B4A8A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#1B2F5E"/>
  <rect width="${W}" height="${H}" fill="url(#glowBlue)"/>
  <rect width="${W}" height="${H}" fill="url(#glowRed)"/>
  <text x="80" y="86" font-family="Verdana,DejaVu Sans,sans-serif" font-size="20"
        fill="#FFFFFF" fill-opacity="0.20" letter-spacing="14">&#10022; &#10023; &#10022; &#10023; &#10022; &#10023;</text>
</svg>`;

const text = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="420" y="250" font-family="Verdana,DejaVu Sans,sans-serif" font-size="66" font-weight="bold" fill="#FFFFFF">Curio<tspan fill="#D94F6B">Minds</tspan>.inc</text>
  <text x="424" y="298" font-family="Verdana,DejaVu Sans,sans-serif" font-size="23" font-weight="bold" fill="#FFFFFF" fill-opacity="0.55" letter-spacing="4">WHERE CONCEPTS CLICK.</text>
  <text x="424" y="372" font-family="Verdana,DejaVu Sans,sans-serif" font-size="27" fill="#FFFFFF" fill-opacity="0.88">Free science simulations for</text>
  <text x="424" y="412" font-family="Verdana,DejaVu Sans,sans-serif" font-size="27" fill="#FFFFFF" fill-opacity="0.88">Singapore secondary classrooms</text>
  <text x="424" y="480" font-family="Verdana,DejaVu Sans,sans-serif" font-size="21" fill="#F5C842">MOE-aligned &#183; No login &#183; Any browser</text>
</svg>`;

(async () => {
  const D = 260;
  const mask = Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`);
  const logo = await sharp(path.join(ROOT, 'assets', 'logo.webp'))
    .resize(D, D, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  await sharp(Buffer.from(bg))
    .composite([
      { input: logo, top: Math.round((H - D) / 2), left: 110 },
      { input: Buffer.from(text), top: 0, left: 0 },
    ])
    .png()
    .toFile(path.join(ROOT, 'assets', 'og-cover.png'));

  console.log('OK   assets/og-cover.png');
})();
