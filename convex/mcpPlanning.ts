import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { generateItemCode } from "./items";
import { recordAuditEvent } from "./lib/audit";
import { activeGrantsForUser } from "./aiGrants";
import { grantError } from "./lib/aiGrants";
import {
  hasQueueWorkGrant,
  mcpError,
  mcpPrincipalValidator,
  requireMcpMove,
  requireMcpUser,
  type McpPrincipal,
} from "./lib/mcpGrantAccess";
import { normalizedSearchName } from "./lib/moveFields";
import { canViewPhotoAssets } from "./lib/photoVisibility";
import { requireMovePermission } from "./lib/permissions";
import { linkQueueResultWithoutTransition } from "./lib/queueService";
import { completeQueueForResult } from "./mcpQueueWork";
import {
  estimateConfidence,
  itemCondition,
  itemDisposition,
  itemFragility,
  itemResearchSource,
  itemStatus,
  movePlanningRecordKind,
  movePlanningRecordStatus,
  moveSourceCheckStatus,
  moveSpaceKind,
  moveStatus,
} from "./schema";

const OPERATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ACCESSIBLE_MOVES = 50;
const MAX_BRIEF_ROWS = 200;
const MAX_SEARCH_CANDIDATES_PER_KIND = 120;
const MAX_RECORD_BATCH = 25;
const MAX_WRITE_ROWS = 100;

export { mcpPrincipalValidator } from "./lib/mcpGrantAccess";

const optionalNullableString = v.optional(v.union(v.string(), v.null()));
const optionalNullableNumber = v.optional(v.union(v.number(), v.null()));

const sourceCheckInput = v.object({
  stableKey: v.string(),
  title: v.string(),
  summary: v.string(),
  details: v.optional(v.string()),
  status: moveSourceCheckStatus,
  url: v.optional(v.string()),
  publisher: v.optional(v.string()),
  checkedAt: v.optional(v.number()),
  relatedItemIds: v.optional(v.array(v.id("items"))),
  relatedBoxIds: v.optional(v.array(v.id("boxes"))),
  relatedSpaceIds: v.optional(v.array(v.id("moveSpaces"))),
});

const planningRecordInput = v.object({
  planningRecordId: v.optional(v.id("movePlanningRecords")),
  expectedVersion: v.optional(v.number()),
  stableKey: v.string(),
  kind: movePlanningRecordKind,
  title: v.string(),
  summary: v.string(),
  details: v.optional(v.string()),
  status: v.optional(movePlanningRecordStatus),
  confidence: v.optional(estimateConfidence),
  decision: v.optional(v.string()),
  alternatives: v.optional(v.array(v.string())),
  rationale: v.optional(v.string()),
  estimateMetric: v.optional(v.string()),
  estimateLow: v.optional(v.number()),
  estimateValue: v.optional(v.number()),
  estimateHigh: v.optional(v.number()),
  estimateUnit: v.optional(v.string()),
  estimateCurrency: v.optional(v.string()),
  assumptions: v.optional(v.array(v.string())),
  sectionKey: v.optional(v.string()),
  body: v.optional(v.string()),
  sourceTitle: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourcePublisher: v.optional(v.string()),
  sourceStatus: v.optional(moveSourceCheckStatus),
  checkedAt: v.optional(v.number()),
  relatedItemIds: v.optional(v.array(v.id("items"))),
  relatedBoxIds: v.optional(v.array(v.id("boxes"))),
  relatedSpaceIds: v.optional(v.array(v.id("moveSpaces"))),
  relatedQueueItemId: v.optional(v.id("queueItems")),
});

const spaceInput = v.object({
  spaceId: v.optional(v.id("moveSpaces")),
  expectedUpdatedAt: v.optional(v.number()),
  name: v.string(),
  kind: v.optional(moveSpaceKind),
  floorLevel: optionalNullableString,
  notes: optionalNullableString,
});

const itemInput = v.object({
  itemId: v.optional(v.id("items")),
  createKey: v.optional(v.string()),
  expectedUpdatedAt: v.optional(v.number()),
  name: v.optional(v.string()),
  room: optionalNullableString,
  destinationRoom: optionalNullableString,
  category: optionalNullableString,
  subcategory: optionalNullableString,
  description: optionalNullableString,
  quantity: v.optional(v.number()),
  condition: v.optional(itemCondition),
  disposition: v.optional(itemDisposition),
  status: v.optional(itemStatus),
  fragility: v.optional(itemFragility),
  highValue: v.optional(v.boolean()),
  needsReview: v.optional(v.boolean()),
  reviewFlags: v.optional(v.array(v.string())),
  estimatedWeightLb: optionalNullableNumber,
  estimatedWeightLowLb: optionalNullableNumber,
  estimatedWeightHighLb: optionalNullableNumber,
  actualWeightLb: optionalNullableNumber,
  estimatedVolumeCuFt: optionalNullableNumber,
  estimatedPackedVolumeCuFt: optionalNullableNumber,
  weightConfidence: v.optional(estimateConfidence),
  volumeConfidence: v.optional(estimateConfidence),
  valueCents: optionalNullableNumber,
  replacementValueCents: optionalNullableNumber,
  researchSummary: optionalNullableString,
  researchNotes: optionalNullableString,
  researchConfidence: v.optional(estimateConfidence),
  researchSources: v.optional(v.array(itemResearchSource)),
});

const recordReferenceKind = v.union(
  v.literal("item"),
  v.literal("box"),
  v.literal("space"),
  v.literal("decision"),
  v.literal("estimate"),
  v.literal("planResult"),
  v.literal("sourceCheck"),
  v.literal("queue"),
  v.literal("photo"),
);

const recordReference = v.object({
  kind: recordReferenceKind,
  id: v.string(),
});

function boundedCount(rows: unknown[]) {
  return {
    value: Math.min(rows.length, MAX_BRIEF_ROWS),
    atLeast: rows.length > MAX_BRIEF_ROWS,
  };
}

function cleanText(value: string, label: string, max: number) {
  const cleaned = value.trim();
  if (!cleaned) {
    mcpError("VALIDATION_ERROR", `${label} cannot be blank.`, `Provide ${label}.`);
  }
  if (cleaned.length > max) {
    mcpError(
      "VALIDATION_ERROR",
      `${label} is longer than ${max} characters.`,
      `Shorten ${label} and retry with the same operation intent.`,
    );
  }
  return cleaned;
}

function optionalText(value: string | null | undefined, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.trim();
  if (cleaned.length > max) {
    mcpError(
      "VALIDATION_ERROR",
      `Text is longer than ${max} characters.`,
      "Shorten the named field and retry.",
    );
  }
  return cleaned || null;
}

function finiteNumber(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return value;
  if (!Number.isFinite(value)) {
    mcpError("VALIDATION_ERROR", `${label} must be finite.`, `Correct ${label}.`);
  }
  return value;
}

function safeUrl(value: string | undefined) {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    mcpError("VALIDATION_ERROR", "Source URL is invalid.", "Use an absolute HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    mcpError(
      "VALIDATION_ERROR",
      "Source URL must be public HTTP(S) without embedded credentials.",
      "Remove credentials or use a safe source URL.",
    );
  }
  return url.toString();
}

function logicalStableKey(row: Doc<"movePlanningRecords">) {
  const marker = "::";
  const index = row.stableKey.indexOf(marker);
  return index >= 0 ? row.stableKey.slice(index + marker.length) : row.stableKey;
}

