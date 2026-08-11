import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertExpectedQueueVersion,
  canTransitionQueueState,
  effectiveQueueState,
  ingestionStatusToQueueState,
  normalizeQueueLimit,
  queueFailureTransition,
  queueStateInvariantError,
  queueStateLabels,
  queueStates,
} from "../../convex/lib/queue";

describe("canonical Queue behavior contract", () => {
  it("exposes exactly the four family states and labels", () => {
    expect(queueStates).toEqual([
      "needsYou",
      "working",
      "waitingForAi",
      "done",
    ]);
    expect(queueStateLabels).toEqual({
      needsYou: "Needs You",
      working: "Working",
      waitingForAi: "Waiting for your AI",
      done: "Done",
    });
  });

  it("permits bounded handoff transitions and keeps Done terminal", () => {
    expect(canTransitionQueueState("waitingForAi", "working")).toBe(true);
    expect(canTransitionQueueState("working", "needsYou")).toBe(true);
    expect(canTransitionQueueState("needsYou", "waitingForAi")).toBe(true);
    expect(canTransitionQueueState("working", "done")).toBe(true);
    for (const state of queueStates) {
      expect(canTransitionQueueState("done", state)).toBe(false);
    }
    expect(canTransitionQueueState("needsYou", "working")).toBe(false);
  });

  it("fails closed when state-specific meaning is missing", () => {
    expect(queueStateInvariantError({ state: "needsYou" })).toMatch(
      /exact human decision/i,
    );
    expect(queueStateInvariantError({ state: "working" })).toMatch(
      /current next step/i,
    );
    expect(
      queueStateInvariantError({
        state: "working",
        nextStep: "Compare mover estimates",
        claimExpiresAt: 10,
      }),
    ).toMatch(/attributable claimant/i);
    expect(
      queueStateInvariantError({
        state: "waitingForAi",
        claimedByUserId: "user_1",
      }),
    ).toMatch(/cannot retain an active claim/i);
    expect(
      queueStateInvariantError({
        state: "done",
        terminalReason: "completed",
      }),
    ).toMatch(/readable result/i);
    expect(
      queueStateInvariantError({
        state: "done",
        terminalReason: "canceled",
      }),
    ).toBeNull();
  });

  it("turns an expired Working lease back into Waiting for your AI", () => {
    expect(
      effectiveQueueState(
        { state: "working", claimExpiresAt: 999 },
        1000,
      ),
    ).toBe("waitingForAi");
    expect(
      effectiveQueueState(
        { state: "working", claimExpiresAt: 1001 },
        1000,
      ),
    ).toBe("working");
  });

  it("maps every legacy capture state without changing stored domain truth", () => {
    const now = 1000;
    expect(ingestionStatusToQueueState("queued", undefined, now)).toBe(
      "waitingForAi",
    );
    expect(ingestionStatusToQueueState("claimed", 2000, now)).toBe("working");
    expect(ingestionStatusToQueueState("claimed", 999, now)).toBe(
      "waitingForAi",
    );
    expect(ingestionStatusToQueueState("processed", undefined, now)).toBe(
      "needsYou",
    );
    expect(ingestionStatusToQueueState("needsInput", undefined, now)).toBe(
      "needsYou",
    );
    expect(ingestionStatusToQueueState("resolved", undefined, now)).toBe("done");
    expect(ingestionStatusToQueueState("discarded", undefined, now)).toBe("done");
  });

  it("bounds pagination, retry attempts, and optimistic concurrency", () => {
    expect(normalizeQueueLimit(undefined)).toBe(50);
    expect(normalizeQueueLimit(0)).toBe(1);
    expect(normalizeQueueLimit(1000)).toBe(100);
    expect(
      queueFailureTransition({
        attemptCount: 0,
        maxAttempts: 3,
        retryable: true,
      }),
    ).toEqual({
      nextAttemptCount: 1,
      state: "waitingForAi",
      activity: "retryScheduled",
    });
    expect(
      queueFailureTransition({
        attemptCount: 2,
        maxAttempts: 3,
        retryable: true,
      }),
    ).toEqual({
      nextAttemptCount: 3,
      state: "needsYou",
      activity: "retryExhausted",
    });
    expect(() => assertExpectedQueueVersion(4, 3)).toThrow(/changed since/i);
    expect(() => assertExpectedQueueVersion(4, 4)).not.toThrow();
  });

  it("excludes missing expiries and keeps OAuth Queue functions gateway-only", () => {
    const queueSource = readFileSync("convex/queue.ts", "utf8");
    expect(queueSource).toContain(
      'q.gt("expiresAt", undefined).lt("expiresAt", now)',
    );

    const oauthFunctions = readFileSync(
      "convex/mcpToolsCanonicalQueue.ts",
      "utf8",
    );
    expect(oauthFunctions).toContain("internalQuery({");
    expect(oauthFunctions).toContain("internalMutation({");
    expect(oauthFunctions).not.toMatch(/export const \w+ = (query|mutation)\(\{/);

    const gatewayRegistry = readFileSync("convex/mcp.ts", "utf8");
    expect(gatewayRegistry).toContain(
      "internal.mcpToolsCanonicalQueue.listQueueItems",
    );
    expect(gatewayRegistry).toContain(
      "internal.mcpToolsCanonicalQueue.reportQueueFailure",
    );
  });
});
