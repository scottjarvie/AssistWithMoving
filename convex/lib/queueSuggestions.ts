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
