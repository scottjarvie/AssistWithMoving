import { describe, expect, it } from "vitest";

import { buildFloorplanSubjects } from "@/lib/floorplans/evidence-engine";
import {
  detectRoomOverlaps,
  solveFloorplanPuzzle,
} from "@/lib/floorplans/solver";
import {
  floorplanMeasurements,
  floorplanObservations,
  floorplanRelationships,
  getSampleFloorplanOverlaps,
  solvedSampleFloorplanFromMeasurements,
} from "@/lib/floorplans/sample-data";
import type {
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanRelationship,
} from "@/lib/floorplans/types";

describe("floorplan solver", () => {
  it("clusters sameAs observations into one canonical subject", () => {
    const observations: FloorplanObservation[] = [
      {
        id: "obs-primary-bedroom",
        observationType: "roomName",
        status: "active",
        title: "Primary bedroom label",
        subjectKey: "primary-bedroom",
        subjectLabel: "Primary bedroom",
        subjectKind: "room",
        confidence: "medium",
        sourceLabel: "Image #1",
        provenance: [
          {
            id: "prov-primary-bedroom",
            sourceType: "agentExtraction",
            sourceLabel: "Image #1",
          },
        ],
      },
      {
        id: "obs-main-bedroom",
        observationType: "roomName",
        status: "active",
        title: "Main bedroom correction",
        subjectKey: "main-bedroom",
        subjectLabel: "Main bedroom",
        subjectKind: "room",
        confidence: "high",
        sourceLabel: "User correction",
        provenance: [
          {
            id: "prov-main-bedroom",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
    ];
    const relationships: FloorplanRelationship[] = [
      {
        id: "rel-main-same-primary",
        relationshipType: "sameAs",
        status: "active",
        fromSubjectKey: "main-bedroom",
        fromSubjectLabel: "Main bedroom",
        toSubjectKey: "primary-bedroom",
        toSubjectLabel: "Primary bedroom",
        confidence: "high",
        provenance: [
          {
            id: "prov-same-as",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
    ];
    const measurements: FloorplanMeasurement[] = [
      {
        id: "m-primary-width",
        subjectType: "room",
        subjectKey: "primary-bedroom",
        subjectLabel: "Primary bedroom",
        measurementType: "width",
        kind: "known",
        status: "active",
        valueIn: 144,
        displayValue: "12 ft",
        confidence: "medium",
        provenance: [
          {
            id: "prov-primary-width",
            sourceType: "agentExtraction",
            sourceLabel: "Image #1",
          },
        ],
      },
      {
        id: "m-main-depth",
        subjectType: "room",
        subjectKey: "main-bedroom",
        subjectLabel: "Main bedroom",
        measurementType: "depth",
        kind: "known",
        status: "active",
        valueIn: 156,
        displayValue: "13 ft",
        confidence: "high",
        provenance: [
          {
            id: "prov-main-depth",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
    ];

    const subjects = buildFloorplanSubjects({
      observations,
      relationships,
      measurements,
    });
    const bedroomSubjects = subjects.filter((subject) =>
      subject.memberSubjectKeys?.some((key) =>
        ["main-bedroom", "primary-bedroom"].includes(key),
      ),
    );

    expect(bedroomSubjects).toHaveLength(1);
    expect(bedroomSubjects[0]).toEqual(
      expect.objectContaining({
        subjectKey: "main-bedroom",
        subjectLabel: "Main bedroom",
        knownMeasurementCount: 2,
        memberSubjectKeys: ["main-bedroom", "primary-bedroom"],
      }),
    );
    expect(bedroomSubjects[0].measurementIds).toEqual(
      expect.arrayContaining(["m-primary-width", "m-main-depth"]),
    );
  });

  it("solves sameAs aliases as one room with merged measurements", () => {
    const observations: FloorplanObservation[] = [
      {
        id: "obs-primary-bedroom",
        observationType: "roomName",
        status: "active",
        title: "Primary bedroom label",
        subjectKey: "primary-bedroom",
        subjectLabel: "Primary bedroom",
        subjectKind: "room",
        confidence: "medium",
        sourceLabel: "Image #1",
        provenance: [
          {
            id: "prov-primary-bedroom",
            sourceType: "agentExtraction",
            sourceLabel: "Image #1",
          },
        ],
      },
      {
        id: "obs-main-bedroom",
        observationType: "roomName",
        status: "active",
        title: "Main bedroom correction",
        subjectKey: "main-bedroom",
        subjectLabel: "Main bedroom",
        subjectKind: "room",
        confidence: "high",
        sourceLabel: "User correction",
        provenance: [
          {
            id: "prov-main-bedroom",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
      {
        id: "obs-hall",
        observationType: "hall",
        status: "active",
        title: "Hall",
        subjectKey: "hall",
        subjectLabel: "Hall",
        subjectKind: "hall",
        confidence: "high",
        sourceLabel: "Image #2",
        provenance: [
          {
            id: "prov-hall",
            sourceType: "agentExtraction",
            sourceLabel: "Image #2",
          },
        ],
      },
    ];
    const relationships: FloorplanRelationship[] = [
      {
        id: "rel-main-same-primary",
        relationshipType: "sameAs",
        status: "active",
        fromSubjectKey: "main-bedroom",
        fromSubjectLabel: "Main bedroom",
        toSubjectKey: "primary-bedroom",
        toSubjectLabel: "Primary bedroom",
        confidence: "high",
        provenance: [
          {
            id: "prov-same-as",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
      {
        id: "rel-hall-primary",
        relationshipType: "connectedTo",
        status: "active",
        fromSubjectKey: "hall",
        fromSubjectLabel: "Hall",
        toSubjectKey: "primary-bedroom",
        toSubjectLabel: "Primary bedroom",
        confidence: "medium",
        provenance: [
          {
            id: "prov-hall-primary",
            sourceType: "agentExtraction",
            sourceLabel: "Image #2",
          },
        ],
      },
    ];
    const measurements: FloorplanMeasurement[] = [
      {
        id: "m-primary-width",
        subjectType: "room",
        subjectKey: "primary-bedroom",
        subjectLabel: "Primary bedroom",
        measurementType: "width",
        kind: "known",
        status: "active",
        valueIn: 144,
        displayValue: "12 ft",
        confidence: "medium",
        provenance: [
          {
            id: "prov-primary-width",
            sourceType: "agentExtraction",
            sourceLabel: "Image #1",
          },
        ],
      },
      {
        id: "m-main-depth",
        subjectType: "room",
        subjectKey: "main-bedroom",
        subjectLabel: "Main bedroom",
        measurementType: "depth",
        kind: "known",
        status: "active",
        valueIn: 156,
        displayValue: "13 ft",
        confidence: "high",
        provenance: [
          {
            id: "prov-main-depth",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
      {
        id: "m-hall-width",
        subjectType: "path",
        subjectKey: "hall",
        subjectLabel: "Hall",
        measurementType: "width",
        kind: "known",
        status: "active",
        valueIn: 180,
        displayValue: "15 ft",
        confidence: "high",
        provenance: [
          {
            id: "prov-hall-width",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
      {
        id: "m-hall-depth",
        subjectType: "path",
        subjectKey: "hall",
        subjectLabel: "Hall",
        measurementType: "depth",
        kind: "known",
        status: "active",
        valueIn: 48,
        displayValue: "4 ft",
        confidence: "high",
        provenance: [
          {
            id: "prov-hall-depth",
            sourceType: "userEdit",
            sourceLabel: "User correction",
          },
        ],
      },
    ];

    const solve = solveFloorplanPuzzle({
      observations,
      relationships,
      measurements,
    });
    const bedroomRooms = solve.rooms.filter((room) =>
      ["main-bedroom", "primary-bedroom"].includes(room.id),
    );

    expect(bedroomRooms).toHaveLength(1);
    expect(bedroomRooms[0]).toEqual(
      expect.objectContaining({
        id: "main-bedroom",
        label: "Main bedroom",
        widthIn: 144,
        depthIn: 156,
      }),
    );
    expect(bedroomRooms[0].sourceMeasurementIds).toEqual(
      expect.arrayContaining(["m-primary-width", "m-main-depth"]),
    );
  });

  it("keeps the Scott-house sample rooms non-overlapping", () => {
    const solve = solvedSampleFloorplanFromMeasurements(floorplanMeasurements);

    expect(solve.rooms.length).toBeGreaterThan(0);
    expect(getSampleFloorplanOverlaps()).toEqual([]);
    expect(detectRoomOverlaps(solve.rooms)).toEqual([]);
  });

  it("models the corrected sample hall as a horizontal circulation path", () => {
    const solve = solvedSampleFloorplanFromMeasurements(floorplanMeasurements);
    const hall = solve.rooms.find((room) => room.id === "hall");
    const bathroom = solve.rooms.find((room) => room.id === "bath-1");

    expect(hall).toBeDefined();
    expect(bathroom).toBeDefined();
    expect(hall!.widthIn).toBeGreaterThan(hall!.depthIn);
    expect(hall!.sourceMeasurementIds).toEqual(
      expect.arrayContaining(["m-hall-length-assumption"]),
    );
    expect(bathroom!.sourceMeasurementIds).toContain("m-right-bath-walled-block");
  });

  it("reports hard room overlaps as conflicts", () => {
    const solve = solveFloorplanPuzzle({
      rooms: [
        {
          id: "living",
          label: "Living",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
        {
          id: "kitchen",
          label: "Kitchen",
          xIn: 60,
          yIn: 60,
          widthIn: 120,
          depthIn: 120,
        },
      ],
    });

    expect(solve.status).toBe("conflict");
    expect(solve.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "conflict",
        title: "Rooms overlap",
        roomIds: ["living", "kitchen"],
      }),
    );
  });

  it("splits walls into exterior and shared CAD segments", () => {
    const solve = solveFloorplanPuzzle({
      rooms: [
        {
          id: "living",
          label: "Living",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
        {
          id: "kitchen",
          label: "Kitchen",
          xIn: 120,
          yIn: 30,
          widthIn: 120,
          depthIn: 60,
        },
      ],
    });

    const sharedWall = solve.walls?.find(
      (wall) =>
        !wall.exterior &&
        wall.orientation === "vertical" &&
        wall.roomIds.includes("living") &&
        wall.roomIds.includes("kitchen"),
    );

    expect(sharedWall).toEqual(
      expect.objectContaining({
        x1In: 120,
        y1In: 30,
        x2In: 120,
        y2In: 90,
        sideByRoomId: {
          living: "east",
          kitchen: "west",
        },
      }),
    );
    expect(
      solve.walls?.filter(
        (wall) =>
          wall.exterior &&
          wall.orientation === "vertical" &&
          wall.roomIds.includes("living") &&
          wall.x1In === 120,
      ),
    ).toHaveLength(2);
  });

  it("attaches access openings to the shared wall segment", () => {
    const solve = solveFloorplanPuzzle({
      rooms: [
        {
          id: "living",
          label: "Living",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
        {
          id: "kitchen",
          label: "Kitchen",
          xIn: 120,
          yIn: 30,
          widthIn: 120,
          depthIn: 60,
        },
      ],
      relationships: [
        {
          id: "rel-living-kitchen",
          relationshipType: "connectedTo",
          status: "active",
          fromSubjectKey: "living",
          fromSubjectLabel: "Living",
          toSubjectKey: "kitchen",
          toSubjectLabel: "Kitchen",
          confidence: "high",
          provenance: [
            {
              id: "prov-connection",
              sourceType: "userEdit",
              sourceLabel: "User note",
            },
          ],
        },
      ],
    });

    const opening = solve.openings?.find((entry) => entry.id === "opening-rel-living-kitchen");
    expect(opening).toEqual(
      expect.objectContaining({
        connectsRoomIds: ["living", "kitchen"],
        orientation: "vertical",
      }),
    );
    expect(solve.walls?.find((wall) => wall.id === opening?.wallId)?.roomIds).toEqual(
      expect.arrayContaining(["living", "kitchen"]),
    );
    expect(
      solve.diagnostics.find((entry) => entry.id === "unrealized-access-relationships"),
    ).toBeUndefined();
  });

  it("warns when topology cannot become a physical access path", () => {
    const solve = solveFloorplanPuzzle({
      rooms: [
        {
          id: "living",
          label: "Living",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
        {
          id: "kitchen",
          label: "Kitchen",
          xIn: 240,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
      ],
      relationships: [
        {
          id: "rel-living-kitchen",
          relationshipType: "connectedTo",
          status: "active",
          fromSubjectKey: "living",
          fromSubjectLabel: "Living",
          toSubjectKey: "kitchen",
          toSubjectLabel: "Kitchen",
          confidence: "high",
          provenance: [
            {
              id: "prov-connection",
              sourceType: "userEdit",
              sourceLabel: "User note",
            },
          ],
        },
      ],
    });

    expect(solve.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "unrealized-access-relationships",
        severity: "warning",
        relationshipIds: ["rel-living-kitchen"],
      }),
    );
    expect(solve.unresolvedGeometry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "unresolved-opening-rel-living-kitchen",
          kind: "opening",
        }),
      ]),
    );
  });

  it("uses horizontal hall topology to place connected rooms against the hall", () => {
    const solve = solveFloorplanPuzzle({
      observations: [
        {
          id: "obs-hall",
          observationType: "hall",
          status: "active",
          title: "Hall runs left-to-right",
          subjectKey: "hall",
          subjectLabel: "Hall",
          subjectKind: "hall",
          normalized: { orientation: "left-to-right" },
          confidence: "high",
          sourceLabel: "User note",
          provenance: [
            {
              id: "prov-hall",
              sourceType: "userEdit",
              sourceLabel: "User note",
            },
          ],
        },
        {
          id: "obs-bedroom-a",
          observationType: "roomName",
          status: "active",
          title: "Bedroom A",
          subjectKey: "bedroom-a",
          subjectLabel: "Bedroom A",
          subjectKind: "room",
          confidence: "medium",
          sourceLabel: "User note",
          provenance: [
            {
              id: "prov-bedroom-a",
              sourceType: "userEdit",
              sourceLabel: "User note",
            },
          ],
        },
        {
          id: "obs-bedroom-b",
          observationType: "roomName",
          status: "active",
          title: "Bedroom B",
          subjectKey: "bedroom-b",
          subjectLabel: "Bedroom B",
          subjectKind: "room",
          confidence: "medium",
          sourceLabel: "User note",
          provenance: [
            {
              id: "prov-bedroom-b",
              sourceType: "userEdit",
              sourceLabel: "User note",
            },
          ],
        },
      ],
      measurements: [
        {
          id: "m-hall-width",
          subjectType: "path",
          subjectKey: "hall",
          subjectLabel: "Hall",
          measurementType: "width",
          kind: "known",
          status: "active",
          valueIn: 240,
          displayValue: "20 ft",
          confidence: "high",
          provenance: [
            { id: "prov-hall-width", sourceType: "userEdit", sourceLabel: "User note" },
          ],
        },
        {
          id: "m-hall-depth",
          subjectType: "path",
          subjectKey: "hall",
          subjectLabel: "Hall",
          measurementType: "depth",
          kind: "known",
          status: "active",
          valueIn: 48,
          displayValue: "4 ft",
          confidence: "high",
          provenance: [
            { id: "prov-hall-depth", sourceType: "userEdit", sourceLabel: "User note" },
          ],
        },
        ...["bedroom-a", "bedroom-b"].flatMap((subjectKey) => [
          {
            id: `m-${subjectKey}-width`,
            subjectType: "room" as const,
            subjectKey,
            subjectLabel: subjectKey,
            measurementType: "width" as const,
            kind: "known" as const,
            status: "active" as const,
            valueIn: 96,
            displayValue: "8 ft",
            confidence: "medium" as const,
            provenance: [
              { id: `prov-${subjectKey}-width`, sourceType: "userEdit" as const, sourceLabel: "User note" },
            ],
          },
          {
            id: `m-${subjectKey}-depth`,
            subjectType: "room" as const,
            subjectKey,
            subjectLabel: subjectKey,
            measurementType: "depth" as const,
            kind: "known" as const,
            status: "active" as const,
            valueIn: 96,
            displayValue: "8 ft",
            confidence: "medium" as const,
            provenance: [
              { id: `prov-${subjectKey}-depth`, sourceType: "userEdit" as const, sourceLabel: "User note" },
            ],
          },
        ]),
      ],
      relationships: [
        {
          id: "rel-hall-bedroom-a",
          relationshipType: "connectedTo",
          status: "active",
          fromSubjectKey: "hall",
          fromSubjectLabel: "Hall",
          toSubjectKey: "bedroom-a",
          toSubjectLabel: "Bedroom A",
          confidence: "medium",
          provenance: [
            { id: "prov-rel-a", sourceType: "userEdit", sourceLabel: "User note" },
          ],
        },
        {
          id: "rel-hall-bedroom-b",
          relationshipType: "connectedTo",
          status: "active",
          fromSubjectKey: "hall",
          fromSubjectLabel: "Hall",
          toSubjectKey: "bedroom-b",
          toSubjectLabel: "Bedroom B",
          confidence: "medium",
          provenance: [
            { id: "prov-rel-b", sourceType: "userEdit", sourceLabel: "User note" },
          ],
        },
      ],
    });

    expect(
      solve.openings?.filter((opening) => opening.connectsRoomIds?.includes("hall")),
    ).toHaveLength(2);
    expect(
      solve.diagnostics.find((entry) => entry.id === "unrealized-access-relationships"),
    ).toBeUndefined();
  });

  it("creates an explicit missing-area region when solved rooms underfill official sqft", () => {
    const solve = solveFloorplanPuzzle({
      measurements: [
        {
          id: "target-conditioned",
          subjectType: "plan",
          subjectKey: "house",
          subjectLabel: "House",
          measurementType: "conditionedArea",
          kind: "known",
          status: "active",
          unit: "sqft",
          value: 400,
          displayValue: "400 sq ft",
          confidence: "high",
          areaRole: "conditioned",
          constraintStrength: "strong",
          provenance: [
            {
              id: "prov-target",
              sourceType: "userEdit",
              sourceLabel: "Official sqft",
            },
          ],
        },
      ],
      rooms: [
        {
          id: "living",
          label: "Living",
          areaRole: "conditioned",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
      ],
    });

    expect(solve.unresolvedGeometry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-conditioned-area",
          kind: "missingArea",
          areaSqFt: 300,
        }),
      ]),
    );
    expect(solve.diagnostics).toContainEqual(
      expect.objectContaining({
        id: "missing-conditioned-area-region",
        severity: "warning",
      }),
    );
  });

  it("uses user measurements to refresh solved room dimensions", () => {
    const solve = solvedSampleFloorplanFromMeasurements([
      ...floorplanMeasurements,
      {
        id: "user-room-2-width",
        subjectType: "room",
        subjectKey: "room-2",
        subjectLabel: "Room 2",
        measurementType: "width",
        kind: "known",
        status: "active",
        valueIn: 180,
        displayValue: "15 ft",
        confidence: "high",
        provenance: [
          {
            id: "prov-user-room-2",
            sourceType: "userEdit",
            sourceLabel: "User-entered measurement",
          },
        ],
      },
    ]);

    expect(solve.rooms.find((room) => room.id === "room-2")?.widthIn).toBe(180);
  });

  it("keeps windows and fixtures as attached CAD elements instead of zones", () => {
    const solve = solveFloorplanPuzzle({
      measurements: floorplanMeasurements,
      observations: floorplanObservations,
      relationships: floorplanRelationships,
    });

    expect(solve.zones.find((zone) => zone.id === "kitchen-window")).toBeUndefined();
    expect(solve.openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "opening-obs-kitchen-window",
          kind: "window",
          hostRoomId: "kitchen",
        }),
      ]),
    );
    expect(solve.walls?.length).toBeGreaterThan(0);
    expect(solve.fixtures?.some((fixture) => fixture.hostRoomId === "kitchen")).toBe(
      true,
    );
    expect(solve.dataQuality).toBeDefined();
  });

  it("reconciles conditioned area targets and excluded property zones", () => {
    const solve = solveFloorplanPuzzle({
      measurements: [
        {
          id: "target-conditioned",
          subjectType: "plan",
          subjectKey: "house",
          subjectLabel: "House",
          measurementType: "conditionedArea",
          kind: "known",
          status: "active",
          unit: "sqft",
          value: 220,
          displayValue: "220 sq ft",
          confidence: "high",
          areaRole: "conditioned",
          constraintStrength: "strong",
          provenance: [
            {
              id: "prov-target",
              sourceType: "userEdit",
              sourceLabel: "Official sqft",
            },
          ],
        },
      ],
      rooms: [
        {
          id: "living",
          label: "Living",
          areaRole: "conditioned",
          xIn: 0,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
          connectsTo: [
            {
              targetRoomId: "kitchen",
              label: "Kitchen",
              kind: "opening",
              confidence: "medium",
            },
          ],
        },
        {
          id: "kitchen",
          label: "Kitchen",
          areaRole: "conditioned",
          xIn: 120,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
          connectsTo: [
            {
              targetRoomId: "living",
              label: "Living",
              kind: "opening",
              confidence: "medium",
            },
          ],
        },
      ],
      zones: [
        {
          id: "garage",
          label: "Garage",
          kind: "garage",
          areaRole: "excluded",
          xIn: 260,
          yIn: 0,
          widthIn: 120,
          depthIn: 120,
        },
      ],
    });

    expect(solve.areaSummary.conditionedSqFt).toBe(200);
    expect(solve.areaSummary.excludedSqFt).toBe(100);
    expect(solve.areaSummary.varianceSqFt).toBe(-20);
    expect(solve.calculations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "calc-conditioned-total",
          outputMeasurementType: "conditionedArea",
        }),
        expect.objectContaining({
          id: "calc-excluded-total",
          outputMeasurementType: "excludedArea",
        }),
      ]),
    );
    expect(solve.gaps.map((gap) => gap.id)).toContain("official-area-variance");
  });
});
