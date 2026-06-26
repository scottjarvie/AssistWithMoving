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
import { assertResourceAndZone, loadAssignmentValidation } from "./boxes";
import {
  inferredMeasurementProvenanceForUser,
  loadItemAssignmentValidation,
} from "./items";
import { recordAuditEvent } from "./lib/audit";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import { addMoveParticipant as addMoveParticipantCore } from "./lib/moveParticipantWrite";
import {
  boxStatusValidator,
  capacityValidator,
  estimateConfidenceValidator,
  moveStatusValidator,
  normalizeBoxCode,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
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

// Resolve a transport zone within a move by id (preferred) or name. A zone only
// makes sense within a specific transport, so resolving by name requires the
// resourceId; by id we also verify the zone belongs to that resource (when
// known). Never creates.
async function resolveTransportZoneId(
  ctx: Ctx,
  moveId: Id<"moves">,
  resourceId: Id<"transportResources"> | undefined,
  ref: { id?: Id<"transportZones">; name?: string },
): Promise<Id<"transportZones"> | undefined> {
  if (ref.id) {
    const zone = await ctx.db.get(ref.id);
    if (!zone || zone.moveId !== moveId) {
      throw new Error("That zone is not part of this move.");
    }
    if (zone.archivedAt) {
      throw new Error("That zone is archived.");
    }
    if (resourceId && zone.resourceId !== resourceId) {
      throw new Error("That zone does not belong to the assigned transport.");
    }
    return ref.id;
  }
  const name = ref.name?.trim();
  if (!name) return undefined;
  if (!resourceId) {
    throw new Error(
      "A zone only makes sense within a transport — set the transport first (transport/transportId) or pass a zoneId.",
    );
  }
  const zones = await ctx.db
    .query("transportZones")
    .withIndex("by_resource_sort", (q) => q.eq("resourceId", resourceId))
    .collect();
  const match = zones.find(
    (z) => !z.archivedAt && normName(z.name) === normName(name),
  );
  if (!match) {
    const available =
      zones
        .filter((z) => !z.archivedAt)
        .map((z) => z.name)
        .join(", ") || "none yet";
    throw new Error(
      `No zone named "${name}" on this transport. Existing zones: ${available}. Create it with upsert_transport first.`,
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
      actorType: "agent",
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
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((zone) => ({
                zoneId: zone._id,
                name: zone.name,
                description: zone.description ?? null,
                capacity: zone.capacity ?? {},
                preferredTags: zone.preferredTags ?? [],
                sortOrder: zone.sortOrder,
              })),
          };
        }),
    );

    return { transports };
  },
});

