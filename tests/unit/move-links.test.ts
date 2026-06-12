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
    expect(moveWorkspaceAnchorPath("move_123", "#move-questions")).toBe(
      "/app/moves/move_123#move-questions"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#packing-debt")).toBe(
      "/app/moves/move_123#packing-debt"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#move-contacts")).toBe(
      "/app/moves/move_123#move-contacts"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#planning-defaults")).toBe(
      "/app/moves/move_123#planning-defaults"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#inventory")).toBe(
      "/app/moves/move_123/inventory#inventory"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#add-box")).toBe(
      "/app/moves/move_123/boxes#add-box"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#box-labels")).toBe(
      "/app/moves/move_123/boxes#box-labels"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#box-load")).toBe(
      "/app/moves/move_123/boxes#box-load"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#room-walk")).toBe(
      "/app/moves/move_123/inventory#room-walk"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#capture")).toBe(
      "/app/moves/move_123/capture#capture"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#capture-queue")).toBe(
      "/app/moves/move_123/capture#capture-queue"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ingestion-queue")).toBe(
      "/app/moves/move_123/capture#ingestion-queue"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#add-space")).toBe(
      "/app/moves/move_123/spaces#add-space"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#spaces")).toBe(
      "/app/moves/move_123/spaces#spaces"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#planned-items")).toBe(
      "/app/moves/move_123/inventory#planned-items"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#inventory-duplicate-review")).toBe(
      "/app/moves/move_123/inventory#inventory-duplicate-review"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#estimate-summary")).toBe(
      "/app/moves/move_123/inventory#estimate-summary"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#sale-pipeline")).toBe(
      "/app/moves/move_123/sell#sale-pipeline"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#sale-listing")).toBe(
      "/app/moves/move_123/sell#sale-listing"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#sale-pricing")).toBe(
      "/app/moves/move_123/sell#sale-pricing"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#sale-status")).toBe(
      "/app/moves/move_123/sell#sale-status"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#photos")).toBe(
      "/app/moves/move_123/photos#photos"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#add-photos")).toBe(
      "/app/moves/move_123/photos#add-photos"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#photo-gaps")).toBe(
      "/app/moves/move_123/photos#photo-gaps"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-review-queue")).toBe(
      "/app/moves/move_123/ai-review#ai-review-queue"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-text-intake")).toBe(
      "/app/moves/move_123/ai-review#ai-text-intake"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-photo-intake")).toBe(
      "/app/moves/move_123/ai-review#ai-photo-intake"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-planning-suggestions")).toBe(
      "/app/moves/move_123/load-plan#ai-planning-suggestions"
    );
    expect(moveWorkspaceAnchorPath("move/with/slash", "#load-plan")).toBe(
      "/app/moves/move%2Fwith%2Fslash/load-plan#load-plan"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#move-day-progress")).toBe(
      "/app/moves/move_123/move-day#move-day-progress"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#move-day-exceptions")).toBe(
      "/app/moves/move_123/move-day#move-day-exceptions"
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
