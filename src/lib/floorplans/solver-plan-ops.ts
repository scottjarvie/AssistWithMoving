import { rectanglePoints } from "@/lib/floorplans/solver-geometry";
import type {
  FloorplanConfidence,
  FloorplanPropertyZoneKind,
  FloorplanSolvedFixture,
  FloorplanSolvedZone,
  FloorplanSolveResult,
} from "@/lib/floorplans/types";

export function floorplanSolveToPlanOps(
  solve: FloorplanSolveResult,
  levelId: string,
) {
  const roomOps = solve.rooms.map((room) => ({
    type: "createEntity" as const,
    entity: {
      levelId,
      entityType: "room" as const,
      name: room.label,
      color: roomColor(room.confidence),
      locked: false,
      room: {
        fillColor: roomColor(room.confidence),
        points: rectanglePoints(room),
      },
    },
  }));
  const zoneOps = (solve.zones ?? [])
    .filter((zone) => zone.kind !== "lot")
    .map((zone) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "zone" as const,
        name: zone.label,
        color: zoneColor(zone),
        locked: false,
        zone: {
          zoneKind: zoneKindForPlan(zone.kind),
          points: rectanglePoints(zone),
        },
      },
    }));
  const wallOps = (solve.walls ?? []).map((wall) => ({
    type: "createEntity" as const,
    entity: {
      levelId,
      entityType: "wall" as const,
      name: wall.label,
      locked: false,
      wall: {
        x1: wall.x1In,
        y1: wall.y1In,
        x2: wall.x2In,
        y2: wall.y2In,
        thicknessIn: wall.thicknessIn,
        heightIn: 96,
      },
    },
  }));
  const openingOps = (solve.openings ?? [])
    .filter((opening) => !opening.unresolved)
    .map((opening) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "annotation" as const,
        name: opening.label,
        locked: false,
        annotation: {
          x: opening.xIn,
          y: opening.yIn,
          text: `${opening.kind}: ${opening.label}`,
          fontSizeIn: 5,
        },
      },
    }));
  const fixtureOps = (solve.fixtures ?? [])
    .filter((fixture) => !fixture.unresolved)
    .map((fixture) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "feature" as const,
        name: fixture.label,
        locked: false,
        feature: {
          x: fixture.xIn,
          y: fixture.yIn,
          rotationDeg: 0,
          featureKind: planFeatureKind(fixture.kind),
          widthIn: fixture.widthIn,
          depthIn: fixture.depthIn,
          label: fixture.label,
        },
      },
    }));
  return [...roomOps, ...zoneOps, ...wallOps, ...openingOps, ...fixtureOps];
}

function roomColor(confidence: FloorplanConfidence) {
  if (confidence === "high") return "#1f5244";
  if (confidence === "medium") return "#254960";
  if (confidence === "conflict") return "#7f1d1d";
  return "#3f3932";
}

function zoneColor(zone: FloorplanSolvedZone) {
  if (zone.kind === "carport" || zone.kind === "garage") return "#71532a";
  if (zone.kind === "patio" || zone.kind === "deck" || zone.kind === "porch") {
    return "#64748b";
  }
  return "#48503a";
}

function zoneKindForPlan(kind: FloorplanPropertyZoneKind) {
  if (kind === "driveway") return "driveway";
  if (kind === "shed") return "shed";
  if (kind === "garden") return "garden";
  if (kind === "fence") return "fence";
  if (kind === "patio" || kind === "deck" || kind === "porch") return "patio";
  return "custom";
}

function planFeatureKind(kind: FloorplanSolvedFixture["kind"]) {
  if (kind === "sink") return "sink";
  if (kind === "toilet") return "toilet";
  if (kind === "tub") return "tub";
  if (kind === "shower") return "shower";
  if (kind === "waterHeater") return "waterHeater";
  if (kind === "fireplace") return "fireplace";
  if (kind === "counter" || kind === "cabinet") return "counter";
  return "custom";
}
