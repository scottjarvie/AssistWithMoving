# Assist With Moving Queue foundation and Claude Design handoff

**Contract:** Assist With Sites Core Philosophy v1.6.3

**Repository evidence:** Queue retrofit implementation based on `0461265` plus this protected software change

**Live observation:** 2026-08-09, signed out, no private records inspected

## Outcome and truth boundary

This package establishes the design-independent Queue backend and agent
behavior contract. It does not choose the final page hierarchy, cards,
navigation, visual composition, or branding treatment. Claude Design can now
design against real states, actions, permissions, and failure behavior rather
than placeholder data.

Repository implementation now provides:

- first-class `queueItems` and append-only `queueActivities` records;
- exactly **Needs You**, **Working**, **Waiting for your AI**, and **Done** as
  user-facing states;
- bounded move/owner/state/search queries and bounded activity history;
- personal ownership, move tenancy, explicit Queue delegation, and manager
  recovery rules;
- expiring claims, optimistic versions, idempotent commands, bounded retries,
  cancellation, item expiry, and attributable system maintenance;
- signed-in Convex commands for directive creation, human response, and cancel;
- API-key REST/MCP read/claim/release/Needs You/complete/failure commands;
- legacy OAuth capture compatibility tools explicitly labeled as
  person-authorized rather than canonical chosen-AI Queue authority;
- independent `queue/read` and `queue/write` API-key scopes that do not imply
  inventory, plan, export, member, or outside-world authority;
- account-export coverage and an explicit retention/anonymization policy; and
- a non-destructive adapter for every stored capture-queue state.

Live proof remains distinct. On 2026-08-09, `https://movingmanifest.com/queue`
rendered Moving's intentional 404 and `/app/queue` redirected a signed-out
visitor to Clerk with the return URL preserved and no browser-console error.
No authenticated production records or commands were inspected. The canonical
backend in this change is therefore repository-verified until normal CI,
Convex schema deployment, Vercel deployment, and safe marked-account proof
complete.

## Existing workflow inventory and Queue decision

The shared Queue is a handoff, not a universal status rename. These decisions
preserve Moving's domain vocabulary.

| Existing surface | Current statuses / behavior | Queue treatment |
| --- | --- | --- |
| Capture/ingestion queue | `queued`, `claimed`, `processed`, `needsInput`, `resolved`, `discarded`; photos, directions, personal owner, delegation, claim lease, AI question/result refs | **Adapter now.** `queued → Waiting for your AI`; active `claimed → Working`; expired claim → Waiting; `processed` and `needsInput → Needs You`; `resolved` and `discarded → Done`. Storage and history are not rewritten. |
| General person-to-AI instruction | No first-class cross-domain record | **Canonical Queue item now.** Directive alone is sufficient; move context defaults automatically. |
| AI jobs | `queued`, `running`, `succeeded`, `failed`, `canceled`, usage/cost/provider metadata | **Keep separate.** These are internal/model execution records, not automatically user-authorized Queue objectives. A deliberate Queue item may reference a job result or exact human blocker. |
| Text/photo/planning suggestions | `pending`, `approved`, `edited`, `rejected`; explicit review before authoritative writes | **Keep separate review truth.** A Queue item may reference a selected suggestion review, but pending suggestions are not silently relabeled Needs You. |
| Derived move questions/readiness prompts | Calculated missing-setup/evidence/resource/load/packet prompts | **Not automatically Queue.** A person may turn one into a directive; the model supports `moveQuestion` references. |
| Export and account-export jobs | queued/processing/completed/failed/expired or immediate account export | **Keep job/data-rights truth.** A user-requested investigation or exact failed-export action may become a Queue item; the job itself remains an export job. |
| Photo upload sessions and client upload jobs | authorized/completed/cancelled/failed plus ephemeral queued/uploading/finalizing/error/retry | **Not Queue.** Transfer state remains close to the upload UI. Capture adapter prevents in-flight media from being claimed. |
| Layout proposals and operation history | pending/applied/partially applied/rejected; reversible plan operations | **Not Queue.** Proposal review and authoritative plan history keep their own meaning. A Queue result may reference a proposal. |
| Sale listing workflow | needs prep/research/draft/listed/interest/offer/sold/removed/kept/donated | **Not Queue.** This is a domain lifecycle. Outside posting, purchasing, payment, identity, or acceptance must return a related handoff to Needs You. |
| Planned items, inventory, boxes, trips, packets, spaces, and move status | domain record and planning statuses | **Not Queue.** They are durable move truth/results, not handoff state. Queue results link to them. |
| Invitations, participants, API keys, share links, comments | access, consent, expiry, revocation, recipient actions | **Never silently Queue-authorized.** Membership, sharing, identity, and access changes retain explicit confirmation and their own audit paths. |
| Account deletion | seven-day staged request, revocation, disablement, anonymization | **Never delegated through Queue.** It remains a human-only destructive flow. |

