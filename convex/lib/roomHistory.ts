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
const sharedRoomFields = new Set(fields.filter(field => field !== "notes"));
const operations = ["created", "updated", "archived", "restored"] as const;
type Operation = (typeof operations)[number];
const contract = { recordKind: "room", fields: roomFields, operations: new Set<string>(operations) };
const roomHistoryLimit = 64;
const generatedActionPrefix = "room.";

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
  await recordAuditEvent(ctx, {
    householdId: after.householdId,
    moveId: after.moveId,
    actorType: actor.lane === "web" ? "user" : "agent",
    actorUserId: actor.userId,
    actorApiKeyId: actor.lane === "rest" ? actor.keyId : undefined,
    category: actor.lane === "rest" ? "apiKey" : "inventory",
    action: native?.action ?? `${generatedActionPrefix}${actor.lane}_${operation}`,
    metadata: native?.metadata,
    objectTable: "moveSpaces",
    objectId: roomId,
    roomHistory: changedFields.length ? {
      version: 1,
      operation,
      fields: changedFields,
      lane: actor.lane,
      grantId: actor.lane === "mcp" ? actor.grantId : undefined,
    } : undefined,
  });
  if (!changedFields.length) return;
  // Generated object receipts exist only for History. Keep native object
  // receipts and the original aggregate audit records for their usual lifetime.
  // The first eviction sets a persistent watermark. After that, each material
  // write adds one receipt and evicts the single oldest receipt.
  const retained = roomReceipts(ctx, roomId);
  const evicted = after.roomHistoryOmitted
    ? await retained.first()
    : (await retained.order("desc").take(roomHistoryLimit + 1))[roomHistoryLimit];
  if (evicted) {
    if (evicted.action.startsWith(generatedActionPrefix)) await ctx.db.delete(evicted._id);
    else await ctx.db.patch(evicted._id, { roomHistory: undefined });
    if (!after.roomHistoryOmitted) await ctx.db.patch(roomId, { roomHistoryOmitted: true });
  }
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

function roomReceipts(ctx: QueryCtx | MutationCtx, roomId: Id<"moveSpaces">) {
  return ctx.db.query("auditLogs").withIndex("by_room_history", q =>
    q.eq("objectTable", "moveSpaces").eq("objectId", roomId).eq("roomHistory.version", 1));
}

export async function readRoomHistory(ctx: QueryCtx, room: Room, viewer: Id<"users">, showNotes: boolean, requestedLimit: number) {
  const limit = Math.min(roomHistoryLimit, Math.max(1, Math.floor(requestedLimit) || 1));
  const receipts = await roomReceipts(ctx, room._id).order("desc").take(limit + 1);
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
    if (receipt.householdId !== room.householdId || receipt.moveId !== room.moveId || !event) return null;
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

  const hasMore = receipts.length > limit;
  // A native object creation proves a legacy event. Old update receipts only
  // list submitted keys; neither they nor count-only batches prove a delta.
  let legacyCreation: { committedAt: number; operation: "created" } | null = null;
  if (!hasMore && !room.roomHistoryOmitted && !receipts.some(receipt => receipt.roomHistory?.operation === "created")) {
    const early = await ctx.db.query("auditLogs").withIndex("by_object_time", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", room._id)).take(12);
    const creation = early.find(row => row.householdId === room.householdId && row.moveId === room.moveId &&
      ["space.created", "space.api_created", "space.api_setup_created"].includes(row.action));
    if (creation) legacyCreation = { committedAt: creation.createdAt, operation: "created" };
  }
  return {
    rows: rows.filter(row => row !== null),
    hasMore,
    legacyCreation,
    olderOmitted: room.roomHistoryOmitted === true,
  };
}
