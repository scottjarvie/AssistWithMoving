import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
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
import {
  assertPublicShareCanStatusUpdate,
  publicShareBoxVisibleToProfile,
  publicShareItemVisibleToProfile,
} from "./lib/publicShareStatus";
import {
  assertPublicShareCanComment,
  normalizePublicShareComment,
  normalizePublicShareCommentAuthor,
} from "./lib/publicShareComments";
import {
  boxStatusValidator,
  itemStatusValidator,
} from "./lib/moveFields";

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

type PublicStatusTarget =
  | {
      type: "item";
      itemId: Id<"items">;
      status: Doc<"items">["status"];
    }
  | {
      type: "box";
      boxId: Id<"boxes">;
      status: Doc<"boxes">["status"];
    };

const publicStatusTargetValidator = v.union(
  v.object({
    type: v.literal("item"),
    itemId: v.id("items"),
    status: itemStatusValidator,
  }),
  v.object({
    type: v.literal("box"),
    boxId: v.id("boxes"),
    status: boxStatusValidator,
  })
);

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
    updateStatusByTokenHash: FunctionReference<
      "mutation",
      "internal",
      {
        tokenHash: string;
        target: PublicStatusTarget;
        accessMetadata?: unknown;
      },
      {
        targetType: "item" | "box";
        targetId: string;
        previousStatus: string;
        nextStatus: string;
        changed: boolean;
      }
    >;
    createCommentByTokenHash: FunctionReference<
      "mutation",
      "internal",
      {
        tokenHash: string;
        body: string;
        authorLabel?: string;
        accessMetadata?: unknown;
      },
      {
        commentId: Id<"shareLinkComments">;
        body: string;
        authorLabel?: string;
        createdAt: number;
      }
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

export const listCommentsForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read"
    );

    const limit = Math.min(Math.max(args.limit ?? 8, 1), 25);
    const comments = await ctx.db
      .query("shareLinkComments")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return await Promise.all(
      comments
        .filter((comment) => comment.householdId === args.householdId)
        .map(async (comment) => {
          const [link, profile] = await Promise.all([
            ctx.db.get(comment.shareLinkId),
            ctx.db.get(comment.documentationProfileId),
          ]);
          return {
            _id: comment._id,
            shareLinkId: comment.shareLinkId,
            documentationProfileId: comment.documentationProfileId,
            profileName: profile?.name,
            shareLabel: link?.label,
            tokenPreview: comment.tokenPreview,
            role: comment.role,
            authorLabel: comment.authorLabel,
            body: comment.body,
            createdAt: comment.createdAt,
          };
        })
    );
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

export const updatePublicStatus = action({
  args: {
    token: v.string(),
    target: publicStatusTargetValidator,
    accessMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashShareToken(args.token);
    return await ctx.runMutation(
      internalMutations.shareLinks.updateStatusByTokenHash,
      {
        tokenHash,
        target: args.target,
        accessMetadata: args.accessMetadata,
      }
    );
  },
});

export const createPublicComment = action({
  args: {
    token: v.string(),
    body: v.string(),
    authorLabel: v.optional(v.string()),
    accessMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashShareToken(args.token);
    return await ctx.runMutation(
      internalMutations.shareLinks.createCommentByTokenHash,
      {
        tokenHash,
        body: args.body,
        authorLabel: args.authorLabel,
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");
    return await createShareLinkRecord(ctx, args, {
      type: "user",
      userId: actor.userId,
    });
  },
});

export const updateStatusByTokenHash = internalMutation({
  args: {
    tokenHash: v.string(),
    target: publicStatusTargetValidator,
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
    if (!link.documentationProfileId) {
      throw new Error("Status updates require a scoped documentation profile.");
    }

    const profile = await ctx.db.get(link.documentationProfileId);
    if (
      !profile ||
      profile.householdId !== link.householdId ||
      profile.moveId !== link.moveId ||
      profile.status !== "active"
    ) {
      throw new Error("Documentation profile not found.");
    }

    assertPublicShareCanStatusUpdate({
      allowedActions: link.allowedActions,
      profileType: profile.type,
      targetType: args.target.type,
      nextStatus: args.target.status,
    });

    const now = Date.now();
    const result =
      args.target.type === "item"
        ? await updatePublicItemStatus(ctx, {
            link,
            profile,
            itemId: args.target.itemId,
            status: args.target.status,
            now,
          })
        : await updatePublicBoxStatus(ctx, {
            link,
            profile,
            boxId: args.target.boxId,
            status: args.target.status,
            now,
          });

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
      action:
        result.targetType === "item"
          ? "share_link.item_status_updated"
          : "share_link.box_status_updated",
      objectTable: result.targetType === "item" ? "items" : "boxes",
      objectId: result.targetId,
      metadata: {
        shareLinkId: link._id,
        documentationProfileId: profile._id,
        tokenPreview: link.tokenPreview,
        role: link.role,
        previousStatus: result.previousStatus,
        nextStatus: result.nextStatus,
        changed: result.changed,
      },
    });

    return result;
  },
});

