# Assist With Moving — MV01-K SVG master study

Created 5 September 2026 in the family branding task. This package supersedes the raster-only format limitation of the earlier handoff, not the owner’s remaining design choices.

Kraft box with light flaps, clean seams, and a plug crossing the front fold.

## Files

- logo.svg — full-color, transparent, editable vector drawing.
- logo-mono-ink.svg / logo-mono-white.svg — single-color and reverse versions. Use the white version on dark ground; do not place a dark colored master on a dark header and assume sufficient contrast.
- logo-512.png / logo-mono-white-512.png — transparent PNGs rendered from these SVGs.
- favicon-mark.svg — transparent favicon drawing.
- icons/favicon.svg — self-contained color favicon on an opaque light tile.
- icons/favicon.ico — 16/32/48 images in an ICO container.
- icons/ — 16/32/48 PNGs, 180 Apple-touch, 192/512 app icons, and separate padded 512 maskable SVG/PNG.
- reference.png — previous raster candidate for comparison.
- palette.json / asset-manifest.json — color context, source ID and format truth.

## Implementation

Use SVG via an img element with appropriate accessible product naming, or import the paths into the existing brand component. When inlining multiple instances, prefix mask IDs per instance to avoid duplicate-ID collisions. No external fonts, bitmaps, CSS variables or network resources are needed. Keep original aspect ratio; do not stretch.

The existing handoff README one directory above records the repository’s icon and metadata entry points. Adopt header mark, favicon, Apple icon and manifest entries together through that project’s existing release process. Keep the current product name, app settings and manifest start URL. These files do not modify the product’s global palette.

The exact source silhouettes are interpreted as clean curves, not traced pixel-for-pixel. Review the visual comparison before claiming final design adoption. MV01-K is Scott’s current kraft preference. It remains a logo palette study.

No app imports or live website icons were replaced.

## Header sizing

The logo SVG viewBox is tightly fitted with a small safety margin; use height with width:auto in a header. Logo PNGs preserve the same proportions with a 512 px longest edge. App and favicon canvases remain square.
