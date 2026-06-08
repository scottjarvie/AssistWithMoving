import { describe, expect, it } from "vitest";

import {
  isSubManifestItem,
  publicSubManifestKindForProfileType as convexPublicSubManifestKindForProfileType,
  shouldShowSubManifestOwnerFields,
  subManifestDisclaimer,
  subManifestDispositionFilter,
  subManifestKindForProfileType,
  subManifestTitle,
} from "../../convex/lib/subManifest";
import {
  buildSubManifestPath,
  formatSubManifestCurrency,
  subManifestFilename,
  subManifestKindForProfileType as clientSubManifestKindForProfileType,
  publicSubManifestKindForProfileType,
} from "@/lib/sub-manifest";
import { buildPublicSharePath, buildPublicShareUrl } from "@/lib/share-links";

describe("sub-manifest helpers", () => {
  it("maps profile types to manifest kinds", () => {
    expect(subManifestKindForProfileType("donationPickup")).toBe("donation");
    expect(subManifestKindForProfileType("sellOrGiveaway")).toBe("sellFree");
    expect(subManifestKindForProfileType("storageInventory")).toBe("storage");
    expect(clientSubManifestKindForProfileType("storageInventory")).toBe(
      "storage"
    );
    expect(publicSubManifestKindForProfileType("donationPickup")).toBe("donation");
    expect(publicSubManifestKindForProfileType("sellOrGiveaway")).toBe("sellFree");
    expect(publicSubManifestKindForProfileType("pcsMove")).toBe(null);
    expect(convexPublicSubManifestKindForProfileType("storageInventory")).toBe(
      "storage"
    );
    expect(convexPublicSubManifestKindForProfileType("loadCrew")).toBe(null);
  });

  it("filters items by disposition and excludes archived status", () => {
    expect(subManifestDispositionFilter("donation")).toEqual(["donate"]);
    expect(subManifestDispositionFilter("sellFree")).toEqual(["sell", "free"]);
    expect(subManifestDispositionFilter("storage")).toEqual(["storage"]);
    expect(
      isSubManifestItem({ disposition: "donate", status: "active" }, "donation")
    ).toBe(true);
    expect(
      isSubManifestItem({ disposition: "donate", status: "archived" }, "donation")
    ).toBe(false);
    expect(
      isSubManifestItem({ disposition: "sell", status: "active" }, "storage")
    ).toBe(false);
  });

  it("keeps private owner fields out of recipient mode", () => {
    expect(shouldShowSubManifestOwnerFields("recipient")).toBe(false);
    expect(shouldShowSubManifestOwnerFields("owner")).toBe(true);
    expect(formatSubManifestCurrency(undefined)).toBe("Hidden");
    expect(formatSubManifestCurrency(12500)).toBe("$125.00");
  });

  it("uses mode-specific titles and disclaimers", () => {
    expect(subManifestTitle("donation")).toBe("Donation pickup manifest");
    expect(subManifestTitle("sellFree")).toBe("Sell / giveaway manifest");
    expect(subManifestDisclaimer("storage")).toContain("storage manifest");
  });
});

describe("public share paths", () => {
  it("builds encoded public share paths and URLs", () => {
    expect(buildPublicSharePath(" share/token+with space ")).toBe(
      "/share/share%2Ftoken%2Bwith%20space"
    );
    expect(
      buildPublicShareUrl("token-123", "https://movingmanifest.com")
    ).toBe("https://movingmanifest.com/share/token-123");
  });
});

describe("sub-manifest paths", () => {
  it("builds recipient and owner paths", () => {
    expect(
      buildSubManifestPath({
        householdId: "household-id",
        moveId: "move-id",
        kind: "donation",
      })
    ).toBe(
      "/app/sub-manifest?householdId=household-id&moveId=move-id&kind=donation&mode=recipient"
    );
    expect(
      buildSubManifestPath({
        householdId: "household-id",
        moveId: "move-id",
        kind: "storage",
        mode: "owner",
      })
    ).toBe(
      "/app/sub-manifest?householdId=household-id&moveId=move-id&kind=storage&mode=owner"
    );
    expect(subManifestFilename("sellFree", "owner")).toBe(
      "movingmanifest-sellfree-owner.csv"
    );
  });
});
