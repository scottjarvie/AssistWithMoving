import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { movingScopes, effectiveScopes, effectiveExpiry, buildConsentSnapshot, GRANT_BOUNDARY_VERSION } from "./aiGrants";
import { apiKeyScopes, effectiveApiKeyScopes, type ApiKeyScope } from "./apiKeys";
import { oauthClientHistoryKey } from "./mcpClientIdentity";
import { connectionChange, connectionRequest, previousChange, safeConnectionText } from "./connectionHistory";
import { SETTINGS_REFUSAL, reducedAccess, type Reduction } from "./connectionReduction";
import { requireHouseholdPermission } from "./permissions";
import { resolveMoveAccess } from "./moveAccess";

type Ctx = QueryCtx | MutationCtx;
export type Access = Doc<"aiAccessOwners">;
export type Connection = Doc<"aiAccessConnections">;
type Entry = Access["entries"][number];
type Limits = Pick<Access, "withheldScopes" | "revoked" | "revokedAt" | "pausedAt" | "endsAt" | "moveIds">;
const bootstrapRef = makeFunctionReference<"mutation", { ownerUserId: Id<"users"> }>("aiGrants:continueBootstrap");
export const SETTINGS_URL = "https://movingmanifest.com/settings/ai";

// API keys expose coarser operations than canonical MCP. Cross-door projection
// is deliberately conservative; a narrower API category never opens an OAuth
// power, and a removed OAuth power never leaks through an API alias.
const peers: Record<string, readonly string[]> = {
  "moving.context.read": ["moves/read", "inventory/read", "plans/read", "exports/read", "members/manage"],
  "moving.evidence.read": ["inventory/read"],
  "moving.work.write": ["moves/write", "inventory/write", "plans/write", "photos/write", "exports/create"],
  "moving.queue.work": ["queue/read", "queue/write"],
  "moving.archive": ["moves/write", "inventory/write", "plans/write"],
};
export function expandRemoved(scopes: readonly string[]) {
  const result = new Set(scopes);
  for (const scope of scopes) {
    if (peers[scope]) for (const peer of peers[scope]) result.add(peer);
    else for (const [power, keys] of Object.entries(peers)) if (keys.includes(scope)) result.add(power);
  }
  return [...result].sort();
}
export function oauthScopes(access: Pick<Access, "withheldScopes">) { return movingScopes.filter(scope => !access.withheldScopes.includes(scope)); }
export function keyScopes(access: Pick<Access, "withheldScopes">): ApiKeyScope[] { return apiKeyScopes.filter(scope => !access.withheldScopes.includes(scope)); }
function policy(access: Access) {
  return { withheldScopes: access.withheldScopes, revoked: access.revoked, revokedAt: access.revokedAt, pausedAt: access.pausedAt, endsAt: access.endsAt, moveIds: access.moveIds, revision: access.revision, changedBy: access.changedBy, changedAt: access.changedAt };
}
export function connectionAccess(root: Access, connection: Connection): Access {
  let own = connection.policy ?? { ...policy(root), revoked: root.revoked || !connection.isCurrent || connection.generation !== root.currentGeneration };
  if (connection.pendingFloor) own = { ...own, ...meet(own, { ...sourceEntry("bootstrap", 0, root.bootstrapFloor ?? root), ...root.bootstrapFloor }) };
  return { ...root, ...own, pausedAt: own.pausedAt, endsAt: own.endsAt, moveIds: own.moveIds, revokedAt: own.revokedAt };
}
async function finalizeConnection(ctx: MutationCtx, root: Access, connection: Connection) {
  if (!connection.policy || (connection.pendingFloor && root.bootstrapped)) {
    const own = connectionAccess(root, connection);
    await ctx.db.patch(connection._id, { policy: policy(own), pendingFloor: !root.bootstrapped, inherited: connection.inherited || (connection.pendingFloor && isRestricted(own)), inheritedSources: (connection.pendingFloor ? root.bootstrapSources : connection.inheritedSources) ?? root.entries.map(({sourceGrantId,sourceRevision}) => ({sourceGrantId,sourceRevision})) });
    if (root.bootstrapped && isRestricted(own)) {
      const source = String(connection.grantId ?? connection.apiKeyId ?? connection._id);
      await writeFloor(ctx, root, [...root.entries.filter(row => row.sourceGrantId !== source), sourceEntry(source, own.revision, own)]);
    }
    return (await ctx.db.get(connection._id))!;
  }
  return connection;
}
async function writeFloor(ctx: MutationCtx, root: Access, entries: Entry[]) {
  let limits: Limits = { withheldScopes: [], revoked: false, revokedAt: undefined, pausedAt: undefined, endsAt: undefined, moveIds: undefined };
  for (const entry of entries) limits = meet(limits, entry);
  await ctx.db.patch(root._id, { ...limits, entries, revision: root.revision + 1 });
}
export function accessState(access: Access | null, connection?: Connection | null, now = Date.now()): string {
  if (!access || !access.bootstrapped) return "initializing";
  if (connection === null) return "unconnected";
  if (connection && (!connection.isCurrent || connection.forgottenAt !== undefined)) return "superseded";
  if (access.revoked) return "revoked";
  if (access.pausedAt !== undefined) return "paused";
  if (access.endsAt !== undefined && access.endsAt <= now) return "expired";
  return "active";
}
export function isRestricted(access: Limits) { return access.revoked || access.pausedAt !== undefined || access.endsAt !== undefined || access.withheldScopes.length > 0 || access.moveIds !== undefined; }
export async function readAccess(ctx: Ctx, ownerUserId: Id<"users">) {
  return ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", ownerUserId)).unique();
}
export async function readConnection(ctx: Ctx, ownerUserId: Id<"users">, verifiedClientId: string) {
  return ctx.db.query("aiAccessConnections").withIndex("by_owner_client", q => q.eq("ownerUserId", ownerUserId).eq("verifiedClientId", verifiedClientId)).unique();
}
export function oauthIdentity(clientId: string) {
  if (!clientId.trim() || clientId === "legacy:unidentified-client") throw new ConvexError("A verified OAuth client id is required.");
  return `oauth:${oauthClientHistoryKey(clientId)}`;
}
function legacyIdentity(grant: Doc<"aiGrants">) {
  try { return grant.clientId && grant.clientId !== "legacy:unidentified-client" ? oauthIdentity(grant.clientId) : `legacy:${grant._id}`; }
  catch { return `legacy:${grant._id}`; }
}
function meet(a: Limits, b: Entry): Limits {
  return {
    withheldScopes: [...new Set([...a.withheldScopes, ...b.withheldScopes])].sort(),
    revoked: a.revoked || b.revoked,
    revokedAt: b.revoked && b.revokedAt !== undefined ? Math.min(a.revokedAt ?? Infinity, b.revokedAt) : a.revokedAt,
    pausedAt: a.pausedAt === undefined ? b.pausedAt : b.pausedAt === undefined ? a.pausedAt : Math.min(a.pausedAt, b.pausedAt),
    endsAt: a.endsAt === undefined ? b.endsAt : b.endsAt === undefined ? a.endsAt : Math.min(a.endsAt, b.endsAt),
    moveIds: a.moveIds === undefined ? b.moveIds : b.moveIds === undefined ? a.moveIds : a.moveIds.filter(id => b.moveIds!.includes(id)),
  };
}
function sourceEntry(sourceGrantId: string, sourceRevision: number, limits: Limits): Entry {
  return { sourceGrantId, sourceRevision, withheldScopes: limits.withheldScopes, revoked: limits.revoked, revokedAt: limits.revokedAt, pausedAt: limits.pausedAt, endsAt: limits.endsAt, moveIds: limits.moveIds };
}
function addEntry(access: Access, entry: Entry): Access {
  const prior = access.entries.find(row => row.sourceGrantId === entry.sourceGrantId);
  if (prior && prior.sourceRevision > entry.sourceRevision) return access;
  return { ...access, ...meet(access, entry), entries: [...access.entries.filter(row => row.sourceGrantId !== entry.sourceGrantId), entry] };
}
async function legacyGrantLimits(ctx: MutationCtx, grant: Doc<"aiGrants">): Promise<Limits> {
  let scopes = effectiveScopes(grant);
  let endsAt = effectiveExpiry(grant);
  const unchanged = grant.version === 1 && grant.status === "active" && grant.pausedAt === undefined && grant.ownerDecisionAt === undefined && grant.narrowedBy === undefined && grant.scopeChoice !== "chosen" && !grant.withheldScopes?.length && grant.moveScope === "allMoves";
  const oldDefault = grant.scopeChoice === undefined && grant.scopes.length === 4 && ["moving.context.read", "moving.evidence.read", "moving.work.write", "moving.queue.work"].every(scope => grant.scopes.includes(scope as typeof movingScopes[number])) && grant.expiresAt === grant.approvedAt + 30 * 86400000;
  if (unchanged && (grant.expiryChoice === "automatic" || oldDefault)) {
    // One immutable issuance receipt proves the old automatic default. This is
    // bootstrap-only; no later permission check consults activities or history.
    const issued = await ctx.db.query("aiGrantActivities").withIndex("by_grant_created", q => q.eq("grantId", grant._id)).order("asc").first();
    if (grant.expiryChoice === "automatic" || (issued?.type === "approved" && issued.message.includes("connected by signing in"))) { scopes = movingScopes; endsAt = undefined; }
  }
  return { withheldScopes: expandRemoved(movingScopes.filter(scope => !scopes.includes(scope))), revoked: grant.status === "revoked", revokedAt: grant.revokedAt, pausedAt: grant.pausedAt, endsAt, moveIds: grant.moveScope === "selectedMoves" ? grant.moveIds ?? [] : undefined };
}
function legacyKeyLimits(key: Doc<"apiKeys">): Limits {
  const scopes = effectiveApiKeyScopes(key);
  return { withheldScopes: expandRemoved(apiKeyScopes.filter(scope => !scopes.includes(scope))), revoked: key.status === "revoked", revokedAt: key.revokedAt, pausedAt: key.pausedAt, endsAt: key.expiresAt, moveIds: key.moveId ? [key.moveId] : undefined };
}
async function seedConnection(ctx: MutationCtx, access: Access, input: {
  verifiedClientId: string; kind: "oauth" | "key"; label: string;
  grantId?: Id<"aiGrants">; apiKeyId?: Id<"apiKeys">; lastUsedAt?: number; lastToolName?: string;
  policy?: Connection["policy"]; ownBaseline?: Connection["policy"]; pendingFloor?: boolean; inherited?: boolean; inheritedSources?: Connection["inheritedSources"];
}) {
  const existing = await readConnection(ctx, access.ownerUserId, input.verifiedClientId);
  if (existing) {
    if (input.policy && input.grantId && (await ctx.db.get(input.grantId))!._creationTime < access._creationTime) {
      const base = existing.pendingFloor ? existing.ownBaseline ?? input.policy : existing.policy ?? input.policy;
      const combined = { ...base, ...meet(base, sourceEntry(String(input.grantId), input.policy.revision, input.policy)), revision: Math.max(base.revision, input.policy.revision) };
      await ctx.db.patch(existing._id, { policy: combined, ownBaseline: combined, pendingFloor: false, inherited: false, inheritedSources: [...(existing.pendingFloor ? [] : existing.inheritedSources ?? []), { sourceGrantId: String(input.grantId), sourceRevision: input.policy.revision }] });
    }
    return false;
  }
  await ctx.db.insert("aiAccessConnections", { ...input, inheritedSources: input.inheritedSources ?? (input.policy ? [{ sourceGrantId: String(input.grantId ?? input.apiKeyId), sourceRevision: input.policy.revision }] : []), ownerUserId: access.ownerUserId, accessOwnerId: access._id, label: safeConnectionText(input.label), isCurrent: true, generation: access.currentGeneration, createdAt: Date.now() });
  return true;
}

