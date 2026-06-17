import type {
  FloorplanMeasurement,
  FloorplanSolveResult,
} from "@/lib/floorplans/types";
import { floorplanMeasurements } from "@/lib/floorplans/sample-measurement-fixtures";
import {
  detectRoomOverlaps,
  solveFloorplanPuzzle,
  type FloorplanPropertyZoneConstraint,
  type FloorplanRoomConstraint,
} from "@/lib/floorplans/solver";

export const scottHouseRoomConstraints: FloorplanRoomConstraint[] = [
  {
    id: "front-living",
    label: "Front living room",
    kind: "room",
    confidence: "high",
    xIn: 0,
    yIn: ft(19),
    widthIn: ft(24),
    depthIn: ft(17.5),
    accessNote: "Front door enters this room; kitchen is reached through the opening on the east side.",
    connectsTo: [
      {
        targetRoomId: "kitchen",
        label: "Kitchen",
        kind: "opening",
        confidence: "medium",
        note: "Shown in overview and front/kitchen sketch; exact opening width is not labeled.",
      },
    ],
    sourceMeasurementIds: ["m-front-living-width", "m-front-living-depth"],
  },
  {
    id: "bonus-room",
    label: "Bonus room",
    kind: "room",
    confidence: "high",
    xIn: ft(8),
    yIn: 0,
    widthIn: ft(25),
    depthIn: ft(13),
    accessNote: "Reached from kitchen and laundry/entry area; backyard doors exit from this space.",
    connectsTo: [
      {
        targetRoomId: "kitchen",
        label: "Kitchen",
        kind: "opening",
        confidence: "high",
        note: "Detail sketch labels a 66 in entrance toward the kitchen.",
      },
      {
        targetRoomId: "laundry",
        label: "Laundry",
        kind: "opening",
        confidence: "medium",
        note: "Overview and detail sketches show a lower-left connection through the laundry/closet area.",
      },
    ],
    sourceMeasurementIds: ["m-bonus-width", "m-bonus-depth"],
  },
  {
    id: "laundry",
    label: "Laundry",
    kind: "utility",
    confidence: "high",
    xIn: ft(8),
    yIn: ft(13),
    widthIn: ft(10),
    depthIn: ft(6),
    accessNote: "Utility space between front/bonus areas; fixtures consume usable floor area.",
    connectsTo: [
      {
        targetRoomId: "bonus-room",
        label: "Bonus room",
        kind: "opening",
        confidence: "medium",
      },
      {
        targetRoomId: "front-living",
        label: "Front living room",
        kind: "throughRoom",
        confidence: "low",
        note: "Overview implies adjacency; exact passage is unclear.",
      },
    ],
    sourceMeasurementIds: ["m-laundry-width", "m-laundry-side-run"],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    kind: "kitchen",
    confidence: "medium",
    xIn: ft(24),
    yIn: ft(13),
    widthIn: ft(20),
    depthIn: ft(12.5),
    accessNote: "Acts as the circulation bridge from front living/bonus to the bedroom hall.",
    connectsTo: [
      {
        targetRoomId: "front-living",
        label: "Front living room",
        kind: "opening",
        confidence: "medium",
      },
      {
        targetRoomId: "bonus-room",
        label: "Bonus room",
        kind: "opening",
        confidence: "high",
        note: "66 in entry is measured.",
      },
      {
        targetRoomId: "hall",
        label: "Bedroom hall",
        kind: "hall",
        confidence: "medium",
        note: "The sketch labels the hall direction to the right of the kitchen.",
      },
      {
        targetRoomId: "room-1",
        label: "Room 1",
        kind: "opening",
        confidence: "medium",
        note: "Overview places Room 1 below the kitchen/front hall area.",
      },
    ],
    sourceMeasurementIds: [
      "m-kitchen-width-assumption",
      "m-kitchen-depth-assumption",
    ],
  },
  {
    id: "room-1",
    label: "Room 1",
    kind: "room",
    confidence: "medium",
    xIn: ft(24),
    yIn: ft(25.5),
    widthIn: ft(20.5),
    depthIn: ft(18.25),
    accessNote:
      "Visible in the overview sketch below the kitchen; derived size reconciles the listed 2013 sq ft target without stretching measured rooms.",
    unresolvedSubspaces: [
      "Exact Room 1 wall lengths and closet relationship",
      "Whether Room 1 includes any small transition space near the hall",
    ],
    connectsTo: [
      {
        targetRoomId: "kitchen",
        label: "Kitchen",
        kind: "opening",
        confidence: "medium",
      },
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "low",
        note: "Overview suggests a path into the right wing near this room.",
      },
    ],
    sourceMeasurementIds: [
      "m-room-1-width-derived",
      "m-room-1-depth-derived",
      "m-official-conditioned-area",
    ],
  },
  {
    id: "bath-1",
    label: "Bathroom",
    kind: "bath",
    confidence: "medium",
    xIn: ft(44.5),
    yIn: ft(13),
    widthIn: ft(5.5),
    depthIn: ft(12.5),
    accessNote:
      "Right-wing bathroom block confirmed as a walled room; exact width/depth still need measurements.",
    connectsTo: [
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "medium",
        note: "The crop proves the bathroom wall; door swing is not confirmed.",
      },
    ],
    sourceMeasurementIds: ["m-right-bath-walled-block"],
  },
  {
    id: "hall",
    label: "Hall",
    kind: "hall",
    confidence: "medium",
    xIn: ft(44.5),
    yIn: ft(25.5),
    widthIn: ft(20),
    depthIn: ft(4.5),
    accessNote:
      "The one hall in the supplied evidence runs left-to-right from the kitchen/right wing.",
    unresolvedSubspaces: [
      "Exact hall width and length",
      "Which openings are doorless passages versus swinging doors",
    ],
    connectsTo: [
      {
        targetRoomId: "kitchen",
        label: "Kitchen",
        kind: "opening",
        confidence: "medium",
      },
      {
        targetRoomId: "room-2",
        label: "Room 2",
        kind: "opening",
        confidence: "low",
        note: "Access is required, but a swing direction is not confirmed.",
      },
      {
        targetRoomId: "room-3",
        label: "Room 3",
        kind: "opening",
        confidence: "low",
        note: "Access is required, but a swing direction is not confirmed.",
      },
      {
        targetRoomId: "closet",
        label: "Closet",
        kind: "opening",
        confidence: "low",
      },
    ],
    sourceMeasurementIds: ["m-hall-width-assumption", "m-hall-length-assumption"],
  },
  {
    id: "room-3",
    label: "Room 3",
    kind: "room",
    confidence: "low",
    xIn: ft(50),
    yIn: ft(13),
    widthIn: ft(14.5),
    depthIn: ft(12.5),
    accessNote:
      "Reached from the horizontal hall; upper/right exterior openings are not trusted until measured or photographed.",
    unresolvedSubspaces: [
      "Possible closet or bath edge consumes part of the bedroom-wing footprint",
    ],
    connectsTo: [
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "low",
      },
    ],
    sourceMeasurementIds: ["m-room-3-range"],
  },
  {
    id: "closet",
    label: "Closet",
    kind: "closet",
    confidence: "low",
    xIn: ft(50),
    yIn: ft(30),
    widthIn: ft(6),
    depthIn: ft(5.5),
    accessNote: "Closet is treated as a destination space because it consumes area and can receive boxes.",
    connectsTo: [
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "low",
      },
    ],
    sourceMeasurementIds: [],
  },
  {
    id: "bath-2",
    label: "Bath 2",
    kind: "bath",
    confidence: "low",
    xIn: ft(56),
    yIn: ft(30),
    widthIn: ft(8.5),
    depthIn: ft(5.5),
    accessNote:
      "Small right-wing bath/utility block below the hall; exact fixtures and access remain low-confidence.",
    connectsTo: [
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "low",
      },
    ],
    sourceMeasurementIds: [],
  },
  {
    id: "room-2",
    label: "Room 2",
    kind: "room",
    confidence: "low",
    xIn: ft(50),
    yIn: ft(35.5),
    widthIn: ft(14.5),
    depthIn: ft(12.5),
    accessNote: "Reached from the hall; exact closet relationship is unresolved.",
    unresolvedSubspaces: [
      "Closet relationship may reduce usable bedroom footprint",
    ],
    connectsTo: [
      {
        targetRoomId: "hall",
        label: "Hall",
        kind: "opening",
        confidence: "low",
      },
    ],
    sourceMeasurementIds: ["m-room-2-range"],
  },
];

