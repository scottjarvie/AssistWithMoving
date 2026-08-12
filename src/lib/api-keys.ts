export const apiKeyScopeOptions = [
  ["moves/read", "Read moves"],
  ["moves/write", "Write moves"],
  ["inventory/read", "Read inventory"],
  ["inventory/write", "Write inventory"],
  ["queue/read", "Read Queue handoffs"],
  ["queue/write", "Run Queue handoffs"],
  ["plans/read", "Read plans"],
  ["plans/write", "Write plans"],
  ["photos/write", "Upload photos"],
  ["exports/read", "Read exports"],
  ["exports/create", "Create exports"],
  ["members/manage", "Manage members"],
] as const;

export type ApiKeyScope = (typeof apiKeyScopeOptions)[number][0];

export function apiKeyStatusLabel(status: string) {
  return status === "active" ? "Active" : "Revoked";
}

export function formatApiKeyDate(timestamp: number | undefined) {
  if (typeof timestamp !== "number") return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function apiKeyRestrictionLabel(
  moveId: string | undefined,
  moveTitle: string | undefined
) {
  return moveId ? `Move: ${moveTitle ?? "restricted move"}` : "All moves";
}