No production migration or backfill is included. Existing capture rows remain
correct through the adapter, while new general directives use the canonical
table. A future migration is optional performance/hygiene work only after a
read-only production census and rollback review; it is not required for
correctness or UI design.

## Exact data contract for design

Every canonical item supplies:

- `queueItemId`, `ownerUserId`, immutable original `directive`, optional short
  `summary`, `priority` (`normal|urgent`), and `version`;
- Moving context `{kind: move|room|belongings, refId?, label?}`;
- domain reference `{kind, refType?, refId?}` for traceable results without
  duplicating domain records;
- one canonical `state` and display-safe `stateLabel`;
- `requiredAction` only when the person is needed;
- `nextStep` and an attributable expiring `claim` only while work is active;
- `waitingReason` (`connectionUnknown|ready|aiConnectionRequired|retryScheduled`), optional
  `nextAttemptAt`, and `/ai` as the connection help path when explicitly known;
- optional latest human response, failure code/message/retryability and bounded
  attempt counts;
- readable `resultSummary`, up to 50 typed result references, and terminal
  reason (`completed|canceled|expired`) inside Done; and
- created/updated/completed/expiry timestamps plus paginated attributable
  activity.

The original directive is preserved. Human responses, blockers, transitions,
and results append history; they do not overwrite provenance.

## Actions and authority

### Person/app

- Add a directive, with move context automatic and room/belongings optional.
- Answer the exact Needs You request; the item returns to Waiting for your AI.
- Cancel a non-Done item with a reason; it becomes Done/canceled.
- Read the person's own, explicitly delegated, or manager-recoverable Queue and
  activity. Manager recovery is a human in-product capability only.

### Chosen AI / external agent

- List and read bounded allowed handoffs.
- Claim one Waiting item with current `expectedVersion`, unique idempotency key,
  and concrete `nextStep`.
- Release a claim with a reason.
- Request exact human input or approval; this clears the active claim.
- Complete claimed work only with a readable result or result reference.
- Report a stable failure code/message. Retryable failures release to Waiting
  within the attempt budget; exhausted or non-retryable failures become Needs
  You with an exact review action.

Agent tools cannot create objectives, answer on behalf of the person, cancel
work, widen Queue ownership, mutate access, or inherit any domain write scope.
The tool must separately hold and obey the scope for every inventory/plan/photo/
export operation used to perform the directive. Purchases, publishing, legal
acceptance, identity/access changes, destructive operations, and outside-world
actions return to Needs You unless a separately reviewed product capability and
explicit confirmation authorizes them.

## Authorization, tenancy, concurrency, and retention

- Every read/write resolves a verified user or API-key creator, household,
  move, effective role, active participant status, owner, and explicit Queue
  delegation. The client cannot choose a tenant by assertion alone.
- Move managers can recover move Queue work in the product. OAuth agents and
  API keys never inherit that shortcut; they see/run only their creator's own
  or explicitly delegated owner's items.
