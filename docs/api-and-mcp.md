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

## Scopes

API keys can include these scopes:

| Scope | Allows |
| --- | --- |
| `moves/read` | List and read move records. |
| `moves/write` | Update move metadata and create/update transport resources and zones. |
| `inventory/read` | Read items, boxes, assignments, and photo metadata. |
| `inventory/write` | Create/update items, boxes, and assignments. |
| `plans/read` | List/read Layout Studio plans, summaries, proposal lists, and SVG snapshots. |
| `plans/write` | Apply Layout Studio op batches and create pending plan proposals. |
| `photos/write` | Start/finalize photo upload sessions and attach/update photo metadata. |
| `exports/read` | List profiles, exports, share-link metadata, and read unexpired export artifacts. |
| `exports/create` | Create export jobs and create/revoke documentation share links. |
| `members/manage` | List household members and add or invite collaborators by email. |

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

Top-level object aliases such as `/items/{itemId}`,
`/items/{itemId}/convert-to-box`, `/boxes/{boxId}`, and
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

## Agent Journey Smoke

`npm run smoke:agent-journey` runs the canonical public API/MCP journey through
the reusable Node client. It verifies the API key context, creates a labeled
`[SMOKE] agent-journey ...` move, batch-upserts idempotent inventory rows,
uploads and attaches a photo fixture, packs five items into a box, reads the
summary, and archives the smoke move in cleanup.

The command is intentionally env-gated:

```bash
SMOKE_TEST_API_KEY=mmk_dedicated_smoke_key \
MOVINGMANIFEST_API_BASE_URL=https://preview-or-local.example/api/v1 \
npm run smoke:agent-journey
```

If neither `SMOKE_TEST_API_KEY` nor `MOVINGMANIFEST_API_KEY` is set, the command
skips without writing. When pointed at `https://movingmanifest.com/api/v1`, it
also requires `SMOKE_TEST_ALLOW_PRODUCTION_WRITES=true`; use that only with a
dedicated household-scoped smoke key and clearly synthetic test data. Never run
the smoke with a real customer move-restricted key, and never paste secret values
into logs, issues, or PR descriptions.

## Errors

