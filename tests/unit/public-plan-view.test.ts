import { describe, expect, it } from "vitest";

import { buildPublicPlanView } from "../../convex/lib/publicPlanView";

type Row = Record<string, unknown> & { _id: string };

class FakeDb {
  constructor(private readonly tables: Record<string, Row[]>) {}

  async get(id: string) {
    for (const rows of Object.values(this.tables)) {
      const found = rows.find((row) => row._id === id);
      if (found) return found;
    }
    return null;
  }

  query(table: string) {
    const rows = this.tables[table] ?? [];
    return {
      withIndex: (_name: string, build: (query: unknown) => unknown) => {
        const clauses: Array<{ field: string; value: unknown }> = [];
        const query = {
          eq: (field: string, value: unknown) => {
            clauses.push({ field, value });
            return query;
          },
        };
        build(query);
        return {
          collect: async () =>
            rows.filter((row) =>
              clauses.every(({ field, value }) => row[field] === value),
            ),
        };
      },
    };
  }
}

const polygon = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 120 },
  { x: 0, y: 120 },
];

function publicPlanDb() {
  return new FakeDb({
    floorPlans: [
      {
        _id: "plan_1",
        householdId: "household_1",
        moveId: "move_1",
        name: "Destination plan",
        kind: "destination",
        status: "active",
        northAngleDeg: 0,
        defaultWallThicknessIn: 4.5,
        defaultCeilingHeightIn: 96,
        gridSnapIn: 3,
        shortIdCounters: {
          nextWall: 1,
          nextRoom: 2,
          nextOpening: 1,
          nextFeature: 1,
          nextZone: 1,
          nextAnnotation: 1,
          nextPlacement: 2,
        },
        nextSeq: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    moves: [
      {
        _id: "move_1",
        householdId: "household_1",
        title: "Family move",
      },
    ],
    planLevels: [
      {
        _id: "level_1",
        planId: "plan_1",
        name: "Main",
        levelType: "indoor",
        sortOrder: 0,
        ceilingHeightIn: 96,
        underlay: {
          photoId: "private_blueprint_photo",
          storageId: "private_storage_id",
        },
      },
      {
        _id: "level_archived",
        planId: "plan_1",
        name: "Old level",
        levelType: "indoor",
        sortOrder: 1,
        archivedAt: 3,
      },
    ],
    planEntities: [
      {
        _id: "room_1",
        planId: "plan_1",
        levelId: "level_1",
        shortId: "R1",
        entityType: "room",
        name: "Living Room",
        locked: false,
        room: { points: polygon },
      },
      {
        _id: "annotation_1",
        planId: "plan_1",
        levelId: "level_1",
        shortId: "A1",
        entityType: "annotation",
        locked: false,
        annotation: { x: 12, y: 12, text: "PRIVATE annotation text" },
      },
      {
        _id: "room_archived",
        planId: "plan_1",
        levelId: "level_1",
        shortId: "R2",
        entityType: "room",
        name: "Archived room",
        locked: false,
        room: { points: polygon },
        archivedAt: 3,
      },
    ],
    planPlacements: [
      {
        _id: "placement_1",
        planId: "plan_1",
        levelId: "level_1",
        shortId: "P1",
        itemId: "item_1",
        x: 50,
        y: 50,
        rotationDeg: 0,
        locked: false,
      },
      {
        _id: "placement_archived",
        planId: "plan_1",
        levelId: "level_1",
        shortId: "P2",
        x: 60,
        y: 60,
        rotationDeg: 0,
        archivedAt: 3,
      },
    ],
    items: [
      {
        _id: "item_1",
        householdId: "household_1",
        moveId: "move_1",
        name: "Lamp",
        room: " living room ",
        status: "active",
        quantity: 1,
        category: "Lighting",
        fragility: "high",
        planningDefaultKeys: ["doNotLetMoversTouch"],
        valueCents: 25000,
        serialNumber: "PRIVATE-SERIAL",
        privateNotes: "PRIVATE item note",
        researchNotes: "PRIVATE research text",
      },
      {
        _id: "item_unplaced",
        householdId: "household_1",
        moveId: "move_1",
        name: "Unplaced chair",
        status: "active",
        quantity: 1,
        planningDefaultKeys: [],
      },
      {
        _id: "item_archived",
        householdId: "household_1",
        moveId: "move_1",
        name: "Archived item",
        status: "archived",
        quantity: 1,
        planningDefaultKeys: [],
      },
    ],
    boxes: [
      {
        _id: "box_1",
        householdId: "household_1",
        moveId: "move_1",
        code: "B-1",
        label: "Books",
        room: "LIVING ROOM",
        status: "sealed",
      },
      {
        _id: "box_archived",
        householdId: "household_1",
        moveId: "move_1",
        code: "B-OLD",
        status: "archived",
      },
    ],
    plannedItems: [],
    boxItems: [
      {
        _id: "membership_1",
        householdId: "household_1",
        moveId: "move_1",
        boxId: "box_1",
        itemId: "item_1",
        quantity: 2,
      },
      {
        _id: "membership_other_household",
        householdId: "household_other",
        moveId: "move_1",
        boxId: "box_1",
        itemId: "item_1",
        quantity: 10,
      },
    ],
  });
}

describe("public plan view projection", () => {
  it("groups active move records while omitting private and archived data", async () => {
    const result = await buildPublicPlanView(
      { db: publicPlanDb() as never },
      { householdId: "household_1" as never, moveId: "move_1" as never },
    );

    expect(result).toMatchObject({
      plan: { name: "Destination plan", moveTitle: "Family move" },
      privacy: {
        underlayHidden: true,
        valuesHidden: true,
        privateNotesHidden: true,
        annotationsHidden: true,
      },
    });
    expect(result?.levels).toHaveLength(1);
    expect(result?.levels[0]?.rooms).toHaveLength(1);
    expect(result?.levels[0]?.rooms[0]).toMatchObject({
      name: "Living Room",
      placed: [{ placementId: "placement_1", shortId: "P1", label: "Lamp" }],
      items: [
        {
          itemId: "item_1",
          name: "Lamp",
          fragile: true,
          doNotLetMoversTouch: true,
        },
      ],
      boxes: [{ boxId: "box_1", code: "B-1", itemCount: 2 }],
    });
    expect(result?.unplaced.items.map((item) => item.name)).toEqual([
      "Unplaced chair",
    ]);

    const serialized = JSON.stringify(result);
    for (const privateValue of [
      "PRIVATE annotation text",
      "PRIVATE-SERIAL",
      "PRIVATE item note",
      "PRIVATE research text",
      "private_blueprint_photo",
      "private_storage_id",
      "Archived item",
      "B-OLD",
      "Archived room",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("returns no plan when the requested household does not own the active plan", async () => {
    await expect(
      buildPublicPlanView(
        { db: publicPlanDb() as never },
        { householdId: "household_other" as never, moveId: "move_1" as never },
      ),
    ).resolves.toBeNull();
  });
});
