import { describe, expect, it } from "vitest";

import {
  buildEmployerReadinessChecklist,
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

  it("marks an employer submission packet ready when key records are present", () => {
    const checklist = buildEmployerReadinessChecklist({
      mode: "submission",
      move: {
        origin: "Utah",
        destination: "Virginia",
        dateStart: "2026-07-01",
      },
      visibility: {
        privateFieldsShown: false,
        valuesHidden: true,
        serialsHidden: true,
        privateNotesHidden: true,
      },
      summary: {
        itemCount: 8,
        boxCount: 4,
        resourceCount: 2,
        storageBoxCount: 1,
        shipmentWeightLb: 900,
        shipmentVolumeCuFt: 140,
      },
      counts: {
        shipmentItemCount: 7,
        storageItemCount: 1,
        excludedItemCount: 0,
        personalTransportItemCount: 0,
        needsReviewCount: 0,
        unboxedShipmentItemCount: 0,
        missingWeightCount: 0,
        damagedOrMissingItemCount: 0,
      },
    });

    expect(checklist.find((entry) => entry.key === "move-overview")).toMatchObject({
      status: "ready",
    });
    expect(
      checklist.find((entry) => entry.key === "recipient-privacy")
    ).toMatchObject({
      status: "ready",
    });
  });

  it("surfaces employer packet gaps without exposing private data", () => {
    const checklist = buildEmployerReadinessChecklist({
      mode: "owner",
      move: {},
      visibility: {
        privateFieldsShown: true,
        valuesHidden: false,
        serialsHidden: false,
        privateNotesHidden: false,
      },
      summary: {
        itemCount: 2,
        boxCount: 0,
        resourceCount: 0,
        storageBoxCount: 0,
        shipmentWeightLb: 0,
        shipmentVolumeCuFt: 0,
      },
      counts: {
        shipmentItemCount: 0,
        storageItemCount: 1,
        excludedItemCount: 1,
        personalTransportItemCount: 1,
        needsReviewCount: 2,
        unboxedShipmentItemCount: 1,
        missingWeightCount: 1,
        damagedOrMissingItemCount: 1,
      },
    });

    expect(checklist.find((entry) => entry.key === "move-overview")).toMatchObject({
      status: "missing",
    });
    expect(
      checklist.find((entry) => entry.key === "shipment-summary")
    ).toMatchObject({
      status: "missing",
    });
    expect(
      checklist.find((entry) => entry.key === "recipient-privacy")
    ).toMatchObject({
      status: "attention",
    });
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
