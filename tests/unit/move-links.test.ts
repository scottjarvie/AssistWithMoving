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
    expect(moveWorkspaceAnchorPath("move_123", "#add-inventory")).toBe(
      "/app/moves/move_123/inventory#add-inventory"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#bulk-inventory")).toBe(
      "/app/moves/move_123/inventory#bulk-inventory"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#bulk-paste")).toBe(
      "/app/moves/move_123/inventory#bulk-paste"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#inventory-records")).toBe(
      "/app/moves/move_123/inventory#inventory-records"
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
    expect(moveWorkspaceAnchorPath("move_123", "#layout-studio")).toBe(
      "/app/moves/move_123/plan#layout-studio"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#layout-review")).toBe(
      "/app/moves/move_123/plan#layout-review"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#layout-blueprint")).toBe(
      "/app/moves/move_123/plan#layout-blueprint"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#packet-exports")).toBe(
      "/app/moves/move_123/packets#packet-exports"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#packet-share-links")).toBe(
      "/app/moves/move_123/packets#packet-share-links"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#packet-views")).toBe(
      "/app/moves/move_123/packets#packet-views"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#claim-timeline")).toBe(
      "/app/moves/move_123/packets#claim-timeline"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#claim-packets")).toBe(
      "/app/moves/move_123/packets#claim-packets"
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
    expect(moveWorkspaceAnchorPath("move_123", "#add-transport-resource")).toBe(
      "/app/moves/move_123/load-plan#add-transport-resource"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#transport-resource-presets")).toBe(
      "/app/moves/move_123/load-plan#transport-resource-presets"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#capacity-posture")).toBe(
      "/app/moves/move_123/load-plan#capacity-posture"
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
    expect(moveWorkspaceAnchorPath("move_123", "#create-move")).toBe(
      "/app/dashboard#create-move"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#create-move-packets")).toBe(
      "/app/dashboard#create-move-packets"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#household-setup")).toBe(
      "/app/dashboard#household-setup"
    );
    expect(moveWorkspaceAnchorPath("move_123", "#ai-connection")).toBe(
      "/app/dashboard#ai-connection"
    );
    expect(moveWorkspaceAnchorPath(null, "#inventory")).toBe("#inventory");
    expect(moveWorkspaceAnchorPath("move_123", "#custom-section")).toBe(
      "#custom-section"
    );
  });
});
