# Assist With Moving — brand asset handoff

Delivered locally on 5 September 2026 from the round-six family exploration.

**Current candidate: MV01-K.** MV01-K is Scott’s current kraft preference. It remains a logo palette study.

## What is ready

- `logo-candidate.png`: standalone native-resolution crop of the board candidate, 617 × 579.
- `variants/`: all 1 retained choices with stable IDs.
- `icons/`: PNG 16/32/48, a three-size ICO, Apple-touch 180, app 192/512, and a separately padded 512 maskable candidate.
- `palette.json`: intended colors and evidence, separate from raster pixel colors.
- `sources/`: original source images; `asset-manifest.json` records crops and hashes.
- `preview.html`: candidate, alternatives and actual-size icon comparison.

## What is not yet a master

These are raster concepts with an opaque warm paper background. They are usable as light-background image candidates, not transparent dark-mode artwork. Some original crops are small; large app exports do not add source detail. No clean SVG master of this selected plug logo is supplied. Do not put a PNG in an SVG wrapper and describe it as a vector master.

Raster candidate exported; integration and actual browser tab verification still needed. The 16 px preview is a design check, not proof of a live browser icon.

## Integration locations inspected

- src/app/icon.svg
- public/icons/apple-touch-icon.png
- src/app/manifest.ts
- src/components/brand-mark.tsx
- src/app/layout.tsx
- src/components/brand-mark.tsx
- src/app/(product)/layout.tsx
- src/app/(product)/app/moves/[moveId]/layout.tsx

## Use in the project

This is a supporting design handoff, not a new tracker or a production release. Preserve the existing product philosophy and design tokens. Use the repository’s existing tracker for adoption work. Treat the listed choices as candidates; do not claim Scott selected an unresolved color or alternate.

For an initial light-background preview, use the supplied PNG at or below its native size with the existing product wordmark. When installing icons, update the existing icon/metadata/manifest entry points together so an old generated icon route does not win over the new files. Merge icon entries into the existing manifest; do not replace app names, start URLs, theme colors, authentication, or other manifest settings. Use the separately padded maskable file for maskable purpose.

Before public rollout, review the final mark in its actual header, browser tab and phone icon; preserve accessible product naming; check light and dark modes; inspect the 16/32 px versions. For Finances and Family History, refine a compact favicon rather than treating the reduced detailed logo as final. Build genuine path-based SVG masters from the selected drawings as the next asset-production step, then regenerate the size set from those masters.

No live app imports, existing icons, product CSS or registry entries were changed by this delivery. Files are copied locally, not committed, pushed or deployed.

Reference guidance: [MDN document icons](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#icon), [maskable safe zone](https://web.dev/articles/maskable-icon).

## 5 September 2026 — SVG production addendum

The [new SVG master package](svg-masters/README.md) now provides real editable vector drawings, transparent PNGs, monochrome/reverse variants and vector-derived favicons. This supersedes the earlier format limitation recorded above. It does not declare unresolved logo/color preferences final and does not change live branding. The previous raster files remain as historical comparison evidence.

## 5 September 2026 — selected family assets and favicon installation

Scott selected the family artwork and requested delivery plus favicon installation. [Selected SVGs and platform icons](selected-assets/README.md) supersede the earlier candidate-only status above. Both Plants choices remain available: PL02 is the installed default, PL03 is the selected last-pass alternate. Favicon and Apple-touch assets installed in the local app; existing install-manifest icon assets updated where present. Header components, product palette tokens and existing historical packages remain unchanged. This entry records local source installation, not a commit or live deployment.
