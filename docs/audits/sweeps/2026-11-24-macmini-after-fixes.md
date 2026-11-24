# Assist With Moving after-fixes sweep — 2026-11-24, macmini

Baseline: commit `8aa9dbd871f73bdf6a14979662e4cb7397e8e9ee`, dated macmini findings. Coordinator reports production handoff #274 at `f578b32da9618d7381fa28e8954733718fcf3ff1`; the browser did not independently expose deployment metadata. T3 preview used default and incognito profiles, one owned tab at a time, reported `visible=false`. Read-only live checks; no record details, IDs, media URLs, or credentials recorded.

## Comparison

- `/settings/ai`: baseline workspace error on 2/3 fresh loads; after, the AI settings heading was ready on 3/3 and the error appeared on 0/3 after three seconds. This sample does not rule out an intermittent failure.
- `/ai/start`: the prior phone overflow persists: verified innerWidth 390, document scrollWidth 470, matching baseline. Document-level measurement only; no visual cause confirmed.
- `/app/moves`: baseline raw readiness 3146.9 / 1164.9 / 1425.3 ms, median 1425.3 ms. After measurement is **null**: no round yielded three valid new-document transitions. Stale-document and already-present observations were rejected. No latency trend or three slowest pages can be established. Normal warm cache, 1280px, `readiness:none`, early passive observer of a main move-card link and browser clock; preview reported hidden and observed transitions had no paint entries.
- Legacy Inventory and Photos, reached using one existing authorized move and ordinary routes, both reached an Items destination matching that move. An existing image rendered, checked as a boolean. Baseline recorded redirects to global Items. This is one account fixture; broader backend and image coverage remain unverified.
- `/app`, `/app/moves`, `/settings/ai` and `/admin` still redirect signed-out visitors to sign-in. Workspace and Queue main elements appeared; exact initial number parity cannot be established because the baseline did not retain equivalent labeled values.

The 390px iPhone 12 Pro preset and actual innerWidth were verified; desktop checks used 1280. Width checks cover document overflow only, not visual overlap, clipping, or internal scrolling. Console and network logs were not attributable per navigation. Rows not revisited, ID examples, and full timing and visual inspection remain gaps. No inaccessible routes were guessed. The baseline files remained unchanged.

| Route | Level | Baseline loads | After observation | Desktop | Phone |
|---|---|---:|---|---|---|
| /app/moves | in | 4 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| / | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /about | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /admin | admin | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /admin | out | 1 | Incognito redirected to sign-in, as in baseline. | Not rechecked visually | Not rechecked visually |
| /ai | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /ai/start | out | 2 | Rendered heading. At 390px document width 470px, same as baseline. | Not rechecked visually | Document width 470 at innerWidth 390; no visual inspection |
| /api | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /app | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app | out | 1 | Incognito redirected to sign-in, as in baseline. | Not rechecked visually | Not rechecked visually |
| /app/box-labels | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/claim-packet | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/dashboard | in | 2 | Observed destination /app/moves; transition or redirect, not conclusively classified. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/employer-packet | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/items | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/load-plan-packet | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/movable-units | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/mover-packet | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves | out | 1 | Incognito redirected to sign-in, as in baseline. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId] | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/ai-review | in | 2 | Not rechecked; coverage gap. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/boxes | in | 2 | Not rechecked; coverage gap. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/capture | in | 2 | Not rechecked; coverage gap. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/configure | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/inventory | in | 2 | Items destination matched authorized move; an existing image rendered (boolean). Baseline redirected to global Items. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/load-plan | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/move-day | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/overview | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/packets | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/photos | in | 2 | Items destination matched authorized move; an existing image rendered (boolean). Baseline redirected to global Items. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/plan | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/queue | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/moves/[moveId]/sell | in | 2 | Not rechecked; coverage gap. | Not rechecked visually | Not rechecked visually |
| /app/moves/[moveId]/spaces | in | 2 | Not rechecked; coverage gap. | Not rechecked visually | Not rechecked visually |
| /app/pcs-packet | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/queue | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/queue/suggestions | in | 2 | Observed destination /app/queue; transition or redirect, not conclusively classified. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/spaces-transport | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /app/sub-manifest | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /claims-inventory | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /faq | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /features | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /mcp/guide | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /pcs-moving | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /privacy | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /settings | in | 2 | Main element observed. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /settings/ai | in | 5 | Main element observed. Three fresh checks: ready 3/3, error 0/3; baseline error 2/3. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /settings/ai | out | 1 | Incognito redirected to sign-in, as in baseline. | Not rechecked visually | Not rechecked visually |
| /settings/ai-connections | in | 2 | Observed destination /settings/ai; transition or redirect, not conclusively classified. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /sign-in | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /sign-up | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /suggestions | in | 2 | Observed destination /app/queue; transition or redirect, not conclusively classified. | Document width checked at 1280 where observed; no visual inspection | Not rechecked visually |
| /terms | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
| /updates | out | 2 | Rendered heading. | Not rechecked visually | Document width 390 at innerWidth 390; no visual inspection |
