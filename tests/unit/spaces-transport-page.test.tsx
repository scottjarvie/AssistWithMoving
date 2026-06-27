import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const mockData = vi.hoisted(() => ({
  queryResults: {} as Record<string, unknown>,
  mutation: vi.fn(),
  push: vi.fn(),
}));

// Any api.<ns>.<fn> resolves to the sentinel string "ns.fn" — so we don't have
// to enumerate every function the page (and the ItemDetailSheet it renders)
// touches. useQuery routes on that sentinel; unknown ones return undefined.
vi.mock("../../convex/_generated/api", () => {
  const makeNs = (ns: string) =>
    new Proxy({}, { get: (_t, prop) => `${ns}.${String(prop)}` });
  const api = new Proxy({}, { get: (_t, ns) => makeNs(String(ns)) });
  return { api };
});

vi.mock("convex/react", () => ({
  useQuery: (ref: string) => mockData.queryResults[ref],
  useMutation: () => mockData.mutation,
  useAction: () => vi.fn(async () => ({ url: null })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockData.push }),
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
        box: { _id: "box_1", code: "B-1", status: "open", room: "Kitchen", currentSpaceId: "space_1", estimatedWeightLb: 40 },
        itemCount: 2,
        weightSummary: { valueLb: 40 },
      },
      {
        box: { _id: "box_2", code: "B-2", status: "open", room: "Kitchen", currentSpaceId: "space_1" },
        itemCount: 1,
        weightSummary: null,
      },
    ],
    "items.listForMoveWithSignals": [
      { _id: "item_couch", name: "Couch", status: "active", disposition: "undecided", quantity: 1, assignedResourceId: "res_1", signals: { boxCount: 0 } },
      { _id: "item_sell", name: "Vintage lamp", status: "active", disposition: "sell", quantity: 1, signals: { boxCount: 0 } },
      { _id: "item_trash", name: "Broken chair", status: "active", disposition: "dump", quantity: 1, currentSpaceId: "space_1", signals: { boxCount: 0 } },
    ],
    "moveSpaces.listForMove": [
      { _id: "space_1", kind: "originRoom", name: "Kitchen", status: "active" },
    ],
    "transportResources.listForMoveWithZones": [
      { _id: "res_1", type: "truck", name: "26ft Truck", zones: [] },
    ],
    "estimates.reportForMove": {
      resourceReports: [
        { resourceId: "res_1", estimatedWeightLb: 0, estimatedVolumeCuFt: 0, maxWeightLb: 8000, maxVolumeCuFt: 1600, weightPercent: 0, volumePercent: 0 },
      ],
      zoneReports: [],
    },
    "photos.listForMove": [],
  };
}

describe("SpacesTransportPageContent (mobile-first)", () => {
  beforeEach(() => {
    seedData();
    mockData.mutation.mockReset();
    mockData.push.mockReset();
  });
  afterEach(() => cleanup());

  it("renders sections and only non-empty containers", () => {
    render(<SpacesTransportPageContent />);
    expect(
      screen.getByRole("heading", { name: "Spaces & Transport" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Spaces")).toBeInTheDocument();
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.getByText("By disposition")).toBeInTheDocument();
    // Kitchen is fullest (3) so it is the default container.
    expect(screen.getAllByText("Kitchen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("26ft Truck")).toBeInTheDocument();
    // "Trash" is both the bucket tile and the disposition badge on the chair.
    expect(screen.getAllByText("Trash").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sell")).toBeInTheDocument();
    // The empty "Give away" bucket is hidden behind the show-empty toggle.
    expect(screen.queryByText("Give away")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show \d+ empty/ })).toBeInTheDocument();
  });

  it("auto-selects the fullest container and lists its contents", () => {
    render(<SpacesTransportPageContent />);
    // Kitchen holds B-1, B-2, and the Broken chair.
    expect(screen.getByText("B-1 · 2 items · 40 lb")).toBeInTheDocument();
    expect(screen.getByText("Broken chair")).toBeInTheDocument();
  });

  it("switches contents when another container tile is tapped", async () => {
    const user = userEvent.setup();
    render(<SpacesTransportPageContent />);
    // The orphan "Vintage lamp" isn't in Kitchen, so it isn't shown yet.
    expect(screen.queryByText("Vintage lamp")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Sell/ }));
    expect(screen.getByText("Vintage lamp")).toBeInTheDocument();
  });

  it("opens a box via the router when a row is tapped (not in select mode)", async () => {
    const user = userEvent.setup();
    render(<SpacesTransportPageContent />);
    await user.click(screen.getByRole("button", { name: /B-1/ }));
    expect(mockData.push).toHaveBeenCalledTimes(1);
    expect(mockData.push.mock.calls[0][0]).toContain("/app/boxes/box_1");
  });

  it("select mode lets a whole-row tap drive a bulk space move", async () => {
    const user = userEvent.setup();
    mockData.mutation.mockResolvedValue({ succeeded: 1, failed: 0, results: [] });
    render(<SpacesTransportPageContent />);

    await user.click(screen.getByRole("button", { name: /Select/ }));
    // In select mode, tapping the row selects instead of opening.
    await user.click(screen.getByRole("button", { name: /B-1/ }));
    expect(mockData.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Space" }));
    await user.click(screen.getByRole("menuitem", { name: "Kitchen" }));

    expect(mockData.mutation).toHaveBeenCalledTimes(1);
    const arg = mockData.mutation.mock.calls[0][0];
    expect(arg.units).toEqual([{ kind: "box", recordId: "box_1" }]);
    expect(arg.target).toEqual({ currentSpaceId: "space_1" });
  });
});
