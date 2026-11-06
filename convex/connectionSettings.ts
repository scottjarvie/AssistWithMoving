import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { effectiveScopes, effectiveExpiry, movingScopes } from "./lib/aiGrants";
import { apiKeyScopes, effectiveApiKeyScopes } from "./lib/apiKeys";
import { ownerConnectionGrants, requireGrantEditEligibility } from "./aiGrants";
import { requireHouseholdPermission } from "./lib/permissions";
import { connectionChange, connectionRequest, previousChange } from "./lib/connectionHistory";

export const list = query({ args: {}, handler: async ctx => {
  await requirePersonConnectionManagement(ctx);
  const user = await requireCurrentUser(ctx);
  const grants = await ownerConnectionGrants(ctx, user._id);
  const keys = await ctx.db.query("apiKeys").withIndex("by_created_by", q => q.eq("createdByUserId", user._id)).collect();
  const history = await ctx.db.query("aiConnectionChanges").withIndex("by_owner_created", q => q.eq("ownerUserId", user._id)).order("desc").take(100);
  return { asOf: Date.now(), connections: [...grants.map(row => ({
    id: row._id, kind: "oauth" as const, label: row.label, version: row.version,
    scopes: [...effectiveScopes(row)], catalog: [...movingScopes] as string[], expiresAt: effectiveExpiry(row) ?? null,
    pausedAt: row.pausedAt ?? null, status: row.status, lastUsedAt: row.lastUsedAt ?? null,
    narrowedBy: row.narrowedBy ?? null, narrowedAt: row.narrowedAt ?? null,
  })), ...keys.map(row => ({
    id: row._id, kind: "key" as const, label: row.name, version: row.version ?? 1,
    scopes: effectiveApiKeyScopes(row), catalog: [...apiKeyScopes] as string[], expiresAt: row.expiresAt ?? null,
    pausedAt: row.pausedAt ?? null, status: row.status, lastUsedAt: row.lastUsedAt ?? null,
    narrowedBy: row.narrowedBy ?? null, narrowedAt: row.narrowedAt ?? null,
  }))], history };
} });

