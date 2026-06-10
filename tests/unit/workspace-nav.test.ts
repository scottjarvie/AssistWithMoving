import { describe, expect, it } from "vitest";

import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "../../src/lib/workspace-nav";

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
  });
});
