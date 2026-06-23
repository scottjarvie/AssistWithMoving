# MovingManifest API and MCP Guide

This guide covers the shipped `v1` REST API and the MCP server (remote endpoint + local npm package).
The API is designed for controlled automation: API keys carry explicit scopes,
may be restricted to one move, and all write paths are auditable.

## Base URL

Production:

```text
https://movingmanifest.com/api/v1
```

Local development uses the same path through the Next rewrite when
`CONVEX_HTTP_ACTIONS_URL` is configured.

## Authentication

Send API keys as bearer tokens:

```bash
curl https://movingmanifest.com/api/v1/moves \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Never put API keys in browser JavaScript, screenshots, issue text, logs, or MCP
config examples. Create separate keys per integration and revoke keys that are
no longer needed.

API keys are tied to the household member who created them. Owner/admin members
can have API access enabled or disabled separately from normal app access. If a
member's API access is disabled, they cannot create/manage keys and keys they
previously created fail with `insufficient_scope` until access is re-enabled or
another admin rotates/replaces the key.

## Scopes

API keys can include these scopes:

| Scope             | Allows                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `moves/read`      | List and read move records.                                                       |
| `moves/write`     | Update move metadata and create/update transport resources and zones.             |
| `inventory/read`  | Read items, boxes, assignments, and photo metadata.                               |
| `inventory/write` | Create/update items, boxes, and assignments.                                      |
| `plans/read`      | List/read Layout Studio plans, summaries, proposal lists, and SVG snapshots.      |
| `plans/write`     | Create Layout Studio plans, apply op batches, and create pending plan proposals.  |
| `photos/write`    | Start/finalize photo upload sessions and attach/update photo metadata.            |
| `exports/read`    | List profiles, exports, share-link metadata, and read unexpired export artifacts. |
| `exports/create`  | Create export jobs and create/revoke documentation share links.                   |
| `members/manage`  | List household members and add or invite collaborators by email.                  |

Keys may also be restricted to a single move. A move-restricted key should use
move-scoped endpoints such as `/moves/{moveId}/exports/{exportJobId}`.
The move summary endpoint requires `moves/read`, `inventory/read`, and
`exports/read` because it returns move, inventory, photo metadata, documentation,
and export state in one response. The move questions endpoint requires
`moves/read` and `inventory/read` because it summarizes missing setup,
inventory, evidence, resource, load, PCS, and packet details. The Move Day
checklist endpoint also requires `moves/read` and `inventory/read` because it
returns crew-safe box status, counts, assignments, warnings, and exception notes.
Layout Studio plan endpoints use `plans/read` and `plans/write`; move-restricted
keys can access only plans belonging to their restricted move.

Top-level object aliases such as `/items/{itemId}`, `/boxes/{boxId}`, and
`/photos/{photoId}/attach` still validate object ownership server-side. For
move-restricted keys, include `moveId` in the JSON body or query string so the
key can be authenticated before the object is loaded. Top-level `DELETE`
aliases, including `/items/{itemId}` and `/boxes/{boxId}/items/{itemId}`, must
pass `moveId` as a query parameter because DELETE bodies are not parsed.

Examples for move-restricted keys:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/items/ITEM_ID \
  -H "Authorization: Bearer mmk_replace_with_a_move_scoped_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: item-update-001" \
  -d '{ "moveId": "MOVE_ID", "room": "Office" }'

curl -X DELETE "https://movingmanifest.com/api/v1/items/ITEM_ID?moveId=MOVE_ID" \
  -H "Authorization: Bearer mmk_replace_with_a_move_scoped_key" \
  -H "Idempotency-Key: item-delete-001"
```

## Errors

Errors return JSON:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Unsupported disposition.",
    "fields": [
      {
        "path": "disposition",
        "message": "Unsupported disposition.",
        "validValues": ["undecided", "take", "sell", "donate"]
      }
    ]
  }
}
```

Common codes:

| Code                    | Status | Meaning                                                                                                          |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `validation_error`      | `400`  | Request body or query field is invalid. Check `fields[].path` and `fields[].validValues`.                        |
| `unauthorized`          | `401`  | Missing, invalid, inactive, or expired bearer API key.                                                           |
| `insufficient_scope`    | `403`  | API key does not have the required scope or move access.                                                         |
| `not_found`             | `404`  | Route or object was not found for that household/move.                                                           |
| `rate_limited`          | `429`  | API key exceeded the request limit; use `Retry-After`.                                                           |
| `idempotency_conflict`  | `409`  | Idempotency key was reused with different request content.                                                       |
| `external_key_conflict` | `409`  | `externalSource` + `externalId` already identify another active item in the move.                                |
| `name_not_found`        | `404`  | A name/code reference such as `boxCode` or `spaceName` did not match an active move record.                      |
| `ambiguous_name`        | `409`  | A name reference matched more than one active move record; use an explicit ID or one of the returned candidates. |
| `internal_error`        | `500`  | Unexpected server error. Retry later or contact support with request context.                                    |

## Pagination

List endpoints accept:

| Query    | Default | Notes                                                             |
| -------- | ------- | ----------------------------------------------------------------- |
| `limit`  | `50`    | Clamped to `1..100` for REST helper pagination.                   |
| `offset` | `0`     | Numeric row offset for the next page. Prefer this for new agents. |
| `cursor` | `0`     | Legacy alias for `offset`; still accepted for existing clients.   |

Paginated responses look like:

```json
{
  "data": [],
  "page": {
    "limit": 50,
    "offset": 0,
    "nextCursor": null,
    "nextOffset": null,
    "total": 0
  }
}
```

## Idempotency

Send `Idempotency-Key` on non-GET requests that may be retried:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: item-import-row-001" \
  -d '{ "name": "Desk lamp", "room": "Office" }'
```

If the same key and same request are replayed, the stored response is returned.
If the same key is reused with different request content, the API returns `409`.

Most idempotency entries live for 24 hours. Upload-init idempotency uses the
shorter upload session TTL so expired presigned URLs are not replayed.

## Rate Limits

REST API requests are limited per API key to 300 requests per 5-minute window.
Responses from authenticated API-key requests include:

| Header                  | Meaning                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed in the current window.            |
| `X-RateLimit-Remaining` | Requests left for the API key in the current window.       |
| `X-RateLimit-Reset`     | Unix timestamp, in seconds, when the window resets.        |
| `Retry-After`           | Seconds to wait before retrying, only returned with `429`. |

When a key exceeds the window, the API returns HTTP `429`:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "API rate limit exceeded. Retry after 120 seconds."
  }
}
```

Clients should still behave conservatively:

- Prefer coarse tools and batch flows over chatty loops.
- Use `limit` and pagination.
- Use idempotency keys for writes.
- Back off on platform errors or `429` if Vercel/Convex returns one.

## Moves and Inventory

Inspect the current connection context:

```bash
curl https://movingmanifest.com/api/v1/me \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

For local REST/API-key use, the context response includes the household id/name,
connection scopes, whether the connection is move-restricted, and the restricted
move when applicable. This endpoint does not return the raw key, OAuth token, or
secret hash. Remote MCP OAuth connections use the same effective context so
agents can verify permissions before reading or writing private move data.
The response includes both the legacy `apiKey` object and the newer
`connection` object; prefer `connection.type`, `connection.scopes`, and
`connection.moveRestricted` in new agent logic so OAuth and API-key sessions use
the same mental model. When available, verify `connection.user.email` and
`connection.householdMember.apiAccessAllowed` before private work so OAuth
clients can confirm they are operating as the intended household member.
If OAuth sign-in succeeds but the account has not created or joined a
household, `/me` returns `connection.status: "needs_household"`,
`household: null`, and `onboarding.setupUrl`. Agents should stop private work
and tell the user to open `/app/dashboard#household-setup` with that account or
ask an existing household owner to invite the same email.

## Household Members

Use household members for spouses, family, or trusted collaborators who should
sign in and work on the same household/move. This is different from move
people/contact records, which are mover/helper/office/contact rows inside a
move and do not grant login access.

List current household members:

```bash
curl https://movingmanifest.com/api/v1/households/HOUSEHOLD_ID/members \
  -H "Authorization: Bearer mmk_replace_with_a_members_manage_key"
```

Add or invite a collaborator by email:

```bash
curl -X POST https://movingmanifest.com/api/v1/households/HOUSEHOLD_ID/members \
  -H "Authorization: Bearer mmk_replace_with_a_members_manage_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: add-spouse-001" \
  -d '{ "email": "person@example.com", "role": "editor" }'
```

Member management requires `members/manage` and a household-scoped key. The
target email can be added before the person has an account. If the email is not
registered yet, MovingManifest stores a pending invitation and activates
household access when that person signs in with the same email. Owner access
cannot be granted through the API.

When an invited collaborator signs in, MovingManifest shows a household access
card on the dashboard with the household name, role, inviter context when
available, and next actions. Normal household access is separate from API access:
admins can disable a member's API key creation/use without removing their app
membership.

Expected write responses:

| Status | Meaning                                                               |
| ------ | --------------------------------------------------------------------- |
| `201`  | Existing MovingManifest user was added as an active household member. |
| `202`  | Pending invitation was created for an email without an account yet.   |
| `200`  | Existing member/invitation was updated or refreshed.                  |

Supported roles:

| Role     | Use                                                                   |
| -------- | --------------------------------------------------------------------- |
| `admin`  | Trusted household administrator who can manage members/settings/keys. |
| `editor` | Full move and inventory editing helper.                               |
| `packer` | Packing-focused collaborator.                                         |
| `viewer` | Read-focused collaborator.                                            |
| `guest`  | Minimal household access.                                             |

List moves:

```bash
curl https://movingmanifest.com/api/v1/moves \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Create a move with a household-scoped key:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-move-001" \
  -d '{
    "title": "PCS Utah to Virginia",
    "type": "pcs",
    "origin": "Utah",
    "destination": "Virginia",
    "pcsShipmentType": "mixed"
  }'
```

Move creation requires `moves/write` and a household-scoped key. Keys already
restricted to one move cannot create additional moves. New moves receive default
documentation profile types and planning defaults just like app-created moves.

Set up a move from an AI-agent conversation:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/setup \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: setup-nashua-tucson-001" \
  -d '{
    "title": "Nashua NH to Tucson AZ Move",
    "updateExisting": true,
    "origin": "House in Nashua, New Hampshire",
    "destination": "House in Tucson, Arizona",
    "originRooms": ["Garage", "Barn", "Kitchen", "Living room"],
    "transportResources": [
      { "presetKey": "pickupTruck", "name": "Ram truck" },
      {
        "type": "trailer",
        "name": "Trailer behind Toyota Tundra",
        "zones": [{ "name": "Front" }, { "name": "Middle" }, { "name": "Rear" }]
      }
    ],
    "items": [
      {
        "externalSource": "agent:photo-walkthrough",
        "externalId": "photo-1-table-set",
        "name": "Dark wood dining table set with 4 chairs",
        "room": "Living room",
        "category": "Furniture",
        "dimensionsConfidence": "estimated",
        "weightConfidence": "estimated",
        "measurementProvenance": {
          "dimensions": {
            "sourceType": "photoEstimate",
            "confidence": "estimated",
            "label": "Photo 1",
            "notes": "Approximate from uploaded image; confirm with tape measure.",
            "recordedByLabel": "Codex"
          },
          "weight": {
            "sourceType": "aiEstimate",
            "confidence": "estimated",
            "label": "Photo 1 weight estimate",
            "notes": "Range estimated from visible furniture type.",
            "recordedByLabel": "Codex"
          }
        },
        "needsReview": true,
        "reviewFlags": ["measurements estimated from photo"]
      }
    ]
  }'
