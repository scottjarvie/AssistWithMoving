import { describe, expect, it } from "vitest";

import { buildLoadPlanPacketPath } from "@/lib/load-plan-packet";

describe("load plan packet paths", () => {
  it("builds crew-safe packet paths by default", () => {
    expect(
      buildLoadPlanPacketPath({
        householdId: "household-id",
        moveId: "move-id",
      })
    ).toBe("/app/load-plan-packet?householdId=household-id&moveId=move-id&mode=crew");
  });

  it("builds owner-private packet paths", () => {
    expect(
      buildLoadPlanPacketPath({
        householdId: "household-id",
        moveId: "move-id",
        mode: "owner",
      })
    ).toBe(
      "/app/load-plan-packet?householdId=household-id&moveId=move-id&mode=owner"
    );
  });
});
