export type ClaimPacketMode = "submission" | "owner";

export function buildClaimPacketPath({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId: string;
  moveId: string;
  mode?: ClaimPacketMode;
}) {
  const params = new URLSearchParams({ householdId, moveId, mode });
  return `/app/claim-packet?${params.toString()}`;
}

export function claimPacketFilename(mode: ClaimPacketMode) {
  return `movingmanifest-claim-${mode}.csv`;
}

export function formatClaimCurrency(cents: number | undefined) {
  if (typeof cents !== "number") return "Not documented";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatClaimTimestamp(timestamp: number | undefined) {
  if (typeof timestamp !== "number") return "Not documented";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
