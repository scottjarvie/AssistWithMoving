// Generates PWA icon PNGs from the brand mark (src/app/icon.svg) using sharp.
// Run: node scripts/generate-pwa-icons.mjs
// Outputs to public/icons/. Re-run if the brand mark or colors change.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

const BG = "#151411"; // brand dark — also the manifest background/theme color

// Regular (non-maskable) mark: the rounded-rect badge, edge to edge.
const regularSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="${BG}"/>
  <path d="M34 43.5 64 27l30 16.5v41L64 101 34 84.5z" fill="#78c99c"/>
  <path d="M64 27v34.5l30-18M64 61.5 34 43.5M64 61.5V101" fill="none" stroke="${BG}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M42 80h44" stroke="#f2b84b" stroke-width="7" stroke-linecap="round"/>
</svg>`;

// Maskable/apple mark: full-bleed dark background (the OS applies its own mask /
// rounding), with the mark scaled into the central ~67% safe zone (128 content
// centered in a 192 grid → 32px padding each side).
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="${BG}"/>
  <g transform="translate(32,32)">
    <path d="M34 43.5 64 27l30 16.5v41L64 101 34 84.5z" fill="#78c99c"/>
    <path d="M64 27v34.5l30-18M64 61.5 34 43.5M64 61.5V101" fill="none" stroke="${BG}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M42 80h44" stroke="#f2b84b" stroke-width="7" stroke-linecap="round"/>
  </g>
</svg>`;

const targets = [
  { name: "icon-192.png", size: 192, svg: regularSvg },
  { name: "icon-512.png", size: 512, svg: regularSvg },
  { name: "icon-maskable-192.png", size: 192, svg: maskableSvg },
  { name: "icon-maskable-512.png", size: 512, svg: maskableSvg },
  { name: "apple-touch-icon.png", size: 180, svg: maskableSvg },
];

await mkdir(outDir, { recursive: true });
for (const t of targets) {
  const png = await sharp(Buffer.from(t.svg))
    .resize(t.size, t.size, { fit: "contain" })
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, t.name), png);
  console.log(`wrote public/icons/${t.name} (${t.size}x${t.size}, ${png.length} bytes)`);
}
console.log("done");