export const createCommentByTokenHash = internalMutation({
  args: {
    tokenHash: v.string(),
    body: v.string(),
    authorLabel: v.optional(v.string()),
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
    assertPublicShareCanComment(link.allowedActions);
    if (!link.documentationProfileId) {
      throw new Error("Comments require a scoped documentation profile.");
    }

    const profile = await ctx.db.get(link.documentationProfileId);
    if (
      !profile ||
      profile.householdId !== link.householdId ||
      profile.moveId !== link.moveId ||
      profile.status !== "active"
    ) {
      throw new Error("Documentation profile not found.");
    }

    const body = normalizePublicShareComment(args.body);
    const authorLabel = normalizePublicShareCommentAuthor(args.authorLabel);
    const now = Date.now();
    const commentId = await ctx.db.insert("shareLinkComments", {
      householdId: link.householdId,
      moveId: link.moveId,
      shareLinkId: link._id,
      documentationProfileId: profile._id,
      tokenPreview: link.tokenPreview,
      role: link.role,
      authorLabel,
      body,
      createdAt: now,
    });

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
      action: "share_link.comment_created",
      objectTable: "shareLinkComments",
      objectId: commentId,
      metadata: {
        shareLinkId: link._id,
        documentationProfileId: profile._id,
        tokenPreview: link.tokenPreview,
        role: link.role,
        bodyLength: body.length,
        hasAuthorLabel: Boolean(authorLabel),
      },
    });

    return {
      commentId,
      body,
      authorLabel,
      createdAt: now,
    };
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

async function updatePublicItemStatus(
  ctx: MutationCtx,
  args: {
    link: Doc<"shareLinks">;
    profile: Doc<"documentationProfiles">;
    itemId: Id<"items">;
    status: Doc<"items">["status"];
    now: number;
  }
) {
  const item = await ctx.db.get(args.itemId);
  if (
    !item ||
    item.householdId !== args.link.householdId ||
    item.moveId !== args.link.moveId
  ) {
    throw new Error("Shared item not found.");
  }
  if (!publicShareItemVisibleToProfile({ item, profile: args.profile })) {
    throw new Error("Shared item is outside this link scope.");
  }

  const previousStatus = item.status;
  const changed = previousStatus !== args.status;
  if (changed) {
    await ctx.db.patch(item._id, {
      status: args.status,
      updatedAt: args.now,
    });
  }

  return {
    targetType: "item" as const,
    targetId: item._id,
    previousStatus,
    nextStatus: args.status,
    changed,
  };
}

async function updatePublicBoxStatus(
  ctx: MutationCtx,
  args: {
    link: Doc<"shareLinks">;
    profile: Doc<"documentationProfiles">;
    boxId: Id<"boxes">;
    status: Doc<"boxes">["status"];
    now: number;
  }
) {
  const box = await ctx.db.get(args.boxId);
  if (
    !box ||
    box.householdId !== args.link.householdId ||
    box.moveId !== args.link.moveId
  ) {
    throw new Error("Shared box not found.");
  }
  const visibleItemCount = await visibleItemCountForBox(ctx, args.boxId, args.profile);
  if (
    !publicShareBoxVisibleToProfile({
      box,
      profile: args.profile,
      visibleItemCount,
    })
  ) {
    throw new Error("Shared box is outside this link scope.");
  }

  const previousStatus = box.status;
  const changed = previousStatus !== args.status;
  if (changed) {
    await ctx.db.patch(box._id, {
      status: args.status,
      ...(args.status === "sealed" && !box.sealedAt
        ? { sealedAt: args.now }
        : {}),
      updatedAt: args.now,
    });
  }

  return {
    targetType: "box" as const,
    targetId: box._id,
    previousStatus,
    nextStatus: args.status,
    changed,
  };
}

async function visibleItemCountForBox(
  ctx: MutationCtx,
  boxId: Id<"boxes">,
  profile: Doc<"documentationProfiles">
) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", boxId))
    .collect();
  let visibleCount = 0;
  for (const membership of memberships) {
    const item = await ctx.db.get(membership.itemId);
    if (item && publicShareItemVisibleToProfile({ item, profile })) {
      visibleCount += 1;
    }
  }
  return visibleCount;
}