Errors return JSON:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Use a Bearer API key."
  }
}
```

Common statuses:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request or validation failure. |
| `401` | Missing or invalid bearer API key. |
| `403` | API key does not have the required scope. |
| `404` | Route or object was not found for that household/move. |
| `409` | Idempotency key was reused with different request content. |

## Pagination

List endpoints accept:

| Query | Default | Notes |
| --- | --- | --- |
| `limit` | `50` | Clamped to `1..100` for REST helper pagination. |
| `cursor` | `0` | Offset cursor returned as `page.nextCursor`. |

Paginated responses look like:

```json
{
  "data": [],
  "page": {
    "limit": 50,
    "nextCursor": null,
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

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | Maximum requests allowed in the current window. |
| `X-RateLimit-Remaining` | Requests left for the API key in the current window. |
| `X-RateLimit-Reset` | Unix timestamp, in seconds, when the window resets. |
| `Retry-After` | Seconds to wait before retrying, only returned with `429`. |

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

Inspect the current API key context:

```bash
curl https://movingmanifest.com/api/v1/me \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The context response includes the household id/name, key scopes, whether the
key is move-restricted, and the restricted move when applicable. This endpoint
does not return the raw key or secret hash.

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

Expected write responses:

| Status | Meaning |
| --- | --- |
| `201` | Existing MovingManifest user was added as an active household member. |
| `202` | Pending invitation was created for an email without an account yet. |
| `200` | Existing member/invitation was updated or refreshed. |

Supported roles:

| Role | Use |
| --- | --- |
| `admin` | Trusted household administrator who can manage members/settings/keys. |
| `editor` | Full move and inventory editing helper. |
| `packer` | Packing-focused collaborator. |
| `viewer` | Read-focused collaborator. |
| `guest` | Minimal household access. |

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

Update a move:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/moves/MOVE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PCS Utah to Virginia",
    "status": "active",
    "origin": "Utah",
    "destination": "Virginia",
    "dateStart": "2026-08-01",
    "dateEnd": "2026-08-12",
    "distanceMiles": 2050,
    "travelMinutes": 1920,
    "notes": "Pack the garage first.",
    "documentationProfileTypes": ["insuranceClaim"],
    "moveLevelWeightAllowanceLb": 9000
  }'
```

`PATCH /moves/:moveId` accepts `title`, `status`, `origin`, `destination`,
`dateStart`, `dateEnd`, `distanceMiles`, `travelMinutes`, `notes`,
`documentationProfileTypes`, and `moveLevelWeightAllowanceLb`. `status` can be
`planning`, `active`, or `completed`; `archived` is blocked here and must go
through the app archive flow so archive bookkeeping is preserved.
`distanceMiles`, `travelMinutes`, `notes`, and `moveLevelWeightAllowanceLb`
accept `null` to clear the stored value.

Get one compact move summary:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/summary \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The summary response includes the move, resources, zones, people/contacts,
items, boxes, assignments, photo metadata, planning suggestions, documentation
profiles, export jobs, share-link metadata, counts, and a `generatedAt`
timestamp. It omits storage keys and original photo URLs.

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

List items:

```bash
curl "https://movingmanifest.com/api/v1/moves/MOVE_ID/items?limit=25&status=active" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

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
    "condition": "good"
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
the existing item and returns `matchedBy: "externalKey"`. Batches are limited to
100 rows and return per-row results with `succeeded`, `failed`, and `results`
fields. Use `dryRun: true` to validate a batch without writing, then retry with
the same rows and a new idempotency key when ready to commit. If any row fails
validation, the response uses HTTP `207` and includes the failed row details.

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

Convert a mistakenly captured container item into a box:

```bash
curl -X POST "https://movingmanifest.com/api/v1/items/ITEM_ID/convert-to-box?moveId=MOVE_ID" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: convert-item-to-box-001" \
  -d '{ "containerType": "plasticTote" }'
```

`containerType` must be one of `carton`, `plasticTote`, `bin`, `wardrobe`,
`dishPack`, `crate`, or `other`. Conversion is audited as an agent action when it
comes through REST/MCP, preserving the distinction from manual app conversion.

Soft-delete an item:

```bash
curl -X DELETE "https://movingmanifest.com/api/v1/items/ITEM_ID?moveId=MOVE_ID" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: delete-item-001"
```

Top-level item aliases require `inventory/write` for `PATCH`, `POST
/convert-to-box`, and `DELETE`, and `inventory/read` for `GET`. Delete/archive is
a soft delete: the record is hidden from normal inventory reads and the write is
audited.

Create a box:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/boxes \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: create-box-office-001" \
  -d '{ "code": "OFFICE-1", "label": "Office books", "room": "Office" }'
```

For MCP agents, prefer `save_box_intake` when the user wants to add or update a
box with dimensions, weight, photos, a description of what is inside, or
existing item IDs. It composes box create/update, photo upload, item batch
upsert, and item-to-box linking behind one workflow call. Use `dryRun: true`
first for confirmation, and pass a stable `idempotencyKey` whenever creating a
new box so retries do not create duplicates. Updating an existing box requires
`box.boxId`; code-only box upsert remains a lower-level movable-unit workflow.

Update a box through the top-level alias:

```bash
curl -X PATCH https://movingmanifest.com/api/v1/boxes/BOX_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: update-box-001" \
  -d '{ "moveId": "MOVE_ID", "status": "sealed", "actualWeightLb": 42 }'
```

Assign an item to a box:

```bash
curl -X POST https://movingmanifest.com/api/v1/moves/MOVE_ID/assignments \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: assign-item-001" \
  -d '{ "boxId": "BOX_ID", "itemId": "ITEM_ID", "quantity": 1 }'
```

The equivalent top-level box contents alias is:

```bash
curl -X POST https://movingmanifest.com/api/v1/boxes/BOX_ID/items \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: assign-box-item-001" \
  -d '{ "moveId": "MOVE_ID", "itemId": "ITEM_ID", "quantity": 1, "notes": "Top tray" }'
```

Remove an item from a box without deleting the inventory item:

```bash
curl -X DELETE "https://movingmanifest.com/api/v1/boxes/BOX_ID/items/ITEM_ID?moveId=MOVE_ID" \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: remove-box-item-001"
```

Box content writes require `inventory/write`. `POST /boxes/{boxId}/items`
upserts the item-to-box assignment for that move. `DELETE
/boxes/{boxId}/items/{itemId}` removes only the box assignment; it does not
delete the item.

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

Apply reviewed box-to-resource assignments:

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
      }
    ]
  }'
