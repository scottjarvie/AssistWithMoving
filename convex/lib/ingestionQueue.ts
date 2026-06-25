import { v } from "convex/values";

// The ingestion queue is the pipeline INTO inventory: each entry bundles
// evidence (photos/audio/video) with the user's directions, waiting for the
// user's own AI agent (via REST/MCP) — or the user manually — to turn it into
// inventory records.

export const ingestionQueueStatuses = [
  "queued",
  "claimed",
  "processed",
  "needsInput",
  "resolved",
  "discarded",
] as const;

export type IngestionQueueStatus = (typeof ingestionQueueStatuses)[number];

export const ingestionQueueStatusValidator = v.union(
  v.literal("queued"),
  v.literal("claimed"),
  v.literal("processed"),
  v.literal("needsInput"),
  v.literal("resolved"),
  v.literal("discarded"),
);

export const ingestionScopeHints = [
  "singleItem",
  "multipleItems",
  "scene",
] as const;

export type IngestionScopeHint = (typeof ingestionScopeHints)[number];

export const ingestionScopeHintValidator = v.union(
  v.literal("singleItem"),
  v.literal("multipleItems"),
  v.literal("scene"),
);

// Coarse, entry-level rollup of background photo uploads. Optional on the row:
// undefined means there is nothing pending (old rows, or media attached up front).
//   "uploading" — photos are still arriving from the client upload manager
//   "failed"    — an upload permanently failed; the entry stays saved, retryable
//   "complete"  — all promised photos are attached
export const mediaUploadStates = ["uploading", "failed", "complete"] as const;

export type MediaUploadState = (typeof mediaUploadStates)[number];

export const mediaUploadStateValidator = v.union(
  v.literal("uploading"),
  v.literal("failed"),
  v.literal("complete"),
);

// Recompute the entry-level rollup after a background photo lands (appendMedia).
//   - With a known expectation (combined/per-image capture set expectedMediaCount
//     up front), we are "complete" once the attached count reaches it.
//   - With NO expectation (undefined: F3 add-images, MCP captures, pre-feature
//     rows), there is no outstanding promise the server tracks — this append IS
//     the photo landing, so it resolves to "complete". Defaulting to "uploading"
//     here would strand such entries permanently un-claimable.
//   - A prior "failed" sibling stays sticky until the full count actually lands,
//     so a slow sibling completing does not silently clear the failure badge.
export function resolveAppendedMediaState(args: {
  expectedMediaCount?: number;
  priorState?: MediaUploadState;
  attachedCount: number;
}): MediaUploadState {
  const reachedExpected =
    args.expectedMediaCount == null ||
    args.attachedCount >= args.expectedMediaCount;
  if (reachedExpected) return "complete";
  return args.priorState === "failed" ? "failed" : "uploading";
}

// True while an entry's background photo upload is still in flight. Composable
// with effectiveStatus (status governs the lifecycle; this gates claimability).
// An agent must never claim an entry whose media is still uploading.
export function isMediaUploadPending(entry: {
  mediaUploadState?: MediaUploadState;
  expectedMediaCount?: number;
  mediaPhotoIds: unknown[];
}) {
  if (entry.mediaUploadState === "uploading") return true;
  return (
    entry.expectedMediaCount != null &&
    entry.mediaPhotoIds.length < entry.expectedMediaCount
  );
}

// What the captured entry is intended to become / target (agent ingestion).
export const ingestionQueueIntentValidator = v.union(
  v.literal("general"),
  v.literal("newMovableUnit"),
  v.literal("newItem"),
  v.literal("existingBox"),
  v.literal("existingItem"),
  v.literal("boxContents"),
  v.literal("condition"),
  v.literal("measurements"),
  v.literal("floorPlan"),
);

// How long an agent's claim lasts before the entry is considered abandoned
// and may be reclaimed by another run.
export const ingestionClaimDurationMs = 15 * 60 * 1000;

const allowedTransitions: Record<IngestionQueueStatus, IngestionQueueStatus[]> =
  {
    queued: ["claimed", "discarded"],
    claimed: ["processed", "needsInput", "queued"],
    needsInput: ["queued", "discarded"],
    processed: ["resolved", "queued"],
    resolved: [],
    discarded: ["queued"],
  };

export function canTransitionIngestionStatus(
  from: IngestionQueueStatus,
  to: IngestionQueueStatus,
) {
  return allowedTransitions[from].includes(to);
}

// Entries a user may still edit (notes, hints, media, ordering).
export function ingestionEntryIsEditable(status: IngestionQueueStatus) {
  return status === "queued" || status === "needsInput";
}

export function ingestionClaimIsExpired(
  entry: { status: IngestionQueueStatus; claimExpiresAt?: number },
  now: number,
) {
  return (
    entry.status === "claimed" &&
    typeof entry.claimExpiresAt === "number" &&
    entry.claimExpiresAt <= now
  );
}