```

`POST /moves/setup` is for first-pass AI setup. It can create a move, match an
existing non-archived move by exact title when `updateExisting` is not `false`,
append origin/destination room lists into move notes, upsert transport
resources/zones by name, and batch upsert starter inventory. It requires
`moves/read`, `moves/write`, `inventory/write`, and a household-scoped key
because it may choose or create a move. Move-restricted keys should use the
narrow per-move endpoints after setup.

Items can carry structured `measurementProvenance` for dimensions, weight, and
volume. Each entry records `sourceType`, `confidence`, `recordedAt`,
`recordedByLabel`, optional notes, and whether the value still needs
verification. API writes default missing `recordedAt` to the request time. This
lets future agents distinguish photo estimates from manual measurements,
manufacturer specs, mover confirmations, or product research.

When an API key writes measurement provenance, MovingManifest also stores the
specific `recordedByApiKeyId` and defaults `recordedByLabel` to the API key name
plus safe token preview. General API writes are also audited with
`actorApiKeyId`, so non-measurement item changes can be traced to the API key
that made them.

Get one move:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Get one compact move summary:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/summary?sections=items,boxes,photos&maxPerSection=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The summary response includes the move, resources, zones, people/contacts,
items, boxes, assignments, photo metadata, planning suggestions, documentation
profiles, export jobs, share-link metadata, counts, `movableUnitSummary`, and a
`generatedAt` timestamp. `movableUnitSummary` gives agents the rough-load view:
total boxes plus large loose items, known weight/volume, assigned/unassigned
counts, bounded `measurementRoute` groups by room/source area, bounded
`gapExamples` for units missing weight, dimensions, or volume, and bounded
`assignmentExamples` for units that still need a transport or personal-transport
decision. Use `measurementRoute` first when helping a user walk one garage,
room, or storage area with a tape measure; each group includes room-level
missing counts plus bounded patch examples. Gap examples include
`measurementPatchHint`; use that target when patching later measurements.
Assignment examples include
`assignmentPatchHint`; use that target when assigning an existing movable unit
instead of recreating it.
Owner-carried loose items marked for personal transport count as assigned
because the transport decision is already made. It omits storage keys and
original photo URLs. Large array sections are bounded by default and include
`sectionMeta.<section>` with `total`, `returned`, `limit`, and `truncated`; pass
`sections` as a comma list and `maxPerSection` from `1` to `500` to drill into
specific sections.

Get structured unanswered questions for one move:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/questions \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The questions response includes the move id/title/type, all prompt definitions,
the top open prompts, severity counts, category counts, and `generatedAt`. It is
the same question-readiness logic used by the app UI for setup, PCS, resources,
inventory, evidence, load planning, and documentation packet prompts.

Get the crew-safe Move Day checklist:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/move-day?filter=ready&limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The Move Day response includes move identity, filter metadata, progress counts,
paginated checklist rows, and `generatedAt`. Checklist rows include box code,
label, source/destination rooms, status, item count, load resource/zone names,
assignment warnings/hard blocks, lock state, and Move Day exception notes. It is
intentionally crew-safe: values, serial numbers, private notes, and photo details
are not returned. Supported filters are `all`, `ready`, `staged`, `loaded`, and
`exceptions`; pass `query` or `search` to narrow by box code, label, room,
destination, status, resource, or zone.

List move people and contacts:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/people?limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Create a move contact:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/people \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-move-contact-001" \
  -d '{
    "name": "Transportation Office",
    "role": "contact",
    "email": "office@example.test",
    "notes": "PCS counseling contact"
  }'
```

Move people require `moves/read` for list/read and `moves/write` for
create/update/archive. Roles are `owner`, `householdMember`, `helper`, `mover`,
and `contact`. Use contacts for PCS transportation offices, moving company
coordinators, employer relocation contacts, insurance adjusters, storage
facilities, donation/sale pickup contacts, and household helpers.

Update or archive a move contact:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/moves/MOVE_ID/people/PERSON_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: update-move-contact-001" \
  -d '{ "phone": "555-0100" }'

curl -X DELETE https://movingmanifest.com/api/v1/moves/MOVE_ID/people/PERSON_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: archive-move-contact-001"
```

Archive is soft: the contact is hidden from normal list results but retained for
history and audit. Add `includeArchived=true` to list/read archived contacts.

List items. Use `query` or `search` for case-insensitive server-side text
search across item name, description, room, destination room, and category; the
filter is applied before pagination so large moves do not hide matches beyond
the first page.

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/items?limit=25&status=active&query=desk%20lamp" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Agent attribution filters are also server-side. Use `agentLabel` to find records
created or marked by a specific helper, and `maxConfidence` to find
low-confidence AI records:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/items?agentLabel=Codex&maxConfidence=0.7" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Boxes and photos use the same `query`/`search` convention before pagination:
boxes match code, label, room, and description; photos match caption, fileName,
and room.
Items and boxes also accept `destinationRoom` and `destinationSpaceId` filters
so agents can ask for everything going to a specific new-house room/place.

Create an item:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-item-001" \
  -d '{
    "name": "Desk lamp",
    "room": "Office",
    "category": "Lighting",
    "quantity": 1,
    "condition": "good",
    "agentLabel": "Codex room walk",
    "aiConfidenceScore": 0.82
  }'
```

Fast item capture guidance:

- The API is meant to make photo-plus-short-note workflows faster than manual
  form entry. Do not ask the user for every missing field before creating a
  normal draft item.
- `name` is the minimum useful item field. Add `room`, `category`,
  `disposition`, `condition`, and destination/current space IDs when they are
  obvious from move context, the photo, or the user's short note.
- Default `quantity` to `1` when the user gives no count. If the photo clearly
  shows a set or multiple countable objects, use that count and summarize the
  assumption back to the user.
- Missing dimensions, weight, condition, value, or disposition should not block
  item creation. Leave fields blank when unknown, or store estimates with
  confidence/provenance when useful.
- Use `needsReview` and `reviewFlags` for fields that genuinely need attention,
  then summarize assumptions after the write so the user can correct them
  naturally.
- Before larger imports or repeated photo walks, read the move's agent context
  and nearby existing inventory to avoid duplicates. Use stable
  `externalSource` and `externalId` values when the same upstream row, photo, or
  agent session may be processed again.
- For bulk batches, use this sequence: read agent context, prepare rows, run
  `dryRun: true`, explain notable assumptions or row failures, write with a new
  idempotency key, then read the affected records back.

Batch create/update items:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/items/batch-upsert \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: item-import-batch-001" \
  -d '{
    "dryRun": true,
    "items": [
      {
        "externalSource": "spreadsheet:garage-walkthrough",
        "externalId": "row-42",
        "name": "Desk lamp",
        "room": "Office",
        "quantity": 1
      },
      { "itemId": "ITEM_ID", "status": "packed", "needsReview": false }
    ]
  }'
```

Rows with `itemId` update existing items. Rows without `itemId` create new
items and require `name`, unless they include a matching `externalSource` and
`externalId` pair already known for the same move. In that case, the row updates
the existing item and returns `matchedBy: "externalKey"`. When a batch row
updates an existing item and includes `researchSources`, the row appends/merges
sources by default; set row `researchSourceMode: "replace"` only for intentional
cleanup. Batches are limited to 100 rows and return per-row results with
`succeeded`, `failed`, and `results` fields. Use `dryRun: true` to validate a
batch without writing, then retry with the same rows and a new idempotency key
when ready to commit. If any row fails validation, the response uses HTTP `207`
and includes the failed row details.

External source keys are optional but useful for importer and agent
reconciliation. `externalSource` should name the upstream system or import
stream, while `externalId` should identify the upstream row or object. The pair
is scoped to one MovingManifest move. Direct item create/update requests may also
set or clear the pair; providing only one side is rejected.

Item payloads may include `dimensionsIn` and `dimensionsConfidence`. Confidence
uses the same values as weight/volume confidence: `none`, `low`, `medium`,
`high`, `manual`, or `actual`; API and MCP clients may send `estimated` as a
friendly alias for estimated photo or conversation values when the client does
not want to choose a more specific confidence. Photos are not automatically
`low` confidence: a clear photo of a common object may be `medium`, while
manual measurements, product research, manufacturer specs, or mover-confirmed
values may be `high`, `manual`, or `actual`. Legacy rows with dimensions but no
stored `dimensionsConfidence` are read as `medium` so Layout Studio and API
clients treat them as estimated measurements rather than unknown measurements.

Agent-created item, box, and photo payloads may also include `agentLabel` and
`aiConfidenceScore`. `agentLabel` is a plain-text label capped to 64 characters
and defaults to the API key name on create when omitted. `aiConfidenceScore` is
a whole-record confidence number from `0` to `1`; it is separate from
measurement confidence, which describes dimensions, weight, or volume.
Low-confidence inventory records (`aiConfidenceScore < 0.7`) appear in the
inventory review filter even when `needsReview` was not manually set.

Item payloads may also include optional research metadata for agent-enriched
inventory records: `researchSummary`, `researchSources`, `researchNotes`,
`researchConfidence`, `researchedAt`, and `researchedByLabel`. Use these fields
when an assistant checks manufacturer pages, manuals, model references, product
catalogs, or comparable public sources to identify an item or add useful
context. Keep researched dimensions, weight, and volume tied to
`measurementProvenance`; keep marketplace price/comps research on sale listings
with `upsert_sale_listing`. Item read responses expose the safe research
summary, source list, notes, confidence, timestamp, and label, but not internal
user IDs or API key IDs. Each item research source may include `status`:
`used`, `checked`, `blocked`, `gated`, `failed`, or `notRelevant`. Use `used`
for sources that informed item data, and use the other statuses to honestly
record checked sources that were blocked, login-gated, failed, or did not match
the item instead of hiding that work in prose.

MCP `update_item` is safer than raw REST PATCH for research follow-ups: when an
agent sends `researchSources`, the MCP client first reads the existing item and
appends/merges sources by default so prior research history is not lost. Use
`researchSourceMode: "replace"` only for intentional cleanup when the user wants
the source list rewritten. `batch_upsert_items` rows and trusted ingestion queue
`committedItems` use the same append/merge default when they update an existing
item.

For measurement provenance, `sourceType` supports `unknown`, `photoEstimate`,
`conversationEstimate`, `aiEstimate`, `manualEstimate`, `manualMeasurement`,
`productResearch`, `manufacturerSpec`, `moverEstimate`, `moverConfirmed`,
`import`, and `api`.

Planned items represent desired future purchases or furniture ideas for the
destination home. They can be referenced by Layout Studio placements, but they
do not count as owned inventory, box contents, weight, volume, or Move Day load
until converted to an item.

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/planned-items?limit=25" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"

curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/planned-items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-planned-item-001" \
  -d '{
    "name": "Future sectional",
    "category": "Living room",
    "dimensionsIn": { "lengthIn": 120, "widthIn": 40 },
    "dimensionsConfidence": "medium",
    "estimatedPriceCents": 180000,
    "status": "idea"
  }'
```

Planned item statuses are `idea`, `decided`, `purchased`, and `dropped`.
PATCH `/moves/:moveId/planned-items/:plannedItemId` updates selected fields.
POST `/moves/:moveId/planned-items/:plannedItemId/convert` creates an owned item,
marks the planned item `purchased`, and re-points any Layout Studio placements
from `plannedItemId` to the new `itemId`. DELETE archives the planned item.

Update an item through the top-level alias:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/items/ITEM_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: update-item-001" \
  -d '{ "moveId": "MOVE_ID", "status": "packed", "room": "Office" }'
```

Soft-delete an item:

```bash
curl -X DELETE "https://movingmanifest.com/api/v1/items/ITEM_ID?moveId=MOVE_ID" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: delete-item-001"
```

Top-level item aliases require `inventory/write` for `PATCH`/`DELETE` and
`inventory/read` for `GET`. Delete is a soft delete: the record is hidden from
normal inventory reads and the write is audited.

Create a box:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/boxes \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-box-office-001" \
  -d '{ "code": "OFFICE-1", "label": "Office books", "room": "Office", "destinationSpaceName": "New house office", "dimensionsIn": { "lengthIn": 18, "widthIn": 12, "heightIn": 12 } }'
```

Update a box through the top-level alias:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/boxes/BOX_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: update-box-001" \
  -d '{ "moveId": "MOVE_ID", "status": "sealed", "actualWeightLb": 42, "dimensionsIn": { "lengthIn": 18, "widthIn": 12, "heightIn": 12 } }'
```

Box create/update accepts `destinationSpaceId` or `destinationSpaceName` for a
stable destination location from `moveSpaces`; `destinationRoom` remains the
readable fallback shown on labels, load plans, Move Day, and packets. Box
create, update, list, detail, move summary, and top-level box lookup payloads
return `destinationSpaceId`, `destinationSpaceName`, and the same
`dimensionsIn` shape as inventory items.

Assign an item to a box:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/box-items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: assign-item-001" \
  -d '{
    "boxCode": "B-012",
    "items": [
      {
        "externalSource": "agent:photo-walkthrough",
        "externalId": "garage-lamp-001",
        "quantity": 1
      }
    ]
  }'
```

`boxId` and `itemId` still work, but agents can pass `boxCode` instead of
`boxId`, and `externalSource` + `externalId` instead of `itemId`. If a code or
name cannot be resolved, the API returns structured `name_not_found` or
`ambiguous_name` errors with candidate values when available. The legacy
single-row `POST /moves/{moveId}/assignments`, nested batch
`POST /moves/{moveId}/boxes/{boxId}/items`, and top-level box contents alias
remain available for ID-based clients:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/boxes/BOX_ID/items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: assign-box-item-001" \
  -d '{ "items": [{ "itemId": "ITEM_ID", "quantity": 1, "notes": "Top tray" }] }'
