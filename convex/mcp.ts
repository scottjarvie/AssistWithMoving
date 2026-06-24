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
import { addImagesArgs, getImagesArgs } from "./mcpToolsImages";
import {
  claimQueueArgs,
  listQueueArgs,
  submitQueueResultArgs,
} from "./mcpToolsQueue";
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
    description: "List the rooms / spaces in a move.",
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
      "List inventory items in a move (name, room, category, quantity, disposition). Sensitive fields are omitted.",
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
    description: "List boxes / containers in a move (code, label, room, status).",
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
      "Add OR update many inventory items in one call (pass itemId to update, omit to create). Supports dryRun to preview. The workhorse for capturing inventory.",
    fn: api.mcpToolsWrite.upsertItems,
    args: upsertItemsArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "upsert_spaces",
    description:
      "Define or update many rooms/spaces in one call (pass spaceId to update, omit to create).",
    fn: api.mcpToolsWrite.upsertSpaces,
    args: upsertSpacesArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "capture_to_queue",
    description:
      "Drop many capture notes (and references to already-uploaded photo ids) into the move's queue for later processing.",
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
  defineMcpAction({
    name: "get_images",
    description:
      "Pull MANY photos at once with short-lived display URLs. filter is one of { itemId } | { boxId } | { spaceId } | { room } | { all: true }, plus optional limit (default 50). Returns images: [{ photoId, displayUrl, caption, attachedTo }].",
    fn: api.mcpToolsImages.getImages,
    args: getImagesArgs,
    identityArg: "caller",
  }),
  defineMcpAction({
    name: "add_images",
    description:
      "Upload MANY photos at once, each from a url OR base64, and attach it to an item/box/space/room via attachTo. Returns results: [{ photoId, ok, error? }].",
    fn: api.mcpToolsImages.addImages,
    args: addImagesArgs,
    identityArg: "caller",
  }),
];
