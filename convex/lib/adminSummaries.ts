import type { Doc } from "../_generated/dataModel";
import { redactAuditMetadata } from "./audit";

export function clampLimit(value: number | undefined, fallback = 20, max = 50) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value ?? fallback), 1), max);
}

export function countBy<T>(
  entries: T[],
  getKey: (entry: T) => string | undefined
) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = getKey(entry) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function sumBy<T>(entries: T[], getValue: (entry: T) => number | undefined) {
  return entries.reduce((total, entry) => total + (getValue(entry) ?? 0), 0);
}

export function matchesAdminSearch(query: string, values: unknown[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(normalized)
  );
}

export function safeUserSummary(user: Doc<"users">) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    appRole: user.appRole,
    status: user.status,
    defaultHouseholdId: user.defaultHouseholdId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSeenAt: user.lastSeenAt,
  };
}

export function safeHouseholdSummary(household: Doc<"households">) {
  return {
    id: household._id,
    name: household.name,
    slug: household.slug,
    ownerUserId: household.ownerUserId,
    createdByUserId: household.createdByUserId,
    createdAt: household.createdAt,
    updatedAt: household.updatedAt,
    archivedAt: household.archivedAt,
  };
}

export function safeMoveSummary(move: Doc<"moves">) {
  return {
    id: move._id,
    householdId: move.householdId,
    title: move.title,
    type: move.type,
    status: move.status,
    origin: move.origin,
    destination: move.destination,
    dateStart: move.dateStart,
    dateEnd: move.dateEnd,
    unitSystem: move.unitSystem,
    documentationProfileTypes: move.documentationProfileTypes,
    pcsBranch: move.pcsBranch,
    pcsShipmentType: move.pcsShipmentType,
    pcsDependentStatus: move.pcsDependentStatus,
    createdByUserId: move.createdByUserId,
    createdAt: move.createdAt,
    updatedAt: move.updatedAt,
    archivedAt: move.archivedAt,
  };
}

export function safeAuditSummary(entry: Doc<"auditLogs">) {
  return {
    id: entry._id,
    householdId: entry.householdId,
    moveId: entry.moveId,
    actorType: entry.actorType,
    actorUserId: entry.actorUserId,
    actorApiKeyId: entry.actorApiKeyId,
    category: entry.category,
    action: entry.action,
    objectTable: entry.objectTable,
    objectId: entry.objectId,
    metadata: entry.metadata
      ? redactAuditMetadata(entry.metadata as Record<string, unknown>)
      : undefined,
    createdAt: entry.createdAt,
  };
}
