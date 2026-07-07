# Audit remediation — Round 3 work package (2026-07-02)

**You need zero prior context. Read this intro, then work the 5 items. One PR.**

## Background

Rounds 1 and 2 of an audit-remediation cycle are complete and verified: PRs #120–#127 fixed 45 findings total, all confirmed DONE by adversarial verification agents (tracked under Linear epic MOVE-363; history in `AUDIT-2026-07-01.md` and `AUDIT-ROUND2-2026-07-02.md`, both untracked at repo root — reference only, do NOT redo anything from them). The round-2 worker also merged an **unrequested** PR #128 ("Clean up route auth guards", commit `2ba97bf`) — reviewed after the fact and judged keep-with-fixes.

Round 3 = the leftovers from verifying round 2: one medium bug inside PR #128, plus four low-severity edges from the round-2 backend PR. Each item below is self-contained.

## Ground rules

- **Start state:** `git fetch origin && git checkout main && git pull` (expect `2ba97bf` or later). Leave the untracked `AUDIT-*.md` files alone (they're gitignored now).
- **One PR**, branch like `codex/move-371-round3-cleanup`, tracked under Linear **MOVE-371**: In Progress when starting, Done when merged, closing comment listing what shipped per item.
- **Merging = production deploy** (Vercel + prod Convex fine-crocodile-51). Merge once green AND verified; never touch prod data destructively.
- **Testing bar:** the named test per item, full `npm test` + `npx tsc --noEmit` green. Item 1 is UI-visible — browser smoke via Claude-in-Chrome on Scott's logged-in Chrome at localhost:3827 (preview_start/curl hit the auth wall). Convex function changes need `npx convex dev --once` (dev: gregarious-goldfinch-763) before browser testing.
- **Scope discipline — this matters:** the round-2 worker merged out-of-scope work without disclosing it. Do NOT do that. If you notice something outside these 5 items, put it in your MOVE-371 closing comment; do not fix or merge it. Every PR you open must be listed in the closing comment.

---

### 1. MEDIUM — box-lookup "Sign in required" card is dead code; its test passes only because the mock lies
**Files:** `src/components/box-lookup.tsx:185-215`; `tests/unit/box-lookup.test.tsx`
**Context:** PR #128 added client-side auth gating: box-lookup skips its Convex queries until `useConvexAuth()` reports authenticated, and is supposed to show a "Sign in required" card when auth settles signed-out. But the guard at :185 is `if (auth.isLoading || boxRecord === undefined)` and runs BEFORE the `!auth.isAuthenticated` check at :198. When a signed-out visitor reaches the page, the queries are skipped so `boxRecord` stays `undefined` forever → infinite skeleton; the sign-in card can never render. The test "shows sign-in copy instead of querying when auth is settled out" passes only because the test's `useQuery` mock returns `lookupData.boxRecord` even when the args are `"skip"` — real Convex returns `undefined` for skipped queries. (Low real-world exposure — Clerk middleware in `src/proxy.ts` redirects signed-out visitors — but the branch exists to cover middleware-bypass/session-expiry cases and currently can't.)
**FIX:**
(a) In `src/components/box-lookup.tsx`, split the guard order: first `if (auth.isLoading) { return skeleton }`, then the existing `if (!auth.isAuthenticated) { return sign-in card }`, then `if (boxRecord === undefined) { return skeleton }`.
(b) In the sign-in card, preserve the return destination: link to `` `/sign-in?redirect_url=${encodeURIComponent(currentPath)}` `` (build currentPath from `usePathname()` + search params) instead of bare `/sign-in`, matching what the Clerk middleware's `redirectToSignIn()` does.
(c) In `tests/unit/box-lookup.test.tsx`, make the `useQuery` mock return `undefined` whenever `args === "skip"` (add the check before the switch) so tests exercise real skip semantics — then confirm the "shows sign-in copy" test still passes with the reordered guards (it should now be testing the truth).
**Test:** the two existing #128 tests, now against honest skip semantics, plus keep the other box-lookup tests green.

### 2. LOW — explicit `null` weight allowance on move-create returns a confusing 400
**File:** `convex/restApi.ts:8794-8800` (`createMoveWeightAllowanceLb`)
**Context:** Round 2 made the allowance positive-only on create. But `PATCH /moves` documents `null` as "clear", so clients naturally send `"moveLevelWeightAllowanceLb": null` on create too — which now throws "must be a positive number" (null is neither undefined nor positive). Before round 2, null was silently ignored.
**FIX:** Add `if (value === null) return undefined;` as the first non-undefined check in `createMoveWeightAllowanceLb`.
**Test:** in `tests/unit/rest-api.test.ts`: `createMoveWeightAllowanceLb(null)` → `undefined` (and keep the −500-throws / 2000-stores assertions).

### 3. LOW — notes can no longer be cleared via any REST route
**File:** `convex/lib/moveFields.ts` (`buildMovePatch` notes handling, ~:491) and its `patchText` helper
**Context:** Before round 2, `POST /moves/setup` with `notes: ""` cleared the stored notes (the old code patched `undefined`, which Convex treats as field-delete). The shared `buildMovePatch` skips undefined, so clearing notes is now impossible via REST/setup — a silent regression of a real capability. Decision (made — implement, don't ask): support explicit `null` as "clear" for `notes`, matching the `distanceMiles`/`travelMinutes` null-clear convention; `""` stays a no-op (normalized to undefined).
**FIX:** In `buildMovePatch`, handle `notes: null` → set the patch value to clear (follow exactly how `patchNullableNumber`/the distance fields express "clear" in the patch object — mirror that mechanism for the text field; `patchText` already maps null→clear per its round-2 signature, so verify the notes wiring actually passes null through rather than dropping it, and fix whichever layer drops it). Confirm the behavior on both consumers (REST `movePatch`, gateway `updateMove` — gateway validator may need `v.union(v.string(), v.null())` for notes; if you change a Convex validator, remember the gateway auto-derives agent schemas from it). Add a line to the PATCH /moves section of `docs/api-and-mcp.md`: `"notes": null` clears.
**Test:** rest-api tests: PATCH with `notes: null` → field cleared; `notes: ""` → no-op; `notes: "x"` → stored.

### 4. LOW — non-string `title` coerces to garbage instead of erroring
**File:** `convex/lib/moveFields.ts:403-407` (`patchRequiredTitle`)
**Context:** Round 2 item 8 made general text fields reject non-strings, but `patchRequiredTitle` still does `String(value).trim()`, so `title: 123` stores `"123"` and `title: {}` stores `"[object Object]"` on both PATCH /moves and POST /moves/setup.
**FIX:** In `patchRequiredTitle`, when the value is not a string, throw via the injected error factory: `"title must be a string."`; keep the existing empty-after-trim rejection.
**Test:** rest-api tests: PATCH with `title: 123` → 400; `title: "Real name"` → stored.

### 5. TRIVIAL — stale comment in the upload dismiss path
**File:** `src/components/media-upload-provider.tsx:421-422`
**Context:** The comment in `dismiss()` says an 'error' job's entry "is already 'failed'" — under round 2's deferral mechanism the failed state may not be written yet (it's deferred until siblings finish). Behavior is correct; the comment is wrong and will mislead the next reader of this subtle code.
**FIX:** Reword to: "an 'error' job's failure is either already written or deferred in deferredFailedJobIdsByEntryRef — the id survives dismissal so the last sibling still flushes the failed rollup." No test.

---

## Explicitly NOT in scope
- Everything in `AUDIT-2026-07-01.md` and `AUDIT-ROUND2-2026-07-02.md` — verified DONE.
- The rest of PR #128 (admin-dashboard gating, .gitignore) — reviewed, keep as-is.
- `weightConfidence: "manual"` → `"actual"` flip on UI saves — cosmetic-tier, both verified states, accepted.
- QUEUE_LIMIT truncation of expired-claim counts — accepted.
