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
  "inventory",
  "packing",
  "condition",
  "measurements",
  "floorPlan",
] as const;

export const ingestionQueueIntents = [
  "general",
  "newMovableUnit",
  "newItem",
  "existingBox",
  "existingItem",
  "boxContents",
  "condition",
  "measurements",
  "floorPlan",
] as const;

export type IngestionQueueIntent = (typeof ingestionQueueIntents)[number];

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

export const legacyIngestionScopeHints = [
  "singleItem",
  "multipleItems",
  "scene",
] as const;

export type IngestionScopeHint =
  | (typeof ingestionScopeHints)[number]
  | (typeof legacyIngestionScopeHints)[number];

export const ingestionScopeHintValidator = v.union(
  v.literal("inventory"),
  v.literal("packing"),
  v.literal("condition"),
  v.literal("measurements"),
  v.literal("floorPlan"),
  v.literal("singleItem"),
  v.literal("multipleItems"),
  v.literal("scene"),
);

export const allIngestionScopeHints = [
  ...ingestionScopeHints,
  ...legacyIngestionScopeHints,
] as const;

export function normalizeIngestionScopeHint(
  scopeHint: IngestionScopeHint | undefined,
) {
  if (
    scopeHint === "singleItem" ||
    scopeHint === "multipleItems" ||
    scopeHint === "scene"
  ) {
    return "inventory";
  }
  return scopeHint;
}

export function ingestionScopeHintMatches(
  entryScopeHint: IngestionScopeHint | undefined,
  requestedScopeHint: IngestionScopeHint | undefined,
) {
  if (!requestedScopeHint) {
    return true;
  }
  const normalizedRequest = normalizeIngestionScopeHint(requestedScopeHint);
  if (normalizedRequest === "inventory") {
    return (
      entryScopeHint === undefined ||
      normalizeIngestionScopeHint(entryScopeHint) === "inventory"
    );
  }
  return normalizeIngestionScopeHint(entryScopeHint) === normalizedRequest;
}

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
