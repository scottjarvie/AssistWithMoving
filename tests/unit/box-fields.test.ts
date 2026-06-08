import { describe, expect, it } from "vitest";

import { normalizeBoxCode } from "../../convex/lib/moveFields";

describe("box field helpers", () => {
  it("normalizes box codes into short writable labels", () => {
    expect(normalizeBoxCode(" b 001 ")).toBe("B-001");
    expect(normalizeBoxCode("garage / 003")).toBe("GARAGE-003");
    expect(normalizeBoxCode("kit---004")).toBe("KIT-004");
  });

  it("returns an empty code when there are no usable characters", () => {
    expect(normalizeBoxCode(" *** ")).toBe("");
  });
});
