import { compareValues, ConvexError, type Value } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordAuditEvent, type AuditEventInput } from "./audit";
import { projectHistoryRow, shapeHistoryEvent, verifiedConnectionByline } from "./history";

const fields = [
  "name", "kind", "aliases", "notes", "floorLevel", "sortOrder", "status",
  "availability", "transportResource", "transportZone", "linkedPlan", "capacity",
] as const;
type Field = (typeof fields)[number];
const roomFields = new Set<string>(fields);
const sharedRoomFields = new Set<string>(fields.filter(field => field !== "notes"));
const operations = ["created", "updated", "archived", "restored"] as const;
type Operation = (typeof operations)[number];
const contract = { recordKind: "room", fields: roomFields, operations: new Set<string>(operations) };
const roomHistoryLimit = 64;

type Room = Doc<"moveSpaces">;
type RoomActor =
  | { lane: "web"; userId: Id<"users"> }
  | { lane: "mcp"; userId: Id<"users">; grantId: Id<"aiGrants"> }
  | { lane: "rest"; userId: Id<"users">; keyId: Id<"apiKeys"> };

function materialValues(room: Room): Record<Field, Value | undefined> {
  return {
    name: room.name, kind: room.kind, aliases: room.aliases, notes: room.notes,
    floorLevel: room.floorLevel, sortOrder: room.sortOrder, status: room.status,
    availability: room.archivedAt !== undefined ? true : undefined,
    transportResource: room.transportResourceId, transportZone: room.transportZoneId,
    linkedPlan: room.linkedPlanEntityId, capacity: room.capacity,
  };
}

export async function recordRoomReceipt(
  ctx: MutationCtx,
  actor: RoomActor,
  roomId: Id<"moveSpaces">,
  before: Room | null,
  native?: Pick<AuditEventInput, "action" | "metadata">,
) {
  const after = await ctx.db.get(roomId);
  if (!after) throw new ConvexError("Room is unavailable.");
  const from = before && materialValues(before);
  const to = materialValues(after);
  const changedFields = fields.filter(field => from
    ? compareValues(from[field], to[field]) !== 0
    : to[field] !== undefined);
  if (!native && !changedFields.length) return;

  const isArchived = (room: Room) => room.status === "archived" || room.archivedAt !== undefined;
  const operation: Operation = !before ? "created"
    : isArchived(before) === isArchived(after) ? "updated"
    : isArchived(after) ? "archived" : "restored";
  const shared = changedFields.some(field => sharedRoomFields.has(field));
  await recordAuditEvent(ctx, {
    householdId: after.householdId,
    moveId: after.moveId,
    actorType: actor.lane === "web" ? "user" : "agent",
    actorUserId: actor.userId,
    actorApiKeyId: actor.lane === "rest" ? actor.keyId : undefined,
    category: actor.lane === "rest" ? "apiKey" : "inventory",
    action: native?.action ?? `room.${actor.lane}_${operation}`,
    projectionOnly: native ? undefined : true,
    metadata: native?.metadata,
    objectTable: "moveSpaces",
    objectId: roomId,
    roomHistory: changedFields.length ? {
      version: 1,
      operation,
      fields: changedFields,
      shared,
      lane: actor.lane,
      grantId: actor.lane === "mcp" ? actor.grantId : undefined,
    } : undefined,
  });
  if (!changedFields.length) return;
  // A prior two-lane implementation could retain 64 per class alongside
  // up to 64 unclassified stamps. A Room already on this budget reads at most 65.
  const retained = await roomReceipts(ctx, after).order("desc").take(3 * roomHistoryLimit + 1);
  if (retained.length <= roomHistoryLimit) return;

  // Shared edits keep first claim on the budget. Unclassified receipts remain
  // editor-only and compete with private receipts by recency.
  const sharedReceipts = retained.filter(receipt => receipt.roomHistory?.shared === true);
  const privateReceipts = retained.filter(receipt => receipt.roomHistory?.shared !== true);
  const droppedShared = sharedReceipts.slice(roomHistoryLimit);
  const droppedPrivate = privateReceipts.slice(Math.max(0, roomHistoryLimit - sharedReceipts.length));
  for (const evicted of [...droppedShared, ...droppedPrivate]) {
    if (evicted.projectionOnly) await ctx.db.delete(evicted._id);
    else await ctx.db.patch(evicted._id, { roomHistory: undefined });
  }
  const omission: Partial<Room> = {};
  if (droppedShared.length && !after.sharedRoomHistoryOmitted) omission.sharedRoomHistoryOmitted = true;
  if (droppedPrivate.length && !after.privateRoomHistoryOmitted) omission.privateRoomHistoryOmitted = true;
  if (Object.keys(omission).length) await ctx.db.patch(roomId, omission);
}

