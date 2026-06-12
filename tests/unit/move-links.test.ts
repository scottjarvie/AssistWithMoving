import { describe, expect, it } from "vitest";

import {
  moveBoxesPath,
  moveWorkspaceAnchorPath,
  moveWorkspacePath,
} from "../../src/lib/move-links";

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

  it("resolves old workspace anchors to split move pages", () => {
    expect(moveWorkspaceAnchorPath("move_123", "#inventory")).toBe(
      "/app/moves/move_123/inventory"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#photos")).toBe(
      "/app/moves/move_123/photos"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-review-queue")).toBe(
      "/app/moves/move_123/ai-review"
    );
    expect(moveWorkspaceAnchorPath("move/with/slash", "#load-plan")).toBe(
      "/app/moves/move%2Fwith%2Fslash/load-plan"
    );
  });

  it("keeps safe fallbacks for dashboard, missing moves, and unknown anchors", () => {
    expect(moveWorkspaceAnchorPath("move_123", "#active-moves")).toBe(
      "/app/dashboard#active-moves"
    );
    expect(moveWorkspaceAnchorPath(null, "#inventory")).toBe("#inventory");
    expect(moveWorkspaceAnchorPath("move_123", "#custom-section")).toBe(
      "#custom-section"
    );
  });
});
