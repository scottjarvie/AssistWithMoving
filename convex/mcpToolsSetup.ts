// OAuth MCP gateway tools for MOVE SETUP & CONFIG:
//   update_move      → move basics: dates, start/end locations, distance, status
//   list_transport   → the move's transportation (vehicles/PODs/trailers) + zones
//   upsert_transport → add or edit transportation
//   place_box        → set a box's present location (a room OR a transport) and
//                      its destination room — the link between boxes, rooms, and
//                      transportation
//
// Each resolves the user from the gateway-injected caller.subject via the
// identity bridge (NEVER ctx.auth) and mirrors the canonical mutations
// (moves.updateBasics, transportResources.*, boxes.update) — those use
// requireMovePermission (ctx.auth), which is null inside a gateway tool, so the
// core logic is duplicated here over the subject bridge.
//
// Rooms/transport can be referenced BY NAME (resolved to the existing record) or
// BY ID. Resolution never creates — the room/transport must already exist
// (upsert_spaces / upsert_transport).
import { v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import {
  capacityValidator,
  moveStatusValidator,
  normalizeBoxCode,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeStructuredLocation,
  structuredLocationToDisplay,
  structuredLocationValidator,
  transportResourceTypeValidator,
} from "./lib/moveFields";

type Ctx = QueryCtx | MutationCtx;

function normName(value: string) {
  return value.trim().toLowerCase();
}

// Resolve a room/space within a move by id (preferred) or name. Never creates.
async function resolveSpaceId(
  ctx: Ctx,
  moveId: Id<"moves">,
  ref: { id?: Id<"moveSpaces">; name?: string },
): Promise<Id<"moveSpaces"> | undefined> {
  if (ref.id) {
    const space = await ctx.db.get(ref.id);
    if (!space || space.moveId !== moveId) {
      throw new Error("That room is not part of this move.");
    }
    return ref.id;
  }
  const name = ref.name?.trim();
  if (!name) return undefined;
  const spaces = await ctx.db
    .query("moveSpaces")
    .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
    .collect();
  const match = spaces.find((s) => normName(s.name) === normName(name));
  if (!match) {
    const available = spaces.map((s) => s.name).join(", ") || "none yet";
    throw new Error(
      `No room named "${name}" in this move. Existing rooms: ${available}. Create it with upsert_spaces first.`,
    );
  }
  return match._id;
}

// Resolve a transport resource within a move by id (preferred) or name.
async function resolveTransportId(
  ctx: Ctx,
  moveId: Id<"moves">,
  ref: { id?: Id<"transportResources">; name?: string },
): Promise<Id<"transportResources"> | undefined> {
  if (ref.id) {
    const resource = await ctx.db.get(ref.id);
    if (!resource || resource.moveId !== moveId) {
      throw new Error("That transport is not part of this move.");
    }
    if (resource.archivedAt) {
      throw new Error("That transport is archived.");
    }
    return ref.id;
  }
  const name = ref.name?.trim();
  if (!name) return undefined;
  const resources = await ctx.db
    .query("transportResources")
    .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
    .collect();
  const match = resources.find((r) => normName(r.name) === normName(name));
  if (!match) {
    const available = resources.map((r) => r.name).join(", ") || "none yet";
    throw new Error(
      `No transport named "${name}" in this move. Existing transports: ${available}. Create it with upsert_transport first.`,
    );
  }
  return match._id;
}

// ---- update_move -----------------------------------------------------------
export const updateMoveArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  title: v.optional(v.string()),
  status: v.optional(moveStatusValidator),
  origin: v.optional(v.string()),
  destination: v.optional(v.string()),
  startLocation: v.optional(structuredLocationValidator),
  endLocation: v.optional(structuredLocationValidator),
  distanceMiles: v.optional(v.number()),
  travelMinutes: v.optional(v.number()),
  dateStart: v.optional(v.string()),
  dateEnd: v.optional(v.string()),
};
export const updateMove = mutation({
  args: updateMoveArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:edit",
    );
    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found in this household.");
    }

    // Archiving/unarchiving a move requires household:manage_settings in the
    // canonical moves.archive mutation, but this tool only checks household:edit
    // and never sets/clears archivedAt. Block status transitions through the
    // archive state here so they go through the app's gated flow instead.
    if (
      args.status === "archived" ||
      (move.status === "archived" && args.status !== undefined)
    ) {
      throw new Error(
        "Archiving a move isn't supported here — do it in the app.",
      );
    }

    const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = normalizeOptionalText(args.title);
    if (args.status !== undefined) patch.status = args.status;
    if (args.origin !== undefined) {
      patch.origin = normalizeOptionalText(args.origin);
    }
    if (args.destination !== undefined) {
      patch.destination = normalizeOptionalText(args.destination);
    }
    // Structured locations are additive; only derive origin/destination strings
    // when the caller didn't pass them and the stored value is empty (mirrors
    // moves.updateBasics — never clobber a hand-typed origin/destination).
    if (args.startLocation !== undefined) {
      const loc = normalizeStructuredLocation(args.startLocation);
      patch.startLocation = loc;
      if (args.origin === undefined && !move.origin) {
        const derived = structuredLocationToDisplay(loc);
        if (derived) patch.origin = derived;
      }
    }
    if (args.endLocation !== undefined) {
      const loc = normalizeStructuredLocation(args.endLocation);
      patch.endLocation = loc;
      if (args.destination === undefined && !move.destination) {
        const derived = structuredLocationToDisplay(loc);
        if (derived) patch.destination = derived;
      }
    }
    if (args.distanceMiles !== undefined) {
      patch.distanceMiles =
        Number.isFinite(args.distanceMiles) && args.distanceMiles >= 0
          ? args.distanceMiles
          : undefined;
    }
    if (args.travelMinutes !== undefined) {
      patch.travelMinutes =
        Number.isFinite(args.travelMinutes) && args.travelMinutes >= 0
          ? args.travelMinutes
          : undefined;
    }
    if (args.dateStart !== undefined) {
      patch.dateStart = normalizeOptionalText(args.dateStart);
    }
    if (args.dateEnd !== undefined) {
      patch.dateEnd = normalizeOptionalText(args.dateEnd);
    }

    await ctx.db.patch(args.moveId, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: policy.actor.userId,
      category: "household",
      action: "mcp.move_updated",
      objectTable: "moves",
      objectId: args.moveId,
    });

    const updated = await ctx.db.get(args.moveId);
    return {
      move: {
        moveId: args.moveId,
        title: updated?.title ?? null,
        status: updated?.status ?? null,
        origin: updated?.origin ?? null,
        destination: updated?.destination ?? null,
        distanceMiles: updated?.distanceMiles ?? null,
        travelMinutes: updated?.travelMinutes ?? null,
        dateStart: updated?.dateStart ?? null,
        dateEnd: updated?.dateEnd ?? null,
      },
    };
  },
});

