---
name: movingmanifest
description: Use when the user wants to manage their MovingManifest move, inventory, rooms, boxes, photos, vehicles, sale prep, floor plans, or documentation packets.
---

# MovingManifest

MovingManifest is a structured move workspace for household moves, inventory, box packing, evidence photos, transport/load planning, sale prep, and documentation packets.

## Safety

- Never reveal or store the raw API key outside the user's chosen agent environment.
- For OAuth-capable hosted MCP clients, connect
  `https://movingmanifest.com/api/mcp` and use MovingManifest sign-in/consent;
  do not ask the user for a raw `mmk_` key in that flow.
- Ask the user for a scoped key only for local MCP, REST/OpenAPI, or hosted
  clients that cannot do OAuth MCP.
- Prefer move-restricted keys for one-move work.
- Store local keys only in the chosen client's env/config/auth field, never in
  source code, public chat, screenshots, logs, or issue text.
- Verify access first with MCP `get_api_context` or REST `GET /me`; check
  `connection.user.email` and `connection.householdMember.apiAccessAllowed`
  when present.
- If verification says member API access is disabled, ask the user to contact a household owner/admin instead of retrying the same connection.

## Connect

Remote MCP endpoint for OAuth-capable hosted assistants:

```text
https://movingmanifest.com/api/mcp
```

If the MCP client supports OAuth protected-resource discovery, connect with the
endpoint only and let MovingManifest/Clerk handle sign-in and consent. Do not ask
the user for a raw `mmk_` key in that flow.

Remote MCP fallback for API-key clients:

```text
https://movingmanifest.com/api/mcp
Authorization: Bearer mmk_replace_with_a_scoped_api_key
```

Local MCP server:

```sh
MOVINGMANIFEST_API_KEY="mmk_replace_with_a_scoped_api_key" npx -y movingmanifest-mcp
```

REST fallback:

```text
Base URL: https://movingmanifest.com/api/v1
Auth: Authorization: Bearer mmk_replace_with_a_scoped_api_key
```

## Workflow

1. Call `agent_workbench`, then `get_api_capabilities` and `get_api_context`.
   Hosted Claude connectors should use `https://movingmanifest.com/api/mcp`,
   not `https://movingmanifest.com/mcp`. The `/mcp` URL is the human setup page.
   If tools do not appear, OAuth never starts, or Claude seems connected to an
   HTML documentation page, tell the user to switch the connector URL to
   `/api/mcp`.
   Claude may ask the user to allow each tool separately. The user can approve
   tools one by one, or open connector permissions and choose Allow all only if
   they trust the MovingManifest connector and the signed-in account.
   If `get_api_context` returns `connection.status: "needs_household"`, OAuth
   sign-in worked but the account has no active household yet. Stop private work
   and ask the user to open `https://movingmanifest.com/app/dashboard#household-setup`
   or get invited by the household owner with the same email.
   If expected tools are missing or `get_api_context` fails with
   `Invalid API key format`, `invalid_token`, missing scopes, or an OAuth client
   mismatch right after setup, a deploy, or a toolset change, refresh MCP tools
   or start a fresh assistant session first. If the same private-call auth
   failure persists, tell the user to disconnect and reconnect the
   MovingManifest connector so the client receives fresh OAuth credentials and
   tool metadata.
