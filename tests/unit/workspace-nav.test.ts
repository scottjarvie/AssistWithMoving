import { describe, expect, it } from "vitest";

import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "../../src/lib/workspace-nav";
import {
  primaryNavItems,
  workspaceNavChildren,
  workspaceNavGroups,
} from "../../src/lib/workspace-nav-items";
import type { EffectiveFeatureFlag } from "../../src/lib/feature-flags";

function layoutStudioFlag(enabled: boolean): EffectiveFeatureFlag {
  return {
    key: "layoutStudio",
    label: "Layout Studio",
    description: "Experimental planner",
    environment: enabled ? "development" : "production",
    enabled,
    source: "default",
  };
}

describe("workspace nav links", () => {
  it("routes section links to move setup outside a specific move workspace", () => {
    expect(workspaceBasePathFromPathname("/app/dashboard")).toBe("/app/dashboard");
    expect(workspaceNavHref("/settings")).toBe("/app/dashboard");
    // No move selected means there is no section page to open yet, so route
    // people to the task that unlocks move-specific pages.
    expect(workspaceNavHref("/settings", "inventory")).toBe(
      "/app/dashboard#create-move"
    );
  });

  it("links sections as real pages inside a move workspace", () => {
    expect(workspaceBasePathFromPathname("/app/moves/move_123")).toBe(
      "/app/moves/move_123"
    );
    expect(workspaceNavHref("/app/moves/move_123", "move-day")).toBe(
      "/app/moves/move_123/move-day"
    );
    expect(workspaceNavHref("/app/moves/move_123/inventory", "boxes")).toBe(
      "/app/moves/move_123/boxes"
    );
  });

  it("opens a specific tab when a section link carries a hash", () => {
    expect(
      workspaceNavHref("/app/moves/move_123/inventory", "capture", "ingestion-queue")
    ).toBe("/app/moves/move_123/capture#ingestion-queue");
    // The Queue focus item resolves to the capture page's queue tab.
    const queue = primaryNavItems.find((item) => item.key === "queue");
    expect(queue?.section).toBe("capture");
    expect(queue?.hash).toBe("ingestion-queue");
  });

  it("keeps the four focus destinations as the primary menu", () => {
    expect(primaryNavItems.map((item) => item.key)).toEqual([
      "home",
      "items",
      "boxes",
      "queue",
    ]);
  });

  it("nests Floorplans under Boxes only when the layoutStudio flag is on", () => {
    expect(
      workspaceNavChildren("boxes", undefined).map((item) => item.key)
    ).not.toContain("floorplans");
    expect(
      workspaceNavChildren("boxes", [layoutStudioFlag(false)]).map(
        (item) => item.key
      )
    ).not.toContain("floorplans");
    expect(
      workspaceNavChildren("boxes", [layoutStudioFlag(true)]).map(
        (item) => item.key
      )
    ).toContain("floorplans");
  });

  it("groups secondary screens under their focus parent", () => {
    const groups = workspaceNavGroups(undefined);
    const items = groups.find((group) => group.primary.key === "items");
    expect(items?.children.map((child) => child.key)).toEqual([
      "spaces",
      "photos",
      "sell",
    ]);
    const queue = groups.find((group) => group.primary.key === "queue");
    expect(queue?.children.map((child) => child.key)).toContain("aiReview");
  });
});
