import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  effectiveApiKeyScopes,
  apiKeyHasScopes,
  apiKeyPrefix,
  validateApiKeyRecord,
  verifyApiKeyHash,
  type ApiKeyScope,
} from "./apiKeys";
import { agentAccessDisabled, resolveMoveAccess } from "./moveAccess";
import { visibilityForHouseholdRole, type HouseholdRole } from "./roles";

export async function authenticateApiKey(
  ctx: MutationCtx,
  {
    rawKey,
    requiredScopes,
    householdId,
    moveId,
    action,
    allowRestrictedKeyWithoutMoveId = false,
    recordUse = true,
    inspectConnection = false,
  }: {
    rawKey: string;
    requiredScopes: ApiKeyScope[];
    householdId?: Id<"households">;
    moveId?: Id<"moves">;
    action: string;
    allowRestrictedKeyWithoutMoveId?: boolean;
    recordUse?: boolean;
    inspectConnection?: boolean;
  }
) {
  const prefix = apiKeyPrefix(rawKey);
  const key = await ctx.db
    .query("apiKeys")
    .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
    .unique();

  if (!key) {
    throw new Error("Invalid API key.");
  }
  const hashMatches = await verifyApiKeyHash({
    rawKey,
    expectedHash: key.secretHash,
  });
  if (!hashMatches) {
    throw new Error("Invalid API key.");
  }
  if (/^POST .*\/households\/[^/]+\/members$/.test(action) || /^POST .*\/share-links$/.test(action)) throw new Error("Invitations and new share links are website-only. The person must open https://movingmanifest.com/settings/ai; an API key cannot authorize these actions.");
  const scopes = effectiveApiKeyScopes(key);
  const effectiveMoveId =
    allowRestrictedKeyWithoutMoveId && !moveId ? key.moveId : moveId;
  let state: string = key.status === "revoked" ? "revoked" : key.pausedAt !== undefined ? "paused" : key.expiresAt !== undefined && key.expiresAt <= Date.now() ? "expired" : "active";
  if (!inspectConnection && key.pausedAt !== undefined) throw new Error("Connection paused. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  if (!inspectConnection && key.status !== "active") {
    throw new Error("API key is revoked or inactive. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  }
  if (!inspectConnection && key.expiresAt !== undefined && key.expiresAt <= Date.now()) {
    throw new Error("API key is expired. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  }
  if (householdId && key.householdId !== householdId) {
    throw new Error("API key is not scoped to this household.");
  }
  if (key.moveId && effectiveMoveId && key.moveId !== effectiveMoveId) {
    throw new Error("API key is restricted to a different move.");
  }
  if (key.moveId && !effectiveMoveId) {
    throw new Error("API key is move-restricted; use a move-scoped endpoint.");
  }
  if (!apiKeyHasScopes(scopes, requiredScopes)) {
    const missingScopes = requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    throw new Error(
      `API key is missing required scope${
        missingScopes.length === 1 ? "" : "s"
      }: ${missingScopes.join(", ")}. Only the person can restore it at https://movingmanifest.com/settings/ai.`,
    );
  }
  if (
    !inspectConnection && !validateApiKeyRecord({
      record: {
        status: key.status,
        scopes,
        householdId: key.householdId,
        moveId: key.moveId,
        expiresAt: key.expiresAt,
      },
      householdId,
      moveId: effectiveMoveId,
      requiredScopes,
    })
  ) {
    throw new Error("API key is not allowed for this operation.");
  }

  // Owner kill-switch: if an owner has turned off the key creator's agent access
  // (householdMemberships.apiAccessStatus), the key stops working immediately —
  // without needing to revoke each key. Enforced here so every REST endpoint
  // inherits it.
  const creatorMembership = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", key.householdId).eq("userId", key.createdByUserId),
    )
    .unique();
  if (!inspectConnection && ((creatorMembership && creatorMembership.status !== "active") || (!key.moveId && !creatorMembership))) throw new Error("The API key creator no longer has active household access. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  const creator = await ctx.db.get(key.createdByUserId);
  const missingMembership = (creatorMembership && creatorMembership.status !== "active") || (!key.moveId && !creatorMembership);
  const disabled = creator?.status !== "active" || missingMembership || creatorMembership?.apiAccessStatus === "disabled";
  if (disabled && !inspectConnection) throw new Error("Agent access for this connection has been turned off by an owner. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  let effectiveRole: HouseholdRole = creatorMembership?.role ?? "guest";
  let inspectBlocked = Boolean(disabled);
  if (key.moveId && !inspectBlocked) {
    try {
      const moveAccess = await resolveMoveAccess(ctx, key.createdByUserId, key.householdId, key.moveId);
      if (agentAccessDisabled(moveAccess)) throw new Error("Agent access for this connection has been turned off by an owner.");
      effectiveRole = moveAccess.role;
    } catch (error) {
      if (!inspectConnection) throw error;
      inspectBlocked = true;
    }
  }
  if (inspectBlocked && state === "active") state = "blocked";
  const visibility = visibilityForHouseholdRole(effectiveRole);

  const now = Date.now();
  if (recordUse) await ctx.db.patch(key._id, {
    lastUsedAt: now,
    lastUsedAction: action,
    updatedAt: now,
  });

  return {
    actor: {
      type: "apiKey" as const,
      apiKeyId: String(key._id),
      scopes,
    },
    version: key.version ?? 1,
    status: state,
    pausedAt: key.pausedAt,
    expiresAt: key.expiresAt,
    apiKeyId: key._id,
    apiKeyName: key.name,
    apiKeyTokenPreview: key.tokenPreview,
    createdByUserId: key.createdByUserId,
    householdId: key.householdId,
    moveId: key.moveId,
    scopes: state === "active" ? scopes : [],
    effectiveRole,
    visibility,
  };
}