// ---- upsert_transport ------------------------------------------------------
const transportZoneDraftValidator = v.object({
  zoneId: v.optional(v.id("transportZones")), // present → update/archive an existing zone
  name: v.optional(v.string()), // required to create; without zoneId, matches an existing zone by exact name OR creates a new one — to RENAME a zone you must pass its zoneId plus the new name
  description: v.optional(v.string()),
  capacity: v.optional(capacityValidator),
  preferredTags: v.optional(v.array(v.string())),
  sortOrder: v.optional(v.number()),
  archive: v.optional(v.boolean()), // soft-delete the matched zone (sets archivedAt)
});
const transportDraftValidator = v.object({
  transportId: v.optional(v.id("transportResources")), // present → update
  type: v.optional(transportResourceTypeValidator), // required to create
  name: v.optional(v.string()), // required to create
  description: v.optional(v.string()),
  capacity: v.optional(capacityValidator),
  rules: v.optional(v.array(v.string())),
  zones: v.optional(v.array(transportZoneDraftValidator)),
  // Soft-delete the whole transport (sets archivedAt) — requires transportId.
  // Mirrors the per-zone `archive` flag below; list_transport already hides
  // archived resources. An explicit edit (any other field) un-archives.
  archive: v.optional(v.boolean()),
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
    const results: Array<{
      transportId: Id<"transportResources">;
      created: boolean;
      archived?: boolean;
      zones?: Array<{
        zoneId: Id<"transportZones">;
        name: string;
        created: boolean;
        archived?: boolean;
      }>;
    }> = [];

    for (const draft of args.transports) {
      // Archive path — soft-delete the whole transport. Requires transportId;
      // list_transport already filters out archived resources.
      if (draft.archive) {
        if (!draft.transportId) {
          throw new Error(
            "To archive a transport, pass its transportId together with archive: true.",
          );
        }
        const resource = await ctx.db.get(draft.transportId);
        if (!resource || resource.moveId !== args.moveId) {
          throw new Error("Transport not found for this move.");
        }
        await ctx.db.patch(draft.transportId, {
          archivedAt: now,
          updatedAt: now,
        });
        results.push({
          transportId: draft.transportId,
          created: false,
          archived: true,
        });
        continue;
      }

      let resourceId: Id<"transportResources">;
      let created: boolean;
      if (draft.transportId) {
        const resource = await ctx.db.get(draft.transportId);
        if (!resource || resource.moveId !== args.moveId) {
          throw new Error("Transport not found for this move.");
        }
        const patch: Partial<Doc<"transportResources">> = { updatedAt: now };
        // Explicit edit un-archives a previously archived transport, mirroring
        // the un-archive-on-edit behavior of zones and spaces.
        if (resource.archivedAt) patch.archivedAt = undefined;
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
        resourceId = draft.transportId;
        created = false;
      } else {
        const name = draft.name?.trim();
        if (!name) throw new Error("A new transport needs a name.");
        if (!draft.type) {
          throw new Error(
            "A new transport needs a type (e.g. truck, trailer, personalVehicle, professionalMovers, storage).",
          );
        }
        resourceId = await ctx.db.insert("transportResources", {
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
        created = true;
      }

      // Shared zones block — runs for both the create and the edit branch so load
      // zones can be set when creating a brand-new truck AND when editing one.
      const zoneResults: Array<{
        zoneId: Id<"transportZones">;
        name: string;
        created: boolean;
        archived?: boolean;
      }> = [];
      if (draft.zones && draft.zones.length > 0) {
        const existingZones = await ctx.db
          .query("transportZones")
          .withIndex("by_resource_sort", (q) => q.eq("resourceId", resourceId))
          .collect();
        for (const z of draft.zones) {
          // resolve target zone
          let target: Doc<"transportZones"> | null = null;
          if (z.zoneId) {
            const existing = await ctx.db.get(z.zoneId);
            if (
              !existing ||
              existing.resourceId !== resourceId ||
              existing.moveId !== args.moveId
            ) {
              throw new Error("Zone not found for this transport.");
            }
            target = existing;
          } else if (z.name && z.name.trim()) {
            const wanted = z.name.trim().toLowerCase();
            target =
              existingZones.find(
                (e) => !e.archivedAt && e.name.trim().toLowerCase() === wanted,
              ) ?? null;
          }

          if (z.archive) {
            if (!target) {
              throw new Error(
                "Cannot archive a transport zone that does not exist (pass zoneId or an existing zone name).",
              );
            }
            await ctx.db.patch(target._id, { archivedAt: now, updatedAt: now });
            zoneResults.push({
              zoneId: target._id,
              name: target.name,
              created: false,
              archived: true,
            });
            continue;
          }

          if (target) {
            const zonePatch: Partial<Doc<"transportZones">> = { updatedAt: now };
            if (z.name !== undefined) zonePatch.name = z.name.trim() || target.name;
            if (z.description !== undefined) {
              zonePatch.description = normalizeOptionalText(z.description);
            }
            if (z.capacity !== undefined) zonePatch.capacity = z.capacity;
            if (z.preferredTags !== undefined) {
              zonePatch.preferredTags = normalizeRuleList(z.preferredTags);
            }
            if (z.sortOrder !== undefined) {
              zonePatch.sortOrder = normalizeSortOrder(z.sortOrder);
            }
            if (target.archivedAt) zonePatch.archivedAt = undefined; // explicit upsert un-archives
            await ctx.db.patch(target._id, zonePatch);
            zoneResults.push({
              zoneId: target._id,
              name: zonePatch.name ?? target.name,
              created: false,
            });
          } else {
            const zoneName = z.name?.trim();
            if (!zoneName) throw new Error("A new transport zone needs a name.");
            const zoneId = await ctx.db.insert("transportZones", {
              householdId: args.householdId,
              moveId: args.moveId,
              resourceId,
              name: zoneName,
              description: normalizeOptionalText(z.description),
              capacity: z.capacity ?? {},
              preferredTags: normalizeRuleList(z.preferredTags ?? []),
              // When no explicit sortOrder is given, offset by the number of zones
              // already present so multiple zones created in one call get distinct,
              // insertion-ordered keys (Date.now() is fixed across the whole mutation,
              // mirroring the `now + results.length` pattern used for transports above).
              sortOrder:
                z.sortOrder !== undefined
                  ? normalizeSortOrder(z.sortOrder)
                  : now + existingZones.length,
              createdByUserId: userId,
              createdAt: now,
              updatedAt: now,
            });
            zoneResults.push({ zoneId, name: zoneName, created: true });
            existingZones.push((await ctx.db.get(zoneId))!); // so later drafts in the same call can match by name
          }
        }
      }

      results.push({ transportId: resourceId, created, zones: zoneResults });
    }

    const zoneCount = results.reduce(
      (sum, r) => sum + (r.zones?.length ?? 0),
      0,
    );
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "household",
      action: "mcp.transport_upserted",
      objectTable: "transportResources",
      metadata: { count: results.length, zoneCount },
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
      actorType: "agent",
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

// ---- update_box ------------------------------------------------------------
// Gateway-native mirror of boxes.update for the FULL editable field set. The
// canonical boxes.update rejects API-key callers (actor.type must be "user"),
// so this rebuilds the same field handling + load/capacity validation over the
// subject bridge (requireMoveForSubject + policy.actor.userId). Reuses the
// exported loadAssignmentValidation/assertResourceAndZone so that logic stays
// single-sourced.
export const updateBoxArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  // Identify the box by id or by its code (e.g. "B-001").
  boxId: v.optional(v.id("boxes")),
  code: v.optional(v.string()),
  // Descriptive.
  label: v.optional(v.string()),
  nickname: v.optional(v.string()),
  description: v.optional(v.string()),
  moveDayNote: v.optional(v.string()),
  status: v.optional(boxStatusValidator),
  // Physical attributes.
  estimatedWeightLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  dimensionsIn: v.optional(
    v.object({
      lengthIn: v.optional(v.number()),
      widthIn: v.optional(v.number()),
      heightIn: v.optional(v.number()),
    }),
  ),
  // Present location (room) — name or id.
  presentRoom: v.optional(v.string()),
  presentRoomId: v.optional(v.id("moveSpaces")),
  clearPresentRoom: v.optional(v.boolean()),
  // Starting / origin room — free-text label stored in the box.room string.
  startingRoom: v.optional(v.string()),
  clearStartingRoom: v.optional(v.boolean()),
  // Destination location (room) — name or id.
  destinationRoom: v.optional(v.string()),
  destinationRoomId: v.optional(v.id("moveSpaces")),
  clearDestinationRoom: v.optional(v.boolean()),
  // Transport + zone — name or id.
  transport: v.optional(v.string()),
  transportId: v.optional(v.id("transportResources")),
  clearTransport: v.optional(v.boolean()),
  zone: v.optional(v.string()),
  zoneId: v.optional(v.id("transportZones")),
  clearZone: v.optional(v.boolean()),
  assignmentLocked: v.optional(v.boolean()),
  assignmentOverrideReason: v.optional(v.string()),
  dryRun: v.optional(v.boolean()),
};
export const updateBox = mutation({
  args: updateBoxArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;

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
      throw new Error(
        "Box not found — pass a valid boxId or code (see list_boxes).",
      );
    }

    const now = Date.now();
    const patch: Partial<Doc<"boxes">> = { updatedAt: now };

    // Descriptive fields.
    if (args.label !== undefined) {
      patch.label = normalizeOptionalText(args.label);
    }
    if (args.nickname !== undefined) {
      patch.nickname = normalizeOptionalText(args.nickname);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.moveDayNote !== undefined) {
      patch.moveDayNote = normalizeOptionalText(args.moveDayNote);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.archivedAt = args.status === "archived" ? now : undefined;
      patch.sealedAt =
        args.status === "sealed" ? (box.sealedAt ?? now) : box.sealedAt;
    }

    // Physical attributes.
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
    }
    if (args.actualWeightLb !== undefined) {
      patch.actualWeightLb = args.actualWeightLb;
    }
    if (args.estimatedVolumeCuFt !== undefined) {
      patch.estimatedVolumeCuFt = args.estimatedVolumeCuFt;
    }
    if (args.dimensionsIn !== undefined) {
      patch.dimensionsIn = args.dimensionsIn;
    }

    // Present location — room.
    if (args.clearPresentRoom) {
      patch.currentSpaceId = undefined;
    } else if (args.presentRoomId || args.presentRoom) {
      patch.currentSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.presentRoomId,
        name: args.presentRoom,
      });
    }

    // Starting / origin room — free-text label in box.room.
    if (args.clearStartingRoom) {
      patch.room = undefined;
    } else if (args.startingRoom !== undefined) {
      patch.room = normalizeOptionalText(args.startingRoom);
    }

    // Destination room.
    if (args.clearDestinationRoom) {
      patch.destinationSpaceId = undefined;
      patch.destinationRoom = undefined;
    } else if (args.destinationRoomId || args.destinationRoom) {
      const destSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.destinationRoomId,
        name: args.destinationRoom,
      });
      patch.destinationSpaceId = destSpaceId;
      if (destSpaceId) {
        const space = await ctx.db.get(destSpaceId);
        if (space?.name) {
          patch.destinationRoom = normalizeOptionalText(space.name);
        }
      }
    }

    // Transport + zone. Determine the effective resource first; a zone only
    // makes sense within a transport. Clearing the transport also clears the
    // zone. Mirrors boxes.update's resource/zone + clear semantics.
    const effectiveResourceId = args.clearTransport
      ? undefined
      : args.transportId || args.transport
        ? await resolveTransportId(ctx, args.moveId, {
            id: args.transportId,
            name: args.transport,
          })
        : box.assignedResourceId;

    if (args.clearTransport) {
      patch.assignedResourceId = undefined;
      patch.assignedZoneId = undefined;
    } else if (args.transportId || args.transport) {
      patch.assignedResourceId = effectiveResourceId;
      // Changing the resource invalidates any prior zone unless a new one is
      // given below.
      patch.assignedZoneId = undefined;
    }

    if (args.clearTransport || args.clearZone) {
      patch.assignedZoneId = undefined;
    } else if (args.zoneId || args.zone) {
      patch.assignedZoneId = await resolveTransportZoneId(
        ctx,
        args.moveId,
        effectiveResourceId,
        { id: args.zoneId, name: args.zone },
      );
    }

    if (args.assignmentLocked !== undefined) {
      patch.assignmentLocked = args.assignmentLocked;
    }
    if (args.assignmentOverrideReason !== undefined) {
      patch.assignmentOverrideReason = normalizeOptionalText(
        args.assignmentOverrideReason,
      );
    }

    // Capacity / load validation — mirror boxes.update. When a transport is (or
    // remains) assigned, run validation over the post-patch field values. When
    // clearing the transport, clear warnings/blocks and stamp validatedAt.
    const nextAssignedResourceId = args.clearTransport
      ? undefined
      : (patch.assignedResourceId ?? box.assignedResourceId);
    // Use `'assignedZoneId' in patch` rather than a nullish fallback: when the
    // transport changes we set patch.assignedZoneId = undefined (line above) to
    // drop the now-invalid prior zone, and `?? box.assignedZoneId` would
    // resurrect that stale zone — making loadAssignmentValidation /
    // assertResourceAndZone throw "Invalid transport zone." So the patched value
    // (including an explicit undefined) must win over the box's stored zone.
    const nextAssignedZoneId =
      args.clearTransport || args.clearZone
        ? undefined
        : "assignedZoneId" in patch
          ? patch.assignedZoneId
          : box.assignedZoneId;

    if (nextAssignedResourceId) {
      const validation = await loadAssignmentValidation(ctx, {
        moveId: args.moveId,
        boxId: box._id,
        assignedResourceId: nextAssignedResourceId,
        assignedZoneId: nextAssignedZoneId,
        dimensionsIn: patch.dimensionsIn ?? box.dimensionsIn,
        estimatedWeightLb: patch.estimatedWeightLb ?? box.estimatedWeightLb,
        actualWeightLb: patch.actualWeightLb ?? box.actualWeightLb,
        estimatedVolumeCuFt:
          patch.estimatedVolumeCuFt ?? box.estimatedVolumeCuFt,
        assignmentOverrideReason:
          patch.assignmentOverrideReason ?? box.assignmentOverrideReason,
        // On a real write, enforce (hard blocks throw, soft warnings require an
        // override reason) — mirrors boxes.update. On dryRun, don't enforce so a
        // preview always returns warnings/hardBlocks as DATA instead of throwing,
        // letting an agent probe whether an override reason is needed before
        // committing.
        enforce: !args.dryRun,
      });
      patch.assignmentWarnings = validation.assignmentWarnings;
      patch.assignmentHardBlocks = validation.assignmentHardBlocks;
      patch.assignmentValidatedAt = validation.assignmentValidatedAt;
    } else if (args.clearTransport) {
      patch.assignmentWarnings = [];
      patch.assignmentHardBlocks = [];
      patch.assignmentValidatedAt = now;
    }

    // Validate resource + zone belong to the move (throws on invalid).
    await assertResourceAndZone(ctx, {
      moveId: args.moveId,
      assignedResourceId: nextAssignedResourceId,
      assignedZoneId: nextAssignedZoneId,
    });

    if (args.dryRun) {
      // Merge the patch over the current box so explicit clears (fields set to
      // undefined in the patch) preview as cleared rather than falling back to
      // the stored value.
      const preview = { ...box, ...patch };
      return {
        dryRun: true as const,
        box: {
          boxId: box._id,
          code: preview.code,
          label: preview.label ?? null,
          room: preview.room ?? null,
          currentSpaceId: preview.currentSpaceId ?? null,
          destinationSpaceId: preview.destinationSpaceId ?? null,
          destinationRoom: preview.destinationRoom ?? null,
          estimatedWeightLb: preview.estimatedWeightLb ?? null,
          actualWeightLb: preview.actualWeightLb ?? null,
          estimatedVolumeCuFt: preview.estimatedVolumeCuFt ?? null,
          dimensionsIn: preview.dimensionsIn ?? null,
          assignedResourceId: nextAssignedResourceId ?? null,
          assignedZoneId: nextAssignedZoneId ?? null,
        },
        assignmentWarnings: patch.assignmentWarnings ?? box.assignmentWarnings ?? [],
        assignmentHardBlocks:
          patch.assignmentHardBlocks ?? box.assignmentHardBlocks ?? [],
      };
    }

    await ctx.db.patch(box._id, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action: "mcp.box_updated",
      objectTable: "boxes",
      objectId: box._id,
      // Mirror boxes.update's audit metadata so the gateway path is as
      // traceable as the UI path.
      metadata: {
        changedKeys: Object.keys(patch),
        ...(patch.status && patch.status !== box.status
          ? { statusFrom: box.status, statusTo: patch.status }
          : {}),
      },
    });

    const updated = await ctx.db.get(box._id);
    return {
      box: {
        boxId: box._id,
        code: updated?.code ?? null,
        label: updated?.label ?? null,
        room: updated?.room ?? null,
        currentSpaceId: updated?.currentSpaceId ?? null,
        destinationSpaceId: updated?.destinationSpaceId ?? null,
        destinationRoom: updated?.destinationRoom ?? null,
        estimatedWeightLb: updated?.estimatedWeightLb ?? null,
        actualWeightLb: updated?.actualWeightLb ?? null,
        estimatedVolumeCuFt: updated?.estimatedVolumeCuFt ?? null,
        dimensionsIn: updated?.dimensionsIn ?? null,
        assignedResourceId: updated?.assignedResourceId ?? null,
        assignedZoneId: updated?.assignedZoneId ?? null,
        assignmentWarnings: updated?.assignmentWarnings ?? [],
        assignmentHardBlocks: updated?.assignmentHardBlocks ?? [],
      },
    };
  },
});