- API keys have a live owner kill-switch, optional move restriction, expiry,
  revocation, rate limit, and independent Queue scopes.
- Working has a 15-minute claim lease. The five-minute bounded maintenance
  sweep records releases and configured item expiry; a stale claim cannot strand
  work permanently.
- All agent commands require the current version and idempotency key. Stale
  writes fail with refresh guidance; exact replays return without duplicate
  transition activity.
- Queue list/activity bounds are 100. Canonical app search uses the indexed
  directive field and filterable move/state/owner fields; REST uses a stable
  `before` cursor. Non-manager lists default to the caller's own Queue and
  expose `runnableOwnerIds` for deliberate delegated-owner selection, avoiding
  incomplete pages caused by filtering unauthorized owners after pagination.
- Account exports include only the exporting person's Queue items and
  attributable activity, even when that person manages a shared household.
  Account deletion revokes the person's AI access and anonymizes the user
  profile while retaining shared move work/history for collaborators, matching
  the existing product policy. Queue is private move data and is never exposed
  through share links by this package.

## Required UI/system states for Claude Design

Design each as a real contract state, not decorative placeholder copy:

- **loading:** list and detail skeletons retain the selected move/context;
- **empty:** explain that a directive is sufficient and offer the existing add
  seam; do not imply an AI is connected;
- **permission denied:** do not reveal whether another person's item exists;
  explain the person's available move/Queue scope;
- **error/retry:** keep the last readable state where safe, distinguish a
  command failure from a recorded work failure, and never optimistically show a
  completed transition that the server rejected;
- **disconnected AI:** Waiting for your AI plus the `/ai` setup path only when
  connection absence is actually known; unknown is not “disconnected”;
- **expired claim:** Waiting for your AI with an activity entry explaining the
  release;
- **expired handoff:** Done/expired with the configured-expiry outcome readable;
- **Needs You:** the exact question/action is primary; no vague “attention
  needed” card;
- **Working:** actor, current step, and bounded lease are visible without
  presenting Moving as an autonomous runner;
- **Done:** result is readable in place, with links to durable move records and
  activity/provenance.

## Existing UI seams Claude should use, not assume finished

- `/app/queue` is the current selected-move global destination.
- `/app/moves/{moveId}/queue` is the move-operations seam.
- `QueueHome`, `QueueWorkspacePage`, `AddToQueueButton`,
  `ConnectAgentOnboarding`, `IngestionQueueList`, and
  `QueueEntryDetailSheet` are the existing capture-oriented components.
- The AI review route remains a separate suggestion-approval surface.
- `/queue` is the Core canonical destination but was a verified live 404 before
  this backend change. This package deliberately does not invent its final
  route composition or redirect behavior.

Claude Design should preserve Moving's calm field-desk/route-note identity,
household-first vocabulary, selected move context, phone use while packing,
and existing capture evidence behavior. It should not copy another Assist
product's palette or turn Queue into a generic Kanban/task manager.

## Validation handoff

Before calling the final UI complete, prove with synthetic/marked data:

1. directive-only creation and optional room/belongings context;
2. self vs delegated owner visibility and denied cross-move/cross-user reads;
3. Waiting → Working → Done with result and activity;
4. Working → Needs You → human response → Waiting → Working;
5. claim expiry, release, cancel, configured expiry, retry available, and retry
   exhausted;
6. stale-version and duplicate-idempotency behavior;
7. disconnected/unknown AI truth, empty/loading/permission/error states;
8. keyboard, screen-reader, phone/tablet/desktop, reduced-motion, long-text, and
   dense-history behavior; and
9. API-key MCP/REST scopes, revocation, and multi-client behavior, followed by
   safe human inspection of the durable result; canonical OAuth Queue proof
   follows only after a distinct chosen-AI grant exists.

Authenticated production data remains unverified until a dedicated marked
account and provider credentials are available. Do not use real household data
to fill that evidence gap.
