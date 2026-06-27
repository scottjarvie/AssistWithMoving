import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

// Mock the generated api so each query/mutation is a unique sentinel string we
// can route on inside the convex/react mock.
const apiMock = vi.hoisted(() => ({
  boxes: { listForMove: "boxes.listForMove" },
  items: {
    listForMoveWithSignals: "items.listForMoveWithSignals",
    batchUpdate: "items.batchUpdate",
  },
  moveSpaces: { listForMove: "moveSpaces.listForMove" },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
  estimates: { reportForMove: "estimates.reportForMove" },
  movableUnits: {
    batchPlaceInSpace: "movableUnits.batchPlaceInSpace",
    batchAssign: "movableUnits.batchAssign",
  },
}));

const mockData = vi.hoisted(() => ({
  queryResults: {} as Record<string, unknown>,
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({ api: apiMock }));

vi.mock("convex/react", () => ({
  useQuery: (ref: string) => mockData.queryResults[ref],
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
      loadingParticipantMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

import { SpacesTransportPageContent } from "@/components/spaces-transport-page";

function seedData() {
  mockData.queryResults = {
    "boxes.listForMove": [
      {
        box: {
          _id: "box_1",
          code: "B-1",
          status: "open",
          room: "Kitchen",
          currentSpaceId: "space_1",
          estimatedWeightLb: 40,
        },
        itemCount: 2,
        weightSummary: { valueLb: 40 },
      },
    ],
    "items.listForMoveWithSignals": [
      {
        _id: "item_sell",
        name: "Vintage lamp",
        status: "active",
        disposition: "sell",
        quantity: 1,
        signals: { boxCount: 0 },
      },
      {
        _id: "item_trash",
        name: "Broken chair",
        status: "active",
        disposition: "dump",
        quantity: 1,
        signals: { boxCount: 0 },
      },
    ],
    "moveSpaces.listForMove": [
      { _id: "space_1", kind: "originRoom", name: "Kitchen", status: "active" },
    ],
    "transportResources.listForMoveWithZones": [
      { _id: "res_1", type: "truck", name: "26ft Truck", zones: [] },
    ],
    "estimates.reportForMove": {
      resourceReports: [
        {
          resourceId: "res_1",
          estimatedWeightLb: 40,
          estimatedVolumeCuFt: 10,
          maxWeightLb: 8000,
          maxVolumeCuFt: 1600,
          weightPercent: 0.5,
          volumePercent: 0.6,
        },
      ],
      zoneReports: [],
    },
  };
}

describe("SpacesTransportPageContent", () => {
  beforeEach(() => {
    seedData();
    mockData.mutation.mockReset();
  });

  // Explicit cleanup so each render starts from an empty DOM (auto-cleanup is
  // unreliable in this file — duplicate-text matches otherwise leak across tests).
  afterEach(() => {
    cleanup();
  });

  it("renders the rail sections, spaces, transport, and disposition buckets", () => {
    render(<SpacesTransportPageContent />);

    expect(
      screen.getByRole("heading", { name: "Spaces & Transport" }),
    ).toBeInTheDocument();

    // Section headers
    expect(screen.getByText("Spaces")).toBeInTheDocument();
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.getByText("By disposition")).toBeInTheDocument();
    // "Needs a home" is both a section header and the orphan tile name.
    expect(screen.getAllByText("Needs a home").length).toBeGreaterThanOrEqual(1);

    // Containers. "Kitchen" is the default-selected container, so it appears
    // twice: once in the rail tile and once as the detail-panel header.
    expect(screen.getAllByText("Kitchen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("26ft Truck")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Sell")).toBeInTheDocument();
  });

  it("auto-selects the first non-empty container and shows its contents", () => {
    render(<SpacesTransportPageContent />);

    // Kitchen has box B-1 in it, so it is the first non-empty container shown.
    expect(screen.getByText("B-1")).toBeInTheDocument();
  });

  it("switches contents when a disposition bucket is clicked", async () => {
    const user = userEvent.setup();
    render(<SpacesTransportPageContent />);

    // Click the "Trash" container tile (a button in the rail).
    await user.click(screen.getByRole("button", { name: /Trash/ }));
    expect(screen.getByText("Broken chair")).toBeInTheDocument();
  });

  it("runs a bulk space placement mutation for the selected unit", async () => {
    const user = userEvent.setup();
    mockData.mutation.mockResolvedValue({ succeeded: 1, failed: 0, results: [] });
    render(<SpacesTransportPageContent />);

    // Select the box in Kitchen, then move it via the bulk bar dropdown.
    await user.click(
      screen.getByRole("checkbox", { name: /Select Box/ }),
    );
    await user.click(screen.getByRole("button", { name: /Move to space/ }));
    await user.click(screen.getByRole("menuitem", { name: "Kitchen" }));

    expect(mockData.mutation).toHaveBeenCalledTimes(1);
    const callArg = mockData.mutation.mock.calls[0][0];
    expect(callArg.units).toEqual([{ kind: "box", recordId: "box_1" }]);
    expect(callArg.target).toEqual({ currentSpaceId: "space_1" });
  });
});