```

The apply endpoint requires `inventory/write`. It accepts only explicit
box/resource/zone assignments, not broad instructions. Use `dryRun: true` first
to validate locked boxes, hard blocks, zone ownership, and warning override
requirements without writing. If any row fails validation, the response uses
HTTP `207` and includes row-level details.

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
    "itemId": "ITEM_ID",
    "boxId": "BOX_ID",
    "photoType": "condition",
    "privacyLevel": "reportVisible",
    "caption": "Pre-move condition photo"
  }'
```

Photo attach requires `photos/write`. It can set or clear `itemId`, `boxId`,
`room`, `claimId`, `documentationProfileTypes`, `caption`, `photoType`,
`privacyLevel`, `visibilityScope`, `source`, `exifHandlingStatus`, `confidence`,
`notes`, `verificationStatus`, `aiProcessed`, and `capturedAt`. It cannot change
storage object keys, file size, MIME type, or original download access.

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
counts, per-box estimates and warnings, resource capacity usage, and zone usage.

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

| Endpoint | Scope | Purpose |
| --- | --- | --- |
| `GET /plans?moveId=MOVE_ID` | `plans/read` | List plans and level summaries. |
| `GET /plans/PLAN_ID` | `plans/read` | Read the full plan document for editing. |
| `GET /plans/PLAN_ID/summary` | `plans/read` | Read a plain-text plan summary. |
| `GET /plans/PLAN_ID/proposals` | `plans/read` | List pending proposals; add `?includeReviewed=true` for proposal history. |
| `GET /plans/PLAN_ID/snapshot.svg` | `plans/read` | Render a no-underlay SVG snapshot. |
| `POST /plans/PLAN_ID/ops` | `plans/write` | Apply ops directly. |
| `POST /plans/PLAN_ID/proposals` | `plans/write` | Create a pending proposal for review. |

### Op Catalog

Every write is an array of ops. The same language is used by mouse edits,
REST, and MCP.

| Op type | Required fields | Common errors |
| --- | --- | --- |
| `createLevel` | `level.name`, `level.levelType`, `level.sortOrder` | Missing name or invalid level type. |
| `updateLevel` | `levelId`, `patch` | Unknown or archived level. |
| `deleteLevel` | `levelId` | Locked or missing child records can block deletion. |
| `setLevelUnderlay` | `levelId`, optional `underlay` | Underlay photo not on the move. |
| `createEntity` | `entity.levelId`, `entity.entityType`, matching geometry object | Missing geometry for the type. |
| `updateEntity` | `entityId`, `patch` | Locked entity or invalid geometry. |
| `renameEntity` | `entityId`, optional `name` | Locked entity. |
| `deleteEntity` | `entityId` | Locked entity. |
| `createPlacement` | exactly one source plus `levelId`, `x`, `y`, `rotationDeg` | Missing source or multiple sources. |
| `movePlacement` | `placementId`, `x`, `y`, `rotationDeg` | Locked placement. |
| `updatePlacement` | `placementId`, `patch` | Locked placement, invalid footprint, or source patch without exactly one source. |
| `setContainment` | `placementId`, optional `parentPlacementId`, optional `containmentMode` | Cycles, missing parent, or locked placement. |
| `deletePlacement` | `placementId` | Locked placement or locked contained children. |
| `updatePlanSettings` | `patch` | Non-positive defaults or grid values. |

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

Blueprint intake is completed in a later issue, but the intended agent flow is:

1. Claim or inspect the capture-queue entry for blueprint photos.
2. Download the photos through the media/capture tooling.
3. Call `plan_get` to read levels, existing rooms, and counters.
4. Use `plan_propose_ops` with `reasoning` that explains scale assumptions,
   room labels, and uncertain walls.
5. Call `plan_snapshot` for the target level and inspect the SVG. Vision-capable
   agents should compare the snapshot with the blueprint photo.
6. Refine with another proposal instead of silently overwriting the first batch.

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

