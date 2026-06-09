import { describe, expect, it } from "vitest";

import type { EffectiveFeatureFlag } from "@/lib/feature-flags";
import { buildSettingsPosture } from "@/lib/settings-posture";

const flags = [
  {
    key: "apiMcp",
    label: "API and MCP",
    description: "Scoped API keys.",
    environment: "production",
    enabled: true,
    source: "default",
  },
  {
    key: "documentationPackets",
    label: "Documentation packets",
    description: "Packet exports.",
    environment: "production",
    enabled: true,
    source: "default",
  },
  {
    key: "billingGates",
    label: "Billing gates",
    description: "Usage gates.",
    environment: "production",
    enabled: false,
    source: "default",
  },
] satisfies EffectiveFeatureFlag[];

describe("settings posture summary", () => {
  it("keeps account and household posture in a checking state until auth is ready", () => {
    const posture = buildSettingsPosture({
      currentUser: undefined,
      households: undefined,
      flags: undefined,
      authReady: false,
    });

    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "account",
        value: "Checking",
        detail: "Waiting for Clerk and Convex identity.",
        tone: "muted",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "households",
        value: "Checking",
        detail: "Memberships load after authentication.",
        tone: "muted",
      })
    );
  });

  it("shows signed-out users what requires authentication", () => {
    const posture = buildSettingsPosture({
      currentUser: null,
      households: [],
      flags,
      authReady: true,
    });

    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "account",
        value: "Signed out",
        tone: "attention",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "privacy",
        value: "Sign in",
        tone: "muted",
      })
    );
  });

  it("summarizes signed-in role, memberships, and prepared billing gates", () => {
    const posture = buildSettingsPosture({
      currentUser: {
        email: "owner@example.com",
        appRole: "admin",
        status: "active",
      },
      households: [{ role: "editor" }, { role: "owner" }, { role: "owner" }],
      flags,
      authReady: true,
    });

    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "account",
        value: "Admin",
        detail: "owner@example.com / active",
        tone: "ready",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "households",
        value: "3",
        detail: "1 editor, 2 owner",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "billing",
        value: "Prepared",
        tone: "muted",
      })
    );
  });

  it("surfaces disabled rollout gates as attention states", () => {
    const posture = buildSettingsPosture({
      currentUser: { appRole: "member", status: "active" },
      households: [{ role: "owner" }],
      flags: flags.map((flag) =>
        flag.key === "apiMcp" || flag.key === "documentationPackets"
          ? { ...flag, enabled: false }
          : flag.key === "billingGates"
            ? { ...flag, enabled: true }
            : flag
      ),
      authReady: true,
    });

    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "apiMcp",
        value: "Disabled",
        tone: "attention",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "packets",
        value: "Disabled",
        tone: "attention",
      })
    );
    expect(posture).toContainEqual(
      expect.objectContaining({
        key: "billing",
        value: "Enforcing",
        tone: "attention",
      })
    );
  });
});
