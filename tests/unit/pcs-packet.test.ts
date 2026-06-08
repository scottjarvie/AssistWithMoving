import { describe, expect, it } from "vitest";

import {
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
    expect(pcsPacketFilename("owner")).toBe("movingmanifest-pcs-owner.csv");
  });
});
