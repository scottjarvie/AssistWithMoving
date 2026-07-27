import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  composeBoxRows,
  composeEstimateReport,
  composeItemsWithSignals,
  composeLoadPlanSnapshot,
  composeResourcesWithZones,
  type LoadPlanSnapshotData,
} from "../../convex/lib/loadPlanSnapshot";
import { visibilityForHouseholdRole } from "../../convex/lib/roles";

const householdId = "household-1" as Id<"households">;
const moveId = "move-1" as Id<"moves">;
const resourceId = "resource-1" as Id<"transportResources">;
const boxId = "box-1" as Id<"boxes">;
const packedItemId = "item-packed" as Id<"items">;
const looseItemId = "item-loose" as Id<"items">;

const packedItem = {
  _id: packedItemId,
  _creationTime: 10,
  householdId,
  moveId,
  code: "item-0001",
  name: "Camera",
  status: "packed",
  disposition: "mover",
  quantity: 1,
  fragility: "high",
  highValue: true,
  hazardousFlag: false,
  requiresPersonalTransport: false,
  planningDefaultKeys: [],
  valueCents: 125_000,
  replacementValueCents: 150_000,
  serialNumber: "CAM-SECRET",
  modelNumber: "PRO-SECRET",
  privateNotes: "Owner only",
  aiSummary: "Worth 1250 dollars",
  researchSummary: "Private valuation",
  researchSources: ["private-source"],
  researchNotes: "Private research",
  createdAt: 10,
  updatedAt: 10,
} as unknown as Doc<"items">;

const looseItem = {
  _id: looseItemId,
  _creationTime: 20,
  householdId,
  moveId,
  code: "item-0002",
  name: "Floor lamp",
  status: "inventory",
  disposition: "mover",
  quantity: 1,
  fragility: "standard",
  highValue: false,
  hazardousFlag: false,
  requiresPersonalTransport: true,
  planningDefaultKeys: [],
  assignedResourceId: resourceId,
  createdAt: 20,
  updatedAt: 20,
} as unknown as Doc<"items">;

const deletedItem = {
  ...looseItem,
  _id: "item-deleted" as Id<"items">,
  _creationTime: 30,
  name: "Deleted chair",
  deletedAt: 30,
  updatedAt: 30,
} as Doc<"items">;

const lateZone = {
  _id: "zone-late" as Id<"transportZones">,
  _creationTime: 1,
  householdId,
  moveId,
  resourceId,
  name: "Rear",
  capacity: {},
  preferredTags: [],
  sortOrder: 20,
  createdByUserId: "user-1" as Id<"users">,
  createdAt: 1,
  updatedAt: 1,
} as Doc<"transportZones">;

const earlyZone = {
  ...lateZone,
  _id: "zone-early" as Id<"transportZones">,
  _creationTime: 2,
  name: "Front",
  sortOrder: 10,
} as Doc<"transportZones">;

const data = {
  householdId,
  move: {
    _id: moveId,
    moveLevelWeightAllowanceLb: 4_000,
  } as unknown as Doc<"moves">,
  // Signal-list order is newest first.
  items: [deletedItem, looseItem, packedItem],
  boxItems: [
    {
      _id: "membership-1" as Id<"boxItems">,
      _creationTime: 1,
      householdId,
      moveId,
      boxId,
      itemId: packedItemId,
      quantity: 2,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  boxes: [
    {
      _id: boxId,
      _creationTime: 1,
      householdId,
      moveId,
      code: "B-001",
      label: "Camera gear",
      status: "sealed",
      assignedResourceId: resourceId,
      createdByUserId: "user-1" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"boxes">,
  ],
  photos: [
    {
      _id: "photo-1" as Id<"itemPhotos">,
      _creationTime: 1,
      householdId,
      moveId,
      itemId: packedItemId,
      photoType: "condition",
      privacyLevel: "household",
      documentationProfileTypes: [],
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"itemPhotos">,
  ],
  resources: [
    {
      _id: resourceId,
      _creationTime: 1,
      householdId,
      moveId,
      type: "truck",
      name: "Moving truck",
      capacity: { maxWeightLb: 5_000, maxVolumeCuFt: 1_000 },
      rules: [],
      sortOrder: 1,
      createdByUserId: "user-1" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    } as Doc<"transportResources">,
  ],
  // Deliberately not insertion-sorted by sortOrder.
  zones: [lateZone, earlyZone],
  people: [
    {
      _id: "person-1" as Id<"movePeople">,
      _creationTime: 1,
      householdId,
      moveId,
      name: "Scott",
      role: "owner",
      sortOrder: 1,
      createdByUserId: "user-1" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    } as Doc<"movePeople">,
  ],
} satisfies LoadPlanSnapshotData;

describe("load plan snapshot composers", () => {
  it("matches all four individual query compositions", () => {
    const visibility = visibilityForHouseholdRole("owner");
    const snapshot = composeLoadPlanSnapshot(data, visibility);

    expect(snapshot).toEqual({
      boxes: composeBoxRows(data),
      items: composeItemsWithSignals(
        { ...data, items: data.items.filter((item) => !item.deletedAt) },
        visibility,
      ),
      resourcesWithZones: composeResourcesWithZones(data),
      report: composeEstimateReport(data),
    });
    expect(snapshot.items.map((item) => item._id)).not.toContain(
      deletedItem._id,
    );
  });

  it("preserves walled-role item visibility and redaction", () => {
    const ownerRows = composeItemsWithSignals(
      data,
      visibilityForHouseholdRole("owner"),
    );
    const guestRows = composeItemsWithSignals(
      data,
      visibilityForHouseholdRole("guest"),
    );
    const ownerItem = ownerRows.find((item) => item._id === packedItemId);
    const guestItem = guestRows.find((item) => item._id === packedItemId);

    expect(ownerItem).toMatchObject({
      valueCents: 125_000,
      serialNumber: "CAM-SECRET",
      privateNotes: "Owner only",
      researchSummary: "Private valuation",
    });
    expect(guestItem).toMatchObject({
      valueCents: undefined,
      replacementValueCents: undefined,
      serialNumber: undefined,
      modelNumber: undefined,
      privateNotes: undefined,
      aiSummary: undefined,
      researchSummary: undefined,
      researchSources: undefined,
      researchNotes: undefined,
    });
    expect(guestItem?.signals).toEqual(ownerItem?.signals);
  });

  it("orders grouped zones like by_resource_sort regardless of insertion order", () => {
    const resourcesWithZones = composeResourcesWithZones(data);

    expect(
      resourcesWithZones[0]?.zones.map((zone) => ({
        name: zone.name,
        sortOrder: zone.sortOrder,
      })),
    ).toEqual([
      { name: "Front", sortOrder: 10 },
      { name: "Rear", sortOrder: 20 },
    ]);
  });
});
