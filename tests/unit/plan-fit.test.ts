import { describe, expect, it } from "vitest";

import {
  analyzePlanFit,
  itemPassesOpening,
  secondSmallestDimension,
  type FitOpening,
  type FitPlacement,
  type FitRoom,
  type FitWall,
} from "../../src/lib/plan-geometry/fit";

const room: FitRoom = {
  shortId: "R1",
  name: "Bedroom 2",
  points: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 120 },
    { x: 0, y: 120 },
  ],
};

const walls: FitWall[] = [
  { shortId: "W1", wall: { x1: 0, y1: 0, x2: 120, y2: 0 } },
  { shortId: "W2", wall: { x1: 120, y1: 0, x2: 120, y2: 120 } },
  { shortId: "W3", wall: { x1: 120, y1: 120, x2: 0, y2: 120 } },
  { shortId: "W4", wall: { x1: 0, y1: 120, x2: 0, y2: 0 } },
];

const doors: FitOpening[] = [
  {
    shortId: "D4",
    wallShortId: "W1",
    widthIn: 30,
    kind: "door",
  },
  {
    shortId: "D7",
    wallShortId: "W3",
    widthIn: 28,
    kind: "door",
  },
];

function placement(patch: Partial<FitPlacement> = {}): FitPlacement {
  return {
    shortId: "P12",
    label: "Sofa",
    x: 60,
    y: 60,
    rotationDeg: 0,
    footprint: {
      lengthIn: 84,
      widthIn: 38,
      measured: true,
    },
    dimensions: {
      lengthIn: 84,
      widthIn: 38,
      heightIn: 34,
    },
    ...patch,
  };
}

describe("plan fit checks", () => {
  it("uses the second-smallest dimension for tilted doorway fit", () => {
    expect(secondSmallestDimension({ lengthIn: 84, widthIn: 38, heightIn: 34 })).toBe(38);
    expect(itemPassesOpening({ lengthIn: 84, widthIn: 28, heightIn: 20 }, 30)).toBe(true);
    expect(itemPassesOpening({ lengthIn: 84, widthIn: 29, heightIn: 20 }, 30)).toBe(false);
    expect(itemPassesOpening({ lengthIn: 84, widthIn: 30, heightIn: 20 }, 30)).toBe(false);
    expect(itemPassesOpening({ lengthIn: 84 }, 30)).toBeNull();
  });

  it("warns when a placement footprint crosses a wall", () => {
    const report = analyzePlanFit({
      placements: [placement({ y: 8 })],
      rooms: [room],
      walls,
      openings: doors,
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "footprintCrossesWall",
          placementShortId: "P12",
          wallShortId: "W1",
        }),
      ]),
    );
  });

  it("warns when rotated footprints extend outside the containing room", () => {
    const report = analyzePlanFit({
      placements: [
        placement({
          x: 104,
          y: 104,
          rotationDeg: 45,
          footprint: { lengthIn: 80, widthIn: 30, measured: true },
        }),
      ],
      rooms: [room],
      walls: [],
      openings: doors,
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "footprintOutsideRoom",
          placementShortId: "P12",
          roomShortId: "R1",
        }),
      ]),
    );
  });

  it("warns when an item fits through no door of its room", () => {
    const report = analyzePlanFit({
      placements: [placement()],
      rooms: [room],
      walls,
      openings: doors,
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "doorFit",
          placementShortId: "P12",
          doorShortIds: ["D4", "D7"],
          message: expect.stringContaining("P12"),
        }),
      ]),
    );
    expect(report.issues[0]?.message).toContain("D4: 30\"");
    expect(report.issues[0]?.message).toContain("D7: 28\"");
    expect(report.doorIssues.get("D4")).toHaveLength(1);
  });

  it("keeps a queen bed footprint correctly scaled inside a 12 by 12 room", () => {
    const twelveByTwelveRoom: FitRoom = {
      shortId: "R12",
      name: "Guest room",
      points: [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
        { x: 144, y: 144 },
        { x: 0, y: 144 },
      ],
    };
    const report = analyzePlanFit({
      placements: [
        placement({
          label: "Queen bed",
          x: 72,
          y: 72,
          footprint: {
            lengthIn: 80,
            widthIn: 60,
            measured: true,
          },
          dimensions: {
            lengthIn: 80,
            widthIn: 60,
            heightIn: 24,
          },
        }),
      ],
      rooms: [twelveByTwelveRoom],
      walls: [],
      openings: [],
    });

    expect(report.issues).toEqual([]);
  });

  it("matches openings on wall segments that only partly overlap the room edge", () => {
    const extendedWall: FitWall = {
      shortId: "W_LONG",
      wall: { x1: -120, y1: 0, x2: 60, y2: 0 },
    };
    const extendedDoor: FitOpening = {
      shortId: "D_LONG",
      wallShortId: "W_LONG",
      widthIn: 30,
      kind: "door",
    };
    const report = analyzePlanFit({
      placements: [placement()],
      rooms: [room],
      walls: [extendedWall],
      openings: [extendedDoor],
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "doorFit",
          placementShortId: "P12",
          doorShortIds: ["D_LONG"],
        }),
      ]),
    );
    expect(report.doorIssues.get("D_LONG")).toHaveLength(1);
  });

  it("does not false-warn missing dimensions and emits an unknown-size note", () => {
    const report = analyzePlanFit({
      placements: [
        placement({
          dimensions: { lengthIn: 84 },
          footprint: { lengthIn: 24, widthIn: 24, measured: false },
        }),
      ],
      rooms: [room],
      walls: [],
      openings: doors,
    });

    expect(report.issues).toEqual([
      expect.objectContaining({
        type: "unknownSize",
        placementShortId: "P12",
      }),
    ]);
  });

  it("keeps a 300-placement check under the 16ms canvas budget", () => {
    const placements = Array.from({ length: 300 }, (_, index) =>
      placement({
        shortId: `P${index}`,
        label: `Item ${index}`,
        x: 24 + (index % 12) * 6,
        y: 24 + Math.floor(index / 12) * 4,
        dimensions: { lengthIn: 20, widthIn: 18, heightIn: 16 },
        footprint: { lengthIn: 20, widthIn: 18, measured: true },
      }),
    );

    const durations = Array.from({ length: 3 }, () =>
      analyzePlanFit({
        placements,
        rooms: [room],
        walls,
        openings: doors,
      }).durationMs,
    );

    expect(Math.min(...durations)).toBeLessThan(16);
  });
});
