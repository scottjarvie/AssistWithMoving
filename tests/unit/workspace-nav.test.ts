import { describe, expect, it } from "vitest";

import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "../../src/lib/workspace-nav";

describe("workspace nav links", () => {
  it("uses dashboard links outside a specific move workspace", () => {
    expect(workspaceBasePathFromPathname("/app/dashboard")).toBe("/app/dashboard");
    expect(workspaceNavHref("/settings", "inventory")).toBe(
      "/app/dashboard#inventory"
    );
  });

  it("preserves the active move workspace path", () => {
    expect(workspaceBasePathFromPathname("/app/moves/move_123")).toBe(
      "/app/moves/move_123"
    );
    expect(workspaceNavHref("/app/moves/move_123", "move-day")).toBe(
      "/app/moves/move_123#move-day"
    );
  });
});
