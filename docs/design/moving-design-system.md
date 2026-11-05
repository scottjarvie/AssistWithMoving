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

Without a saved presentation, phones choose List on their first client visit, desktops Table. That choice then persists across resizing. Grouping is explicit per categorical column, with one normalized identity/comparator for case variants and absent values; measurement sorting sentinels are never group labels. Preset sorting clears a conflicting column sort while retaining the chosen group.

Home is a desk of labelled folder trays, with loaded move records and domain image slots first, compact Destinations, then AI setup. Every count says what it counts. Unsupported activity/connection/Queue totals are omitted rather than guessed. The overview shows the top few real move records with one named path to the entire collection. Phones use an 80px image slot so long titles retain a readable text column.

Inventory offers every existing built-in state as a named view, plus real browser-local saved views. A modified view shows a dot with Discard and Save as view. Named snapshots retain search, facets, sorting, grouping, presentation, density and column visibility, scoped to the move/household on that browser. Refused writes retain a session-memory fallback with an explicit message. No new backend or cross-device persistence is claimed. The + Filter sheet exposes flat, counted facets on phone and desktop. Alternatives in one facet combine with OR; different facets combine with AND. Counts apply all other facets, search and the base view; chips remain removable even when a live change leaves zero matches. Column descriptions and every prior built-in view remain available.

The item record opens on a dossier and one dated evidence/history stream. Compact actions and a pinned section chooser reach existing editors. Saved facts appear on the reading view; editor fields replace that summary while editing. Fact links open related history, not asserted provenance: current audit keys can record submitted fields without proving a value's origin. The limitation is explicit. Inline status/disposition transitions also identify related events. History counts describe loaded records and respect the existing bounded query. Author marks distinguish people, agents, API keys, routine work and integrations; unknown identity is never guessed to be You or a named AI. Phone keeps a compact photo/identity card, then the stream, with two-column Contents after the overview. Section actions hand keyboard focus to the persistent destination tab.

Built-in inventory states retain the person's current presentation, sort and columns when selected. Their baseline is then fixed until another view is selected; grouping, density and presentation edits receive the same modified mark and Discard behavior as filters. Saved views support updating, renaming and named deletion confirmation. These actions affect browser-local preferences only. Phone views use a single pill strip with a pinned chooser listing every view, rather than wrapping many rows above the records.

AI settings opens with a read-only matrix of the server's connection grants and actual abilities. Expired or revoked approvals retain their history but never imply current authority. Phone rows become connection cards with every ability labelled. Recent refused requests have an attributed, labelled mark. Review opens existing consent, client, usage and expiry details; revocation requires its existing named confirmation. Seven sections retain Setup, Approve, Connections, Activity, Boundaries, API keys and Manual. Their mounted panels preserve unfinished forms. The person-only actions table links to actual controls; the UI never invents an editor that can widen a grant.

Public reading pages use a field-guide frame: calm heading and reading measure, contents links to retained sections, first-party guide context, and a labelled path to the original workflow explanation. Section anchors are additive; nested content, links, code/copy controls and supplied visuals remain. Feature summaries are reading lists. Native fragment navigation needs no page-discovery script. Phone Contents uses two columns; desktop guide context sits beside the reading column. Dates and sources are shown only when actually supplied by the page. Root marketing and focused setup retain their own layouts. Public glyphs use the original Moving SVG set.

Print remains a document surface: preserve QR codes, labels, fields and pagination; no interactive chrome or dark backgrounds on paper.

## Verification

Check both themes, 320/390px phones and desktop, keyboard/tap navigation, every section reachable without sideways scrolling, storage failure, same-tab/system preference changes, and unfinished draft/upload preservation. Every code change receives exact-head different-model review. See run evidence for results; design intent is not proof.