function namespacedStableKey(principal: McpPrincipal, stableKey: string) {
  return `${cleanText(principal.clientId, "clientId", 160)}::${cleanText(stableKey, "stableKey", 160)}`;
}

function shapePlanningRecord(row: Doc<"movePlanningRecords">) {
  return {
    planningRecordId: row._id,
    kind: row.kind,
    stableKey: logicalStableKey(row),
    title: row.title,
    summary: row.summary,
    details: row.details ?? null,
    status: row.status,
    confidence: row.confidence ?? null,
    decision: row.decision ?? null,
    alternatives: row.alternatives ?? [],
    rationale: row.rationale ?? null,
    estimate:
      row.kind === "estimate"
        ? {
            metric: row.estimateMetric ?? null,
            low: row.estimateLow ?? null,
            value: row.estimateValue ?? null,
            high: row.estimateHigh ?? null,
            unit: row.estimateUnit ?? null,
            currency: row.estimateCurrency ?? null,
            assumptions: row.assumptions ?? [],
          }
        : null,
    sectionKey: row.sectionKey ?? null,
    body: row.body ?? null,
    source:
      row.kind === "sourceCheck"
        ? {
            title: row.sourceTitle ?? null,
            url: row.sourceUrl ?? null,
            publisher: row.sourcePublisher ?? null,
            status: row.sourceStatus ?? null,
            checkedAt: row.checkedAt ?? null,
          }
        : null,
    related: {
      itemIds: row.relatedItemIds,
      boxIds: row.relatedBoxIds,
      spaceIds: row.relatedSpaceIds,
      queueItemId: row.relatedQueueItemId ?? null,
    },
    provenance: {
      actor: "Your AI via MCP",
      clientId: row.updatedByMcpClientId,
      operationId: row.operationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    version: row.version,
  };
}

async function listAccessibleMoves(ctx: QueryCtx, principal: McpPrincipal) {
  const user = await requireMcpUser(ctx, principal);
  // The move list is the first call a connected AI makes, so it must already
  // obey the grant: an AI approved for two moves should not learn that a third
  // exists. Any context-read grant opens the list; the grants themselves then
  // decide which rows survive.
  const now = Date.now();
  const grants = (
    await activeGrantsForUser(ctx, user._id, principal.clientId, now)
  ).filter((grant) => grant.scopes.includes("moving.context.read"));
  if (grants.length === 0) {
    grantError(
      (await activeGrantsForUser(ctx, user._id, principal.clientId, now)).length
        ? "outOfScope"
        : "noGrant",
    );
  }
  const grantsAllMoves = grants.some((grant) => grant.moveScope === "allMoves");
  const grantedMoveIds = new Set(
    grants.flatMap((grant) => (grant.moveIds ?? []).map(String)),
  );
  const memberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", user._id).eq("status", "active"),
    )
    .take(20);
  const moveMap = new Map<string, Doc<"moves">>();
  for (const membership of memberships) {
    for (const status of ["planning", "active", "completed"] as const) {
      const rows = await ctx.db
        .query("moves")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", membership.householdId).eq("status", status),
        )
        .take(MAX_ACCESSIBLE_MOVES + 1);
      for (const row of rows) moveMap.set(String(row._id), row);
      if (moveMap.size > MAX_ACCESSIBLE_MOVES) break;
    }
    if (moveMap.size > MAX_ACCESSIBLE_MOVES) break;
  }
  const participants = await ctx.db
    .query("moveParticipants")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", user._id).eq("status", "active"),
    )
    .take(MAX_ACCESSIBLE_MOVES + 1);
  for (const participant of participants) {
    const row = await ctx.db.get(participant.moveId);
    if (row && row.status !== "archived") moveMap.set(String(row._id), row);
  }
  const rows = [...moveMap.values()]
    .filter((row) => grantsAllMoves || grantedMoveIds.has(String(row._id)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ACCESSIBLE_MOVES);
  return {
    user,
    truncated: moveMap.size > MAX_ACCESSIBLE_MOVES || participants.length > MAX_ACCESSIBLE_MOVES,
    rows,
  };
}

export const getMoveBrief = internalQuery({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.optional(v.id("moves")),
  },
  handler: async (ctx, args) => {
    const access = await listAccessibleMoves(ctx, args.principal);
    const moves = access.rows.map((move) => ({
      moveId: move._id,
      title: move.title,
      type: move.type,
      status: move.status,
      origin: move.origin ?? null,
      destination: move.destination ?? null,
      dateStart: move.dateStart ?? null,
      dateEnd: move.dateEnd ?? null,
      updatedAt: move.updatedAt,
    }));
    if (!args.moveId) {
      return {
        product: "Assist With Moving",
        roleSplit:
          "Assist With Moving keeps the durable move record; your AI reasons and saves authorized move work.",
        moves,
        truncated: access.truncated,
        next: moves.length
          ? "Call get_move_brief again with one returned moveId, then search_move_records before creating duplicates."
          : "Open Assist With Moving and create a move before asking your AI to save move work.",
      };
    }

    const { move, policy } = await requireMcpMove(
      ctx,
      args.principal,
      args.moveId,
      "inventory:read",
      "moving.context.read",
    );
    const [items, boxes, spaces, photos, planningRecords, queueNeedsYou, queueWorking, queueWaiting] =
      await Promise.all([
        ctx.db
          .query("items")
          .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
          .order("desc")
          .take(MAX_BRIEF_ROWS + 1),
        ctx.db
          .query("boxes")
          .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
          .order("desc")
          .take(MAX_BRIEF_ROWS + 1),
        ctx.db
          .query("moveSpaces")
          .withIndex("by_move_status", (q) =>
            q.eq("moveId", move._id).eq("status", "active"),
          )
          .take(MAX_BRIEF_ROWS + 1),
        ctx.db
          .query("itemPhotos")
          .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
          .order("desc")
          .take(MAX_BRIEF_ROWS + 1),
        ctx.db
          .query("movePlanningRecords")
          .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
          .order("desc")
          .take(20),
        ctx.db
          .query("queueItems")
          .withIndex("by_move_owner_state_updated", (q) =>
            q.eq("moveId", move._id).eq("ownerUserId", policy.user._id).eq("state", "needsYou"),
          )
          .order("desc")
          .take(10),
        ctx.db
          .query("queueItems")
          .withIndex("by_move_owner_state_updated", (q) =>
            q.eq("moveId", move._id).eq("ownerUserId", policy.user._id).eq("state", "working"),
          )
          .order("desc")
          .take(10),
        ctx.db
          .query("queueItems")
          .withIndex("by_move_owner_state_updated", (q) =>
            q.eq("moveId", move._id).eq("ownerUserId", policy.user._id).eq("state", "waitingForAi"),
          )
          .order("desc")
          .take(10),
      ]);
    const liveItems = items.filter((item) => item.deletedAt === undefined);
    const liveBoxes = boxes.filter((box) => box.archivedAt === undefined);
    const livePhotos = photos.filter((photo) => photo.archivedAt === undefined);
    return {
      product: "Assist With Moving",
      move: {
        moveId: move._id,
        title: move.title,
        type: move.type,
        status: move.status,
        origin: move.origin ?? null,
        destination: move.destination ?? null,
        dateStart: move.dateStart ?? null,
        dateEnd: move.dateEnd ?? null,
        notes: move.notes ?? null,
        updatedAt: move.updatedAt,
      },
      permissions: {
        canRead: true,
        canEditInventory: ["owner", "admin", "editor"].includes(policy.role),
        canEditPlans: ["owner", "admin", "editor"].includes(policy.role),
      },
      counts: {
        items: boundedCount(liveItems),
        boxes: boundedCount(liveBoxes),
        spaces: boundedCount(spaces),
        evidence: boundedCount(livePhotos),
        planningRecords: boundedCount(planningRecords),
      },
      spaces: spaces.slice(0, 50).map((space) => ({
        spaceId: space._id,
        name: space.name,
        kind: space.kind,
        floorLevel: space.floorLevel ?? null,
        updatedAt: space.updatedAt,
      })),
      attention: liveItems
        .filter((item) => item.needsReview)
        .slice(0, 20)
        .map((item) => ({
          kind: "item" as const,
          itemId: item._id,
          name: item.name,
          room: item.room ?? null,
          reviewFlags: item.reviewFlags,
          updatedAt: item.updatedAt,
        })),
      planning: planningRecords
        .filter((record) => record.archivedAt === undefined)
        .map(shapePlanningRecord),
      queue: {
        note:
          "These are person-facing Queue summaries only. This stateless OAuth surface does not claim or complete canonical Queue work until Moving has a distinct chosen-AI grant.",
        needsYou: queueNeedsYou.map(shapeQueueSummary),
        working: queueWorking.map(shapeQueueSummary),
        waitingForAi: queueWaiting.map(shapeQueueSummary),
      },
      next:
        "Use search_move_records to avoid duplicates, get_move_records for full context, get_evidence_media for private photos, save_complete_result for normal finished work, and granular save tools for corrections.",
    };
  },
});

