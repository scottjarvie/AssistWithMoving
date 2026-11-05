import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent, type AuditEventInput } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  apiKeyScopes,
  effectiveApiKeyScopes,
  apiKeyEffectiveStatus,
  apiKeyPrefix,
  apiKeyPreview,
  generateApiKeySecret,
  hashApiKey,
  normalizeApiKeyScopes,
  readActiveApiKeyCount,
} from "./lib/apiKeys";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { reductionArgs, reducedAccess, type Reduction } from "./lib/connectionReduction";
import { requireHouseholdPermission } from "./lib/permissions";

// Default cap on active connections (API keys) per household, so the "active
// connections" count stays legible to a non-technical user (MOVE-279). Revoke
// one to free a slot.
const MAX_ACTIVE_API_KEYS = 3;

async function recordPrivateKeyAudit(ctx: MutationCtx, input: AuditEventInput) {
  const receipt = await recordAuditEvent(ctx, { ...input, householdId: undefined, moveId: undefined });
  await recordAuditEvent(ctx, { householdId: input.householdId, moveId: input.moveId, actorType: input.actorType, actorUserId: input.actorUserId, category: "apiKey", action: "api_connection.changed" });
  return receipt;
}

export const settingsSummary = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
    const count = await readActiveApiKeyCount(ctx.db, args.householdId);
    return { activeApiKeyCount: count.count, activeApiKeyCountTruncated: count.truncated };
  },
});

const apiKeyScopeValidator = v.union(
  v.literal("moves/read"),
  v.literal("moves/write"),
  v.literal("inventory/read"),
  v.literal("inventory/write"),
  v.literal("queue/read"),
  v.literal("queue/write"),
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
  scopes: v.optional(v.array(apiKeyScopeValidator)),
  scopeChoice: v.optional(v.union(v.literal("full"), v.literal("chosen"))),
  expiresAt: v.optional(v.number()),
};