```

Remove an item from a box without deleting the inventory item:

```bash
curl -X DELETE https://movingmanifest.com/api/v1/moves/MOVE_ID/box-items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: remove-box-item-001" \
  -d '{
    "boxCode": "B-012",
    "externalSource": "agent:photo-walkthrough",
    "externalId": "garage-lamp-001"
  }'
```

Box content writes require `inventory/write`. `POST /moves/{moveId}/box-items`
upserts item-to-box assignments for that move. `DELETE
/moves/{moveId}/box-items` removes only the box assignment; it does not delete
the item. The top-level `DELETE /boxes/{boxId}/items/{itemId}` alias remains
available for ID-based clients.

Suggest box-to-resource assignments:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/assignments/suggest \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -d '{ "limit": 25 }'
```

The suggestion endpoint requires `moves/read` and `inventory/read`. It does not
write changes. It skips locked and already assigned boxes, avoids hard-blocked
targets, and returns deterministic suggestions using the same load planner
validation rules as the app.

For agent workflows, "how is this transported?" should be stored structurally:
put newly discovered contents into an open rough box with
`batch_add_box_contents`; use `add_items_to_box` when the item records already
exist. Capture rough boxes and large loose pieces with MCP
`batch_upsert_movable_units`, or REST
`POST /api/v1/moves/{moveId}/movable-units/batch-upsert` when the assistant is
using OpenAPI/actions instead of MCP. If the user already gave a load hint and
you have resolved it to explicit MovingManifest IDs, include
`assignedResourceId` and optional `assignedZoneId` on that rough row. Use
`apply_assignments` later for stricter validation, reassignment, or
review-driven load changes.
Use `boxId` for boxed units and `itemId` for large loose pieces that move as-is.
Do not treat every unboxed inventory item as a movable unit. Normal detailed
inventory can stay in the unpacked queue until it is boxed or deliberately
marked as a large move-as-is piece. Loose items count in `movableUnitSummary`
when they are tagged by `batch_upsert_movable_units`, assigned directly to a
transport resource/zone, marked for personal transport, categorized as
furniture/appliance/equipment, or have large weight/size/volume signals.
If the user gives a numbered box range such as "boxes 1-25" or
`B-001-B-025`, expand it into one box row per code before calling
`batch_upsert_movable_units`; each physical box is its own movable unit.
If the user names a container/material type, set `containerType` on the box row:
`carton`, `plasticTote`, `bin`, `wardrobe`, `dishPack`, `crate`, or `other`.
Use this for reusable plastic totes, ordinary cardboard cartons, bins,
wardrobe boxes, dish packs, and crates instead of burying that information only
in `label` or `description`.
If the user gives a count for unlabeled/auto-coded boxes such as "12 medium
boxes", MCP clients may send one code-less box row with `count: 12`; the tool
expands that row into physical box requests and returns `unitCountIndex` /
`unitCount` so the agent can explain generated boxes back to the original row.
If a live MCP call creates box rows without `boxId` or `code`, pass a stable
`idempotencyKey` such as `rough-garage-2026-06-19`; those boxes will receive
server-generated codes, and the stable key prevents retries from creating a
second copy of the same auto-coded box list.
If photos are already uploaded for several boxes/totes, put those returned
`photoIds` on the matching explicit `batch_upsert_movable_units` box rows so
the same batch attaches them after the box upsert. Do not combine `photoIds`
with `count`; expand photographed boxes into one row per physical box so each
photo attaches to the intended box.
Use item `disposition: "personalTransport"` or `requiresPersonalTransport: true`
for owner-carry intent. If the user says a loose unit "goes with me", "goes in
my car", or "do not let movers touch", store that intent structurally instead
of burying it in free-text item notes.
New loose-item rows created through `batch_upsert_movable_units` require
`externalSource` plus `externalId`, then default to active, reviewable
movable-unit records so they show up in the load planner like rows created from
the in-app rough list. Use stable external IDs such as
`garage-treadmill-1` or `workshop-planer` so retries and later measurement
patches update the same loose unit instead of duplicating it.
Dry-run and live MCP responses preserve original rough-list positions:
box result rows include `unitIndex`, and the loose-item batch request/result
maps item rows back to the original list with `unitIndexes`/`unitIndex`.
Use those indexes when telling the user which pasted row needs correction or
which generated `itemId`/`boxId` belongs to which movable unit.
Before asking the user what still needs measuring, read `movableUnitSummary`
from `get_move_summary` or `get_agent_context`; it reports total movable units,
box/loose counts, known weight and volume, assigned/unassigned counts, missing
weight/dimensions/volume counts, bounded `measurementRoute` groups, bounded
`gapExamples`, and bounded `assignmentExamples`. Use `measurementRoute` to
decide which room/source area the user should measure next. Each grouped gap
example includes `measurementPatchHint`, and each grouped assignment example
includes `assignmentPatchHint`; reuse those targets for follow-up writes so
existing boxes and loose units are patched instead of duplicated.
When the rough list exists and the user later provides missing measurements,
call `batch_upsert_movable_units` again with the existing `boxId`, box `code`,
or loose `itemId` and only the new `estimatedWeightLb`, `dimensionsIn`, or
`estimatedVolumeCuFt` fields. You may also patch `assignedResourceId` and
`assignedZoneId` this way when the user answers where a unit will travel, or
include box `photoIds` when photos need to be attached later. Box
codes are normalized before matching, so human forms like `b 012` and `B-012`
target the same box. Existing loose item rows addressed by `itemId` do not
default omitted status or quantity.

REST movable-unit batch example:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/movable-units/batch-upsert \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: rough-garage-2026-06-19" \
  -d '{
    "dryRun": true,
    "units": [
      {
        "kind": "box",
        "label": "Garage medium box",
        "count": 12,
        "room": "Garage",
        "estimatedWeightLb": 28
      },
      {
        "kind": "looseItem",
        "name": "Treadmill",
        "externalSource": "agent-rough-list",
        "externalId": "garage-treadmill-1",
        "estimatedWeightLb": 220,
        "dimensionsIn": { "lengthIn": 76, "widthIn": 35, "heightIn": 55 },
        "assignedResourceId": "TRANSPORT_RESOURCE_ID",
        "assignmentOverrideReason": "Owner said this goes in the trailer."
      }
    ]
  }'
```

The REST endpoint requires `inventory/write`, accepts the same rough-unit
shape as the MCP tool, returns row mappings with `unitIndex`, and gives `207`
when some rows fail while other rows succeeded. New loose rows still require
`externalSource` plus `externalId`; live code-less box rows require either a
body `idempotencyKey` or the `Idempotency-Key` header.

Apply reviewed movable-unit-to-resource assignments:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/assignments/apply \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: apply-load-plan-001" \
  -d '{
    "dryRun": true,
    "assignments": [
      {
        "boxId": "BOX_ID",
        "assignedResourceId": "RESOURCE_ID",
        "assignedZoneId": "ZONE_ID",
        "overrideReason": "Reviewed validation warnings."
      },
      {
        "itemId": "LARGE_LOOSE_ITEM_ID",
        "assignedResourceId": "RESOURCE_ID",
        "assignedZoneId": "ZONE_ID",
        "overrideReason": "Reviewed validation warnings."
      }
    ]
  }'
```

The apply endpoint requires `inventory/write`. It accepts only explicit box or
loose-item resource/zone assignments, not broad instructions. Each row must pass
exactly one of `boxId` or `itemId`. Use `dryRun: true` first to validate locked
units, hard blocks, zone ownership, and warning override requirements without
writing. Use a stable `Idempotency-Key` for non-dry-run
packing and load-assignment writes so retries do not duplicate work. If any row
fails validation, the response uses HTTP `207` and includes row-level details.

Create deterministic planning suggestions in the app review queue:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/planning-suggestions/generate \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: generate-planning-suggestions-001" \
  -d '{}'
```

Planning suggestion generation requires `inventory/write`. It creates an
audited `aiJobs` record plus pending estimate and load-assignment suggestions.
It does not apply the suggestions to trusted item or box records.

List pending planning suggestions:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/planning-suggestions?status=pending&limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Listing requires `inventory/read`. `GET /moves/{moveId}/summary` also includes
recent planning suggestion metadata so agents can see review work in the move
overview.

Approve reviewed planning suggestions:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/planning-suggestions/approve \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: approve-planning-suggestions-001" \
  -d '{
    "approvals": [
      {
        "suggestionId": "SUGGESTION_ID",
        "estimateDraft": {
          "estimatedWeightLb": 42,
          "weightConfidence": "manual"
        }
      }
    ]
  }'
```

Approval requires `inventory/write`. Callers must approve exact suggestion IDs.
If `estimateDraft` or `assignmentOverrideReason` is supplied, the suggestion is
marked `edited`; otherwise it is marked `approved`. Assignment target changes
should use the assignment dry-run/apply endpoint rather than changing reviewed
suggestion targets directly.

Reject planning suggestions:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/planning-suggestions/reject \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reject-planning-suggestions-001" \
  -d '{ "suggestionIds": ["SUGGESTION_ID"] }'
```

Rejecting requires `inventory/write` and marks only pending suggestions as
rejected. API-key actions are audited as API-key actions.

List AI job summaries:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-jobs?status=succeeded&limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Generate pending text-intake suggestions from source text:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-text-suggestions/generate \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: generate-ai-text-suggestions-001" \
  -d '{
    "sourceText": "Garage: two bikes, red toolbox, camping tent\nBox GAR-001: helmet, gloves, tire pump"
  }'
```

Generation requires `inventory/write`. It creates an audited `aiJobs` record and
pending text-intake suggestions. It does not create trusted items, boxes, or
assignments until exact pending suggestion IDs are approved.

Check AI provider readiness:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-jobs/provider-status \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The provider-status response includes the default provider/model, whether
OpenAI is configured, OpenAI's default model, and `generatedAt`. It never
returns provider API keys or raw environment variables.

List text-intake suggestions:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-text-suggestions?status=pending&limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Generate pending photo-intake suggestions for already-uploaded photos:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-photo-suggestions/generate \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: generate-ai-photo-suggestions-001" \
  -d '{ "photoIds": ["PHOTO_ID"] }'
```

Photo generation requires `inventory/write`. The photo must belong to the same
move, be unarchived, have an AI-usable derivative, and pass photo privacy/size
checks. Existing pending suggestions for a photo are reused rather than
duplicated.

List photo-intake suggestions:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-photo-suggestions?status=pending&limit=50" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

These AI visibility endpoints require `inventory/read` and return job/suggestion
status, review fields, drafts, summaries, token/cost summaries, and timestamps,
but not raw provider input/output refs.

Dry-run exact text-intake approvals:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-text-suggestions/approve \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: approve-ai-text-suggestions-dry-run-001" \
  -d '{
    "dryRun": true,
    "approvals": [
      {
        "suggestionId": "SUGGESTION_ID",
        "itemDraft": {
          "name": "Coffee mugs",
          "room": "Kitchen",
          "disposition": "mover",
          "quantity": 8,
          "suggestedBoxLabel": "Kitchen fragile"
        }
      }
    ]
  }'
```

Approve reviewed text-intake suggestions:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-text-suggestions/approve \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: approve-ai-text-suggestions-001" \
  -d '{ "approvals": [{ "suggestionId": "SUGGESTION_ID" }] }'
```

Reject text-intake suggestions:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-text-suggestions/reject \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reject-ai-text-suggestions-001" \
  -d '{ "suggestionIds": ["SUGGESTION_ID"] }'
```

Approve or reject photo-intake suggestions with the equivalent endpoints:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-photo-suggestions/approve \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: approve-ai-photo-suggestions-001" \
  -d '{ "dryRun": true, "approvals": [{ "suggestionId": "SUGGESTION_ID" }] }'

curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ai-photo-suggestions/reject \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reject-ai-photo-suggestions-001" \
  -d '{ "suggestionIds": ["SUGGESTION_ID"] }'
```

Approving and rejecting text/photo intake suggestions requires
`inventory/write`. Callers must pass exact pending suggestion IDs. Approval
supports `dryRun: true`, which validates access and pending status and reports
planned creates without writing. Non-dry-run text approvals may create trusted
items, boxes, and item-to-box assignments. Non-dry-run photo approvals may
create trusted items/boxes and mark the source photo verified. All API-key review
actions are audited as API-key actions.

Attach or update photo evidence metadata after upload finalization:

```bash
curl -X POST https://movingmanifest.com/api/v1/photos/PHOTO_ID/attach \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: attach-photo-001" \
  -d '{
    "moveId": "MOVE_ID",
    "externalSource": "agent:photo-walkthrough",
    "externalId": "garage-lamp-001",
    "boxCode": "B-012",
    "spaceName": "Kitchen",
    "photoType": "condition",
    "privacyLevel": "reportVisible",
    "caption": "Pre-move condition photo"
  }'
