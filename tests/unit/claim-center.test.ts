import { describe, expect, it } from "vitest";

import { summarizeClaimCenter } from "../../convex/lib/claimCenter";

describe("claim center summary", () => {
  it("summarizes claim-relevant items, warnings, and timeline events", () => {
    const summary = summarizeClaimCenter({
      items: [
        {
          itemId: "item-damaged",
          name: "Damaged dresser",
          room: "Bedroom",
          category: "Furniture",
          status: "damaged",
          condition: "damaged",
          quantity: 1,
          valueCents: 40000,
          replacementValueCents: 90000,
          highValue: true,
          needsReview: false,
          reviewFlags: ["damage claim"],
          planningDefaultKeys: [],
          updatedAt: 500,
        },
        {
          itemId: "item-watch",
          name: "Passport binder",
          status: "active",
          condition: "unknown",
          quantity: 1,
          highValue: false,
          needsReview: true,
          reviewFlags: [],
          planningDefaultKeys: ["documents"],
          updatedAt: 400,
        },
        {
          itemId: "item-normal",
          name: "Towels",
          status: "active",
          condition: "good",
          quantity: 1,
          highValue: false,
          needsReview: false,
          reviewFlags: [],
          planningDefaultKeys: [],
          updatedAt: 300,
        },
        {
          itemId: "item-deleted",
          name: "Deleted high value",
          status: "active",
          condition: "good",
          quantity: 1,
          highValue: true,
          needsReview: false,
          reviewFlags: [],
          planningDefaultKeys: [],
          deletedAt: 1,
          updatedAt: 200,
        },
      ],
      photos: [
        {
          photoId: "photo-damage",
          itemId: "item-damaged",
          photoType: "damage",
          privacyLevel: "claimOnly",
          verificationStatus: "verified",
          documentationProfileTypes: ["insuranceClaim"],
        },
        {
          photoId: "photo-receipt",
          itemId: "item-damaged",
          photoType: "receipt",
          privacyLevel: "reportVisible",
          verificationStatus: "verified",
          documentationProfileTypes: [],
        },
        {
          photoId: "photo-archived",
          itemId: "item-damaged",
          photoType: "condition",
          privacyLevel: "claimOnly",
          verificationStatus: "verified",
          documentationProfileTypes: [],
          archivedAt: 1,
        },
      ],
      memberships: [{ boxId: "box-1", itemId: "item-damaged" }],
      auditEvents: [
        {
          eventId: "audit-status",
          category: "inventory",
          action: "item.updated",
          objectTable: "items",
          objectId: "item-damaged",
          metadata: {
            changedKeys: ["status", "updatedAt"],
            statusFrom: "loaded",
            statusTo: "damaged",
          },
          createdAt: 1_000,
        },
        {
          eventId: "audit-box",
          category: "inventory",
          action: "box.item_added",
          objectTable: "boxes",
          objectId: "box-1",
          metadata: { itemId: "item-damaged" },
          createdAt: 900,
        },
        {
          eventId: "audit-unrelated",
          category: "inventory",
          action: "item.updated",
          objectTable: "items",
          objectId: "item-normal",
          metadata: { changedKeys: ["room"] },
          createdAt: 800,
        },
        {
          eventId: "audit-photo-caption",
          category: "photo",
          action: "photo.metadata_updated",
          objectTable: "itemPhotos",
          objectId: "photo-unrelated",
          metadata: { changedKeys: ["caption"] },
          createdAt: 700,
        },
      ],
    });

    expect(summary.summary.claimItemCount).toBe(2);
    expect(summary.summary.highSeverityCount).toBe(1);
    expect(summary.summary.damagedOrMissingCount).toBe(1);
    expect(summary.summary.totalValueCents).toBe(40000);
    expect(summary.topItems.map((item) => item.itemId)).toEqual([
      "item-damaged",
      "item-watch",
    ]);
    expect(summary.topItems[0]).toMatchObject({
      severity: "high",
      photoCount: 2,
    });
    expect(summary.topItems[0].evidenceWarnings).toEqual([
      "High-value item missing serial/model",
    ]);
    expect(summary.timeline).toEqual([
      expect.objectContaining({
        eventId: "audit-status",
        itemName: "Damaged dresser",
        detail: "Status changed from loaded to damaged.",
      }),
      expect.objectContaining({
        eventId: "audit-box",
        itemName: "Damaged dresser",
        detail: "Claim-relevant item was connected to a box.",
      }),
    ]);
  });

  it("returns a clear state when no inventory is claim-relevant", () => {
    const summary = summarizeClaimCenter({
      items: [
        {
          itemId: "item-1",
          name: "Dish towels",
          status: "active",
          condition: "good",
          quantity: 1,
          highValue: false,
          needsReview: false,
          reviewFlags: [],
          planningDefaultKeys: [],
          updatedAt: 1,
        },
      ],
      photos: [],
      memberships: [],
      auditEvents: [],
    });

    expect(summary.summary.claimItemCount).toBe(0);
    expect(summary.summary.averageEvidenceScore).toBe(0);
    expect(summary.topItems).toEqual([]);
    expect(summary.timeline).toEqual([]);
  });
});
