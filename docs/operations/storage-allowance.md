# Storage allowance operations

This draft changes storage admission and accounting. It does not deploy anything.
No settings row means enforcement off. An account already over its allowance keeps
its files. Household members' uploads count against the household's owner. Explicit
free plans and accounts with no plan record use free storage; any explicitly paid
household owned by the account, or the existing Convex administrator check, gives
that owner Pro storage across their households. Names, prices and other plan
features are unchanged. Exceptions belong in personal settings.

## Validation and release

Use Node 20.20.0, pinned by required CI, for `npm ci`, `npm run check` and
`npm run check:convex-typecheck`. Tests use synthetic accounts and storage only.
The synced core and the generated JavaScript runtime must agree:

```sh
node scripts/sync-usage-limits-runtime.mjs --check
```

Ship the backend, website, API-key hosted MCP and distributed stdio client as one
compatible release. Roll those components back together: new clients send stable
operation IDs and use the batch admission endpoint. Older native website calls
still work with enforcement off; with enforcement on an operation ID is required.
The live frontend's readable string errors remain readable during backend-first
rollout. New clients also recognize structured refusal data.

The ordinary approved release uses the existing main-branch Vercel build, which
runs Convex deployment before Next.js build (`vercel.json`). For an independently
approved backend release the command is `npx convex deploy`. Do not deploy this
draft or select production as part of local validation.

## Read-only inventory, repair and backfill

Commands below are operator examples for an explicitly selected approved
deployment. They were not executed against any real account or deployment.

Start one all-accounts read-only inventory; scheduled bounded steps continue it:

```sh
npx convex run usageRecount:start '{"dryRun":true}'
npx convex run usageRecount:status '{"runId":"<returned-run-id>"}'
```

The status reports accounts seen, bytes counted, missing objects, unknown sizes,
unattributed media, counter mismatches, repair failures and failed owners. One
failed owner is reported while the run continues to other owners. Derived run/proof rows are written;
file records, counters, settings and objects are untouched. If scheduled progress
was interrupted, resume with the same run ID:

```sh
npx convex run usageRecount:step '{"runId":"<returned-run-id>"}'
```

An individual owner can also be inspected read-only:

```sh
npx convex run usageLimitsStorage:dryRunPage '{"ownerId":"<owner-user-id>","cursor":null}'
```

Continue with each returned cursor until `isDone`. Sum page bytes, missing objects
and unknown sizes. The cursor traverses indexed owned households, photos, sessions
and generated intents, including retained records whose parent is gone. An orphan
uses its retained owner, then its uploader/creator. Every original and referenced
copy is HEADed individually. Missing objects contribute zero and are reported;
other metadata failures remain unknown and block enforcement readiness. Live
legacy uploads without a reservation must finish or expire before verification.

For a separately approved backfill:

```sh
npx convex run usageRecount:start '{"dryRun":false}'
npx convex run usageRecount:status '{"runId":"<returned-run-id>"}'
```

This first repairs size metadata, then rebuilds every owner's counter. A counter
with no reserved upload behind it also loses stale reserved-byte/in-flight values. Repair
HEADs originals, copies and legacy abandoned objects, writes their verified sizes
and retained ownership, and changes no stored object. Each transaction is bounded.
For standalone size repair, continue the returned cursors for both commands:

```sh
npx convex run storageSizeRepair:page '{"cursor":null,"dryRun":true}'
npx convex run storageSizeRepair:sessionPage '{"cursor":null,"dryRun":true}'
```

`dryRun:false` explicitly enables those metadata repairs. A counter revision
change restarts its recount; repeated pages cannot be applied twice. The final
whole-site proof compares source totals and observed object totals with ready
counters, reports new/concurrent uploads, and records `backfillCompletedAt` only
when nothing is unknown, unattributed or inconsistent. A blocked run explains the
repair/wait/restart needed. A brand-new account after that marker is ready at zero
and immediately subject to its allowance. The weekly Sunday 04:00 UTC inventory
records observed totals and drift without changing counters or files.

A database recount cannot discover objects that were never registered, historical
orphans whose references were lost before this change, or hidden older versions.
It reports missing referenced objects but does not prove bucket-wide cleanliness.
Only a separately reviewed bucket inventory can establish that; none was run.

## Deletion and abandoned uploads

Object deletion is independent of allowance enforcement. New workers default to
read-only dry run (`storageDeletionEnabled` absent/false). Admins have a separate,
reasoned and audited deletion-mode control; turning allowance On never turns on
deletion. Existing explicit admin cleanup remains available through the guarded
worker. A reviewed operator can inspect an exact photo/session without mutation:

