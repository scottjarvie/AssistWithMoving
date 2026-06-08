import { describe, expect, it } from "vitest";

import {
  employerItemWeight,
  employerPacketDisclaimer,
  employerRelocationCategory,
  shouldShowEmployerPrivateFields,
  type EmployerPacketItemInput,
} from "../../convex/lib/employerPacket";
import {
  buildEmployerPacketPath,
  employerPacketFilename,
  formatEmployerCurrency,
} from "@/lib/employer-packet";

const baseItem: EmployerPacketItemInput = {
  disposition: "mover",
  status: "active",
  quantity: 1,
  estimatedWeightLb: 12,
  highValue: false,
  requiresPersonalTransport: false,
  planningDefaultKeys: [],
};

describe("employer relocation packet helpers", () => {
  it("classifies shipment, storage, and excluded dispositions", () => {
    expect(employerRelocationCategory(baseItem)).toBe("relocationShipment");
    expect(employerRelocationCategory({ ...baseItem, disposition: "storage" })).toBe(
      "storage"
    );
    expect(employerRelocationCategory({ ...baseItem, disposition: "donate" })).toBe(
      "excludedDisposition"
    );
    expect(
      employerRelocationCategory({
        ...baseItem,
        disposition: "personalTransport",
      })
    ).toBe("personalTransport");
  });

  it("uses actual weight before estimated weight", () => {
    expect(employerItemWeight({ ...baseItem, actualWeightLb: 15 })).toBe(15);
    expect(employerItemWeight(baseItem)).toBe(12);
  });

  it("keeps private fields out of submission mode", () => {
    expect(shouldShowEmployerPrivateFields("submission")).toBe(false);
    expect(shouldShowEmployerPrivateFields("owner")).toBe(true);
    expect(formatEmployerCurrency(undefined)).toBe("Hidden");
    expect(formatEmployerCurrency(12500)).toBe("$125.00");
  });

  it("does not imply tax or legal advice", () => {
    expect(employerPacketDisclaimer()).toContain("not tax, legal");
  });
});

describe("employer packet paths", () => {
  it("builds submission and owner packet paths", () => {
    expect(
      buildEmployerPacketPath({ householdId: "household-id", moveId: "move-id" })
    ).toBe(
      "/app/employer-packet?householdId=household-id&moveId=move-id&mode=submission"
    );
    expect(
      buildEmployerPacketPath({
        householdId: "household-id",
        moveId: "move-id",
        mode: "owner",
      })
    ).toBe(
      "/app/employer-packet?householdId=household-id&moveId=move-id&mode=owner"
    );
    expect(employerPacketFilename("owner")).toBe(
      "movingmanifest-employer-owner.csv"
    );
  });
});