export const resolveMoveScope = internalQuery({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const { move } = await requireMcpMove(
      ctx,
      args.principal,
      args.moveId,
      "inventory:read",
      // resolveMoveScope only backs get_evidence_media, so it must prove the
      // evidence scope rather than the ordinary context scope.
      "moving.evidence.read",
    );
    return { householdId: move.householdId, moveId: move._id };
  },
});

function shapeQueueSummary(row: Doc<"queueItems">) {
  return {
    queueItemId: row._id,
    state: row.state,
    directive: row.directive,
    summary: row.summary ?? null,
    requiredAction: row.requiredAction ?? null,
    nextStep: row.nextStep ?? null,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function parseOffset(cursor: string | undefined) {
  if (!cursor) return 0;
  const match = cursor.match(/^offset:(\d+)$/);
  if (!match) {
    mcpError(
      "VALIDATION_ERROR",
      "Search cursor is invalid.",
      "Restart search_move_records without a cursor.",
    );
  }
  return Number(match[1]);
}

export const searchMoveRecords = internalQuery({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    query: v.optional(v.string()),
    kinds: v.optional(v.array(recordReferenceKind)),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { policy } = await requireMcpMove(
      ctx,
      args.principal,
      args.moveId,
      "inventory:read",
      "moving.context.read",
    );
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 25), 1), 50);
    const offset = parseOffset(args.cursor);
    const needle = args.query?.trim().toLowerCase() ?? "";
    const requested = new Set(
      args.kinds ?? [
        "item",
        "box",
        "space",
        "decision",
        "estimate",
        "planResult",
        "sourceCheck",
        "queue",
      ],
    );
    const candidates: Array<Record<string, unknown> & { updatedAt: number }> = [];

    if (requested.has("item")) {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .take(MAX_SEARCH_CANDIDATES_PER_KIND);
      for (const item of rows) {
        if (item.deletedAt !== undefined) continue;
        const haystack = [item.name, item.room, item.category, item.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (needle && !haystack.includes(needle)) continue;
        candidates.push({
          kind: "item",
          id: item._id,
          title: item.name,
          summary: [item.room, item.category, item.disposition].filter(Boolean).join(" · "),
          status: item.status,
          needsReview: item.needsReview,
          updatedAt: item.updatedAt,
        });
      }
    }
    if (requested.has("box")) {
      const rows = await ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .take(MAX_SEARCH_CANDIDATES_PER_KIND);
      for (const box of rows) {
        if (box.archivedAt !== undefined) continue;
        const haystack = [box.code, box.label, box.nickname, box.room, box.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (needle && !haystack.includes(needle)) continue;
        candidates.push({
          kind: "box",
          id: box._id,
          title: box.label ?? box.nickname ?? box.code,
          summary: [box.code, box.room, box.status].filter(Boolean).join(" · "),
          status: box.status,
          updatedAt: box.updatedAt,
        });
      }
    }
    if (requested.has("space")) {
      const rows = await ctx.db
        .query("moveSpaces")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "active"),
        )
        .take(MAX_SEARCH_CANDIDATES_PER_KIND);
      for (const space of rows) {
        const haystack = [space.name, ...space.aliases, space.kind, space.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (needle && !haystack.includes(needle)) continue;
        candidates.push({
          kind: "space",
          id: space._id,
          title: space.name,
          summary: [space.kind, space.floorLevel].filter(Boolean).join(" · "),
          status: space.status,
          updatedAt: space.updatedAt,
        });
      }
    }
    const planningKinds = ["decision", "estimate", "planResult", "sourceCheck"] as const;
    for (const kind of planningKinds) {
      if (!requested.has(kind)) continue;
      const rows = needle
        ? await ctx.db
            .query("movePlanningRecords")
            .withSearchIndex("search_move_records", (q) =>
              q.search("searchText", needle).eq("moveId", args.moveId).eq("kind", kind),
            )
            .take(MAX_SEARCH_CANDIDATES_PER_KIND)
        : await ctx.db
            .query("movePlanningRecords")
            .withIndex("by_move_kind_updated", (q) =>
              q.eq("moveId", args.moveId).eq("kind", kind),
            )
            .order("desc")
            .take(MAX_SEARCH_CANDIDATES_PER_KIND);
      for (const row of rows) {
        if (row.archivedAt !== undefined) continue;
        candidates.push({
          kind,
          id: row._id,
          title: row.title,
          summary: row.summary,
          status: row.status,
          confidence: row.confidence ?? null,
          sourceStatus: row.sourceStatus ?? null,
          updatedAt: row.updatedAt,
          version: row.version,
        });
      }
    }
    if (requested.has("queue")) {
      const rows = await ctx.db
        .query("queueItems")
        .withIndex("by_move_owner_updated", (q) =>
          q.eq("moveId", args.moveId).eq("ownerUserId", policy.user._id),
        )
        .order("desc")
        .take(MAX_SEARCH_CANDIDATES_PER_KIND);
      for (const row of rows) {
        const haystack = [row.directive, row.summary, row.resultSummary, row.requiredAction]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (needle && !haystack.includes(needle)) continue;
        candidates.push({
          kind: "queue",
          id: row._id,
          title: row.directive,
          summary: row.resultSummary ?? row.summary ?? "",
          status: row.state,
          updatedAt: row.updatedAt,
          version: row.version,
        });
      }
    }
    candidates.sort((a, b) => b.updatedAt - a.updatedAt || String(a.id).localeCompare(String(b.id)));
    const page = candidates.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      records: page,
      nextCursor: nextOffset < candidates.length ? `offset:${nextOffset}` : null,
      boundedCandidateCount: candidates.length,
      candidateLimitPerKind: MAX_SEARCH_CANDIDATES_PER_KIND,
      truncatedBeforeFilter:
        candidates.length >= requested.size * MAX_SEARCH_CANDIDATES_PER_KIND,
      next:
        nextOffset < candidates.length
          ? "Continue with nextCursor, or narrow query/kinds for a smaller result."
          : "Call get_move_records with the IDs that need full context.",
    };
  },
});