For MCP agents, prefer the plain `upload_image` or `upload_photo` alias, or
`upload_evidence_image` when the client already knows that name, for normal
single-image work. The assistant can pass a local `filePath`, public
`sourceUrl`, `dataUrl`, or `fileBase64`; MovingManifest stores the original,
finalizes evidence metadata, creates web-ready derivatives server-side, and
returns the `photoId`.
For local `filePath`, the MCP helper reads the file and sends the original image
bytes directly to `POST /photos/upload`; it does not require the agent to
base64-wrap the photo, calculate dimensions, or create display files. Use
`upload_images`, `upload_photos`, or `upload_evidence_images` when the user gives several
ordinary photos from the same room or context. Use `upload_evidence_file` for
audio/video or when a client wants the explicit presigned upload flow.

Quick rule for agents: one user photo should normally mean one
`upload_image`/`upload_photo`/`upload_evidence_image` call in MCP or one
`POST /images/upload` or `POST /photos/upload` call in REST.
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
long interview.
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

Quantity should stay lightweight: if the user states a count or the photo
clearly shows several identical units that should be one inventory record, set
`quantity` from that evidence and mention it in the `agentReview` summary. If
the count is not obvious, omit quantity and let the item default to `1` instead
of asking a blocking follow-up question.

For photos that belong to an item that already exists, use the shorter attach
workflow instead of creating another item:

1. Resolve the target item with `get_agent_context` or `get_move_summary`.
   If the user's item name has one obvious match, use that `itemId`. If two
   matches are plausible, ask the user before uploading.
2. Call `upload_photos` or `upload_evidence_images` with shared defaults:
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
sizes without storage URLs or object keys. MCP clients should pass `filePath` to
`upload_evidence_image` and let the local MCP server read and send the original
file bytes. Set `generateAiSuggestions` when the same upload should also place
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

For MCP clients, use `upload_photo` first. `upload_evidence_image` is the same
single-image path under the evidence-specific name:

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

For several photos, use `upload_photos` or `upload_evidence_images` with shared
defaults and one entry per image:

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

Hosted assistants reach MovingManifest through **two separate doors — do not
confuse them** (crossing them is the recurring "Invalid API key format" 401):

- **OAuth door (recommended for claude.ai / Cowork):**
  `https://movingmanifest.com/mcp/connect` — sign in with your MovingManifest
  account, no key to copy. This is the OAuth 2.1 flow (Clerk) via the
  convex-mcp-gateway. **Use this URL for any client that supports browser
  sign-in.** Discovery: `/.well-known/oauth-protected-resource/mcp/connect`.
- **API-key door:** `https://movingmanifest.com/api/mcp` — accepts `mmk_` API
  keys ONLY (forwarded to REST as a key). It **cannot** consume an OAuth/JWT
  token, so do not point an OAuth sign-in at it. For local/headless tools, CI,
  or clients that can't OAuth.

> ⚠️ `/api/mcp` does NOT do OAuth. If you paste it into an OAuth client, the
> sign-in completes but every tool call 401s ("Invalid API key format"). Use
> `/mcp/connect` for OAuth. See `src/lib/mcp-oauth.ts` for the full rationale.

The tool implementations are available over transports that share one tool
registry (`mcp-server/movingmanifest-mcp.mjs`), so they cannot drift:

- **Remote (Streamable HTTP)** at `https://movingmanifest.com/api/mcp` (API key)
  or `https://movingmanifest.com/mcp/connect` (OAuth) — for hosted assistants
  such as claude.ai custom connectors and Claude Cowork. Served by
  `src/app/api/mcp/route.ts` and `src/app/mcp/connect/route.ts`.
- **Local (stdio)** via the published `movingmanifest-mcp` npm package — for
  Claude Desktop, Claude Code, Codex, and other clients that run local
  processes.

Both wrap the REST API. Neither connects directly to Convex or Clerk.

Agents should usually call `get_api_capabilities` first. It returns a
code-backed capability matrix with supported workflows, required scopes,
REST endpoints, MCP tool names, and known launch blockers. This keeps agents
from guessing from a long tool list and makes operational gaps explicit without
treating verified storage/upload support as unavailable.

### Remote MCP — OAuth door (recommended)

