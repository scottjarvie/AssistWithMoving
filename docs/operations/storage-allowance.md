# Storage allowance operations

This change is an unfinished draft. Do not enable enforcement or ship it until
its remaining upload admission and error transport work has been audited.
No setting row means enforcement off. The household owner pays for all members'
files. The free tier maps to free; all other tiers and administrators map to Pro.
Storage policy comes from the shared core and deployment settings.

## Review and deployment

Run `npm ci` and `npm run check` in the isolated checkout using Node 20.20.0,
the version pinned by required CI. Validation on this draft passed all 227 test
files and 1,585 tests, plus the five setup contract tests, lint, fresh bindings,
and typechecking. Lint reports one existing Cloudflare worker warning. Do not use production
credentials for tests. Ordinary production deployment follows the existing
main-branch Vercel build, which runs Convex deployment before Next.js build
(see vercel.json). Do not deploy this draft. A separately approved operator can
deploy the reviewed backend using `npx convex deploy`; this command is deliberately
not run by this implementation.

## Read-only count and reviewed backfill

For an approved deployment and an explicitly selected synthetic or reviewed owner:

```sh
npx convex run usageLimitsStorage:dryRunPage '{"ownerId":"<owner-user-id>","cursor":null}'
```

Repeat with the returned cursor until `isDone` is true, adding each page's bytes.
This reads exact object metadata for application references, including archived
photos and pending storage deletion records. It never lists buckets. A failed or
missing object metadata read fails the page instead of inventing a zero total.
Each page reads at most 100 photo rows. Originals and all referenced derivatives
are included, together with audio and video stored as itemPhotos.

Backfill changes counter rows only. After separate review and approval:

```sh
npx convex run usageLimitsStorage:recomputeStep '{"ownerId":"<owner-user-id>"}'
```

Repeat until `done` is true. A concurrent counter revision restarts the count;
a repeated page cannot be applied twice. Verify against the dry run before
changing the admin mode to Warn, then audit before On. Turn Off to roll back
admission checks without deleting any files.

## Remaining work before shipping

- Admission must cover an entire legacy OAuth or API-key batch before any file is
  stored. Individual sessions currently reserve and re-check, but batch-wide
  rollback/admission is incomplete.
- Caller operation IDs must propagate through every upload door. The adapter's
  reservation key is idempotent, but the upload session currently uses its object
  key rather than a common caller operation ID.
- Legacy OAuth and API-key MCP must surface the shared refusal as a tool error
  with structured content and `mcpLimitText`. REST now preserves the structured
  storage error; legacy per-image catches and MCP wrapping need full proof.
- Existing media shape checks still enforce the legacy maximum caps in some
  transports before the configurable adapter. Lower settings apply; raising
  caps above these transport ceilings requires completing that integration.
- Generated PUT success followed by metadata mutation failure needs a durable
  retry record. Each successful normal mutation counts that copy, including
  copies preceding a later derivative generation failure.
- The conservative hard-delete change retains archived photo rows with
  `pendingStorageDeletion: true` and full storage references. It does not remove
  their objects or decrement their bytes. An audited deletion worker remains.
- Historical objects orphaned before this change have no surviving references;
  a database recount cannot discover them. No bucket inventory was performed.
- Reservation expiry currently releases the hold before object cleanup confirms
  deletion. Abandoned objects may remain during the cleanup grace period; they
  need their own charged ledger until deletion is confirmed.
- Weekly reconciliation and complete admin meters/override reset controls remain.
- Prove all required AI connection continuity, batch atomicity, and browser
  fail-soft behavior with synthetic integration tests before considering rollout.

Reservation expiry runs every five minutes. Object cleanup runs every thirty
minutes after the existing cleanup grace period; it retries failed deletes and
leaves completed sessions alone. No GitHub workflow was added.
