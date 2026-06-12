import { describe, expect, it } from "vitest";

import { summarizeDispositionPipelines } from "../../convex/lib/dispositionPipelines";

describe("disposition pipeline summary", () => {
  const now = 2_000_000;

  it("builds action queues for sell, free, donate, dump, and storage items", () => {
    const summary = summarizeDispositionPipelines({
      now,
      items: [
        item("sell-no-photo", "Desk", "sell", "active"),
        item("sell-ready", "Bike", "sell", "active", { valueCents: 20000 }),
        item("free-item", "Lamp", "free", "active"),
        item("donate-loose", "Coats", "donate", "active", { quantity: 3 }),
        item("donate-boxed", "Books", "donate", "packed"),
        item("dump-item", "Broken shelf", "dump", "active"),
        item("storage-item", "Holiday bins", "storage", "packed"),
        item("archived-item", "Old rug", "sell", "archived"),
        { ...item("deleted-item", "Deleted dresser", "donate", "active"), deletedAt: now },
      ],
      boxes: [
        { boxId: "donation-box", status: "sealed", assignedResourceId: "donate-resource" },
        { boxId: "storage-box", status: "sealed", assignedResourceId: "storage-resource" },
      ],
      memberships: [
        { itemId: "donate-boxed", boxId: "donation-box" },
        { itemId: "storage-item", boxId: "storage-box" },
      ],
      photos: [
        { itemId: "sell-ready" },
        { itemId: "free-item" },
        { itemId: "archived-item" },
      ],
      resources: [
        { resourceId: "donate-resource", type: "donate" },
        { resourceId: "storage-resource", type: "storage" },
      ],
      profiles: [
        { profileId: "sell-profile", type: "sellOrGiveaway", status: "active" },
        { profileId: "storage-profile", type: "storageInventory", status: "active" },
      ],
      shareLinks: [
        {
          shareLinkId: "free-link",
          documentationProfileId: "sell-profile",
          status: "active",
          expiresAt: now + 60_000,
        },
        {
          shareLinkId: "expired-link",
          documentationProfileId: "storage-profile",
          status: "active",
          expiresAt: now - 1,
        },
      ],
    });

    expect(summary.counts.itemCount).toBe(7);
    expect(summary.counts.quantity).toBe(9);
    expect(summary.counts.totalValueCents).toBe(20000);
    expect(group(summary, "sell")).toMatchObject({
      itemCount: 2,
      photoCount: 1,
      readyCount: 1,
      activeShareLinkCount: 1,
    });
    expect(action(summary, "sell", "salePhotosNeeded")).toMatchObject({
      count: 1,
      anchor: "#add-photos",
    });
    expect(action(summary, "sell", "readyToList")).toMatchObject({
      count: 1,
      anchor: "#sale-listing",
    });
    expect(action(summary, "sell", "listedOrSold")).toMatchObject({
      count: 0,
      anchor: "#sale-status",
    });
    expect(action(summary, "free", "freePickupLink")?.count).toBe(0);
    expect(action(summary, "donate", "donationPacked")?.count).toBe(1);
    expect(action(summary, "donate", "donationReady")?.count).toBe(1);
    expect(action(summary, "dump", "dumpRun")?.count).toBe(1);
    expect(action(summary, "storage", "storageReady")?.count).toBe(1);
    expect(summary.topActions[0]).toMatchObject({
      groupKey: "sell",
      key: "salePhotosNeeded",
    });
  });

  it("flags free pickup links when giveaway items exist without an active link", () => {
    const summary = summarizeDispositionPipelines({
      now,
      items: [item("free-item", "Porch chair", "free", "active")],
      boxes: [],
      memberships: [],
      photos: [{ itemId: "free-item" }],
      resources: [],
      profiles: [
        { profileId: "sell-profile", type: "sellOrGiveaway", status: "active" },
      ],
      shareLinks: [
        {
          shareLinkId: "revoked-link",
          documentationProfileId: "sell-profile",
          status: "revoked",
          revokedAt: now - 100,
          expiresAt: now + 60_000,
        },
      ],
    });

    expect(action(summary, "free", "freePickupLink")).toMatchObject({
      count: 1,
      severity: "critical",
    });
    expect(action(summary, "free", "giveawayPhotosNeeded")).toMatchObject({
      count: 0,
      anchor: "#add-photos",
    });
    expect(group(summary, "free")?.readyCount).toBe(0);
  });
});

function item(
  itemId: string,
  name: string,
  disposition: string,
  status: string,
  overrides: Partial<{
    quantity: number;
    valueCents: number;
  }> = {}
) {
  return {
    itemId,
    name,
    disposition,
    status,
    quantity: overrides.quantity ?? 1,
    valueCents: overrides.valueCents,
  };
}

function group(
  summary: ReturnType<typeof summarizeDispositionPipelines>,
  key: string
) {
  return summary.groups.find((entry) => entry.key === key);
}

function action(
  summary: ReturnType<typeof summarizeDispositionPipelines>,
  groupKey: string,
  actionKey: string
) {
  return group(summary, groupKey)?.actions.find((entry) => entry.key === actionKey);
}
