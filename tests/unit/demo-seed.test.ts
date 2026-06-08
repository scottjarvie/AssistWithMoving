import { describe, expect, it } from "vitest";

import {
  demoHouseholdName,
  demoSeedScenarioSummary,
  demoSeedScenarios,
} from "../../convex/lib/demoSeed";

describe("demo seed scenarios", () => {
  it("covers the launch QA scenario set", () => {
    const summary = demoSeedScenarioSummary();

    expect(demoHouseholdName).toBe("MovingManifest Demo Household");
    expect(summary.scenarioCount).toBe(5);
    expect(summary.moveTypes).toEqual([
      "pcs",
      "longDistance",
      "storage",
      "decluttering",
      "claimsInventory",
    ]);
    expect(summary.documentationProfileTypes).toEqual(
      expect.arrayContaining([
        "pcsMove",
        "movingCompany",
        "loadCrew",
        "storageInventory",
        "donationPickup",
        "sellOrGiveaway",
        "insuranceClaim",
        "personalFullRecord",
      ])
    );
    expect(summary.itemCount).toBeGreaterThanOrEqual(10);
    expect(summary.boxCount).toBeGreaterThanOrEqual(7);
  });

  it("includes evidence metadata and box assignments for every scenario", () => {
    for (const scenario of demoSeedScenarios) {
      expect(scenario.items.some((item) => item.photoTypes?.length)).toBe(true);
      const transportPresets = new Set<string>(scenario.transportPresets);
      for (const box of scenario.boxes) {
        expect(box.presetKey ? transportPresets.has(box.presetKey) : true).toBe(
          true
        );
      }
      for (const item of scenario.items.filter((entry) => entry.boxCode)) {
        expect(
          scenario.boxes.some((box) => box.code === item.boxCode)
        ).toBe(true);
      }
    }
  });
});
