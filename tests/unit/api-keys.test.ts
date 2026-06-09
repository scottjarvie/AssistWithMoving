import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  apiKeyHasScopes,
  apiKeyPrefix,
  apiKeyPreview,
  canApiKeyPerformAction,
  generateApiKeySecret,
  hashApiKey,
  normalizeApiKeyScopes,
  validateApiKeyRecord,
  verifyApiKeyHash,
  type ApiKeyScope,
} from "../../convex/lib/apiKeys";
import {
  apiKeyRestrictionLabel,
  apiKeyStatusLabel,
  formatApiKeyDate,
} from "@/lib/api-keys";

describe("api key primitives", () => {
  it("generates previewable keys with lookup prefixes", () => {
    const rawKey = generateApiKeySecret();
    const lookupPrefix = rawKey.slice("mmk_".length, "mmk_".length + 14);

    expect(rawKey).toMatch(/^mmk_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
    expect(apiKeyPrefix(rawKey)).toBe(lookupPrefix);
    expect(apiKeyPreview(rawKey)).toContain("...");
  });

  it("parses generated lookup prefixes even when the prefix contains underscores", () => {
    const rawKey = "mmk_ab_cd-efghijkl_secret-with_underscores";

    expect(apiKeyPrefix(rawKey)).toBe("ab_cd-efghijkl");
    expect(() => apiKeyPrefix("mmk_prefix_secret")).toThrow(
      "Invalid API key format."
    );
  });

  it("hashes and verifies without storing the raw secret", async () => {
    const rawKey = "mmk_prefix_secret";
    const hash = await hashApiKey(rawKey);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(rawKey);
    await expect(
      verifyApiKeyHash({ rawKey, expectedHash: hash })
    ).resolves.toBe(true);
    await expect(
      verifyApiKeyHash({ rawKey: `${rawKey}-wrong`, expectedHash: hash })
    ).resolves.toBe(false);
  });

  it("normalizes and checks scopes", () => {
    expect(
      normalizeApiKeyScopes([
        "inventory/read",
        "moves/read",
        "inventory/read",
      ] as ApiKeyScope[])
    ).toEqual(["inventory/read", "moves/read"]);
    expect(apiKeyHasScopes(["moves/read"], ["moves/read"])).toBe(true);
    expect(apiKeyHasScopes(["moves/read"], ["moves/write"])).toBe(false);
    expect(canApiKeyPerformAction(["inventory/read"], "inventory:read")).toBe(
      true
    );
    expect(canApiKeyPerformAction(["inventory/read"], "inventory:edit")).toBe(
      false
    );
    expect(canApiKeyPerformAction(["moves/read"], "api_keys:manage")).toBe(
      false
    );
  });

  it("rejects revoked, expired, wrong-household, and wrong-move records", () => {
    const householdId = "household" as Id<"households">;
    const moveId = "move" as Id<"moves">;
    const record = {
      status: "active" as const,
      scopes: ["inventory/read" as const],
      householdId,
      moveId,
      expiresAt: 2000,
    };

    expect(
      validateApiKeyRecord({
        record,
        householdId,
        moveId,
        requiredScopes: ["inventory/read"],
        now: 1000,
      })
    ).toBe(true);
    expect(
      validateApiKeyRecord({
        record: { ...record, status: "revoked" },
        householdId,
        moveId,
        requiredScopes: ["inventory/read"],
        now: 1000,
      })
    ).toBe(false);
    expect(
      validateApiKeyRecord({
        record,
        householdId,
        moveId,
        requiredScopes: ["inventory/read"],
        now: 3000,
      })
    ).toBe(false);
    expect(
      validateApiKeyRecord({
        record,
        householdId: "other" as Id<"households">,
        moveId,
        requiredScopes: ["inventory/read"],
        now: 1000,
      })
    ).toBe(false);
    expect(
      validateApiKeyRecord({
        record,
        householdId,
        moveId: "other" as Id<"moves">,
        requiredScopes: ["inventory/read"],
        now: 1000,
      })
    ).toBe(false);
  });
});

describe("api key UI helpers", () => {
  it("formats status and dates", () => {
    expect(apiKeyStatusLabel("active")).toBe("Active");
    expect(apiKeyStatusLabel("revoked")).toBe("Revoked");
    expect(formatApiKeyDate(undefined)).toBe("Never");
  });

  it("labels household-wide and move-restricted keys", () => {
    expect(apiKeyRestrictionLabel(undefined, undefined)).toBe("All moves");
    expect(apiKeyRestrictionLabel("move1", "PCS Utah to Virginia")).toBe(
      "Move: PCS Utah to Virginia"
    );
    expect(apiKeyRestrictionLabel("move1", undefined)).toBe(
      "Move: restricted move"
    );
  });
});
