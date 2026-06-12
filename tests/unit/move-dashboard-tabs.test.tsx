import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
}));

const workspaceActions = vi.hoisted(() => ({
  selectHousehold: vi.fn(),
  selectMove: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("@/components/convex-auth-status", () => ({
  ConvexAuthStatus: () => <div>Auth status surface</div>,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: undefined,
      selectHousehold: workspaceActions.selectHousehold,
      households: [
        {
          household: {
            _id: "household_123" as Id<"households">,
            _creationTime: 1,
            name: "Jarvie household",
            createdAt: 1,
            updatedAt: 1,
            createdByUserId: "user_123" as Id<"users">,
            ownerUserId: "user_123" as Id<"users">,
          },
          role: "owner",
        },
      ],
      moves: [],
      activeMoves: [
        {
          _id: "move_123" as Id<"moves">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          title: "Summer move",
          type: "local",
          status: "planning",
          origin: "Old house",
          destination: "New house",
          unitSystem: "imperial",
          createdByUserId: "user_123" as Id<"users">,
          createdAt: 1,
          updatedAt: 1,
          documentationProfileTypes: ["personalFullRecord"],
        },
        {
          _id: "move_456" as Id<"moves">,
          _creationTime: 2,
          householdId: "household_123" as Id<"households">,
          title: "Fall move",
          type: "longDistance",
          status: "planning",
          origin: "Storage unit",
          destination: "Townhome",
          unitSystem: "imperial",
          createdByUserId: "user_123" as Id<"users">,
          createdAt: 2,
          updatedAt: 2,
          documentationProfileTypes: ["personalFullRecord", "movingCompany"],
        },
      ],
      selectMove: workspaceActions.selectMove,
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

import { MoveDashboard } from "@/components/move-dashboard";

describe("MoveDashboard", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/dashboard");
    workspaceActions.selectHousehold.mockReset();
    workspaceActions.selectMove.mockReset();
    mockRouter.push.mockReset();
  });

  it("opens on active moves before setup forms", () => {
    render(<MoveDashboard />);

    expect(screen.getByRole("tab", { name: "Moves" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByRole("tab", { name: "Create move" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Household" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "AI connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open the move you are working on before setup tasks."),
    ).toBeInTheDocument();
    const activeMoves = screen.getByRole("list", { name: "Active moves" });
    const activeMoveCard = within(activeMoves)
      .getByText("Summer move")
      .closest("[role='listitem']");
    expect(activeMoveCard).not.toBeNull();
    const activeMove = within(activeMoves).getByText("Summer move");
    const summary = screen.getByText("Workspace summary");
    expect(activeMove.compareDocumentPosition(summary)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(activeMoves).getAllByRole("link", { name: "Open workspace" })[0],
    ).toHaveAttribute("href", "/app/moves/move_123");
    expect(
      screen.getByRole("link", { name: "Open selected move" }),
    ).toHaveAttribute("href", "/app/moves/move_123");
    expect(
      within(activeMoveCard as HTMLElement).getByRole("link", {
        name: "Capture",
      }),
    ).toHaveAttribute("href", "/app/moves/move_123/capture");
    expect(
      within(activeMoveCard as HTMLElement).getByRole("link", {
        name: "Inventory",
      }),
    ).toHaveAttribute("href", "/app/moves/move_123/inventory");
    expect(
      within(activeMoveCard as HTMLElement).getByRole("link", {
        name: "Photos",
      }),
    ).toHaveAttribute("href", "/app/moves/move_123/photos");
    expect(
      within(activeMoveCard as HTMLElement).getByRole("link", {
        name: "Boxes",
      }),
    ).toHaveAttribute("href", "/app/moves/move_123/boxes");
    expect(
      within(activeMoves).getByRole("button", { name: "Selected" }),
    ).toBeDisabled();
    expect(
      within(activeMoves).getByRole("button", { name: "Select move" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Move title")).not.toBeInTheDocument();
  });

  it("lets the dashboard select a different active move", async () => {
    const user = userEvent.setup();

    render(<MoveDashboard />);

    const activeMoves = screen.getByRole("list", { name: "Active moves" });
    const fallMoveCard = within(activeMoves)
      .getByText("Fall move")
      .closest("[role='listitem']");

    expect(fallMoveCard).not.toBeNull();
    await user.click(
      within(fallMoveCard as HTMLElement).getByRole("button", {
        name: "Select move",
      }),
    );

    expect(workspaceActions.selectMove).toHaveBeenCalledWith("move_456");
  });

  it("keeps create-move basics, PCS fields, and packets in separate tasks", async () => {
    const user = userEvent.setup();

    render(<MoveDashboard />);

    await user.click(screen.getByRole("tab", { name: "Create move" }));

    expect(
      screen.getByText("Start a new move without hiding your active move list."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Basics" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByLabelText("Move title")).toBeInTheDocument();
    expect(screen.getByLabelText("Move template")).toBeInTheDocument();
    expect(
      screen.queryByText("Documentation profiles"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Military branch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Packets" }));
    expect(screen.getByText("Documentation profiles")).toBeInTheDocument();
    expect(screen.queryByLabelText("Move title")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "PCS details" }));
    expect(
      screen.getByText(/Choose the Military PCS template/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Military branch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Basics" }));
    await user.selectOptions(screen.getByLabelText("Move template"), "pcs");
    await user.click(screen.getByRole("tab", { name: "PCS details" }));
    expect(screen.getByLabelText("Military branch")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Official weight allowance in pounds"),
    ).toBeInTheDocument();
  });

  it("opens create-move packets when routed to the packets hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/dashboard#create-move-packets",
    );

    render(<MoveDashboard />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Create move" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(screen.getByRole("tab", { name: "Packets" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText("Start a new move without hiding your active move list."),
    ).toBeInTheDocument();
    expect(screen.getByText("Documentation profiles")).toBeInTheDocument();
    expect(screen.queryByLabelText("Move title")).not.toBeInTheDocument();
    expect(screen.queryByText("Summer move")).not.toBeInTheDocument();
  });

  it("opens household setup when routed to the household hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/dashboard#household-setup",
    );

    render(<MoveDashboard />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Household" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByText(
        "Manage the household permission boundary for these moves.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Selected household")).toBeInTheDocument();
    expect(screen.getByLabelText("Household name")).toBeInTheDocument();
    expect(screen.queryByText("Summer move")).not.toBeInTheDocument();
  });

  it("opens AI connection setup when routed to the AI hash", async () => {
    window.history.replaceState(null, "", "/app/dashboard#ai-connection");

    render(<MoveDashboard />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "AI connection" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByText("Create assistant access only when an AI needs to help."),
    ).toBeInTheDocument();
    expect(screen.getByText("Do you need an AI connection?")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up AI connection" }),
    ).toHaveAttribute("href", "/settings/ai-connections");
    expect(screen.queryByText("Summer move")).not.toBeInTheDocument();
  });
});