```

Photo attach requires `photos/write`. It can set or clear `itemId`, `boxId`,
`spaceId`, `room`, `claimId`, `documentationProfileTypes`, `caption`, `photoType`,
`privacyLevel`, `visibilityScope`, `source`, `exifHandlingStatus`, `confidence`,
`notes`, `verificationStatus`, `aiProcessed`, and `capturedAt`. It cannot change
storage object keys, file size, MIME type, or original download access.
Agents may pass `externalSource` + `externalId` instead of `itemId`, `boxCode`
instead of `boxId`, and `spaceName` instead of `spaceId`; ambiguous space names
return `ambiguous_name` with candidate values.

Create a transport resource from a preset:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/resources \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-resource-001" \
  -d '{ "presetKey": "militaryMovers", "name": "HHG shipment" }'
```

Preset keys include `boxTruck`, `pickupTruck`, `trailer7x16`,
`personalVehicle`, `professionalMovers`, `militaryMovers`, `storageUnit`,
`sell`, `donate`, `dump`, `freeGiveaway`, and `unknown`. Preset creation also
creates the preset's default zones.

Create a custom transport resource:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/resources \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-resource-002" \
  -d '{
    "type": "storage",
    "name": "10x20 storage unit",
    "capacity": { "maxVolumeCuFt": 1600 },
    "rules": ["keep aisle clear", "front zone is access soon"]
  }'
```

Mark a transport resource capacity as estimated or confirmed:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/moves/MOVE_ID/resources/RESOURCE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: confirm-resource-capacity-001" \
  -d '{
    "capacityReviewStatus": "confirmed",
    "capacityNotes": "Confirmed from rental agreement."
  }'
```

Create a resource zone:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/zones \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-zone-001" \
  -d '{
    "resourceId": "RESOURCE_ID",
    "name": "Door area",
    "preferredTags": ["access soon", "first night"]
  }'
```

Resource and zone writes require `moves/write`. They are auditable and support
idempotency like other non-GET API requests. Destructive archive/delete endpoints
are intentionally not part of the public API yet.

Transport resource responses include `capacityReviewStatus`, `capacityNotes`,
`capacityReviewedAt`, and `capacityReviewedByUserId` so browser, REST, and MCP
clients can share the same "actual vs. guessed capacity" state.

Get a capacity report:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/capacity-report \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The capacity report requires `moves/read` and `inventory/read`. It returns
move-level weight/volume estimates, allowance percentage, missing-estimate
counts, per-box estimates and warnings, large loose-item estimates, resource
capacity usage, and zone usage. Resource and zone totals include assigned boxes
plus assigned loose items, so large furniture and appliances do not disappear
from load planning just because they are not in a box.

## Agent Ingestion Queue

The ingestion queue is the capture-now, process-later lane for a user's own
agent. Entries can bundle instructions plus image, audio, or video evidence.
For repeated phone photo intake, the user should upload through the
MovingManifest Capture page or mobile Capture button so full originals go
straight to site storage; agents should process the stored queue media later
instead of asking the user to push base64 images through chat. External agents
should claim entries before processing them so two runs do not duplicate work.

Create a queue entry:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-floor-plan-intake-001" \
  -d '{
    "instructions": "Trace this blueprint into Layout Studio and ask if scale or room labels are unclear.",
    "scopeHint": "floorPlan",
    "targetPlanId": "PLAN_ID",
    "mediaPhotoIds": ["PHOTO_ID"]
  }'
```

Use `scopeHint: "floorPlan"` and `targetPlanId` for blueprint/image layout
work so floor-plan agents do not accidentally claim ordinary inventory intake.
`scopeHint` values are `inventory`, `packing`, `condition`, `measurements`, and
`floorPlan`. Omitted and legacy inventory scopes are treated as `inventory` for
list and claim filters.

Queue entries can also carry a durable workflow target:

- `intent`: `general`, `newMovableUnit`, `newItem`, `existingBox`,
  `existingItem`, `boxContents`, `condition`, `measurements`, or `floorPlan`.
- `targetBoxId` or `targetBoxCode`: ties the queue entry to an existing box,
  such as `B-001`; `targetBoxCode` is normalized before matching.
- `targetItemId`: ties the queue entry to an existing item.
- `targetLabel`: human-readable context when the user knows the label but not
  the ID.

Agents should read these fields before interpreting prose. A queue entry with
`intent: "boxContents"` and `targetBoxCode: "B-001"` means "add/update content
for this existing box," not "create a new replacement box."

Create a queue entry for existing box follow-up:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-b001-contents-intake-001" \
  -d '{
    "instructions": "Use these photos and notes to list the visible contents.",
    "scopeHint": "packing",
    "intent": "boxContents",
    "targetBoxCode": "B-001",
    "targetLabel": "Bathroom box B-001",
    "mediaPhotoIds": ["PHOTO_ID_1", "PHOTO_ID_2"]
  }'
```

List queue entries:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue?status=queued&scopeHint=floorPlan&targetPlanId=PLAN_ID&hasAudio=false&limit=25" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Supported filters include `status`, `room`, `hasImage`, `hasAudio`, `hasVideo`,
`includeMedia`, `scopeHint`, `targetPlanId`, and pagination. Status values are
`queued`, `claimed`, `processed`, `needsInput`, `resolved`, and `discarded`.
Expired claims read as `queued` so abandoned agent runs do not strand work.

Claim the next entries:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/claim \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: claim-ingestion-001" \
  -d '{ "batchSize": 2, "agentLabel": "Codex", "scopeHint": "floorPlan", "targetPlanId": "PLAN_ID" }'
```

Claims last 15 minutes and can be reclaimed after expiration. Claiming and
result writes require `inventory/write`; listing and evidence URL reads require
`inventory/read`.

Fetch queue image evidence through MCP first when the assistant needs to inspect
private app-captured photos:

```json
{
  "tool": "ingestion_queue",
  "input": {
    "action": "media",
    "moveId": "MOVE_ID",
    "entryId": "ENTRY_ID",
    "photoIds": ["PHOTO_ID"],
    "variant": "detail"
  }
}
```

`ingestion_queue` with `action: "media"` returns a JSON metadata text block plus MCP image
content blocks for image evidence. It defaults to the `detail` derivative so
the agent can identify items without pulling original phone-sized files into
the transcript. Use `variant=original` only when the derivative is insufficient.
Media metadata includes any existing `boxId`; the entry itself may also include
`targetBoxId`, `targetBoxCode`, `targetItemId`, and `targetLabel`. If the user
queued photos while opening a rough box, treat that as a box-targeted
itemization job: create item records with `attachMediaPhotoIds`, then pack those
items back into the same existing box with `boxAssignments` using the media
`boxId`, queue `targetBoxId`, queue `targetBoxCode`, or instruction `boxCode`.
Do not create a replacement box just because the rough box is now being
itemized.

Fetch a short-lived evidence URL for one media record attached to the entry
when the MCP media block path is unavailable, oversized, or the media is
audio/video:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/ENTRY_ID/evidence/PHOTO_ID/url?variant=original" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Use `variant=original` for original image/audio/video evidence. For image
derivatives, use `thumb`, `card`, `detail`, or `full`. The response returns a
short-lived URL and never returns raw storage keys. Evidence URLs are only issued
for media already attached to that queue entry.

Submit processing results:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/ENTRY_ID/results \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ingestion-result-001" \
  -d '{
    "agentSummary": "Photo and audio describe one red toolbox in the garage.",
    "proposedItems": [
      {
        "name": "Red toolbox",
        "room": "Garage",
        "currentSpaceId": "ORIGIN_SPACE_ID",
        "destinationSpaceId": "DESTINATION_SPACE_ID",
        "disposition": "take",
        "quantity": 1,
        "estimatedWeightLb": 18,
        "weightConfidence": "medium",
        "estimatedVolumeCuFt": 1.2,
        "volumeConfidence": "low",
        "researchSummary": "Common household steel toolbox; exact brand not visible.",
        "researchSources": [
          {
            "title": "Comparable steel toolbox",
            "url": "https://example.com/toolbox",
            "status": "used",
            "summary": "Used only to estimate likely category and weight range."
          }
        ],
        "researchConfidence": "low",
        "attachMediaPhotoIds": ["PHOTO_ID"],
        "description": "Submitted from ingestion queue evidence."
      }
    ]
  }'
```

Review-first `proposedItems` can use readable `room` / `destinationRoom` values
and durable `currentSpaceId` / `destinationSpaceId` values. If the agent knows a
unique move-space name but not the ID, it may send `spaceName` or
`destinationSpaceName`; the API resolves those before storing the suggestion so
approval creates the item in the right origin and destination spaces.

Trusted helpers can create or update inventory while finalizing the queue entry
by sending `committedItems`. They can also include `committedBoxes`,
`boxAssignments`, and `loadAssignments` so one queue result creates researched
items, creates packing containers, puts items into boxes, and records how those
boxes are transported. Each committed item row accepts the same item fields as
normal item create/update and may include `attachMediaPhotoIds` to attach media
already on that queue entry to the resulting item. For an existing rough-box
itemization queue, use `boxAssignments` with the existing `boxId`/`boxCode`
from media or queue target fields; reserve `committedBoxes` for genuinely new
boxes. A committed item may also
include `appendNote` and optional `appendNoteLabel` when the user's capture note
or the agent's concise decision rationale should be appended to the item in the
same approval. When a committed item updates an existing item and includes
`researchSources`, the queue commit appends/merges sources by default; set
`researchSourceMode: "replace"` only for intentional cleanup. Use stable
`externalSource` and `externalId` values such as `ingestionQueue` plus
`ENTRY_ID:item-slug` so retries update instead of duplicating items.

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/ENTRY_ID/results \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ingestion-trusted-result-001" \
  -d '{
    "agentSummary": "Created one researched red toolbox item, packed it, and assigned the box to the trailer.",
    "committedItems": [
      {
        "externalSource": "ingestionQueue",
        "externalId": "ENTRY_ID:red-toolbox",
        "name": "Red toolbox",
        "room": "Garage",
        "disposition": "take",
        "quantity": 1,
        "estimatedWeightLb": 18,
        "weightConfidence": "medium",
        "researchSummary": "Common household steel toolbox; exact brand not visible.",
        "researchConfidence": "low",
        "attachMediaPhotoIds": ["PHOTO_ID"],
        "appendNote": "Original capture note: latch is fragile; keep upright.",
        "appendNoteLabel": "Queue capture",
        "researchSourceMode": "append"
      }
    ],
    "committedBoxes": [
      {
        "code": "GARAGE-TOOLS-1",
        "label": "Garage tools",
        "room": "Garage",
        "destinationSpaceName": "Workshop",
        "dimensionsIn": { "lengthIn": 18, "widthIn": 12, "heightIn": 12 },
        "estimatedWeightLb": 24
      }
    ],
    "boxAssignments": [
      {
        "boxCode": "GARAGE-TOOLS-1",
        "externalSource": "ingestionQueue",
        "externalId": "ENTRY_ID:red-toolbox",
        "quantity": 1,
        "notes": "Toolbox identified from queue photo."
      }
    ],
    "loadAssignments": [
      {
        "boxCode": "GARAGE-TOOLS-1",
        "assignedResourceId": "TRANSPORT_RESOURCE_ID",
        "assignedZoneId": "TRANSPORT_ZONE_ID"
      }
    ]
  }'
```

`proposedItems` are stored as pending AI text suggestions for human review; the
API does not create trusted inventory from them. Include `researchSummary`,
`researchSources`, `researchNotes`, and `researchConfidence` when the agent
researched the item's identity, specs, likely weight, or uncertainty so approval
preserves that work. Set each research source `status` to `used`, `checked`,
`blocked`, `gated`, `failed`, or `notRelevant` so blocked or irrelevant checks
are visible to future agents. Include `attachMediaPhotoIds` to attach queue media to the
item if the user approves the suggestion. Use `committedItems` only when the user granted
trusted-helper access. Use `committedBoxes`, `boxAssignments`, and
`loadAssignments` only in trusted-helper queue flows; review-first flows should
keep packing/load ideas in proposed item notes until the user approves them. Use `resultItemIds` when the agent
already created items through another approved workflow. Use `resultRefs` for
flexible future outputs such as
`{ "type": "planProposal", "id": "PLAN_PROPOSAL_ID" }`, which keeps the Layout
Studio blueprint flow from needing a new queue contract.

