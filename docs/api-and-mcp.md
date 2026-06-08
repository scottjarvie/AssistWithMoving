# MovingManifest API and MCP Guide

This guide covers the shipped `v1` REST API and the local MCP server package.
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
| `photos/write` | Start/finalize photo upload sessions and attach/update photo metadata. |
| `exports/read` | List profiles, exports, share-link metadata, and read unexpired export artifacts. |
| `exports/create` | Create export jobs and create/revoke documentation share links. |

Keys may also be restricted to a single move. A move-restricted key should use
move-scoped endpoints such as `/moves/{moveId}/exports/{exportJobId}`.
The move summary endpoint requires `moves/read`, `inventory/read`, and
`exports/read` because it returns move, inventory, photo metadata, documentation,
and export state in one response.

Top-level object aliases such as `/items/{itemId}`, `/boxes/{boxId}`, and
`/photos/{photoId}/attach` still validate object ownership server-side. For
move-restricted keys, include `moveId` in the JSON body or query string so the
key can be authenticated before the object is loaded. Top-level `DELETE`
aliases, including `/items/{itemId}` and `/boxes/{boxId}/items/{itemId}`, must
pass `moveId` as a query parameter because DELETE bodies are not parsed.

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

There is no custom product-level rate-limit header yet. Clients should behave
conservatively:

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

Get one move:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

Get one compact move summary:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/summary \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The summary response includes the move, resources, zones, items, boxes,
assignments, photo metadata, documentation profiles, export jobs, counts, and a
`generatedAt` timestamp. It omits storage keys and original photo URLs.

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
  -d '{ "code": "OFFICE-1", "label": "Office books", "room": "Office" }'
```

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

Get a capacity report:

```bash
curl https://movingmanifest.com/api/v1/moves/MOVE_ID/capacity-report \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key"
```

The capacity report requires `moves/read` and `inventory/read`. It returns
move-level weight/volume estimates, allowance percentage, missing-estimate
counts, per-box estimates and warnings, resource capacity usage, and zone usage.

## Photos

Photo upload is a two-step flow.

1. Start an upload session and receive a presigned Backblaze URL.
2. PUT the file to the returned `uploadUrl`.
3. Finalize the photo metadata.

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
    "sizeBytes": 123456
  }'
```

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
creates the photo record.

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

Revoke a share link:

```bash
curl -X DELETE https://movingmanifest.com/api/v1/moves/MOVE_ID/share-links/SHARE_LINK_ID \
  -H "Authorization: Bearer mmk_replace_with_a_scoped_api_key" \
  -H "Idempotency-Key: share-link-revoke-001"
```

## MCP Server

The local MCP server wraps the REST API. It does not connect directly to Convex
or Clerk.

Run locally:

```bash
MOVINGMANIFEST_API_KEY="mmk_replace_with_a_scoped_api_key" npm run mcp
```

Optional env:

```bash
MOVINGMANIFEST_API_BASE_URL="https://movingmanifest.com/api/v1"
```

Desktop agent config example:

```json
{
  "mcpServers": {
    "movingmanifest": {
      "command": "node",
      "args": ["/absolute/path/to/MovingManifest/mcp-server/movingmanifest-mcp.mjs"],
      "env": {
        "MOVINGMANIFEST_API_BASE_URL": "https://movingmanifest.com/api/v1",
        "MOVINGMANIFEST_API_KEY": "mmk_replace_with_a_scoped_api_key"
      }
    }
  }
}
```

Available MCP tools:

| Tool | Purpose |
| --- | --- |
| `get_api_context` | Inspect the current API key's household, scopes, and move restriction. |
| `list_moves` | List accessible moves. |
| `create_move` | Create a move with app-equivalent defaults, with `dryRun` support. |
| `get_move_summary` | Fetch a move plus resources, zones, inventory, boxes, assignments, photo metadata, planning suggestions, documentation profiles, export jobs, and share-link metadata. |
| `search_inventory` | Search item data with optional filters. |
| `create_item` | Create an item, with `dryRun` support. |
| `batch_upsert_items` | Create or update up to 100 items with per-row results and API-side `dryRun` validation. |
| `update_item` | Update selected item fields, with `dryRun` support. |
| `delete_item` | Soft-delete one item, with `dryRun` support. |
| `create_box` | Create a box, with `dryRun` support. |
| `add_items_to_box` | Assign multiple items to one box, with `dryRun` support. |
| `remove_item_from_box` | Remove one item-to-box assignment without deleting the item, with `dryRun` support. |
| `suggest_assignments` | Generate deterministic box-to-resource/zone suggestions without writing. |
| `apply_assignments` | Apply explicit box-to-resource/zone assignments, with API-side `dryRun` validation. |
| `list_planning_suggestions` | List AI planning review suggestions by status. |
| `generate_planning_suggestions` | Create deterministic estimate/load suggestions in the review queue, with `dryRun` support. |
| `approve_planning_suggestions` | Approve exact pending planning suggestion IDs, with optional edited estimate drafts or assignment override reasons. |
| `reject_planning_suggestions` | Reject exact pending planning suggestion IDs. |
| `start_photo_upload` | Start a photo upload session and return presigned upload information. |
| `attach_photo` | Attach/update photo evidence metadata after upload finalization, with `dryRun` support. |
| `list_transport_resources` | List resources and zones for load planning. |
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
| `create_share_link` | Create a scoped documentation share link, with `dryRun` support. |
| `revoke_share_link` | Revoke a documentation share link, with `dryRun` support. |

Recommended MCP key scopes depend on the intended agent:

| Agent role | Suggested scopes |
| --- | --- |
| Read-only helper | `moves/read`, `inventory/read`, `exports/read` |
| Inventory intake helper | `moves/read`, `inventory/read`, `inventory/write` |
| Load planning helper | `moves/read`, `moves/write`, `inventory/read`, `inventory/write` |
| Photo intake helper | `moves/read`, `inventory/read`, `photos/write` |
| Documentation helper | `moves/read`, `inventory/read`, `exports/read`, `exports/create` |

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
