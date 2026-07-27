# Fix spec: 2026-07-26 performance & PR audit findings

**Status: APPROVED (v2, 2026-07-27).** Owner approved the full plan and asked
for this revision pass. WP0 and WP10 are already executed (marked DONE below);
WP9 (domain cutover) was added after the owner connected assistwithmoving.com.

Source: three-pass audit of 2026-07-26 (PR review of #148–#160, page-speed
measurement, Convex efficiency review), run against `origin/main` @ `e8b1112`
in a production `next build` + `next start`.

## Decisions recorded (2026-07-27)

1. **Plan approved.** Start order confirmed: WP1 first, with WP5 and WP7 in
   parallel; then WP2 → WP3, then WP4/WP6, WP8 last.
2. **Superseded branch discarded — executed.** `docs/mcp-local-install-move-201`
   deleted locally (remote copy had already auto-deleted on merge);
   `feat/move-398-dep-security` + its worktree removed. The repo now has one
   worktree on current `main`; only `archive/floorplans-workbench-prototype`
   remains (kept on purpose).
3. **CI is now actually blocking — executed** (see WP10). The audit had
   under-claimed this finding: `main` had **no branch protection at all**, so
   even "Required CI" was advisory. Both jobs are now required checks.
4. **New domain: assistwithmoving.com** is connected and serving the app
   directly (verified 200, no redirect, same content as movingmanifest.com).
   This adds WP9 and one open decision: which domain is canonical.
5. Linear reconnected; work packages are being filed as tracked issues.

This spec turns every finding into a bounded work package (WP). Each WP names
the change, the exact files, the test file / harness pattern / assertion layer
(per the MOVE-372 lesson: a work order that does not name the test layer gets
tested one layer below the fix), measurable acceptance criteria, and risks.

## Baseline numbers (what we are improving against)

