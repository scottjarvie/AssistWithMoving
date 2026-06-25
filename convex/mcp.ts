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

import { api } from "./_generated/api";
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
  listTransportArgs,
  placeBoxArgs,
  updateBoxArgs,
  updateItemArgs,
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
      "Add OR update many inventory items in one call (pass itemId to update, omit to create). Supports dryRun to preview. The workhorse for capturing inventory. For an item's weight, dimensions, volume, present location, or transport/zone assignment, use update_item.",
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
      "Drop many capture notes (and references to already-uploaded photo ids) into the move's queue for later processing. Optionally aim a capture at a room (targetSpaceId) or a transport (targetTransportId) so the agent knows where it belongs.",
    fn: api.mcpToolsWrite.captureToQueue,
    args: captureToQueueArgs,
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_queue",
    description:
      "List capture-queue entries for a move — the work waiting to become inventory. Each entry has instructions, room/disposition hints, attached photo ids, status, and any agent question/summary/result items. Pass status to filter (queued|claimed|processed|needsInput|resolved|discarded); omit it for the newest entries.",
    fn: api.mcpToolsQueue.listQueue,
    args: listQueueArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "claim_queue",
    description:
      "Claim the oldest queued capture entries so two agent runs never process the same one. Returns the claimed entries; a claim expires after 15 minutes. Use batchSize (default 1, max 10) and an agentLabel to mark your run. Work each entry, then call submit_queue_result.",
    fn: api.mcpToolsQueue.claimQueue,
    args: claimQueueArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "submit_queue_result",
    description:
      "Report what a claimed entry produced: link the inventory items you created (resultItemIds) to mark it processed, OR ask the user a question (needsInputQuestion → sets it to needs-input). Add a short agentSummary. Pair this with upsert_items, which creates the items.",
    fn: api.mcpToolsQueue.submitQueueResult,
    args: submitQueueResultArgs,
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
      "Edit one box / movable unit (by boxId or code). Set status (e.g. status:'archived' soft-deletes/removes the box, status:'sealed' marks it packed). Set physical attributes — estimatedWeightLb (planning estimate) and/or actualWeightLb (measured on a scale), estimatedVolumeCuFt, dimensionsIn { lengthIn, widthIn, heightIn } — and/or its three locations: present room (presentRoom/presentRoomId = where the box physically is right now), starting room (startingRoom = its origin/home room, stored and read back as `room`), destination room (destinationRoom/destinationRoomId = where it should end up), plus transport (transport/transportId) and load zone (zone/zoneId) — rooms/transport/zone may be given by name or id. Use clearTransport/clearZone/clearPresentRoom/clearStartingRoom/clearDestinationRoom to unset. Assigning to a transport runs load/capacity validation and returns assignmentWarnings/assignmentHardBlocks. If the assignment trips a soft warning (e.g. heavy box / over capacity), the call fails asking for assignmentOverrideReason — pass a short reason to proceed; hard blocks always fail. Pass dryRun:true to preview without saving (a dry run never throws on warnings — it returns assignmentWarnings/assignmentHardBlocks so you can see if a reason is needed first).",
    fn: api.mcpToolsSetup.updateBox,
    args: updateBoxArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "update_item",
    description:
      "Edit one loose item / movable unit (by itemId — get it from list_items, search_inventory, or get_item). Set physical attributes — estimatedWeightLb / actualWeightLb, estimatedWeightLowLb / estimatedWeightHighLb, estimatedVolumeCuFt, dimensionsIn { lengthIn, widthIn, heightIn }, with optional weightConfidence / volumeConfidence / dimensionsConfidence — and/or its three locations: present room (presentRoom/presentRoomId = where it physically is now), starting room (startingRoom = its origin/home room, stored as room), destination room (destinationRoom/destinationRoomId), plus transport (transport/transportId) and load zone (zone/zoneId) — rooms/transport/zone by name or id. presentRoom and destinationRoom must name a room/space that already exists in the move (create it with upsert_spaces first, or pass its id); only startingRoom is free text. Unlike upsert_items, destinationRoom here assigns the item to an existing destination room/space (and the item's destinationRoom is set to that space's canonical name) rather than storing arbitrary destination text. Use clearTransport/clearZone/clearPresentRoom/clearStartingRoom/clearDestinationRoom to unset. Assigning to a transport runs load/capacity validation and returns assignmentWarnings/assignmentHardBlocks; a soft warning (e.g. over capacity) fails the call asking for assignmentOverrideReason — pass a short reason to proceed; hard blocks always fail. dryRun:true previews without saving and never throws on warnings.",
    fn: api.mcpToolsSetup.updateItem,
    args: updateItemArgs,
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
      "Upload MANY photos at once, each from a url OR base64, and attach each via attachTo to an item (itemId), box (boxId), room (spaceId), transport (transportResourceId or transportZoneId), or room name. Returns results: [{ photoId, ok, error? }].",
    fn: api.mcpToolsImages.addImages,
    args: addImagesArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "attach_photos",
    description:
      "Attach EXISTING photos (by photoId) to an item (itemId), box (boxId), room (spaceId), transport (transportResourceId/transportZoneId), or room name — via attachTo. Use this to file a queued capture's already-uploaded photos onto the room or transport its entry targets. Pass photoIds + attachTo.",
    fn: api.mcpToolsImages.attachPhotos,
    args: attachPhotosArgs,
    identityArg: "caller",
  }),
];