If the entry needs a human answer, submit:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/ENTRY_ID/results \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ingestion-question-001" \
  -d '{ "needsInputQuestion": "Is this toolbox staying or being donated?" }'
```

To update status directly, use:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/ingestion-queue/ENTRY_ID/status \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ingestion-status-001" \
  -d '{ "status": "resolved", "agentSummary": "User approved the queue result." }'
```

## Floor Plans

Layout Studio plans are structured documents, not drawings. A plan has levels,
entities, placements, an op journal, and pending proposals. Geometry is stored
in inches. Rooms, walls, openings, features, zones, annotations, and placements
have stable short IDs such as `W12`, `R3`, and `P7`; always read those IDs from
the plan before editing. The full plan document also returns `shortIdCounters`,
which lets an agent predict IDs inside a brand-new batch when it is creating
dependent entities. Prefer proposals over direct apply unless the user has
explicitly asked for immediate mutation.

Plan endpoint scopes:

| Endpoint                          | Scope         | Purpose                                                                   |
| --------------------------------- | ------------- | ------------------------------------------------------------------------- |
| `POST /plans`                     | `plans/write` | Create a plan with default indoor and yard levels.                        |
| `GET /plans?moveId=MOVE_ID`       | `plans/read`  | List plans and level summaries.                                           |
| `GET /plans/PLAN_ID`              | `plans/read`  | Read the full plan document for editing.                                  |
| `GET /plans/PLAN_ID/summary`      | `plans/read`  | Read a plain-text plan summary.                                           |
| `GET /plans/PLAN_ID/proposals`    | `plans/read`  | List pending proposals; add `?includeReviewed=true` for proposal history. |
| `GET /plans/PLAN_ID/snapshot.svg` | `plans/read`  | Render a no-underlay SVG snapshot.                                        |
| `POST /plans/PLAN_ID/ops`         | `plans/write` | Apply ops directly.                                                       |
| `POST /plans/PLAN_ID/proposals`   | `plans/write` | Create a pending proposal for review.                                     |

### Op Catalog

Every write is an array of ops. The same language is used by mouse edits,
REST, and MCP.

| Op type              | Required fields                                                         | Common errors                                                                    |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `createLevel`        | `level.name`, `level.levelType`, `level.sortOrder`                      | Missing name or invalid level type.                                              |
| `updateLevel`        | `levelId`, `patch`                                                      | Unknown or archived level.                                                       |
| `deleteLevel`        | `levelId`                                                               | Locked or missing child records can block deletion.                              |
| `setLevelUnderlay`   | `levelId`, optional `underlay`                                          | Underlay photo not on the move.                                                  |
| `createEntity`       | `entity.levelId`, `entity.entityType`, matching geometry object         | Missing geometry for the type.                                                   |
| `updateEntity`       | `entityId`, `patch`                                                     | Locked entity or invalid geometry.                                               |
| `renameEntity`       | `entityId`, optional `name`                                             | Locked entity.                                                                   |
| `deleteEntity`       | `entityId`                                                              | Locked entity.                                                                   |
| `createPlacement`    | exactly one source plus `levelId`, `x`, `y`, `rotationDeg`              | Missing source or multiple sources.                                              |
| `movePlacement`      | `placementId`, `x`, `y`, `rotationDeg`                                  | Locked placement.                                                                |
| `updatePlacement`    | `placementId`, `patch`                                                  | Locked placement, invalid footprint, or source patch without exactly one source. |
| `setContainment`     | `placementId`, optional `parentPlacementId`, optional `containmentMode` | Cycles, missing parent, or locked placement.                                     |
| `deletePlacement`    | `placementId`                                                           | Locked placement or locked contained children.                                   |
| `updatePlanSettings` | `patch`                                                                 | Non-positive defaults or grid values.                                            |

Example entity op:

```json
{
  "type": "createEntity",
  "entity": {
    "levelId": "LEVEL_MAIN",
    "entityType": "room",
    "name": "Kitchen",
    "room": {
      "points": [
        { "x": 0, "y": 0 },
        { "x": 144, "y": 0 },
        { "x": 144, "y": 168 },
        { "x": 0, "y": 168 }
      ]
    }
  }
}
```

Example placement op:

```json
{
  "type": "createPlacement",
  "placement": {
    "levelId": "LEVEL_MAIN",
    "itemId": "ITEM_SOFA",
    "x": 72,
    "y": 84,
    "rotationDeg": 0
  }
}
```

Use `updatePlacement` for color, lock, z-order, footprint override, or source
changes. A source-change patch must contain exactly one new source:
`itemId`, `boxId`, `plannedItemId`, or `templateKey`. The op layer clears the
previous source fields and journals the inverse. When linking a template
placement to an owned item, include `footprintOverrideIn` to preserve the visual
footprint, then update the inventory item dimensions if the user accepts that
backfill.

### Recipe: Build From Text

User request: "Kitchen is 12x14, dining is 12x14 east of it, with an opening
between them."

1. Call `plan_get`.
2. Use the returned main `levelId`.
3. If the plan is empty and `shortIdCounters.nextWall` is `1`, this single
   proposal can create the rooms, walls, and opening. If the plan already has
   walls, do not assume `W*`; use the wall short IDs from `plan_get`.

```json
{
  "batchId": "agent_text_kitchen_dining_001",
  "agentLabel": "Claude - text layout",
  "reasoning": "Create adjacent 12x14 kitchen and dining rooms with a 48 inch passage on the shared wall.",
  "ops": [
    {
      "type": "createEntity",
      "entity": {
        "levelId": "LEVEL_MAIN",
        "entityType": "room",
        "name": "Kitchen",
        "room": {
          "points": [
            { "x": 0, "y": 0 },
            { "x": 144, "y": 0 },
            { "x": 144, "y": 168 },
            { "x": 0, "y": 168 }
          ]
        }
      }
    },
    {
      "type": "createEntity",
      "entity": {
        "levelId": "LEVEL_MAIN",
        "entityType": "room",
        "name": "Dining",
        "room": {
          "points": [
            { "x": 144, "y": 0 },
            { "x": 288, "y": 0 },
            { "x": 288, "y": 168 },
            { "x": 144, "y": 168 }
          ]
        }
      }
    },
    {
      "type": "createEntity",
      "entity": {
        "levelId": "LEVEL_MAIN",
        "entityType": "wall",
        "wall": {
          "x1": 144,
          "y1": 0,
          "x2": 144,
          "y2": 168,
          "thicknessIn": 4.5,
          "heightIn": 96
        }
      }
    },
    {
      "type": "createEntity",
      "entity": {
        "levelId": "LEVEL_MAIN",
        "entityType": "opening",
        "name": "Kitchen to dining passage",
        "opening": {
          "wallShortId": "W1",
          "offsetAlongWallIn": 60,
          "widthIn": 48,
          "kind": "passage",
          "swing": "none"
        }
      }
    }
  ]
}
```

Send this with `plan_propose_ops`, not `plan_apply_ops`, unless the user has
asked for direct application. After applying or proposing, fetch
`plan_snapshot` and inspect the SVG for obvious geometry mistakes.

### Recipe: Build From Blueprint Photos

The site does not run a server-side floor-plan AI worker. The user's external
AI agent interprets blueprint/photo evidence through MCP or REST, while
MovingManifest stores evidence, queue state, questions, proposals, and human
review state.

1. Use MCP `create_floor_plan_intake` with `moveId`, optional `planId`, existing
   `photoIds`, and/or blueprint image `filePaths` or `sourceUrls`. The tool
   uploads images as `photoType: "blueprint"`, creates a plan when needed, and
   creates a `floorPlan` queue entry.
2. Call `floor_plan_context` to read the active plan, source images,
   observations, relationships, measurement/evidence ledger, canonical
   subjects, latest draft state, latest solve diagnostics, destination spaces,
   floor-plan queue entries, unresolved agent questions, and placed/unplaced
   counts.
3. Claim floor-plan work with `ingestion_queue` using `scopeHint: "floorPlan"`
   and `targetPlanId`.
4. Download queue evidence through `ingestion_queue` evidence URLs.
5. Use `floor_plan_observations` to store atomic visual/text details with
   provenance: labels, OCR/handwritten text, visible measurements, room names,
   walls, openings, doorways, doorless passages, windows, fixtures, closets,
   halls, exterior structures, patios, carports, sheds, lot/property features,
   orientation clues, and unknown marks. Include image number/label and image
   region where the agent can identify it.
6. Use `floor_plan_relationships` to store topology and rules such as
   `adjacentTo`, `connectedTo`, `contains`, `partOf`, `leftOf`, `rightOf`,
   `above`, `below`, `sameAs`, `conflictsWith`, `openingIn`,
   `countsTowardArea`, and `excludedFromArea`. Treat halls, passages, and
   through-room routes as first-class subjects because access is part of the
   floorplan puzzle.
7. Use `floor_plan_evidence` to store extracted image measurements, user-entered
   measurements, assumptions, conflicts, and provenance. Measurements can be
   `known`, `assumption`, `derived`, or `range`. Store official or suspected
   square footage as unit-aware area evidence (`unit: "sqft"`) with
   `constraintStrength` (`hard`, `strong`, `soft`, or `displayOnly`). Use
   `areaRole` to distinguish conditioned, unconditioned, excluded, outdoor, and
   unknown spaces. Garages, carports, patios, decks, porches, sheds, yards, and
   lot zones should be modeled, but excluded from official conditioned square
   footage unless evidence says otherwise.
8. Use `floor_plan_calculate` to recompute derived room areas, conditioned
   totals, excluded totals, footprint totals, lot coverage, official/suspected
   area variance, missing-area estimates, and confidence diagnostics from the
   stored ledger. Calculation outputs become derived measurements available in
   later `floor_plan_context` calls.
9. Use `floor_plan_solve` to validate the stored evidence graph and generate a
   non-overlapping draft geometry only when constraints are sufficient, or return
   explicit conflict/gap diagnostics.
   Treat walls, halls, closets, bathrooms, utilities, and circulation paths as
   spaces that consume area. If wall thickness, closet dimensions, or route
   through the house is unknown, record that as an assumption/range or ask a
   queue question instead of silently folding the space into a neighboring room.
   Agents may send `kind`, `wallThicknessIn`, `clearWidthIn`, `clearDepthIn`,
   `areaRole`, `accessNote`, `unresolvedSubspaces`, and `connectsTo` on solve
   room constraints. Agents may also send property `zones` for a house shell,
   garage, carport, patio, deck, porch, shed, yard, driveway, garden, fence,
   lot, or custom zone.
10. Use `floor_plan_questions` when the solve is incomplete. The tool returns
    gap questions ranked by area uncertainty, conflicts, access-path blockers,
    and lower-value details.
11. Use `floor_plan_reset_draft` when a generated draft is stale or wrong. It
    archives generated solve/proposal output while preserving photos,
    observations, relationships, measurements, and user-entered facts.
12. Call `plan_get` to read levels, existing rooms, placements, and counters.
13. Use `plan_propose_ops` with `reasoning` that explains scale assumptions,
    room labels, uncertain walls, and solve warnings.
14. If blocked, set the queue entry to `needsInput` with a specific question.
    The site shows the question and lets the user answer/requeue.
15. Call `plan_snapshot` for the target level and inspect the SVG. Vision-capable
    agents should compare the snapshot with the blueprint photo.
16. Submit ingestion results with `resultRefs`, such as
    `{ "type": "planProposal", "id": "PLAN_PROPOSAL_ID" }`, so the queue entry
    points to the Layout Studio proposal.

### Recipe: Edit Conversationally

User request: "The kitchen's south wall, W12, needs the door moved."

1. Call `plan_get`.
2. Confirm `W12` exists and find the door/opening whose `opening.wallShortId`
   is `W12`.
3. Propose the exact `updateEntity` patch.

```json
{
  "batchId": "agent_move_kitchen_door_001",
  "agentLabel": "Claude - conversational edit",
  "reasoning": "Move the existing kitchen south-wall door farther east while preserving its width and swing.",
  "ops": [
    {
      "type": "updateEntity",
      "entityId": "OPENING_ENTITY_ID",
      "patch": {
        "opening": {
          "wallShortId": "W12",
          "offsetAlongWallIn": 84,
          "widthIn": 36,
          "kind": "door",
          "swing": "right"
        }
      }
    }
  ]
}
```

### Agent Etiquette

