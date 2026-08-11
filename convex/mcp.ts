// MCP tool surface for the OAuth gateway. Each entry maps an MCP tool name to a
// Convex function in convex/mcpTools.ts; `identityArg: "caller"` tells the
// gateway to inject the verified caller identity into that argument (and strip
// it from the client-facing input schema, so it can't be spoofed). Annotated
// `McpToolRegistration[]` to avoid the codegen circular-type error.
import { v } from "convex/values";
import {
  defineMcpAction,
  defineMcpMutation,
  defineMcpQuery,
  mcpCallerValidator,
  type McpToolRegistration,
} from "convex-mcp-gateway";

import { api, internal } from "./_generated/api";
import {
  addImagesArgs,
  attachPhotosArgs,
  getImagesArgs,
} from "./mcpToolsImages";
import {
  claimQueueArgs,
  listQueueArgs,
  submitQueueResultArgs,
} from "./mcpToolsQueue";
import {
  claimQueueItemArgs,
  completeQueueItemArgs,
  getQueueItemArgs,
  listQueueItemsArgs,
  releaseQueueItemArgs,
  reportQueueFailureArgs,
  requestQueueInputArgs,
} from "./mcpToolsCanonicalQueue";
import {
  archiveItemArgs,
  convertItemToBoxArgs,
  listTransportArgs,
  placeBoxArgs,
  updateBoxArgs,
  updateItemArgs,
  addMoveParticipantArgs,
  updateMoveArgs,
  upsertTransportArgs,
} from "./mcpToolsSetup";
import {
  captureToQueueArgs,
  getItemArgs,
  getMoveOverviewArgs,
  packBoxesArgs,
  searchInventoryArgs,
  setupMoveArgs,
  upsertItemsArgs,
  upsertSpacesArgs,
} from "./mcpToolsWrite";

