import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  apiKeyPrefix,
  apiKeyPreview,
  generateApiKeySecret,
  hashApiKey,
  normalizeApiKeyScopes,
} from "./lib/apiKeys";
import { requireHouseholdPermission } from "./lib/permissions";

// Default cap on active connections (API keys) per household, so the "active
// connections" count stays legible to a non-technical user (MOVE-279). Revoke
// one to free a slot.
const MAX_ACTIVE_API_KEYS = 3;

const apiKeyScopeValidator = v.union(
  v.literal("moves/read"),
  v.literal("moves/write"),
  v.literal("inventory/read"),
  v.literal("inventory/write"),
  v.literal("plans/read"),
  v.literal("plans/write"),
  v.literal("photos/write"),
  v.literal("exports/read"),
  v.literal("exports/create"),
  v.literal("members/manage")
);

const apiKeyWriteArgs = {
  householdId: v.id("households"),
  moveId: v.optional(v.id("moves")),
  name: v.string(),
  scopes: v.array(apiKeyScopeValidator),
  expiresAt: v.optional(v.number()),
};

export const listForHousehold = query({
  args: {
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_household_status", (q) => q.eq("householdId", args.householdId))
      .collect();

    return keys
      .sort((first, second) => second.createdAt - first.createdAt)
      .map((key) => ({
        apiKeyId: key._id,
        householdId: key.householdId,
        moveId: key.moveId,
        name: key.name,
        tokenPreview: key.tokenPreview,
        scopes: key.scopes,
        status: key.status,
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
        lastUsedAt: key.lastUsedAt,
        lastUsedAction: key.lastUsedAction,
        createdAt: key.createdAt,
      }));
  },
});

export const create = mutation({
  args: apiKeyWriteArgs,
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new Error("API-key management requires a user actor.");
    }

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "activeApiKeys",
    });

    const activeKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", args.householdId).eq("status", "active"),
      )
      .collect();
    if (activeKeys.length >= MAX_ACTIVE_API_KEYS) {
      throw new Error(
        `You can have up to ${MAX_ACTIVE_API_KEYS} active connections. Revoke one before adding another.`,
      );
    }

    await assertMoveRestriction(ctx, args);
    const scopes = normalizeApiKeyScopes(args.scopes);
    if (!scopes.length) {
      throw new Error("Select at least one API scope.");
    }
    const rawKey = generateApiKeySecret();
    const prefix = apiKeyPrefix(rawKey);
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
      .unique();
    if (existing) {
      throw new Error("Could not create a unique API key. Try again.");
    }

    const now = Date.now();
    const apiKeyId = await ctx.db.insert("apiKeys", {
      householdId: args.householdId,
      moveId: args.moveId,
      name: normalizeKeyName(args.name),
      prefix,
      tokenPreview: apiKeyPreview(rawKey),
      secretHash: await hashApiKey(rawKey),
      scopes,
      status: "active",
      expiresAt: normalizeExpiration(args.expiresAt),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "apiKey",
      action: "api_key.created",
      objectTable: "apiKeys",
      objectId: apiKeyId,
      metadata: { scopes, expiresAt: args.expiresAt },
    });

    return {
      apiKeyId,
      rawKey,
      tokenPreview: apiKeyPreview(rawKey),
      scopes,
    };
  },
});

export const revoke = mutation({
  args: {
    householdId: v.id("households"),
    apiKeyId: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new Error("API-key management requires a user actor.");
    }
    const key = await getMutableKey(ctx, args);
    const now = Date.now();

    await ctx.db.patch(args.apiKeyId, {
      status: "revoked",
      revokedAt: key.revokedAt ?? now,
      revokedByUserId: key.revokedByUserId ?? actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: key.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "apiKey",
      action: "api_key.revoked",
      objectTable: "apiKeys",
      objectId: args.apiKeyId,
    });
  },
});

export const rotate = mutation({
  args: {
    householdId: v.id("households"),
    apiKeyId: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new Error("API-key management requires a user actor.");
    }
    const key = await getMutableKey(ctx, args);
    const rawKey = generateApiKeySecret();
    const prefix = apiKeyPrefix(rawKey);
    const now = Date.now();

    await ctx.db.patch(args.apiKeyId, {
      status: "revoked",
      revokedAt: key.revokedAt ?? now,
      revokedByUserId: key.revokedByUserId ?? actor.userId,
      updatedAt: now,
    });

    const rotatedApiKeyId = await ctx.db.insert("apiKeys", {
      householdId: key.householdId,
      moveId: key.moveId,
      name: `${key.name} rotated`,
      prefix,
      tokenPreview: apiKeyPreview(rawKey),
      secretHash: await hashApiKey(rawKey),
      scopes: key.scopes,
      status: "active",
      expiresAt: key.expiresAt,
      rotatedFromApiKeyId: key._id,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: key.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "apiKey",
      action: "api_key.rotated",
      objectTable: "apiKeys",
      objectId: rotatedApiKeyId,
      metadata: { rotatedFromApiKeyId: key._id },
    });

    return {
      apiKeyId: rotatedApiKeyId,
      rawKey,
      tokenPreview: apiKeyPreview(rawKey),
      scopes: key.scopes,
    };
  },
});

async function assertMoveRestriction(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId?: Id<"moves">;
  }
) {
  if (!args.moveId) return;
  const move = await ctx.db.get(args.moveId);
  if (!move || move.householdId !== args.householdId || move.archivedAt) {
    throw new Error("Move restriction is invalid.");
  }
}

async function getMutableKey(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    apiKeyId: Id<"apiKeys">;
  }
) {
  const key = await ctx.db.get(args.apiKeyId);
  if (!key || key.householdId !== args.householdId) {
    throw new Error("API key not found.");
  }
  return key;
}

function normalizeKeyName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("API key name is required.");
  }
  return trimmed.slice(0, 120);
}

function normalizeExpiration(expiresAt: number | undefined) {
  if (expiresAt === undefined) return undefined;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Expiration must be in the future.");
  }
  return expiresAt;
}
