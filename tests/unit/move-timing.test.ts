import { describe, expect, it } from "vitest";

import { describeMoveTiming, moveWhenLine } from "@/lib/move-timing";

const today = new Date(2026, 9, 24, 15, 30);

describe("move timing", () => {
  it("counts days until the start date", () => {
    expect(describeMoveTiming("2026-11-14", undefined, today)).toBe("in 21 days");
    expect(describeMoveTiming("2026-10-25", undefined, today)).toBe("tomorrow");
    expect(describeMoveTiming("2026-10-24", "2026-10-26", today)).toBe("today");
  });

  it("says a move is under way between its dates and ended after", () => {
    expect(describeMoveTiming("2026-10-20", "2026-10-30", today)).toBe("under way");
    expect(describeMoveTiming("2026-10-01", "2026-10-21", today)).toBe("ended 3 days ago");
    expect(describeMoveTiming("2026-10-21", undefined, today)).toBe("3 days ago");
  });

  it("returns nothing without dates and keeps unparseable text", () => {
    expect(describeMoveTiming(undefined, undefined, today)).toBeUndefined();
    expect(moveWhenLine(undefined, undefined, today)).toBeUndefined();
    expect(moveWhenLine("spring", undefined, today)).toBe("spring");
  });

  it("builds a one-line card summary", () => {
    expect(moveWhenLine("2026-11-14", "2026-11-15", today)).toMatch(/2026 · in 21 days$/);
  });
});