export const listForHousehold = query({
  args: {
    householdId: v.id("households"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
    const page = await ctx.db
      .query("apiKeys")
      .withIndex("by_household_created", (q) => q.eq("householdId", args.householdId))
      .order("desc").paginate({ numItems: 50, cursor: args.cursor ?? null });

    const now = Date.now();
    const keys = page.page.map((key) => ({
        apiKeyId: key._id,
        householdId: key.householdId,
        moveId: key.moveId,
        name: key.name,
        tokenPreview: key.tokenPreview,
        scopes: effectiveApiKeyScopes(key),
        version: key.version ?? 1,
        status: apiKeyEffectiveStatus(key, now),
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
        lastUsedAt: key.lastUsedAt,
        lastUsedAction: key.lastUsedAction,
        createdAt: key.createdAt,
      }));
    return { keys, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

export const create = mutation({
  args: apiKeyWriteArgs,
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new ConvexError("API-key management requires a signed-in user.");
    }

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "activeApiKeys",
    });

    const effectiveStateNow = Date.now();
    const [withoutExpiry, withFutureExpiry] = await Promise.all([
      ctx.db.query("apiKeys").withIndex("by_household_status_expiry", q =>
        q.eq("householdId", args.householdId).eq("status", "active").eq("expiresAt", undefined)).take(MAX_ACTIVE_API_KEYS),
      ctx.db.query("apiKeys").withIndex("by_household_status_expiry", q =>
        q.eq("householdId", args.householdId).eq("status", "active").gt("expiresAt", effectiveStateNow)).take(MAX_ACTIVE_API_KEYS),
    ]);
    const effectiveActiveKeyCount = withoutExpiry.length + withFutureExpiry.length;
    if (effectiveActiveKeyCount >= MAX_ACTIVE_API_KEYS) {
      throw new ConvexError(
        `You can have up to ${MAX_ACTIVE_API_KEYS} active connections. Revoke one before adding another.`,
      );
    }

    await assertMoveRestriction(ctx, args);
    const scopes = normalizeApiKeyScopes(args.scopes ?? [...apiKeyScopes]);
    if (!scopes.length) {
      throw new ConvexError("Select at least one thing this connection can do.");
    }
    if (args.scopeChoice === "full" && scopes.length !== apiKeyScopes.length) throw new ConvexError("Full access requires every current API scope.");
    const rawKey = generateApiKeySecret();
    const prefix = apiKeyPrefix(rawKey);
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
      .unique();
    if (existing) {
      throw new ConvexError("Could not create a unique API key. Please try again.");
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
      scopeChoice: args.scopeChoice ?? (args.scopes === undefined ? "full" : "chosen"),
      version: 1,
      status: "active",
      expiresAt: normalizeExpiration(args.expiresAt),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordPrivateKeyAudit(ctx, {
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
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new ConvexError("API-key management requires a user actor.");
    }
    const key = await getMutableKey(ctx, args);
    if (args.expectedVersion !== (key.version ?? 1)) throw new ConvexError("This connection changed. Reload Settings before revoking it.");
    const now = Date.now();
    const version = (key.version ?? 1) + 1;

    await ctx.db.patch(args.apiKeyId, {
      status: "revoked",
      revokedAt: key.revokedAt ?? now,
      revokedByUserId: key.revokedByUserId ?? actor.userId,
      version,
      updatedAt: now,
    });

    await recordPrivateKeyAudit(ctx, {
      householdId: args.householdId,
      moveId: key.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "apiKey",
      action: "api_key.revoked",
      objectTable: "apiKeys",
      objectId: args.apiKeyId,
      metadata: { version, previousVersion: key.version ?? 1 },
    });
    return { version };
  },
});

export const rotate = mutation({
  args: {
    householdId: v.id("households"),
    apiKeyId: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage"
    );
    if (actor.type !== "user") {
      throw new ConvexError("API-key management requires a signed-in user.");
    }
    return await rotateApiKeyForUser(ctx, args, actor.userId);
  },
});

export async function rotateApiKeyForUser(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    apiKeyId: Id<"apiKeys">;
  },
  actorUserId: Id<"users">,
  now = Date.now(),
) {
    const key = await getMutableKey(ctx, args);
    const effectiveStatus = apiKeyEffectiveStatus(key, now);
    if (effectiveStatus === "revoked") {
      throw new ConvexError(
        "This connection was revoked and cannot be rotated. Create a new key instead.",
      );
    }
    if (effectiveStatus === "expired") {
      throw new ConvexError(
        "This connection expired and cannot be rotated. Create a new key instead.",
      );
    }

    const rawKey = generateApiKeySecret();
    const prefix = apiKeyPrefix(rawKey);

    await ctx.db.patch(args.apiKeyId, {
      status: "revoked",
      revokedAt: key.revokedAt ?? now,
      revokedByUserId: key.revokedByUserId ?? actorUserId,
      version: (key.version ?? 1) + 1,
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
      scopeChoice: key.scopeChoice,
      version: 1,
      status: "active",
      expiresAt: key.expiresAt,
      rotatedFromApiKeyId: key._id,
      createdByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    await recordPrivateKeyAudit(ctx, {
      householdId: args.householdId,
      moveId: key.moveId,
      actorType: "user",
      actorUserId,
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
}

async function assertMoveRestriction(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId?: Id<"moves">;
  }
) {
  if (!args.moveId) return;
  const move = await ctx.db.get(args.moveId);
  if (!move || move.householdId !== args.householdId) {
    throw new ConvexError(
      "That move isn't part of the selected household. Pick a move that belongs to this household, or choose “All moves in this household”.",
    );
  }
  // A move can read as archived via either signal; check both so the dropdown
  // (which filters on status) and this guard (which used to check only
  // archivedAt) can never disagree and produce an opaque failure.
  if (move.archivedAt !== undefined || move.status === "archived") {
    throw new ConvexError(
      "That move is archived, so a key can't be scoped to it. Restore the move first, or choose “All moves in this household”.",
    );
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
    throw new ConvexError("That connection could not be found.");
  }
  return key;
}

function normalizeKeyName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ConvexError("Give this connection a name.");
  }
  return trimmed.slice(0, 120);
}

function normalizeExpiration(expiresAt: number | undefined) {
  if (expiresAt === undefined) return undefined;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new ConvexError("Expiration must be in the future.");
  }
  return expiresAt;
}

/** Only called after authenticating this exact bearer, in the same mutation. */
export async function reduceOwnApiKey(ctx: MutationCtx, apiKeyId: Id<"apiKeys">, input: Reduction) {
  const key = await ctx.db.get(apiKeyId);
  if (!key) throw new ConvexError("Calling connection unavailable.");
  const now = Date.now();
  const before = keyReceiptLimits(key, now);
  const reduced = reducedAccess({ version: key.version ?? 1, scopes: effectiveApiKeyScopes(key), moveIds: key.moveId ? [String(key.moveId)] : undefined, expiresAt: key.expiresAt, active: key.status === "active" }, input, now);
  if (reduced.moveIds && reduced.moveIds.length !== 1) throw new ConvexError("This door supports one selected move. Choose one move or preserve the current restriction.");
  const moveId = reduced.moveIds?.[0] as Id<"moves"> | undefined;
  if (moveId) await assertMoveRestriction(ctx, { householdId: key.householdId, moveId });
  const version = (key.version ?? 1) + 1;
  await ctx.db.patch(key._id, {
    ...(reduced.scopes ? { scopes: reduced.scopes as import("./lib/apiKeys").ApiKeyScope[], scopeChoice: "chosen" as const } : {}),
    ...(moveId ? { moveId } : {}),
    ...(reduced.expiresAt !== undefined ? { expiresAt: reduced.expiresAt! } : {}),
    ...(input.action === "revoke" ? { status: "revoked" as const, revokedAt: now } : {}),
    version, updatedAt: now,
  });
  const changed = await ctx.db.get(key._id);
  if (!changed) throw new ConvexError("Calling connection unavailable.");
  const after = keyReceiptLimits(changed, now);
  const receipt = await recordPrivateKeyAudit(ctx, { householdId: key.householdId, moveId: key.moveId, actorType: "apiKey", actorApiKeyId: key._id, actorUserId: key.createdByUserId, category: "apiKey", action: "api_key.self_reduced", objectTable: "apiKeys", objectId: key._id, metadata: { version, action: input.action ?? "narrow", previousVersion: before.version, previousScopes: before.scopes, scopes: after.scopes, moveId: after.moveId, expiresAt: after.expiresAt, before, after } });
  return { version, receipt, settings: "https://movingmanifest.com/settings/ai" };
}

function keyReceiptLimits(key: Doc<"apiKeys">, now: number) {
  const status = apiKeyEffectiveStatus(key, now);
  return { version: key.version ?? 1, status, active: status === "active", scopes: [...effectiveApiKeyScopes(key)], moveId: key.moveId ?? null, expiresAt: key.expiresAt ?? null };
}

/** The REST facade maps failures only after this subtransaction rolls back. */
export const reduceCallingKey = internalMutation({
  args: { apiKeyId: v.id("apiKeys"), ...reductionArgs },
  handler: (ctx, { apiKeyId, ...input }) => reduceOwnApiKey(ctx, apiKeyId, input),
});
