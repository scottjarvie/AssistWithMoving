import { describe, expect, it } from "vitest";

import {
  describePlanDocument,
  normalizePlanDocument,
  planDocumentToCreateOps,
  renderPlanSnapshotSvg,
  type PlanDocumentInput,
} from "../../src/lib/plan-describe";

function samplePlan(): PlanDocumentInput {
  return {
    plan: {
      planId: "plan1",
      moveId: "move1",
      name: "Destination plan",
      kind: "destination",
      northAngleDeg: 0,
      defaultWallThicknessIn: 4.5,
      defaultCeilingHeightIn: 96,
      gridSnapIn: 3,
      shortIdCounters: {
        nextWall: 2,
        nextRoom: 2,
        nextOpening: 2,
        nextFeature: 1,
        nextZone: 1,
        nextAnnotation: 1,
        nextPlacement: 2,
      },
      nextSeq: 8,
      status: "active",
      createdAt: 1,
      updatedAt: 2,
    },
    levels: [
      {
        levelId: "level1",
        name: "Main floor",
        levelType: "indoor",
        sortOrder: 0,
        ceilingHeightIn: 96,
      },
    ],
    entities: [
      {
        entityId: "room1",
        levelId: "level1",
        shortId: "R1",
        entityType: "room",
        locked: false,
        room: {
          points: [
            { x: 0, y: 0 },
            { x: 120, y: 0 },
            { x: 120, y: 120 },
            { x: 0, y: 120 },
          ],
        },
      },
      {
        entityId: "wall1",
        levelId: "level1",
        shortId: "W1",
        entityType: "wall",
        locked: false,
        wall: {
          x1: 0,
          y1: 0,
          x2: 120,
          y2: 0,
          thicknessIn: 4.5,
          heightIn: 96,
        },
      },
      {
        entityId: "door1",
        levelId: "level1",
        shortId: "D1",
        entityType: "opening",
        locked: false,
        opening: {
          wallShortId: "W1",
          offsetAlongWallIn: 48,
          widthIn: 36,
          kind: "door",
          swing: "right",
        },
      },
    ],
    placements: [
      {
        placementId: "placement1",
        levelId: "level1",
        shortId: "P1",
        source: {
          kind: "item",
          sourceId: "item1",
          label: "Blue sofa",
          dimensionsIn: { lengthIn: 84, widthIn: 36, heightIn: 32 },
          confidence: "manual",
        },
        x: 60,
        y: 60,
        rotationDeg: 0,
        zOrder: 1,
        locked: false,
      },
    ],
    pendingProposalCount: 1,
  };
}

