import { describe, expect, it } from "vitest";

import { redactAuditMetadata } from "../../convex/lib/audit";

describe("redactAuditMetadata", () => {
  it("redacts secrets and sensitive inventory fields", () => {
    expect(
      redactAuditMetadata({
        action: "api_key.created",
        apiKey: "raw-key",
        nested: {
          serialNumber: "ABC-123",
          privateNotes: "garage safe",
          visibleLabel: "Kitchen box",
        },
      })
    ).toEqual({
      action: "api_key.created",
      apiKey: "[redacted]",
      nested: {
        serialNumber: "[redacted]",
        privateNotes: "[redacted]",
        visibleLabel: "Kitchen box",
      },
    });
  });

  it("redacts sensitive keys inside arrays", () => {
    expect(
      redactAuditMetadata({
        items: [
          { name: "Lamp", estimatedValue: 20 },
          { name: "Laptop", purchaseValue: 1800 },
        ],
      })
    ).toEqual({
      items: [
        { name: "Lamp", estimatedValue: "[redacted]" },
        { name: "Laptop", purchaseValue: "[redacted]" },
      ],
    });
  });
});
