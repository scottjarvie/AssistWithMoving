// Regenerates the in-page install prompt image using sharp.
// Run: node scripts/generate-pwa-icons.mjs
// The versioned manifest and Apple touch icons use separately approved artwork.
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

await mkdir(outDir, { recursive: true });
const png = await sharp(Buffer.from(regularSvg))
  .resize(192, 192, { fit: "contain" })
  .png()
  .toBuffer();
await writeFile(path.join(outDir, "icon-192.png"), png);
console.log(`wrote public/icons/icon-192.png (${png.length} bytes)`);
