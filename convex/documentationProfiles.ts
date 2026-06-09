import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  documentationFieldKeyValidator,
  documentationFiltersValidator,
  documentationImageRuleValidator,
  documentationProfileStatusValidator,
  normalizeDocumentationProfileConfig,
  shareLinkActionValidator,
} from "./lib/documentation";
import {
  documentationProfileTypeValidator,
  normalizeOptionalText,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const profileWriteArgs = {
  type: documentationProfileTypeValidator,
  name: v.optional(v.string()),
  includedFields: v.optional(v.array(documentationFieldKeyValidator)),
  imageRule: v.optional(documentationImageRuleValidator),
  filters: v.optional(documentationFiltersValidator),
  allowedActions: v.optional(v.array(shareLinkActionValidator)),
  disclaimer: v.optional(v.string()),
  ownerNotes: v.optional(v.string()),
};

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: v.optional(documentationProfileStatusValidator),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read",
    );

    const profiles = await ctx.db
      .query("documentationProfiles")
      .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
      .collect();

    return profiles.filter((profile) =>
      args.status ? profile.status === args.status : true,
    );
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.id("documentationProfiles"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read",
    );

    const profile = await ctx.db.get(args.documentationProfileId);
    if (
      !profile ||
      profile.householdId !== args.householdId ||
      profile.moveId !== args.moveId
    ) {
      return null;
    }

    return profile;
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...profileWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:create",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const config = normalizeDocumentationProfileConfig(args);
    const now = Date.now();
    const documentationProfileId = await ctx.db.insert(
      "documentationProfiles",
      {
        householdId: args.householdId,
        moveId: args.moveId,
        type: args.type,
        status: "active",
        name: config.name,
        includedFields: config.includedFields,
        imageRule: config.imageRule,
        filters: config.filters,
        allowedActions: config.allowedActions,
        disclaimer: config.disclaimer,
        ownerNotes: normalizeOptionalText(args.ownerNotes),
        exportHistory: [],
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      },
    );

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "documentation",
      action: "documentation_profile.created",
      objectTable: "documentationProfiles",
      objectId: documentationProfileId,
      metadata: {
        type: args.type,
        includedFields: config.includedFields,
        imageRule: config.imageRule,
      },
    });

    return documentationProfileId;
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.id("documentationProfiles"),
    status: v.optional(documentationProfileStatusValidator),
    ...profileWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:create",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const existing = await getMutableProfile(ctx, args);
    const config = normalizeDocumentationProfileConfig({
      type: args.type,
      name: args.name ?? existing.name,
      includedFields: args.includedFields ?? existing.includedFields,
      imageRule: args.imageRule ?? existing.imageRule,
      filters: args.filters ?? existing.filters,
      allowedActions: args.allowedActions ?? existing.allowedActions,
      disclaimer: args.disclaimer ?? existing.disclaimer,
    });
    const now = Date.now();

    await ctx.db.patch(args.documentationProfileId, {
      type: args.type,
      status: args.status ?? existing.status,
      name: config.name,
      includedFields: config.includedFields,
      imageRule: config.imageRule,
      filters: config.filters,
      allowedActions: config.allowedActions,
      disclaimer: config.disclaimer,
      ownerNotes:
        args.ownerNotes === undefined
          ? existing.ownerNotes
          : normalizeOptionalText(args.ownerNotes),
      updatedByUserId: actor.userId,
      archivedAt:
        args.status === "archived"
          ? (existing.archivedAt ?? now)
          : args.status
            ? undefined
            : existing.archivedAt,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "documentation",
      action: "documentation_profile.updated",
      objectTable: "documentationProfiles",
      objectId: args.documentationProfileId,
      metadata: {
        previousStatus: existing.status,
        nextStatus: args.status ?? existing.status,
        type: args.type,
      },
    });
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.id("documentationProfiles"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:manage",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    await getMutableProfile(ctx, args);
    const now = Date.now();
    await ctx.db.patch(args.documentationProfileId, {
      status: "archived",
      archivedAt: now,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "documentation",
      action: "documentation_profile.archived",
      objectTable: "documentationProfiles",
      objectId: args.documentationProfileId,
    });
  },
});

export const recordExport = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.id("documentationProfiles"),
    exportJobId: v.optional(v.string()),
    format: v.union(v.literal("pdf"), v.literal("csv"), v.literal("print")),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:create",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const existing = await getMutableProfile(ctx, args);
    const now = Date.now();
    await ctx.db.patch(args.documentationProfileId, {
      exportHistory: [
        {
          exportJobId: normalizeOptionalText(args.exportJobId),
          format: args.format,
          createdByUserId: actor.userId,
          createdAt: now,
        },
        ...existing.exportHistory,
      ].slice(0, 25),
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "export",
      action: "documentation_profile.export_recorded",
      objectTable: "documentationProfiles",
      objectId: args.documentationProfileId,
      metadata: { format: args.format },
    });
  },
});

async function getMutableProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId: Id<"documentationProfiles">;
  },
) {
  const profile = await ctx.db.get(args.documentationProfileId);
  if (
    !profile ||
    profile.householdId !== args.householdId ||
    profile.moveId !== args.moveId
  ) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}
