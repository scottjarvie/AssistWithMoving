import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { anyApi, type FunctionReference } from "convex/server";
import { recordAuditEvent } from "./lib/audit";
import {
  assertShareLinkActive,
  generateShareToken,
  hashShareToken,
  safeShareLinkResult,
  shareLinkActionValidator,
  shareLinkScopeValidator,
  shareLinkStatusValidator,
  shareTokenPreview,
} from "./lib/documentation";
import { requireMovePermission } from "./lib/permissions";
import {
  createShareLinkRecord,
  revokeShareLinkRecord,
  safeShareLinkMetadata,
  type CreateShareLinkRecordArgs,
} from "./lib/shareLinks";

const householdRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

type ShareLinkAccessResult = {
  shareLinkId: Id<"shareLinks">;
  householdId: Id<"households">;
  moveId: Id<"moves">;
  documentationProfileId?: Id<"documentationProfiles">;
  scope: "move" | "profile";
  role: "owner" | "admin" | "editor" | "packer" | "viewer" | "guest";
  allowedActions: Array<
    "view" | "download" | "statusUpdate" | "comment" | "uploadEvidence"
  >;
  expiresAt: number;
  label?: string;
};

const internalMutations = anyApi as unknown as {
  shareLinks: {
    createWithTokenHash: FunctionReference<
      "mutation",
      "internal",
      CreateShareLinkRecordArgs,
      Id<"shareLinks">
    >;
    recordAccessByTokenHash: FunctionReference<
      "mutation",
      "internal",
      { tokenHash: string; accessMetadata?: unknown },
      ShareLinkAccessResult
    >;
  };
};

const internalQueries = anyApi as unknown as {
  publicPackets: {
    getForShareLink: FunctionReference<
      "query",
      "internal",
      ShareLinkAccessResult,
      unknown
    >;
  };
};

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: v.optional(shareLinkStatusValidator),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:manage"
    );

    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
      .collect();

    return links
      .filter((link) => (args.status ? link.status === args.status : true))
      .map((link) => safeShareLinkMetadata(link));
  },
});

export const create = action({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    scope: shareLinkScopeValidator,
    label: v.optional(v.string()),
    role: householdRoleValidator,
    allowedActions: v.optional(v.array(shareLinkActionValidator)),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const token = generateShareToken();
    const tokenHash = await hashShareToken(token);
    const shareLinkId: Id<"shareLinks"> = await ctx.runMutation(
      internalMutations.shareLinks.createWithTokenHash,
      {
        ...args,
        tokenHash,
        tokenPreview: shareTokenPreview(token),
      }
    );

    return safeShareLinkResult({ shareLinkId, token });
  },
});

export const revoke = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    shareLinkId: v.id("shareLinks"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:manage"
    );
    if (actor.type !== "user") throw new Error("Signed-in user context required.");
    await revokeShareLinkRecord(ctx, args, {
      type: "user",
      userId: actor.userId,
    });
  },
});

export const resolveToken = action({
  args: {
    token: v.string(),
    accessMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashShareToken(args.token);
    return await ctx.runMutation(
      internalMutations.shareLinks.recordAccessByTokenHash,
      {
        tokenHash,
        accessMetadata: args.accessMetadata,
      }
    );
  },
});

export const resolvePublicView = action({
  args: {
    token: v.string(),
    accessMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashShareToken(args.token);
    const access = await ctx.runMutation(
      internalMutations.shareLinks.recordAccessByTokenHash,
      {
        tokenHash,
        accessMetadata: args.accessMetadata,
      }
    );

    if (!access.allowedActions.includes("view")) {
      throw new Error("Share link does not allow viewing.");
    }

    return await ctx.runQuery(internalQueries.publicPackets.getForShareLink, access);
  },
});

export const createWithTokenHash = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    scope: shareLinkScopeValidator,
    tokenHash: v.string(),
    tokenPreview: v.string(),
    label: v.optional(v.string()),
    role: householdRoleValidator,
    allowedActions: v.optional(v.array(shareLinkActionValidator)),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:manage"
    );
    if (actor.type !== "user") throw new Error("Signed-in user context required.");
    return await createShareLinkRecord(ctx, args, {
      type: "user",
      userId: actor.userId,
    });
  },
});

export const recordAccessByTokenHash = internalMutation({
  args: {
    tokenHash: v.string(),
    accessMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!link) {
      throw new Error("Share link not found.");
    }

    assertShareLinkActive(link);
    const now = Date.now();
    await ctx.db.patch(link._id, {
      accessCount: link.accessCount + 1,
      lastAccessedAt: now,
      lastAccessMetadata: args.accessMetadata,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: link.householdId,
      moveId: link.moveId,
      actorType: "system",
      category: "shareLink",
      action: "share_link.accessed",
      objectTable: "shareLinks",
      objectId: link._id,
      metadata: {
        scope: link.scope,
        role: link.role,
        tokenPreview: link.tokenPreview,
      },
    });

    return {
      shareLinkId: link._id,
      householdId: link.householdId,
      moveId: link.moveId,
      documentationProfileId: link.documentationProfileId,
      scope: link.scope,
      role: link.role,
      allowedActions: link.allowedActions,
      expiresAt: link.expiresAt,
      label: link.label,
    };
  },
});
