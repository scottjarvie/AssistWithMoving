import { describe, expect, it } from "vitest";

import {
  getTransportResourcePreset,
  transportResourcePresetKeys,
} from "../../convex/lib/transportPresets";
import { transportResourcePresetOptions } from "@/lib/transport-presets";

describe("transport resource presets", () => {
  it("keeps frontend preset buttons aligned with backend preset keys", () => {
    expect(transportResourcePresetOptions.map(([key]) => key)).toEqual(
      transportResourcePresetKeys
    );
  });

  it("creates military movers as a first-class PCS resource type", () => {
    const preset = getTransportResourcePreset("militaryMovers");

    expect(preset.type).toBe("militaryMovers");
    expect(preset.zones.map((zone) => zone.name)).toEqual([
      "HHG furniture",
      "HHG boxes",
      "Pro gear review",
      "Restricted review",
    ]);
  });

  it("creates trailer presets with dimensions and load zones", () => {
    const preset = getTransportResourcePreset("trailer7x16");

    expect(preset.capacity.dimensions).toEqual({
      lengthIn: 192,
      widthIn: 84,
      heightIn: 80,
    });
    expect(preset.rules).toContain("balance weight");
  });
});
