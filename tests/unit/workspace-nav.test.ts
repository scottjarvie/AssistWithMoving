import { describe, expect, it } from "vitest";

import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "../../src/lib/workspace-nav";
import { workspaceNavItems } from "../../src/lib/workspace-nav-items";

describe("workspace nav links", () => {
  it("uses dashboard links outside a specific move workspace", () => {
    expect(workspaceBasePathFromPathname("/app/dashboard")).toBe("/app/dashboard");
    // No move selected means there is no section page to open yet.
    expect(workspaceNavHref("/settings", "inventory")).toBe("/app/dashboard");
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
    expect(workspaceNavHref("/app/moves/move_123/photos", "floorplans")).toBe(
      "/app/moves/move_123/floorplans"
    );
  });

  it("hides Floorplans navigation when the flag is off or unresolved", () => {
    expect(workspaceNavItems(undefined).map((item) => item.label)).not.toContain(
      "Floorplans"
    );
    expect(
      workspaceNavItems([
        {
          key: "layoutStudio",
          label: "Layout Studio",
          description: "Experimental planner",
          environment: "production",
          enabled: false,
          source: "default",
        },
      ]).map((item) => item.label)
    ).not.toContain("Floorplans");
  });

  it("shows Floorplans navigation near planning tools when the flag is on", () => {
    const labels = workspaceNavItems([
      {
        key: "layoutStudio",
        label: "Layout Studio",
        description: "Experimental planner",
        environment: "development",
        enabled: true,
        source: "default",
      },
    ]).map((item) => item.label);

    expect(labels).toContain("Floorplans");
    expect(labels.indexOf("Floorplans")).toBeGreaterThan(labels.indexOf("Photos"));
    expect(labels.indexOf("Floorplans")).toBeLessThan(labels.indexOf("Load Plan"));
  });
});
