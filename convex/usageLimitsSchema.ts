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
  planStoredBytes: v.optional(v.union(v.record(v.string(), v.number()), v.null())),
  maxFileBytes: v.optional(v.union(v.record(v.string(), v.number()), v.null())),
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
  usageInventoryObjects: defineTable({ scanId: v.string(), ownerId: v.string(), bucket: v.string(), storageKey: v.string(), firstPage: v.string(), bytes: v.number(), unknown: v.boolean(), missing: v.boolean(), expiresAt: v.number() }).index("by_scan_object", ["scanId", "ownerId", "bucket", "storageKey"]).index("by_expiry", ["expiresAt"]),
  movePurges: defineTable({ requestedByPerson: v.optional(v.boolean()), householdId: v.id("households"), moveId: v.id("moves"), table: v.number(), cursor: v.union(v.string(), v.null()), updatedAt: v.number() }).index("by_updated", ["updatedAt"]).index("by_person_updated", ["requestedByPerson", "updatedAt"]),
  uploadObjectClaims: defineTable({ storageKey: v.string(), sessionId: v.optional(v.id("photoUploadSessions")), deletionJobId: v.optional(v.string()) }).index("by_key", ["storageKey"]).index("by_session", ["sessionId"]).index("by_deletion_job", ["deletionJobId"]),
  usageRecountProofs: defineTable({ runId: v.id("usageRecountRuns"), ownerId: v.id("users"), storedBytes: v.number(), observedBytes: v.optional(v.number()) }).index("by_run_owner", ["runId", "ownerId"]),
  sessionDeletionJobs: defineTable({ erased: v.optional(v.boolean()), bytes: v.optional(v.number()), notBefore: v.optional(v.number()), derivativeRefs: v.optional(v.object({ thumb: v.optional(v.string()), card: v.optional(v.string()), detail: v.optional(v.string()), full: v.optional(v.string()) })), sessionId: v.id("photoUploadSessions"), originalStorageKey: v.string(), ownerId: v.id("users"), refs: v.array(v.object({ bucket: v.string(), storageKey: v.string(), versionId: v.optional(v.string()), bytes: v.optional(v.number()), deleted: v.boolean() })), status: v.union(v.literal("pending"), v.literal("done")), updatedAt: v.number() }).index("by_session", ["sessionId"]).index("by_owner_status", ["ownerId", "status"]).index("by_original_key", ["originalStorageKey"]).index("by_thumb_key", ["derivativeRefs.thumb"]).index("by_card_key", ["derivativeRefs.card"]).index("by_detail_key", ["derivativeRefs.detail"]).index("by_full_key", ["derivativeRefs.full"]).index("by_status_updated", ["status", "updatedAt"]),
  generatedObjects: defineTable({ ownerId: v.id("users"), photoId: v.id("itemPhotos"), bucket: v.string(), storageKey: v.string(), bytes: v.number(), state: v.union(v.literal("pending"), v.literal("active"), v.literal("failed")), createdAt: v.number() }).index("by_owner", ["ownerId"]).index("by_photo", ["photoId"]).index("by_key", ["storageKey"]).index("by_state_created", ["state", "createdAt"]),
  usageRecountRuns: defineTable({ dryRun: v.boolean(), status: v.union(v.literal("running"), v.literal("blocked"), v.literal("done")), phase: v.number(), verifyRevision: v.optional(v.number()), ownersCursor: v.union(v.string(), v.null()), ownerId: v.optional(v.id("users")), sourceCursor: v.union(v.string(), v.null()), nextOwnerCursor: v.optional(v.string()), lastOwner: v.optional(v.boolean()), ownerBytes: v.number(), accountsSeen: v.number(), failedOwners: v.optional(v.number()), repairFailures: v.optional(v.number()), bytesCounted: v.number(), unknownSizeFiles: v.number(), unattributedFiles: v.number(), uncountedFiles: v.optional(v.number()), counterMismatches: v.optional(v.number()), message: v.optional(v.string()), missingObjects: v.number(), updatedAt: v.number() }),
  storageDeletionJobs: defineTable({ notBefore: v.optional(v.number()), originalStorageKey: v.optional(v.string()), derivativeRefs: v.optional(v.object({ thumb: v.optional(v.string()), card: v.optional(v.string()), detail: v.optional(v.string()), full: v.optional(v.string()) })), photoId: v.id("itemPhotos"), ownerId: v.id("users"), bytes: v.number(), refs: v.array(v.object({ bucket: v.string(), storageKey: v.string(), versionId: v.optional(v.string()), bytes: v.optional(v.number()), deleted: v.boolean() })), status: v.union(v.literal("pending"), v.literal("done")), updatedAt: v.number(), error: v.optional(v.string()) }).index("by_photo", ["photoId"]).index("by_owner_status", ["ownerId", "status"]).index("by_status_updated", ["status", "updatedAt"]).index("by_original_key", ["originalStorageKey"]).index("by_thumb_key", ["derivativeRefs.thumb"]).index("by_card_key", ["derivativeRefs.card"]).index("by_detail_key", ["derivativeRefs.detail"]).index("by_full_key", ["derivativeRefs.full"]),
  uploadReservations: defineTable({ ownerId: v.string(), key: v.string(), bytes: v.number(), day: v.string(), status: v.union(v.literal("reserved"), v.literal("committed"), v.literal("released")), expiresAt: v.number() }).index("by_owner_key", ["ownerId", "key"]).index("by_owner_status", ["ownerId", "status"]).index("by_status_expires", ["status", "expiresAt"]),
  /** One row, key "site". Absent row = family defaults with enforcement off. */
  usageLimitSettings: defineTable({
    key: v.literal("site"),
    storageRevision: v.optional(v.number()),
    backfillCompletedAt: v.optional(v.number()),
    storageDeletionEnabled: v.optional(v.boolean()),
    exportExpiryEnabled: v.optional(v.boolean()),
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
  }).index("by_owner", ["ownerId"]).index("by_ready", ["ready"]),

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
