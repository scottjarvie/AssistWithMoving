import { describe, expect, it } from "vitest";

import { describeMoveWhen, moveWhenLine } from "@/lib/move-timing";

const today = new Date(2026, 9, 24, 15, 30);

describe("move timing", () => {
  it("counts days until the start date", () => {
    expect(describeMoveWhen("2026-11-14", undefined, today)).toMatchObject({ phase: "upcoming", relative: "in 21 days" });
    expect(describeMoveWhen("2026-10-25", undefined, today)?.relative).toBe("tomorrow");
    expect(describeMoveWhen("2026-10-24", "2026-10-26", today)?.relative).toBe("today");
  });

  it("says a move is under way between its dates", () => {
    expect(describeMoveWhen("2026-10-20", "2026-10-30", today)).toMatchObject({ phase: "underWay" });
    expect(moveWhenLine("2026-10-20", "2026-10-30", today)).toMatch(/^Under way until /);
  });

  it("talks about the end date in the past tense once a move is over", () => {
    const when = describeMoveWhen("2026-10-01", "2026-10-21", today);
    expect(when).toMatchObject({ phase: "past", relative: "3 days ago" });
    expect(when?.day).toMatch(/21/);
    expect(moveWhenLine("2026-10-01", "2026-10-21", today)).toMatch(/^Moved .*21.* · 3 days ago$/);
    expect(moveWhenLine("2026-10-21", undefined, today)).toMatch(/^Moved .* · 3 days ago$/);
  });

  it("returns nothing without dates and keeps unparseable text", () => {
    expect(describeMoveWhen(undefined, undefined, today)).toBeUndefined();
    expect(moveWhenLine(undefined, undefined, today)).toBeUndefined();
    expect(moveWhenLine("spring", undefined, today)).toBe("spring");
  });

  it("builds a one-line card summary", () => {
    expect(moveWhenLine("2026-11-14", "2026-11-15", today)).toMatch(/2026 · in 21 days$/);
  });
});