export const getMoveRecords = internalQuery({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    records: v.array(recordReference),
  },
  handler: async (ctx, args) => {
    const { policy } = await requireMcpMove(
      ctx,
      args.principal,
      args.moveId,
      "inventory:read",
      "moving.context.read",
    );
    if (args.records.length < 1 || args.records.length > MAX_RECORD_BATCH) {
      mcpError(
        "VALIDATION_ERROR",
        `get_move_records accepts 1 to ${MAX_RECORD_BATCH} references.`,
        "Split the request into bounded batches.",
      );
    }
    const results = [];
    for (const reference of args.records) {
      const table = planningKindsSet.has(reference.kind)
        ? "movePlanningRecords"
        : tableForReference(reference.kind);
      const normalized = ctx.db.normalizeId(table as never, reference.id);
      const row = normalized ? await ctx.db.get(normalized as never) : null;
      if (!row || !("moveId" in row) || row.moveId !== args.moveId) {
        results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
        continue;
      }
      if (table === "movePlanningRecords") {
        const planning = row as Doc<"movePlanningRecords">;
        if (planning.archivedAt !== undefined || planning.kind !== reference.kind) {
          results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
        } else {
          results.push(shapePlanningRecord(planning));
        }
      } else if (table === "items") {
        const item = row as Doc<"items">;
        if (item.deletedAt !== undefined) {
          results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
          continue;
        }
        results.push({
          kind: "item",
          itemId: item._id,
          name: item.name,
          code: item.code ?? null,
          description: item.description ?? null,
          room: item.room ?? null,
          destinationRoom: item.destinationRoom ?? null,
          category: item.category ?? null,
          quantity: item.quantity,
          condition: item.condition,
          disposition: item.disposition,
          status: item.status,
          estimates: {
            weightLb: item.estimatedWeightLb ?? null,
            weightLowLb: item.estimatedWeightLowLb ?? null,
            weightHighLb: item.estimatedWeightHighLb ?? null,
            volumeCuFt: item.estimatedVolumeCuFt ?? null,
            confidence: item.weightConfidence,
            valueCents: policy.visibility.estimatedValue ? item.valueCents ?? null : null,
            replacementValueCents: policy.visibility.estimatedValue
              ? item.replacementValueCents ?? null
              : null,
          },
          research: policy.visibility.research
            ? {
                summary: item.researchSummary ?? null,
                sources: item.researchSources ?? [],
                confidence: item.researchConfidence ?? null,
                researchedAt: item.researchedAt ?? null,
              }
            : null,
          review: { needsReview: item.needsReview, flags: item.reviewFlags },
          updatedAt: item.updatedAt,
        });
      } else if (table === "boxes") {
        const box = row as Doc<"boxes">;
        if (box.archivedAt !== undefined) {
          results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
          continue;
        }
        results.push({
          kind: "box",
          boxId: box._id,
          code: box.code,
          label: box.label ?? null,
          description: box.description ?? null,
          room: box.room ?? null,
          destinationRoom: box.destinationRoom ?? null,
          status: box.status,
          estimatedWeightLb: box.estimatedWeightLb ?? null,
          actualWeightLb: box.actualWeightLb ?? null,
          estimatedVolumeCuFt: box.estimatedVolumeCuFt ?? null,
          updatedAt: box.updatedAt,
        });
      } else if (table === "moveSpaces") {
        const space = row as Doc<"moveSpaces">;
        if (space.archivedAt !== undefined || space.status !== "active") {
          results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
          continue;
        }
        results.push({
          kind: "space",
          spaceId: space._id,
          name: space.name,
          aliases: space.aliases,
          spaceKind: space.kind,
          notes: space.notes ?? null,
          floorLevel: space.floorLevel ?? null,
          updatedAt: space.updatedAt,
        });
      } else if (table === "queueItems") {
        const queue = row as Doc<"queueItems">;
        if (queue.ownerUserId !== policy.user._id) {
          results.push({ ...reference, error: { code: "FORBIDDEN", message: "Queue item is not in this person's Queue." } });
        } else {
          results.push({ kind: "queue", ...shapeQueueSummary(queue), resultSummary: queue.resultSummary ?? null, resultRefs: queue.resultRefs ?? [] });
        }
      } else if (table === "itemPhotos") {
        const photo = row as Doc<"itemPhotos">;
        if (
          photo.archivedAt !== undefined ||
          !canViewPhotoAssets(photo, policy.visibility)
        ) {
          results.push({ ...reference, error: { code: "NOT_FOUND", message: "Record not found in this move." } });
          continue;
        }
        results.push({
          kind: "photo",
          photoId: photo._id,
          caption: photo.caption ?? null,
          photoType: photo.photoType,
          privacyLevel: photo.privacyLevel,
          verificationStatus: photo.verificationStatus,
          attachedTo: {
            itemId: photo.itemId ?? null,
            boxId: photo.boxId ?? null,
            spaceId: photo.spaceId ?? null,
            room: photo.room ?? null,
          },
          createdAt: photo.createdAt,
          updatedAt: photo.updatedAt,
        });
      }
    }
    return { records: results };
  },
});

const planningKindsSet = new Set(["decision", "estimate", "planResult", "sourceCheck"]);

function tableForReference(kind: string) {
  const table = {
    item: "items",
    box: "boxes",
    space: "moveSpaces",
    queue: "queueItems",
    photo: "itemPhotos",
  }[kind];
  if (!table) {
    mcpError("VALIDATION_ERROR", `Unsupported record kind ${kind}.`, "Use a kind from search_move_records.");
  }
  return table;
}

async function replayResult(
  ctx: MutationCtx,
  userId: Id<"users">,
  principal: McpPrincipal,
  tool: string,
  operationId: string,
  requestHash: string,
) {
  const existing = await ctx.db
    .query("mcpOperations")
    .withIndex("by_actor_client_tool_operation", (q) =>
      q
        .eq("actorUserId", userId)
        .eq("clientId", principal.clientId)
        .eq("tool", tool)
        .eq("operationId", operationId),
    )
    .unique();
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    mcpError(
      "IDEMPOTENCY_CONFLICT",
      "This operationId was already used for different move content.",
      "Reuse the original intent or create a new operationId for the changed intent.",
    );
  }
  return existing.result && typeof existing.result === "object"
    ? { ...(existing.result as Record<string, unknown>), replay: true }
    : { result: existing.result, replay: true };
}

async function saveReplayResult(
  ctx: MutationCtx,
  userId: Id<"users">,
  moveId: Id<"moves">,
  principal: McpPrincipal,
  tool: string,
  operationId: string,
  requestHash: string,
  result: unknown,
) {
  const now = Date.now();
  await ctx.db.insert("mcpOperations", {
    actorUserId: userId,
    moveId,
    clientId: principal.clientId,
    tool,
    operationId,
    requestHash,
    result,
    createdAt: now,
    expiresAt: now + OPERATION_TTL_MS,
  });
}

