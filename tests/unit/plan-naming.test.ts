import { describe, expect, it } from "vitest";

import { wallDisplayNames } from "@/lib/plan-geometry/naming";

const room = {
  shortId: "R3",
  name: "Kitchen",
  room: {
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 96 },
      { x: 0, y: 96 },
    ],
  },
};

describe("plan geometry naming", () => {
  it("names room boundary walls by compass direction", () => {
    const names = wallDisplayNames({
      rooms: [room],
      walls: [
        { shortId: "W1", wall: { x1: 0, y1: 0, x2: 120, y2: 0 } },
        { shortId: "W2", wall: { x1: 120, y1: 0, x2: 120, y2: 96 } },
      ],
      northAngleDeg: 0,
    });

    expect(names.get("W1")?.label).toBe("Kitchen north wall");
    expect(names.get("W2")?.copyLabel).toBe("W2 — Kitchen east wall");
  });

  it("rotates compass names with plan north angle", () => {
    const names = wallDisplayNames({
      rooms: [room],
      walls: [{ shortId: "W1", wall: { x1: 0, y1: 0, x2: 120, y2: 0 } }],
      northAngleDeg: 45,
    });

    expect(names.get("W1")?.label).toBe("Kitchen northwest wall");
  });

  it("numbers duplicate same-direction walls within a room", () => {
    const names = wallDisplayNames({
      rooms: [
        {
          shortId: "R4",
          name: "Hall",
          room: {
            points: [
              { x: 0, y: 0 },
              { x: 48, y: 0 },
              { x: 48, y: 48 },
              { x: 96, y: 48 },
              { x: 96, y: 96 },
              { x: 0, y: 96 },
            ],
          },
        },
      ],
      walls: [
        { shortId: "W1", wall: { x1: 0, y1: 0, x2: 48, y2: 0 } },
        { shortId: "W2", wall: { x1: 48, y1: 48, x2: 96, y2: 48 } },
      ],
      northAngleDeg: 0,
    });

    expect(names.get("W1")?.label).toBe("Hall north wall 1");
    expect(names.get("W2")?.label).toBe("Hall north wall 2");
  });

  it("names long wall segments that span adjacent room boundaries", () => {
    const names = wallDisplayNames({
      rooms: [
        room,
        {
          shortId: "R4",
          name: "Dining",
          room: {
            points: [
              { x: 120, y: 0 },
              { x: 240, y: 0 },
              { x: 240, y: 96 },
              { x: 120, y: 96 },
            ],
          },
        },
      ],
      walls: [
        {
          shortId: "W9",
          wall: { x1: 0, y1: 0, x2: 240, y2: 0 },
        },
      ],
      northAngleDeg: 0,
    });

    expect(names.get("W9")?.label).toBe(
      "Kitchen north wall / Dining north wall",
    );
    expect(names.get("W9")?.copyLabel).toBe(
      "W9 — Kitchen north wall / Dining north wall",
    );
  });
});
