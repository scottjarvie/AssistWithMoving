import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  apiKeyHasScopes,
  apiKeyPrefix,
  apiKeyPreview,
  canApiKeyPerformAction,
  describeInvalidApiKeyFormat,
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

  // Regression guard for the exact failure mode that recurred in production:
  // a change to the generator (e.g. the random byte count) or the parser (the
  // "harden API key parsing" commit) that desyncs the two silently breaks EVERY
  // key. Round-tripping many freshly generated keys catches a desync before it
  // ships, including the ~20% of keys whose base64url prefix contains "_".
  it("keeps the generator and parser in lockstep across many keys", () => {
    for (let index = 0; index < 2000; index += 1) {
      const rawKey = generateApiKeySecret();
      expect(rawKey.startsWith("mmk_")).toBe(true);

      // The parser must not throw, and the prefix it returns must be exactly
      // the slice the by_prefix index stores at creation time.
      const prefix = apiKeyPrefix(rawKey);
      const lookupSlice = rawKey.slice("mmk_".length, "mmk_".length + 14);
      expect(prefix).toBe(lookupSlice);
      expect(prefix).toHaveLength(14);
      expect(rawKey["mmk_".length + 14]).toBe("_");
    }
  });

  it("explains WHY a key is rejected instead of one opaque message", () => {
    // OAuth/JWT token pasted where an mmk_ key is required (the production bug).
    const jwt =
      "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.c2lnbmF0dXJl";
    expect(() => apiKeyPrefix(jwt)).toThrow("Invalid API key format.");
    expect(describeInvalidApiKeyFormat(jwt)).toMatch(/OAuth\/JWT token/);
    expect(describeInvalidApiKeyFormat(jwt)).toMatch(/mmk_/);

    // A masked preview (what apiKeyPreview renders) copied by mistake.
    const preview = apiKeyPreview(generateApiKeySecret());
    expect(preview).toContain("...");
    expect(describeInvalidApiKeyFormat(preview)).toMatch(/masked preview/);

    // Right prefix, wrong shape.
    expect(describeInvalidApiKeyFormat("mmk_short_secret")).toMatch(
      /wrong shape/
    );

    // Plain garbage still names the expected prefix.
    expect(describeInvalidApiKeyFormat("totally-bogus")).toMatch(/mmk_/);
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
    expect(canApiKeyPerformAction(["plans/read"], "plan:read")).toBe(true);
    expect(canApiKeyPerformAction(["plans/read"], "plan:edit")).toBe(false);
    expect(canApiKeyPerformAction(["plans/write"], "plan:edit")).toBe(true);
    expect(
      canApiKeyPerformAction(["members/manage"], "household:manage_members")
    ).toBe(true);
    expect(
      canApiKeyPerformAction(["moves/write"], "household:manage_members")
    ).toBe(false);
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
