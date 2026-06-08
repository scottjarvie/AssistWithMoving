import { describe, expect, it } from "vitest";

import {
  MOVE_DAY_CACHE_MAX_AGE_MS,
  createMoveDayCachePayload,
  moveDayCacheAgeLabel,
  moveDayConnectivityMessage,
  moveDayMutationFailureMessage,
  parseMoveDayCache,
} from "../../src/lib/move-day";

describe("move day helpers", () => {
  const now = 1_800_000;

  it("round trips fresh crew-safe checklist cache data", () => {
    const payload = createMoveDayCachePayload({
      moveId: "move_123",
      now,
      boxes: [
        {
          id: "box_1",
          code: "B-001",
          status: "staged",
          itemCount: 4,
          assignmentWarnings: ["fragile"],
          assignmentHardBlocks: [],
          assignmentLocked: false,
        },
      ],
    });

    expect(parseMoveDayCache(JSON.stringify(payload), "move_123", now + 5000))
      .toEqual(payload);
  });

  it("rejects stale or mismatched checklist cache data", () => {
    const payload = createMoveDayCachePayload({
      moveId: "move_123",
      now,
      boxes: [],
    });

    expect(parseMoveDayCache(JSON.stringify(payload), "move_999", now)).toBeNull();
    expect(
      parseMoveDayCache(
        JSON.stringify(payload),
        "move_123",
        now + MOVE_DAY_CACHE_MAX_AGE_MS + 1
      )
    ).toBeNull();
  });

  it("describes cache age and connectivity without implying offline writes work", () => {
    expect(moveDayCacheAgeLabel(now - 30_000, now)).toBe("just now");
    expect(moveDayCacheAgeLabel(now - 5 * 60_000, now)).toBe("5m ago");
    expect(moveDayCacheAgeLabel(now - 2 * 60 * 60_000, now)).toBe("2h ago");

    expect(
      moveDayConnectivityMessage({
        online: false,
        usingCache: true,
        cacheAgeLabel: "5m ago",
      })
    ).toContain("Reconnect before changing statuses");
    expect(
      moveDayMutationFailureMessage({ boxCode: "B-001", online: false })
    ).toBe("Offline. B-001 was not changed; reconnect and retry.");
  });
});
