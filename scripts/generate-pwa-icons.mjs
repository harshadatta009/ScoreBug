/**
 * Generates the PWA icon set (and screenshot placeholders) referenced by
 * src/app/manifest.ts, rendered from an inline SVG of the Scorebug brand mark
 * (white lucide "Trophy" on the green `--primary` background, #166534).
 *
 * Run:  node scripts/generate-pwa-icons.mjs
 * Requires: sharp (already a transitive dep via Next.js image optimization).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ICONS_DIR = join(ROOT, "public", "icons");
const SHOTS_DIR = join(ROOT, "public", "screenshots");

const GREEN = "#166534";
const WHITE = "#ffffff";

// lucide "Trophy" path data, drawn on a 24×24 viewBox, stroke-based.
const TROPHY = `
  <g fill="none" stroke="${WHITE}" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </g>`;

/**
 * @param size      output px (square)
 * @param maskable  true => green fills entire square edge-to-edge and the
 *                  trophy shrinks into the 80% safe zone; false => rounded
 *                  square with a little inset, trophy at ~50%.
 */
function iconSvg(size, maskable) {
  const radius = maskable ? 0 : Math.round(size * 0.22);
  // Trophy occupies this fraction of the canvas, centered.
  const markFrac = maskable ? 0.46 : 0.54;
  const markPx = size * markFrac;
  const offset = (size - markPx) / 2;
  const scale = markPx / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${GREEN}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${TROPHY}</g>
  </svg>`;
}

function screenshotSvg(w, h, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#0f172a"/>
    <g transform="translate(${(w - 120) / 2} ${h * 0.32}) scale(5)">${TROPHY}</g>
    <text x="50%" y="${h * 0.62}" fill="${WHITE}" font-family="sans-serif"
          font-size="22" font-weight="700" text-anchor="middle">Scorebug</text>
    <text x="50%" y="${h * 0.67}" fill="#94a3b8" font-family="sans-serif"
          font-size="15" text-anchor="middle">${label}</text>
  </svg>`;
}

async function png(svg, outPath) {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log("✓", outPath.replace(ROOT, "."));
}

await mkdir(ICONS_DIR, { recursive: true });
await mkdir(SHOTS_DIR, { recursive: true });

await png(iconSvg(192, false), join(ICONS_DIR, "icon-192.png"));
await png(iconSvg(512, false), join(ICONS_DIR, "icon-512.png"));
await png(iconSvg(512, true), join(ICONS_DIR, "icon-maskable-512.png"));

// Apple touch icon (180×180) — referenced implicitly by appleWebApp metadata.
await png(iconSvg(180, false), join(ICONS_DIR, "apple-touch-icon.png"));

// favicon (32×32) for the browser tab.
await png(iconSvg(32, false), join(ROOT, "public", "favicon.ico"));

await png(
  screenshotSvg(390, 844, "Live scoring interface"),
  join(SHOTS_DIR, "scoring-mobile.png"),
);
await png(
  screenshotSvg(390, 844, "Full scorecard"),
  join(SHOTS_DIR, "scorecard-mobile.png"),
);

console.log("\nPWA assets generated. Replace these placeholders with real art when ready.");