/** Compare the first state to the final state, even if a bulk call names a room twice. */
export function roomReceiptBatch(ctx: MutationCtx, actor: RoomActor) {
  const rooms = new Map<Id<"moveSpaces">, { before: Room | null; native?: Pick<AuditEventInput, "action" | "metadata"> }>();
  return {
    remember(roomId: Id<"moveSpaces">, before: Room | null, native?: Pick<AuditEventInput, "action" | "metadata">) {
      if (!rooms.has(roomId)) rooms.set(roomId, { before, native });
    },
    async record() {
      for (const [roomId, { before, native }] of rooms) {
        await recordRoomReceipt(ctx, actor, roomId, before, native);
      }
    },
  };
}

function roomReceipts(ctx: QueryCtx | MutationCtx, room: Room, shared?: boolean) {
  const rows = shared === undefined
    ? ctx.db.query("auditLogs").withIndex("by_room_history", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", room._id).eq("roomHistory.version", 1))
    : ctx.db.query("auditLogs").withIndex("by_room_history_visibility", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", room._id).eq("roomHistory.version", 1).eq("roomHistory.shared", shared));
  return rows.filter(q => q.and(q.eq(q.field("householdId"), room.householdId), q.eq(q.field("moveId"), room.moveId)));
}

export async function readRoomHistory(ctx: QueryCtx, room: Room, viewer: Id<"users">, showNotes: boolean, requestedLimit: number) {
  const limit = Math.min(roomHistoryLimit, Math.max(1, Math.floor(requestedLimit) || 1));
  // Unclassified legacy stamps are excluded from the shared range.
  const receipts = await roomReceipts(ctx, room, showNotes ? undefined : true).order("desc").take(limit + 1);
  const rows = await Promise.all(receipts.slice(0, limit).map(async receipt => {
    const stamp = receipt.roomHistory!;
    const actor = stamp.lane === "web" && receipt.actorUserId
      ? { kind: "person" as const, ref: receipt.actorUserId }
      : stamp.lane === "rest" && receipt.actorApiKeyId
        ? { kind: "api-credential" as const, ref: receipt.actorApiKeyId }
        : stamp.grantId
          ? { kind: "connected-ai" as const, ref: stamp.grantId }
          : undefined;
    const event = shapeHistoryEvent(contract, {
      record: { kind: "room", scopeRef: room.moveId, ref: room._id },
      operation: stamp.operation, fields: stamp.fields, committedAt: receipt.createdAt,
    }, { actor, transport: stamp.lane, source: stamp.lane === "web" ? "manual" : "unknown" });
    if (!event) return null;
    return projectHistoryRow(event, {
      visibleFields: showNotes ? roomFields : sharedRoomFields,
      // Only the connection owner can see a stable connection-specific code.
      // Resolve the pinned grant itself and never look up the client's current grant.
      resolveActorLabel: async (record, actor) => {
        if (actor.kind !== "connected-ai" || receipt.actorUserId !== viewer || !stamp.grantId) return;
        const grant = await ctx.db.get(stamp.grantId);
        if (grant?.ownerUserId === viewer) return verifiedConnectionByline("moving", record.scopeRef, grant._id);
      },
      // Room write receipts do not prove a source attachment.
    });
  }));

  const foundMore = receipts.length > limit;
  const hasMore = limit < roomHistoryLimit && foundMore;
  const olderOmitted = room.sharedRoomHistoryOmitted === true ||
    (showNotes && room.privateRoomHistoryOmitted === true) ||
    (limit === roomHistoryLimit && foundMore);
  // A native object creation proves a legacy event. Old update receipts only
  // list submitted keys; neither they nor count-only batches prove a delta.
  let legacyCreation: { committedAt: number; operation: "created" } | null = null;
  if (!hasMore && !olderOmitted && !receipts.some(receipt => receipt.roomHistory?.operation === "created")) {
    const early = await ctx.db.query("auditLogs").withIndex("by_shared_object_time", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", room._id).eq("projectionOnly", undefined)).take(12);
    const creation = early.find(row => row.householdId === room.householdId && row.moveId === room.moveId &&
      ["space.created", "space.api_created", "space.api_setup_created"].includes(row.action));
    if (creation) legacyCreation = { committedAt: creation.createdAt, operation: "created" };
  }
  return {
    rows: rows.filter(row => row !== null),
    hasMore,
    legacyCreation,
    olderOmitted,
  };
}