- Always call `plan_get` before writing.
- Never assume existing short IDs; read them from the plan.
- Batch related ops under one `batchId`.
- Prefer `plan_propose_ops` and include clear human-readable `reasoning`.
- Use `plan_apply_ops` only for user-approved immediate writes.
- Re-fetch the plan and inspect `plan_snapshot` after substantial changes.
- Do not include blueprint underlay images in generated SVG snapshots; snapshots
  are geometry feedback only.

## Evidence Media

Evidence media upload is a presigned storage flow. The current product UI is
still photo-first, but the storage contract accepts image, audio, and video
originals. Image derivatives remain image-only.

For MCP agents, use the plain `upload_photo` tool for normal single-image work.
The assistant can pass a local `filePath`, public
`sourceUrl`, `dataUrl`, or `fileBase64`; MovingManifest stores the original,
finalizes evidence metadata, creates web-ready derivatives server-side, and
returns the `photoId`.
For local `filePath`, the MCP helper reads the file and sends the original image
bytes directly to `POST /photos/upload`; it does not require the agent to
base64-wrap the photo, calculate dimensions, or create display files. Use
`upload_photos` when the user gives several
ordinary photos from the same room or context. Use `upload_evidence_file` for
audio/video or when a client wants the explicit presigned upload flow.

Quick rule for agents: one user photo should normally mean one
`upload_photo` call in MCP or one `POST /images/upload` or
`POST /photos/upload` call in REST.
Do not ask the user for image dimensions, thumbnail sizes, or derivative files.
The site reads dimensions and creates `thumb`, `card`, `detail`, and `full`
display versions after the original is stored: `thumb` is a 200x200 square
cover thumbnail, `card` fits within 600x600, `detail` fits within 1200x1200,
and `full` fits within 2400x2400. The web versions are WebP and never expose
private storage keys in API responses. MCP image helpers and REST direct upload
responses return `derivativeStatus`, `derivativeVariants`, and an `agentReview`
object with the caption, attachment target, privacy/type choices,
confidence/assumptions, derivative status, and AI-review status. Tell the user
that short summary so they can correct the record without turning upload into a
long interview. Photo read payloads, including move summaries, also include
`originalMetadata`, `media.display`, `derivativeStatus`, `derivativeError`, and
`derivativesUpdatedAt` so agents can see the preserved original's filename,
MIME type, byte size, dimensions, capture timestamp, hash presence, and whether
display derivatives are ready without exposing private storage keys.
`media.display.status` is `ready`, `pending`, `failed`, `restricted`, or
`unsupported`; when ready it includes variant `displayUrlPath` values for
requesting short-lived URLs.
When `derivativeStatus` is `ready`, use `GET /photos/{photoId}/display-url?moveId=...`
or MCP `get_photo_display_url` to retrieve a short-lived `thumb`, `card`,
`detail`, or `full` derivative URL. This endpoint is intentionally derivative-only:
it does not return original storage URLs and rejects private, sensitive,
claim-only, hidden, non-image, or not-yet-ready evidence.
If the user wants the app to review the photo for possible items, boxes, or
duplicate evidence, set `generateAiSuggestions: true`. Upload still succeeds
when AI review queueing fails or the key only has `photos/write`; the response
will include `aiReview.status` and any queueing error.

When the photo is meant to become one new inventory item, MCP agents should use
`add_item_from_photo`. It accepts the item name plus one image source at the top
level, defaults `quantity` to `1` when omitted, leaves missing weight,
dimensions, disposition, and condition blank, attaches the uploaded photo to the
created item, and returns item/photo IDs plus `agentReview`. Use
`create_item_with_images` when the same new item has several photos or the
agent already has an `images` array. REST clients can do the same workflow with
`POST /moves/{moveId}/items` followed by `POST /photos/upload` calls that
include the returned `itemId`.

When the user is focused on one box, MCP agents should use `save_box_intake`.
It creates or updates the box, preserves dimensions, weight, description,
destination, and assignment hints, uploads box-level photos, creates newly
described contents, attaches optional per-content photos, and links existing
items into that box in one approval. Use it for examples like "box B-012 is
18x12x12, 35 lb, has these photos, and contains cookbooks and a lamp." The
response lifts `boxId`, `boxCode`, `photoIds`, `packedItems`, skipped rows, and
a verification `nextStep` into `agentReview` so the assistant can summarize what
changed and call `get_move_summary` or `get_agent_context` before continuing.
Full/API-key clients can still use lower-level `add_box_item_from_photo`,
`batch_add_box_contents`, `batch_upsert_items`, and `add_items_to_box` for
advanced partial work, but hosted OAuth agents should prefer the workflow tool.

When adding a new private observation to an existing item, use MCP
`append_item_note` or REST `POST /moves/{moveId}/items/{itemId}/notes`.
Do not use `update_item` with `privateNotes` just to add a sentence; that can
replace existing private notes that item reads intentionally do not return.

Quantity should stay lightweight: if the user states a count or the photo
clearly shows several identical units that should be one inventory record, set
`quantity` from that evidence and mention it in the `agentReview` summary. If
the count is not obvious, omit quantity and let the item default to `1` instead
of asking a blocking follow-up question.

For item locations, prefer durable move spaces when available. Use `spaceId`,
`spaceName`, or `currentSpaceId` for the item's current/origin space, and use
`destinationSpaceId` or `destinationSpaceName` for where the item should end up.
Keep `room` and `destinationRoom` as readable fallbacks, not the only source of
truth when a move space exists.

For photos that belong to an item that already exists, use the shorter attach
workflow instead of creating another item:

1. Resolve the target item with `get_agent_context` or `get_move_summary`.
   If the user's item name has one obvious match, use that `itemId`. If two
   matches are plausible, ask the user before uploading.
2. Call `upload_photos` with shared defaults:
   `moveId`, `itemId`, room, `photoType: "item"`, `privacyLevel: "normal"`,
   `visibilityScope: "moveCollaborators"`, and `continueOnError: true`.
3. Put exactly one user image in each `images[]` entry, using local `filePath`
   when the client has local attachments.
4. Confirm only what matters to the user: the item name, uploaded/failed counts,
   photo IDs, and whether derivatives are ready.

This is the fastest Codex and Claude Code path for requests like "attach these
three photos to the wheelbarrow we already added." Codex agents may need to
start a fresh session after configuring MCP before the MovingManifest tools are
visible. Claude Desktop and Claude Code use the same MCP tool sequence once the
server appears in their MCP tool list.

For REST API agents, use whichever one-call shape is easiest for the image
source:

```bash
curl -X POST \
  "https://movingmanifest.com/api/v1/images/upload?moveId=MOVE_ID&room=Garage&caption=Garage%20shelf%20before%20packing&photoType=room" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: image/jpeg" \
  -H "Idempotency-Key: photo-upload-001" \
  --data-binary @garage-shelf.jpg
```

Multipart form upload is also accepted:

```bash
curl -X POST https://movingmanifest.com/api/v1/photos/upload \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: photo-upload-002" \
  -F moveId=MOVE_ID \
  -F room=Garage \
  -F caption="Garage shelf before packing" \
  -F photoType=room \
  -F file=@garage-shelf.jpg
```

REST agents that already have an image URL, data URL, or base64 payload can use
JSON:

```bash
curl -X POST https://movingmanifest.com/api/v1/photos/upload \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: photo-upload-003" \
  -d '{
    "moveId": "MOVE_ID",
    "sourceUrl": "https://example.com/garage-shelf.jpg",
    "room": "Garage",
    "caption": "Garage shelf before packing",
    "photoType": "room",
    "privacyLevel": "normal",
    "generateAiSuggestions": true
  }'
```

`POST /images/upload` and `POST /photos/upload` accept JPEG, PNG, or WebP images as raw image bytes,
multipart form data, or JSON with exactly one of `sourceUrl`, `dataUrl`, or
`fileBase64`. It is intentionally image-only and server-preps `thumb`, `card`,
`detail`, and `full` WebP derivatives after storing the original. Direct upload
responses include a `derivativeVariants` array describing those prepared web
sizes and a `media.display` block with short-lived derivative URLs when
generation is ready, or an explicit pending/failed state when it is not. MCP clients should pass `filePath` to
`upload_photo` and let the local MCP server read and send the original file
bytes. Set `generateAiSuggestions` when the same upload should also place
the photo into AI review; that queueing step requires `inventory/write` in
addition to `photos/write`. Use the presigned flow below for larger/custom
upload clients, audio/video evidence, progress bars, or client-created
derivatives.

The lower-level REST flow is still useful for custom clients, browser clients,
and clients that already create web-ready image derivatives. API/MCP clients can
omit image derivatives; MovingManifest creates the web-ready variants during
finalization after the original is in storage. REST clients do this:

1. Start an upload session and receive a presigned Backblaze URL.
2. PUT the file to the returned `uploadUrl`.
3. Finalize the evidence metadata.

Start upload:

```bash
curl -X POST https://movingmanifest.com/api/v1/uploads/init \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: photo-session-001" \
  -d '{
    "moveId": "MOVE_ID",
    "itemId": "ITEM_ID",
    "mimeType": "image/jpeg",
    "sizeBytes": 123456,
    "derivatives": [
      {
        "variant": "card",
        "mimeType": "image/webp",
        "sizeBytes": 32768,
        "width": 960,
        "height": 720
      }
    ]
  }'
```

For audio/video originals, omit `derivatives`. Supported originals are JPEG,
PNG, WebP, MP3, M4A, AAC, WAV, WebM audio, OGG audio, MP4, MOV, and WebM video.
Current limits are 25 MB for images, 100 MB for audio, and 500 MB for video.

Finalize:

```bash
curl -X POST https://movingmanifest.com/api/v1/photos/finalize \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: photo-finalize-001" \
  -d '{
    "moveId": "MOVE_ID",
    "uploadSessionId": "UPLOAD_SESSION_ID",
    "width": 1600,
    "height": 1200,
    "caption": "Desk lamp before packing",
    "photoType": "condition",
    "privacyLevel": "normal"
  }'
```

The finalize step verifies the uploaded object size and MIME type before it
creates the evidence record. Images require positive `width` and `height`.
Audio can finalize without dimensions; video dimensions may be provided when a
future UI captures them.

For MCP clients, use `upload_photo` for a single image:

```json
{
  "moveId": "MOVE_ID",
  "filePath": "/Users/scott/Desktop/garage-shelf.jpg",
  "room": "Garage",
  "caption": "Garage shelf before packing",
  "photoType": "room",
  "privacyLevel": "normal",
  "visibilityScope": "moveCollaborators",
  "generateAiSuggestions": true
}
```

For one new item from one photo, use `add_item_from_photo`:

```json
{
  "moveId": "MOVE_ID",
  "name": "Red toolbox",
  "room": "Garage",
  "category": "Tools",
  "filePath": "/Users/scott/Desktop/red-toolbox.jpg",
  "caption": "Red toolbox on garage shelf",
  "photoType": "item",
  "privacyLevel": "normal",
  "confidence": "medium",
  "notes": "Quantity defaults to one because the user did not mention a count.",
  "generateAiSuggestions": true
}
```

For one new item from a photo while opening an existing rough box, use
`add_box_item_from_photo`:

```json
{
  "moveId": "MOVE_ID",
  "boxCode": "B-012",
  "name": "Loose drill bits",
  "room": "Garage",
  "category": "Tools",
  "quantity": 3,
  "filePath": "/Users/scott/Desktop/drill-bits.jpg",
  "caption": "Three small bins of drill bits from B-012",
  "photoType": "item",
  "boxItemNotes": "Created while opening the rough garage box."
}
```

For a new item plus several photos, use `create_item_with_images`:

```json
{
  "moveId": "MOVE_ID",
  "name": "Red toolbox",
  "room": "Garage",
  "category": "Tools",
  "images": [
    {
      "filePath": "/Users/scott/Desktop/red-toolbox.jpg",
      "caption": "Red toolbox on garage shelf"
    }
  ],
  "photoDefaults": {
    "photoType": "item",
    "privacyLevel": "normal",
    "confidence": "medium",
    "notes": "Quantity defaults to one because the user did not mention a count.",
    "generateAiSuggestions": true
  }
}
```

For several photos, use `upload_photos` with shared defaults and one entry per
image:

```json
{
  "moveId": "MOVE_ID",
  "room": "Garage",
  "photoType": "room",
  "privacyLevel": "normal",
  "images": [
    {
      "filePath": "/Users/scott/Desktop/garage-shelf.jpg",
      "caption": "Garage shelf before packing"
    },
    {
      "filePath": "/Users/scott/Desktop/garage-workbench.jpg",
      "caption": "Garage workbench before packing"
    }
  ]
}
```

For several photos of an existing item, include the resolved `itemId` at the
top level so every image attaches to that item:

