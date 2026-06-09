import { describe, expect, it } from "vitest";

import {
  buildMoverReadinessChecklist,
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

  it("marks a recipient-safe mover packet ready when load data is complete", () => {
    const checklist = buildMoverReadinessChecklist({
      mode: "movingCompany",
      visibility: {
        contentsShown: true,
        privateFieldsShown: false,
        valuesHidden: true,
        serialsHidden: true,
        privateNotesHidden: true,
      },
      summary: {
        boxCount: 6,
        itemCount: 22,
        attentionCount: 0,
        blockerCount: 0,
        unassignedCount: 0,
      },
      counts: {
        boxesWithoutDestinationCount: 0,
        boxesWithHandlingFlagsCount: 0,
        boxesWithWarningsCount: 0,
        boxesNotHandoffReadyCount: 0,
      },
    });

    expect(checklist.find((entry) => entry.key === "box-list")).toMatchObject({
      status: "ready",
    });
    expect(
      checklist.find((entry) => entry.key === "recipient-privacy")
    ).toMatchObject({
      status: "ready",
    });
  });

  it("surfaces mover handoff blockers and owner-private mode", () => {
    const checklist = buildMoverReadinessChecklist({
      mode: "owner",
      visibility: {
        contentsShown: true,
        privateFieldsShown: true,
        valuesHidden: false,
        serialsHidden: false,
        privateNotesHidden: false,
      },
      summary: {
        boxCount: 2,
        itemCount: 5,
        attentionCount: 1,
        blockerCount: 1,
        unassignedCount: 2,
      },
      counts: {
        boxesWithoutDestinationCount: 1,
        boxesWithHandlingFlagsCount: 2,
        boxesWithWarningsCount: 1,
        boxesNotHandoffReadyCount: 2,
      },
    });

    expect(
      checklist.find((entry) => entry.key === "load-assignment")
    ).toMatchObject({
      status: "attention",
    });
    expect(
      checklist.find((entry) => entry.key === "exception-review")
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