export const scottHousePropertyZones: FloorplanPropertyZoneConstraint[] = [
  {
    id: "lot",
    label: "Property lot",
    kind: "lot",
    areaRole: "outdoor",
    confidence: "high",
    xIn: ft(-14),
    yIn: ft(-25),
    widthIn: ft(90),
    depthIn: ft(106),
    note:
      "Lot area is listed as 9540 sq ft. The frame is drawn as a 90 ft by 106 ft working rectangle until survey dimensions replace it.",
    sourceMeasurementIds: ["m-lot-area"],
  },
  {
    id: "carport",
    label: "Carport",
    kind: "carport",
    areaRole: "excluded",
    confidence: "medium",
    xIn: ft(-8),
    yIn: ft(49),
    widthIn: ft(14),
    depthIn: ft(22),
    note:
      "Bottom-left/front-left covered carport from satellite/user correction; visible property feature but excluded from the 2013 sq ft house area.",
    sourceMeasurementIds: ["m-carport-excluded-area"],
  },
  {
    id: "back-patio",
    label: "Rear patio / pool deck",
    kind: "patio",
    areaRole: "excluded",
    confidence: "medium",
    xIn: ft(30),
    yIn: ft(-22),
    widthIn: ft(44),
    depthIn: ft(20),
    note:
      "Large bright satellite hardscape around the pool; excluded from conditioned square footage.",
    sourceMeasurementIds: ["m-patio-excluded-area"],
  },
  {
    id: "pool",
    label: "Pool",
    kind: "custom",
    areaRole: "outdoor",
    confidence: "medium",
    xIn: ft(39),
    yIn: ft(-18),
    widthIn: ft(27),
    depthIn: ft(12),
    note:
      "Outdoor pool shown in the satellite view. It helps orient the rear patio but does not count as building footprint.",
    sourceMeasurementIds: ["m-patio-excluded-area"],
  },
  {
    id: "workshop",
    label: "Workshop",
    kind: "custom",
    areaRole: "excluded",
    confidence: "medium",
    xIn: ft(-11),
    yIn: ft(-23),
    widthIn: ft(18),
    depthIn: ft(25),
    note:
      "Large detached top-left structure identified by the user as a workshop; excluded from house square footage.",
    sourceMeasurementIds: ["m-workshop-excluded-area"],
  },
  {
    id: "shed",
    label: "Shed",
    kind: "shed",
    areaRole: "excluded",
    confidence: "medium",
    xIn: ft(9),
    yIn: ft(-20),
    widthIn: ft(12),
    depthIn: ft(14),
    note:
      "Smaller top-left detached structure identified by the user as a shed; excluded from house square footage.",
    sourceMeasurementIds: ["m-shed-excluded-area"],
  },
];