```json
{
  "moveId": "MOVE_ID",
  "itemId": "ITEM_ID",
  "room": "Outside yard",
  "photoType": "item",
  "privacyLevel": "normal",
  "visibilityScope": "moveCollaborators",
  "continueOnError": true,
  "images": [
    {
      "filePath": "/Users/scott/Desktop/wheelbarrow-top.jpg",
      "caption": "Top view of orange True Temper wheelbarrow"
    },
    {
      "filePath": "/Users/scott/Desktop/wheelbarrow-side.jpg",
      "caption": "Side view showing True Temper logo"
    }
  ]
}
```

The result includes `photoId`, `uploadSessionId`, source media details, a
derivative status/note, `derivativeVariants`, and `agentReview`, a short
user-facing summary of the caption, attachment target, privacy/type choices,
confidence/assumptions, derivative status, and AI-review status. When
`generateAiSuggestions` is true, it can also include `aiReview.status`,
`aiJobIds`, `suggestionIds`, and queued suggestions. Agents should report the
useful human part from `agentReview` instead of asking the user to fill out a
long photo form.

Use `upload_evidence_file` for non-image media or when the agent has a local
file and should keep the storage PUT in the local process. Use
`start_photo_upload`, a direct PUT to the returned presigned URL, and
`finalize_photo_upload` only when the client needs to manage the presigned flow
itself, upload audio/video, show upload progress, or supply client-created image
derivatives. Use `attach_photo` afterward only when evidence metadata needs to
be changed or linked differently.

Current derivative behavior: `upload_evidence_file` uploads and finalizes the
original evidence file. For images, MovingManifest creates `thumb`, `card`,
`detail`, and `full` WebP derivatives server-side and returns derivative status
plus `derivativeVariants` so the agent can tell the user whether display/AI-ready
versions are ready or need review.

## Documentation Profiles, Exports, and Share Links

List documentation profiles:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/documentation-profiles \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Create a documentation profile:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/documentation-profiles \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: profile-001" \
  -d '{
    "type": "pcsMove",
    "name": "PCS transportation office packet",
    "includedFields": ["moveSummary", "pcsFields", "items", "boxes", "photos"],
    "imageRule": "reviewedEvidence",
    "allowedActions": ["view", "download"]
  }'
```

Update a documentation profile:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/moves/MOVE_ID/documentation-profiles/DOCUMENTATION_PROFILE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: profile-update-001" \
  -d '{
    "filters": { "statuses": ["damaged", "missing"] },
    "allowedActions": ["view", "download", "uploadEvidence"]
  }'
```

Archive a documentation profile:

```bash
curl -X DELETE https://movingmanifest.com/api/v1/moves/MOVE_ID/documentation-profiles/DOCUMENTATION_PROFILE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: profile-archive-001"
```

Create a CSV export:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/exports \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: export-001" \
  -d '{ "type": "inventory" }'
```

Supported `type` values:

- `inventory`
- `boxes`
- `assignments`
- `documentationProfile`

For `documentationProfile`, include `documentationProfileId`.

List exports:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/exports \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Download an unexpired export artifact:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/exports/EXPORT_JOB_ID/download \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Exports are currently generated synchronously as CSV text and expire according
to their `expiresAt` value. Generic inventory exports omit value, serial, and
private note fields. Documentation-profile exports include only fields allowed
by the selected profile.

The in-app Layout Studio export uses the same `exportJobs` history and download
artifact path with `type: "floorPlan"` and `format: "print"`. That artifact is
print-ready HTML with sanitized SVG snapshots and room manifests; it hides
blueprint underlays, values/prices, private notes, and free-text annotations.

List safe share-link metadata:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Create a documentation share link:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: share-link-001" \
  -d '{
    "documentationProfileId": "DOCUMENTATION_PROFILE_ID",
    "scope": "profile",
    "label": "PCS packet for transportation office",
    "role": "guest",
    "allowedActions": ["view", "download"],
    "expiresAt": 1780876800000
  }'
```

The create response includes the raw `token` and `/share/{token}` URL once.
List responses only include safe metadata such as `shareLinkId`, `tokenPreview`,
status, scope, allowed actions, expiration, and access counts.

Create a move-scoped plan share link:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: plan-share-link-001" \
  -d '{
    "scope": "move",
    "label": "Unload plan for crew",
    "role": "guest",
    "allowedActions": ["viewPlan"],
    "expiresAt": 1780876800000
  }'
```

`viewPlan` exposes the public read-only Layout Studio plan surface. The public
payload hides blueprint underlays, values/prices, private notes, raw storage
metadata, and free-text plan annotations.

List recent public-recipient comments for all share links on a move:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links/comments \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

List comments for one share link:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links/SHARE_LINK_ID/comments \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Comment responses include safe share/profile metadata, author label, role,
comment body, and creation time. They never include raw share tokens.

Revoke a share link:

```bash
curl -X DELETE https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links/SHARE_LINK_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: share-link-revoke-001"
```

## MCP Server

The MCP tools are available over two transports that share the same code-backed
tool registry (`mcp-server/movingmanifest-mcp.mjs`). The remote OAuth launch can
filter that registry to a narrower trusted-helper surface, so the exact
published tool list must be checked by smoke tests and docs tests:

- **Remote (Streamable HTTP)** at `https://movingmanifest.com/api/mcp` — for
  hosted assistants such as claude.ai custom connectors and Claude Cowork.
  Served by `src/app/api/mcp/route.ts` in the Next.js app.
- **Local (stdio)** via the published `movingmanifest-mcp` npm package — for
  Claude Desktop, Claude Code, Codex, and other clients that run local
  processes.

Both wrap the REST API. Neither connects directly to Convex or Clerk.

Agents should usually call `agent_workbench` first so the server can point them
at the right workflow lane, then call `get_api_capabilities` and
`get_api_context` as needed. `get_api_capabilities` returns a code-backed
capability matrix with supported workflows, required scopes, REST endpoints, MCP
tool names, and known launch blockers. This keeps agents from guessing from a
long tool list and makes operational gaps explicit without treating verified
storage/upload support as unavailable.

If `knownLaunchBlockers` includes `MOVE-238`, do not assume hosted OAuth
connector registration is ready. Claude reported dynamic client registration
failure reference `ofid_a7fc26bd131d0216`. Verify Clerk production OAuth
applications still have Dynamic client registration enabled, or temporarily
create a production OAuth client and add its Client ID in the Claude connector
settings. After registration succeeds, complete the authorization flow with
`scott@thejarvie.com`, then run the remote MCP smoke before publishing the
connector broadly:

```bash
node scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp
```

Older launch-readiness checks may still reference
`MOVE-63` for production Clerk environment setup; treat `MOVE-238` as the
current real-account remote MCP validation handoff.

### MCP refresh and reconnect recovery

Hosted MCP clients can cache tool lists, OAuth credentials, and connector
metadata. After a deploy, OAuth setting change, trusted-helper toolset change,
or npm package update, agents should refresh the MCP tool list or restart the
current assistant session before concluding the API is broken.

The public page `https://movingmanifest.com/mcp` is the human setup guide, not
the canonical connector endpoint. Hosted connectors should use
`https://movingmanifest.com/api/mcp`. If a connector shows HTML, never opens
OAuth, lists no MovingManifest tools, or behaves like it connected to
documentation instead of tools, ask the user to switch the connector URL to
`/api/mcp`. MovingManifest routes obvious machine-looking `/mcp` requests to
`/api/mcp`, but agents should still give users the canonical endpoint.

Claude and some hosted clients may require the user to approve every tool
separately. Explain the tradeoff: one-by-one approval is safer but noisy; for a
smoother trusted-helper workflow, the user can open connector permissions and
choose Allow all only if they trust the MovingManifest connector and signed-in
account. Prefer workflow tools such as `save_box_intake`,
`batch_upsert_movable_units`, `batch_upsert_items`, and `ingestion_queue`
`submitResults` so normal work takes fewer approvals.

If expected tools are missing, the tool count does not match
`get_api_capabilities`, or private calls such as `get_api_context` fail with
`Invalid API key format`, `invalid_token`, missing scopes, or an OAuth client
mismatch immediately after setup, retry this sequence:

1. Refresh the client MCP tools/list or start a fresh session.
2. Call `agent_workbench`, then `get_api_context`.
3. If the same private-call auth failure remains, tell the user to disconnect
   and reconnect the MovingManifest connector so the client receives fresh
   OAuth credentials and tool metadata.

Do not ask the user for a raw `mmk_` helper key in an OAuth-capable hosted
client unless the client cannot use remote MCP OAuth. For API-key fallback
clients, `Invalid API key format` means the bearer token is not a generated
MovingManifest helper key; create or copy a fresh scoped key from
Settings -> AI Connections.

### Remote MCP

```
Endpoint: https://movingmanifest.com/api/mcp
Primary auth: OAuth protected-resource discovery + Clerk sign-in/consent
Fallback:     Authorization: Bearer mmk_replace_with_a_scoped_api_key
```

OAuth-capable hosted clients should be given only the endpoint URL. The
unauthenticated MCP response includes `WWW-Authenticate` protected-resource
metadata, which points the client to Clerk OAuth. Clerk dynamic client
registration plus PKCE lets the user sign in and grant access without copying a
raw MovingManifest key into chat.

For the first hosted/mobile OAuth launch, use the trusted-helper MCP surface by
setting `MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper`. That keeps OAuth
clients focused on setup, capture queue processing, researched item writes,
photo upload, packing, and transport assignment while leaving admin/export/delete
tools available to explicitly scoped `mmk_` API-key clients. Omitting the env var
keeps the full shared tool registry for compatibility and testing; do not publish
a broad OAuth connector without an explicit product/security decision. Use
`--expect-trusted-helper-toolset` in the authorized OAuth smoke before publish so
the real hosted connector proves this narrower surface.

Scoped `mmk_` API keys remain supported for local, headless, or older hosted MCP
clients. `x-api-key` headers and a `?key=mmk_...` query parameter are accepted
as fallbacks for clients that cannot set custom headers; prefer the bearer
header because URLs can end up in logs. Requests without usable OAuth or a key
get a 401 with a pointer to the MCP protected-resource metadata.

In claude.ai or Claude Cowork: Settings → Connectors → Add custom connector →
paste the endpoint URL. If the client supports OAuth, complete MovingManifest
sign-in and consent. If the client does not support OAuth, create a scoped
helper key at Settings → AI Connections and supply it as the bearer token.

### Local MCP

Run from the published package (no repo clone needed):

```bash
MOVINGMANIFEST_API_KEY="mmk_replace_with_a_scoped_api_key" npx -y movingmanifest-mcp
```

From this repo during development: `npm run mcp` with the same env. Optional
env override (defaults to production):

```bash
MOVINGMANIFEST_API_BASE_URL="https://movingmanifest.com/api/v1"
```

Codex CLI/App setup:

```bash
codex mcp add movingmanifest \
  --env MOVINGMANIFEST_API_KEY=mmk_replace_with_a_scoped_api_key \
  -- npx -y movingmanifest-mcp
```

Equivalent Codex `config.toml`:

```toml
[mcp_servers.movingmanifest]
command = "npx"
args = ["-y", "movingmanifest-mcp"]

[mcp_servers.movingmanifest.env]
MOVINGMANIFEST_API_KEY = "mmk_replace_with_a_scoped_api_key"
```

After adding the server, restart Codex or start a fresh Codex session, use
`/mcp` or `codex mcp list` to confirm `movingmanifest` is enabled, then call
`get_api_context` to verify the current connection before reading or writing
private move data.

### Agent Journey Smoke

`npm run smoke:agent-journey` is the canonical end-to-end API/MCP workflow
check. It verifies key context, creates a throwaway move, creates and updates
items with durable current/destination spaces, appends a private note, uploads
item photos, processes ingestion queue media through MCP image blocks, submits
trusted queue results, submits and approves review-first queue suggestions,
packs boxes, assigns transport, reads the summary back, then archives the
throwaway move.

Use a non-production API base URL whenever possible:

```bash
SMOKE_TEST_API_KEY="mmk_replace_with_household_scoped_smoke_key" \
MOVINGMANIFEST_API_BASE_URL="https://preview.example.com/api/v1" \
npm run smoke:agent-journey
```

If the target is `movingmanifest.com`, the smoke refuses to run unless the
production write is explicit:

```bash
SMOKE_TEST_API_KEY="mmk_replace_with_household_scoped_smoke_key" \
SMOKE_TEST_ALLOW_PRODUCTION_WRITES=true \
npm run smoke:agent-journey
```

Only use that production flag for an approved throwaway verification run. The
script archives its smoke move in cleanup, but it still creates production
records and uploads media while running.