// ---- list_transport --------------------------------------------------------
export const listTransportArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
};
export const listTransport = query({
  args: listTransportArgs,
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const resources = await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();

    const transports = await Promise.all(
      resources
        .filter((resource) => !resource.archivedAt)
        .map(async (resource) => {
          const zones = await ctx.db
            .query("transportZones")
            .withIndex("by_resource_sort", (q) =>
              q.eq("resourceId", resource._id),
            )
            .collect();
          return {
            transportId: resource._id,
            name: resource.name,
            type: resource.type,
            description: resource.description ?? null,
            capacity: resource.capacity ?? {},
            rules: resource.rules ?? [],
            zones: zones
              .filter((zone) => !zone.archivedAt)
              .map((zone) => ({ zoneId: zone._id, name: zone.name })),
          };
        }),
    );

    return { transports };
  },
});

// ---- upsert_transport ------------------------------------------------------
const transportDraftValidator = v.object({
  transportId: v.optional(v.id("transportResources")), // present → update
  type: v.optional(transportResourceTypeValidator), // required to create
  name: v.optional(v.string()), // required to create
  description: v.optional(v.string()),
  capacity: v.optional(capacityValidator),
  rules: v.optional(v.array(v.string())),
});
export const upsertTransportArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  transports: v.array(transportDraftValidator),
};
export const upsertTransport = mutation({
  args: upsertTransportArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:edit",
    );
    const userId = policy.actor.userId;
    const now = Date.now();
    const results: Array<{ transportId: Id<"transportResources">; created: boolean }> =
      [];

    for (const draft of args.transports) {
      if (draft.transportId) {
        const resource = await ctx.db.get(draft.transportId);
        if (!resource || resource.moveId !== args.moveId) {
          throw new Error("Transport not found for this move.");
        }
        const patch: Partial<Doc<"transportResources">> = { updatedAt: now };
        if (draft.name !== undefined) {
          patch.name = draft.name.trim() || resource.name;
        }
        if (draft.description !== undefined) {
          patch.description = normalizeOptionalText(draft.description);
        }
        if (draft.capacity !== undefined) {
          patch.capacity = draft.capacity;
          if (resource.capacityReviewStatus === "unreviewed") {
            patch.capacityReviewStatus = "estimated";
          }
        }
        if (draft.rules !== undefined) patch.rules = normalizeRuleList(draft.rules);
        await ctx.db.patch(draft.transportId, patch);
        results.push({ transportId: draft.transportId, created: false });
      } else {
        const name = draft.name?.trim();
        if (!name) throw new Error("A new transport needs a name.");
        if (!draft.type) {
          throw new Error(
            "A new transport needs a type (e.g. truck, trailer, personalVehicle, professionalMovers, storage).",
          );
        }
        const resourceId = await ctx.db.insert("transportResources", {
          householdId: args.householdId,
          moveId: args.moveId,
          type: draft.type,
          name,
          description: normalizeOptionalText(draft.description),
          capacity: draft.capacity ?? {},
          capacityReviewStatus: "unreviewed",
          rules: normalizeRuleList(draft.rules ?? []),
          sortOrder: now + results.length,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ transportId: resourceId, created: true });
      }
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: userId,
      category: "household",
      action: "mcp.transport_upserted",
      objectTable: "transportResources",
      metadata: { count: results.length },
    });

    return { results };
  },
});

