/** OAuth metadata and transport adapters. Authority lives only in carriedAccess. */
import { ConvexError, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { describeGrantBoundary, movingScopes, MOVING_TOOL_SCOPES } from "./lib/aiGrants";
import { oauthClientIdFromClaims } from "./lib/mcpClientIdentity";
import { LEGACY_GATEWAY_TOOL_SCOPES, UNIDENTIFIED_LEGACY_CLIENT } from "./lib/mcpLegacyGrantGate";
import { reductionArgs, SETTINGS_REFUSAL, type Reduction } from "./lib/connectionReduction";
import { ensureAccess, readAccess, readConnection, connectOAuth, oauthIdentity, oauthScopes, accessState, narrowConnection, changeByPerson, requireSubject, snapshot, SETTINGS_URL, type Access, type Connection } from "./lib/carriedAccess";
import { safeConnectionText } from "./lib/connectionHistory";
export { listSourceHistory, listReceipts, listHouseholdChoices, listRecoveryHouseholds, listMoveChoices } from "./connectionChoices";

type Ctx = QueryCtx | MutationCtx;
export async function projectedGrant(ctx: Ctx, connection: Connection, knownAccess?: Access | null): Promise<Doc<"aiGrants"> | null> {
  if (!connection.grantId) return null;
  const [grant, access] = await Promise.all([ctx.db.get(connection.grantId), knownAccess === undefined ? ctx.db.get(connection.accessOwnerId) : knownAccess]);
  if (!grant || !access) return null;
  return { ...grant, scopes: oauthScopes(access), withheldScopes: movingScopes.filter(scope => access.withheldScopes.includes(scope)), scopeChoice: access.withheldScopes.some(scope => movingScopes.includes(scope as typeof movingScopes[number])) ? "chosen" : "full", status: access.revoked ? "revoked" : "active", pausedAt: access.pausedAt, expiresAt: access.endsAt, expiryChoice: access.endsAt === undefined ? "none" : "chosen", moveScope: access.moveIds === undefined ? "allMoves" : "selectedMoves", moveIds: access.moveIds, version: access.revision, narrowedBy: access.changedBy === "system" ? undefined : access.changedBy, narrowedAt: access.changedAt };
}
/** Every tool gate uses two indexed reads, never approval/activity history. */
export async function activeGrantsForUser(ctx: Ctx, ownerUserId: Id<"users">, clientId: string | undefined, now: number) {
  if (!clientId) return [];
  const connection = await readConnection(ctx, ownerUserId, oauthIdentity(clientId));
  const access = await readAccess(ctx, ownerUserId);
  if (!connection || accessState(access, connection, now) !== "active") return [];
  const grant = await projectedGrant(ctx, connection, access);
  return grant ? [grant] : [];
}
export const continueBootstrap = internalMutation({ args: { ownerUserId: v.id("users") }, handler: (ctx, args) => ensureAccess(ctx, args.ownerUserId) });
export const touchLegacyConnection = internalMutation({ args: { subject: v.string(), clientId: v.string(), clientName: v.optional(v.string()) }, handler: async (ctx, args) => {
  if (!args.clientId.trim() || args.clientId === UNIDENTIFIED_LEGACY_CLIENT) return { grants: [], block: "unidentifiedClient" as const };
  const user = await ctx.db.query("users").withIndex("by_clerk_user_id", q => q.eq("clerkUserId", args.subject)).unique();
  if (!user || user.status !== "active") return { grants: [], block: "noProfile" as const };
  const { access, connection } = await connectOAuth(ctx, user, args.clientId, args.clientName);
  const state = accessState(access, connection);
  if (state !== "active") return { grants: [], block: state === "initializing" ? "initializing" as const : state === "superseded" ? "superseded" as const : state === "revoked" ? "revoked" as const : state === "paused" ? "paused" as const : "expired" as const };
  const grant = connection ? await projectedGrant(ctx, connection) : null;
  return { grants: grant ? [{ scopes: grant.scopes, withheldScopes: grant.withheldScopes, scopeChoice: grant.scopeChoice, status: grant.status, pausedAt: grant.pausedAt, expiresAt: grant.expiresAt, moveScope: grant.moveScope, moveIds: (grant.moveIds ?? []).map(String) }] : [], block: undefined };
} });
export const grantsForPrincipal = internalQuery({ args: { subject: v.string(), clientId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await ctx.db.query("users").withIndex("by_clerk_user_id", q => q.eq("clerkUserId", args.subject)).unique();
  if (!user || user.status !== "active" || !args.clientId) return { grants: [], scopes: [], connectionState: { status: "noProfile", changedAt: null, expiresAt: null } };
  const [access, connection] = await Promise.all([readAccess(ctx, user._id), readConnection(ctx, user._id, oauthIdentity(args.clientId))]);
  const state = accessState(access, connection);
  const projected = state === "active" && connection ? await projectedGrant(ctx, connection, access) : null;
  const grants = projected ? [projected] : [];
  return { scopes: grants.length && access ? oauthScopes(access) : [], grants: grants.map(grant => ({ grantId: grant._id, version: grant.version, label: grant.label, scopes: grant.scopes, scopeChoice: grant.scopeChoice, moveScope: grant.moveScope, moveIds: grant.moveIds ?? [], expiresAt: grant.expiresAt ?? null, boundClientId: grant.clientId ?? null })), connectionState: { status: state, changedAt: access ? snapshot(access, connection).changedAt ?? null : null, expiresAt: access?.endsAt ?? null } };
} });
async function describe(ctx: Ctx, subject: string, clientId: string, legacy = false) {
  const user = await requireSubject(ctx, subject);
  const [access, connection] = await Promise.all([readAccess(ctx, user._id), readConnection(ctx, user._id, oauthIdentity(clientId))]);
  const status = accessState(access, connection);
  const scopes = access && connection && status === "active" ? oauthScopes(access) : [];
  const catalogue = Object.entries(legacy ? LEGACY_GATEWAY_TOOL_SCOPES : MOVING_TOOL_SCOPES).filter(([name]) => !["describe_connection", "reduce_connection"].includes(name));
  return { version: access?.revision ?? null, status, scopes, pausedAt: access?.pausedAt ?? null, moveRestricted: access?.moveIds !== undefined, expiresAt: access?.endsAt ?? null, changedAt: access ? snapshot(access, connection).changedAt : null,
    tools: ["describe_connection", "reduce_connection", ...catalogue.filter(([, power]) => scopes.includes(power)).map(([name]) => name)],
    heldBack: catalogue.filter(([, power]) => !scopes.includes(power)).map(([tool, missingPower]) => ({ tool, missingPower, reason: status === "active" ? "Power removed" : status })), settings: SETTINGS_URL,
  };
}
export const describeConnection = internalQuery({ args: { subject: v.string(), clientId: v.string() }, handler: (ctx, args) => describe(ctx, args.subject, args.clientId) });
function legacyClient(caller: { claims?: Record<string, unknown> }) {
  const client = oauthClientIdFromClaims(caller.claims);
  if (!client) throw new ConvexError("A verified OAuth client id is required.");
  return client;
}
export const describeLegacyConnection = internalQuery({ args: { caller: mcpCallerValidator }, handler: (ctx, { caller }) => describe(ctx, caller.subject, legacyClient(caller), true) });
export async function reduceOwnConnection(ctx: MutationCtx, subject: string, clientId: string, input: Reduction) {
  const user = await requireSubject(ctx, subject);
  const connection = await readConnection(ctx, user._id, oauthIdentity(clientId));
  if (!connection) throw new ConvexError(SETTINGS_REFUSAL);
  return narrowConnection(ctx, connection, input);
}
export const reduceConnection = internalMutation({ args: { subject: v.string(), clientId: v.string(), ...reductionArgs }, handler: (ctx, { subject, clientId, ...input }) => reduceOwnConnection(ctx, subject, clientId, input) });
export const reduceLegacyConnection = internalMutation({ args: { caller: mcpCallerValidator, ...reductionArgs }, handler: (ctx, { caller, ...input }) => reduceOwnConnection(ctx, caller.subject, legacyClient(caller), input) });
export const noteGrantUse = internalMutation({ args: { subject: v.string(), toolName: v.string(), scope: v.string(), moveId: v.optional(v.id("moves")), clientId: v.string(), clientName: v.optional(v.string()), registrationMethod: v.optional(v.string()), clientMetadataDigest: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await requireSubject(ctx, args.subject);
  const connection = await readConnection(ctx, user._id, oauthIdentity(args.clientId));
  if (!connection) return null;
  await ctx.db.patch(connection._id, { lastUsedAt: Date.now(), lastToolName: args.toolName });
  if (connection.grantId) {
    const grant = await ctx.db.get(connection.grantId);
    if (grant) {
      const method = args.registrationMethod === "clientIdMetadataDocument" || args.registrationMethod === "dynamicClientRegistration" ? args.registrationMethod : undefined;
      await ctx.db.patch(grant._id, { lastUsedAt: Date.now(), lastToolName: args.toolName, useCount: grant.useCount + 1, observedClientName: grant.observedClientName ?? (args.clientName ? safeConnectionText(args.clientName) : undefined), registrationMethod: grant.registrationMethod ?? method, clientMetadataDigest: grant.clientMetadataDigest ?? (args.clientMetadataDigest && /^[a-f0-9]{64}$/.test(args.clientMetadataDigest) ? args.clientMetadataDigest : undefined), updatedAt: Date.now() });
      if (grant.householdId) {
        const receipt = { grantId: grant._id, ownerUserId: user._id, householdId: grant.householdId, outcome: "recorded" as const, createdAt: Date.now() };
        if (!grant.registrationMethod && method) await ctx.db.insert("aiGrantActivities", { ...receipt, type: "clientBound", message: "Verified client metadata recorded for this connection." });
        await ctx.db.insert("aiGrantActivities", { ...receipt, type: "scopeUsed", toolName: safeConnectionText(args.toolName), scope: args.scope as typeof movingScopes[number], message: `Your AI used ${safeConnectionText(args.toolName)}.` });
      }
    }
  }
  return { grantId: connection.grantId };
} });
export const noteGrantRefusal = internalMutation({ args: { subject: v.string(), toolName: v.string(), refusalCode: v.string(), scope: v.optional(v.string()), clientId: v.string(), clientName: v.optional(v.string()) }, handler: async (ctx, args) => {
  const user = await requireSubject(ctx, args.subject);
  const connection = await readConnection(ctx, user._id, oauthIdentity(args.clientId));
  const grant = connection?.grantId ? await ctx.db.get(connection.grantId) : null;
  if (grant?.householdId) await ctx.db.insert("aiGrantActivities", { grantId: grant._id, ownerUserId: user._id, householdId: grant.householdId, type: "refused", outcome: "refused", toolName: safeConnectionText(args.toolName), message: `Refused ${safeConnectionText(args.toolName)}: ${safeConnectionText(args.refusalCode)}.`, createdAt: Date.now() });
  return null;
} });
export const describeBoundary = query({ args: {}, handler: () => describeGrantBoundary() });
/** Compatibility inspection is paginated too. No capped read decides access. */
export const listMine = query({ args: { cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const access = await readAccess(ctx, user._id);
  const page = await ctx.db.query("aiAccessConnections").withIndex("by_owner_generation", q => q.eq("ownerUserId", user._id).eq("generation", access?.currentGeneration ?? 0).eq("isCurrent", true)).paginate({ numItems: 25, cursor: args.cursor ?? null });
  const grants = [];
  for (const connection of page.page) if (connection.kind === "oauth") {
    const grant = await projectedGrant(ctx, connection, access);
    if (grant) grants.push({ ...grant, grantId: grant._id, status: accessState(access, connection), expiresAt: access?.endsAt ?? null, effectiveAuthority: access ? { ...snapshot(access, connection), moveScope: access.moveIds === undefined ? "allMoves" : "selectedMoves", moveIds: access.moveIds ?? [] } : null });
  }
  return { ...describeGrantBoundary(), grants, nextCursor: page.isDone ? null : page.continueCursor, historyFingerprint: String(access?.revision ?? 0), recoveryFingerprint: String(access?.revision ?? 0), historyAtCapacity: false, historyOverflow: false, activeCount: grants.filter(row => row.status === "active").length, maxActive: null };
} });
export const listActivity = query({ args: { grantId: v.optional(v.id("aiGrants")), limit: v.optional(v.number()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const rows = await ctx.db.query("aiGrantActivities").withIndex("by_owner_created", q => q.eq("ownerUserId", user._id)).order("desc").paginate({ numItems: Math.min(Math.max(args.limit ?? 25, 1), 100), cursor: null });
  return { activity: rows.page.filter(row => !args.grantId || row.grantId === args.grantId) };
} });
// Old forms cannot issue unbound approvals. Connecting itself issues full
// access; existing connection edits continue through the same authority.
export const approve = mutation({ args: { householdId: v.id("households"), label: v.string(), reconnectGrantId: v.optional(v.id("aiGrants")), scopes: v.optional(v.array(v.string())), moveScope: v.optional(v.string()), moveIds: v.optional(v.array(v.id("moves"))), expiresInDays: v.optional(v.number()), consentPolicyVersion: v.optional(v.string()), catalogFingerprint: v.optional(v.string()), scopeIntent: v.optional(v.string()), expiryIntent: v.optional(v.string()), expectedHistoryFingerprint: v.optional(v.string()), expectedRecoveryFingerprint: v.optional(v.string()), eligibilityMoveId: v.optional(v.id("moves")), note: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx);
  const access = await ensureAccess(ctx, user._id);
  if (!args.reconnectGrantId) throw new ConvexError("Your AI receives full access when it connects. Use the existing connection's controls to restore access.");
  const connection = await ctx.db.query("aiAccessConnections").withIndex("by_grant", q => q.eq("grantId", args.reconnectGrantId)).unique();
  if (!connection || connection.ownerUserId !== user._id || String(access.revision) !== (args.expectedRecoveryFingerprint ?? args.expectedHistoryFingerprint)) throw new ConvexError("This connection changed. Reload Settings.");
  await changeByPerson(ctx, connection, { action: "restore", opId: `legacy-restore:${connection._id}:${access.revision}`, expectedVersion: access.revision });
  return { grantId: args.reconnectGrantId };
} });
export const revoke = mutation({ args: { grantId: v.id("aiGrants"), expectedVersion: v.number(), expectedRecoveryFingerprint: v.optional(v.string()), reason: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx); await ensureAccess(ctx, user._id);
  const connection = await ctx.db.query("aiAccessConnections").withIndex("by_grant", q => q.eq("grantId", args.grantId)).unique();
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  await changeByPerson(ctx, connection, { expectedVersion: args.expectedVersion, opId: `legacy-revoke:${args.grantId}:${args.expectedVersion}`, action: "revoke" });
  return { grantId: args.grantId, alreadyRevoked: false };
} });
export const updateLimits = mutation({ args: { grantId: v.id("aiGrants"), expectedVersion: v.number(), expectedRecoveryFingerprint: v.optional(v.string()), scopes: v.optional(v.array(v.string())), moveScope: v.optional(v.string()), moveIds: v.optional(v.array(v.id("moves"))), expiresInDays: v.optional(v.union(v.number(), v.null())), consentPolicyVersion: v.optional(v.string()), catalogFingerprint: v.optional(v.string()), scopeIntent: v.optional(v.string()), expiryIntent: v.optional(v.string()), eligibilityMoveId: v.optional(v.id("moves")) }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const user = await requireCurrentUser(ctx); await ensureAccess(ctx, user._id);
  const connection = await ctx.db.query("aiAccessConnections").withIndex("by_grant", q => q.eq("grantId", args.grantId)).unique();
  if (!connection || connection.ownerUserId !== user._id) throw new ConvexError("Connection unavailable.");
  await changeByPerson(ctx, connection, { expectedVersion: args.expectedVersion, opId: `legacy-limit:${connection._id}:${args.expectedVersion}`, action: "limits", scopes: args.scopes, expiresAt: args.expiresInDays === null ? null : args.expiresInDays === undefined ? undefined : Date.now() + args.expiresInDays * 86400000, moveIds: args.moveScope === "allMoves" ? null : args.moveIds });
  return { grantId: args.grantId };
} });
export const cleanupExpiredActivity = internalMutation({ args: { now: v.optional(v.number()), limit: v.optional(v.number()) }, handler: async (ctx, args) => {
  const page = await ctx.db.query("aiGrantActivities").withIndex("by_expires", q => q.lt("expiresAt", args.now ?? Date.now())).paginate({ numItems: Math.min(args.limit ?? 100, 500), cursor: null });
  for (const row of page.page) await ctx.db.delete(row._id);
  return { deleted: page.page.length, hasMore: !page.isDone };
} });
