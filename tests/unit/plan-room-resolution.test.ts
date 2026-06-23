import { describe, expect, it } from "vitest";

import { resolvePlacementRoom } from "../../src/lib/plan-room-resolution";

const levels = [
  { levelId: "level-main", name: "Main floor", levelType: "indoor" as const },
  { levelId: "level-yard", name: "Yard", levelType: "outdoor" as const },
];

describe("plan room resolution", () => {
  it("resolves the containing room for a placement center", () => {
    expect(
      resolvePlacementRoom({
        placementId: "placement-chair",
        levels,
        rooms: [
          {
            entityId: "room-living",
            levelId: "level-main",
            shortId: "R1",
            name: "Living room",
            room: {
              points: [
                { x: 0, y: 0 },
                { x: 120, y: 0 },
                { x: 120, y: 120 },
                { x: 0, y: 120 },
              ],
            },
          },
        ],
        placements: [
          { placementId: "placement-chair", levelId: "level-main", x: 24, y: 36 },
        ],
      }),
    ).toMatchObject({
      roomEntityId: "room-living",
      roomName: "Living room",
      moveSpaceKind: "destinationRoom",
    });
  });

  it("chooses the smallest containing room when rooms overlap", () => {
    const result = resolvePlacementRoom({
      placementId: "placement-table",
      levels,
      rooms: [
        {
          entityId: "room-large",
          levelId: "level-main",
          shortId: "R1",
          name: "Open area",
          room: {
            points: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 200 },
              { x: 0, y: 200 },
            ],
          },
        },
        {
          entityId: "room-small",
          levelId: "level-main",
          shortId: "R2",
          name: "Dining nook",
          room: {
            points: [
              { x: 50, y: 50 },
              { x: 100, y: 50 },
              { x: 100, y: 100 },
              { x: 50, y: 100 },
            ],
          },
        },
      ],
      placements: [
        { placementId: "placement-table", levelId: "level-main", x: 75, y: 75 },
      ],
    });

    expect(result).toMatchObject({
      roomEntityId: "room-small",
      roomName: "Dining nook",
    });
  });

  it("inherits the parent placement room for contained placements", () => {
    const result = resolvePlacementRoom({
      placementId: "placement-box",
      levels,
      rooms: [
        {
          entityId: "room-bedroom",
          levelId: "level-main",
          shortId: "R3",
          name: "Bedroom",
          room: {
            points: [
              { x: 0, y: 0 },
              { x: 120, y: 0 },
              { x: 120, y: 120 },
              { x: 0, y: 120 },
            ],
          },
        },
      ],
      placements: [
        { placementId: "placement-dresser", levelId: "level-main", x: 40, y: 40 },
        {
          placementId: "placement-box",
          levelId: "level-main",
          x: 300,
          y: 300,
          parentPlacementId: "placement-dresser",
        },
      ],
    });

    expect(result).toMatchObject({
      roomName: "Bedroom",
      inheritedFromPlacementId: "placement-dresser",
    });
  });

  it("falls back to the level name and yard kind when no room contains it", () => {
    expect(
      resolvePlacementRoom({
        placementId: "placement-planter",
        levels,
        rooms: [],
        placements: [
          { placementId: "placement-planter", levelId: "level-yard", x: 20, y: 20 },
        ],
      }),
    ).toMatchObject({
      roomName: "Yard",
      moveSpaceKind: "yardOutdoor",
    });
  });
});
