import { describe, expect, it } from "vitest";

import {
  transportPresetsForMoveType,
  transportResourcePresetKeys,
} from "../../convex/lib/transportPresets";

describe("move template transport pre-loading", () => {
  it("gives every neutral template a non-military starter set", () => {
    for (const template of ["local", "longDistance", "storage", "estate", "decluttering"]) {
      const presets = transportPresetsForMoveType(template);
      expect(presets.length).toBeGreaterThan(0);
      expect(presets).not.toContain("militaryMovers");
    }
  });

  it("only the PCS template pre-loads military movers", () => {
    expect(transportPresetsForMoveType("pcs")).toContain("militaryMovers");
  });

  it("returns only valid preset keys and tolerates unknown templates", () => {
    for (const template of ["local", "pcs", "estate", "claimsInventory"]) {
      for (const key of transportPresetsForMoveType(template)) {
        expect(transportResourcePresetKeys).toContain(key);
      }
    }
    expect(transportPresetsForMoveType("nonsense")).toEqual([]);
  });
});
