import { describe, expect, it } from "vitest";

import { moveBoxesPath, moveWorkspacePath } from "../../src/lib/move-links";

describe("move links", () => {
  it("builds canonical per-move workspace paths", () => {
    expect(moveWorkspacePath("move_123")).toBe("/app/moves/move_123");
    expect(moveWorkspacePath("move/with/slash", "load-plan")).toBe(
      "/app/moves/move%2Fwith%2Fslash/load-plan"
    );
  });

  it("returns to move-specific boxes when move context is available", () => {
    expect(moveBoxesPath("move_123")).toBe("/app/moves/move_123/boxes");
    expect(moveBoxesPath()).toBe("/app/dashboard");
  });
});