async function validateRelatedIds(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  userId: Id<"users">,
  input: {
    relatedItemIds?: Id<"items">[];
    relatedBoxIds?: Id<"boxes">[];
    relatedSpaceIds?: Id<"moveSpaces">[];
    relatedQueueItemId?: Id<"queueItems">;
  },
) {
  for (const [table, ids] of [
    ["items", input.relatedItemIds ?? []],
    ["boxes", input.relatedBoxIds ?? []],
    ["moveSpaces", input.relatedSpaceIds ?? []],
  ] as const) {
    if (ids.length > 50) {
      mcpError("VALIDATION_ERROR", "A planning record may link at most 50 records of one kind.", "Split or narrow the result.");
    }
    for (const id of ids) {
      const row = await ctx.db.get(id as never);
      if (!row || !("moveId" in row) || row.moveId !== moveId) {
        mcpError("NOT_FOUND", `A related ${table} record is unavailable in this move.`, "Refresh move context and use returned IDs.");
      }
    }
  }
  if (input.relatedQueueItemId) {
    const row = await ctx.db.get(input.relatedQueueItemId);
    if (!row || row.moveId !== moveId || row.ownerUserId !== userId) {
      mcpError("NOT_FOUND", "Related Queue item is unavailable in this move.", "Refresh move context and use a returned Queue ID.");
    }
  }
}

function planningStatusFor(input: {
  kind: "decision" | "estimate" | "planResult" | "sourceCheck";
  status?: Doc<"movePlanningRecords">["status"];
  sourceStatus?: Doc<"movePlanningRecords">["sourceStatus"];
}) {
  if (input.status) return input.status;
  if (input.kind !== "sourceCheck") return "current" as const;
  if (input.sourceStatus === "blocked" || input.sourceStatus === "gated") return "blocked" as const;
  if (input.sourceStatus === "failed") return "failed" as const;
  if (input.sourceStatus === "notRelevant") return "notRelevant" as const;
  return "current" as const;
}

function validatePlanningInput(input: {
  kind: "decision" | "estimate" | "planResult" | "sourceCheck";
  decision?: string;
  estimateMetric?: string;
  estimateLow?: number;
  estimateValue?: number;
  estimateHigh?: number;
  body?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceStatus?: "checked" | "blocked" | "gated" | "failed" | "notRelevant";
}) {
  if (input.kind === "decision" && !input.decision?.trim()) {
    mcpError("VALIDATION_ERROR", "A decision record needs the chosen or proposed decision.", "Provide decision.");
  }
  if (
    input.kind === "estimate" &&
    (!input.estimateMetric?.trim() ||
      [input.estimateLow, input.estimateValue, input.estimateHigh].every((value) => value === undefined))
  ) {
    mcpError("VALIDATION_ERROR", "An estimate needs a metric and at least one numeric value.", "Provide estimateMetric plus low, value, or high.");
  }
  if (input.kind === "planResult" && !input.body?.trim()) {
    mcpError("VALIDATION_ERROR", "A planning result needs readable body content.", "Provide body.");
  }
  if (
    input.kind === "sourceCheck" &&
    (!input.sourceStatus || (!input.sourceTitle?.trim() && !input.sourceUrl))
  ) {
    mcpError("VALIDATION_ERROR", "A source check needs a status and source title or URL.", "Record checked, blocked, gated, failed, or notRelevant honestly.");
  }
}

async function upsertPlanningRecord(
  ctx: MutationCtx,
  principal: McpPrincipal,
  userId: Id<"users">,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  operationId: string,
  input: Parameters<typeof validatePlanningInput>[0] & {
    planningRecordId?: Id<"movePlanningRecords">;
    expectedVersion?: number;
    stableKey: string;
    title: string;
    summary: string;
    details?: string;
    status?: Doc<"movePlanningRecords">["status"];
    confidence?: Doc<"movePlanningRecords">["confidence"];
    alternatives?: string[];
    rationale?: string;
    estimateUnit?: string;
    estimateCurrency?: string;
    assumptions?: string[];
    sectionKey?: string;
    sourcePublisher?: string;
    checkedAt?: number;
    relatedItemIds?: Id<"items">[];
    relatedBoxIds?: Id<"boxes">[];
    relatedSpaceIds?: Id<"moveSpaces">[];
    relatedQueueItemId?: Id<"queueItems">;
  },
) {
  validatePlanningInput(input);
  await validateRelatedIds(ctx, moveId, userId, input);
  const stableKey = namespacedStableKey(principal, input.stableKey);
  const existing = input.planningRecordId
    ? await ctx.db.get(input.planningRecordId)
    : await ctx.db
        .query("movePlanningRecords")
        .withIndex("by_move_stable_key", (q) =>
          q.eq("moveId", moveId).eq("stableKey", stableKey),
        )
        .unique();
  if (existing && (existing.moveId !== moveId || existing.archivedAt !== undefined)) {
    mcpError("NOT_FOUND", "Planning record is unavailable in this move.", "Refresh the record and retry.");
  }
  if (existing && existing.createdByMcpClientId !== principal.clientId) {
    mcpError(
      "FORBIDDEN",
      "This planning record belongs to a different chosen-AI connection.",
      "Create a separately keyed result or ask the person to reconcile the two records.",
    );
  }
  if (input.planningRecordId && existing && input.expectedVersion !== existing.version) {
    mcpError("STALE_VERSION", "The planning record changed after it was read.", "Read the record again and retry intentionally with its current version.");
  }
  const now = Date.now();
  const values = {
    kind: input.kind,
    stableKey,
    title: cleanText(input.title, "title", 240),
    summary: cleanText(input.summary, "summary", 2_000),
    details: input.details ? cleanText(input.details, "details", 8_000) : undefined,
    status: planningStatusFor(input),
    confidence: input.confidence,
    decision: input.decision ? cleanText(input.decision, "decision", 2_000) : undefined,
    alternatives: (input.alternatives ?? []).slice(0, 20).map((value) => cleanText(value, "alternative", 500)),
    rationale: input.rationale ? cleanText(input.rationale, "rationale", 4_000) : undefined,
    estimateMetric: input.estimateMetric ? cleanText(input.estimateMetric, "estimateMetric", 160) : undefined,
    estimateLow: finiteNumber(input.estimateLow, "estimateLow") ?? undefined,
    estimateValue: finiteNumber(input.estimateValue, "estimateValue") ?? undefined,
    estimateHigh: finiteNumber(input.estimateHigh, "estimateHigh") ?? undefined,
    estimateUnit: input.estimateUnit ? cleanText(input.estimateUnit, "estimateUnit", 80) : undefined,
    estimateCurrency: input.estimateCurrency ? cleanText(input.estimateCurrency, "estimateCurrency", 12).toUpperCase() : undefined,
    assumptions: (input.assumptions ?? []).slice(0, 30).map((value) => cleanText(value, "assumption", 500)),
    sectionKey: input.sectionKey ? cleanText(input.sectionKey, "sectionKey", 160) : undefined,
    body: input.body ? cleanText(input.body, "body", 20_000) : undefined,
    sourceTitle: input.sourceTitle ? cleanText(input.sourceTitle, "sourceTitle", 500) : undefined,
    sourceUrl: safeUrl(input.sourceUrl),
    sourcePublisher: input.sourcePublisher ? cleanText(input.sourcePublisher, "sourcePublisher", 240) : undefined,
    sourceStatus: input.sourceStatus,
    checkedAt: input.checkedAt,
    relatedItemIds: input.relatedItemIds ?? [],
    relatedBoxIds: input.relatedBoxIds ?? [],
    relatedSpaceIds: input.relatedSpaceIds ?? [],
    relatedQueueItemId: input.relatedQueueItemId,
    searchText: [input.title, input.summary, input.details, input.decision, input.estimateMetric, input.body, input.sourceTitle, input.sourcePublisher]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .slice(0, 30_000),
    updatedByUserId: userId,
    updatedByMcpClientId: principal.clientId,
    operationId,
    updatedAt: now,
  };
  let id: Id<"movePlanningRecords">;
  let action: "created" | "updated";
  if (existing) {
    await ctx.db.patch(existing._id, { ...values, version: existing.version + 1 });
    id = existing._id;
    action = "updated";
  } else {
    id = await ctx.db.insert("movePlanningRecords", {
      householdId,
      moveId,
      ...values,
      createdByUserId: userId,
      createdByMcpClientId: principal.clientId,
      version: 1,
      createdAt: now,
    });
    action = "created";
  }
  const row = await ctx.db.get(id);
  return { action, record: shapePlanningRecord(row!) };
}

