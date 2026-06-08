import { describe, expect, it } from "vitest";

import {
  applyFlagOverrides,
  defaultFlagEnabled,
  featureEnvironment,
  isFeatureFlagKey,
} from "../../convex/lib/featureFlags";
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

describe("feature flags", () => {
  it("normalizes feature environments", () => {
    expect(featureEnvironment("dev")).toBe("development");
    expect(featureEnvironment("preview")).toBe("preview");
    expect(featureEnvironment("prod")).toBe("production");
  });

  it("keeps shipped product areas enabled and billing gates off by default", () => {
    expect(defaultFlagEnabled("aiPhotoIntake", "production")).toBe(true);
    expect(defaultFlagEnabled("apiMcp", "production")).toBe(true);
    expect(defaultFlagEnabled("documentationPackets", "production")).toBe(true);
    expect(defaultFlagEnabled("adminTools", "production")).toBe(true);
    expect(defaultFlagEnabled("billingGates", "production")).toBe(false);
    expect(defaultFlagEnabled("billingGates", "preview")).toBe(true);
  });

  it("applies runtime overrides over environment defaults", () => {
    const flags = applyFlagOverrides("production", [
      {
        key: "aiPhotoIntake",
        enabled: false,
        note: "Pause vision costs",
        updatedAt: 100,
      },
    ]);

    expect(flags.find((flag) => flag.key === "aiPhotoIntake")).toMatchObject({
      enabled: false,
      source: "override",
      note: "Pause vision costs",
    });
    expect(flags.find((flag) => flag.key === "apiMcp")).toMatchObject({
      enabled: true,
      source: "default",
    });
  });

  it("validates supported keys", () => {
    expect(isFeatureFlagKey("adminTools")).toBe(true);
    expect(isFeatureFlagKey("unknown")).toBe(false);
  });

  it("supports disabled UI path checks", () => {
    const flags: EffectiveFeatureFlag[] = [
      {
        key: "documentationPackets",
        label: "Documentation packets",
        description: "",
        environment: "production",
        enabled: false,
        source: "override",
      },
    ];

    expect(flagEnabled(flags, "documentationPackets", true)).toBe(false);
    expect(flagEnabled(flags, "apiMcp", true)).toBe(true);
    expect(flagEnabled(undefined, "apiMcp", false)).toBe(false);
  });
});
