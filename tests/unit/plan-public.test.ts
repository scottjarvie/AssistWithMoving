import { describe, expect, it } from "vitest";

import type { PlanDocumentInput } from "../../src/lib/plan-describe";
import {
  publicPlanDocument,
  renderPublicPlanPrintHtml,
  renderPublicPlanSnapshotSvg,
} from "../../src/lib/plan-public";

function samplePublicPlan(): PlanDocumentInput {
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
        nextWall: 1,
        nextRoom: 2,
        nextOpening: 1,
        nextFeature: 1,
        nextZone: 1,
        nextAnnotation: 2,
        nextPlacement: 1,
      },
      nextSeq: 1,
      status: "active",
      createdAt: 1,
      updatedAt: 2,
    },
    levels: [
      {
        levelId: "level1",
        name: "Main",
        levelType: "indoor",
        sortOrder: 0,
      },
    ],
    entities: [
      {
        entityId: "room1",
        levelId: "level1",
        shortId: "R1",
        entityType: "room",
        name: "Living Room",
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
        entityId: "annotation1",
        levelId: "level1",
        shortId: "A1",
        entityType: "annotation",
        locked: false,
        annotation: {
          x: 12,
          y: 12,
          text: "Private note about valuables",
        },
      },
    ],
    placements: [],
  };
}

describe("public plan output", () => {
  it("strips free-text annotations before public rendering", () => {
    const document = publicPlanDocument(samplePublicPlan());
    const svg = renderPublicPlanSnapshotSvg(samplePublicPlan(), "level1");

    expect(document.entities.map((entity) => entity.entityType)).toEqual(["room"]);
    expect(svg).toContain("Living Room");
    expect(svg).not.toContain("Private note");
    expect(svg).not.toContain("valuables");
  });

  it("strips blueprint underlay metadata from public plan documents", () => {
    const plan = samplePublicPlan();
    (plan.levels[0] as Record<string, unknown>).underlay = {
      photoId: "private_blueprint_photo",
      storageId: "private_storage_id",
      url: "https://example.com/private-blueprint.png",
      originX: 10,
      originY: 20,
      scaleInPerPx: 1,
      rotationDeg: 0,
      opacity: 0.8,
    };

    const document = publicPlanDocument(plan);
    const svg = renderPublicPlanSnapshotSvg(plan, "level1");

    expect("underlay" in (document.levels[0] as Record<string, unknown>)).toBe(
      false
    );
    expect(svg).toContain("Living Room");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href=");
    expect(svg).not.toContain("private_blueprint_photo");
    expect(svg).not.toContain("private_storage_id");
    expect(svg).not.toContain("underlay");
  });

  it("renders a print pack without private annotations or values", () => {
    const svg = renderPublicPlanSnapshotSvg(samplePublicPlan(), "level1");
    const html = renderPublicPlanPrintHtml({
      plan: {
        name: "Destination plan",
        kind: "destination",
        moveTitle: "Family move",
        updatedAt: 2,
      },
      privacy: {
        underlayHidden: true,
        valuesHidden: true,
        privateNotesHidden: true,
        annotationsHidden: true,
      },
      levels: [
        {
          name: "Main",
          levelType: "indoor",
          svg,
          rooms: [
            {
              shortId: "R1",
              name: "Living Room",
              areaSqFt: 100,
              placed: [{ shortId: "P1", label: "Sofa" }],
              items: [
                {
                  name: "Sofa",
                  quantity: 1,
                  status: "active",
                  fragility: "normal",
                  doNotLetMoversTouch: false,
                  fragile: false,
                },
                {
                  name: "Gallery glass",
                  quantity: 2,
                  status: "active",
                  fragility: "high",
                  doNotLetMoversTouch: true,
                  fragile: true,
                },
              ],
              boxes: [
                {
                  code: "B-1",
                  label: "Books",
                  status: "packed",
                  itemCount: 6,
                },
              ],
            },
          ],
        },
      ],
      unplaced: {
        items: [
          {
            name: "Garage ladder",
            quantity: 1,
            room: "Garage",
            category: "Tools",
            status: "active",
            fragility: "normal",
            doNotLetMoversTouch: false,
            fragile: false,
          },
        ],
        boxes: [
          {
            code: "B-9",
            label: "Mystery closet",
            status: "packed",
            itemCount: 3,
          },
        ],
      },
    });

    expect(html).toContain("Destination plan");
    expect(html).toContain("Living Room");
    expect(html).toContain("Sofa");
    expect(html).toContain("Gallery glass");
    expect(html).toContain("fragile");
    expect(html).toContain("do not let movers touch");
    expect(html).toContain("Unplaced manifest");
    expect(html).toContain("Garage ladder");
    expect(html).toContain("B-9");
    expect(html).toContain("Hidden from this pack");
    expect(html).not.toContain("Private note");
    expect(html).not.toContain("valuables");
    expect(html).not.toContain("value_cents");
    expect(html).not.toContain("$1,200");
    expect(html).not.toContain("serialNumber");
  });
});
