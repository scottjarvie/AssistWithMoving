import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCurrentUser } from "./lib/auth";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { resolveMoveAccess } from "./lib/moveAccess";

export const listReceipts = query({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const user = await requireCurrentUser(ctx);
    const page = await ctx.db.query("auditLogs").withIndex("by_actor_user_time", q => q.eq("actorUserId", user._id))
      .order("desc").paginate({ numItems: 25, cursor: args.cursor ?? null });
    return { ...page, page: page.page.filter(row => row.objectTable === "aiGrants" || row.objectTable === "apiKeys") };
  },
});

/** Settings never depends on the unbounded household dashboard query. */
export const listHouseholdChoices = query({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const user = await requireCurrentUser(ctx);
    const page = await ctx.db.query("householdMemberships")
      .withIndex("by_user_status", q => q.eq("userId", user._id).eq("status", "active"))
      .paginate({ numItems: 25, cursor: args.cursor ?? null });
    const households = [];
    for (const membership of page.page) {
      const household = await ctx.db.get(membership.householdId);
      if (household && household.archivedAt === undefined) households.push({ household: { _id: household._id, name: household.name }, role: membership.role });
    }
    return { households, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

/** Bounded choices for members and move-only owners; never household-only data. */
export const listRecoveryHouseholds = query({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const user = await requireCurrentUser(ctx);
    if (user.status !== "active") throw new ConvexError("An active profile is required to recover a connection.");
    const page = await ctx.db.query("moveParticipants")
      .withIndex("by_user_status", q => q.eq("userId", user._id).eq("status", "active"))
      .paginate({ numItems: 25, cursor: args.cursor ?? null });
    const households = new Map<Id<"households">, { householdId: Id<"households">; label: string; moveId: Id<"moves"> }>();
    for (const participant of page.page) {
      if (participant.accessKind !== "moveOnly") continue;
      const move = await ctx.db.get(participant.moveId);
      if (!move || move.householdId !== participant.householdId || move.status === "archived" || move.archivedAt !== undefined) continue;
      const household = await ctx.db.get(participant.householdId);
      if (!household || household.archivedAt !== undefined) continue;
      await resolveMoveAccess(ctx, user._id, participant.householdId, move._id);
      // A participant can see this move title, never the household's profile.
      households.set(participant.householdId, { householdId: participant.householdId, label: `Move: ${move.title}`, moveId: move._id });
    }
    return { households: [...households.values()], nextCursor: page.isDone ? null : page.continueCursor };
  },
});

/** Bounded choices for members and move-only owners; never household-only data. */
export const listMoveChoices = query({
  args: { householdId: v.id("households"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const user = await requireCurrentUser(ctx);
    const household = await ctx.db.get(args.householdId);
    if (!household || household.archivedAt !== undefined) return { moves: [], nextCursor: null };
    const membership = await ctx.db.query("householdMemberships")
      .withIndex("by_household_user", q => q.eq("householdId", args.householdId).eq("userId", user._id)).unique();
    if (membership?.status === "active") {
      const page = await ctx.db.query("moves").withIndex("by_household_status", q => q.eq("householdId", args.householdId))
        .paginate({ numItems: 25, cursor: args.cursor ?? null });
      return { moves: page.page.filter(move => move.status !== "archived" && move.archivedAt === undefined).map(move => ({ moveId: move._id, title: move.title, status: move.status })), nextCursor: page.isDone ? null : page.continueCursor };
    }
    const page = await ctx.db.query("moveParticipants")
      .withIndex("by_user_household_status", q => q.eq("userId", user._id).eq("householdId", args.householdId).eq("status", "active"))
      .paginate({ numItems: 25, cursor: args.cursor ?? null });
    const moves = [];
    for (const participant of page.page) {
      if (participant.accessKind !== "moveOnly") continue;
      const move = await ctx.db.get(participant.moveId);
      if (!move || move.householdId !== args.householdId || move.status === "archived" || move.archivedAt !== undefined) continue;
      await resolveMoveAccess(ctx, user._id, args.householdId, move._id);
      moves.push({ moveId: move._id, title: move.title, status: move.status });
    }
    return { moves, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

