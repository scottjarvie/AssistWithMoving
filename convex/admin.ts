import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireAppAdmin, recordAdminAccess } from "./lib/admin";
import {
  clampLimit,
  countBy,
  matchesAdminSearch,
  safeAuditSummary,
  safeHouseholdSummary,
  safeMoveSummary,
  safeUserSummary,
  sumBy,
} from "./lib/adminSummaries";

const overviewSampleLimit = 1000;

export const overview = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAppAdmin(ctx);
    const now = Date.now();
    const [
      users,
      households,
      moves,
      items,
      boxes,
      photos,
      uploadSessions,
      exportJobs,
      aiJobs,
      apiKeys,
      shareLinks,
      adminAudits,
      apiAudits,
      exportAudits,
      aiAudits,
    ] = await Promise.all([
      boundedCollect(ctx.db.query("users")),
      boundedCollect(ctx.db.query("households")),
      boundedCollect(ctx.db.query("moves")),
      boundedCollect(ctx.db.query("items")),
      boundedCollect(ctx.db.query("boxes")),
      boundedCollect(ctx.db.query("itemPhotos")),
      boundedCollect(ctx.db.query("photoUploadSessions")),
      boundedCollect(ctx.db.query("exportJobs")),
      boundedCollect(ctx.db.query("aiJobs")),
      boundedCollect(ctx.db.query("apiKeys")),
      boundedCollect(ctx.db.query("shareLinks")),
      recentAuditsByCategory(ctx, "admin", 10),
      recentAuditsByCategory(ctx, "apiKey", 8),
      recentAuditsByCategory(ctx, "export", 8),
      recentAuditsByCategory(ctx, "ai", 8),
    ]);

    const usersRows = users.rows;
    const householdRows = households.rows;
    const moveRows = moves.rows;
    const itemRows = items.rows;
    const boxRows = boxes.rows;
    const photoRows = photos.rows;
    const uploadSessionRows = uploadSessions.rows;
    const exportJobRows = exportJobs.rows;
    const aiJobRows = aiJobs.rows;
    const apiKeyRows = apiKeys.rows;
    const shareLinkRows = shareLinks.rows;
    const recentAudit = [...adminAudits, ...apiAudits, ...exportAudits, ...aiAudits]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 18)
      .map(safeAuditSummary);

    await recordAdminAccess(ctx, admin, "admin.dashboard_viewed", {
      visibleCounts: {
        users: usersRows.length,
        households: householdRows.length,
        moves: moveRows.length,
        hasLowerBounds:
          users.hasMore || households.hasMore || moves.hasMore,
      },
    });

    const totals = {
      users: usersRows.length,
      activeUsers: usersRows.filter((user) => user.status === "active").length,
      adminUsers: usersRows.filter((user) => user.appRole === "admin").length,
      households: householdRows.length,
      activeHouseholds: householdRows.filter(
        (household) => household.archivedAt === undefined
      ).length,
      moves: moveRows.length,
      activeMoves: moveRows.filter((move) => move.status !== "archived").length,
      items: itemRows.length,
      boxes: boxRows.length,
      photos: photoRows.length,
      photoBytes: sumBy(photoRows, (photo) => photo.sizeBytes),
      uploadSessions: uploadSessionRows.length,
      exportJobs: exportJobRows.length,
      exportBytes: sumBy(exportJobRows, (job) => job.sizeBytes),
      aiJobs: aiJobRows.length,
      aiEstimatedCents: sumBy(aiJobRows, (job) => job.cost?.estimatedCents),
      activeApiKeys: apiKeyRows.filter((key) => key.status === "active").length,
      activeShareLinks: shareLinkRows.filter(
        (link) => link.status === "active" && link.expiresAt > now
      ).length,
    };
    const totalMeta = {
      users: sampleMeta(users),
      activeUsers: sampleMeta(users),
      adminUsers: sampleMeta(users),
      households: sampleMeta(households),
      activeHouseholds: sampleMeta(households),
      moves: sampleMeta(moves),
      activeMoves: sampleMeta(moves),
      items: sampleMeta(items),
      boxes: sampleMeta(boxes),
      photos: sampleMeta(photos),
      photoBytes: sampleMeta(photos),
      uploadSessions: sampleMeta(uploadSessions),
      exportJobs: sampleMeta(exportJobs),
      exportBytes: sampleMeta(exportJobs),
      aiJobs: sampleMeta(aiJobs),
      aiEstimatedCents: sampleMeta(aiJobs),
      activeApiKeys: sampleMeta(apiKeys),
      activeShareLinks: sampleMeta(shareLinks),
    };

    return {
      generatedAt: now,
      currentAdmin: safeUserSummary(admin),
      totals,
      totalMeta,
      distributions: {
        usersByStatus: countBy(usersRows, (user) => user.status),
        usersByRole: countBy(usersRows, (user) => user.appRole),
        movesByStatus: countBy(moveRows, (move) => move.status),
        movesByType: countBy(moveRows, (move) => move.type),
        exportsByStatus: countBy(exportJobRows, (job) => job.status),
        aiJobsByStatus: countBy(aiJobRows, (job) => job.status),
        apiKeysByStatus: countBy(apiKeyRows, (key) => key.status),
        shareLinksByStatus: countBy(shareLinkRows, (link) => link.status),
      },
      recentAudit,
    };
  },
});