/** The sole legacy traversal. It is paginated, checkpointed and never capped.
 * No access is granted until BOTH grant and key streams are completely read.
 * Every subsequent connect reads this durable record, never legacy history. */
export async function ensureAccess(ctx: MutationCtx, ownerUserId: Id<"users">): Promise<Access> {
  let access = await readAccess(ctx, ownerUserId);
  if (access?.bootstrapped) return access;
  if (!access) {
    const [legacyGrant, legacyKey] = await Promise.all([
      ctx.db.query("aiGrants").withIndex("by_owner_created", q => q.eq("ownerUserId", ownerUserId)).first(),
      ctx.db.query("apiKeys").withIndex("by_created_by", q => q.eq("createdByUserId", ownerUserId)).first(),
    ]);
    const empty = !legacyGrant && !legacyKey;
    const id = await ctx.db.insert("aiAccessOwners", { ownerUserId, bootstrapped: empty, grantsDone: empty, keysDone: empty, grantCursor: null, keyCursor: null, revision: empty ? 1 : 0, currentGeneration: 0, connectionCount: 0, withheldScopes: [], revoked: false, entries: [], changedBy: "system", changedAt: Date.now(), createdAt: Date.now() });
    access = (await ctx.db.get(id))!;
    if (empty) return access;
  }
  let next = access;
  if (!access.grantsDone) {
    const page = await ctx.db.query("aiGrants").withIndex("by_owner_created", q => q.eq("ownerUserId", ownerUserId)).paginate({ numItems: 100, cursor: access.grantCursor });
    for (const grant of page.page) {
      const limits = await legacyGrantLimits(ctx, grant);
      if (isRestricted(limits)) next = addEntry(next, sourceEntry(String(grant._id), grant.version, limits));
      {
        const created = await seedConnection(ctx, next, { verifiedClientId: legacyIdentity(grant), kind: "oauth", label: grant.observedClientName ?? grant.label, grantId: grant._id, policy: { ...policy(next), ...limits, revision: grant.version }, lastUsedAt: grant.lastUsedAt, lastToolName: grant.lastToolName });
        if (created) next = { ...next, connectionCount: next.connectionCount + 1 };
      }
      await ctx.db.patch(grant._id, { accessOwnerId: access._id });
    }
    next = { ...next, grantsDone: page.isDone, grantCursor: page.isDone ? null : page.continueCursor };
  }
  else if (!access.keysDone) {
    const page = await ctx.db.query("apiKeys").withIndex("by_created_by", q => q.eq("createdByUserId", ownerUserId)).paginate({ numItems: 100, cursor: access.keyCursor });
    for (const key of page.page) {
      const limits = legacyKeyLimits(key);
      if (isRestricted(limits)) next = addEntry(next, sourceEntry(String(key._id), key.version ?? 1, limits));
      const created = await seedConnection(ctx, next, { verifiedClientId: `key:${key._id}`, kind: "key", label: key.name, apiKeyId: key._id, policy: { ...policy(next), ...limits, revision: key.version ?? 1 }, lastUsedAt: key.lastUsedAt, lastToolName: key.lastUsedAction });
      if (created) next = { ...next, connectionCount: next.connectionCount + 1 };
      await ctx.db.patch(key._id, { accessOwnerId: access._id });
      if (key.rotatedFromApiKeyId) {
        const old = await readConnection(ctx, ownerUserId, `key:${key.rotatedFromApiKeyId}`);
        if (old) await ctx.db.patch(old._id, { isCurrent: false, generation: -1, supersededAt: key.createdAt });
        await ctx.db.patch(key.rotatedFromApiKeyId, { credentialRetiredAt: key.createdAt });
      }
    }
    next = { ...next, keysDone: page.isDone, keyCursor: page.isDone ? null : page.continueCursor };
  }
  const bootstrapped = next.grantsDone && next.keysDone;

  const { _id, _creationTime, ...fields } = next;
  void _creationTime;
  await ctx.db.patch(_id, { ...fields, bootstrapSources: bootstrapped ? next.entries.map(({sourceGrantId,sourceRevision}) => ({sourceGrantId,sourceRevision})) : undefined, bootstrapFloor: bootstrapped ? policy(next) : undefined, bootstrapped, revision: next.revision + 1, bootstrappedAt: bootstrapped ? Date.now() : undefined, changedAt: Date.now() });
  const persisted = (await ctx.db.get(access._id))!;
  await connectionChange(ctx, { ownerUserId, accessOwnerId: access._id, connectionId: String(access._id), actor: "system", before: snapshot(access), after: snapshot(persisted), message: bootstrapped ? "Earlier grant and key limits have been completely checked and retained." : "Earlier limits are being retained; access stays stopped until every record has been checked.", opId: `bootstrap:${persisted.revision}` });
  if (!bootstrapped) await ctx.scheduler.runAfter(0, bootstrapRef, { ownerUserId });
  return (await ctx.db.get(access._id))!;
}
export async function connectOAuth(ctx: MutationCtx, user: Doc<"users">, clientId: string, clientName?: string) {
  const identity = oauthIdentity(clientId);
  let access = await ensureAccess(ctx, user._id);
  let connection = await readConnection(ctx, user._id, identity);
  if (connection) { connection = await finalizeConnection(ctx, access, connection); return { access: connectionAccess(access, connection), connection }; }
  const membership = await ctx.db.query("householdMemberships").withIndex("by_user_status", q => q.eq("userId", user._id).eq("status", "active")).first();
  const label = safeConnectionText(clientName ?? "Your AI").slice(0, 80);
  const grantId = await ctx.db.insert("aiGrants", { ownerUserId: user._id, householdId: membership?.householdId, accessOwnerId: access._id, clientId: oauthClientHistoryKey(clientId), observedClientName: clientName ? safeConnectionText(clientName) : undefined, label, scopes: [...movingScopes], scopeChoice: "full", expiryChoice: "none", moveScope: "allMoves", status: "active", consentBoundaryVersion: GRANT_BOUNDARY_VERSION, consentSnapshot: buildConsentSnapshot([...movingScopes]), approvedAt: Date.now(), useCount: 0, version: 1, createdAt: Date.now(), updatedAt: Date.now() });
  await seedConnection(ctx, access, { verifiedClientId: identity, kind: "oauth", label, grantId, ownBaseline: { ...policy(access), withheldScopes: [], revoked: false, revokedAt: undefined, pausedAt: undefined, endsAt: undefined, moveIds: undefined, revision: 1 }, policy: { ...policy(access), revision: 1 }, pendingFloor: !access.bootstrapped, inherited: isRestricted(access), inheritedSources: access.entries.map(({sourceGrantId,sourceRevision}) => ({sourceGrantId,sourceRevision})) });
  connection = (await readConnection(ctx, user._id, identity))!;

  if (access.bootstrapped && isRestricted(access)) access = addEntry(access, sourceEntry(String(grantId), 1, access));
  await ctx.db.patch(access._id, { ...policy(access), entries: access.entries, currentGeneration: access.currentGeneration, connectionCount: access.connectionCount + 1, latestRegistrationId: connection._id, revision: access.connectionCount ? access.revision + 1 : access.revision });
  access = (await ctx.db.get(access._id))!;
  await connectionChange(ctx, { ownerUserId: user._id, accessOwnerId: access._id, connectionId: String(connection._id), actor: "system", before: null, after: snapshot(access, connection), message: !access.bootstrapped ? "Earlier connection limits are being checked; access remains stopped until completion." : isRestricted(access) ? "This registration carries the earlier AI limits. Started with the limits of your most limited AI." : "Connected with full access, including future tools, and no end date.", opId: `connect:${connection._id}` });
  return { access: connectionAccess(access, (await ctx.db.get(connection._id))!), connection: (await ctx.db.get(connection._id))! };
}
export async function connectKey(ctx: MutationCtx, key: Doc<"apiKeys">, inheritOnly = false) {
  let access = await ensureAccess(ctx, key.createdByUserId);
  let connection = await readConnection(ctx, key.createdByUserId, `key:${key._id}`);
  if (!connection) {
    const legacy = key._creationTime < access._creationTime;
    let initial = legacy ? { ...access, withheldScopes: [], revoked: false, revokedAt: undefined, pausedAt: undefined, endsAt: undefined, moveIds: undefined } : access;
    if (inheritOnly && key.rotatedFromApiKeyId) {
      const predecessor = await readConnection(ctx, key.createdByUserId, `key:${key.rotatedFromApiKeyId}`);
      if (predecessor) initial = { ...access, ...meet(access, sourceEntry(String(predecessor.apiKeyId), 1, connectionAccess(access, predecessor))) };
    }
    const limits = legacyKeyLimits(key);
    initial = { ...initial, ...meet(initial, sourceEntry(String(key._id), 1, limits)) };
    await seedConnection(ctx, access, { verifiedClientId: `key:${key._id}`, kind: "key", label: key.name, apiKeyId: key._id, ownBaseline: { ...policy(initial), ...limits }, policy: { ...policy(initial), revision: 1 }, pendingFloor: !legacy && !access.bootstrapped, inherited: !legacy && isRestricted(access), inheritedSources: legacy ? [] : access.entries.map(({sourceGrantId,sourceRevision}) => ({sourceGrantId,sourceRevision})) });
    connection = (await readConnection(ctx, key.createdByUserId, `key:${key._id}`))!;
    if (!inheritOnly && isRestricted(initial)) access = addEntry(access, sourceEntry(String(key._id), 1, initial));
    const { _id, _creationTime, ...fields } = access; void _creationTime;
    await ctx.db.patch(_id, { ...fields, currentGeneration: access.currentGeneration, connectionCount: access.connectionCount + 1, latestRegistrationId: connection._id, revision: access.connectionCount ? access.revision + 1 : access.revision });
    await ctx.db.patch(key._id, { accessOwnerId: access._id });
    access = (await ctx.db.get(access._id))!;
  }
  connection = await finalizeConnection(ctx, access, connection);
  return { access: connectionAccess(access, connection), connection };
}
export function snapshot(access: Access, connection?: Connection | null) {
  const state = accessState(access, connection);
  return { version: access.revision, status: state, state, scopes: connection?.kind === "key" ? keyScopes(access) : oauthScopes(access), withheldScopes: access.withheldScopes, pausedAt: access.pausedAt ?? null, expiresAt: access.endsAt ?? null, moveIds: access.moveIds ?? null, bootstrapped: access.bootstrapped, changedAt: access.revoked ? access.revokedAt ?? null : access.pausedAt ?? (state === "expired" ? access.endsAt : access.changedAt), carriedSources: access.entries.map(row => ({ sourceGrantId: row.sourceGrantId, sourceRevision: row.sourceRevision })) };
}
async function validateMoves(ctx: MutationCtx, userId: Id<"users">, moveIds: readonly string[], connection: Connection) {
  for (const value of moveIds) {
    const id = ctx.db.normalizeId("moves", value);
    if (!id) throw new ConvexError("Choose an accessible move.");
    const move = await ctx.db.get(id);
    if (!move || move.status === "archived" || move.archivedAt !== undefined || (await ctx.db.get(move.householdId))?.archivedAt !== undefined) throw new ConvexError("Choose an active accessible move.");
    await resolveMoveAccess(ctx, userId, move.householdId, id);
    if (connection.apiKeyId) {
      const key = await ctx.db.get(connection.apiKeyId);
      if (key?.householdId !== move.householdId) throw new ConvexError("This key is restricted to its household.");
    }
  }
}
export async function narrowConnection(ctx: MutationCtx, connection: Connection, input: Reduction) {
  const root = (await ctx.db.get(connection.accessOwnerId))!;
  connection = await finalizeConnection(ctx, root, connection);
  let access = connectionAccess(root, connection);
  const replay = await previousChange(ctx, String(connection._id), input.opId, "ai", input);
  if (replay) return { version: replay.after.version as number, receipt: replay._id, settings: SETTINGS_URL };
  const before = snapshot(access, connection);
  const catalog: readonly string[] = connection.kind === "key" ? apiKeyScopes : movingScopes;
  const held = connection.kind === "key" ? keyScopes(access) : oauthScopes(access);
  reducedAccess({ version: access.revision, scopes: held, expiresAt: access.endsAt, moveIds: access.moveIds?.map(String), active: true }, input);
  if (input.moveIds) {
    if (connection.kind === "key" && input.moveIds.length !== 1) throw new ConvexError("This door can narrow to one move. Preserve the existing selection or choose one move.");
    await validateMoves(ctx, access.ownerUserId, input.moveIds, connection);
  }
  const now = Date.now();
  const patch = {
    withheldScopes: input.scopes ? [...new Set([...access.withheldScopes, ...expandRemoved(catalog.filter(scope => !input.scopes!.includes(scope)))])].sort() : access.withheldScopes,
    pausedAt: input.action === "pause" ? access.pausedAt ?? now : access.pausedAt,
    revoked: access.revoked || input.action === "revoke", revokedAt: input.action === "revoke" ? now : access.revokedAt,
    endsAt: input.expiresAt === undefined ? access.endsAt : input.expiresAt!,
    moveIds: input.moveIds === undefined ? access.moveIds : input.moveIds as Id<"moves">[],
    revision: access.revision + 1, changedAt: now, changedBy: "ai" as const,
  };
  const next = { ...access, ...patch };
  const sourceId = String(connection.grantId ?? connection.apiKeyId ?? connection._id);
  const entry = sourceEntry(sourceId, patch.revision, next);
  const baseline = connection.ownBaseline ?? connection.policy ?? policy(access);
  await ctx.db.patch(connection._id, { policy: policy(next), ownBaseline: { ...baseline, revision: next.revision, changedBy: "ai", changedAt: now,
    withheldScopes: input.scopes ? expandRemoved(catalog.filter(scope => !input.scopes!.includes(scope))) : baseline.withheldScopes,
    pausedAt: input.action === "pause" ? baseline.pausedAt ?? now : baseline.pausedAt,
    revoked: baseline.revoked || input.action === "revoke", revokedAt: input.action === "revoke" ? now : baseline.revokedAt,
    endsAt: input.expiresAt === undefined ? baseline.endsAt : input.expiresAt!, moveIds: input.moveIds === undefined ? baseline.moveIds : input.moveIds as Id<"moves">[],
  } });
  await writeFloor(ctx, root, [...root.entries.filter(row => row.sourceGrantId !== sourceId), entry]);
  access = next;
  const receipt = await connectionChange(ctx, { ownerUserId: access.ownerUserId, accessOwnerId: access._id, connectionId: String(connection._id), actor: "ai", before, after: snapshot(access, connection), message: `Your AI ${input.action ?? "narrowed"} its access. New connections will inherit this limit.`, opId: input.opId, requestKey: connectionRequest(input) });
  return { version: access.revision, receipt, settings: SETTINGS_URL };
}
export type PersonChange = {
  expectedVersion: number; opId: string; action: "pause" | "resume" | "revoke" | "restore" | "full" | "limits" | "forget";
  scopes?: string[]; expiresAt?: number | null; moveIds?: Id<"moves">[] | null;
};
export async function changeByPerson(ctx: MutationCtx, connection: Connection, input: PersonChange) {
  const root = (await ctx.db.get(connection.accessOwnerId))!;
  connection = await finalizeConnection(ctx, root, connection);
  let access = connectionAccess(root, connection);
  const replay = await previousChange(ctx, String(connection._id), input.opId, "person", input);
  if (replay) return replay.after;
  if (access.revision !== input.expectedVersion) throw new ConvexError("This connection changed. Reload Settings.");
  const originalInput = { ...input };
  const originalAccess = access;
  if (input.action === "forget" && !access.revoked) throw new ConvexError("Only revoked connections can be forgotten.");
  if (input.action === "restore" && connection.inherited) {
    // Releasing inherited floor limits is an explicit person widening. Own
    // changes made after connection are preserved through the saved policy.
    if (connection.ownBaseline) access = { ...access, ...connection.ownBaseline, endsAt: connection.ownBaseline.endsAt, pausedAt: connection.ownBaseline.pausedAt, moveIds: connection.ownBaseline.moveIds, revokedAt: connection.ownBaseline.revokedAt, revision: access.revision };
    else access = { ...access, withheldScopes: [], revoked: false, revokedAt: undefined, pausedAt: undefined, endsAt: undefined, moveIds: undefined };
  }
  const catalog: readonly string[] = connection.kind === "key" ? apiKeyScopes : movingScopes;
  if (input.scopes?.some(scope => !catalog.includes(scope))) throw new ConvexError("Unknown power.");
  if (input.expiresAt !== undefined && input.expiresAt !== null && (!Number.isFinite(new Date(input.expiresAt).getTime()) || input.expiresAt <= Date.now())) throw new ConvexError("Choose a supported future end date.");
  if (input.moveIds) await validateMoves(ctx, access.ownerUserId, input.moveIds, connection);
  const touched = new Set(expandRemoved(catalog));
  const withheldScopes = input.action === "full" ? [] : input.scopes === undefined ? access.withheldScopes : [...new Set([...access.withheldScopes.filter(scope => !touched.has(scope)), ...expandRemoved(catalog.filter(scope => !input.scopes!.includes(scope)))])].sort();
  const next: Access = { ...access, withheldScopes,
    pausedAt: input.action === "pause" ? access.pausedAt ?? Date.now() : input.action === "resume" ? undefined : access.pausedAt,
    revoked: input.action === "revoke" ? true : input.action === "restore" ? false : access.revoked,
    revokedAt: input.action === "revoke" ? Date.now() : input.action === "restore" ? undefined : access.revokedAt,
    endsAt: input.expiresAt === null ? undefined : input.expiresAt ?? access.endsAt,
    moveIds: input.moveIds === null ? undefined : input.moveIds ?? access.moveIds,
    revision: access.revision + 1, changedBy: "person", changedAt: Date.now(),
  };
  const widens = ["resume", "restore", "full"].includes(input.action) || access.withheldScopes.some(scope => !withheldScopes.includes(scope)) || (access.endsAt !== undefined && (next.endsAt === undefined || next.endsAt > access.endsAt)) || (access.moveIds !== undefined && (next.moveIds === undefined || next.moveIds.some(id => !access.moveIds!.includes(id))));
  if (widens) {
    if (next.moveIds) await validateMoves(ctx, access.ownerUserId, next.moveIds, connection);
    const user = await ctx.db.get(access.ownerUserId);
    if (!user || user.status !== "active") throw new ConvexError("An active profile is required to restore access.");
    if (connection.apiKeyId) {
      const key = await ctx.db.get(connection.apiKeyId);
      if (!key || key.credentialRetiredAt !== undefined) throw new ConvexError("A rotated credential stays retired. Use its replacement key.");
      await requireHouseholdPermission(ctx, key.householdId, "api_keys:manage");
    }
  }
  if (widens && !access.bootstrapped) throw new ConvexError("Earlier connection limits are still being checked. Try again shortly; no access was widened.");
  const before = snapshot(originalAccess, connection);
  // A person releases exactly the source revisions in this transaction. No
  // permanent ignore-list exists: any later restriction writes a new entry.
  const sourceId = String(connection.grantId ?? connection.apiKeyId ?? connection._id);
  const releases = [...(input.action === "forget" ? [] : connection.inheritedSources ?? []), ...root.entries.filter(row => row.sourceGrantId === sourceId)];
  let entries = widens || input.action === "forget" ? root.entries.filter(row => !releases.some(release => release.sourceGrantId === row.sourceGrantId && release.sourceRevision === row.sourceRevision)) : root.entries;
  if (isRestricted(next) && input.action !== "forget") {
    const sourceId = String(connection.grantId ?? connection.apiKeyId ?? connection._id);
    const entry = sourceEntry(sourceId, next.revision, next);
    entries = [...entries.filter(row => row.sourceGrantId !== sourceId), entry];
  }
  const baseline = connection.ownBaseline ?? policy(access);
  const chosen = widens ? policy(next) : { ...baseline, revision: next.revision, changedBy: "person" as const, changedAt: next.changedAt,
    withheldScopes: input.scopes ? expandRemoved(catalog.filter(scope => !input.scopes!.includes(scope))) : baseline.withheldScopes,
    pausedAt: input.action === "pause" ? next.pausedAt : baseline.pausedAt,
    revoked: input.action === "revoke" ? true : baseline.revoked,
    revokedAt: input.action === "revoke" ? next.revokedAt : baseline.revokedAt,
    endsAt: input.expiresAt === undefined ? baseline.endsAt : input.expiresAt ?? undefined,
    moveIds: input.moveIds === undefined ? baseline.moveIds : input.moveIds ?? undefined,
  };
  await ctx.db.patch(connection._id, { policy: policy(next), ownBaseline: chosen, inherited: widens ? false : connection.inherited, inheritedSources: widens ? [] : connection.inheritedSources, forgottenAt: input.action === "forget" ? Date.now() : widens ? undefined : connection.forgottenAt, isCurrent: input.action === "forget" ? false : widens ? true : connection.isCurrent });
  await writeFloor(ctx, root, entries);
  access = { ...next, entries };
  const activeConnection = (await ctx.db.get(connection._id))!;
  const after = snapshot(access, activeConnection);
  await connectionChange(ctx, { ownerUserId: access.ownerUserId, accessOwnerId: access._id, connectionId: String(connection._id), actor: "person", before, after, message: `You chose ${input.action}. Other connections keep their own limits.`, opId: input.opId, requestKey: connectionRequest(originalInput) });
  return after;
}
export async function requireSubject(ctx: Ctx, subject: string) {
  const user = await ctx.db.query("users").withIndex("by_clerk_user_id", q => q.eq("clerkUserId", subject)).unique();
  if (!user || user.status !== "active") throw new ConvexError("No active Assist With Moving profile is linked to this sign-in.");
  return user;
}
export function requireSettingsRefusal(): never { throw new ConvexError(SETTINGS_REFUSAL); }
