export type SubManifestKind = "donation" | "sellFree" | "storage";
export type SubManifestMode = "recipient" | "owner";

export type SubManifestProfileType =
  | "donationPickup"
  | "sellOrGiveaway"
  | "storageInventory";

export type SubManifestItemInput = {
  disposition: string;
  status: string;
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  privateNotes?: string;
};

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

export function subManifestDispositionFilter(kind: SubManifestKind) {
  switch (kind) {
    case "donation":
      return ["donate"];
    case "sellFree":
      return ["sell", "free"];
    case "storage":
      return ["storage"];
  }
}

export function subManifestTitle(kind: SubManifestKind) {
  switch (kind) {
    case "donation":
      return "Donation pickup manifest";
    case "sellFree":
      return "Sell / giveaway manifest";
    case "storage":
      return "Storage manifest";
  }
}

export function subManifestDisclaimer(kind: SubManifestKind) {
  switch (kind) {
    case "donation":
      return "This donation pickup manifest is a scoped list of items intended for pickup coordination. Owner valuation and tax records should be verified separately.";
    case "sellFree":
      return "This sell / giveaway manifest is a scoped listing aid. It may omit private owner notes, unrelated move records, and internal review details.";
    case "storage":
      return "This storage manifest is a scoped inventory aid for finding stored items. Verify facility requirements and access rules separately.";
  }
}

export function shouldShowSubManifestOwnerFields(mode: SubManifestMode) {
  return mode === "owner";
}

export function isSubManifestItem(
  item: Pick<SubManifestItemInput, "disposition" | "status">,
  kind: SubManifestKind
) {
  return (
    item.status !== "archived" &&
    subManifestDispositionFilter(kind).includes(item.disposition)
  );
}