describe("plan description helpers", () => {
  it("normalizes auto names and room areas", () => {
    const document = normalizePlanDocument(samplePlan());
    expect(document.entities.find((entity) => entity.shortId === "R1")?.autoName).toBe(
      "Room 1",
    );
    expect(document.entities.find((entity) => entity.shortId === "R1")?.room?.areaSqFt).toBe(
      100,
    );
    expect(document.entities.find((entity) => entity.shortId === "W1")?.autoName).toContain(
      "north wall",
    );
  });

  it("describes rooms, walls, placements, and pending proposals", () => {
    const summary = describePlanDocument(samplePlan());
    expect(summary).toContain("Pending proposals: 1");
    expect(summary).toContain("R1: Room 1; 100 sq ft; 1 placements");
    expect(summary).toContain("P1: Blue sofa");
    expect(summary).toContain("W1 Room 1 north wall");
  });

  it("renders an SVG snapshot with titles and without private underlay data", () => {
    const plan = samplePlan();
    (plan.levels[0] as Record<string, unknown>).underlay = {
      photoId: "photo_private_blueprint",
      opacity: 0.3,
      originX: 12,
      originY: 24,
      scaleInPerPx: 1,
      rotationDeg: 90,
    };

    const svg = renderPlanSnapshotSvg(plan, "level1");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<title>Destination plan - Main floor</title>");
    expect(svg).toContain("<title>R1 Room 1</title>");
    expect(svg).toContain("<title>P1 Blue sofa</title>");
    expect(svg).not.toContain("underlay");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("photo_private_blueprint");
    expect(svg).not.toContain("href=");
  });

  it("renders outdoor zones and fence stamps distinctly in snapshots", () => {
    const plan: PlanDocumentInput = {
      ...samplePlan(),
      levels: [
        {
          levelId: "yard",
          name: "Yard",
          levelType: "outdoor",
          sortOrder: 0,
        },
      ],
      entities: [
        {
          entityId: "driveway",
          levelId: "yard",
          shortId: "Z1",
          entityType: "zone",
          locked: false,
          zone: {
            zoneKind: "driveway",
            points: [
              { x: 0, y: 0 },
              { x: 120, y: 0 },
              { x: 120, y: 80 },
              { x: 0, y: 80 },
            ],
          },
        },
        {
          entityId: "fence",
          levelId: "yard",
          shortId: "F1",
          entityType: "feature",
          locked: false,
          feature: {
            x: 60,
            y: 90,
            rotationDeg: 0,
            featureKind: "fence",
            widthIn: 96,
            depthIn: 2,
            heightIn: 60,
          },
        },
      ],
      placements: [],
    };

    const svg = renderPlanSnapshotSvg(plan, "yard");
    expect(svg).toContain('stroke-dasharray="2 5"');
    expect(svg).toContain("<title>F1 Fence F1</title>");
    expect(svg).toContain('stroke-dasharray="8 5"');
  });

  it("converts a full plan document back into create ops for a fresh plan", () => {
    const ops = planDocumentToCreateOps(samplePlan(), {
      levelIds: { level1: "freshLevel1" },
    });

    expect(ops[0]).toEqual({
      type: "updatePlanSettings",
      patch: {
        name: "Destination plan",
        northAngleDeg: 0,
        defaultWallThicknessIn: 4.5,
        defaultCeilingHeightIn: 96,
        gridSnapIn: 3,
      },
    });
    expect(ops).toContainEqual({
      type: "createEntity",
      entity: expect.objectContaining({
        levelId: "freshLevel1",
        entityType: "room",
        room: {
          points: [
            { x: 0, y: 0 },
            { x: 120, y: 0 },
            { x: 120, y: 120 },
            { x: 0, y: 120 },
          ],
          fillColor: undefined,
        },
      }),
    });
    expect(ops).toContainEqual({
      type: "createPlacement",
      placement: expect.objectContaining({
        itemId: "item1",
        levelId: "freshLevel1",
        x: 60,
        y: 60,
        rotationDeg: 0,
      }),
    });
  });

  it("preserves outdoor feature kinds and heights when rebuilding create ops", () => {
    const ops = planDocumentToCreateOps(
      {
        ...samplePlan(),
        entities: [
          {
            entityId: "shed",
            levelId: "level1",
            shortId: "F1",
            entityType: "feature",
            locked: false,
            feature: {
              x: 30,
              y: 30,
              rotationDeg: 0,
              featureKind: "shed",
              widthIn: 96,
              depthIn: 120,
              heightIn: 96,
            },
          },
        ],
        placements: [],
      },
      { levelIds: { level1: "freshLevel1" } },
    );

    expect(ops).toContainEqual({
      type: "createEntity",
      entity: expect.objectContaining({
        entityType: "feature",
        feature: expect.objectContaining({
          featureKind: "shed",
          heightIn: 96,
        }),
      }),
    });
  });

  it("rebuilds placement sources and containment references from a full document", () => {
    const plan = samplePlan();
    plan.placements = [
      {
        placementId: "templatePlacement",
        levelId: "level1",
        shortId: "P1",
        source: {
          kind: "template",
          sourceId: "dresser",
          label: "Dresser",
          confidence: "medium",
        },
        x: 60,
        y: 60,
        rotationDeg: 0,
        zOrder: 1,
        locked: false,
      },
      {
        placementId: "plannedPlacement",
        levelId: "level1",
        shortId: "P2",
        source: {
          kind: "plannedItem",
          sourceId: "plannedLamp",
          label: "Planned lamp",
          dimensionsIn: { lengthIn: 12, widthIn: 12, heightIn: 24 },
          confidence: "medium",
        },
        x: 60,
        y: 60,
        rotationDeg: 0,
        parentPlacementId: "templatePlacement",
        containmentMode: "onTop",
        zOrder: 2,
        color: "var(--chart-2)",
        locked: false,
      },
    ];

    const ops = planDocumentToCreateOps(plan, {
      levelIds: { level1: "freshLevel1" },
      placementIds: { templatePlacement: "freshTemplatePlacement" },
    });

    expect(ops).toContainEqual({
      type: "createPlacement",
      placement: expect.objectContaining({
        levelId: "freshLevel1",
        templateKey: "dresser",
      }),
    });
    expect(ops).toContainEqual({
      type: "createPlacement",
      placement: expect.objectContaining({
        levelId: "freshLevel1",
        plannedItemId: "plannedLamp",
        parentPlacementId: "freshTemplatePlacement",
        containmentMode: "onTop",
        color: "var(--chart-2)",
      }),
    });
  });

  it("requires explicit level ID mappings when rebuilding create ops", () => {
    expect(() => planDocumentToCreateOps(samplePlan(), { levelIds: {} })).toThrow(
      "Missing level ID mapping for level1.",
    );
  });
});
