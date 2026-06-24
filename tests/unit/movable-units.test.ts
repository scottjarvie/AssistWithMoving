import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  buildMovableUnits,
  isLooseMovableUnitItem,
  movableUnitDensityLbPerCuFt,
  summarizeMovableUnits,
} from "@/lib/movable-units";
import type { InventoryItem } from "@/lib/inventory-types";

describe("movable units", () => {
  it("treats boxes and eligible loose items as loadable units with missing-field signals", () => {
    const units = buildMovableUnits({
      boxes: [
        {
          box: boxRecord({
            code: "BOX-001",
            label: "Garage hand tools",
            room: "Garage",
            assignedResourceId: "resource_1" as Id<"transportResources">,
            assignedZoneId: "zone_1" as Id<"transportZones">,
          }),
          itemCount: 0,
          weightSummary: {
            source: "missing",
            label: "missing",
          },
        },
      ],
      looseItems: [
        itemRecord({
          name: "Treadmill",
          room: "Basement",
          estimatedWeightLb: 220,
          dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
          requiresPersonalTransport: false,
          signals: {
            photoCount: 1,
            evidencePhotoCount: 1,
            boxCount: 0,
            assignedBoxCount: 0,
            assignmentCount: 0,
            boxCodes: [],
            assignedResourceNames: [],
            assignedZoneNames: [],
          },
        }),
        itemRecord({
          name: "Archived lamp",
          status: "archived",
        }),
        itemRecord({
          _id: "item_small" as Id<"items">,
          name: "Coffee mugs",
          category: "Kitchen",
          estimatedWeightLb: 2,
          dimensionsIn: { lengthIn: 4, widthIn: 4, heightIn: 5 },
        }),
      ],
      resourceNamesById: new Map([["resource_1", "Moving truck"]]),
      zoneNamesById: new Map([["zone_1", "Front wall"]]),
    });

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      kind: "box",
      label: "BOX-001",
      name: "Garage hand tools",
      assignmentLabel: "Moving truck / Front wall",
      assignmentState: "assigned",
      missingFields: ["weight", "dimensions", "volume"],
    });
    expect(units[0].followUps).toEqual([
      "add weight",
      "add dimensions",
      "add volume",
      "add contents later",
    ]);
    expect(units[0].densityLbPerCuFt).toBeUndefined();
    expect(units[0].densityLabel).toBe("—");

    expect(units[1]).toMatchObject({
      kind: "looseItem",
      label: "Loose item",
      name: "Treadmill",
      weightLabel: "220 lb",
      dimensionsLabel: "72 x 34 x 58 in",
      volumeLabel: "82.2 cu ft from size",
      assignmentLabel: "Needs load assignment",
      missingFields: [],
    });
    const treadmillVolume = units[1].estimatedVolumeCuFt ?? 0;
    expect(treadmillVolume).toBeGreaterThan(0);
    expect(units[1].densityLbPerCuFt).toBeCloseTo(220 / treadmillVolume, 5);
    expect(units[1].densityLabel).toBe(
      `${(220 / treadmillVolume).toFixed(1)} lb/ft³`,
    );

    const summary = summarizeMovableUnits(units);
    expect(summary).toMatchObject({
      total: 2,
      boxes: 1,
      looseItems: 1,
      knownWeightLb: 220,
      missingWeight: 1,
      missingDimensions: 1,
      missingVolume: 1,
      assigned: 1,
      unassigned: 1,
    });
    expect(summary.knownVolumeCuFt).toBeCloseTo(82.2, 1);
  });

  it("keeps ordinary unboxed inventory out of rough movable units", () => {
    expect(
      isLooseMovableUnitItem(
        itemRecord({
          name: "Loose drill bits",
          category: "Tools",
          estimatedWeightLb: 2,
        }),
      ),
    ).toBe(false);
    expect(
      isLooseMovableUnitItem(
        itemRecord({
          name: "Garage workbench",
          category: "Tools",
        }),
      ),
    ).toBe(true);
    expect(
      isLooseMovableUnitItem(
        itemRecord({
          name: "Dining table",
          category: "Furniture",
        }),
      ),
    ).toBe(true);
    expect(
      isLooseMovableUnitItem(
        itemRecord({
          name: "AI captured visible unit",
          aiTags: ["movable-unit"],
        }),
      ),
    ).toBe(true);
    expect(
      isLooseMovableUnitItem(
        itemRecord({
          name: "Assigned but uncategorized unit",
          assignedResourceId: "resource_1" as Id<"transportResources">,
        }),
      ),
    ).toBe(true);
  });

  it("summarizes known rough load totals without counting missing units as zero", () => {
    const units = buildMovableUnits({
      boxes: [
        {
          box: boxRecord({
            code: "BOX-050",
            label: "Books",
            estimatedWeightLb: 42,
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          }),
          itemCount: 0,
        },
        {
          box: boxRecord({
            _id: "box_2" as Id<"boxes">,
            code: "BOX-051",
            label: "Unknown garage box",
          }),
          itemCount: 0,
        },
      ],
      looseItems: [
        itemRecord({
          name: "Two folding tables",
          quantity: 2,
          estimatedWeightLb: 15,
          estimatedVolumeCuFt: 4,
        }),
      ],
    });

    const summary = summarizeMovableUnits(units);

    expect(summary).toMatchObject({
      total: 3,
      boxes: 2,
      looseItems: 1,
      knownWeightLb: 72,
      knownVolumeCuFt: 9.5,
      missingWeight: 1,
      missingDimensions: 2,
      missingVolume: 1,
      assigned: 0,
      unassigned: 3,
    });
    expect(
      units.find((unit) => unit.name === "Two folding tables"),
    ).toMatchObject({
      weightLabel: "30 lb",
      volumeLabel: "8 cu ft total",
    });
  });

  it("marks personal-transport loose items without forcing them into a box", () => {
    const units = buildMovableUnits({
      looseItems: [
        itemRecord({
          name: "Camera backpack",
          requiresPersonalTransport: true,
        }),
        itemRecord({
          _id: "item_2" as Id<"items">,
          name: "Medicine bag",
          disposition: "personalTransport",
        }),
      ],
    });
    const [unit, dispositionOnlyUnit] = units;

    expect(unit.assignmentLabel).toBe("Personal transport");
    expect(unit.assignmentState).toBe("owner");
    expect(dispositionOnlyUnit.assignmentLabel).toBe("Personal transport");
    expect(dispositionOnlyUnit.assignmentState).toBe("owner");
    expect(unit.followUps).toContain("add weight");
    expect(unit.followUps).toContain("add dimensions");
    expect(summarizeMovableUnits(units)).toMatchObject({
      assigned: 2,
      unassigned: 0,
    });
  });

  it("uses direct loose-item assignment fields when present", () => {
    const [unit] = buildMovableUnits({
      looseItems: [
        itemRecord({
          name: "Planer",
          assignedResourceId: "resource_1" as Id<"transportResources">,
          assignedZoneId: "zone_1" as Id<"transportZones">,
        }),
      ],
      resourceNamesById: new Map([["resource_1", "Workshop trailer"]]),
      zoneNamesById: new Map([["zone_1", "Rear wall"]]),
    });

    expect(unit).toMatchObject({
      kind: "looseItem",
      name: "Planer",
      assignedResourceId: "resource_1",
      assignedZoneId: "zone_1",
      assignmentLabel: "Workshop trailer / Rear wall",
      assignmentState: "assigned",
    });
  });

  it("leaves density blank when weight is present but volume is missing", () => {
    const [unit] = buildMovableUnits({
      looseItems: [
        itemRecord({
          name: "Mystery crate",
          estimatedWeightLb: 40,
        }),
      ],
    });

    expect(unit.estimatedWeightLb).toBe(40);
    expect(unit.densityLbPerCuFt).toBeUndefined();
    expect(unit.densityLabel).toBe("—");
  });
});

