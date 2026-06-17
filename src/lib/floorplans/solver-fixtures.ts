import { isInteriorSpaceKind } from "@/lib/floorplans/solver-compiler";
import type {
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanSolvedFixture,
  FloorplanSolvedRoom,
  FloorplanSolveDiagnostic,
  FloorplanUnresolvedGeometry,
} from "@/lib/floorplans/types";

export function generateFixtures({
  rooms,
  observations,
  relationships,
}: {
  rooms: FloorplanSolvedRoom[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
}) {
  const fixtures: FloorplanSolvedFixture[] = [];
  const unresolved: FloorplanUnresolvedGeometry[] = [];
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const fixtureObservations = observations.filter((observation) =>
    observation.observationType === "fixture" ||
    (observation.normalized && typeof observation.normalized.fixtures === "string"),
  );

  for (const observation of fixtureObservations) {
    const hostKey = hostRoomForObservation(observation, relationships);
    const host = hostKey ? roomById.get(hostKey) : undefined;
    const fixtureKinds = fixtureKindsFromObservation(observation);
    if (!host) {
      unresolved.push({
        id: `unresolved-fixture-${observation.id}`,
        label: observation.title,
        kind: "fixture",
        subjectKey: observation.subjectKey,
        reason:
          "The fixture evidence exists, but it is not tied to a solved room yet.",
        confidence: observation.confidence,
        sourceObservationIds: [observation.id],
      });
      continue;
    }
    fixtureKinds.forEach((kind, index) => {
      const size = fixtureSize(kind);
      const position = fixturePosition(host, index, size);
      fixtures.push({
        id: `${observation.id}-${kind}-${index}`,
        label: fixtureLabel(kind),
        kind,
        confidence: observation.confidence,
        xIn: position.xIn,
        yIn: position.yIn,
        widthIn: size.widthIn,
        depthIn: size.depthIn,
        hostRoomId: host.id,
        sourceObservationIds: [observation.id],
      });
    });
  }

  if (unresolved.length) {
    diagnostics.push({
      id: "unresolved-fixtures",
      severity: "warning",
      title: "Some fixtures are unresolved",
      detail:
        "Fixtures need a host room and preferably a wall/counter side before they can be placed confidently.",
      observationIds: unresolved.flatMap((entry) => entry.sourceObservationIds ?? []),
      impactScore: 62,
    });
  }

  return { fixtures, unresolved, diagnostics };
}

function hostRoomForObservation(
  observation: FloorplanObservation,
  relationships: FloorplanRelationship[],
) {
  if (observation.subjectKind && isInteriorSpaceKind(observation.subjectKind)) {
    return observation.subjectKey;
  }
  const relationship = relationships.find(
    (entry) =>
      entry.fromSubjectKey === observation.subjectKey &&
      ["partOf", "contains", "openingIn", "connectedTo"].includes(entry.relationshipType),
  );
  if (relationship) return relationship.toSubjectKey;
  const hostRoom = observation.normalized?.hostRoom;
  return typeof hostRoom === "string" ? slugify(hostRoom) : observation.subjectKey;
}

function fixtureKindsFromObservation(
  observation: FloorplanObservation,
): FloorplanSolvedFixture["kind"][] {
  const source =
    observation.observationType === "fixture"
      ? `${observation.rawText ?? observation.title}`
      : String(observation.normalized?.fixtures ?? "");
  const text = source.toLowerCase();
  const kinds: FloorplanSolvedFixture["kind"][] = [];
  if (text.includes("sink")) kinds.push("sink");
  if (text.includes("toilet")) kinds.push("toilet");
  if (text.includes("tub")) kinds.push("tub");
  if (text.includes("shower")) kinds.push("shower");
  if (text.includes("washer")) kinds.push("washer");
  if (text.includes("dryer")) kinds.push("dryer");
  if (text.includes("stove") || text.includes("range")) kinds.push("stove");
  if (text.includes("fireplace")) kinds.push("fireplace");
  if (text.includes("water heater")) kinds.push("waterHeater");
  if (text.includes("cabinet")) kinds.push("cabinet");
  if (text.includes("counter")) kinds.push("counter");
  return kinds.length ? kinds : ["unknown"];
}

function fixtureSize(kind: FloorplanSolvedFixture["kind"]) {
  if (kind === "fireplace") return { widthIn: 96, depthIn: 14 };
  if (kind === "stove") return { widthIn: 30, depthIn: 26 };
  if (kind === "sink") return { widthIn: 30, depthIn: 24 };
  if (kind === "washer" || kind === "dryer") return { widthIn: 27, depthIn: 30 };
  if (kind === "tub" || kind === "shower") return { widthIn: 60, depthIn: 32 };
  if (kind === "toilet") return { widthIn: 28, depthIn: 30 };
  if (kind === "waterHeater") return { widthIn: 28, depthIn: 28 };
  if (kind === "cabinet" || kind === "counter") return { widthIn: 72, depthIn: 24 };
  return { widthIn: 30, depthIn: 30 };
}

function fixturePosition(
  host: FloorplanSolvedRoom,
  index: number,
  size: { widthIn: number; depthIn: number },
) {
  const columns = Math.max(1, Math.floor((host.widthIn - 24) / Math.max(size.widthIn + 12, 36)));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    xIn: host.xIn + 12 + column * (size.widthIn + 12),
    yIn: host.yIn + 12 + row * (size.depthIn + 12),
  };
}

function fixtureLabel(kind: FloorplanSolvedFixture["kind"]) {
  const labels: Record<FloorplanSolvedFixture["kind"], string> = {
    sink: "Sink",
    toilet: "Toilet",
    tub: "Tub",
    shower: "Shower",
    washer: "Washer",
    dryer: "Dryer",
    stove: "Stove",
    fireplace: "Fireplace",
    waterHeater: "Water heater",
    cabinet: "Cabinet",
    counter: "Counter",
    pool: "Pool",
    unknown: "Fixture",
  };
  return labels[kind];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
