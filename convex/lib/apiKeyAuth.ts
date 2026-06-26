import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  apiKeyHasScopes,
  apiKeyPrefix,
  validateApiKeyRecord,
  verifyApiKeyHash,
  type ApiKeyScope,
} from "./apiKeys";
import { resolveMoveAccess } from "./moveAccess";
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
  }: {
    rawKey: string;
    requiredScopes: ApiKeyScope[];
    householdId?: Id<"households">;
    moveId?: Id<"moves">;
    action: string;
    allowRestrictedKeyWithoutMoveId?: boolean;
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
  const effectiveMoveId =
    allowRestrictedKeyWithoutMoveId && !moveId ? key.moveId : moveId;
  if (key.status !== "active") {
    throw new Error("API key is revoked or inactive.");
  }
  if (key.expiresAt !== undefined && key.expiresAt <= Date.now()) {
    throw new Error("API key is expired.");
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
  if (!apiKeyHasScopes(key.scopes, requiredScopes)) {
    const missingScopes = requiredScopes.filter(
      (scope) => !key.scopes.includes(scope),
    );
    throw new Error(
      `API key is missing required scope${
        missingScopes.length === 1 ? "" : "s"
      }: ${missingScopes.join(", ")}. Create or rotate a key in Settings with the needed scope.`,
    );
  }
  if (
    !validateApiKeyRecord({
      record: {
        status: key.status,
        scopes: key.scopes,
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
  if (creatorMembership?.apiAccessStatus === "disabled") {
    throw new Error(
      "Agent access for this connection has been turned off by an owner.",
    );
  }

  // Compute the key creator's effective visibility so REST item reads redact the
  // same sensitive fields (values, serials) the web/gateway do. Defense-in-depth:
  // today all keys are admin-created (api_keys:manage → admin) so this resolves
  // to full visibility, but if key creation is ever opened below admin (e.g. a
  // move-only participant connecting their own agent), the wall already holds.
  let effectiveRole: HouseholdRole = creatorMembership?.role ?? "guest";
  if (key.moveId) {
    try {
      effectiveRole = (
        await resolveMoveAccess(
          ctx,
          key.createdByUserId,
          key.householdId,
          key.moveId,
        )
      ).role;
    } catch {
      effectiveRole =
        key.participantMoveRole ?? creatorMembership?.role ?? "guest";
    }
  }
  const visibility = visibilityForHouseholdRole(effectiveRole);

  const now = Date.now();
  await ctx.db.patch(key._id, {
    lastUsedAt: now,
    lastUsedAction: action,
    updatedAt: now,
  });

  return {
    actor: {
      type: "apiKey" as const,
      apiKeyId: String(key._id),
      scopes: key.scopes,
    },
    apiKeyId: key._id,
    apiKeyName: key.name,
    apiKeyTokenPreview: key.tokenPreview,
    createdByUserId: key.createdByUserId,
    householdId: key.householdId,
    moveId: key.moveId,
    scopes: key.scopes,
    effectiveRole,
    visibility,
  };
}
