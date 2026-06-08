import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { anyApi, type FunctionReference } from "convex/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  assertShareLinkActive,
  generateShareToken,
  hashShareToken,
  normalizeShareLinkActions,
  safeShareLinkResult,
  shareLinkActionValidator,
  shareLinkScopeValidator,
  shareLinkStatusValidator,
  shareTokenPreview,
} from "./lib/documentation";
import { normalizeOptionalText } from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

const defaultMoveLinkActions = ["view", "download"] as const;
const maxShareLinkLifetimeMs = 366 * 24 * 60 * 60 * 1000;
const householdRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

type CreateWithTokenHashArgs = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  documentationProfileId?: Id<"documentationProfiles">;
  scope: "move" | "profile";
  tokenHash: string;
  tokenPreview: string;
  label?: string;
  role: "owner" | "admin" | "editor" | "packer" | "viewer" | "guest";
  allowedActions?: Array<
    "view" | "download" | "statusUpdate" | "comment" | "uploadEvidence"
  >;
  expiresAt: number;
};

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
};

const internalMutations = anyApi as unknown as {
  shareLinks: {
    createWithTokenHash: FunctionReference<
      "mutation",
      "internal",
      CreateWithTokenHashArgs,
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

    return links.filter((link) => (args.status ? link.status === args.status : true));
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
    if (actor.type !== "user") {
      throw new Error("API-key share link revocation is not implemented yet.");
    }

    const link = await getMutableShareLink(ctx, args);
    const now = Date.now();
    await ctx.db.patch(args.shareLinkId, {
      status: "revoked",
      revokedAt: now,
      revokedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "shareLink",
      action: "share_link.revoked",
      objectTable: "shareLinks",
      objectId: args.shareLinkId,
      metadata: { tokenPreview: link.tokenPreview },
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
    if (actor.type !== "user") {
      throw new Error("API-key share link creation is not implemented yet.");
    }

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "activeShareLinks",
    });

    const now = Date.now();
    if (args.expiresAt <= now) {
      throw new Error("Share link expiration must be in the future.");
    }
    if (args.expiresAt > now + maxShareLinkLifetimeMs) {
      throw new Error("Share link expiration cannot be more than one year out.");
    }
    if (args.scope === "profile" && !args.documentationProfileId) {
      throw new Error("Profile-scoped links need a documentation profile.");
    }

    const profile = args.documentationProfileId
      ? await ctx.db.get(args.documentationProfileId)
      : null;
    if (
      args.documentationProfileId &&
      (!profile ||
        profile.householdId !== args.householdId ||
        profile.moveId !== args.moveId ||
        profile.status === "archived")
    ) {
      throw new Error("Documentation profile not found.");
    }

    const allowedActions = normalizeShareLinkActions(
      args.allowedActions,
      profile?.allowedActions ?? [...defaultMoveLinkActions]
    );
    const shareLinkId = await ctx.db.insert("shareLinks", {
      householdId: args.householdId,
      moveId: args.moveId,
      documentationProfileId: args.documentationProfileId,
      scope: args.scope,
      tokenHash: args.tokenHash,
      tokenPreview: args.tokenPreview,
      label: normalizeOptionalText(args.label),
      role: args.role,
      status: "active",
      allowedActions,
      expiresAt: args.expiresAt,
      accessCount: 0,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "shareLink",
      action: "share_link.created",
      objectTable: "shareLinks",
      objectId: shareLinkId,
      metadata: {
        scope: args.scope,
        role: args.role,
        allowedActions,
        tokenPreview: args.tokenPreview,
      },
    });

    return shareLinkId;
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
    };
  },
});

async function getMutableShareLink(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    shareLinkId: Id<"shareLinks">;
  }
) {
  const link = await ctx.db.get(args.shareLinkId);
  if (!link || link.householdId !== args.householdId || link.moveId !== args.moveId) {
    throw new Error("Share link not found.");
  }
  return link;
}
