import { describe, expect, it } from "vitest";

import {
  buildPcsReadinessChecklist,
  classifyPcsItem,
  summarizePcsClassifications,
  type PcsClassifiableItem,
} from "../../convex/lib/pcsPacket";
import { buildPcsPacketPath, pcsPacketFilename } from "@/lib/pcs-packet";

const baseItem: PcsClassifiableItem = {
  name: "Dining table",
  disposition: "mover",
  status: "active",
  condition: "good",
  quantity: 1,
  highValue: false,
  hazardousFlag: false,
  requiresPersonalTransport: false,
  needsReview: false,
  planningDefaultKeys: [],
  reviewFlags: [],
  aiTags: [],
};

describe("PCS packet classification", () => {
  it("classifies ordinary mover inventory as HHG", () => {
    expect(classifyPcsItem(baseItem)).toMatchObject({
      hhg: true,
      ppm: false,
      exception: false,
    });
  });

  it("classifies personal transport and documents as PPM/sensitive", () => {
    expect(
      classifyPcsItem({
        ...baseItem,
        name: "Orders binder",
        disposition: "personalTransport",
        planningDefaultKeys: ["documents"],
      })
    ).toMatchObject({
      hhg: false,
      ppm: true,
      sensitive: true,
      exception: true,
    });
  });

  it("classifies pro gear, high value, and claims evidence", () => {
    const classifications = [
      classifyPcsItem({ ...baseItem, name: "Professional gear kit" }),
      classifyPcsItem({ ...baseItem, name: "Camera", highValue: true }),
      classifyPcsItem({ ...baseItem, name: "Broken dresser", condition: "damaged" }),
    ];

    expect(summarizePcsClassifications(classifications)).toMatchObject({
      proGearCount: 1,
      highValueCount: 1,
      claimsEvidenceCount: 1,
      exceptionCount: 3,
    });
  });
});

describe("PCS readiness checklist", () => {
  it("marks configured PCS documentation as ready where possible", () => {
    const checklist = buildPcsReadinessChecklist({
      move: {
        pcsBranch: "army",
        pcsShipmentType: "partialPpm",
        pcsRankPayGrade: "E-6",
        pcsDependentStatus: "withDependents",
        pcsOrdersNumber: "PCS-123",
        moveLevelWeightAllowanceLb: 11000,
        pcsTransportationOfficeNotes: "Counseling complete",
      },
      summary: {
        itemCount: 12,
        boxCount: 4,
        totalEstimatedWeightLb: 4200,
        allowanceRemainingLb: 6800,
        hhgCount: 8,
        ppmCount: 4,
        proGearCount: 0,
        highValueCount: 1,
        sensitiveCount: 1,
        pcsEvidencePhotoCount: 3,
      },
      counts: {
        needsReviewCount: 0,
        restrictedCount: 0,
        unboxedCount: 0,
        highValueWithoutEvidenceCount: 0,
        sensitiveWithoutEvidenceCount: 0,
        boxesWithoutAssignmentCount: 0,
      },
    });

    expect(checklist.find((entry) => entry.key === "pcs-fields")).toMatchObject({
      status: "ready",
    });
    expect(
      checklist.find((entry) => entry.key === "evidence-coverage")
    ).toMatchObject({
      status: "ready",
    });
    expect(
      checklist.find((entry) => entry.key === "box-load-readiness")
    ).toMatchObject({
      status: "ready",
    });
  });

  it("surfaces missing PCS documentation and review gaps", () => {
    const checklist = buildPcsReadinessChecklist({
      move: {
        pcsBranch: "army",
        pcsShipmentType: "ppm",
      },
      summary: {
        itemCount: 3,
        boxCount: 0,
        totalEstimatedWeightLb: 1200,
        hhgCount: 0,
        ppmCount: 3,
        proGearCount: 1,
        highValueCount: 1,
        sensitiveCount: 1,
        pcsEvidencePhotoCount: 0,
      },
      counts: {
        needsReviewCount: 2,
        restrictedCount: 1,
        unboxedCount: 3,
        highValueWithoutEvidenceCount: 1,
        sensitiveWithoutEvidenceCount: 1,
        boxesWithoutAssignmentCount: 0,
      },
    });

    expect(checklist.find((entry) => entry.key === "pcs-fields")).toMatchObject({
      status: "attention",
    });
    expect(
      checklist.find((entry) => entry.key === "weight-allowance")
    ).toMatchObject({
      status: "missing",
    });
    expect(checklist.find((entry) => entry.key === "pro-gear")).toMatchObject({
      status: "missing",
    });
    expect(
      checklist.find((entry) => entry.key === "restricted-items")
    ).toMatchObject({
      status: "missing",
    });
  });
});

describe("PCS packet paths", () => {
  it("builds submission and owner packet paths", () => {
    expect(
      buildPcsPacketPath({ householdId: "household-id", moveId: "move-id" })
    ).toBe(
      "/app/pcs-packet?householdId=household-id&moveId=move-id&mode=submission"
    );
    expect(
      buildPcsPacketPath({
        householdId: "household-id",
        moveId: "move-id",
        mode: "owner",
      })
    ).toBe("/app/pcs-packet?householdId=household-id&moveId=move-id&mode=owner");
    expect(pcsPacketFilename("owner")).toBe("assistwithmoving-pcs-owner.csv");
  });
});