Authorized OAuth smoke attempts wait for the local browser callback for five
minutes by default. If Google, Clerk, or a browser extension popover blocks the
flow, the command exits instead of hanging forever. Override the wait with
`--authorize-timeout-ms 600000` or `MCP_OAUTH_SMOKE_AUTHORIZE_TIMEOUT_MS=600000`
when a manual sign-in is expected to take longer.

Desktop agent config example (Claude Desktop and similar):

```json
{
  "mcpServers": {
    "movingmanifest": {
      "command": "npx",
      "args": ["-y", "movingmanifest-mcp"],
      "env": {
        "MOVINGMANIFEST_API_KEY": "mmk_replace_with_a_scoped_api_key"
      }
    }
  }
}
```

Publishing the package (maintainers): bump the version in
`mcp-server/package.json` and the `McpServer` constructor in
`mcp-server/movingmanifest-mcp.mjs`, then `cd mcp-server && npm publish`.

Available MCP tools:

| Tool                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_api_capabilities`         | Inspect supported REST/MCP workflows, required scopes, tools, and known launch blockers without calling the API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `agent_workbench`              | Read-first workflow guide that tells agents which small lane to use for capture queue processing, photo inventory, review-first suggestions, or trusted-helper writes before using the broader tool surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `get_api_context`              | Inspect the current OAuth/API-key connection's household, scopes, connection type, and move restriction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `list_household_members`       | List real household login access and member API access status for the current connection's household.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `add_household_member`         | Add an existing user or create a pending household invitation by email, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `list_moves`                   | List accessible moves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `create_move`                  | Create a move with app-equivalent defaults, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `setup_move`                   | Create or update a move, room lists, transport resources/zones, and starter inventory in one setup call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `get_move_summary`             | Fetch a bounded move summary plus `sectionMeta` and `movableUnitSummary`; accepts `sections` and `maxPerSection` for drill-in reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `get_agent_context`            | Fetch one bounded structured context payload for AI agents, including `movableUnitSummary`; accepts `sections` and `maxPerSection` for focused reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `get_move_questions`           | Fetch structured unanswered-question prompts for setup, PCS, resources, inventory, evidence, load planning, and documentation packets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `get_move_day_checklist`       | Fetch a crew-safe Move Day checklist with box status, item counts, load assignment names, warnings, exception notes, and progress counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `plans_list`                   | List Layout Studio floor plans for a move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `plan_create`                  | Create a destination or origin Layout Studio plan, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `plan_get`                     | Fetch the full plan document before writing ops.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `plan_summary`                 | Fetch a plain-text plan summary for text-only agents and sanity checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `floor_plan_context`           | Fetch the active plan, source images, evidence/measurement ledger, derived calculations, area targets, solve diagnostics, destination spaces, floor-plan queue entries, unresolved agent questions, and placed/unplaced counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `create_floor_plan_intake`     | Upload blueprint images when needed, create/select a plan, and create a `floorPlan` ingestion queue entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `floor_plan_evidence`          | Create, list, update, or supersede floor-plan evidence and unit-aware measurements with provenance, area roles, and constraint strength.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `floor_plan_observations`      | Bulk create, list, update, or supersede atomic image/text observations such as labels, wall segments, openings, doorless passages, fixtures, exterior structures, lot clues, and unknown marks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `floor_plan_relationships`     | Bulk create, list, update, or supersede topology relationships such as connectedTo, adjacentTo, openingIn, doorlessPassageBetween, countsTowardArea, and excludedFromArea.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `floor_plan_calculate`         | Recompute derived measurements and durable calculations such as conditioned area, excluded area, footprint, lot coverage, square-footage variance, and missing-area estimates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `floor_plan_questions`         | Return prioritized missing measurements/questions from the current evidence and solve diagnostics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `floor_plan_solve`             | Validate stored observations, relationships, measurements, and optional topology hints; generate draft geometry only when the evidence graph is sufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `floor_plan_reset_draft`       | Archive stale floor-plan solve runs and reject pending floorplan-generated proposals while preserving photos, evidence, observations, relationships, and measurements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `plan_apply_ops`               | Apply Layout Studio ops directly, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `plan_propose_ops`             | Create a pending Layout Studio proposal, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `plan_snapshot`                | Fetch a no-underlay SVG snapshot for visual self-checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `search_inventory`             | Search item data with optional `agentLabel` and `maxConfidence` filters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `create_item`                  | Create an item with optional attribution, confidence, and item research provenance, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `add_item_from_photo`          | Plain-language fastest MCP intake for one household item from one photo plus a few words: defaults omitted quantity to 1, leaves missing weight/size/disposition/condition blank, stores the original image, creates derivatives server-side, attaches the photo, and returns item/photo IDs plus `agentReview`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `add_box_item_from_photo`      | One-call MCP workflow for opening a rough box: create an item from one photo plus a name, attach the photo, and pack the item into an existing `boxId` or `boxCode` without replacing the box.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `create_item_with_images`      | Fast MCP intake for one new household item plus one or more photos: creates the item, defaults omitted quantity to 1, uploads original images attached to it, and returns item/photo IDs with derivative status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `save_box_intake`              | Workflow MCP intake for one box-focused session: create or update a box with dimensions, weight, description, `containerType`, destination, box-level photos, newly described contents, optional per-content photos, and linked existing items in one approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `batch_upsert_movable_units`   | Create or update a rough load-planning list where each row is a visible box/carton or a large loose item that moves as-is; set `containerType` on box rows for cartons, plastic totes, bins, wardrobe boxes, dish packs, crates, or other reusable/recyclable container types; include `assignedResourceId` and optional `assignedZoneId` when a row's load target is already resolved to explicit MovingManifest IDs; expand coded ranges like `B-001-B-025` into explicit code rows, or use `count` for new code-less auto-coded box rows such as "12 medium boxes"; include `photoIds` on explicit photographed box rows after upload, but do not combine `photoIds` with `count`; live auto-coded box rows without `boxId`/code require a stable `idempotencyKey`; new loose-item rows require `externalSource` plus `externalId` and become active, reviewable movable units; use the same tool with existing `boxId`/code or loose `itemId` rows to patch missing weight, dimensions, volume, photos, or assignment without duplicating records. |
| `batch_add_box_contents`       | One-call MCP workflow for opening an existing rough box and saving several discovered contents: creates/updates item records, defaults them to packed reviewable box contents, and packs them into the existing `boxId` or `boxCode`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `batch_upsert_items`           | Create or update up to 100 items, including append-safe item research provenance on existing item rows, with per-row results and API-side `dryRun` validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `update_item`                  | Update selected item fields, including item research provenance, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `append_item_note`             | Append a private note to one item without reading or replacing existing private notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `delete_item`                  | Soft-delete one item, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `list_move_spaces`             | List durable rooms/spaces for a move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `create_move_space`            | Create a durable room/space target, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `upsert_sale_listing`          | Create or update sale listing workflow fields, pricing research, status, buyer interest, and sold details.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `list_planned_items`           | List desired future items that can be used in Layout Studio before they are owned inventory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `manage_planned_item`          | Create, update, convert, or archive a planned future item by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `create_box`                   | Create a box with optional destination-space reference, `dimensionsIn`, attribution, and confidence, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `add_items_to_box`             | Assign multiple items to one box, with `dryRun` and stable idempotency support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `remove_item_from_box`         | Remove one item-to-box assignment without deleting the item, with `dryRun` and stable idempotency support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `suggest_assignments`          | Generate deterministic box-to-resource/zone suggestions without writing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apply_assignments`            | Apply explicit box-or-loose-item resource/zone assignments for how movable units are transported, with API-side `dryRun` validation and stable idempotency support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `get_ai_provider_status`       | Fetch safe AI provider readiness without exposing provider secrets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `list_ai_jobs`                 | List AI job status summaries without raw provider refs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `list_ai_suggestions`          | List text, photo, or planning suggestions by `kind` for human review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `generate_ai_suggestions`      | Generate text, photo, or planning suggestions by `kind` without directly applying trusted inventory changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `approve_ai_suggestions`       | Approve exact pending suggestion IDs by `kind`, with API-side `dryRun` validation and optional edited drafts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `reject_ai_suggestions`        | Reject exact pending suggestion IDs by `kind`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ingestion_queue`              | Create, list, claim, process, ask questions on, fetch image evidence as MCP content blocks with `action: "media"`, and request signed evidence URLs as fallback for capture-now/process-later queue entries. Trusted committed items support `attachMediaPhotoIds` plus `appendNote` for preserving capture notes in the same result, and append/merge `researchSources` by default on existing item updates. Supports `scopeHint` and `targetPlanId` filters. Box-targeted queue media exposes `boxId`; use `boxAssignments` to pack committed items back into that existing box. Use `agent_workbench` with `mode: "intakeQueue"` first when an agent is deciding how to process captured app work.                                                                       |
| `upload_photo`                 | Easiest MCP single-image upload for ordinary household photos: pass a local `filePath`, public `sourceUrl`, `dataUrl`, or `fileBase64`; MovingManifest stores the original, finalizes metadata, creates derivatives server-side, and returns the `photoId` plus `agentReview`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `upload_photos`                | Easiest MCP batch upload for several ordinary household photos or several new photos attached to one existing item; pass shared defaults plus one image entry per user photo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `upload_evidence_file`         | Easy MCP media upload: pass a local `filePath` or `sourceUrl`; the tool starts the upload session, PUTs the original, finalizes metadata, triggers server-side image derivatives, and returns the `photoId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `start_photo_upload`           | Start an evidence media upload session and return presigned original/optional derivative upload information.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `finalize_photo_upload`        | Finalize a completed presigned upload and create the evidence record after server-side object verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `attach_photo`                 | Attach/update photo evidence metadata after upload finalization, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `get_photo_display_url`        | Return a short-lived URL for a normal web-ready image derivative; does not expose original private storage files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `list_transport_resources`     | List resources and zones for load planning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `list_move_people`             | List move people/contact records, with optional archived records.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `manage_move_person`           | Create, update, or archive a move person/contact record by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `manage_transport_resource`    | Create or update a transport resource by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `manage_transport_zone`        | Create or update a transport zone by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `get_capacity_report`          | Fetch move, box, large loose item, resource, and zone capacity estimates and warning counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `list_documentation_profiles`  | List scoped documentation profiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `manage_documentation_profile` | Create, update, or archive a scoped documentation profile by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `manage_exports`               | Create, list, or download export jobs by `action`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `list_share_links`             | List safe share-link metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `list_share_link_comments`     | List public-recipient comments for a move or one share link without returning raw share tokens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `manage_share_link`            | Create or revoke a scoped documentation share link by `action`, with `dryRun` support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Recommended MCP key scopes depend on the intended agent:

| Agent role              | Suggested scopes                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only helper        | `moves/read`, `inventory/read`, `exports/read`                                                                                                                    |
| Inventory intake helper | `moves/read`, `inventory/read`, `inventory/write`                                                                                                                 |
| Load planning helper    | `moves/read`, `moves/write`, `inventory/read`, `inventory/write`                                                                                                  |
| Photo intake helper     | `moves/read`, `inventory/read`, `photos/write`                                                                                                                    |
| Household setup helper  | `moves/read`, `members/manage`                                                                                                                                    |
| Documentation helper    | `moves/read`, `inventory/read`, `exports/read`, `exports/create`                                                                                                  |
| Broad move assistant    | `moves/read`, `moves/write`, `inventory/read`, `inventory/write`, `plans/read`, `plans/write`, `photos/write`, `exports/read`, `exports/create`, `members/manage` |
| Layout Studio helper    | `plans/read`, `plans/write`, plus `inventory/read` when placing real items or boxes                                                                               |

Prefer move-restricted API keys for local agents.

## Security Guidance

- Use separate keys per agent/client.
- Prefer the smallest scope set that supports the workflow.
- Prefer move-restricted keys when the agent only needs one move.
- If key verification returns `insufficient_scope` because member API access is
  disabled, ask the user to contact a household owner/admin rather than retrying
  with the same key.
- Store keys in local MCP client config or a password manager, not source code.
- Use `dryRun` before write tools when an agent is planning a bulk change.
- Revoke keys after temporary helper sessions.

## Webhooks and Async Jobs

There is no public webhook contract yet. Clerk webhooks are internal app
infrastructure.

Current export jobs complete synchronously. Future long-running export or AI
jobs should expose a status endpoint and a stable event/webhook contract before
external clients depend on background completion.

## Versioning

The current API version is `v1` in the URL path. Breaking changes should ship
under a new path such as `/api/v2`. Additive response fields may be added within
`v1`; clients should ignore unknown fields.
