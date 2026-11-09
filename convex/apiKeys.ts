import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { requireHouseholdPermission } from "./lib/permissions";
import { requireCurrentUser } from "./lib/auth";
import { assertHouseholdEntitlement } from "./lib/billing";
import { apiKeyScopes, normalizeApiKeyScopes, generateApiKeySecret, hashApiKey, apiKeyPrefix, apiKeyPreview } from "./lib/apiKeys";
import { reductionArgs, type Reduction } from "./lib/connectionReduction";
import { connectionAccess, ensureAccess, readAccess, readConnection, connectKey, keyScopes, accessState, narrowConnection, changeByPerson, snapshot } from "./lib/carriedAccess";
import { connectionChange, safeConnectionText } from "./lib/connectionHistory";

const scopeValidator = v.union(v.literal("moves/read"), v.literal("moves/write"), v.literal("inventory/read"), v.literal("inventory/write"), v.literal("queue/read"), v.literal("queue/write"), v.literal("plans/read"), v.literal("plans/write"), v.literal("photos/write"), v.literal("exports/read"), v.literal("exports/create"), v.literal("members/manage"));
export const settingsSummary = query({ args: { householdId: v.id("households") }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
  const access = await readAccess(ctx, user._id);
  if (!access?.bootstrapped) return { activeApiKeyCount: 0, activeApiKeyCountTruncated: false };
  const rows = await ctx.db.query("aiAccessConnections").withIndex("by_owner_current", q => q.eq("ownerUserId", user._id).eq("isCurrent", true)).collect();
  let count = 0;
  for (const row of rows) if (accessState(connectionAccess(access, row), row) === "active" && row.apiKeyId && (await ctx.db.get(row.apiKeyId))?.householdId === args.householdId) count++;
  return { activeApiKeyCount: count, activeApiKeyCountTruncated: false };
} });
export const listForHousehold = query({ args: { householdId: v.id("households"), cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
  const access = await readAccess(ctx, user._id);
  const page = await ctx.db.query("apiKeys").withIndex("by_household_created", q => q.eq("householdId", args.householdId)).order("desc").paginate({ numItems: 50, cursor: args.cursor ?? null });
  const keys = await Promise.all(page.page.filter(key => key.createdByUserId === user._id).map(async key => {
    const connection = await readConnection(ctx, user._id, `key:${key._id}`);
    const own = access && connection ? connectionAccess(access, connection) : access;
    return { apiKeyId: key._id, householdId: key.householdId, moveId: own?.moveIds?.length === 1 ? own.moveIds[0] : undefined, name: key.name, tokenPreview: key.tokenPreview,
      scopes: own ? keyScopes(own) : [], version: own?.revision ?? 0, status: accessState(own, connection), expiresAt: own?.endsAt, revokedAt: own?.revokedAt, lastUsedAt: connection?.lastUsedAt, lastUsedAction: connection?.lastToolName, createdAt: key.createdAt };
  }));
  return { keys, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const create = mutation({ args: { householdId: v.id("households"), moveId: v.optional(v.id("moves")), name: v.string(), scopes: v.optional(v.array(scopeValidator)), scopeChoice: v.optional(v.union(v.literal("full"), v.literal("chosen"))), expiresAt: v.optional(v.number()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx);
  const { actor } = await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
  if (actor.type !== "user") throw new ConvexError("API-key management requires a signed-in person.");
  await ensureAccess(ctx, actor.userId);
  await assertHouseholdEntitlement(ctx, { householdId: args.householdId, dimension: "activeApiKeys" });
  const name = safeConnectionText(args.name.trim());
  if (!name) throw new ConvexError("Give this connection a name.");
  if (args.expiresAt !== undefined && (!Number.isFinite(new Date(args.expiresAt).getTime()) || args.expiresAt <= Date.now())) throw new ConvexError("Expiration must be a supported date in the future.");
  if (args.moveId) {
    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId || move.status === "archived" || move.archivedAt !== undefined) throw new ConvexError("Choose an active move in this household.");
  }
  const scopes = normalizeApiKeyScopes(args.scopes ?? [...apiKeyScopes]);
  if (args.scopeChoice === "full" && scopes.length !== apiKeyScopes.length) throw new ConvexError("Full access requires the whole current API catalogue.");
  const rawKey = generateApiKeySecret(), now = Date.now();
  const apiKeyId = await ctx.db.insert("apiKeys", { householdId: args.householdId, moveId: args.moveId, name, prefix: apiKeyPrefix(rawKey), tokenPreview: apiKeyPreview(rawKey), secretHash: await hashApiKey(rawKey), scopes, scopeChoice: args.scopeChoice ?? (args.scopes === undefined ? "full" : "chosen"), status: "active", version: 1, expiresAt: args.expiresAt, createdByUserId: actor.userId, createdAt: now, updatedAt: now });
  const key = (await ctx.db.get(apiKeyId))!;
  const { access, connection } = await connectKey(ctx, key);
  if (connection) await connectionChange(ctx, { ownerUserId: actor.userId, accessOwnerId: access._id, connectionId: String(connection._id), actor: "person", before: null, after: snapshot(access, connection), message: "You created an API-key credential with your chosen limits. OAuth AI restrictions do not apply to this key.", opId: `create:${apiKeyId}` });
  return { apiKeyId, rawKey, tokenPreview: apiKeyPreview(rawKey), scopes: keyScopes(access), initializing: !access.bootstrapped };
} });
export const revoke = mutation({ args: { householdId: v.id("households"), apiKeyId: v.id("apiKeys"), expectedVersion: v.number() }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
  const key = await ctx.db.get(args.apiKeyId);
  if (!key || key.createdByUserId !== user._id || key.householdId !== args.householdId) throw new ConvexError("Connection unavailable.");
  const { connection } = await connectKey(ctx, key);
  if (!connection) throw new ConvexError("Earlier access is being initialized. Try again shortly.");
  const after = await changeByPerson(ctx, connection, { expectedVersion: args.expectedVersion, opId: `revoke:${args.apiKeyId}:${args.expectedVersion}`, action: "revoke" });
  return { version: after.version };
} });
export const rotate = mutation({ args: { householdId: v.id("households"), apiKeyId: v.id("apiKeys"), expectedVersion: v.number() }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  await requireHouseholdPermission(ctx, args.householdId, "api_keys:manage");
  return rotateApiKeyForUser(ctx, args, user._id);
} });
export async function rotateApiKeyForUser(ctx: MutationCtx, args: { householdId: Id<"households">; apiKeyId: Id<"apiKeys">; expectedVersion?: number }, actorUserId: Id<"users">, now = Date.now()) {
  const key = await ctx.db.get(args.apiKeyId);
  if (!key || key.createdByUserId !== actorUserId || key.householdId !== args.householdId) throw new ConvexError("Connection unavailable.");
  const { access, connection } = await connectKey(ctx, key);
  if (!connection || !access.bootstrapped) throw new ConvexError("Earlier connection limits are still being checked. Try again shortly.");
  if (args.expectedVersion !== undefined && args.expectedVersion !== access.revision) throw new ConvexError("This connection changed. Reload Settings before rotating it.");
  const state = accessState(access, connection, now);
  if (state !== "active") throw new ConvexError(`This connection is ${state}. Restore it on the website before rotating its secret.`);
  if (key.credentialRetiredAt !== undefined) throw new ConvexError("A rotated credential stays retired.");
  const rawKey = generateApiKeySecret();
  const apiKeyId = await ctx.db.insert("apiKeys", { householdId: key.householdId, moveId: access.moveIds?.length === 1 ? access.moveIds[0] : undefined, accessOwnerId: access._id, name: `${key.name} rotated`, prefix: apiKeyPrefix(rawKey), tokenPreview: apiKeyPreview(rawKey), secretHash: await hashApiKey(rawKey), scopes: keyScopes(access), scopeChoice: "chosen", status: "active", version: 1, expiresAt: access.endsAt, rotatedFromApiKeyId: key._id, createdByUserId: actorUserId, createdAt: now, updatedAt: now });
  await ctx.db.patch(key._id, { credentialRetiredAt: now, status: "revoked", revokedAt: now, updatedAt: now });
  await ctx.db.patch(connection._id, { isCurrent: false, supersededAt: now });
  await ctx.db.patch(access._id, { connectionCount: Math.max(0, access.connectionCount - 1) });
  const replacement = (await ctx.db.get(apiKeyId))!;
  const linked = await connectKey(ctx, replacement, true);
  if (linked.connection) await connectionChange(ctx, { ownerUserId: actorUserId, accessOwnerId: access._id, connectionId: String(linked.connection._id), actor: "person", before: snapshot(access, connection), after: snapshot(linked.access, linked.connection), message: "You rotated the secret. The retired key stays stopped; the replacement keeps the same limits.", opId: `rotate:${apiKeyId}` });
  return { apiKeyId, rawKey, tokenPreview: apiKeyPreview(rawKey), scopes: keyScopes(linked.access) };
}
export async function reduceOwnApiKey(ctx: MutationCtx, apiKeyId: Id<"apiKeys">, input: Reduction) {
  const key = await ctx.db.get(apiKeyId);
  if (!key) throw new ConvexError("Calling connection unavailable.");
  const { connection } = await connectKey(ctx, key);
  if (!connection) throw new ConvexError("Calling connection unavailable.");
  return narrowConnection(ctx, connection, input);
}
export const reduceCallingKey = internalMutation({ args: { apiKeyId: v.id("apiKeys"), ...reductionArgs }, handler: (ctx, { apiKeyId, ...input }) => reduceOwnApiKey(ctx, apiKeyId, input) });

/** Isolate authority/bootstrap writes from REST's error-to-response catch. A
 * receipt failure must roll back this entire policy change, not get swallowed. */
export const connectCallingKey = internalMutation({ args: { apiKeyId: v.id("apiKeys") }, handler: async (ctx, args) => {
  const key = await ctx.db.get(args.apiKeyId);
  if (!key) throw new ConvexError("Calling connection unavailable.");
  return connectKey(ctx, key);
} });
