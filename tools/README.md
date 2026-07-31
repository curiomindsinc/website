# tools/

Build-time scripts. Nothing here is served — they only generate files in `assets/`.

## Setup (once)

```
cd tools
npm install
npx playwright install chromium
```

## Adding a new sim

1. Add the entry to the `SIMS` array in `index.html`.
2. Regenerate its card thumbnail:

```
cd tools
node shoot.js <slug>     # slug = title lowercased, non-alphanumerics -> "-"
node towebp.js
```

`shoot.js` with no arguments re-shoots **all** sims. It serves the repo on
`localhost:8787` so local sims load with their assets, then screenshots each at
1280x720 after a 6s settle.

## If a thumbnail lands on a splash screen or intro modal

`reshoot.js` clicks past intros before shooting. Add the sim's slug to the `PLAN`
object at the top of the file (`clicks` = how many Next/Start buttons to press,
`settle` = ms to wait after, `fill` = text for a name-entry field), then:

```
node reshoot.js
node towebp.js
```

## Other

- `towebp.js` — converts `assets/thumbs/*.png` to 960x540 WebP and deletes the PNGs (`--keep` to keep them). Card markup points at `.webp`.
- `og.js` — rebuilds `assets/og-cover.png`, the 1200x630 link-preview image. Re-run only if the logo or tagline changes.

## Cards

Thumbnail filenames are derived from the sim title, so a renamed sim needs a
re-shoot. `index.html` computes the same slug client-side.
