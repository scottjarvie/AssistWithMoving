import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { movingScopes } from "./lib/aiGrants";
import { apiKeyScopes } from "./lib/apiKeys";
import { ensureAccess, readAccess, accessState, oauthScopes, keyScopes, changeByPerson, snapshot } from "./lib/carriedAccess";

export const initialize = mutation({ args: {}, handler: async ctx => {
  await requirePersonConnectionManagement(ctx);
  const user = await requireCurrentUser(ctx);
  const access = await ensureAccess(ctx, user._id);
  return { ready: access.bootstrapped };
} });
export const list = query({ args: { cursor: v.optional(v.string()), cursorGeneration: v.optional(v.number()), superseded: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx);
  const user = await requireCurrentUser(ctx);
  const access = await readAccess(ctx, user._id);
  const generation = access?.currentGeneration ?? 0;
  const source = args.superseded
    ? ctx.db.query("aiAccessConnections").withIndex("by_owner_generation", q => q.eq("ownerUserId", user._id).lt("generation", generation))
    : ctx.db.query("aiAccessConnections").withIndex("by_owner_generation", q => q.eq("ownerUserId", user._id).eq("generation", generation).eq("isCurrent", true));
  const page = await source.order("desc").paginate({ numItems: 25, cursor: args.cursorGeneration !== undefined && args.cursorGeneration !== generation ? null : args.cursor ?? null });
  const connections = await Promise.all(page.page.map(async row => ({
    id: row._id, kind: row.kind, label: row.label, version: access?.revision ?? 0,
    scopes: access ? row.kind === "key" ? keyScopes(access) : oauthScopes(access) : [],
    catalog: row.kind === "key" ? [...apiKeyScopes] as string[] : [...movingScopes] as string[],
    expiresAt: access?.endsAt ?? null, pausedAt: access?.pausedAt ?? null,
    status: accessState(access, row), lastUsedAt: row.lastUsedAt ?? null,
    narrowedBy: access?.changedBy ?? null, narrowedAt: access?.changedAt ?? null,
    moveCount: access?.moveIds?.length ?? null, inherited: access?.entries.some(entry => entry.sourceGrantId !== String(row.grantId ?? row.apiKeyId ?? row._id)) ?? false, isCurrent: row.isCurrent && row.generation === generation,
    retired: row.apiKeyId ? (await ctx.db.get(row.apiKeyId))?.credentialRetiredAt !== undefined : false,
  })));
  return { asOf: Date.now(), generation, ready: access?.bootstrapped ?? false, initialized: access !== null, connections,
    authority: access ? snapshot(access) : null, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const history = query({ args: { connectionId: v.id("aiAccessConnections"), cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const connection = await ctx.db.get(args.connectionId);
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  const page = await ctx.db.query("aiConnectionChanges").withIndex("by_access_created", q => q.eq("accessOwnerId", connection.accessOwnerId)).order("desc").paginate({ numItems: 10, cursor: args.cursor ?? null });
  return { history: page.page, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const change = mutation({ args: {
  connectionId: v.id("aiAccessConnections"), expectedVersion: v.number(), opId: v.string(),
  action: v.union(v.literal("pause"), v.literal("resume"), v.literal("revoke"), v.literal("restore"), v.literal("full"), v.literal("limits")),
  scopes: v.optional(v.array(v.string())), expiresAt: v.optional(v.union(v.number(), v.null())), moveIds: v.optional(v.union(v.array(v.id("moves")), v.null())),
}, handler: async (ctx, { connectionId, ...input }) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const connection = await ctx.db.get(connectionId);
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  return changeByPerson(ctx, connection, input);
} });
