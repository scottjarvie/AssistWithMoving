import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { movingScopes } from "./lib/aiGrants";
import { apiKeyScopes } from "./lib/apiKeys";
import { isRestricted, connectionAccess, ensureAccess, readAccess, accessState, oauthScopes, keyScopes, changeByPerson, snapshot } from "./lib/carriedAccess";

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
  const source = ctx.db.query("aiAccessConnections").withIndex("by_owner_current", q => q.eq("ownerUserId", user._id).eq("isCurrent", !args.superseded));
  const page = await source.order("desc").paginate({ numItems: 25, cursor: args.cursor ?? null });
  const connections = await Promise.all(page.page.map(async row => { const own = access ? connectionAccess(access, row) : null; return ({
    id: row._id, kind: row.kind, label: row.label, version: own?.revision ?? 0,
    scopes: own ? row.kind === "key" ? keyScopes(own) : oauthScopes(own) : [],
    catalog: row.kind === "key" ? [...apiKeyScopes] as string[] : [...movingScopes] as string[],
    expiresAt: own?.endsAt ?? null, pausedAt: own?.pausedAt ?? null,
    status: accessState(own, row), lastUsedAt: row.lastUsedAt ?? null,
    narrowedBy: own?.changedBy ?? null, narrowedAt: own?.changedAt ?? null,
    moveCount: own?.moveIds?.length ?? null, inherited: row.inherited || Boolean(row.pendingFloor && own && isRestricted(own)), isCurrent: row.isCurrent,
    retired: row.apiKeyId ? (await ctx.db.get(row.apiKeyId))?.credentialRetiredAt !== undefined : false,
  }); }));
  return { asOf: Date.now(), generation, ready: access?.bootstrapped ?? false, initialized: access !== null, connections,
    authority: access ? snapshot(access) : null, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const history = query({ args: { connectionId: v.id("aiAccessConnections"), cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const connection = await ctx.db.get(args.connectionId);
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  const page = await ctx.db.query("aiConnectionChanges").withIndex("by_connection_created", q => q.eq("connectionId", String(connection._id))).order("desc").paginate({ numItems: 10, cursor: args.cursor ?? null });
  return { history: page.page, nextCursor: page.isDone ? null : page.continueCursor };
} });
export const change = mutation({ args: {
  connectionId: v.id("aiAccessConnections"), expectedVersion: v.number(), opId: v.string(),
  action: v.union(v.literal("pause"), v.literal("resume"), v.literal("revoke"), v.literal("restore"), v.literal("full"), v.literal("limits"), v.literal("forget")),
  scopes: v.optional(v.array(v.string())), expiresAt: v.optional(v.union(v.number(), v.null())), moveIds: v.optional(v.union(v.array(v.id("moves")), v.null())),
}, handler: async (ctx, { connectionId, ...input }) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const connection = await ctx.db.get(connectionId);
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  return changeByPerson(ctx, connection, input);
} });
