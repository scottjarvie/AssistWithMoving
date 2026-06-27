import { describe, expect, it } from "vitest";

import { isGlobalNavActive } from "../../src/lib/workspace-nav";
import { globalNavItems } from "../../src/lib/workspace-nav-items";

describe("global nav", () => {
  it("exposes exactly the five top-level destinations", () => {
    expect(globalNavItems.map((item) => item.label)).toEqual([
      "Moves",
      "Movable Units",
      "Items",
      "Spaces & Transport",
      "Queue",
    ]);
    expect(globalNavItems.map((item) => item.href)).toEqual([
      "/app/moves",
      "/app/movable-units",
      "/app/items",
      "/app/spaces-transport",
      "/app/queue",
    ]);
    // The long labels get a shorter form for the cramped mobile bottom bar.
    expect(
      globalNavItems.find((item) => item.href === "/app/movable-units")
        ?.shortLabel
    ).toBe("Units");
    expect(
      globalNavItems.find((item) => item.href === "/app/spaces-transport")
        ?.shortLabel
    ).toBe("Spaces");
  });

  it("lights up the matching section for exact and nested paths", () => {
    expect(isGlobalNavActive("/app/moves", "/app/moves")).toBe(true);
    expect(isGlobalNavActive("/app/moves/abc123", "/app/moves")).toBe(true);
    expect(
      isGlobalNavActive("/app/movable-units", "/app/movable-units")
    ).toBe(true);
    expect(isGlobalNavActive("/app/items", "/app/items")).toBe(true);
    expect(
      isGlobalNavActive("/app/spaces-transport", "/app/spaces-transport")
    ).toBe(true);
    expect(isGlobalNavActive("/app/queue", "/app/queue")).toBe(true);
  });

  it("does not cross-activate sibling sections", () => {
    expect(isGlobalNavActive("/app/movable-units", "/app/moves")).toBe(false);
    expect(isGlobalNavActive("/app/items", "/app/moves")).toBe(false);
    expect(isGlobalNavActive("/app/moves", "/app/movable-units")).toBe(false);
    // The per-move queue (/app/moves/x/queue) belongs to Moves, not Queue.
    expect(isGlobalNavActive("/app/moves/x/queue", "/app/queue")).toBe(false);
    expect(isGlobalNavActive("/app/queue", "/app/moves")).toBe(false);
  });
});
