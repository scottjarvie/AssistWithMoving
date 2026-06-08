import { v } from "convex/values";

import type { Id, TableNames } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";

const defaultMoveTitlePrefix = "E2E PCS move ";
const defaultHouseholdNamePrefix = "E2E household ";
const defaultApiKeyNamePrefix = "E2E local agent ";

const itemStatuses = [
  "draft",
  "active",
  "packed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
  "archived",
] as const;
const boxStatuses = [
  "open",
  "packing",
  "sealed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
  "archived",
] as const;
const documentationProfileStatuses = ["draft", "active", "archived"] as const;
const shareLinkStatuses = ["active", "revoked"] as const;
const photoUploadSessionStatuses = [
  "authorized",
  "completed",
  "cancelled",
  "failed",
] as const;
const membershipStatuses = ["active", "invited", "disabled"] as const;
const householdRoles = [
  "owner",
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
] as const;

type CleanupCounts = {
  households: number;
  householdBillingProfiles: number;
  householdMemberships: number;
  moves: number;
  moveRoleGrants: number;
  movePeople: number;
  movePlanningDefaults: number;
  transportResources: number;
  transportZones: number;
  items: number;
  boxes: number;
  boxItems: number;
  itemPhotos: number;
  photoUploadSessions: number;
  documentationProfiles: number;
  shareLinks: number;
  exportJobs: number;
  apiKeys: number;
  apiIdempotencyKeys: number;
  aiJobs: number;
  aiTextSuggestions: number;
  aiPhotoSuggestions: number;
  aiPlanningSuggestions: number;
  auditLogs: number;
};

export const cleanupE2eDataForCurrentUser = mutation({
  args: {
    moveTitlePrefix: v.optional(v.string()),
    householdNamePrefix: v.optional(v.string()),
    apiKeyNamePrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDevDeployment();
    const user = await requireCurrentUser(ctx);
    const moveTitlePrefix = safeE2ePrefix(
      args.moveTitlePrefix,
      defaultMoveTitlePrefix,
      "move title"
    );
    const householdNamePrefix = safeE2ePrefix(
      args.householdNamePrefix,
      defaultHouseholdNamePrefix,
      "household name"
    );
    const apiKeyNamePrefix = safeE2ePrefix(
      args.apiKeyNamePrefix,
      defaultApiKeyNamePrefix,
      "API key name"
    );
    const counts = emptyCounts();

    const targetMoves = (
      await ctx.db
        .query("moves")
        .withIndex("by_created_by", (q) => q.eq("createdByUserId", user._id))
        .collect()
    ).filter((move) => move.title.startsWith(moveTitlePrefix));
    const targetMoveIds = new Set(targetMoves.map((move) => String(move._id)));

    await cleanupApiKeys(ctx, {
      userId: user._id,
      apiKeyNamePrefix,
      targetMoveIds,
      counts,
    });

    for (const move of targetMoves) {
      await cleanupMove(ctx, move._id, move.householdId, counts);
    }

    const targetHouseholds = (
      await ctx.db
        .query("households")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
        .collect()
    ).filter((household) => household.name.startsWith(householdNamePrefix));

    for (const household of targetHouseholds) {
      await cleanupHousehold(ctx, household._id, counts);
    }

    if (
      user.defaultHouseholdId &&
      targetHouseholds.some(
        (household) => household._id === user.defaultHouseholdId
      )
    ) {
      await ctx.db.patch(user._id, {
        defaultHouseholdId: undefined,
        updatedAt: Date.now(),
      });
    }

    return counts;
  },
});

function assertDevDeployment() {
  if (!process.env.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
    throw new Error("E2E cleanup is only available in Convex dev deployments.");
  }
}

function safeE2ePrefix(value: string | undefined, fallback: string, label: string) {
  const prefix = value ?? fallback;
  if (!prefix.startsWith("E2E ")) {
    throw new Error(`Refusing to clean non-E2E ${label} records.`);
  }
  return prefix;
}

function emptyCounts(): CleanupCounts {
  return {
    households: 0,
    householdBillingProfiles: 0,
    householdMemberships: 0,
    moves: 0,
    moveRoleGrants: 0,
    movePeople: 0,
    movePlanningDefaults: 0,
    transportResources: 0,
    transportZones: 0,
    items: 0,
    boxes: 0,
    boxItems: 0,
    itemPhotos: 0,
    photoUploadSessions: 0,
    documentationProfiles: 0,
    shareLinks: 0,
    exportJobs: 0,
    apiKeys: 0,
    apiIdempotencyKeys: 0,
    aiJobs: 0,
    aiTextSuggestions: 0,
    aiPhotoSuggestions: 0,
    aiPlanningSuggestions: 0,
    auditLogs: 0,
  };
}

