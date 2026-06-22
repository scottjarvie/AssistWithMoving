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

  it("points boxes at the Movable Units home (with or without a move)", () => {
    // Boxes became Movable Units; the helper ignores the (now optional) move id.
    expect(moveBoxesPath("move_123")).toBe("/app/movable-units");
    expect(moveBoxesPath()).toBe("/app/movable-units");
  });

  it("sends removed-section anchors straight to their new homes", () => {
    // Inventory section -> the global Items table.
    for (const anchor of [
      "#inventory",
      "#add-inventory",
      "#bulk-inventory",
      "#bulk-paste",
      "#inventory-records",
      "#room-walk",
      "#planned-items",
      "#inventory-duplicate-review",
      "#estimate-summary",
      "#estimate-capacity",
      "#estimate-warnings",
      "#estimate-assumptions",
      "#disposition-pipelines",
    ]) {
      expect(moveWorkspaceAnchorPath("move_123", anchor)).toBe("/app/items");
    }
    // Photos and Sell sections also collapse into the Items table.
    for (const anchor of [
      "#photos",
      "#add-photos",
      "#photo-gaps",
      "#photo-review",
      "#evidence-density",
      "#sale-pipeline",
      "#sale-listing",
      "#sale-pricing",
      "#sale-status",
    ]) {
      expect(moveWorkspaceAnchorPath("move_123", anchor)).toBe("/app/items");
    }
    // Boxes section -> the Movable Units table.
    for (const anchor of [
      "#boxes",
      "#add-box",
      "#box-labels",
      "#box-load",
      "#box-contents",
      "#box-details",
      "#box-photos",
    ]) {
      expect(moveWorkspaceAnchorPath("move_123", anchor)).toBe(
        "/app/movable-units"
      );
    }
    // Spaces section -> the per-move Start-location config tab (keeps the id).
    for (const anchor of ["#spaces", "#add-space"]) {
      expect(moveWorkspaceAnchorPath("move_123", anchor)).toBe(
        "/app/moves/move_123#start"
      );
    }
  });

  it("keeps operational anchors on their per-move pages", () => {
    expect(moveWorkspaceAnchorPath("move_123", "#capture")).toBe(
      "/app/moves/move_123/capture#capture"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ingestion-queue")).toBe(
      "/app/moves/move_123/capture#ingestion-queue"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#packet-exports")).toBe(
      "/app/moves/move_123/packets#packet-exports"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#claim-packets")).toBe(
      "/app/moves/move_123/packets#claim-packets"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-review-queue")).toBe(
      "/app/moves/move_123/ai-review#ai-review-queue"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-planning-suggestions")).toBe(
      "/app/moves/move_123/load-plan#ai-planning-suggestions"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#capacity-posture")).toBe(
      "/app/moves/move_123/load-plan#capacity-posture"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#layout-studio")).toBe(
      "/app/moves/move_123/plan#layout-studio"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#move-day-progress")).toBe(
      "/app/moves/move_123/move-day#move-day-progress"
    );
    expect(moveWorkspaceAnchorPath("move/with/slash", "#load-plan")).toBe(
      "/app/moves/move%2Fwith%2Fslash/load-plan#load-plan"
    );
  });

  it("keeps null-section anchors on the move index", () => {
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
  });

  it("collapses former dashboard anchors onto the moves home", () => {
    for (const anchor of [
      "#active-moves",
      "#create-move",
      "#create-move-packets",
      "#household-setup",
      "#ai-connection",
    ]) {
      expect(moveWorkspaceAnchorPath("move_123", anchor)).toBe("/app/moves");
    }
  });

  it("keeps safe fallbacks for missing moves and unknown anchors", () => {
    expect(moveWorkspaceAnchorPath(null, "#inventory")).toBe("#inventory");
    expect(moveWorkspaceAnchorPath("move_123", "#custom-section")).toBe(
      "#custom-section"
    );
  });
});
