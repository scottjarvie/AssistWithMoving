// Convex functions exposed to the user's AI agent through the OAuth MCP gateway
// (convex/mcp.ts registers them; convex/http.ts mounts the gateway). Each takes
// the gateway-injected `caller` and resolves the user from `caller.subject` via
// the identity bridge — NEVER ctx.auth, which is null across the component
// boundary. Phase 1 ships a read-only core; write tools follow the same shape.
import { v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import { query } from "./_generated/server";
import {
  requireHouseholdForSubject,
  requireMoveForSubject,
  requireUserBySubject,
} from "./lib/mcpIdentity";

// Call FIRST: confirms who the agent is acting as and which households/moves it
// can reach, so later calls can pass a real householdId / moveId.
export const getAgentContext = query({
  args: { caller: mcpCallerValidator },
  handler: async (ctx, args) => {
    const user = await requireUserBySubject(ctx, args.caller.subject);

    const memberships = await ctx.db
      .query("householdMemberships")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect();

    const households = (
      await Promise.all(
        memberships.map(async (membership) => {
          const household = await ctx.db.get(membership.householdId);
          if (!household || household.archivedAt !== undefined) {
            return null;
          }
          return {
            householdId: household._id,
            name: household.name,
            role: membership.role,
          };
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return {
      clerkUserId: user.clerkUserId,
      households,
      hint:
        households.length === 0
          ? "No households yet — create one in the app first."
          : "Use a householdId from this list when calling other tools.",
    };
  },
});

const READ_LIMIT = 200;

// List the active (non-archived) moves in a household the caller can read.
export const listMovesForHousehold = query({
  args: {
    caller: mcpCallerValidator,
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    await requireHouseholdForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      "household:read",
    );

    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", args.householdId),
      )
      .take(READ_LIMIT);

    return moves
      .filter((move) => move.status !== "archived")
      .map((move) => ({
        moveId: move._id,
        title: move.title,
        type: move.type,
        status: move.status,
        origin: move.origin ?? null,
        destination: move.destination ?? null,
      }));
  },
});

// Basic facts about one move the caller can read.
export const getMoveSummary = query({
  args: {
    caller: mcpCallerValidator,
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:read",
    );

    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found in this household.");
    }

    return {
      moveId: move._id,
      title: move.title,
      type: move.type,
      status: move.status,
      origin: move.origin ?? null,
      destination: move.destination ?? null,
      unitSystem: move.unitSystem,
      documentationProfileTypes: move.documentationProfileTypes ?? [],
    };
  },
});

// Rooms / spaces in a move. Read-only; non-sensitive fields only.
export const listMoveSpaces = query({
  args: {
    caller: mcpCallerValidator,
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:read",
    );
    // Filter tombstones at the DB level so archived rows don't eat the budget,
    // and over-fetch by one to detect truncation.
    const spaces = await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .take(READ_LIMIT + 1);
    const truncated = spaces.length > READ_LIMIT;
    return {
      truncated,
      spaces: spaces.slice(0, READ_LIMIT).map((space) => ({
        spaceId: space._id,
        name: space.name,
        kind: space.kind,
        status: space.status,
        floorLevel: space.floorLevel ?? null,
      })),
    };
  },
});

// Inventory items in a move. Read-only; sensitive fields (value, serial,
// private notes) are intentionally omitted regardless of role.
export const listItems = query({
  args: {
    caller: mcpCallerValidator,
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    // Filter tombstones at the DB level so deleted rows don't eat the budget,
    // and over-fetch by one to detect truncation.
    const items = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(READ_LIMIT + 1);
    const truncated = items.length > READ_LIMIT;
    return {
      truncated,
      items: items.slice(0, READ_LIMIT).map((item) => ({
        itemId: item._id,
        name: item.name,
        room: item.room ?? null,
        category: item.category ?? null,
        quantity: item.quantity,
        disposition: item.disposition,
        status: item.status,
        needsReview: item.needsReview,
      })),
    };
  },
});

// Boxes / containers in a move. Read-only.
export const listBoxes = query({
  args: {
    caller: mcpCallerValidator,
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    // Filter tombstones at the DB level so archived rows don't eat the budget,
    // and over-fetch by one to detect truncation.
    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .take(READ_LIMIT + 1);
    const truncated = boxes.length > READ_LIMIT;
    return {
      truncated,
      boxes: boxes.slice(0, READ_LIMIT).map((box) => ({
        boxId: box._id,
        code: box.code,
        label: box.label ?? null,
        room: box.room ?? null,
        destinationRoom: box.destinationRoom ?? null,
        status: box.status,
      })),
    };
  },
});