// ---- update_item -----------------------------------------------------------
// Gateway-native mirror of items.update for the physical/measurement +
// location + transport field set. Loose items are movable units just like
// boxes, but the canonical items.update rejects API-key callers (actor.type
// must be "user"), so this rebuilds the same per-field patch + measurement
// provenance + load/capacity validation over the subject bridge
// (requireMoveForSubject + policy.actor.userId). Reuses the EXPORTED
// inferredMeasurementProvenanceForUser/loadItemAssignmentValidation so that
// logic stays single-sourced with the UI editor. Items have no unique code —
// identify the item by itemId only (agents get itemIds from list_items,
// search_inventory, or get_item).
export const updateItemArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  itemId: v.id("items"),
  // Physical / measurements (mirror items.ts itemWriteArgs validators).
  estimatedWeightLb: v.optional(v.number()),
  estimatedWeightLowLb: v.optional(v.number()),
  estimatedWeightHighLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  estimatedPackedVolumeCuFt: v.optional(v.number()),
  dimensionsIn: v.optional(
    v.object({
      lengthIn: v.optional(v.number()),
      widthIn: v.optional(v.number()),
      heightIn: v.optional(v.number()),
    }),
  ),
  weightConfidence: v.optional(estimateConfidenceValidator),
  volumeConfidence: v.optional(estimateConfidenceValidator),
  dimensionsConfidence: v.optional(estimateConfidenceValidator),
  // Present location (room) — where the item physically is now. Name or id.
  presentRoom: v.optional(v.string()),
  presentRoomId: v.optional(v.id("moveSpaces")),
  clearPresentRoom: v.optional(v.boolean()),
  // Starting / origin room — free-text label stored in item.room.
  startingRoom: v.optional(v.string()),
  clearStartingRoom: v.optional(v.boolean()),
  // Destination location (room) — name or id.
  destinationRoom: v.optional(v.string()),
  destinationRoomId: v.optional(v.id("moveSpaces")),
  clearDestinationRoom: v.optional(v.boolean()),
  // Transport + zone — name or id.
  transport: v.optional(v.string()),
  transportId: v.optional(v.id("transportResources")),
  clearTransport: v.optional(v.boolean()),
  zone: v.optional(v.string()),
  zoneId: v.optional(v.id("transportZones")),
  clearZone: v.optional(v.boolean()),
  assignmentLocked: v.optional(v.boolean()),
  assignmentOverrideReason: v.optional(v.string()),
  dryRun: v.optional(v.boolean()),
};
export const updateItem = mutation({
  args: updateItemArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;

    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.moveId !== args.moveId ||
      item.householdId !== args.householdId ||
      item.deletedAt
    ) {
      throw new Error(
        "Item not found — pass a valid itemId (see list_items, search_inventory, or get_item).",
      );
    }

    const now = Date.now();
    const patch: Partial<Doc<"items">> = {
      updatedAt: now,
      updatedByUserId: userId,
    };

    // Physical / measurements — mirror items.update's per-field handling
    // (no normalization/clamping is applied to these in items.update).
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
    }
    if (args.estimatedWeightLowLb !== undefined) {
      patch.estimatedWeightLowLb = args.estimatedWeightLowLb;
    }
    if (args.estimatedWeightHighLb !== undefined) {
      patch.estimatedWeightHighLb = args.estimatedWeightHighLb;
    }
    if (args.actualWeightLb !== undefined) {
      patch.actualWeightLb = args.actualWeightLb;
    }
    if (args.estimatedVolumeCuFt !== undefined) {
      patch.estimatedVolumeCuFt = args.estimatedVolumeCuFt;
    }
    if (args.estimatedPackedVolumeCuFt !== undefined) {
      patch.estimatedPackedVolumeCuFt = args.estimatedPackedVolumeCuFt;
    }
    if (args.dimensionsIn !== undefined) {
      patch.dimensionsIn = args.dimensionsIn;
    }
    if (args.weightConfidence !== undefined) {
      patch.weightConfidence = args.weightConfidence;
    }
    if (args.volumeConfidence !== undefined) {
      patch.volumeConfidence = args.volumeConfidence;
    }
    if (args.dimensionsConfidence !== undefined) {
      patch.dimensionsConfidence = args.dimensionsConfidence;
    }

    // Present location — room (item.currentSpaceId).
    if (args.clearPresentRoom) {
      patch.currentSpaceId = undefined;
    } else if (args.presentRoomId || args.presentRoom) {
      patch.currentSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.presentRoomId,
        name: args.presentRoom,
      });
    }

    // Starting / origin room — free-text label in item.room.
    if (args.clearStartingRoom) {
      patch.room = undefined;
    } else if (args.startingRoom !== undefined) {
      patch.room = normalizeOptionalText(args.startingRoom);
    }

    // Destination room.
    if (args.clearDestinationRoom) {
      patch.destinationSpaceId = undefined;
      patch.destinationRoom = undefined;
    } else if (args.destinationRoomId || args.destinationRoom) {
      const destSpaceId = await resolveSpaceId(ctx, args.moveId, {
        id: args.destinationRoomId,
        name: args.destinationRoom,
      });
      patch.destinationSpaceId = destSpaceId;
      if (destSpaceId) {
        const space = await ctx.db.get(destSpaceId);
        if (space?.name) {
          patch.destinationRoom = normalizeOptionalText(space.name);
        }
      }
    }

    // Transport + zone. Determine the effective resource first; a zone only
    // makes sense within a transport. Clearing the transport also clears the
    // zone. Copies updateBox's resource/zone + clear semantics verbatim.
    const effectiveResourceId = args.clearTransport
      ? undefined
      : args.transportId || args.transport
        ? await resolveTransportId(ctx, args.moveId, {
            id: args.transportId,
            name: args.transport,
          })
        : item.assignedResourceId;

    if (args.clearTransport) {
      patch.assignedResourceId = undefined;
      patch.assignedZoneId = undefined;
    } else if (args.transportId || args.transport) {
      patch.assignedResourceId = effectiveResourceId;
      // Changing the resource invalidates any prior zone unless a new one is
      // given below.
      patch.assignedZoneId = undefined;
    }

    if (args.clearTransport || args.clearZone) {
      patch.assignedZoneId = undefined;
    } else if (args.zoneId || args.zone) {
      patch.assignedZoneId = await resolveTransportZoneId(
        ctx,
        args.moveId,
        effectiveResourceId,
        { id: args.zoneId, name: args.zone },
      );
    }

    if (args.assignmentLocked !== undefined) {
      patch.assignmentLocked = args.assignmentLocked;
    }
    if (args.assignmentOverrideReason !== undefined) {
      patch.assignmentOverrideReason = normalizeOptionalText(
        args.assignmentOverrideReason,
      );
    }

    // Capacity / load validation — mirror items.update. When a transport is (or
    // remains) assigned, run validation over the post-patch field values. When
    // clearing the transport, clear warnings/blocks and stamp validatedAt.
    const nextAssignedResourceId = args.clearTransport
      ? undefined
      : (patch.assignedResourceId ?? item.assignedResourceId);
    // Use `'assignedZoneId' in patch` rather than a nullish fallback: when the
    // transport changes we set patch.assignedZoneId = undefined above to drop
    // the now-invalid prior zone, and `?? item.assignedZoneId` would resurrect
    // that stale zone — making loadItemAssignmentValidation throw "Invalid
    // transport zone." So the patched value (including an explicit undefined)
    // must win over the item's stored zone.
    const nextAssignedZoneId =
      args.clearTransport || args.clearZone
        ? undefined
        : "assignedZoneId" in patch
          ? patch.assignedZoneId
          : item.assignedZoneId;

    if (nextAssignedResourceId) {
      const validation = await loadItemAssignmentValidation(ctx, {
        moveId: args.moveId,
        item: {
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          dimensionsIn: patch.dimensionsIn ?? item.dimensionsIn,
          estimatedWeightLb: patch.estimatedWeightLb ?? item.estimatedWeightLb,
          estimatedWeightLowLb:
            patch.estimatedWeightLowLb ?? item.estimatedWeightLowLb,
          estimatedWeightHighLb:
            patch.estimatedWeightHighLb ?? item.estimatedWeightHighLb,
          actualWeightLb: patch.actualWeightLb ?? item.actualWeightLb,
          estimatedVolumeCuFt:
            patch.estimatedVolumeCuFt ?? item.estimatedVolumeCuFt,
          estimatedPackedVolumeCuFt:
            patch.estimatedPackedVolumeCuFt ?? item.estimatedPackedVolumeCuFt,
          weightConfidence: patch.weightConfidence ?? item.weightConfidence,
          volumeConfidence: patch.volumeConfidence ?? item.volumeConfidence,
          fragility: item.fragility,
          highValue: item.highValue,
          planningDefaultKeys: item.planningDefaultKeys,
          requiresPersonalTransport: item.requiresPersonalTransport,
          hazardousFlag: item.hazardousFlag,
        },
        assignedResourceId: nextAssignedResourceId,
        assignedZoneId: nextAssignedZoneId,
        assignmentOverrideReason:
          patch.assignmentOverrideReason ?? item.assignmentOverrideReason,
        // On a real write, enforce (hard blocks throw, soft warnings require an
        // override reason) — mirrors items.update. On dryRun, don't enforce so a
        // preview returns warnings/hardBlocks as DATA instead of throwing.
        enforce: !args.dryRun,
      });
      patch.assignmentWarnings = validation.assignmentWarnings;
      patch.assignmentHardBlocks = validation.assignmentHardBlocks;
      patch.assignmentValidatedAt = validation.assignmentValidatedAt;
    } else if (args.clearTransport) {
      patch.assignmentWarnings = [];
      patch.assignmentHardBlocks = [];
      patch.assignmentValidatedAt = now;
    }

    // Measurement provenance: replicate items.update — when dimensions/weight/
    // volume changed (and no explicit provenance is passed; the gateway never
    // accepts one), auto-build the provenance entry for the signed-in user.
    const inferredProvenance = inferredMeasurementProvenanceForUser({
      args: patch,
      existing: item,
      userId,
      now,
    });
    if (inferredProvenance) {
      patch.measurementProvenance = inferredProvenance;
    }

    if (args.dryRun) {
      // Merge the patch over the current item so explicit clears (fields set to
      // undefined in the patch) preview as cleared rather than falling back to
      // the stored value.
      const preview = { ...item, ...patch };
      return {
        dryRun: true as const,
        item: {
          itemId: item._id,
          name: preview.name,
          room: preview.room ?? null,
          currentSpaceId: preview.currentSpaceId ?? null,
          destinationSpaceId: preview.destinationSpaceId ?? null,
          destinationRoom: preview.destinationRoom ?? null,
          estimatedWeightLb: preview.estimatedWeightLb ?? null,
          actualWeightLb: preview.actualWeightLb ?? null,
          estimatedVolumeCuFt: preview.estimatedVolumeCuFt ?? null,
          dimensionsIn: preview.dimensionsIn ?? null,
          weightConfidence: preview.weightConfidence ?? null,
          volumeConfidence: preview.volumeConfidence ?? null,
          assignedResourceId: nextAssignedResourceId ?? null,
          assignedZoneId: nextAssignedZoneId ?? null,
        },
        assignmentWarnings:
          patch.assignmentWarnings ?? item.assignmentWarnings ?? [],
        assignmentHardBlocks:
          patch.assignmentHardBlocks ?? item.assignmentHardBlocks ?? [],
      };
    }

    await ctx.db.patch(item._id, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action: "mcp.item_updated",
      objectTable: "items",
      objectId: item._id,
      metadata: {
        changedKeys: Object.keys(patch),
      },
    });

    const updated = await ctx.db.get(item._id);
    return {
      item: {
        itemId: item._id,
        name: updated?.name ?? null,
        room: updated?.room ?? null,
        currentSpaceId: updated?.currentSpaceId ?? null,
        destinationSpaceId: updated?.destinationSpaceId ?? null,
        destinationRoom: updated?.destinationRoom ?? null,
        estimatedWeightLb: updated?.estimatedWeightLb ?? null,
        actualWeightLb: updated?.actualWeightLb ?? null,
        estimatedVolumeCuFt: updated?.estimatedVolumeCuFt ?? null,
        dimensionsIn: updated?.dimensionsIn ?? null,
        weightConfidence: updated?.weightConfidence ?? null,
        volumeConfidence: updated?.volumeConfidence ?? null,
        assignedResourceId: updated?.assignedResourceId ?? null,
        assignedZoneId: updated?.assignedZoneId ?? null,
        assignmentWarnings: updated?.assignmentWarnings ?? [],
        assignmentHardBlocks: updated?.assignmentHardBlocks ?? [],
      },
    };
  },
});