```
Endpoint: https://movingmanifest.com/mcp/connect
Auth:     OAuth 2.1 sign-in (Clerk) — no key to paste
```

In claude.ai or Claude Cowork: Settings → Connectors → Add custom connector →
paste `https://movingmanifest.com/mcp/connect`. The client opens MovingManifest
sign-in and consent; on approval it can call the tools. No `mmk_` key needed.

### Remote MCP — API-key door

```
Endpoint: https://movingmanifest.com/api/mcp
Auth:     Authorization: Bearer mmk_replace_with_a_scoped_api_key
```

For clients that can't OAuth (local/headless, CI). `x-api-key` headers and a
`?key=mmk_...` query parameter are accepted as fallbacks for clients that cannot
set custom headers; prefer the bearer header because URLs can end up in logs.
Requests without a key get a 401 pointing to the OAuth endpoint. **This endpoint
rejects OAuth/JWT tokens** — if your client signs in with OAuth, use
`/mcp/connect` above instead.

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
`get_api_context` before reading or writing private move data.

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

| Tool | Purpose |
| --- | --- |
| `get_api_capabilities` | Inspect supported REST/MCP workflows, required scopes, tools, and known launch blockers without calling the API. |
| `get_api_context` | Inspect the current API key's household, scopes, and move restriction. |
| `list_household_members` | List real household login access for the API key household. |
| `add_household_member` | Add an existing user or create a pending household invitation by email, with `dryRun` support. |
| `list_moves` | List accessible moves. |
| `create_move` | Create a move with app-equivalent defaults, with `dryRun` support. |
| `setup_move` | Create or update a move, room lists, transport resources/zones, and starter inventory in one setup call. |
| `update_move` | Update an existing move's basics — name, status (`planning`, `active`, or `completed` only), origin/destination, dates, driving distance (miles), travel time (minutes), notes, documentation profiles, and the official weight allowance. `distanceMiles`, `travelMinutes`, and `moveLevelWeightAllowanceLb` accept `null` to clear. Wraps `PATCH /api/v1/moves/{moveId}`. |
| `get_move_summary` | Fetch a move plus resources, zones, people/contacts, inventory, boxes, assignments, photo metadata, planning suggestions, documentation profiles, export jobs, and share-link metadata. |
| `get_agent_context` | Fetch one compact structured context payload for AI agents: move, spaces, transport, inventory, photos, sale pipeline, counts, and write guidance. |
| `get_move_questions` | Fetch structured unanswered-question prompts for setup, PCS, resources, inventory, evidence, load planning, and documentation packets. |
| `get_move_day_checklist` | Fetch a crew-safe Move Day checklist with box status, item counts, load assignment names, warnings, exception notes, and progress counts. |
| `plans_list` | List Layout Studio floor plans for a move. |
| `plan_get` | Fetch the full plan document before writing ops. |
| `plan_summary` | Fetch a plain-text plan summary for text-only agents and sanity checks. |
| `plan_apply_ops` | Apply Layout Studio ops directly, with `dryRun` support. |
| `plan_propose_ops` | Create a pending Layout Studio proposal, with `dryRun` support. |
| `plan_snapshot` | Fetch a no-underlay SVG snapshot for visual self-checks. |
| `search_inventory` | Search item data with optional filters. |
| `create_item` | Create an item, with `dryRun` support. |
| `add_item_from_photo` | Plain-language fastest MCP intake for one household item from one photo plus a few words: defaults omitted quantity to 1, leaves missing weight/size/disposition/condition blank, stores the original image, creates derivatives server-side, attaches the photo, and returns item/photo IDs plus `agentReview`. |
| `create_item_with_images` | Fast MCP intake for one new household item plus one or more photos: creates the item, defaults omitted quantity to 1, uploads original images attached to it, and returns item/photo IDs with derivative status. |
| `batch_upsert_items` | Create or update up to 100 items with per-row results and API-side `dryRun` validation. |
| `update_item` | Update selected item fields, with `dryRun` support. |
| `delete_item` | Soft-delete one item, with `dryRun` support. |
| `archive_item` | Product-language alias for soft-archiving one item, with `dryRun` support. |
| `convert_item_to_box` | Convert a mistakenly captured container item into a real box. `containerType` must be `carton`, `plasticTote`, `bin`, `wardrobe`, `dishPack`, `crate`, or `other`. |
| `list_move_spaces` | List durable rooms/spaces for a move. |
| `create_move_space` | Create a durable room/space target, with `dryRun` support. |
| `upsert_sale_listing` | Create or update sale listing workflow fields, pricing research, status, buyer interest, and sold details. |
| `list_planned_items` | List desired future items that can be used in Layout Studio before they are owned inventory. |
| `create_planned_item` | Create one planned future item, with `dryRun` support. |
| `update_planned_item` | Update selected planned item fields, with `dryRun` support. |
| `convert_planned_item` | Convert a planned item into owned inventory and re-point Layout Studio placements. |
| `archive_planned_item` | Archive one planned item, with `dryRun` support. |
| `save_box_intake` | Workflow-first box packing tool: create/update one box, attach photos, create described contents, and link existing item IDs in one dry-run/idempotent call. |
| `create_box` | Create a box, with `dryRun` support. |
| `add_items_to_box` | Assign multiple items to one box, with `dryRun` support. |
| `remove_item_from_box` | Remove one item-to-box assignment without deleting the item, with `dryRun` support. |
| `suggest_assignments` | Generate deterministic box-to-resource/zone suggestions without writing. |
| `apply_assignments` | Apply explicit box-to-resource/zone assignments, with API-side `dryRun` validation. |
| `list_planning_suggestions` | List AI planning review suggestions by status. |
| `get_ai_provider_status` | Fetch safe AI provider readiness without exposing provider secrets. |
| `list_ai_jobs` | List AI job status summaries without raw provider refs. |
| `list_ai_text_suggestions` | List text-intake AI review suggestions for human review. |
| `list_ai_photo_suggestions` | List photo-intake AI review suggestions for human review. |
| `generate_ai_text_suggestions` | Generate pending text-intake suggestions from source text without creating trusted inventory. |
| `generate_ai_photo_suggestions` | Generate pending photo-intake suggestions for explicit uploaded photo IDs. |
| `approve_ai_text_suggestions` | Approve exact pending text-intake suggestion IDs, with API-side `dryRun` validation and optional edited item/box drafts. |
| `reject_ai_text_suggestions` | Reject exact pending text-intake suggestion IDs. |
| `approve_ai_photo_suggestions` | Approve exact pending photo-intake suggestion IDs, with API-side `dryRun` validation and optional edited item/box drafts. |
| `reject_ai_photo_suggestions` | Reject exact pending photo-intake suggestion IDs. |
| `generate_planning_suggestions` | Create deterministic estimate/load suggestions in the review queue, with `dryRun` support. |
| `approve_planning_suggestions` | Approve exact pending planning suggestion IDs, with optional edited estimate drafts or assignment override reasons. |
| `reject_planning_suggestions` | Reject exact pending planning suggestion IDs. |
| `get_images` | View existing photos as INLINE viewable images (not just links) so the agent can read model/serial numbers, write descriptions, and judge condition. Filter by `itemId`/`boxId`/`spaceId`/`transportResourceId`/`transportZoneId`/`room`/`all` or pass `photoIds`; `variant` `thumb`/`card`/`detail`/`full` (default `detail`); small `limit`. The MCP server fetches the bytes server-side, so it works even when the agent's own sandbox cannot reach the image host. |
| `upload_photo` | Plain-language alias for `upload_evidence_image`; easiest MCP single-image upload for ordinary household photos. |
| `upload_photos` | Plain-language alias for `upload_evidence_images`; easiest MCP batch upload for several ordinary household photos or several new photos attached to one existing item. |
| `upload_image` | Plain-language alias for `upload_evidence_image`; easiest MCP single-image upload when the user or agent says image instead of photo. |
| `upload_images` | Plain-language alias for `upload_evidence_images`; easiest MCP batch upload when the user or agent says images instead of photos, including several new images for one existing item. |
| `upload_evidence_image` | Easiest MCP single-image upload: pass a local `filePath`, public `sourceUrl`, `dataUrl`, or `fileBase64`; MovingManifest stores the original, finalizes metadata, creates derivatives server-side, and returns the `photoId` plus `agentReview`. |
| `upload_evidence_images` | Batch MCP image helper: pass shared defaults plus one image entry per user photo; each image still uses the one-call upload path and returns per-image status plus `agentReview`. |
| `upload_evidence_file` | Easy MCP media upload: pass a local `filePath` or `sourceUrl`; the tool starts the upload session, PUTs the original, finalizes metadata, triggers server-side image derivatives, and returns the `photoId`. |
| `start_photo_upload` | Start an evidence media upload session and return presigned original/optional derivative upload information. |
| `finalize_photo_upload` | Finalize a completed presigned upload and create the evidence record after server-side object verification. |
| `attach_photo` | Attach/update photo evidence metadata after upload finalization, with `dryRun` support. |
| `list_transport_resources` | List resources and zones for load planning. |
| `list_move_people` | List move people/contact records, with optional archived records. |
| `create_move_person` | Create a move person/contact record, with `dryRun` support. |
| `update_move_person` | Update a move person/contact record, with `dryRun` support. |
| `archive_move_person` | Soft-archive a move person/contact record, with `dryRun` support. |
| `create_transport_resource` | Create a transport resource from a preset or custom fields, with `dryRun` support. |
| `update_transport_resource` | Update resource metadata, capacity, rules, and sort order, with `dryRun` support. |
| `create_transport_zone` | Create a zone inside a resource, with `dryRun` support. |
| `update_transport_zone` | Update zone metadata, capacity, preferred tags, resource, and sort order, with `dryRun` support. |
| `get_capacity_report` | Fetch move, box, resource, and zone capacity estimates and warning counts. |
| `list_documentation_profiles` | List scoped documentation profiles. |
| `create_documentation_profile` | Create a scoped documentation profile, with `dryRun` support. |
| `update_documentation_profile` | Update a documentation profile, with `dryRun` support. |
| `archive_documentation_profile` | Archive a documentation profile, with `dryRun` support. |
| `create_export` | Create a CSV export. |
| `list_exports` | List export jobs. |
| `download_export` | Return an unexpired export artifact as text. |
| `list_share_links` | List safe share-link metadata. |
| `list_share_link_comments` | List public-recipient comments for a move or one share link without returning raw share tokens. |
| `create_share_link` | Create a scoped documentation share link, with `dryRun` support. |
| `revoke_share_link` | Revoke a documentation share link, with `dryRun` support. |

