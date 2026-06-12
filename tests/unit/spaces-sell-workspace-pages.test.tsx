import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const mockData = vi.hoisted(() => ({
  queryResult: [] as unknown,
  mutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mockData.queryResult,
  useMutation: () => mockData.mutation,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: undefined,
      selectHousehold: vi.fn(),
      households: [],
      moves: [],
      activeMoves: [],
      selectMove: vi.fn(),
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

vi.mock("@/components/move-workspace-header", () => ({
  MoveWorkspaceHeader: ({ title }: { title: string }) => (
    <header>{title}</header>
  ),
}));

import { SellWorkspacePage } from "@/components/move-pages/sell-page";
import { SpacesWorkspacePage } from "@/components/move-pages/spaces-page";

describe("SpacesWorkspacePage", () => {
  beforeEach(() => {
    mockData.queryResult = [];
    mockData.mutation.mockReset();
  });

  it("opens on existing spaces before the add-space setup form", () => {
    mockData.queryResult = [
      {
        _id: "space_1",
        kind: "originRoom",
        name: "Kitchen",
        status: "active",
        floorLevel: "1",
        notes:
          "Long room notes should wrap inside the card instead of stretching the page.",
        photoCount: 2,
        transportResourceId: undefined,
        transportZoneId: undefined,
      },
    ];

    render(<SpacesWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Spaces" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Add space" })).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Origin room: 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Space name")).not.toBeInTheDocument();
  });
});

describe("SellWorkspacePage", () => {
  beforeEach(() => {
    mockData.queryResult = [];
    mockData.mutation.mockReset();
  });

  it("filters the sale pipeline from the metric strip", () => {
    mockData.queryResult = [
      {
        item: {
          _id: "item_1",
          name: "Oak bookcase",
          room: "Den",
          category: "Furniture",
          condition: "good",
          description: "Tall shelf with adjustable pegs.",
        },
        listing: { status: "draftReady" },
        status: "draftReady",
        photoCount: 1,
        needsMorePhotos: true,
        researchDepth: "none",
        researchSourceCount: 0,
      },
      {
        item: {
          _id: "item_2",
          name: "Vintage lamp",
          room: "Living room",
          category: "Decor",
          condition: "excellent",
          description: "Brass lamp with shade.",
        },
        listing: { status: "listed" },
        status: "listed",
        photoCount: 4,
        needsMorePhotos: false,
        researchDepth: "standard",
        researchSourceCount: 3,
      },
    ];

    render(<SellWorkspacePage />);

    expect(screen.getByRole("button", { name: /All 2/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Oak bookcase")).toBeInTheDocument();
    expect(screen.getByText("Vintage lamp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Needs photos 1/i }));

    expect(screen.getByRole("button", { name: /Needs photos 1/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Oak bookcase")).toBeInTheDocument();
    expect(screen.queryByText("Vintage lamp")).not.toBeInTheDocument();
  });
});
