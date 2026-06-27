import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    get: "boxes.get",
    update: "boxes.update",
  },
  items: {
    update: "items.update",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
  moveSpaces: {
    listForMove: "moveSpaces.listForMove",
  },
  photos: {
    listForMove: "photos.listForMove",
    getDisplayUrl: "photos.getDisplayUrl",
  },
}));

const lookupData = vi.hoisted(() => ({
  mutations: {
    updateBox: vi.fn(),
  },
  boxRecord: {
    box: {
      _id: "box_12" as Id<"boxes">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      code: "B-012",
      label: "Garage rough box",
      room: "Garage",
      destinationRoom: "Workshop",
      description: "Rough garage contents",
      status: "open",
      assignmentLocked: false,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"boxes">,
    contents: [
      {
        membership: {
          _id: "boxItem_1" as Id<"boxItems">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          boxId: "box_12" as Id<"boxes">,
          itemId: "item_1" as Id<"items">,
          quantity: 2,
          createdAt: 1,
          updatedAt: 1,
        } as Doc<"boxItems">,
        item: {
          _id: "item_1" as Id<"items">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          name: "Socket set",
          code: "item-0001",
          status: "packed",
          disposition: "mover",
          planningDefaultKeys: [],
          quantity: 2,
          highValue: false,
          fragile: false,
          hazardousFlag: false,
          requiresPersonalTransport: false,
          needsReview: false,
          createdAt: 1,
          updatedAt: 1,
        } as unknown as Doc<"items">,
      },
    ],
    itemCount: 2,
    weightSummary: {
      valueLb: 12,
      label: "contents-derived",
      source: "contents",
    },
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) =>
    mutation === apiMock.boxes.update ? lookupData.mutations.updateBox : vi.fn(),
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.boxes.get:
        return lookupData.boxRecord;
      case apiMock.transportResources.listForMoveWithZones:
        return [];
      case apiMock.moveSpaces.listForMove:
        return [];
      case apiMock.photos.listForMove:
        return [];
      default:
        return undefined;
    }
  },
  useAction: () => vi.fn().mockResolvedValue({ url: "" }),
}));

// The capture/ingress flow is exercised separately; here we just confirm the
// unit detail page opens it pre-targeted to this box.
vi.mock("@/components/ingestion-capture-form", () => ({
  IngestionCaptureForm: (props: { targetBoxCode?: string }) => (
    <div>Capture form targeting {props.targetBoxCode}</div>
  ),
}));

import {
  BoxLookup,
  buildOpenBoxAssistantPrompt,
} from "@/components/box-lookup";

function renderBoxLookup() {
  return render(
    <BoxLookup
      householdId="household_123"
      moveId="move_123"
      boxId="box_12"
      returnTo="load-plan"
    />,
  );
}

