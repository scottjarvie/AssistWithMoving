import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  apiKeyPrefix,
  validateApiKeyRecord,
  verifyApiKeyHash,
  type ApiKeyScope,
} from "./apiKeys";

export async function authenticateApiKey(
  ctx: MutationCtx,
  {
    rawKey,
    requiredScopes,
    householdId,
    moveId,
    action,
  }: {
    rawKey: string;
    requiredScopes: ApiKeyScope[];
    householdId?: Id<"households">;
    moveId?: Id<"moves">;
    action: string;
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
      moveId,
      requiredScopes,
    })
  ) {
    throw new Error("API key is not allowed for this operation.");
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
    createdByUserId: key.createdByUserId,
    householdId: key.householdId,
    moveId: key.moveId,
    scopes: key.scopes,
  };
}
