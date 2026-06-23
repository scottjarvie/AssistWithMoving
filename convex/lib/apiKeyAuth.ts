import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  apiKeyHasScopes,
  apiKeyPrefix,
  validateApiKeyRecord,
  verifyApiKeyHash,
  type ApiKeyScope,
} from "./apiKeys";
import { canMembershipUseApiAccess } from "./householdMembers";
import { RestApiError } from "./restApi";

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
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "Invalid API key.",
    });
  }
  const hashMatches = await verifyApiKeyHash({
    rawKey,
    expectedHash: key.secretHash,
  });
  if (!hashMatches) {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "Invalid API key.",
    });
  }
  const effectiveMoveId =
    allowRestrictedKeyWithoutMoveId && !moveId ? key.moveId : moveId;
  if (key.status !== "active") {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "API key is revoked or inactive.",
    });
  }
  if (key.expiresAt !== undefined && key.expiresAt <= Date.now()) {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "API key is expired.",
    });
  }
  if (householdId && key.householdId !== householdId) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API key is not scoped to this household.",
    });
  }
  const creatorMembership = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", key.householdId).eq("userId", key.createdByUserId),
    )
    .unique();
  if (
    !creatorMembership ||
    !canMembershipUseApiAccess({
      role: creatorMembership.role,
      status: creatorMembership.status,
      apiAccessStatus: creatorMembership.apiAccessStatus,
    })
  ) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API access is disabled for the member who created this key.",
    });
  }
  if (key.moveId && effectiveMoveId && key.moveId !== effectiveMoveId) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API key is restricted to a different move.",
    });
  }
  if (key.moveId && !effectiveMoveId) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API key is move-restricted; use a move-scoped endpoint.",
    });
  }
  if (!apiKeyHasScopes(key.scopes, requiredScopes)) {
    const missingScopes = requiredScopes.filter(
      (scope) => !key.scopes.includes(scope),
    );
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: `API key is missing required scope${
        missingScopes.length === 1 ? "" : "s"
      }: ${missingScopes.join(", ")}.`,
      fields: [
        {
          path: "scopes",
          message: "API key lacks one or more scopes required for this route.",
          validValues: requiredScopes,
        },
      ],
    });
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
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API key is not allowed for this operation.",
    });
  }

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
  };
}
