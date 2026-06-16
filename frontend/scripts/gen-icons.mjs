// Generates the Polaris Quant brand-mark icons (North Star) in every size the
// app references. Run: node scripts/gen-icons.mjs
// Requires `sharp` (already a dependency via Next image optimization).
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const BRAND_STAR_SCALE = 0.68;
const MASKABLE_STAR_SCALE = 0.62;

// 8-point north star: a 4-point on-axis star + a smaller 45°-rotated star.
const star = (fill, opacity2 = 0.5) => `
  <g fill="${fill}">
    <path d="M256 40 L305 207 L472 256 L305 305 L256 472 L207 305 L40 256 L207 207 Z"/>
    <path d="M256 130 L274 238 L382 256 L274 274 L256 382 L238 274 L130 256 L238 238 Z"
          opacity="${opacity2}" transform="rotate(45 256 256)"/>
  </g>`;

// Main brand mark: white star on a rounded dark badge.
const brand = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Polaris Quant">
  <rect width="512" height="512" rx="96" fill="#111111"/>
  <g transform="translate(256 256) scale(${BRAND_STAR_SCALE}) translate(-256 -256)">${star("#ffffff")}</g>
</svg>`;

// Maskable: full-bleed background, star shrunk into the safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111111"/>
  <g transform="translate(256 256) scale(${MASKABLE_STAR_SCALE}) translate(-256 -256)">${star("#ffffff")}</g>
</svg>`;

// Monochrome: solid silhouette on transparent (the OS recolors it).
const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
${star("#000000", 1)}
</svg>`;

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(PUBLIC, out));
}

await writeFile(join(PUBLIC, "pwa-icon.svg"), `${brand}\n`);
await writeFile(join(PUBLIC, "icons", "polaris-mark.svg"), `${brand}\n`);
await writeFile(join(PUBLIC, "icons", "polaris-maskable.svg"), `${maskable}\n`);
await writeFile(join(PUBLIC, "icons", "polaris-monochrome.svg"), `${monochrome}\n`);

await png(brand, 192, "pwa-icon-192.png");
await png(brand, 512, "pwa-icon-512.png");
await png(brand, 180, "apple-touch-icon.png");
await png(maskable, 512, "icons/polaris-maskable-512.png");
await png(monochrome, 512, "icons/polaris-monochrome-512.png");

console.log("✓ Regenerated brand-mark icons (North Star)");