async function saveSpaces(
  ctx: MutationCtx,
  principal: McpPrincipal,
  userId: Id<"users">,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  spaces: Array<{
    spaceId?: Id<"moveSpaces">;
    expectedUpdatedAt?: number;
    name: string;
    kind?: Doc<"moveSpaces">["kind"];
    floorLevel?: string | null;
    notes?: string | null;
  }>,
) {
  if (spaces.length > MAX_WRITE_ROWS) {
    mcpError("VALIDATION_ERROR", `At most ${MAX_WRITE_ROWS} spaces can be saved at once.`, "Split the result into bounded saves.");
  }
  const now = Date.now();
  const last = await ctx.db
    .query("moveSpaces")
    .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
    .order("desc")
    .first();
  let nextSort = (last?.sortOrder ?? 0) + 1;
  const results = [];
  for (const input of spaces) {
    const name = cleanText(input.name, "space name", 200);
    const existing = input.spaceId
      ? await ctx.db.get(input.spaceId)
      : await ctx.db
          .query("moveSpaces")
          .withIndex("by_move_name", (q) => q.eq("moveId", moveId).eq("name", name))
          .first();
    if (existing && (existing.moveId !== moveId || existing.archivedAt !== undefined)) {
      mcpError("NOT_FOUND", "Space is unavailable in this move.", "Refresh the Move Brief and use a returned space ID.");
    }
    if (input.spaceId && existing && input.expectedUpdatedAt !== existing.updatedAt) {
      mcpError("STALE_VERSION", `Space ${name} changed after it was read.`, "Refresh the space and retry with expectedUpdatedAt.");
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        kind: input.kind ?? existing.kind,
        floorLevel: optionalText(input.floorLevel, 120) ?? undefined,
        notes: optionalText(input.notes, 2_000) ?? undefined,
        status: "active",
        updatedByUserId: userId,
        updatedAt: now,
      });
      results.push({ spaceId: existing._id, action: "updated" as const, name, updatedAt: now });
    } else {
      const id = await ctx.db.insert("moveSpaces", {
        householdId,
        moveId,
        kind: input.kind ?? "custom",
        name,
        aliases: [],
        notes: optionalText(input.notes, 2_000) ?? undefined,
        floorLevel: optionalText(input.floorLevel, 120) ?? undefined,
        sortOrder: nextSort++,
        status: "active",
        capacity: {},
        createdByUserId: userId,
        createdByApiKeyId: undefined,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      results.push({ spaceId: id, action: "created" as const, name, updatedAt: now });
    }
  }
  return results;
}

function itemPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const field of [
    "room",
    "destinationRoom",
    "category",
    "subcategory",
    "description",
    "estimatedWeightLb",
    "estimatedWeightLowLb",
    "estimatedWeightHighLb",
    "actualWeightLb",
    "estimatedVolumeCuFt",
    "estimatedPackedVolumeCuFt",
    "valueCents",
    "replacementValueCents",
    "researchSummary",
    "researchNotes",
  ]) {
    if (field in input) patch[field] = input[field] === null ? undefined : input[field];
  }
  for (const field of [
    "quantity",
    "condition",
    "disposition",
    "status",
    "fragility",
    "highValue",
    "needsReview",
    "reviewFlags",
    "weightConfidence",
    "volumeConfidence",
    "researchConfidence",
    "researchSources",
  ]) {
    if (field in input && input[field] !== undefined) patch[field] = input[field];
  }
  return patch;
}

async function saveItems(
  ctx: MutationCtx,
  principal: McpPrincipal,
  userId: Id<"users">,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  items: Array<Record<string, unknown> & {
    itemId?: Id<"items">;
    createKey?: string;
    expectedUpdatedAt?: number;
    name?: string;
    researchSources?: Array<{ title?: string; url?: string; summary?: string; status?: "used" | "checked" | "blocked" | "gated" | "failed" | "notRelevant"; checkedAt?: number }>;
  }>,
) {
  if (items.length > MAX_WRITE_ROWS) {
    mcpError("VALIDATION_ERROR", `At most ${MAX_WRITE_ROWS} inventory rows can be saved at once.`, "Split the result into bounded saves.");
  }
  const now = Date.now();
  const results = [];
  for (const input of items) {
    if (!!input.itemId === !!input.createKey) {
      mcpError("VALIDATION_ERROR", "Each inventory row needs exactly one of itemId or createKey.", "Use itemId for a correction or a stable createKey for a new item.");
    }
    const sourcesProvided = input.researchSources !== undefined;
    const researchSources = input.researchSources?.slice(0, 30).map((source) => ({
      title: source.title ? cleanText(source.title, "source title", 500) : undefined,
      url: safeUrl(source.url),
      summary: source.summary ? cleanText(source.summary, "source summary", 1_000) : undefined,
      status: source.status,
      checkedAt: source.checkedAt,
    }));
    const externalSource = `mcp:${principal.clientId}`.slice(0, 240);
    const externalId = input.createKey ? cleanText(input.createKey, "createKey", 160) : undefined;
    const existing = input.itemId
      ? await ctx.db.get(input.itemId)
      : await ctx.db
          .query("items")
          .withIndex("by_move_external_key", (q) =>
            q.eq("moveId", moveId).eq("externalSource", externalSource).eq("externalId", externalId),
          )
          .unique();
    if (existing && (existing.moveId !== moveId || existing.deletedAt !== undefined)) {
      mcpError("NOT_FOUND", "Inventory item is unavailable in this move.", "Refresh search results and use a returned item ID.");
    }
    if (input.itemId && existing && input.expectedUpdatedAt !== existing.updatedAt) {
      mcpError("STALE_VERSION", `Inventory item ${existing.name} changed after it was read.`, "Read the item again and retry with expectedUpdatedAt.");
    }
    if (existing) {
      const name = input.name ? cleanText(input.name, "item name", 240) : existing.name;
      const patch = itemPatch({ ...input, researchSources });
      await ctx.db.patch(existing._id, {
        ...patch,
        name,
        normalizedName: normalizedSearchName(name),
        researchedAt: sourcesProvided
          ? researchSources?.length
            ? now
            : undefined
          : existing.researchedAt,
        researchedByUserId: sourcesProvided
          ? researchSources?.length
            ? userId
            : undefined
          : existing.researchedByUserId,
        researchedByLabel: sourcesProvided
          ? researchSources?.length
            ? `MCP ${principal.clientName ?? principal.clientId}`.slice(0, 240)
            : undefined
          : existing.researchedByLabel,
        agentLabel: `MCP ${principal.clientName ?? principal.clientId}`.slice(0, 240),
        updatedByUserId: userId,
        updatedAt: now,
      });
      results.push({ itemId: existing._id, action: "updated" as const, name, updatedAt: now });
    } else {
      const name = cleanText(input.name ?? "", "item name", 240);
      const patch = itemPatch({ ...input, researchSources });
      const code = await generateItemCode(ctx, moveId);
      const id = await ctx.db.insert("items", {
        householdId,
        moveId,
        name,
        normalizedName: normalizedSearchName(name),
        code,
        externalSource,
        externalId,
        disposition: (patch.disposition as Doc<"items">["disposition"] | undefined) ?? "undecided",
        status: (patch.status as Doc<"items">["status"] | undefined) ?? "active",
        quantity: (patch.quantity as number | undefined) ?? 1,
        condition: (patch.condition as Doc<"items">["condition"] | undefined) ?? "unknown",
        weightConfidence: (patch.weightConfidence as Doc<"items">["weightConfidence"] | undefined) ?? "none",
        volumeConfidence: (patch.volumeConfidence as Doc<"items">["volumeConfidence"] | undefined) ?? "none",
        fragility: (patch.fragility as Doc<"items">["fragility"] | undefined) ?? "low",
        stackable: true,
        hazardousFlag: false,
        highValue: (patch.highValue as boolean | undefined) ?? false,
        requiresPersonalTransport: false,
        planningDefaultKeys: [],
        needsReview: (patch.needsReview as boolean | undefined) ?? false,
        reviewFlags: (patch.reviewFlags as string[] | undefined) ?? [],
        aiTags: [],
        createdVia: "mcp",
        createdByUserId: userId,
        updatedByUserId: userId,
        agentLabel: `MCP ${principal.clientName ?? principal.clientId}`.slice(0, 240),
        researchedAt: researchSources?.length ? now : undefined,
        researchedByUserId: researchSources?.length ? userId : undefined,
        researchedByLabel: researchSources?.length
          ? `MCP ${principal.clientName ?? principal.clientId}`.slice(0, 240)
          : undefined,
        ...patch,
        createdAt: now,
        updatedAt: now,
      });
      results.push({ itemId: id, action: "created" as const, name, updatedAt: now });
    }
  }
  return results;
}

