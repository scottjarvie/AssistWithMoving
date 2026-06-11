import { describe, expect, it } from "vitest";

import {
  planOpLabel,
  simulatePlanProposal,
  type ProposalEntity,
  type ProposalPlacement,
} from "../../src/lib/plan-proposals";
import type { PlanOp } from "../../src/lib/plan-ops";

const plan = {
  shortIdCounters: {
    nextWall: 2,
    nextRoom: 3,
    nextOpening: 1,
    nextFeature: 1,
    nextZone: 1,
    nextAnnotation: 1,
    nextPlacement: 4,
  },
};

const entities: ProposalEntity[] = [
  {
    _id: "entity-room",
    levelId: "level-main",
    shortId: "R1",
    entityType: "room",
    room: {
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
    },
  },
];

const placements: ProposalPlacement[] = [
  {
    _id: "placement-sofa",
    levelId: "level-main",
    shortId: "P1",
    templateKey: "sofa",
    x: 48,
    y: 48,
    rotationDeg: 0,
    zOrder: 1,
  },
];

describe("plan proposal simulation", () => {
  it("simulates create and move ops without mutating inputs", () => {
    const ops: PlanOp[] = [
      {
        type: "createEntity",
        entity: {
          levelId: "level-main",
          entityType: "wall",
          wall: {
            x1: 0,
            y1: 0,
            x2: 120,
            y2: 0,
            thicknessIn: 4.5,
            heightIn: 96,
          },
        },
      },
      {
        type: "movePlacement",
        placementId: "placement-sofa",
        x: 72,
        y: 84,
        rotationDeg: 90,
      },
    ];

    const preview = simulatePlanProposal({ plan, entities, placements, ops });

    expect(preview.createdEntityIds).toEqual(["proposal_entity_0"]);
    expect(preview.updatedPlacementIds).toEqual(["placement-sofa"]);
    expect(preview.entities.find((entity) => entity._id === "proposal_entity_0")).toMatchObject({
      shortId: "W2",
      entityType: "wall",
    });
    expect(preview.placements.find((placement) => placement._id === "placement-sofa")).toMatchObject({
      x: 72,
      y: 84,
      rotationDeg: 90,
    });
    expect(placements[0]?.x).toBe(48);
  });

  it("marks stale ops without applying them", () => {
    const preview = simulatePlanProposal({
      plan,
      entities,
      placements,
      ops: [
        {
          type: "deleteEntity",
          entityId: "missing-entity",
        },
      ],
    });

    expect(preview.ops).toEqual([
      expect.objectContaining({
        index: 0,
        status: "stale",
        staleReason: "Entity missing-entity no longer exists.",
      }),
    ]);
    expect(preview.deletedEntityIds).toEqual([]);
  });

  it("matches the op-layer opening short ID prefix in previews", () => {
    const preview = simulatePlanProposal({
      plan,
      entities,
      placements,
      ops: [
        {
          type: "createEntity",
          entity: {
            levelId: "level-main",
            entityType: "opening",
            opening: {
              wallShortId: "W1",
              offsetAlongWallIn: 24,
              widthIn: 36,
              kind: "door",
              swing: "right",
            },
          },
        },
      ],
    });

    expect(preview.entities.find((entity) => entity.entityType === "opening")).toMatchObject({
      shortId: "D1",
    });
  });

  it("simulates placement source changes", () => {
    const preview = simulatePlanProposal({
      plan,
      entities,
      placements: [
        {
          ...placements[0]!,
          itemId: undefined,
          templateKey: "sofa",
        },
      ],
      ops: [
        {
          type: "updatePlacement",
          placementId: "placement-sofa",
          patch: {
            itemId: "item-sofa",
            footprintOverrideIn: {
              lengthIn: 84,
              widthIn: 38,
            },
          },
        },
      ],
    });

    expect(preview.placements[0]).toMatchObject({
      itemId: "item-sofa",
      templateKey: undefined,
      footprintOverrideIn: {
        lengthIn: 84,
        widthIn: 38,
      },
    });
  });

  it("simulates containment updates and placement deletions for ghost buckets", () => {
    const preview = simulatePlanProposal({
      plan,
      entities,
      placements: [
        ...placements,
        {
          _id: "placement-lamp",
          levelId: "level-main",
          shortId: "P2",
          templateKey: "nightstand",
          x: 60,
          y: 60,
          rotationDeg: 0,
          zOrder: 2,
        },
      ],
      ops: [
        {
          type: "setContainment",
          placementId: "placement-lamp",
          parentPlacementId: "placement-sofa",
          containmentMode: "onTop",
        },
        {
          type: "deletePlacement",
          placementId: "placement-sofa",
        },
      ],
    });

    expect(preview.updatedPlacementIds).toEqual(["placement-lamp"]);
    expect(preview.deletedPlacementIds).toEqual(["placement-sofa"]);
    expect(
      preview.placements.find((placement) => placement._id === "placement-lamp"),
    ).toMatchObject({
      parentPlacementId: "placement-sofa",
      containmentMode: "onTop",
    });
    expect(
      preview.placements.find((placement) => placement._id === "placement-sofa"),
    ).toBeUndefined();
  });

  it("labels ops for review rows", () => {
    expect(
      planOpLabel({
        type: "createPlacement",
        placement: {
          levelId: "level-main",
          templateKey: "queen-bed",
          x: 0,
          y: 0,
          rotationDeg: 0,
        },
      }),
    ).toBe("Place queen-bed");
  });
});
