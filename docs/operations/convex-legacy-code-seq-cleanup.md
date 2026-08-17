# Cleanup: legacy `nextItemCodeSeq` / `nextBoxCodeSeq` on `moves`

**Status:** optional cleanup. Not required for any deploy. The schema change that
unblocked deploys is already in place; this runbook only exists so the fields can
eventually be removed rather than carried forever.

**Owner decision required.** Nothing here should be run by an agent on its own —
every step below mutates or deletes documents in Scott's deployments.

## What these fields are

A performance branch (`8ebdc13`, "perf: reserve move item and box codes", on
`codex/move-405-perf-wp6` / `codex/move-407-perf-wp8`) replaced the full-table
scan that item and box code generation used to do on every insert. Instead of
scanning every item in a move to find the next free code, it stored a counter on
the move document: `nextItemCodeSeq` and `nextBoxCodeSeq`.

That branch was **never merged to `main`**. The counters therefore never existed
in the schema that production runs. But the branch *was* pushed to the shared
development deployment with `convex dev`, and while it was live the code wrote
the counters onto move documents. Dropping the branch left those documents behind
with fields that no schema declares.

Convex validates every document in a table on every push. One orphaned field is
enough to fail the whole push:

```
✖ Schema validation failed.
Document with ID "jx70afykckdszg49s6jane99cn8bb1jt" in table "moves" does not
match the schema: Object contains extra field `nextItemCodeSeq` that is not in
the validator.
```

## Current fix

`convex/schema.ts` declares both fields as `v.optional(v.number())` with a
comment pointing here. No code reads or writes them; they exist purely so
existing documents validate. `tests/unit/moves-legacy-code-seq.test.ts` fails if
someone removes them without doing the cleanup below first.

## Affected documents (development deployment `gregarious-goldfinch-763`)

Surveyed 2026-08-17 across all 68 `moves` rows:

| Field | Rows | Titles |
| --- | --- | --- |
| `nextItemCodeSeq` | 2 | `E2E current PCS move ms3tl3im`, `E2E current PCS move ms3tml3r` |
| `nextBoxCodeSeq` | 1 | `Debug PCS move mq6ltok2` |

All three are test or debug fixtures. No human-created move carries either field.

## Is production affected?

No, and it is not reachable. Production Convex is deployed by the Vercel build
command (`npx convex deploy`, see `vercel.json`), which builds from `main` — and
the counters were never on `main`. Convex rejects writes containing fields the
deployed validator does not declare, so production code was never able to write
them in the first place.

Confirm before acting on a production cleanup:

```sh
# Read-only. Expect zero rows with either field.
npx convex data moves --prod --limit 1000 | grep -c "CodeSeq"
```

## Removing the fields for good

Only worth doing if the dead schema surface starts to bother you. Order matters:
clear the documents **first**, remove the schema fields **second**. The reverse
order breaks the next deploy.

### 1. Survey (read-only, safe to run any time)

```sh
npx convex data moves --limit 1000
```

Confirm every row carrying `nextItemCodeSeq` or `nextBoxCodeSeq` is still a test
or debug fixture. If a real move has picked one up, stop — that means the perf
code got revived somewhere and this runbook is out of date.

### 2. Clear the fields (development deployment)

This patches the counters off the documents without deleting the documents
themselves, and refuses to touch anything that is not a test-marked fixture.
Create it as a temporary mutation, run it once, then delete the file.

```ts
// convex/tmpLegacyCodeSeqCleanup.ts — DELETE AFTER RUNNING
import { internalMutation } from "./_generated/server";

// Only rows whose title marks them as a test or debug fixture are eligible.
const TEST_TITLE = /^(E2E |Debug )/;

export default internalMutation({
  args: {},
  handler: async (ctx) => {
    const moves = await ctx.db.query("moves").collect();
    const cleared: string[] = [];
    const skipped: string[] = [];

    for (const move of moves) {
      const row = move as Record<string, unknown>;
      const hasLegacy =
        row.nextItemCodeSeq !== undefined || row.nextBoxCodeSeq !== undefined;
      if (!hasLegacy) continue;

      if (!TEST_TITLE.test(move.title)) {
        // Refuse to touch anything that is not clearly a fixture.
        skipped.push(`${move._id} :: ${move.title}`);
        continue;
      }

      await ctx.db.patch(move._id, {
        nextItemCodeSeq: undefined,
        nextBoxCodeSeq: undefined,
      });
      cleared.push(`${move._id} :: ${move.title}`);
    }

    return { cleared, skipped };
  },
});
```

Run it against development only:

```sh
npx convex run tmpLegacyCodeSeqCleanup:default
```

Expect `skipped` to be empty. If it is not, a non-fixture row carries the field —
investigate before going further; do not widen the title filter to force it
through.

Then delete `convex/tmpLegacyCodeSeqCleanup.ts` and push.

### 3. Optionally delete the stale fixture rows entirely

The three rows above are leftover E2E and debug scaffolding, not data anyone
needs. Deleting them is Scott's call, not an agent's. If you want them gone, do
it from the Convex dashboard so each deletion is seen and confirmed:

<https://dashboard.convex.dev/d/gregarious-goldfinch-763> → Data → `moves` →
filter by title → delete the three rows listed above.

Deleting the rows removes the need for step 2.

### 4. Remove the schema fields

Only once step 2 or step 3 reports a clean survey on **every** deployment
(development and production):

1. Delete the two `v.optional(v.number())` lines and their comment from the
   `moves` table in `convex/schema.ts`.
2. Delete `tests/unit/moves-legacy-code-seq.test.ts`.
3. Delete this runbook.
4. Prove it with `npx convex dev --once` before merging, and watch the first
   production deploy.
