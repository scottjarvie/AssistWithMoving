import { describe, expect, it } from "vitest";

import {
  defaultDocumentationProfilesForMoveType,
  documentationProfileOptions,
  pcsBranchOptions,
  pcsShipmentTypeOptions,
} from "@/lib/move-presets";

describe("move presets", () => {
  it("offers common recipient documentation profiles", () => {
    expect(documentationProfileOptions.map(([value]) => value)).toEqual([
      "personalFullRecord",
      "pcsMove",
      "movingCompany",
      "employerRelocation",
      "insuranceClaim",
      "donationPickup",
      "sellOrGiveaway",
      "storageInventory",
      "loadCrew",
    ]);
  });

  it("keeps PCS fields configurable instead of hardcoded to one service", () => {
    expect(pcsBranchOptions.map(([value]) => value)).toContain("spaceForce");
    expect(pcsShipmentTypeOptions.map(([value]) => value)).toEqual([
      "hhg",
      "ppm",
      "partialPpm",
      "storage",
      "mixed",
      "other",
    ]);
  });

  it("defaults PCS to military, mover, and load crew packets", () => {
    expect(defaultDocumentationProfilesForMoveType("pcs")).toEqual([
      "pcsMove",
      "movingCompany",
      "loadCrew",
    ]);
  });
});