describe("movableUnitDensityLbPerCuFt", () => {
  it("computes pounds per cubic foot when weight and volume are present", () => {
    expect(movableUnitDensityLbPerCuFt(24, 1.6)).toBeCloseTo(15, 5);
  });

  it("returns undefined when weight is missing", () => {
    expect(movableUnitDensityLbPerCuFt(undefined, 1.6)).toBeUndefined();
  });

  it("returns undefined when volume is missing", () => {
    expect(movableUnitDensityLbPerCuFt(24, undefined)).toBeUndefined();
  });

  it("returns undefined when volume is zero or negative", () => {
    expect(movableUnitDensityLbPerCuFt(24, 0)).toBeUndefined();
    expect(movableUnitDensityLbPerCuFt(24, -2)).toBeUndefined();
  });
});

function boxRecord(overrides: Partial<Doc<"boxes">> = {}): Doc<"boxes"> {
  return {
    _id: "box_1" as Id<"boxes">,
    _creationTime: 1,
    householdId: "household_123" as Id<"households">,
    moveId: "move_123" as Id<"moves">,
    code: "BOX-001",
    status: "empty",
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentLocked: false,
    createdByUserId: "user_123" as Id<"users">,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Doc<"boxes">;
}

function itemRecord(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    _id: "item_1" as Id<"items">,
    _creationTime: 1,
    householdId: "household_123" as Id<"households">,
    moveId: "move_123" as Id<"moves">,
    name: "Loose item",
    status: "inventory",
    disposition: "mover",
    quantity: 1,
    planningDefaultKeys: [],
    highValue: false,
    hazardousFlag: false,
    requiresPersonalTransport: false,
    needsReview: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as InventoryItem;
}