| Metric | Baseline | Target |
| --- | --- | --- |
| `/mcp/guide` cold load, decoded JS | 1.66 MB (26 requests, `load` 6.1 s local) | ≤ 900 KB, zero third-party JS |
| Marketing-page third-party JS (`clerk.accounts.dev`) | 765 KB decoded + 2 blocking API calls + telemetry beacon | 0 |
| `/app/items`, `/app/movable-units` client JS | 226.9 KB gz (heaviest routes) | ≤ 200 KB gz |
| Load-plan page: full-table scans per load | items ×3, boxes ×3, boxItems ×2 + per-box, resources ×3 (4 reactive subscriptions) | 1 subscription, each table scanned once |
| `boxes.listForMove` on a 200-box / 2 000-membership move | ~200 index scans + ~2 000 point reads | 2 index scans |
| `facetedListForMove` wire payload | every field of every item (~35 fields) | slim list rows; detail fields stay in `items.get` |
| Schema indexes never referenced by `withIndex()` | 47 of 199 | 0 dead indexes |
| `generateItemCode` / `generateBoxCode` per insert | O(move's items) reads | O(1) reads (+ lazy one-time init) |

Server TTFB is healthy (10–24 ms warm on all HTML routes) and is **not** in
scope. The `mcpTools.ts` `.filter((q))` sites are trivial archived/deleted
post-filters ahead of `take()` and are explicitly **not** findings.

## Combined-branch measurement record (2026-07-27)

Measured from a production build containing WP1–WP8, before merge or any
provider deployment:

| Metric | Combined result | Decision |
| --- | --- | --- |
| `/mcp/guide` cold load, decoded JS | 653.0 KiB across 17 local JS responses; 194.4 KiB gz; 2.47 s local load | Passes the ≤ 900 KiB target |
| Marketing-page third-party JS | 0 bytes | Pass; the development Clerk key still causes document-level handshake redirects, which are not script downloads |
| Warm local HTML TTFB | 1.7–10.1 ms across representative public, auth, and protected routes | Healthy; remains out of scope |
| `/app/movable-units` route JS | 227.7 KiB gz | Does not meet the ≤ 200 KiB stretch target; WP7 removes duplicate mounted/rendered trees, not both renderer implementations from the bundle |
| `/app/moves/[moveId]/load-plan` route JS | 198.6 KiB gz | Passes the ≤ 200 KiB target |
| Load-plan subscriptions | 1 (`planOps.loadPlanSnapshot`) | Pass in code and component locks |
| Movable-units responsive trees | 1 mounted tree after media resolution; one SSR status skeleton before resolution | Pass in component and SSR locks |
| Schema indexes unreferenced by `withIndex()` | 0 of 152 | Pass; down from 47 of 199 |

The authenticated desktop measurement on the existing 24-unit development
move recorded median first paint, first contentful paint, and LCP at 32 ms on
both `origin/main` and WP7 over five Movable Units runs: no observed
regression. Over 11 Load Plan runs, median FP stayed 40 ms while median
FCP/LCP moved from 48 ms to 340 ms (+292 ms). That is below the spec's
greater-than-300-ms fallback trigger, so the fallback is not activated. These
results are indicative only, not the WP7 decision rider: the required
before/after run on an approved marked-synthetic ~100-unit fixture remains a
pre-merge provider gate, especially given the Load Plan margin. The combined
load-plan browser lock also requires the development Convex
deployment to contain `planOps.loadPlanSnapshot`; the current deployment
correctly fails with “Could not find public function” until that authorized
deployment occurs.

## Conventions that apply to every WP

- Red-first: land the failing lock before the fix, same as PRs #154–#160.
- Convex logic is tested by extracting pure helpers into `convex/lib/` and
  unit-testing them with vitest (`tests/unit/*.test.ts`). There is no
  convex-test db harness in this repo; do not invent one mid-WP. Query
  handlers stay thin shells over the pure helpers.
- Component behavior locks use the `vi.hoisted` data + `vi.mock("convex/react")`
  pattern from `tests/unit/load-planner-board-tabs.test.tsx`; responsive locks
  use its `matchMedia` stub (`mediaQueryListeners` Set + `setDesktopViewport`).
- Every PR runs `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run contract:drift`; full `verify:launch` before merge.
- Query shapes consumed by REST/MCP must not change (contract drift gate).
  All shape changes below are to web-only queries with verified single
  consumers.

---

## WP0 — Resync local node_modules (prereq, no PR) — ✅ DONE 2026-07-27

`node_modules` was out of sync with `package-lock.json` after PR #149's
advisory bumps: `@alloc/quick-lru` (runtime dep of `@tailwindcss/postcss`) was
missing, so `npm run build` failed at `globals.css`.

- **Done:** `npm ci` run on the dev machine 2026-07-27; `npm run build`
  verified green (exit 0, all routes emitted).

---

## WP1 — Move Clerk/Convex providers out of the root layout

**Finding:** `ClerkProvider` + `ConvexClientProvider` wrap `src/app/layout.tsx`,
so every static marketing/docs page ships full Clerk JS (765 KB decoded from
`clerk.accounts.dev`, including a `subscriptionDetails` billing bundle), makes
2 blocking Clerk API calls, and fires a `clerk-telemetry.com` beacon.
`/mcp/guide` and `/api` — the SEO-facing docs — pay the most.

**Change:**

1. **Inventory step (do first, commit the result in the PR body):** for each
   route group, grep for `useUser|useAuth|useClerk|SignedIn|SignedOut|
   UserButton|Protect|useQuery|useMutation|useAction|usePaginatedQuery` to
   classify:
   - `(product)` → Clerk + Convex (known).
   - `(auth)` → Clerk (sign-in/sign-up catch-alls). No layout exists yet —
     create `src/app/(auth)/layout.tsx`.
   - `/mcp` + `/mcp/connect` (OAuth connect UI) → verify; expected Clerk.
   - `share/[token]` → expected Convex-only (public share views); verify
     whether it reads via client `useQuery` or server `ConvexHttpClient`. If
     server-only, it needs **no** provider.
   - `(marketing)`, `/api` docs page → none (verified: `public-page-chrome`,
     `InstallPrompt`, `/api/page.tsx` have zero Clerk/Convex hook usage).
2. Extract an `AppProviders` client component (ClerkProvider →
   ConvexClientProvider → children) and mount it in `(product)/layout.tsx`,
   the new `(auth)/layout.tsx`, and the `/mcp/connect` layout. If the
   inventory finds Convex-only consumers under `share/`, give that group a
   `ConvexProvider`-only wrapper (the no-Clerk branch already exists in
   `convex-client-provider.tsx`).
3. Root `layout.tsx` keeps fonts, `Toaster`, `InstallPrompt`, the hydration
   guard script, and metadata. Nothing in it may touch Clerk afterwards.
4. `src/proxy.ts` (clerkMiddleware) is server-side and unchanged.

**Files:** `src/app/layout.tsx`, `src/app/(product)/layout.tsx`, new
`src/app/(auth)/layout.tsx`, `src/app/mcp/**/layout.tsx` (or per-page
wrapper), new `src/components/app-providers.tsx`.

**Tests (layer: e2e network assertions — a unit test cannot see vendor
requests):**

- New `tests/e2e/marketing-no-auth-vendor.spec.ts` (Playwright, both
  configured projects): visit `/`, `/mcp/guide`, `/faq`; collect all request
  URLs; assert **zero** requests to `*.clerk.accounts.dev`,
  `clerk-telemetry.com`, and zero WebSocket to the Convex deployment. Red
  first: this spec fails on current main.
- Keep green: `tests/unit/runtime-env.test.tsx` (PR #151's provider-safe
  missing-backend shell — this WP touches exactly that seam) and
  `tests/e2e/authenticated-flow.spec.ts` when Clerk E2E creds are present.

**Acceptance:** e2e spec green; `/mcp/guide` decoded JS ≤ 900 KB measured in
the browser pane; sign-in and product flows unchanged.

**Risks:** Clerk components rendered outside a provider throw at runtime, not
build time — the inventory step is the mitigation, and the e2e sweep over
marketing routes catches stragglers. `useReportWebVitals`/analytics living in
root layout (none today) would need relocating if added later.

---## WP2 — Kill the boxContents N+1 (both copies)

**Finding:** `boxContents` does one `boxItems.by_box` scan per box plus one
`db.get` per membership. It exists **twice**: `convex/boxes.ts:250` (used by
`boxes.listForMove` in a per-box loop, and by the single-box `get` at
`boxes.ts:530`) and duplicated at `convex/estimates.ts:70` (used by
`estimates.reportForMove` in a per-box loop — which is doubly wasteful because
`reportForMove` has **already collected** the move's `boxItems` and `items`).

**Change:**

1. New pure helper `convex/lib/boxContents.ts`:
   `buildBoxContentsIndex(boxItems, items) → Map<boxId, Array<{membership, item}>>`
   (skips deleted items; preserves current membership ordering).
2. `boxes.listForMove`: two collects (`boxItems.by_move`, `items.by_move_updated`)
   + the helper. The per-box `boxContents` loop goes away.
3. `estimates.reportForMove`: delete the local `boxContents` copy; reuse the
   already-collected `boxItems`/`items` through the same helper.
4. `boxes.get` (single box) keeps its per-box scan — it is O(1) boxes and the
   by-box index is the right shape there. Swap only the inner `db.get` loop if
   trivial; otherwise leave.

**Files:** `convex/boxes.ts`, `convex/estimates.ts`, new
`convex/lib/boxContents.ts`.

**Tests (layer: pure helper + existing component characterization):**

- New `tests/unit/box-contents-index.test.ts` (vitest, pure layer): fixture of
  boxes/memberships/items (incl. deleted items, cross-box memberships, empty
  boxes); assert the helper's output deep-equals a reference reimplementation
  of the old per-box logic over the same fixture (parity lock), and that
  ordering matches `by_box` insertion order.
- Keep green: every existing consumer test that mocks `boxes.listForMove`
  (`load-planner-board-tabs`, box-lookup tests) — shapes must not change.
- `npm run contract:drift` — `listForMove` feeds REST/MCP `list_boxes`; the
  row shape is unchanged, only the read pattern.

**Acceptance:** parity test green; no query shape diffs; contract drift green.

---

## WP3 — One load-plan snapshot query (depends on WP2)

**Finding:** `load-planner-board.tsx:182-197` subscribes to four queries
(`boxes.listForMove`, `items.listForMoveWithSignals`,
`transportResources.listForMoveWithZones`, `estimates.reportForMove`) that
collectively scan `items` ×3, `boxes` ×3, `boxItems` ×2 (+ per-box before
WP2), `transportResources` ×3 — and all four re-run on every write to any of
those tables. Also `listForMoveWithZones` does one `transportZones` scan per
resource (its own N+1).

**Change:**

1. Fix the zones N+1 in place: `transportResources.listForMoveWithZones`
   collects `transportZones.by_move_sort` once and groups by `resourceId` in
   JS. **Ordering check:** confirm `by_resource_sort`'s sort key so the
   grouped output preserves today's per-resource zone order (sort within each
   group by the same field).
2. Extract pure composers into `convex/lib/loadPlanSnapshot.ts`, each lifted
   verbatim from the current query bodies:
   - `composeBoxRows(data)` (from `boxes.listForMove`, on WP2's helper)
   - `composeItemsWithSignals(data, visibility)` (wraps the existing
     `buildItemsWithSignals` from `convex/items.ts:625`)
   - `composeResourcesWithZones(data)`
   - `composeEstimateReport(data)` (from `estimates.reportForMove`)
   where `data` is the output of one widened `fetchMoveSignalData`
   (`convex/items.ts:749`) — seven collects, one each.
3. New web-only query `planOps.loadPlanSnapshot({householdId, moveId})` →
   `{ boxes, items, resourcesWithZones, report }`: one `requireMovePermission`,
   one `fetchMoveSignalData`, four composers.
4. Refactor the four existing queries to call the same composers (they stay —
   `listForMoveWithSignals` has four consumers, `listForMove` feeds REST/MCP)
   so there is a single source of truth and parity is structural, not tested.
5. `load-planner-board.tsx`: four `useQuery` → one.

**Files:** `convex/planOps.ts` (or new `convex/loadPlanSnapshot.ts`), new
`convex/lib/loadPlanSnapshot.ts`, `convex/boxes.ts`, `convex/items.ts`,
`convex/estimates.ts`, `convex/transportResources.ts`,
`src/components/load-planner-board.tsx`.

**Tests (layer: pure composers + component locks at the mocked-query seam):**

- New `tests/unit/load-plan-snapshot.test.ts` (pure layer): one shared fixture
  through each composer; assert the snapshot's four members deep-equal the
  outputs of the (refactored) individual query paths over the same fixture,
  including redaction/visibility behavior for a walled role.
- Update `tests/unit/load-planner-board-tabs.test.tsx`: swap the four mocked
  queries for one mocked `loadPlanSnapshot` in the `vi.hoisted` data object.
  **All ~30 existing behavior locks must pass unmodified below the mock
  seam** — they are the characterization that the board renders identically.
- Zones ordering lock in `tests/unit/load-plan-snapshot.test.ts`: fixture with
  out-of-insertion-order sortOrder values; assert per-resource zone order
  matches the old per-resource query order.

**Acceptance:** snapshot query is the board's only subscription; parity tests
green; contract drift green (snapshot is web-only, existing shapes unchanged).

**Non-goals:** migrating `movable-units-table`, `spaces-transport-page`,
`room-walk-intake` off `listForMoveWithSignals` (they keep a working, now
composer-backed query; migrate later only if measurement says so).

---

## WP4 — Slim the inventory list payload

**Finding:** `items.facetedListForMove` returns every field of every item in
the move (~35 fields including `measurementProvenance`, `research*` prose,
`privateNotes` when visible), then `inventory-table.tsx` renders 10 rows per
page. #155 cut DOM cost; wire/server cost is untouched. Verified single
consumer: `src/components/inventory-table.tsx`.

**Change:**

1. **Inventory step:** derive the exact field list the table needs from the
   column defs + mobile card renderer + sort menu in `inventory-table.tsx`
   (detail views already use separate queries via `item-detail-sheet.tsx`).
   Expected slim row: `_id`, `name`, `code`, `nickname`, `room`,
   `destinationRoom`, `category`, `disposition`, `status`, `quantity`,
   `highValue`, `needsReview`, `fragility`, `requiresPersonalTransport`,
   `updatedAt`, `valueCents` (visibility-gated), `signals`, `ownerContact`.
2. New pure helper `toInventoryListRow(item, visibility)` in
   `convex/lib/inventoryListRow.ts` — applies `redactItemForVisibility`
   **first**, then projects. Redaction must never be reachable around the
   projection.
3. `facetedListForMove` maps rows through it. `listForMoveWithSignals` and
   `listForMove` are **unchanged** (REST/MCP and other consumers keep full
   rows).
4. Keep the single `by_move_updated` scan: facet counts require the full set
   regardless, so index-backed filtering buys nothing here (this decision is
   what justifies dropping the four `items` filter indexes in WP5).
5. Update `inventory-table.tsx` types; anything that needed a dropped field
   moves to the detail sheet (expected: nothing, per the inventory step).

**Files:** `convex/items.ts`, new `convex/lib/inventoryListRow.ts`,
`src/components/inventory-table.tsx`.

**Tests (layer: pure projection + existing component locks):**

- New `tests/unit/inventory-list-row.test.ts` (pure layer): assert (a) slim
  rows contain **no** `measurementProvenance`, `researchSummary`,
  `researchSources`, `researchNotes`, `aiSummary`, `privateNotes`,
  `serialNumber`, `modelNumber`, `description`, `dimensionsIn` keys;
  (b) redaction parity — for a walled role, `valueCents`/gated fields match
  `redactItemForVisibility` output; (c) `signals`/`ownerContact` pass through.
- Keep green unmodified: the 100-record locks and breakpoint-continuity locks
  in `tests/unit/inventory-table-component.test.tsx` (PR #155). If a lock
  fails, the slim row dropped a field the UI really uses — fix the row, not
  the lock. Fixtures may shrink to the slim shape.

**Acceptance:** all inventory locks green; slim-row key assertions green; a
100-item fixture's serialized `facetedListForMove` payload shrinks ≥ 50%
(assert in the pure test via `JSON.stringify` length on fixture data).

---

## WP5 — Remove the 47 dead schema indexes

**Finding:** 47 of 199 defined indexes are never referenced by `withIndex()`
anywhere in `convex/`, `src/`, or `tests/`. Worst: `items` (8 of 14 dead —
including `by_move_room`, `by_move_category`, `by_move_needs_review`,
`by_move_high_value`, which exist for exactly the filters `filterItemRecords`
does in JS). Every item write currently maintains 14 index entries.

**Change / procedure (typecheck is the authority, not the string scan):**

1. Regenerate the unreferenced list on current main, scanning `convex/`,
   `src/`, `tests/`, **plus `scripts/` and `mcp-server/`** (the audit scan
   missed those two).
2. `git fetch --all` and `git grep withIndex.\"<name>\"` across live remote
   branches; anything referenced by an open branch stays with a comment.
3. Delete the remainder from `convex/schema.ts` in one commit.
4. `npm run typecheck` — `withIndex` names are typed per-table, so removing a
   genuinely-used index fails tsc. Restore any failures. This is the safety
   net for the string scan's cross-table name-collision blind spot.
5. Record per-index disposition in the PR body (removed / kept-because).
   The four `items` filter indexes are removed **because** WP4 decided facets
   keep the full-scan pattern; if that decision ever flips, they come back
   with the query change that uses them.
6. Deploy to dev; run `npm run smoke:agent-journey` and `npm run doctor:convex-dev-env`.

**Files:** `convex/schema.ts` only.

**Tests:** none new (schema-only). Gate: typecheck + full unit suite +
`contract:drift` + dev-deploy smoke.

**Acceptance:** 0 unreferenced indexes on the regenerated scan; all gates
green.

**Risk:** an index used only by an ad-hoc `npx convex run` workflow would not
appear in any scan. Mitigation: the PR body's disposition table gives a
one-line restore path; index re-adds are cheap and backfill automatically.

---

## WP6 — O(1) item/box code generation

**Finding:** `generateItemCode` (`convex/items.ts:883`) and `generateBoxCode`
(`convex/boxes.ts:106`) collect every item/box in the move on **every**
insert to compute the next code. A 500-row bulk import via MCP/REST does
~125 000 reads. Both `by_move_code` indexes are composite `["moveId", "code"]`,
so point lookups are available.

**Change:**

1. Schema: `moves.nextItemCodeSeq: v.optional(v.number())`,
   `moves.nextBoxCodeSeq: v.optional(v.number())`.
2. New pure helper `convex/lib/codeSequence.ts`:
   `nextCodes({ seq, count, format }) → { codes, nextSeq }`.
3. `generateItemCode(ctx, moveId)` becomes: `db.get(move)`; if seq unset, run
   the legacy full scan **once** to derive `maxIndex + 1` and seed the seq
   (lazy migration — no backfill job); take the candidate code; verify free
   with a `by_move_code` point lookup (`.eq(moveId).eq(code)`) to survive
   legacy gaps/manual codes, bumping until free (bounded, same 2 000 cap);
   patch the seq. Same for boxes.
4. Batch path: `generateItemCodes(ctx, moveId, n)` reserves n codes with one
   move patch, used by the bulk create paths (`upsert_items`, REST batch
   create) so a 500-row import does one seq patch, not 500.
5. Concurrency: concurrent mutations on the same move now contend on the move
   doc and OCC-retry. Accepted — bulk imports run inside one mutation, and
   human-speed parallel creates are rare. Note it in a code comment.

**Files:** `convex/schema.ts`, `convex/items.ts`, `convex/boxes.ts`, new
`convex/lib/codeSequence.ts`, the bulk-create call sites
(`convex/mcpToolsWrite.ts` / `convex/restApi.ts` — locate via
`generateItemCode(` grep).

**Tests (layer: pure sequence logic + schema regression pattern):**

- New `tests/unit/code-sequence.test.ts` (pure layer): monotonic codes,
  batch reservation, collision-skip behavior given an occupied-codes set,
  format parity with `formatItemCode` / the `B-###` box format, and the
  legacy-seed computation from a fixture of existing codes (incl. gaps and
  non-conforming manual codes).
- Keep green: `tests/unit/movable-units.test.ts`, MCP schema regression tests
  (commit `64297f6` pattern) — create paths still return codes of the same
  shape.

**Acceptance:** pure tests green; a create on a seeded move does zero
full-table scans (assert by code review — no harness measures reads); bulk
path reserves once per batch.

---

## WP7 — Single-tree responsive DataTable + cached useMediaQuery (finishes MOVE-395)

**Findings:** (a) the general `renderMobileCard` path in
`src/components/ui/data-table.tsx:445` still mounts cards (`md:hidden`) AND
the table (`hidden md:block`) — the exact double-mount MOVE-395 set out to
kill; its one remaining consumer, `movable-units-table.tsx`, sits on the
app's heaviest route (226.9 KB gz). (b) `useMediaQuery`'s `getSnapshot`
(`src/lib/use-media-query.ts:26`) calls `window.matchMedia(query)` on every
render — a DOM allocation in the hot path of the hook built for render cost.
(c) PR #154 swapped SSR table markup for a skeleton without measuring LCP.

**Change:**

1. `use-media-query.ts`: module-level `Map<string, MediaQueryList>`; lazily
   create per query **inside** subscribe/getSnapshot (never at module scope —
   SSR safety); both read the cached list. Behavior contract (undefined
   server snapshot) unchanged.
2. `data-table.tsx`: when `renderMobileCard && !cardOnly`, call
   `useMediaQuery("(min-width: 768px)")`; `undefined` → one
   `<Skeleton role="status" aria-label={...}>`; `true` → table only;
   `false` → cards only. Delete the `hidden`/`md:hidden` visibility classes
   on this path. `cardOnly` (from #155) and the no-card path are unchanged.
   This fixes movable-units and every future consumer in one place.
3. **LCP measurement rider (finding c):** before/after LCP + first-paint on
   `/app/movable-units` and `/app/moves/[id]/load-plan` with a ~100-unit
   dataset, desktop viewport, production build, recorded in the PR body.
   Decision gate: if skeleton-first regresses desktop LCP > 300 ms, the
   documented follow-up option is rendering the table during the `undefined`
   snapshot (desktop-first paint, mobile double-paint tradeoff) — decide
   then, with numbers, not now.

**Files:** `src/lib/use-media-query.ts`, `src/components/ui/data-table.tsx`.

**Tests (layer: component locks with the matchMedia stub + SSR string
render):**

- Extend `tests/unit/use-media-query.test.tsx`: keep the `renderToString`
  pending-snapshot lock; add a lock that two components with the same query
  share one `MediaQueryList` (stub `matchMedia` with a call counter — assert
  one construction per unique query string, not per render).
- New locks in a `tests/unit/data-table-responsive.test.tsx` (or extend the
  movable-units component test if one exists at implementation time) using
  the `mediaQueryListeners`/`setDesktopViewport` stub pattern from
  `tests/unit/load-planner-board-tabs.test.tsx`, mirroring #154's lock names:
  desktop mounts table and no cards; mobile mounts cards and no table;
  breakpoint flip preserves row selection and focus; `renderToString` output
  contains the status skeleton and **no** `<table>` on this path. Red first:
  the absence assertions fail on current main.
- Keep green unmodified: `tests/unit/inventory-table-component.test.tsx`
  (cardOnly path untouched) and `tests/e2e/mobile-movable-units.spec.ts`.

**Acceptance:** locks green; `/app/movable-units` route JS and SSR HTML no
longer contain the duplicate tree; LCP numbers recorded and gate decided.

---

## WP8 — Items search index (groundwork, phase 2)

**Finding:** zero `searchIndex` definitions across 47 tables. The #158/#159
ship-everything-filter-client-side pattern is correct at 36 moves and will
not survive a few-thousand-item inventory. Not urgent — sequenced last.

**Change:**

1. Schema: on `items`, `searchIndex("search_normalized_name",
   { searchField: "normalizedName", filterFields: ["moveId"] })` —
   `normalizedName` is already maintained on every create/update path.
2. New query `items.searchForMove({householdId, moveId, query, limit})` using
   `withSearchIndex`, `take(limit ≤ 50)`, mapped through WP4's
   `toInventoryListRow` (redaction + slim rows for free).
3. Wire the MCP `search_inventory` tool to it where it currently
   substring-scans, keeping its response contract identical.
4. The inventory page keeps client-side filtering for now (post-WP4 rows are
   slim; fine at current scale). Flip to server search only when a real move
   exceeds ~1 000 items.

**Files:** `convex/schema.ts`, `convex/items.ts`, `convex/mcpTools.ts`.

**Tests (layer: pure normalization + live smoke; no db harness exists for
search relevance):**

- `tests/unit/` lock on `normalizedSearchName` round-trips for the query side
  (same normalization applied to the search input as to the stored field).
- `npm run smoke:agent-journey` against dev: `search_inventory` returns the
  fixture item for a name fragment; `npm run contract:drift` green (tool
  response contract unchanged).

**Acceptance:** search index deployed; MCP search served by the index; smoke
green.

---

## WP9 — Domain cutover: assistwithmoving.com

**Finding (verified 2026-07-27):** assistwithmoving.com and
www.assistwithmoving.com both serve the app directly with HTTP 200 — no
redirect in either direction between the old and new domain. The same site now
lives on two domains, while ~140 hardcoded `movingmanifest.com` references
remain across `docs/` (86 in api-and-mcp.md alone), `public/llms.txt` (25),
`public/llms-full.txt` (13), the marketing MCP guide, `convex/mcpSetup.ts`,
`src/app/api/mcp/route.ts`, and the doctor/smoke scripts. Consequences today:

- **SEO:** duplicate content on two domains with no canonical signal — search
  engines will split or penalize ranking. The SEO-facing docs pages WP1 is
  optimizing are exactly the pages affected.
- **AI/MCP identity:** the OAuth protected-resource identity is pinned to
  `https://movingmanifest.com/mcp` and locked by MOVE-393's regression test
  (`tests/unit/mcp-oauth-config-lock.test.ts:84`). An assistant told to connect
  to `assistwithmoving.com/mcp` is off the locked path. `llms.txt` on BOTH
  domains tells assistants to use movingmanifest.com.

**Decision gate (owner):** which domain is canonical? Two viable shapes:

- **A — assistwithmoving.com becomes canonical** (matches the assistwith*
  family direction). movingmanifest.com 301-redirects everywhere, forever
  (printed QR box labels and minted OAuth identities point at it). The
  MOVE-393 lock, Clerk origins, and MCP resource identity all migrate —
  existing connected AI assistants will need to re-connect.
- **B — movingmanifest.com stays canonical** (zero-risk short term).
  assistwithmoving.com 301-redirects to it; nothing else changes. The
  assistwith* branding waits until a deliberate migration.

**Recommendation:** B now (one Vercel redirect rule, ships today, ends the
duplicate-content state), and schedule A as its own project when the
assistwith* family branding is ready — A is a rename project (product name,
OAuth identity, Clerk, docs, printed labels), not a config change.

**Change (shape B, immediate):**
1. Vercel: mark movingmanifest.com as the primary domain for the project and
   set assistwithmoving.com (+ www) to 308/301 redirect to it.
2. Verify `curl -I https://assistwithmoving.com/` returns the redirect and
   that `/mcp` + `/.well-known/oauth-protected-resource/mcp` redirect intact.
3. No code change needed for B. (For A, the inventory above becomes the work
   list: `NEXT_PUBLIC_APP_URL`, `metadataBase`, sitemap/robots, Clerk allowed
   origins, `MOVINGMANIFEST_MCP_RESOURCE_ID`, the MOVE-393 lock test, llms
   files, docs, mcp-server default endpoint, doctor/smoke scripts.)

**Tests/acceptance (B):** exactly one domain answers 200; the other 301s on
`/`, `/mcp`, and the OAuth discovery path; `npm run mcp:doctor` still passes
against the canonical domain.

**Risks:** choosing A casually — the OAuth resource identity is part of the
protocol contract with every already-connected assistant, and MOVE-393 exists
precisely to keep that identity stable. Hence the decision gate.

---

## WP10 — Make CI actually block merges — ✅ DONE 2026-07-27 (one optional follow-up)

**Finding (worse than the audit stated):** the pulse reported unit tests as
non-blocking; in fact `main` had **no branch protection and no rulesets at
all** — every check, including "Required CI", was advisory, and force-pushes
to `main` were possible.

**Done (via GitHub API, 2026-07-27):** classic branch protection created on
`main`:
- Required status checks: **"Required CI"** and **"Unit tests
  (informational)"** (strict/up-to-date not required, to keep solo flow fast).
- Force pushes and branch deletion: blocked.
- No required reviewers (solo-owner repo; reviews would block the flow).
- `enforce_admins` off — the owner can still push directly to `main`
  deliberately; PRs, including the owner's, cannot merge with a red check.

**Optional follow-up (small PR):** the job is still *named* "Unit tests
(informational)" and `tests/unit/ci-workflow-contract.test.ts:61` locks that
name "until MOVE-395 lands" — MOVE-395 landed July 21, so the test's own
rationale has expired. Rename the job to "Unit tests", update the contract
test's two assertions, and update the required-check context via
`gh api -X PUT .../branches/main/protection` in the same change. Pure hygiene;
the gate already blocks regardless of the name.

---

## Sequencing

```
WP0  ✅ done (npm ci + build verified)
WP10 ✅ done (branch protection; optional rename PR any time)
WP9  decision gate with owner → shape B ships same day it's decided
WP5 (independent, schema-only, small)      ─┐
WP7 (independent, frontend)                 ├─ can run in parallel
WP1 (independent, frontend, biggest win)   ─┘
WP2 → WP3 (backend chain: N+1 fix, then snapshot on top of it)
WP4 (after WP5's decision is recorded; touches items.ts — rebase after WP3)
WP6 (independent backend; touches items.ts/boxes.ts — sequence after WP2/WP3
     to avoid conflict churn)
WP8 (last; depends on WP4's toInventoryListRow)
```

Note for WP1 acceptance: run the measured checks against whichever domain WP9
makes canonical, so the before/after numbers are comparable.

One PR per WP, MOVE-ticket per PR, red-first locks stated in each PR body
with the focused + full suite results, matching the #154–#160 house style.

## Global verification (after all WPs land)

- Re-run the audit's measurement harness (route-weight over the build
  manifests, TTFB sweep, browser-pane cold-load on `/mcp/guide`) and append
  the after-numbers to the baseline table above.
- `npm run verify:launch` + `npm run doctor:all` on dev.
- The four "what I'd do first" claims from the audit each have a number:
  marketing third-party JS = 0, load-plan subscriptions = 1, movable-units
  double-mount gone, dead indexes = 0.
