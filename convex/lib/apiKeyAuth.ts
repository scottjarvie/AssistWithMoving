import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiKeyPrefix, verifyApiKeyHash, type ApiKeyScope } from "./apiKeys";
import { keyScopes, accessState, snapshot, SETTINGS_URL, type Access, type Connection } from "./carriedAccess";
import { agentAccessDisabled, resolveMoveAccess } from "./moveAccess";
import { visibilityForHouseholdRole, type HouseholdRole } from "./roles";

export async function authenticateApiKey(ctx: MutationCtx, {
  rawKey, requiredScopes, householdId, moveId, action,
  allowRestrictedKeyWithoutMoveId = false, recordUse = true, inspectConnection = false,
}: {
  rawKey: string; requiredScopes: ApiKeyScope[]; householdId?: Id<"households">; moveId?: Id<"moves">; action: string;
  allowRestrictedKeyWithoutMoveId?: boolean; recordUse?: boolean; inspectConnection?: boolean;
}) {
  const prefix = apiKeyPrefix(rawKey);
  const key = await ctx.db.query("apiKeys").withIndex("by_prefix", q => q.eq("prefix", prefix)).unique();
  if (!key || !await verifyApiKeyHash({ rawKey, expectedHash: key.secretHash })) throw new Error("Invalid API key.");
  if (/^POST .*\/households\/[^/]+\/members$/.test(action) || /^POST .*\/share-links$/.test(action)) throw new Error(`Invitations and new share links are website-only. The person must use ${SETTINGS_URL}.`);
  const { access, connection } = await ctx.runMutation(makeFunctionReference<"mutation", { apiKeyId: Id<"apiKeys"> }, { access: Access; connection: Connection }>("apiKeys:connectCallingKey"), { apiKeyId: key._id });
  let state = key.credentialRetiredAt !== undefined ? "superseded" : accessState(access, connection);
  const scopes = keyScopes(access);
  if (!inspectConnection && state !== "active") throw new Error(state === "initializing" ? "Earlier connection limits are still being checked. Call get_api_context again shortly; no access was widened." : `This connection is ${state}. Only the person can restore it at ${SETTINGS_URL}.`);
  if (householdId && householdId !== key.householdId) throw new Error("API key is not scoped to this household.");
  const restricted = access.moveIds !== undefined;
  const singleMoveId = access.moveIds?.length === 1 ? access.moveIds[0] : undefined;
  const effectiveMoveId = moveId ?? (allowRestrictedKeyWithoutMoveId ? singleMoveId : undefined);
  if (!inspectConnection && restricted && effectiveMoveId && !access.moveIds!.includes(effectiveMoveId)) throw new Error(`Missing power: access to that move. Only the person can restore it at ${SETTINGS_URL}.`);
  if (!inspectConnection && restricted && !effectiveMoveId && action !== "GET /api/v1/moves") throw new Error(`This connection is move-restricted; use a move-scoped endpoint. Only the person can restore all moves at ${SETTINGS_URL}.`);
  const missing = requiredScopes.filter(scope => !scopes.includes(scope));
  if (missing.length) throw new Error(`API key is missing required scope: ${missing.join(", ")}. Only the person can restore it at ${SETTINGS_URL}.`);
  const membership = await ctx.db.query("householdMemberships").withIndex("by_household_user", q => q.eq("householdId", key.householdId).eq("userId", key.createdByUserId)).unique();
  const creator = await ctx.db.get(key.createdByUserId);
  const noMembership = membership?.status !== "active" && !effectiveMoveId && !singleMoveId;
  const disabled = creator?.status !== "active" || noMembership || (membership?.status === "active" && membership.apiAccessStatus === "disabled");
  if (disabled && !inspectConnection) throw new Error(`The API key creator no longer has active household access, or agent access was turned off. Only the person can restore it at ${SETTINGS_URL}.`);
  let effectiveRole: HouseholdRole = membership?.role ?? "guest";
  let blocked = Boolean(disabled);
  const roleMove = effectiveMoveId ?? singleMoveId;
  if (roleMove && !blocked && state === "active") {
    try {
      const accessToMove = await resolveMoveAccess(ctx, key.createdByUserId, key.householdId, roleMove);
      if (agentAccessDisabled(accessToMove)) throw new Error("Agent access for this connection was turned off by an owner.");
      effectiveRole = accessToMove.role;
    } catch (error) { if (!inspectConnection) throw error; blocked = true; }
  }
  if (blocked && state === "active") state = "blocked";
  if (recordUse) {
    await ctx.db.patch(key._id, { lastUsedAt: Date.now(), lastUsedAction: action, updatedAt: Date.now() });
    if (connection) await ctx.db.patch(connection._id, { lastUsedAt: Date.now(), lastToolName: action });
  }
  const permitted = state === "active" ? scopes : [];
  return {
    actor: { type: "apiKey" as const, apiKeyId: String(key._id), scopes: permitted },
    version: access.revision, status: state, changedAt: snapshot(access, connection).changedAt, revokedAt: access.revokedAt, pausedAt: access.pausedAt, expiresAt: access.endsAt,
    apiKeyId: key._id, apiKeyName: key.name, apiKeyTokenPreview: key.tokenPreview,
    createdByUserId: key.createdByUserId, householdId: key.householdId,
    moveId: singleMoveId, allowedMoveIds: access.moveIds, moveRestricted: restricted,
    householdVisible: membership?.status === "active", scopes: permitted,
    effectiveRole, visibility: visibilityForHouseholdRole(effectiveRole),
  };
}
