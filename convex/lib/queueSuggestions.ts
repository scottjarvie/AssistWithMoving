import { v } from "convex/values";
export const queueAddFields = {
  directive: v.string(),
  addedBy: v.optional(
    v.union(v.literal("ai_on_request"), v.literal("ai_suggestion")),
  ),
  reason: v.optional(v.string()),
  options: v.optional(v.array(v.string())),
  evidence: v.optional(v.string()),
  fromRecord: v.optional(
    v.object({
      type: v.string(),
      id: v.string(),
      label: v.optional(v.string()),
    }),
  ),
  operationId: v.string(),
};

/** Fixed-size index key; keep the original normalized text on the item. */
export async function queueSuggestionFingerprint(
  directive: string,
  reason: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([directive.trim(), reason.trim()])),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