describe("BoxLookup", () => {
  beforeEach(() => {
    lookupData.mutations.updateBox.mockReset();
  });

  it("builds an assistant handoff that targets the existing rough box", () => {
    const prompt = buildOpenBoxAssistantPrompt({
      boxCode: "B-012",
      boxId: "box_12" as Id<"boxes">,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      room: "Garage",
      destinationRoom: "Workshop",
    });
    expect(prompt).toContain("Use existing box B-012 with boxId box_12");
    expect(prompt).toContain("Do not create a replacement box");
  });

  it("renders only the six essentials by default", () => {
    renderBoxLookup();

    // 2: unit code, 3: nickname/name, 4: size, 5: placement, 6: items.
    expect(screen.getByText("B-012")).toBeInTheDocument();
    expect(screen.getByText("Garage rough box")).toBeInTheDocument();
    expect(screen.getByText("12 lb")).toBeInTheDocument();
    expect(screen.getByText("Origination")).toBeInTheDocument();
    expect(screen.getByText("Garage")).toBeInTheDocument();
    expect(screen.getByText("Workshop")).toBeInTheDocument();
    expect(screen.getByText("Present location")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("Needs load assignment")).toBeInTheDocument();
    // Item name has its own line; code + qty render together beneath it (MOVE-340).
    expect(screen.getByRole("button", { name: "Edit name: Socket set" })).toBeInTheDocument();
    expect(screen.getByText(/item-0001/)).toBeInTheDocument();

    // The removed clutter must be gone.
    expect(screen.queryByText("Open-box checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Box estimates")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Paste this into your assistant"),
    ).not.toBeInTheDocument();
  });

  it("reveals the size editor only after clicking size, then saves", async () => {
    const user = userEvent.setup();
    lookupData.mutations.updateBox.mockResolvedValue(undefined);
    renderBoxLookup();

    // No editor by default.
    expect(screen.queryByLabelText("Weight (lb)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /12 lb/ }));

    const weight = screen.getByLabelText("Weight (lb)");
    await user.clear(weight);
    await user.type(weight, "20");
    await user.click(screen.getByRole("button", { name: "Save weight & size" }));

    await waitFor(() => {
      expect(lookupData.mutations.updateBox).toHaveBeenCalledWith(
        expect.objectContaining({
          boxId: "box_12",
          estimatedWeightLb: 20,
        }),
      );
    });
  });

  it("opens the capture flow pre-targeted to the unit from the items Add button", async () => {
    const user = userEvent.setup();
    renderBoxLookup();

    expect(
      screen.queryByText("Capture form targeting B-012"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Capture form targeting B-012"),
    ).toBeInTheDocument();
  });

  it("reveals the placement editor only after clicking, then saves", async () => {
    const user = userEvent.setup();
    lookupData.mutations.updateBox.mockResolvedValue(undefined);
    renderBoxLookup();

    // Read-only by default — no editor fields.
    expect(screen.queryByLabelText("Origination")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Origination/ }));

    const origination = screen.getByLabelText("Origination");
    await user.clear(origination);
    await user.type(origination, "Kitchen");
    // Present location is now a single grouped picker (a space OR a transport);
    // the separate "Transport" control was merged into it as an optgroup.
    const presentLocation = screen.getByLabelText("Present location");
    expect(presentLocation).toBeInTheDocument();
    expect(presentLocation.querySelector('optgroup[label="Transportation"]')).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save placement" }));

    await waitFor(() => {
      expect(lookupData.mutations.updateBox).toHaveBeenCalledWith(
        expect.objectContaining({
          boxId: "box_12",
          room: "Kitchen",
          destinationRoom: "Workshop",
          clearAssignedResource: true,
        }),
      );
    });
  });

  it("renames the unit and edits its description", async () => {
    const user = userEvent.setup();
    lookupData.mutations.updateBox.mockResolvedValue(undefined);
    renderBoxLookup();

    await user.click(screen.getByRole("button", { name: /Rename \/ edit/ }));

    const name = screen.getByLabelText("Unit name");
    await user.type(name, "Garage tools");
    const description = screen.getByLabelText("Unit description");
    await user.clear(description);
    await user.type(description, "Sockets and wrenches");
    await user.click(
      screen.getByRole("button", { name: "Save name & description" }),
    );

    await waitFor(() => {
      expect(lookupData.mutations.updateBox).toHaveBeenCalledWith(
        expect.objectContaining({
          boxId: "box_12",
          nickname: "Garage tools",
          description: "Sockets and wrenches",
        }),
      );
    });
  });

  it("shows a compact empty state when the unit has no items", () => {
    const originalContents = lookupData.boxRecord.contents;
    const originalCount = lookupData.boxRecord.itemCount;
    lookupData.boxRecord.contents = [];
    lookupData.boxRecord.itemCount = 0;
    try {
      renderBoxLookup();
      expect(
        screen.getByText(/No items yet — use Add to capture items into B-012/),
      ).toBeInTheDocument();
    } finally {
      lookupData.boxRecord.contents = originalContents;
      lookupData.boxRecord.itemCount = originalCount;
    }
  });
});