export function solvedSampleFloorplanFromMeasurements(
  measurements: FloorplanMeasurement[] = floorplanMeasurements,
): FloorplanSolveResult {
  const active = measurements.filter((measurement) => measurement.status === "active");
  const wallThickness = newestMeasurementValue(
    active.filter((measurement) => measurement.subjectKey === "main-floor"),
    "wallThickness",
  );
  const rooms = scottHouseRoomConstraints.map((room) => {
    const subjectMeasurements = active.filter(
      (measurement) => measurement.subjectKey === room.id,
    );
    const width = newestMeasurementValue(subjectMeasurements, "width");
    const depth = newestMeasurementValue(subjectMeasurements, "depth");
    return {
      ...room,
      widthIn: width?.valueIn ?? room.widthIn,
      depthIn: depth?.valueIn ?? room.depthIn,
      wallThicknessIn: wallThickness?.valueIn ?? room.wallThicknessIn,
      sourceMeasurementIds: [
        ...new Set([
          ...(room.sourceMeasurementIds ?? []),
          ...(width ? [width.id] : []),
          ...(depth ? [depth.id] : []),
          ...(wallThickness ? [wallThickness.id] : []),
        ]),
      ],
    };
  });

  return solveFloorplanPuzzle({
    rooms,
    zones: scottHousePropertyZones,
    measurements,
  });
}

let cachedSampleFloorplanSolve: FloorplanSolveResult | null = null;

export function getSampleFloorplanSolve() {
  cachedSampleFloorplanSolve ??= solvedSampleFloorplanFromMeasurements(
    floorplanMeasurements,
  );
  return cachedSampleFloorplanSolve;
}

export function getSampleFloorplanOverlaps() {
  return detectRoomOverlaps(getSampleFloorplanSolve().rooms);
}

function ft(value: number) {
  return value * 12;
}

function newestMeasurementValue(
  measurements: FloorplanMeasurement[],
  measurementType: "width" | "depth" | "wallThickness",
) {
  const candidates = measurements.filter(
    (measurement) =>
      measurement.measurementType === measurementType &&
      measurement.valueIn !== undefined,
  );
  return candidates[candidates.length - 1];
}