async function cleanupApiKeys(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    apiKeyNamePrefix: string;
    targetMoveIds: Set<string>;
    counts: CleanupCounts;
  }
) {
  const apiKeys = (
    await ctx.db
      .query("apiKeys")
      .withIndex("by_created_by", (q) => q.eq("createdByUserId", args.userId))
      .collect()
  ).filter(
    (apiKey) =>
      apiKey.name.startsWith(args.apiKeyNamePrefix) ||
      (apiKey.moveId ? args.targetMoveIds.has(String(apiKey.moveId)) : false)
  );

  for (const apiKey of apiKeys) {
    args.counts.apiIdempotencyKeys += await deleteDocs(
      ctx,
      await ctx.db
        .query("apiIdempotencyKeys")
        .withIndex("by_api_key_key", (q) => q.eq("apiKeyId", apiKey._id))
        .collect()
    );
  }
  args.counts.apiKeys += await deleteDocs(ctx, apiKeys);
}

async function cleanupMove(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  householdId: Id<"households">,
  counts: CleanupCounts
) {
  counts.boxItems += await deleteDocs(
    ctx,
    await ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", moveId))
      .collect()
  );

  for (const status of itemStatuses) {
    counts.items += await deleteDocs(
      ctx,
      await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", moveId).eq("status", status)
        )
        .collect()
    );
  }

  for (const status of boxStatuses) {
    counts.boxes += await deleteDocs(
      ctx,
      await ctx.db
        .query("boxes")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", moveId).eq("status", status)
        )
        .collect()
    );
  }

  counts.itemPhotos += await deleteDocs(
    ctx,
    await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );

  for (const status of photoUploadSessionStatuses) {
    counts.photoUploadSessions += await deleteDocs(
      ctx,
      await ctx.db
        .query("photoUploadSessions")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", moveId).eq("status", status)
        )
        .collect()
    );
  }

  for (const status of documentationProfileStatuses) {
    counts.documentationProfiles += await deleteDocs(
      ctx,
      await ctx.db
        .query("documentationProfiles")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", moveId).eq("status", status)
        )
        .collect()
    );
  }

  for (const status of shareLinkStatuses) {
    counts.shareLinks += await deleteDocs(
      ctx,
      await ctx.db
        .query("shareLinks")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", moveId).eq("status", status)
        )
        .collect()
    );
  }

  counts.exportJobs += await deleteDocs(
    ctx,
    await ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.aiTextSuggestions += await deleteDocs(
    ctx,
    await ctx.db
      .query("aiTextSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.aiPhotoSuggestions += await deleteDocs(
    ctx,
    await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.aiPlanningSuggestions += await deleteDocs(
    ctx,
    await ctx.db
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.aiJobs += await deleteDocs(
    ctx,
    await ctx.db
      .query("aiJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.moveRoleGrants += await deleteDocs(
    ctx,
    await ctx.db
      .query("moveRoleGrants")
      .withIndex("by_household_move", (q) =>
        q.eq("householdId", householdId).eq("moveId", moveId)
      )
      .collect()
  );
  counts.movePeople += await deleteDocs(
    ctx,
    await ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.movePlanningDefaults += await deleteDocs(
    ctx,
    await ctx.db
      .query("movePlanningDefaults")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.transportZones += await deleteDocs(
    ctx,
    await ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.transportResources += await deleteDocs(
    ctx,
    await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect()
  );
  counts.auditLogs += await deleteDocs(
    ctx,
    await ctx.db
      .query("auditLogs")
      .withIndex("by_move_time", (q) => q.eq("moveId", moveId))
      .collect()
  );

  await ctx.db.delete(moveId);
  counts.moves += 1;
}

async function cleanupHousehold(
  ctx: MutationCtx,
  householdId: Id<"households">,
  counts: CleanupCounts
) {
  for (const status of shareLinkStatuses) {
    counts.shareLinks += await deleteDocs(
      ctx,
      await ctx.db
        .query("shareLinks")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", householdId).eq("status", status)
        )
        .collect()
    );
  }

  for (const status of shareLinkStatuses) {
    counts.apiKeys += await deleteDocs(
      ctx,
      await ctx.db
        .query("apiKeys")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", householdId).eq("status", status)
        )
        .collect()
    );
  }

  counts.householdBillingProfiles += await deleteDocs(
    ctx,
    await ctx.db
      .query("householdBillingProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect()
  );

  for (const status of membershipStatuses) {
    for (const role of householdRoles) {
      counts.householdMemberships += await deleteDocs(
        ctx,
        await ctx.db
          .query("householdMemberships")
          .withIndex("by_household_status_role", (q) =>
            q.eq("householdId", householdId).eq("status", status).eq("role", role)
          )
          .collect()
      );
    }
  }

  counts.auditLogs += await deleteDocs(
    ctx,
    await ctx.db
      .query("auditLogs")
      .withIndex("by_household_time", (q) => q.eq("householdId", householdId))
      .collect()
  );

  await ctx.db.delete(householdId);
  counts.households += 1;
}

async function deleteDocs<TableName extends TableNames>(
  ctx: MutationCtx,
  docs: { _id: Id<TableName> }[]
) {
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}