```sh
npx convex run storageDeletion:deletePhoto '{"photoId":"<photo-id>"}'
npx convex run storageDeletion:deleteSession '{"sessionId":"<session-id>"}'
```

These list exact objects and whether another reference protects them. Explicit
`dryRun:false` requests deletion; scheduled workers require the separate setting.
New pending uploads hold indexed object claims in the reservation transaction;
legacy pending references have a separate indexed fallback. A terminal cleanup
claim freezes finalization and prevents another operation from adopting its keys.
The worker snapshots durable jobs, checks every reference immediately before a
version-specific delete, then confirms both that version and the current object
are gone. Missing version IDs, revealed older versions, active upload leases,
pending generated writes or another reference block removal. Errors preserve the
record and charge for retry. Only confirmed completion removes photo rows and
subtracts bytes. Archive subtracts nothing. Parent purges, seeds and test cleanup
retain owned photo/session records until this process succeeds.

A closing/cancelled/failed/expired session releases its upload slot in the same
transaction, moving its held bytes to a charged cleanup ledger. Retry restores the
same declared hold without another attempt/day charge. Bytes remain charged until
cleanup proves removal. At presign expiry, a non-deleting HEAD settlement returns
bytes that were never stored, even while object-deletion mode is off. Unknown
metadata retains its charge and retries. Reopening holds the full declared size,
checks any bytes missing from the retained charge, and reuses the prior original. Reservation
expiry runs every five minutes and skips processing leases. Object sweeps run
every thirty minutes; failed/referenced rows do not starve later pages. Physical removal keeps the existing twenty-four-hour grace after presign expiry;
unattached composer media and active uploads remain protected. Presigned
PUTs expire before removal. Server-generated copies have a durable, charged intent
before PUT, recovered every thirty minutes if their completion callback is lost.
They are copies of an already accepted original: they do not consume additional
upload-attempt limits and do not turn that accepted upload into a refusal.

## Temporary exports

Account exports and move exports store temporary artifact text in their existing
database job rows, not in the media bucket. They never reserve storage, count
against an account or fail for lack of storage. Existing lifetimes remain fourteen
days for account exports and thirty days for move exports. Hourly expiry schedules
one transaction per completed artifact, clears its text/size and audits removal.
Queued/processing exports are excluded.

## Policy and fixed ceilings

Effective policy comes from the core, site settings and sparse personal overrides.
The admin display and audit before-values resolve site defaults without the acting
admin's personal policy. Blank form fields change nothing; personal null resets
inheritance. AI first-call/upload replies carry effective file/batch policy and the
same ready storage summary as the meter. Refusals are never cached by idempotency.

The following remain code/transport ceilings, independent of editable policy:

- Existing media transport ceilings: image 25 MiB, audio 100 MiB, video 500 MiB.
  URL/image relay transport is 25 MiB. Raising policy works up to the relevant
  transport ceiling; changing that infrastructure is a separate release.
- API-key batch schemas accept at most fifty images; box intake accepts twenty.
  Each upload accepts at most four derivative parts. Settings may further limit
  batch count/bytes; they do not widen those existing schemas.
- Hosted MCP JSON bodies are 5 MiB with 65,536 input elements. OAuth client
  metadata has its independent 32 KiB security budget; changing media policy
  never changes that budget.
- AI image reads retain their existing eight-image, 1.5 MB per-image and 4 MB
  aggregate delivery budgets. Canonical OAuth still has no upload tool.
- Presigned sessions last fifteen minutes, processing leases ten minutes, and
  legacy cleanup's grace is twenty-four hours. Remote fetching retains its
  ten-second timeout and three redirects.
- Recount pages use up to one household or one hundred source rows, size repair
  thirty, deletion sweeps thirty and reservation sweeps one hundred. The admin
  view shows up to five hundred counters/overrides and fifty history entries;
  these display/page budgets never cap a whole-site recount.
- Existing operational photo-storage alert thresholds remain observability
  thresholds (100/500 GiB), never an account allowance. The literal scan explicitly
  permits the existing 500 GiB alert expression in that module only.

Only upload tools receive policy text, and each gets only its relevant media kinds.
Batch numbers appear on batch tools when enforced; monitoring mode does not
advertise a smaller unenforced batch cap. Tool introductions remain unchanged.
Upload notes and effective policy sentences
are appended; byte values in human-readable policy text use the core formatter.

The current shared formatter can round a file and a nearby cap to the same decimal
figure. AI file-cap refusals therefore retain exact byte counts in their text and
structured fields. Person-facing rounding remains a shared-core wording follow-up.
