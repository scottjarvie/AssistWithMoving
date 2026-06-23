import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    addItem: "boxes.addItem",
    create: "boxes.create",
    listForMove: "boxes.listForMove",
    removeItem: "boxes.removeItem",
    update: "boxes.update",
  },
  items: {
    create: "items.create",
    listForMove: "items.listForMove",
  },
  photos: {
    updateEvidence: "photos.updateEvidence",
  },
  moveSpaces: {
    listForMove: "moveSpaces.listForMove",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
}));

const boxData = vi.hoisted(() => ({
  queryCall: 0,
  mutations: {
    addItem: vi.fn(),
    createBox: vi.fn(),
    createItem: vi.fn(),
    removeItem: vi.fn(),
    updatePhoto: vi.fn(),
    updateBox: vi.fn(),
  },
  boxes: [
    {
      box: {
        _id: "box_1" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "B-001",
        label: "Garage tools",
        room: "Garage",
        destinationRoom: "Storage",
        description: "Hand tools and small parts",
        status: "sealed",
        estimatedVolumeCuFt: 4,
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
            boxId: "box_1" as Id<"boxes">,
            itemId: "item_1" as Id<"items">,
            quantity: 1,
            createdAt: 1,
            updatedAt: 1,
          } as Doc<"boxItems">,
          item: {
            _id: "item_1" as Id<"items">,
            _creationTime: 1,
            householdId: "household_123" as Id<"households">,
            moveId: "move_123" as Id<"moves">,
            name: "Socket set",
            status: "packed",
            category: "Tools",
            disposition: "mover",
            planningDefaultKeys: [],
            quantity: 1,
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
      itemCount: 1,
      weightSummary: {
        valueLb: 12,
        label: "contents-derived",
        source: "contents",
      },
    },
    {
      box: {
        _id: "box_2" as Id<"boxes">,
        _creationTime: 2,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "B-002",
        label: "Bedroom linens",
        room: "Bedroom",
        destinationRoom: "Guest room",
        description: "Sheets and towels",
        status: "sealed",
        estimatedVolumeCuFt: 3,
        assignmentLocked: false,
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 2,
        updatedAt: 2,
      } as unknown as Doc<"boxes">,
      contents: [],
      itemCount: 0,
      weightSummary: {
        label: "missing",
        source: "missing",
      },
    },
  ],
  items: [
    {
      _id: "item_1" as Id<"items">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Socket set",
      status: "packed",
      category: "Tools",
      disposition: "mover",
      planningDefaultKeys: [],
      quantity: 1,
      highValue: false,
      fragile: false,
      hazardousFlag: false,
      requiresPersonalTransport: false,
      needsReview: false,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"items">,
  ],
  resources: [],
  spaces: [
    {
      _id: "space_storage" as Id<"moveSpaces">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      kind: "storage",
      name: "Storage",
      floorLevel: "Garage",
      status: "active",
      aliases: [],
      photoCount: 0,
      createdByUserId: "user_123" as Id<"users">,
      updatedByUserId: "user_123" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) => {
    switch (mutation) {
      case apiMock.boxes.addItem:
        return boxData.mutations.addItem;
      case apiMock.boxes.create:
        return boxData.mutations.createBox;
      case apiMock.boxes.removeItem:
        return boxData.mutations.removeItem;
      case apiMock.boxes.update:
        return boxData.mutations.updateBox;
      case apiMock.items.create:
        return boxData.mutations.createItem;
      case apiMock.photos.updateEvidence:
        return boxData.mutations.updatePhoto;
      default:
        return vi.fn();
    }
  },
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.boxes.listForMove:
        return boxData.boxes;
      case apiMock.items.listForMove:
        return boxData.items;
      case apiMock.transportResources.listForMoveWithZones:
        return boxData.resources;
      case apiMock.moveSpaces.listForMove:
        return boxData.spaces;
      default:
        return undefined;
    }
  },
}));

vi.mock("@/components/photo-upload-control", () => ({
  PhotoUploadControl: (props: {
    label?: string;
    uploadDisabled?: boolean;
    uploadDisabledMessage?: string;
    onUploaded?: (photo: { photoId: Id<"itemPhotos"> }) => void;
  }) => (
    <div>
      <p>Photo upload control</p>
      {props.label ? <p>{props.label}</p> : null}
      {props.uploadDisabled && props.uploadDisabledMessage ? (
        <p>{props.uploadDisabledMessage}</p>
      ) : null}
      <button
        type="button"
        disabled={props.uploadDisabled}
        aria-label={`Simulate ${props.label ?? "photo upload"}`}
        onClick={() =>
          props.onUploaded?.({
            photoId: "photo_uploaded" as Id<"itemPhotos">,
          })
        }
      >
        Simulate upload
      </button>
    </div>
  ),
}));

vi.mock("@/components/photo-evidence-strip", () => ({
  PhotoEvidenceStrip: () => <div>Photo evidence strip</div>,
}));

import { BoxManager } from "@/components/box-manager";

describe("BoxManager", () => {
  beforeEach(() => {
    boxData.queryCall = 0;
    boxData.mutations.addItem.mockReset();
    boxData.mutations.createBox.mockReset();
    boxData.mutations.createItem.mockReset();
    boxData.mutations.removeItem.mockReset();
    boxData.mutations.updatePhoto.mockReset();
    boxData.mutations.updateBox.mockReset();
    window.history.replaceState(null, "", "/app/moves/move_123/boxes");
  });

  it("opens on box records and keeps per-box work in task tabs", async () => {
    const user = userEvent.setup();

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByRole("tab", { name: "Boxes" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Scan existing boxes before opening contents, details, photos, or labels.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Box actions")).toBeInTheDocument();
    expect(screen.getByText("2 shown / 2 total")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search boxes"), "Garage");
    expect(screen.getByText("1 shown / 2 total")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("2 shown / 2 total")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add box" }));
    expect(screen.getByRole("tab", { name: "Add box" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByRole("form", { name: "Create box" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New box destination location")).toHaveValue(
      "",
    );

    await user.click(screen.getByRole("tab", { name: "Boxes" }));
    await user.click(screen.getByRole("button", { name: "Labels" }));
    expect(screen.getByRole("tab", { name: "Labels" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByRole("list", { name: "Box labels" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Boxes" }));
    const boxList = screen.getByRole("list", { name: "Box records" });
    expect(within(boxList).getByText("B-001")).toBeInTheDocument();
    expect(within(boxList).getByText("B-002")).toBeInTheDocument();
    expect(within(boxList).getByText("Garage tools")).toBeInTheDocument();
    expect(within(boxList).getByText("Socket set x1")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Create box" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(
      within(boxList).getByRole("button", { name: "Details for B-001" }),
    );
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Choose one box, then edit label, room, weight, volume, and notes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Box label")).toBeInTheDocument();
    expect(screen.getByLabelText("Box destination location")).toBeInTheDocument();
    expect(screen.queryByText("B-002")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change box" }));
    expect(screen.queryByText("Focused on B-001")).not.toBeInTheDocument();
    expect(screen.getByText("Pick a box for details")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit details for B-002" }),
    ).toBeInTheDocument();
    expect(screen.getByText("B-002")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add box" }));
    expect(
      screen.getByText(
        "Create a new code, label, and room target without crowding the box list.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Create box" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Contents" }));
    expect(screen.getByText("Pick a box for contents")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    );
    expect(screen.getAllByText("Socket set").length).toBeGreaterThan(0);
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Item to add to box")).toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();
    expect(screen.getByText("Photo upload control")).toBeInTheDocument();
    expect(screen.getByText("Photo for new item in B-001")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Box label")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Estimated box weight in pounds"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Photos" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByText("Photo upload control")).toBeInTheDocument();
    expect(screen.getByText("Photo evidence strip")).toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Load" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assigned transport resource"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assignment override reason"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Labels" }));
    const labelCards = screen.getByRole("list", { name: "Box labels" });
    expect(within(labelCards).getByText("B-001")).toBeInTheDocument();
    expect(within(labelCards).getByText("Garage tools")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Code" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Storage").length).toBeGreaterThan(0);
  }, 10000);

  it("creates a new item directly inside the focused box", async () => {
    const user = userEvent.setup();
    boxData.mutations.createItem.mockResolvedValueOnce(
      "item_created" as Id<"items">,
    );
    boxData.mutations.addItem.mockResolvedValueOnce(undefined);

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Contents" }));
    await user.click(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    );

    const createInsideForm = screen.getByRole("form", {
      name: "Create item inside B-001",
    });
    await user.type(
      within(createInsideForm).getByLabelText("New item name inside B-001"),
      "Tape dispenser",
    );
    await user.clear(
      within(createInsideForm).getByLabelText("New item quantity inside B-001"),
    );
    await user.type(
      within(createInsideForm).getByLabelText(
        "New item quantity inside B-001",
      ),
      "2",
    );
    await user.type(
      within(createInsideForm).getByLabelText(
        "New item category inside B-001",
      ),
      "Packing",
    );
    await user.type(
      within(createInsideForm).getByLabelText("New item notes inside B-001"),
      "Found after opening the box.",
    );
    await user.click(within(createInsideForm).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(boxData.mutations.createItem).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        name: "Tape dispenser",
        room: "Garage",
        destinationRoom: "Storage",
        category: "Packing",
        description: "Found after opening the box.",
        disposition: "mover",
        status: "packed",
        quantity: 2,
        needsReview: true,
        reviewFlags: ["boxContentsReview"],
        aiTags: ["box-content-capture"],
        createdVia: "manual",
      }),
    );
    expect(boxData.mutations.addItem).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_1",
      itemId: "item_created",
      quantity: 2,
    });
    expect(
      await screen.findByText("Tape dispenser created inside B-001."),
    ).toBeInTheDocument();
    expect(
      within(createInsideForm).getByLabelText("New item name inside B-001"),
    ).toHaveValue("");
    expect(
      within(createInsideForm).getByLabelText("New item quantity inside B-001"),
    ).toHaveValue("1");
  });

  it("creates a boxed item from a photo and attaches the uploaded photo", async () => {
    const user = userEvent.setup();
    boxData.mutations.createItem.mockResolvedValueOnce(
      "photo_item_created" as Id<"items">,
    );
    boxData.mutations.addItem.mockResolvedValueOnce(undefined);
    boxData.mutations.updatePhoto.mockResolvedValueOnce(undefined);

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Contents" }));
    await user.click(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    );

    expect(
      screen.getByText("Enter an item name before uploading the photo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Simulate Photo for new item in B-001",
      }),
    ).toBeDisabled();

    await user.type(
      screen.getByLabelText("Photo item name inside B-001"),
      "Loose drill bits",
    );
    await user.clear(screen.getByLabelText("Photo item quantity inside B-001"));
    await user.type(
      screen.getByLabelText("Photo item quantity inside B-001"),
      "3",
    );
    await user.type(
      screen.getByLabelText("Photo item category inside B-001"),
      "Tools",
    );
    await user.type(
      screen.getByLabelText("Photo item notes inside B-001"),
      "Three small bins visible in the photo.",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Simulate Photo for new item in B-001",
      }),
    );

    await waitFor(() =>
      expect(boxData.mutations.createItem).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        name: "Loose drill bits",
        room: "Garage",
        destinationRoom: "Storage",
        category: "Tools",
        description: "Three small bins visible in the photo.",
        disposition: "mover",
        status: "packed",
        quantity: 3,
        needsReview: true,
        reviewFlags: ["boxContentsReview", "photoEvidenceReview"],
        aiTags: ["box-content-capture", "photo-created-item"],
        createdVia: "manual",
      }),
    );
    expect(boxData.mutations.addItem).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_1",
      itemId: "photo_item_created",
      quantity: 3,
    });
    expect(boxData.mutations.updatePhoto).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      photoId: "photo_uploaded",
      itemId: "photo_item_created",
      boxId: "box_1",
      room: "Garage",
      caption: "Loose drill bits",
      photoType: "item",
      notes: "Three small bins visible in the photo.",
    });
    expect(
      await screen.findByText("Loose drill bits created from photo inside B-001."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Photo item name inside B-001")).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Photo item quantity inside B-001")).toHaveValue(
      "1",
    );
  });

  it("opens label workflow when routed to the box labels hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/boxes#box-labels",
    );

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Labels" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByRole("list", { name: "Box labels" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Box records" }),
    ).not.toBeInTheDocument();
  });

  it("opens load workflow when routed to the box load hash", async () => {
    const user = userEvent.setup();

    window.history.replaceState(null, "", "/app/moves/move_123/boxes#box-load");

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Load" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByText("Pick a box for load assignment"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Assign load for B-001" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Box records" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assign load for B-001" }),
    );
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assigned transport resource"),
    ).toBeInTheDocument();
  });
});