export const change = mutation({ args: {
  grantId: v.optional(v.id("aiGrants")), apiKeyId: v.optional(v.id("apiKeys")),
  expectedVersion: v.number(), opId: v.string(), action: v.union(v.literal("pause"), v.literal("resume"), v.literal("revoke"), v.literal("restore"), v.literal("full"), v.literal("limits")),
  scopes: v.optional(v.array(v.string())), expiresAt: v.optional(v.union(v.number(), v.null())),
}, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx);
  const user = await requireCurrentUser(ctx);
  if (Boolean(args.grantId) === Boolean(args.apiKeyId)) throw new ConvexError("Choose one connection.");
  const row = args.grantId ? await ctx.db.get(args.grantId) : await ctx.db.get(args.apiKeyId!);
  if (!row || ("ownerUserId" in row ? row.ownerUserId : row.createdByUserId) !== user._id) throw new ConvexError("Connection unavailable.");
  const replay = await previousChange(ctx, String(row._id), args.opId, "person", args);
  if (replay) return replay.after;
  // A client may have historical spelling aliases. The loaded effective revision,
  // not a raw row revision, is the optimistic concurrency token.
  const current = "ownerUserId" in row && row.clientId ? (await ownerConnectionGrants(ctx, user._id)).find(grant => grant._id === row._id) : row;
  if (!current || current._id !== row._id || (current.version ?? 1) !== args.expectedVersion) throw new ConvexError("This connection changed. Reload Settings.");
  const oauth = "ownerUserId" in row;
  const catalog: readonly string[] = oauth ? movingScopes : apiKeyScopes;
  const held: readonly string[] = "ownerUserId" in current ? effectiveScopes(current) : effectiveApiKeyScopes(current);
  const scopes = args.action === "full" ? [...catalog] : args.scopes ?? [...held];
  if (scopes.some(scope => !catalog.includes(scope))) throw new ConvexError("Unknown power.");
  if (args.expiresAt !== undefined && args.expiresAt !== null && (!Number.isFinite(new Date(args.expiresAt).getTime()) || args.expiresAt <= Date.now())) throw new ConvexError("Choose a future end date.");
  const moveLimits = "ownerUserId" in current ? { moveScope: current.moveScope, moveIds: current.moveIds ?? [] } : { moveId: current.moveId ?? null };
  const before = { ...moveLimits, status: current.status, scopes: [...held], pausedAt: current.pausedAt ?? null, expiresAt: "ownerUserId" in current ? effectiveExpiry(current) ?? null : current.expiresAt ?? null, version: current.version ?? 1 };
  const requestedEnd = args.expiresAt === null ? undefined : args.expiresAt ?? before.expiresAt ?? undefined;
  const widens = scopes.some(scope => !held.includes(scope)) || ["resume", "restore", "full"].includes(args.action) || (before.expiresAt !== null && (requestedEnd === undefined || requestedEnd > before.expiresAt));
  if (widens) {
    if ("ownerUserId" in current) await requireGrantEditEligibility(ctx, user, current, current.moveIds?.[0]);
    else await requireHouseholdPermission(ctx, current.householdId, "api_keys:manage");
  }
  const currentVersion = row.version ?? 1;
  const version = currentVersion < 0 ? currentVersion - 1 : currentVersion + 1;
  const common = {
    scopes, withheldScopes: catalog.filter(scope => !scopes.includes(scope)),
    scopeChoice: scopes.length === catalog.length ? "full" as const : "chosen" as const,
    pausedAt: args.action === "pause" ? Date.now() : args.action === "resume" ? undefined : current.pausedAt,
    status: args.action === "revoke" ? "revoked" as const : args.action === "restore" ? "active" as const : current.status,
    expiresAt: args.expiresAt === null ? undefined : args.expiresAt ?? before.expiresAt ?? undefined,
    revokedAt: args.action === "revoke" ? Date.now() : args.action === "restore" ? undefined : row.revokedAt,
    narrowedBy: "person" as const, narrowedAt: Date.now(), version, updatedAt: Date.now(),
  };
  if (args.grantId) {
    await ctx.db.patch(args.grantId, { ...common, scopes: scopes as typeof movingScopes[number][], ownerDecisionAt: Date.now(), expiryChoice: common.expiresAt === undefined ? "none" : "chosen" });
    // Explicit owner controls apply to every historical spelling of this client.
    if (["restore", "full", "resume"].includes(args.action)) {
      const predecessors = await ctx.db.query("aiGrants").withIndex("by_owner_client_status", q => q.eq("ownerUserId", user._id)).collect();
      await ctx.db.patch(args.grantId, { releasesPredecessors: predecessors.filter(old => old._id !== row._id).map(old => ({ grantId: old._id, version: old.version })) });
    }
    if ("clientId" in row && row.clientId) {
      const history = await ctx.db.query("aiGrants").withIndex("by_owner_client_status", q => q.eq("ownerUserId", user._id)).collect();
      const { sameOAuthClientHistory, oauthClientHistoryKey } = await import("./lib/mcpClientIdentity");
      await ctx.db.patch(args.grantId, { recoveredClientKey: oauthClientHistoryKey(row.clientId) });
      await ctx.db.patch(args.grantId, { reconnectsClientHistory: history.filter(old => old._id !== row._id && old.clientId && sameOAuthClientHistory(old.clientId, row.clientId!)).map(old => ({ grantId: old._id, version: old.version })) });
    }
    const fresh = await ctx.db.get(user._id);
    await ctx.db.patch(user._id, { aiGrantHistoryVersion: (fresh?.aiGrantHistoryVersion ?? 0) + 1 });
  } else await ctx.db.patch(args.apiKeyId!, { ...common, scopes: scopes as typeof apiKeyScopes[number][] });
  const resolvedAfter = args.grantId && "clientId" in row && row.clientId ? (await ownerConnectionGrants(ctx, user._id)).find(grant => grant._id === row._id) : undefined;
  const after = { ...moveLimits, status: common.status, scopes, pausedAt: common.pausedAt ?? null, expiresAt: common.expiresAt ?? null, version: resolvedAfter?.version ?? version };
  await connectionChange(ctx, { ownerUserId: user._id, connectionId: String(row._id), actor: "person", before, after, message: `You chose ${args.action} for this connection.`, opId: args.opId, requestKey: connectionRequest(args) });
  return after;
} });
