import { describe, expect, it } from "vitest";

import {
  moverBoxExceptionLevel,
  moverFlagsForItem,
  shouldShowMoverContents,
  shouldShowMoverPrivateFields,
  type MoverPacketItemInput,
} from "../../convex/lib/moverPacket";
import {
  buildMoverPacketPath,
  moverModeLabel,
  moverPacketFilename,
} from "@/lib/mover-packet";

const baseItem: MoverPacketItemInput = {
  name: "Lamp",
  quantity: 1,
  status: "active",
  condition: "good",
  disposition: "mover",
  fragility: "low",
  highValue: false,
  hazardousFlag: false,
  requiresPersonalTransport: false,
  planningDefaultKeys: [],
  needsReview: false,
  reviewFlags: [],
};

describe("mover packet helpers", () => {
  it("flags handling-sensitive items for movers", () => {
    expect(
      moverFlagsForItem({
        ...baseItem,
        fragility: "high",
        highValue: true,
        planningDefaultKeys: ["firstNight"],
      })
    ).toEqual(["fragile", "high value", "first night"]);
  });

  it("blocks do-not-move and warning boxes", () => {
    expect(
      moverBoxExceptionLevel({
        flags: ["do not move"],
        warnings: [],
        assignedResource: "Truck",
      })
    ).toBe("blocker");
    expect(
      moverBoxExceptionLevel({
        flags: [],
        warnings: [],
        assignedResource: undefined,
      })
    ).toBe("attention");
  });

  it("keeps load crew lean and owner mode private", () => {
    expect(shouldShowMoverContents("loadCrew")).toBe(false);
    expect(shouldShowMoverContents("movingCompany")).toBe(true);
    expect(shouldShowMoverPrivateFields("movingCompany")).toBe(false);
    expect(shouldShowMoverPrivateFields("owner")).toBe(true);
  });
});

describe("mover packet paths", () => {
  it("builds packet paths and labels", () => {
    expect(
      buildMoverPacketPath({ householdId: "household-id", moveId: "move-id" })
    ).toBe(
      "/app/mover-packet?householdId=household-id&moveId=move-id&mode=movingCompany"
    );
    expect(
      buildMoverPacketPath({
        householdId: "household-id",
        moveId: "move-id",
        mode: "loadCrew",
      })
    ).toBe(
      "/app/mover-packet?householdId=household-id&moveId=move-id&mode=loadCrew"
    );
    expect(moverPacketFilename("owner")).toBe("movingmanifest-mover-owner.csv");
    expect(moverModeLabel("movingCompany")).toBe("Moving company");
  });
});
