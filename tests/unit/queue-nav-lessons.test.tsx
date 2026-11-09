import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fail: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/queue" }));
vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () => ({
    householdId: "synthetic-house",
    moveId: "synthetic-move",
  }),
}));
vi.mock("convex/react", () => ({
  useQuery: () => {
    if (state.fail) throw new Error("Optional badge unavailable");
    return { suggestions: 3, needsYou: 526 };
  },
}));
import { WorkspaceNav } from "@/components/workspace-nav";
afterEach(() => {
  state.fail = false;
  vi.restoreAllMocks();
});
describe("Queue badges fail soft", () => {
  it("uses all flagged items, including Answered, in the accent pill", () => {
    render(<WorkspaceNav countsEnabled />);
    expect(screen.getByLabelText("526 need your input")).toHaveTextContent(
      "526",
    );
    expect(screen.getByLabelText("3 AI suggestions")).toHaveTextContent("3");
  });
  it("keeps all navigation links usable if its badge query fails", () => {
    state.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<WorkspaceNav countsEnabled />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/app/queue",
    );
  });
});