export const tools: McpToolRegistration[] = [
  defineMcpQuery({
    name: "get_agent_context",
    description:
      "Call FIRST. Returns who you are acting as and the households you can reach (id, name, role). Use a householdId from here for the other tools.",
    fn: api.mcpTools.getAgentContext,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_moves",
    description:
      "List the active moves in a household (origin, destination, type, status). Pass a householdId from get_agent_context.",
    fn: api.mcpTools.listMovesForHousehold,
    args: { caller: mcpCallerValidator, householdId: v.id("households") },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "get_move_summary",
    description: "Basic facts about one move (title, route, type, status, packets).",
    fn: api.mcpTools.getMoveSummary,
    args: {
      caller: mcpCallerValidator,
      householdId: v.id("households"),
      moveId: v.id("moves"),
    },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_move_spaces",
    description:
      "List the rooms / spaces in a move. Returns { truncated, spaces }; truncated=true means there are more than 200.",
    fn: api.mcpTools.listMoveSpaces,
    args: {
      caller: mcpCallerValidator,
      householdId: v.id("households"),
      moveId: v.id("moves"),
    },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_items",
    description:
      "List inventory items in a move (name, room, category, quantity, disposition). Sensitive fields are omitted. Returns { truncated, items }; truncated=true means more than 200 — narrow with search_inventory.",
    fn: api.mcpTools.listItems,
    args: {
      caller: mcpCallerValidator,
      householdId: v.id("households"),
      moveId: v.id("moves"),
    },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_boxes",
    description:
      "List boxes / containers in a move (code, label, room, status). Returns { truncated, boxes }; truncated=true means there are more than 200.",
    fn: api.mcpTools.listBoxes,
    args: {
      caller: mcpCallerValidator,
      householdId: v.id("households"),
      moveId: v.id("moves"),
    },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "get_move_overview",
    description:
      "Orient on a move: title/route/type/status plus live counts of items, items needing review, boxes, and spaces. Call this early.",
    fn: api.mcpToolsWrite.getMoveOverview,
    args: getMoveOverviewArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "search_inventory",
    description:
      "Find items in a move by text (name), room, category, disposition, or needsReview. Returns up to 200 non-sensitive item summaries.",
    fn: api.mcpToolsWrite.searchInventory,
    args: searchInventoryArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "get_item",
    description:
      "Full detail for one item, including its photo ids. Value/serial/private notes appear only if your role may view them.",
    fn: api.mcpToolsWrite.getItem,
    args: getItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "upsert_items",
    description:
      "Add OR update many inventory items in one call (pass itemId to update, omit to create). Supports dryRun to preview. The workhorse for capturing inventory. For an item's weight, dimensions, volume, present location, or transport/zone assignment, use update_item. If you create an item from a photo (or a queue capture) its photos belong ON that item — attach them with attach_photos (attachTo.itemId); when you finish a queue entry via submit_queue_result that happens automatically.",
    fn: api.mcpToolsWrite.upsertItems,
    args: upsertItemsArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "upsert_spaces",
    description:
      "Define or update many ROOMS/SPACES in one call (origin rooms, destination rooms, yard, storage areas) — pass spaceId to update, omit to create, or pass spaceId + archive:true to remove one. This is NOT for transportation: do not pass kind 'transportResource'/'transportZone' (those would create a ghost room invisible to list_transport) — use upsert_transport for trucks/trailers/PODs/movers/storage instead. (Stdio/HTTP server equivalent: create_move_space.)",
    fn: api.mcpToolsWrite.upsertSpaces,
    args: upsertSpacesArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "capture_to_queue",
    description:
      "Drop many capture notes (and references to already-uploaded photo ids) into the move's queue for later processing. Optionally pre-declare STRUCTURED hints so a later processing run applies them directly instead of re-reading the note: itemKind (loose_item|box|tote), estimatedWeightLb, dimensionsIn { lengthIn, widthIn, heightIn }, disposition, startingSpaceId (origin room), presentSpaceId/presentTransportId (where it is now), and the DESTINATION via targetSpaceId (room) or targetTransportId (transport). Space/transport ids must already exist in this move.",
    fn: api.mcpToolsWrite.captureToQueue,
    args: captureToQueueArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_queue",
    description:
      "Compatibility view of Moving's specialized capture pipeline. It projects every entry into the family Queue states (Needs You, Working, Waiting for your AI, Done) while retaining legacyStatus for existing clients. Use list_queue_items for new general handoffs. The optional status filter uses the documented legacy capture vocabulary only.",
    fn: api.mcpToolsQueue.listQueue,
    args: listQueueArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "claim_queue",
    description:
      "Claim the oldest queued capture entries so two agent runs never process the same one. Defaults to YOUR own queue; to help run a queue a move owner delegated to you (share a subscription), pass ownerUserId from list_queue's runnableOwners. Returns the claimed entries — each includes mediaPhotoIds, the already-uploaded photos for that capture. A claim expires after 15 minutes. Use batchSize (default 1, max 10) and an agentLabel to mark your run. Work each entry: turn it into inventory (upsert_items / pack_boxes / convert_item_to_box), then call submit_queue_result — which files the entry's photos onto what you created. For a capture that becomes SEVERAL items, attach each photo to the right one with attach_photos first. Entries whose photo upload FAILED are still returned here and can be claimed + processed normally (a failed upload may never complete); only entries with an upload still actively in flight are held back.",
    fn: api.mcpToolsQueue.claimQueue,
    args: claimQueueArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "submit_queue_result",
    description:
      "Report what a claimed entry produced: link the inventory items you created (resultItemIds) AND/OR the boxes/totes you created (resultBoxIds) to mark it processed, OR ask the user a question (needsInputQuestion → sets it to needs-input). Add a short agentSummary. Pair this with upsert_items / pack_boxes / convert_item_to_box, which create the units. The capture's uploaded photos are AUTOMATICALLY attached to what you made — to the single item in resultItemIds, or (if you didn't create exactly one item) to the box/room/transport the entry targeted — so a capture's photos never get left behind. The result returns attachedPhotoCount. Exception: a capture that became MULTIPLE items can't be auto-split — attach each photo to the right item yourself with attach_photos (using the entry's mediaPhotoIds) before submitting.",
    fn: api.mcpToolsQueue.submitQueueResult,
    args: submitQueueResultArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_queue_items",
    description:
      "List canonical Queue handoffs using exactly Needs You, Working, Waiting for your AI, and Done. Results are bounded and move-scoped; only your own or explicitly delegated Queue items are returned.",
    fn: internal.mcpToolsCanonicalQueue.listQueueItems,
    args: listQueueItemsArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "get_queue_item",
    description:
      "Read one canonical Queue item plus attributable activity history. Use the returned version for concurrency-safe commands.",
    fn: internal.mcpToolsCanonicalQueue.getQueueItem,
    args: getQueueItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "claim_queue_item",
    description:
      "Claim one Waiting for your AI handoff before work begins. Requires a concrete nextStep, records the acting AI, and creates a 15-minute lease so abandoned work becomes claimable again.",
    fn: internal.mcpToolsCanonicalQueue.claimQueueItem,
    args: claimQueueItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "release_queue_item",
    description:
      "Release your active claim back to Waiting for your AI with a durable reason. This does not mark work complete.",
    fn: internal.mcpToolsCanonicalQueue.releaseQueueItem,
    args: releaseQueueItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "request_queue_input",
    description:
      "Move your actively claimed handoff to Needs You with the exact human decision, fact, file, approval, or outside-world action required. Do not use it for vague progress updates.",
    fn: internal.mcpToolsCanonicalQueue.requestQueueInput,
    args: requestQueueInputArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "complete_queue_item",
    description:
      "Finish your actively claimed handoff. Done requires a readable result summary or at least one durable result reference; activity and attribution are recorded.",
    fn: internal.mcpToolsCanonicalQueue.completeQueueItem,
    args: completeQueueItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "report_queue_failure",
    description:
      "Report a bounded work failure. Retryable failures return to Waiting for your AI until the attempt budget is exhausted; exhausted or non-retryable failures become Needs You with an exact review action.",
    fn: internal.mcpToolsCanonicalQueue.reportQueueFailure,
    args: reportQueueFailureArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "setup_move",
    description:
      "Create and configure a new move in a household (seeds planning defaults + transport presets). Use moveType 'pcs' for military moves.",
    fn: api.mcpToolsWrite.setupMove,
    args: setupMoveArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "pack_boxes",
    description:
      "Create boxes and/or pack items into them in one batch. For each box pass an existing boxId, or a new code+label+room; include items: [{ itemId, quantity }] to pack.",
    fn: api.mcpToolsWrite.packBoxes,
    args: packBoxesArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "update_move",
    description:
      "Configure the move: set start/end dates (dateStart/dateEnd), origin/destination, structured start/end locations, distanceMiles, travelMinutes, status (planning|...), or title. Only the fields you pass change.",
    fn: api.mcpToolsSetup.updateMove,
    args: updateMoveArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "add_move_participant",
    description:
      "Add a person to this move and choose their access. Pass email + optional name (the name is remembered even before they have an account). participantType picks a preset: householdMember (family — full household-backed access), helper (a friend, this move only), mover or company (a moving company, this move only — item values & serials stay hidden). Optionally override role (admin|editor|packer|viewer|guest) and accessKind (householdBacked|moveOnly). You can only grant a role up to your own. canRunMyQueue:true also lets them run YOUR capture queue with their own agent (share an AI subscription). If the email has no account yet the invite is saved and auto-activates when they sign up.",
    fn: api.mcpToolsSetup.addMoveParticipant,
    args: addMoveParticipantArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_transport",
    description:
      "List the move's transportation (trucks, trailers, PODs, movers, storage) with type, capacity, rules, and any load zones (each with zoneId, name, capacity, preferredTags, and sortOrder). Use the returned transportId (or the name) with place_box.",
    fn: api.mcpToolsSetup.listTransport,
    args: listTransportArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "upsert_transport",
    description:
      "Add or edit TRANSPORTATION (trucks, trailers, personal vehicles, professional/military movers, PODs, storage) in one call — this is the ONLY way to create a transport that shows up in list_transport and can be assigned to boxes/items (upsert_spaces does NOT make transports). For each: pass transportId to update, transportId + archive:true to remove the whole transport, or a new type (truck|trailer|personalVehicle|professionalMovers|militaryMovers|storage|...) + name to create. Optional capacity { maxWeightLb, maxVolumeCuFt, dimensions } and rules. Optional zones: [{ name, capacity, preferredTags }] adds/edits load zones on a truck (e.g. Cab, Bed) — pass an existing zoneId to edit a specific zone, or archive: true (with zoneId or the zone's name) to remove one. To RENAME a zone you must pass its zoneId plus the new name; passing only a name (no zoneId) matches an existing zone by that exact name or creates a new one. The result returns each zone's zoneId (no need to re-list); list_transport shows full zone details. (Stdio/HTTP server equivalent: create_transport_resource / update_transport_resource.)",
    fn: api.mcpToolsSetup.upsertTransport,
    args: upsertTransportArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "place_box",
    description:
      "Set where a box is and where it's going. Identify it by boxId or code (e.g. B-001). Present location is a ROOM (presentRoom/presentRoomId) OR a TRANSPORT (transport/transportId) — rooms/transport may be given by name or id and must already exist. Also sets destinationRoom. Use clearPresentRoom/clearTransport to remove one. For weight, dimensions, volume, the starting room, or zone assignment, use update_box.",
    fn: api.mcpToolsSetup.placeBox,
    args: placeBoxArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "update_box",
    description:
      "Edit one box / movable unit (by boxId or code). Set status (e.g. status:'archived' soft-deletes/removes the box, status:'sealed' marks it packed). Set physical attributes — estimatedWeightLb (planning estimate) and/or actualWeightLb (measured on a scale), estimatedVolumeCuFt, dimensionsIn { lengthIn, widthIn, heightIn } (estimatedVolumeCuFt is auto-computed from dimensionsIn as L×W×H/1728 when you omit it — send dimensions alone and skip volume; pass an explicit estimatedVolumeCuFt only to override) — and/or its three locations: present room (presentRoom/presentRoomId = where the box physically is right now), starting room (startingRoom = its origin/home room, stored and read back as `room`), destination room (destinationRoom/destinationRoomId = where it should end up), plus transport (transport/transportId) and load zone (zone/zoneId) — rooms/transport/zone may be given by name or id. Use clearTransport/clearZone/clearPresentRoom/clearStartingRoom/clearDestinationRoom to unset. Assigning to a transport runs load/capacity validation and returns assignmentWarnings/assignmentHardBlocks. If the assignment trips a soft warning (e.g. heavy box / over capacity), the call fails asking for assignmentOverrideReason — pass a short reason to proceed; hard blocks always fail. Pass dryRun:true to preview without saving (a dry run never throws on warnings — it returns assignmentWarnings/assignmentHardBlocks so you can see if a reason is needed first).",
    fn: api.mcpToolsSetup.updateBox,
    args: updateBoxArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "update_item",
    description:
      "Edit one loose item / movable unit (by itemId — get it from list_items, search_inventory, or get_item). Set physical attributes — estimatedWeightLb / actualWeightLb, estimatedWeightLowLb / estimatedWeightHighLb, estimatedVolumeCuFt, dimensionsIn { lengthIn, widthIn, heightIn }, with optional weightConfidence / volumeConfidence / dimensionsConfidence (the system auto-fills derivable fields when you omit them: estimatedVolumeCuFt from dimensionsIn as L×W×H/1728, and the weight range estimatedWeightLowLb/estimatedWeightHighLb from estimatedWeightLb as 75%/135% — so you can send just dimensions and a single estimatedWeightLb, or pass explicit values to override) — and/or its three locations: present room (presentRoom/presentRoomId = where it physically is now), starting room (startingRoom = its origin/home room, stored as room), destination room (destinationRoom/destinationRoomId), plus transport (transport/transportId) and load zone (zone/zoneId) — rooms/transport/zone by name or id. presentRoom and destinationRoom must name a room/space that already exists in the move (create it with upsert_spaces first, or pass its id); only startingRoom is free text. Unlike upsert_items, destinationRoom here assigns the item to an existing destination room/space (and the item's destinationRoom is set to that space's canonical name) rather than storing arbitrary destination text. Use clearTransport/clearZone/clearPresentRoom/clearStartingRoom/clearDestinationRoom to unset. Assigning to a transport runs load/capacity validation and returns assignmentWarnings/assignmentHardBlocks; a soft warning (e.g. over capacity) fails the call asking for assignmentOverrideReason — pass a short reason to proceed; hard blocks always fail. dryRun:true previews without saving and never throws on warnings.",
    fn: api.mcpToolsSetup.updateItem,
    args: updateItemArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "convert_item_to_box",
    description:
      "Convert a misclassified loose item (a tote/box that was captured as an item) into a numbered box/tote (B-### / T-### in the shared pool). Carries over its name, description, photos, dimensions, weight, origin/destination rooms, and any transport assignment, and REMOVES the source item (no duplicate). Optionally pass containerType (carton|plasticTote|bin|wardrobe|dishPack|crate|other). Returns the new boxId + code. Use this instead of leaving a tote as a loose item or creating a separate box and orphaning the item.",
    fn: api.mcpToolsSetup.convertItemToBox,
    args: convertItemToBoxArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "archive_item",
    description:
      "Soft-delete (archive) a loose item by itemId — use it to clean up duplicates or mistakes. The item leaves the inventory lists (sets status=archived + deletedAt), reversibly. This is the item counterpart to update_box status:'archived'. NOTE: update_item with status:'archived' only changes the status label and does NOT remove the item from lists — use archive_item to actually remove it.",
    fn: api.mcpToolsSetup.archiveItem,
    args: archiveItemArgs,
    identityArg: "caller",
  }),
  defineMcpAction({
    name: "get_images",
    description:
      "VIEW photos as inline images you can actually see (read labels, model/serial numbers, condition) — the server fetches them for you, so you never need to fetch a URL yourself. filter is one of { photoIds: [...] } (e.g. a queue capture's photo ids) | { itemId } | { boxId } | { spaceId } (room) | { transportId } | { transportZoneId } | { room } | { all: true }, plus optional limit (default 6, max 8 — image payloads are large, so narrow the filter for specific photos) and variant (thumb|card|detail|full, default card — use detail/full to read fine print). Returns a short text summary (photoId, caption, attachedTo per photo) followed by the photos themselves as inline image blocks.",
    fn: api.mcpToolsImages.getImages,
    args: getImagesArgs,
    identityArg: "caller",
  }),
  defineMcpAction({
    name: "add_images",
    description:
      "Upload MANY photos at once from base64 image data and attach each via attachTo to an item (itemId), box (boxId), room (spaceId), transport (transportResourceId or transportZoneId), or room name. Remote URL ingestion is refused at this OAuth gateway because it cannot safely verify DNS and redirect targets; fetch user-approved media in the client and pass base64. Returns results: [{ photoId, ok, error? }].",
    fn: api.mcpToolsImages.addImages,
    args: addImagesArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "attach_photos",
    description:
      "Attach EXISTING photos (by photoId) to an item (itemId — the usual case, e.g. filing a queue capture's photos onto the inventory you created from it), box (boxId), room (spaceId), transport (transportResourceId/transportZoneId), or room name — via attachTo. Pass photoIds + attachTo (the photoIds are a queue entry's mediaPhotoIds, or ids from get_images). Note: submit_queue_result already auto-attaches a processed entry's photos to a single created item — reach for this tool for captures that became multiple items, or photos uploaded outside the queue.",
    fn: api.mcpToolsImages.attachPhotos,
    args: attachPhotosArgs,
    identityArg: "caller",
  }),
];
