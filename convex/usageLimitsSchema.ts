import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Per-owner upload and usage limits (family design: assistwithlife docs/upload-limits-design.md).
 * Limits live in data so an operator can change or switch them off without a deploy.
 * Every table here is additive; no existing record changes shape.
 */
export const enforcementValidator = v.union(v.literal("off"), v.literal("warn"), v.literal("on"));

const limitFields = {
  planStoredBytes: v.optional(v.record(v.string(), v.number())),
  maxFileBytes: v.optional(v.record(v.string(), v.number())),
  storedBytesPerUser: v.optional(v.number()),
  uploadsPerHour: v.optional(v.number()),
  uploadsPerDay: v.optional(v.number()),
  uploadBytesPerDay: v.optional(v.number()),
  downloadBytesPerDay: v.optional(v.number()),
  maxUploadsInFlight: v.optional(v.number()),
  mcpBatchMaxItems: v.optional(v.number()),
  mcpBatchMaxBytes: v.optional(v.number()),
};

export const limitPatchValidator = v.object(limitFields);

/** Personal limits: a number sets one, null goes back to the site value. */
const nullableNumber = v.optional(v.union(v.number(), v.null()));
export const nullableLimitPatch = v.object({
  storedBytesPerUser: nullableNumber,
  uploadsPerHour: nullableNumber,
  uploadsPerDay: nullableNumber,
  uploadBytesPerDay: nullableNumber,
  downloadBytesPerDay: nullableNumber,
  maxUploadsInFlight: nullableNumber,
  mcpBatchMaxItems: nullableNumber,
  mcpBatchMaxBytes: nullableNumber,
});

export const usageLimitTables = {
  uploadReservations: defineTable({ ownerId: v.string(), key: v.string(), bytes: v.number(), day: v.string(), status: v.union(v.literal("reserved"), v.literal("committed"), v.literal("released")), expiresAt: v.number() }).index("by_owner_key", ["ownerId", "key"]).index("by_status_expires", ["status", "expiresAt"]),
  /** One row, key "site". Absent row = family defaults with enforcement off. */
  usageLimitSettings: defineTable({
    key: v.literal("site"),
    ...limitFields,
    enforcement: enforcementValidator,
    downloadEnforcement: v.optional(enforcementValidator),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_key", ["key"]),

  /** Personal limits for one owner. An absent field uses the site value. */
  usageLimitOverrides: defineTable({
    ownerId: v.string(),
    ...limitFields,
    enforcement: v.optional(enforcementValidator),
    reason: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_owner", ["ownerId"]),

  /** Append-only record of every limit change. */
  usageLimitAudit: defineTable({
    at: v.number(),
    actor: v.string(),
    target: v.string(), // "site" or the counter row id of one owner
    field: v.string(),
    before: v.optional(v.union(v.number(), v.string())),
    after: v.optional(v.union(v.number(), v.string())),
    reason: v.string(),
  }).index("by_at", ["at"]),

  /** One row per owner: derived numbers only, never file names or content. */
  usageCounters: defineTable({
    ownerId: v.string(),
    storedBytes: v.number(),
    reservedBytes: v.number(),
    inFlight: v.number(),
    hourKey: v.string(),
    hourUploads: v.number(),
    dayKey: v.string(),
    dayUploads: v.number(),
    dayUploadBytes: v.number(),
    dayDownloadBytes: v.number(),
    /** False until stored bytes have been counted from existing files. */
    ready: v.boolean(),
    /** Bumped whenever stored bytes change, so a racing recompute restarts. */
    revision: v.number(),
    updatedAt: v.number(),
    repair: v.optional(v.object({
      phase: v.number(),
      cursor: v.union(v.string(), v.null()),
      bytes: v.number(),
      revision: v.number(),
      restarts: v.number(),
    })),
  }).index("by_owner", ["ownerId"]),

  /** What a limit refused or would have refused (warn/off), for the operator page. */
  usageLimitEvents: defineTable({
    ownerId: v.string(),
    at: v.number(),
    limit: v.string(),
    mode: enforcementValidator,
    source: v.string(),
    used: v.number(),
    cap: v.number(),
    requested: v.number(),
    remaining: v.optional(v.number()),
  }).index("by_at", ["at"]).index("by_owner", ["ownerId"]),
};