export const search = mutation({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const query = args.query.trim();
    const limit = clampLimit(args.limit, 8, 20);

    if (query.length < 2) {
      return {
        query,
        users: [],
        households: [],
        moves: [],
        searchMeta: {
          sampledTables: {},
          isPotentiallyIncomplete: false,
        },
      };
    }

    const [users, households, moves] = await Promise.all([
      boundedCollect(ctx.db.query("users")),
      boundedCollect(ctx.db.query("households")),
      boundedCollect(ctx.db.query("moves")),
    ]);
    const userRows = users.rows;
    const householdRows = households.rows;
    const moveRows = moves.rows;

    const matchingUsers = userRows
      .filter((user) =>
        matchesAdminSearch(query, [user._id, user.email, user.name])
      )
      .slice(0, limit)
      .map(safeUserSummary);
    const matchingHouseholds = householdRows
      .filter((household) =>
        matchesAdminSearch(query, [
          household._id,
          household.name,
          household.slug,
          household.ownerUserId,
        ])
      )
      .slice(0, limit)
      .map(safeHouseholdSummary);
    const matchingMoves = moveRows
      .filter((move) =>
        matchesAdminSearch(query, [
          move._id,
          move.householdId,
          move.title,
          move.type,
          move.status,
          move.origin,
          move.destination,
        ])
      )
      .slice(0, limit)
      .map(safeMoveSummary);

    await recordAdminAccess(ctx, admin, "admin.search_performed", {
      queryLength: query.length,
      results: {
        users: matchingUsers.length,
        households: matchingHouseholds.length,
        moves: matchingMoves.length,
      },
      sampledTables: {
        users: sampleMeta(users),
        households: sampleMeta(households),
        moves: sampleMeta(moves),
      },
    });

    const sampledTables = {
      users: sampleMeta(users),
      households: sampleMeta(households),
      moves: sampleMeta(moves),
    };

    return {
      query,
      users: matchingUsers,
      households: matchingHouseholds,
      moves: matchingMoves,
      searchMeta: {
        sampledTables,
        isPotentiallyIncomplete: Object.values(sampledTables).some(
          (meta) => meta.isLowerBound
        ),
      },
    };
  },
});

export const getUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    const [memberships, ownedHouseholds, createdMoves, recentAudit] =
      await Promise.all([
        membershipsForUser(ctx, args.userId),
        ctx.db
          .query("households")
          .withIndex("by_owner", (q) => q.eq("ownerUserId", args.userId))
          .collect(),
        ctx.db
          .query("moves")
          .withIndex("by_created_by", (q) => q.eq("createdByUserId", args.userId))
          .collect(),
        ctx.db
          .query("auditLogs")
          .withIndex("by_actor_user_time", (q) =>
            q.eq("actorUserId", args.userId)
          )
          .order("desc")
          .take(20),
      ]);

    const membershipSummaries = await Promise.all(
      memberships.map(async (membership) => {
        const household = await ctx.db.get(membership.householdId);
        return {
          id: membership._id,
          householdId: membership.householdId,
          householdName: household?.name ?? "Deleted household",
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        };
      })
    );

    await recordAdminAccess(
      ctx,
      admin,
      "admin.user_viewed",
      { targetUserId: args.userId },
      { table: "users", id: args.userId }
    );

    return {
      kind: "user" as const,
      user: safeUserSummary(user),
      counts: {
        memberships: memberships.length,
        activeMemberships: memberships.filter(
          (membership) => membership.status === "active"
        ).length,
        ownedHouseholds: ownedHouseholds.length,
        createdMoves: createdMoves.length,
      },
      memberships: membershipSummaries,
      ownedHouseholds: ownedHouseholds.map(safeHouseholdSummary),
      createdMoves: createdMoves.map(safeMoveSummary),
      recentAudit: recentAudit.map(safeAuditSummary),
    };
  },
});

