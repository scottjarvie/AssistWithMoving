export type SubManifestKind = "donation" | "sellFree" | "storage";
export type SubManifestMode = "recipient" | "owner";
export type SubManifestProfileType =
  | "donationPickup"
  | "sellOrGiveaway"
  | "storageInventory";

export function buildSubManifestPath({
  householdId,
  moveId,
  kind,
  mode = "recipient",
}: {
  householdId: string;
  moveId: string;
  kind: SubManifestKind;
  mode?: SubManifestMode;
}) {
  const params = new URLSearchParams({ householdId, moveId, kind, mode });
  return `/app/sub-manifest?${params.toString()}`;
}

export function subManifestFilename(kind: SubManifestKind, mode: SubManifestMode) {
  return `assistwithmoving-${kind.toLowerCase()}-${mode}.csv`;
}

export function subManifestKindForProfileType(
  profileType: SubManifestProfileType
): SubManifestKind {
  switch (profileType) {
    case "donationPickup":
      return "donation";
    case "sellOrGiveaway":
      return "sellFree";
    case "storageInventory":
      return "storage";
  }
}

export function publicSubManifestKindForProfileType(profileType: string) {
  if (
    profileType === "donationPickup" ||
    profileType === "sellOrGiveaway" ||
    profileType === "storageInventory"
  ) {
    return subManifestKindForProfileType(profileType);
  }
  return null;
}

export function formatSubManifestCurrency(cents: number | undefined) {
  if (typeof cents !== "number") return "Hidden";
  return `$${(cents / 100).toFixed(2)}`;
}