export const saveMoveContext = internalMutation({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    operationId: v.string(),
    requestHash: v.string(),
    expectedUpdatedAt: v.optional(v.number()),
    patch: v.object({
      title: v.optional(v.string()),
      status: v.optional(moveStatus),
      origin: optionalNullableString,
      destination: optionalNullableString,
      dateStart: optionalNullableString,
      dateEnd: optionalNullableString,
      distanceMiles: optionalNullableNumber,
      travelMinutes: optionalNullableNumber,
      notes: optionalNullableString,
    }),
    spaces: v.optional(v.array(spaceInput)),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { move, policy } = await requireMcpMove(ctx, args.principal, args.moveId, "inventory:edit", "moving.work.write");
    const replay = await replayResult(ctx, policy.user._id, args.principal, "save_move_context", args.operationId, args.requestHash);
    if (replay) return replay;
    if (args.expectedUpdatedAt !== undefined && args.expectedUpdatedAt !== move.updatedAt) {
      mcpError("STALE_VERSION", "The move changed after it was read.", "Refresh get_move_brief and retry with expectedUpdatedAt.");
    }
    const reason = cleanText(args.reason, "reason", 500);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.patch.title !== undefined) patch.title = cleanText(args.patch.title, "title", 240);
    if (args.patch.status !== undefined) {
      if (args.patch.status === "archived") mcpError("VALIDATION_ERROR", "MCP cannot archive a move.", "Use the signed-in Assist With Moving archive flow.");
      patch.status = args.patch.status;
    }
    for (const field of ["origin", "destination", "dateStart", "dateEnd", "notes"] as const) {
      if (field in args.patch) patch[field] = optionalText(args.patch[field], field === "notes" ? 8_000 : 500) ?? undefined;
    }
    for (const field of ["distanceMiles", "travelMinutes"] as const) {
      if (field in args.patch) patch[field] = finiteNumber(args.patch[field], field) ?? undefined;
    }
    await ctx.db.patch(move._id, patch);
    const spaces = await saveSpaces(ctx, args.principal, policy.user._id, move.householdId, move._id, args.spaces ?? []);
    await recordAuditEvent(ctx, {
      householdId: move.householdId,
      moveId: move._id,
      actorType: "agent",
      actorUserId: policy.user._id,
      category: "plan",
      action: "mcp.move_context_saved",
      objectTable: "moves",
      objectId: move._id,
      metadata: { clientId: args.principal.clientId, operationId: args.operationId, reason, changedFields: Object.keys(args.patch), spaceCount: spaces.length },
    });
    const result = { moveId: move._id, updatedAt: patch.updatedAt, spaces, receipt: { actor: "Your AI via MCP", operationId: args.operationId, reason } };
    await saveReplayResult(ctx, policy.user._id, move._id, args.principal, "save_move_context", args.operationId, args.requestHash, result);
    return result;
  },
});

export const saveInventory = internalMutation({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    operationId: v.string(),
    requestHash: v.string(),
    items: v.array(itemInput),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { move, policy } = await requireMcpMove(ctx, args.principal, args.moveId, "inventory:edit", "moving.work.write");
    const replay = await replayResult(ctx, policy.user._id, args.principal, "save_inventory", args.operationId, args.requestHash);
    if (replay) return replay;
    const reason = cleanText(args.reason, "reason", 500);
    const items = await saveItems(ctx, args.principal, policy.user._id, move.householdId, move._id, args.items);
    await recordAuditEvent(ctx, {
      householdId: move.householdId,
      moveId: move._id,
      actorType: "agent",
      actorUserId: policy.user._id,
      category: "inventory",
      action: "mcp.inventory_saved",
      objectTable: "items",
      metadata: { clientId: args.principal.clientId, operationId: args.operationId, reason, count: items.length },
    });
    const result = { moveId: move._id, items, receipt: { actor: "Your AI via MCP", operationId: args.operationId, reason } };
    await saveReplayResult(ctx, policy.user._id, move._id, args.principal, "save_inventory", args.operationId, args.requestHash, result);
    return result;
  },
});

export const savePlanningRecord = internalMutation({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    operationId: v.string(),
    requestHash: v.string(),
    record: planningRecordInput,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { move, policy } = await requireMcpMove(ctx, args.principal, args.moveId, "plan:edit", "moving.work.write");
    const replay = await replayResult(ctx, policy.user._id, args.principal, "save_planning_record", args.operationId, args.requestHash);
    if (replay) return replay;
    const reason = cleanText(args.reason, "reason", 500);
    const saved = await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, args.record);
    await recordAuditEvent(ctx, {
      householdId: move.householdId,
      moveId: move._id,
      actorType: "agent",
      actorUserId: policy.user._id,
      category: "plan",
      action: "mcp.planning_record_saved",
      objectTable: "movePlanningRecords",
      objectId: saved.record.planningRecordId,
      metadata: { clientId: args.principal.clientId, operationId: args.operationId, reason, kind: args.record.kind, action: saved.action },
    });
    const result = { moveId: move._id, ...saved, receipt: { actor: "Your AI via MCP", operationId: args.operationId, reason } };
    await saveReplayResult(ctx, policy.user._id, move._id, args.principal, "save_planning_record", args.operationId, args.requestHash, result);
    return result;
  },
});