// ---- place_box -------------------------------------------------------------
export const placeBoxArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  // Identify the box by id or by its code (e.g. "B-001").
  boxId: v.optional(v.id("boxes")),
  code: v.optional(v.string()),
  // Present location: the ROOM the box is physically in now.
  presentRoom: v.optional(v.string()),
  presentRoomId: v.optional(v.id("moveSpaces")),
  clearPresentRoom: v.optional(v.boolean()),
  // Present location: the TRANSPORT it is loaded on / assigned to.
  transport: v.optional(v.string()),
  transportId: v.optional(v.id("transportResources")),
  clearTransport: v.optional(v.boolean()),
  // Where the box should END UP.
  destinationRoom: v.optional(v.string()),
  destinationRoomId: v.optional(v.id("moveSpaces")),
};
export const placeBox = mutation({
  args: placeBoxArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );

    let box: Doc<"boxes"> | null = null;
    if (args.boxId) {
      box = await ctx.db.get(args.boxId);
    } else if (args.code) {
      const code = normalizeBoxCode(args.code);
      box = await ctx.db
        .query("boxes")
        .withIndex("by_move_code", (q) =>
          q.eq("moveId", args.moveId).eq("code", code),
        )
        .unique();
    }
    if (
      !box ||
      box.moveId !== args.moveId ||
      box.householdId !== args.householdId
    ) {
      throw new Error("Box not found — pass a valid boxId or code (see list_boxes).");
    }

    const now = Date.now();
    const patch: Partial<Doc<"boxes">> = { updatedAt: now };

    // Present location — room.
    if (args.clearPresentRoom) {
      patch.currentSpaceId = undefined;
    } else if (args.presentRoomId || args.presentRoom) {
      patch.currentSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.presentRoomId,
        name: args.presentRoom,
      });
    }

    // Present location — transport. Changing the resource invalidates any prior
    // zone/trip placement and capacity validation, so clear them. Capacity/load
    // validation is not performed here.
    if (args.clearTransport) {
      patch.assignedResourceId = undefined;
      patch.assignedZoneId = undefined;
      patch.assignedTripId = undefined;
      patch.assignedTripSpaceId = undefined;
      patch.assignmentWarnings = [];
      patch.assignmentHardBlocks = [];
      patch.assignmentValidatedAt = now;
    } else if (args.transportId || args.transport) {
      patch.assignedResourceId = await resolveTransportId(ctx, args.moveId, {
        id: args.transportId,
        name: args.transport,
      });
      patch.assignedZoneId = undefined;
      patch.assignedTripId = undefined;
      patch.assignedTripSpaceId = undefined;
      patch.assignmentWarnings = [];
      patch.assignmentHardBlocks = [];
      patch.assignmentValidatedAt = now;
    }

    // Destination room.
    if (args.destinationRoomId || args.destinationRoom) {
      const destSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.destinationRoomId,
        name: args.destinationRoom,
      });
      patch.destinationSpaceId = destSpaceId;
      if (destSpaceId) {
        const space = await ctx.db.get(destSpaceId);
        if (space?.name) patch.destinationRoom = normalizeOptionalText(space.name);
      }
    }

    await ctx.db.patch(box._id, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: policy.actor.userId,
      category: "inventory",
      action: "mcp.box_placed",
      objectTable: "boxes",
      objectId: box._id,
    });

    const updated = await ctx.db.get(box._id);
    return {
      box: {
        boxId: box._id,
        code: updated?.code ?? null,
        label: updated?.label ?? null,
        currentSpaceId: updated?.currentSpaceId ?? null,
        assignedResourceId: updated?.assignedResourceId ?? null,
        destinationSpaceId: updated?.destinationSpaceId ?? null,
        destinationRoom: updated?.destinationRoom ?? null,
      },
    };
  },
});