OAuth capture-queue tools (`list_queue`, `claim_queue`, and
`submit_queue_result`) are served by the Convex MCP gateway for signed-in
MovingManifest users. Queue entries expose structured capture hints such as
`itemKind`, `estimatedWeightLb`, `dimensionsIn`, `disposition`,
`startingSpaceId`, `presentSpaceId`, `presentTransportId`, `targetSpaceId`, and
`targetTransportId` so agents do not have to re-parse the user's instructions.
When submitting results, agents may pass `resultItemIds` and `resultBoxIds`.
Omitting either field preserves any previously stored links; passing an empty
array clears that field. Result boxes must belong to the same move and cannot be
archived. If a processed queue entry has uploaded photos and exactly one result
item or box, MovingManifest automatically attaches those photos to that record.

Recommended MCP key scopes depend on the intended agent:

| Agent role | Suggested scopes |
| --- | --- |
| Read-only helper | `moves/read`, `inventory/read`, `exports/read` |
| Inventory intake helper | `moves/read`, `inventory/read`, `inventory/write` |
| Load planning helper | `moves/read`, `moves/write`, `inventory/read`, `inventory/write` |
| Photo intake helper | `moves/read`, `inventory/read`, `photos/write` |
| Household setup helper | `moves/read`, `members/manage` |
| Documentation helper | `moves/read`, `inventory/read`, `exports/read`, `exports/create` |
| Broad move assistant | `moves/read`, `moves/write`, `inventory/read`, `inventory/write`, `plans/read`, `plans/write`, `photos/write`, `exports/read`, `exports/create`, `members/manage` |
| Layout Studio helper | `plans/read`, `plans/write`, plus `inventory/read` when placing real items or boxes |

Prefer move-restricted API keys for local agents.

## Security Guidance

- Use separate keys per agent/client.
- Prefer the smallest scope set that supports the workflow.
- Prefer move-restricted keys when the agent only needs one move.
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