export const saveCompleteResult = internalMutation({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    operationId: v.string(),
    requestHash: v.string(),
    resultKey: v.string(),
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    status: v.optional(movePlanningRecordStatus),
    confidence: v.optional(estimateConfidence),
    items: v.optional(v.array(itemInput)),
    spaces: v.optional(v.array(spaceInput)),
    decisions: v.optional(v.array(planningRecordInput)),
    estimates: v.optional(v.array(planningRecordInput)),
    planSections: v.optional(v.array(planningRecordInput)),
    sourceChecks: v.optional(v.array(sourceCheckInput)),
    relatedQueueItemId: v.optional(v.id("queueItems")),
    completeQueueItem: v.optional(v.boolean()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const inventoryAccess = await requireMcpMove(ctx, args.principal, args.moveId, "inventory:edit", "moving.work.write");
    await requireMcpMove(ctx, args.principal, args.moveId, "plan:edit", "moving.work.write");
    const { move, policy } = inventoryAccess;
    const replay = await replayResult(ctx, policy.user._id, args.principal, "save_complete_result", args.operationId, args.requestHash);
    if (replay) return replay;
    const reason = cleanText(args.reason, "reason", 500);
    const totalPlanningRows =
      (args.decisions?.length ?? 0) +
      (args.estimates?.length ?? 0) +
      (args.planSections?.length ?? 0) +
      (args.sourceChecks?.length ?? 0) +
      1;
    if (totalPlanningRows > MAX_WRITE_ROWS) {
      mcpError("VALIDATION_ERROR", `A complete result may save at most ${MAX_WRITE_ROWS} planning records.`, "Split unusually large work into complete and granular saves.");
    }
    const spaces = await saveSpaces(ctx, args.principal, policy.user._id, move.householdId, move._id, args.spaces ?? []);
    const items = await saveItems(ctx, args.principal, policy.user._id, move.householdId, move._id, args.items ?? []);
    const umbrella = await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, {
      stableKey: `complete:${args.resultKey}`,
      kind: "planResult",
      title: args.title,
      summary: args.summary,
      body: args.body,
      status: args.status,
      confidence: args.confidence,
      relatedQueueItemId: args.relatedQueueItemId,
    });
    let queueOutcome: {
      transition: "none" | "done";
      note: string;
      failure?: string;
    } = {
      transition: "none",
      note: "The result is linked for human inspection. Ask for moving.queue.work if you also need to close the handoff.",
    };
    if (args.relatedQueueItemId) {
      await linkQueueResultWithoutTransition(
        ctx,
        {
          userId: policy.user._id,
          actorType: "agent",
          label: "Your AI via MCP",
          isManager: false,
          delegatedOwnerIds: [],
        },
        {
          householdId: move.householdId,
          moveId: move._id,
          queueItemId: args.relatedQueueItemId,
          resultSummary: args.summary,
          resultRef: {
            type: "planningRecord",
            id: umbrella.record.planningRecordId,
            label: args.title,
          },
          idempotencyKey: `mcp:${args.principal.clientId}:${args.operationId}:result-linked`,
        },
      );
      // The one-call finish. Closing the handoff needs its own authority, so a
      // work-write grant alone links the result and leaves the Queue state to
      // the person — it does not quietly decide the job is done.
      if (args.completeQueueItem) {
        const queueGrant = await hasQueueWorkGrant(ctx, args.principal, move._id);
        if (!queueGrant) {
          queueOutcome = {
            transition: "none",
            note: "The result is linked, but this connection does not hold moving.queue.work, so the handoff is still yours to close.",
          };
        } else {
          try {
            await completeQueueForResult(ctx, args.principal, {
              householdId: move.householdId,
              moveId: move._id,
              queueItemId: args.relatedQueueItemId,
              resultSummary: args.summary,
              resultRef: {
                type: "planningRecord",
                id: umbrella.record.planningRecordId,
                label: args.title,
              },
              operationId: args.operationId,
              userId: policy.user._id,
              isManager: false,
              delegatedOwnerIds: [],
            });
            queueOutcome = {
              transition: "done",
              note: "The handoff is Done with this result attached.",
            };
          } catch (error) {
            // The work is already durably saved. Reporting a partial truth is
            // better than discarding a good result over a state transition.
            queueOutcome = {
              transition: "none",
              note:
                "The result saved and is linked, but the handoff could not be closed. Re-read it with list_queue_work and complete it, or close it yourself.",
              failure: error instanceof ConvexError ? String(error.data ?? error.message) : "unknown",
            };
          }
        }
      }
    }
    const records = [];
    for (const input of args.decisions ?? []) {
      if (input.kind !== "decision") mcpError("VALIDATION_ERROR", "Every decisions entry must use kind decision.", "Correct the discriminated result array.");
      records.push(await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, input));
    }
    for (const input of args.estimates ?? []) {
      if (input.kind !== "estimate") mcpError("VALIDATION_ERROR", "Every estimates entry must use kind estimate.", "Correct the discriminated result array.");
      records.push(await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, input));
    }
    for (const input of args.planSections ?? []) {
      if (input.kind !== "planResult") mcpError("VALIDATION_ERROR", "Every planSections entry must use kind planResult.", "Correct the discriminated result array.");
      records.push(await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, input));
    }
    for (const source of args.sourceChecks ?? []) {
      records.push(await upsertPlanningRecord(ctx, args.principal, policy.user._id, move.householdId, move._id, args.operationId, {
        stableKey: source.stableKey,
        kind: "sourceCheck",
        title: source.title,
        summary: source.summary,
        details: source.details,
        sourceTitle: source.title,
        sourceUrl: source.url,
        sourcePublisher: source.publisher,
        sourceStatus: source.status,
        checkedAt: source.checkedAt,
        relatedItemIds: source.relatedItemIds,
        relatedBoxIds: source.relatedBoxIds,
        relatedSpaceIds: source.relatedSpaceIds,
      }));
    }
    await recordAuditEvent(ctx, {
      householdId: move.householdId,
      moveId: move._id,
      actorType: "agent",
      actorUserId: policy.user._id,
      category: "plan",
      action: "mcp.complete_result_saved",
      objectTable: "movePlanningRecords",
      objectId: umbrella.record.planningRecordId,
      metadata: {
        clientId: args.principal.clientId,
        operationId: args.operationId,
        reason,
        itemCount: items.length,
        spaceCount: spaces.length,
        planningRecordCount: records.length + 1,
        relatedQueueItemId: args.relatedQueueItemId,
        queueTransition: queueOutcome.transition,
      },
    });
    const result = {
      moveId: move._id,
      result: umbrella.record,
      items,
      spaces,
      records: records.map((entry) => entry.record),
      queue: args.relatedQueueItemId
        ? { queueItemId: args.relatedQueueItemId, ...queueOutcome }
        : null,
      receipt: { actor: "Your AI via MCP", operationId: args.operationId, reason },
    };
    await saveReplayResult(ctx, policy.user._id, move._id, args.principal, "save_complete_result", args.operationId, args.requestHash, result);
    return result;
  },
});

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(ctx, args.householdId, args.moveId, "plan:read");
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 100), 1), 100);
    const rows = await ctx.db
      .query("movePlanningRecords")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit + 1);
    return {
      records: rows.slice(0, limit).filter((row) => row.archivedAt === undefined).map(shapePlanningRecord),
      hasMore: rows.length > limit,
    };
  },
});

// Cleanup is deliberately internal and bounded; it supports synthetic proof and
// normal expiry maintenance without exposing deletion as an MCP tool.
export const cleanupExpiredOperations = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 100), 1), 500);
    const rows = await ctx.db
      .query("mcpOperations")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, hasMore: rows.length === limit };
  },
});
