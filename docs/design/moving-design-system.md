# Assist With Moving design system

Local design-council implementation in progress, 2026-11-05. Governing internal brief: `design-council/2026-11-05-playbook/brief.md` and `playbook.md`. These are local implementation decisions, not deployed capability.

## Skeleton

The playbook fixes composition: dossier + one evidence stream; sticky sections with always-reachable contents; full collection controls; tray home; instrument stats; ledger admin; real permission matrix; data-out ledger; field-guide reading; row-answer Queue and threaded details. Every existing field and action stays reachable at desktop and phone sizes. No placeholder capabilities are added to make a pattern look complete.

## Moving's material

Kraft, warm paper, graphite ink and fine ruled edges. The approved MV01-K box/plug identity remains the brand. Kraft is primary; restrained safety orange flags attention and next steps. Evidence blue identifies sources. Avoid gradient heroes, generic bento cards, robot/sparkle metaphors and decorative fake maps.

## Tokens

Semantic roles in `src/app/globals.css`: background/paper, card/raised paper, foreground/ink, muted/secondary ink, primary/kraft, accent/safety orange, evidence/route blue, and success/warning/destructive. Status also has text or an icon. Dark surfaces are warm charcoal with pale kraft and softer orange; photographs and evidence retain their own colors. Focus uses the primary ring in both themes.

Typography: Geist body and headings, Geist Mono for identifiers, dates and measurements. Next font variables are authoritative. Headings use deliberate scale and tight tracking; body stays readable. Operational pages use compact rows and quiet hierarchy; reading pages use a calm measure and side-source slots. Spacing follows a four-pixel rhythm. Edges are 4–8px, without oversized pill containers.

## Controls and media

Compact visible controls with clear accessible names; touch hit areas can extend the compact visual without enlarging every button. New icons and domain illustrations are Codex-written SVG using `currentColor` and semantic CSS tokens. Records always retain a photo/illustration slot. Empty slots never masquerade as user evidence. Metadata identifies author, AI, kind and source with hover/tap details. Preserve accepted brand masters.

## Preferences and responsiveness

Appearance: System / Light / Dark, browser-local and project-scoped. Respect system changes in System mode and survive unavailable storage in memory. A pre-hydration script applies the preference before content paints. Both public and product shells expose the control.

Desktop navigation: Side remains default; Top is independent and browser-local. At `lg` (1024px) and wider, both use identical destinations and active states; below it existing phone bottom navigation is automatic. Preference changes never remount selected-move/media-upload providers or navigate away.

Section navigation: sticky one-line icons/labels/counts, with `All N` outside the horizontally scrolling strip. The menu exposes every section; move overview provides two-column phone Contents. Counts mean real records or actual sections, never invented totals.

On phones with task sections, only the task strip sticks; operations scroll away and descriptive prose remains in flow. Pages without task sections retain one sticky operations strip. Desktop tabs reserve extra space only when an operations strip is actually present. Section icons use explicit meanings, never substring inference that could mistake Details or Claims for AI attribution.

Collection presentation is one mounted interaction tree: Table compares, List scans, Grid recognizes photos/illustrations. The person chooses the view; resizing does not remount it. Browser-local view/density/group preferences retain an in-memory fallback if storage refuses writes. Search, filters, selection, sort, editing, row opening and pagination continue through the same table state. Grouping is a leading sort before pagination, with counts over the actual matching loaded records. Footer distinguishes view-hidden records from records on other pages; it never invents archived totals. No new backend query or authority is implied.

Print remains a document surface: preserve QR codes, labels, fields and pagination; no interactive chrome or dark backgrounds on paper.

## Verification

Check both themes, 320/390px phones and desktop, keyboard/tap navigation, every section reachable without sideways scrolling, storage failure, same-tab/system preference changes, and unfinished draft/upload preservation. Every code change receives exact-head different-model review. See run evidence for results; design intent is not proof.