// ---- add_move_participant --------------------------------------------------
// Add a person to the move and choose their access (requirement 6's tool). The
// actor (the user the agent acts as) must be able to manage this move's members,
// and can only grant a role up to their own — no privilege escalation via the
// agent. Pending email invites auto-activate when the invitee signs up.
export const addMoveParticipantArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  email: v.string(),
  name: v.optional(v.string()),
  participantType: v.union(
    v.literal("householdMember"),
    v.literal("helper"),
    v.literal("mover"),
    v.literal("company"),
  ),
  role: v.optional(
    v.union(
      v.literal("admin"),
      v.literal("editor"),
      v.literal("packer"),
      v.literal("viewer"),
      v.literal("guest"),
    ),
  ),
  accessKind: v.optional(
    v.union(v.literal("householdBacked"), v.literal("moveOnly")),
  ),
  canRunMyQueue: v.optional(v.boolean()),
};
export const addMoveParticipant = mutation({
  args: addMoveParticipantArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:manage_members",
    );
    const result = await addMoveParticipantCore(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorUserId: policy.actor.userId,
      actorRole: policy.role,
      actorKind: "agent",
      email: args.email,
      name: args.name,
      participantType: args.participantType,
      role: args.role,
      accessKind: args.accessKind,
      canRunMyQueue: args.canRunMyQueue,
    });
    return {
      participantId: result.participantId,
      status: result.status,
      message:
        result.status === "active"
          ? "Participant added — they already have an account and now have access."
          : "Invite saved — they'll get access automatically when they sign up with that email.",
    };
  },
});
