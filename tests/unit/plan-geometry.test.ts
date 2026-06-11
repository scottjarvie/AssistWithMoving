import { describe, expect, it } from "vitest";

import {
  clampOpeningToWall,
  compassDirection,
  distancePointToSegment,
  doorSwingArc,
  footprintCorners,
  footprintIntersectsWall,
  pointAlongWall,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonSelfIntersects,
  segmentIntersection,
  snapToGrid,
  squareInchesToSquareFeet,
  wallOffsetAtPoint,
  wallOutwardNormal,
} from "../../src/lib/plan-geometry";
import {
  calibratedUnderlayScale,
  parsePlanLengthInput,
} from "../../src/lib/plan-geometry/underlay";

describe("plan geometry", () => {
  it("snaps points to an inch grid and ignores invalid grids", () => {
    expect(snapToGrid({ x: 10.4, y: 11.6 }, 3)).toEqual({ x: 9, y: 12 });
    expect(snapToGrid({ x: 10.4, y: 11.6 }, 0)).toEqual({
      x: 10.4,
      y: 11.6,
    });
  });

  it("computes polygon area and square-foot conversion", () => {
    const areaSqIn = polygonArea([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ]);

    expect(areaSqIn).toBe(14400);
    expect(squareInchesToSquareFeet(areaSqIn)).toBe(100);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("computes centroids with a degenerate fallback", () => {
    expect(
      polygonCentroid([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 },
        { x: 0, y: 6 },
      ]),
    ).toEqual({ x: 3, y: 3 });

    expect(
      polygonCentroid([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 12, y: 0 },
      ]),
    ).toEqual({ x: 6, y: 0 });
  });

  it("treats polygon edge points as inside", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(pointInPolygon({ x: 5, y: 5 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 5 }, polygon)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, polygon)).toBe(false);
  });

  it("finds segment intersections and misses disjoint segments", () => {
    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ),
    ).toEqual({ x: 5, y: 5 });

    expect(
      segmentIntersection(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ),
    ).toBeNull();
  });

  it("measures distance to normal and zero-length segments", () => {
    expect(distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distancePointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it("returns an outward wall normal relative to a room polygon", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(wallOutwardNormal({ x1: 0, y1: 0, x2: 10, y2: 0 }, room)).toEqual({
      x: 0,
      y: -1,
    });
    expect(wallOutwardNormal({ x1: 1, y1: 1, x2: 1, y2: 1 }, room)).toEqual({
      x: 0,
      y: -1,
    });
  });

  it("maps angles to compass directions with north rotation", () => {
    expect(compassDirection(0, 0)).toBe("N");
    expect(compassDirection(45, 0)).toBe("NE");
    expect(compassDirection(90, 0)).toBe("E");
    expect(compassDirection(90, 90)).toBe("N");
  });

  it("returns footprint corners for 0, 90, and 45 degree rotation", () => {
    expect(footprintCorners(0, 0, 10, 4, 0)).toEqual([
      { x: -5, y: -2 },
      { x: 5, y: -2 },
      { x: 5, y: 2 },
      { x: -5, y: 2 },
    ]);

    const rotated90 = footprintCorners(0, 0, 10, 4, 90);
    expect(rotated90[0].x).toBeCloseTo(2);
    expect(rotated90[0].y).toBeCloseTo(-5);

    const rotated45 = footprintCorners(0, 0, 10, 4, 45);
    expect(rotated45[0].x).toBeCloseTo(-2.1213, 4);
    expect(rotated45[0].y).toBeCloseTo(-4.9497, 4);
  });

  it("detects footprint-wall intersections", () => {
    const corners = footprintCorners(0, 0, 10, 10, 0);

    expect(
      footprintIntersectsWall(corners, { x1: -6, y1: 0, x2: 6, y2: 0 }),
    ).toBe(true);
    expect(
      footprintIntersectsWall(corners, { x1: 20, y1: 0, x2: 30, y2: 0 }),
    ).toBe(false);
  });

  it("detects self-intersecting polygons", () => {
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ]),
    ).toBe(true);
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });

  it("places points along walls and handles zero-length walls", () => {
    expect(pointAlongWall({ x1: 0, y1: 0, x2: 10, y2: 0 }, 4)).toEqual({
      x: 4,
      y: 0,
    });
    expect(pointAlongWall({ x1: 1, y1: 2, x2: 1, y2: 2 }, 4)).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("projects opening points and clamps opening edits to the wall", () => {
    const wall = { x1: 0, y1: 0, x2: 120, y2: 0 };
    const opening = {
      offsetAlongWallIn: 20,
      widthIn: 36,
      swing: "right" as const,
    };

    expect(wallOffsetAtPoint(wall, { x: -20, y: 30 })).toBe(0);
    expect(wallOffsetAtPoint(wall, { x: 150, y: 30 })).toBe(120);

    expect(
      clampOpeningToWall({
        opening,
        wall,
        point: { x: 5, y: 20 },
        mode: "center",
      }),
    ).toMatchObject({ offsetAlongWallIn: 0, widthIn: 36 });
    expect(
      clampOpeningToWall({
        opening,
        wall,
        point: { x: 118, y: 20 },
        mode: "center",
      }),
    ).toMatchObject({ offsetAlongWallIn: 84, widthIn: 36 });
    expect(
      clampOpeningToWall({
        opening,
        wall,
        point: { x: 40, y: 0 },
        mode: "start",
      }),
    ).toMatchObject({ offsetAlongWallIn: 40, widthIn: 16 });
    expect(
      clampOpeningToWall({
        opening,
        wall,
        point: { x: 130, y: 0 },
        mode: "end",
      }),
    ).toMatchObject({ offsetAlongWallIn: 20, widthIn: 100 });
  });

  it("rejects opening edits on walls that cannot hold the minimum width", () => {
    expect(
      clampOpeningToWall({
        opening: { offsetAlongWallIn: 0, widthIn: 36 },
        wall: { x1: 0, y1: 0, x2: 0, y2: 0 },
        point: { x: 0, y: 0 },
        mode: "center",
      }),
    ).toBeNull();
  });

  it("builds door swing arc points unless swing is none", () => {
    const arc = doorSwingArc(
      { offsetAlongWallIn: 0, widthIn: 36, swing: "right" },
      { x1: 0, y1: 0, x2: 60, y2: 0 },
    );

    expect(arc).toHaveLength(9);
    expect(arc[0].x).toBeCloseTo(0);
    expect(arc[0].y).toBeCloseTo(36);
    expect(
      doorSwingArc(
        { offsetAlongWallIn: 0, widthIn: 36, swing: "none" },
        { x1: 0, y1: 0, x2: 60, y2: 0 },
      ),
    ).toEqual([]);
  });

  it("parses underlay calibration lengths", () => {
    expect(parsePlanLengthInput("120")).toBe(120);
    expect(parsePlanLengthInput("10 ft")).toBe(120);
    expect(parsePlanLengthInput("2m")).toBeCloseTo(78.7402, 4);
    expect(parsePlanLengthInput("0")).toBeNull();
    expect(parsePlanLengthInput("ten feet")).toBeNull();
  });

  it("calibrates underlay scale from two clicked points", () => {
    expect(
      calibratedUnderlayScale({
        currentScaleInPerPx: 0.5,
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 70, y: 10 },
        realLengthIn: 120,
      }),
    ).toBe(1);

    const tenFootWallScale = calibratedUnderlayScale({
      currentScaleInPerPx: 0.75,
      firstPoint: { x: 0, y: 0 },
      secondPoint: { x: 120, y: 0 },
      realLengthIn: 120,
    });
    expect(tenFootWallScale).toBe(0.75);
    expect(160 * (tenFootWallScale ?? 0)).toBeCloseTo(120, 2);

    expect(
      calibratedUnderlayScale({
        currentScaleInPerPx: 0.5,
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 10, y: 10 },
        realLengthIn: 120,
      }),
    ).toBeNull();
  });
});