2. Use `list_moves` or `setup_move`.
3. Read `get_agent_context` before multi-step edits.
4. For captured app work, ask the user to use the MovingManifest Capture page or mobile Capture button for bulk phone photos so originals upload directly to site storage instead of passing through chat as base64. Then call `agent_workbench` with `mode: "intakeQueue"` and use `ingestion_queue` to list and claim. Read queue `intent`, `targetBoxId`, `targetBoxCode`, `targetItemId`, and `targetLabel` before interpreting instructions. Use `ingestion_queue` `action: "media"` for claimed image evidence, and use `action: "evidenceUrl"` only as fallback for oversized, unsupported, audio, or video media. Submit `committedItems` plus optional `committedBoxes`, `boxAssignments`, and `loadAssignments` for trusted one-call inventory/packing/load writes, submit `proposedItems` for review, or ask one `needsInputQuestion`. If queue media or the queue target points at an existing box, create items with `attachMediaPhotoIds` and pack them back into that existing box with `boxAssignments`; do not create a replacement box.
5. Batch inventory with `batch_upsert_items`, at most 100 rows per call.
6. Upload one-off evidence with `upload_photo`, `upload_photos`, or `POST /photos/upload`; for repeated phone intake, prefer the Capture queue.
7. Add private item observations with `append_item_note`; do not use `update_item` with `privateNotes` just to append text.
8. For blueprint/floor-plan images, use `create_floor_plan_intake`, then record measurements, area targets, lot/property zones, and provenance with `floor_plan_evidence`; run `floor_plan_calculate`; use `floor_plan_questions` when constraints are incomplete; validate with `floor_plan_solve`; and propose geometry with `plan_propose_ops`.
9. For rough move planning, use `batch_upsert_movable_units` when the user gives a mixed list of boxes/cartons and large loose items. Expand numbered coded box ranges like "boxes 1-25" or `B-001-B-025` into one box row per explicit code before calling it; each physical box is its own movable unit. Set `containerType` when the user says carton, plastic tote, bin, wardrobe box, dish pack, crate, or similar; do not bury reusable/recyclable container type only in `label` or `description`. For new code-less boxes such as "12 medium boxes", you may send one box row with `count: 12`; the tool expands it and returns `unitCountIndex` / `unitCount`. If photos are already uploaded for several boxes/totes, put those `photoIds` on the matching explicit box rows so the same batch attaches them; do not combine `photoIds` with `count`. If live box rows have no `boxId` or `code`, pass a stable `idempotencyKey` such as `rough-garage-2026-06-19` so retries do not create duplicate auto-coded boxes. If a rough row already has a resolved load target, include `assignedResourceId` and optional `assignedZoneId`; use `apply_assignments` later for stricter validation, reassignment, or review-driven load changes. Before asking the user for missing measurements or load assignments, read `movableUnitSummary.measurementRoute` and suggest one room/source area to measure next; reuse grouped or flat `gapExamples[].measurementPatchHint.target` and `assignmentExamples[].assignmentPatchHint.target` for follow-up writes. Use `batch_upsert_movable_units` again to fill missing weight, dimensions, volume, or assignment without duplicating records; include `photoIds` on box rows when photos need to be attached later. Box codes are normalized before matching, so `b 012` and `B-012` target the same box.
10. When a user is focused on one box, use `save_box_intake`: create or update the box, preserve `dimensionsIn`, weight, description, `containerType`, destination, box photos, newly described contents, optional content photos, and linked existing items in one approval. If the user queued several photos from the scanned/open box, process the queue with `ingestion_queue` and use media `boxId`, queue `targetBoxId`, queue `targetBoxCode`, or instruction `boxCode` as the existing box target; do not create a replacement box. Tell the user the physical follow-up after writing, such as "write B-001 on the box."
11. Use lower-level `create_box`, `add_box_item_from_photo`, `batch_add_box_contents`, and `add_items_to_box` only in full/API-key mode for advanced partial work.
12. Store "how transported" structurally during `batch_upsert_movable_units` when the load target is already resolved; use `suggest_assignments` and `apply_assignments` later for review or reassignment; assign boxes with `boxId` and large loose items with `itemId`; use `requiresPersonalTransport` or `disposition: "personalTransport"` for owner-carry intent.
13. Verify with `get_move_summary`.

## Practice

- Use `Idempotency-Key` for REST writes.
- Stay under 300 requests per 5 minutes.
- Use `limit` and `offset` for pagination. `cursor` is still accepted as a legacy alias.
- Search/list before using opaque IDs.
- Use dry runs when available.
- Set `agentLabel` and `aiConfidenceScore` on estimated agent-created records.
- Store researched item identity/spec/context in `researchSummary`,
  `researchSources`, `researchNotes`, and `researchConfidence`. Set each
  research source `status` to `used`, `checked`, `blocked`, `gated`, `failed`,
  or `notRelevant`. Use
  `measurementProvenance` for researched size/weight/volume and sale-listing
  research fields for pricing/comps.
- For item locations, use `spaceId`, `spaceName`, or `currentSpaceId` for
  current/origin space and `destinationSpaceId` or `destinationSpaceName` for
  destination/future space. Use `room` and `destinationRoom` only as readable
  fallbacks when durable spaces exist.
- Link uncertain estimates to confidence fields and human review.
- Read https://movingmanifest.com/llms-full.txt for the complete contract.