export const getHousehold = mutation({
  args: {
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const household = await ctx.db.get(args.householdId);
    if (!household) {
      return null;
    }

    const [
      memberships,
      moves,
      items,
      boxes,
      photos,
      exportJobs,
      aiJobs,
      apiKeys,
      shareLinks,
      recentAudit,
    ] = await Promise.all([
      ctx.db
        .query("householdMemberships")
        .withIndex("by_household_status_role", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("moves")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
        .collect(),
      ctx.db
        .query("exportJobs")
        .withIndex("by_household_created", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_household_created", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("apiKeys")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("shareLinks")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId)
        )
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_household_time", (q) =>
          q.eq("householdId", args.householdId)
        )
        .order("desc")
        .take(25),
    ]);

    const memberSummaries = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          id: membership._id,
          userId: membership.userId,
          userEmail: user?.email,
          userName: user?.name,
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        };
      })
    );

    await recordAdminAccess(
      ctx,
      admin,
      "admin.household_viewed",
      { householdId: args.householdId },
      { table: "households", id: args.householdId }
    );

    return {
      kind: "household" as const,
      household: safeHouseholdSummary(household),
      counts: {
        memberships: memberships.length,
        activeMemberships: memberships.filter(
          (membership) => membership.status === "active"
        ).length,
        moves: moves.length,
        activeMoves: moves.filter((move) => move.status !== "archived").length,
        items: items.length,
        boxes: boxes.length,
        photos: photos.length,
        photoBytes: sumBy(photos, (photo) => photo.sizeBytes),
        exportJobs: exportJobs.length,
        exportBytes: sumBy(exportJobs, (job) => job.sizeBytes),
        aiJobs: aiJobs.length,
        aiEstimatedCents: sumBy(aiJobs, (job) => job.cost?.estimatedCents),
        activeApiKeys: apiKeys.filter((key) => key.status === "active").length,
        activeShareLinks: shareLinks.filter(
          (link) => link.status === "active" && link.expiresAt > Date.now()
        ).length,
      },
      distributions: {
        membershipsByRole: countBy(memberships, (membership) => membership.role),
        movesByStatus: countBy(moves, (move) => move.status),
        movesByType: countBy(moves, (move) => move.type),
        aiJobsByStatus: countBy(aiJobs, (job) => job.status),
      },
      members: memberSummaries,
      moves: moves.map(safeMoveSummary),
      recentAudit: recentAudit.map(safeAuditSummary),
    };
  },
});

export const getMove = mutation({
  args: {
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const move = await ctx.db.get(args.moveId);
    if (!move) {
      return null;
    }

    const [
      household,
      items,
      boxes,
      boxItems,
      photos,
      uploadSessions,
      exportJobs,
      aiJobs,
      apiKeys,
      shareLinks,
      recentAudit,
    ] = await Promise.all([
      ctx.db.get(move.householdId),
      ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("photoUploadSessions")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("exportJobs")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("aiJobs")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("apiKeys")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("shareLinks")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_move_time", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .take(25),
    ]);

    await recordAdminAccess(
      ctx,
      admin,
      "admin.move_viewed",
      { moveId: args.moveId, householdId: move.householdId },
      { table: "moves", id: args.moveId }
    );

    return {
      kind: "move" as const,
      move: safeMoveSummary(move),
      household: household ? safeHouseholdSummary(household) : null,
      counts: {
        items: items.length,
        boxes: boxes.length,
        assignments: boxItems.length,
        photos: photos.length,
        photoBytes: sumBy(photos, (photo) => photo.sizeBytes),
        uploadSessions: uploadSessions.length,
        exportJobs: exportJobs.length,
        exportBytes: sumBy(exportJobs, (job) => job.sizeBytes),
        aiJobs: aiJobs.length,
        aiEstimatedCents: sumBy(aiJobs, (job) => job.cost?.estimatedCents),
        activeApiKeys: apiKeys.filter((key) => key.status === "active").length,
        activeShareLinks: shareLinks.filter(
          (link) => link.status === "active" && link.expiresAt > Date.now()
        ).length,
      },
      distributions: {
        itemsByStatus: countBy(items, (item) => item.status),
        boxesByStatus: countBy(boxes, (box) => box.status),
        photosByPrivacy: countBy(photos, (photo) => photo.privacyLevel),
        exportsByStatus: countBy(exportJobs, (job) => job.status),
        aiJobsByStatus: countBy(aiJobs, (job) => job.status),
      },
      recentAudit: recentAudit.map(safeAuditSummary),
    };
  },
});

type TakeQuery<T> = {
  take: (limit: number) => Promise<T[]>;
};

type BoundedRows<T> = {
  rows: T[];
  hasMore: boolean;
  limit: number;
};

async function boundedCollect<T>(
  query: TakeQuery<T>,
  limit = overviewSampleLimit
): Promise<BoundedRows<T>> {
  const rows = await query.take(limit + 1);
  return {
    rows: rows.slice(0, limit),
    hasMore: rows.length > limit,
    limit,
  };
}

function sampleMeta(sample: BoundedRows<unknown>) {
  return {
    isLowerBound: sample.hasMore,
    sampleSize: sample.rows.length,
    limit: sample.limit,
  };
}

async function recentAuditsByCategory(
  ctx: MutationCtx,
  category: Doc<"auditLogs">["category"],
  limit: number
) {
  return await ctx.db
    .query("auditLogs")
    .withIndex("by_category_time", (q) => q.eq("category", category))
    .order("desc")
    .take(limit);
}

async function membershipsForUser(ctx: MutationCtx, userId: Id<"users">) {
  const statuses: Doc<"householdMemberships">["status"][] = [
    "active",
    "invited",
    "disabled",
  ];
  const membershipGroups = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("householdMemberships")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", status)
        )
        .collect()
    )
  );

  return membershipGroups.flat();
}
