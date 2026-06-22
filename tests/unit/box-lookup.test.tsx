import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    addItem: "boxes.addItem",
    get: "boxes.get",
    update: "boxes.update",
  },
  ingestionQueue: {
    createEntry: "ingestionQueue.createEntry",
  },
  items: {
    create: "items.create",
  },
  photos: {
    updateEvidence: "photos.updateEvidence",
  },
}));

const lookupData = vi.hoisted(() => ({
  mutations: {
    addItem: vi.fn(),
    createQueueEntry: vi.fn(),
    createItem: vi.fn(),
    updateBox: vi.fn(),
    updatePhoto: vi.fn(),
  },
  uploadIndex: 0,
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
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) => {
    switch (mutation) {
      case apiMock.boxes.addItem:
        return lookupData.mutations.addItem;
      case apiMock.boxes.update:
        return lookupData.mutations.updateBox;
      case apiMock.ingestionQueue.createEntry:
        return lookupData.mutations.createQueueEntry;
      case apiMock.items.create:
        return lookupData.mutations.createItem;
      case apiMock.photos.updateEvidence:
        return lookupData.mutations.updatePhoto;
      default:
        return vi.fn();
    }
  },
  useQuery: (query: string) => {
    if (query === apiMock.boxes.get) {
      return lookupData.boxRecord;
    }
    return undefined;
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
            photoId:
              `photo_uploaded_${++lookupData.uploadIndex}` as Id<"itemPhotos">,
          })
        }
      >
        Simulate upload
      </button>
    </div>
  ),
}));

import {
  BoxLookup,
  buildOpenBoxAssistantPrompt,
} from "@/components/box-lookup";

describe("BoxLookup", () => {
  beforeEach(() => {
    lookupData.mutations.addItem.mockReset();
    lookupData.mutations.createQueueEntry.mockReset();
    lookupData.mutations.createItem.mockReset();
    lookupData.mutations.updateBox.mockReset();
    lookupData.mutations.updatePhoto.mockReset();
    lookupData.uploadIndex = 0;
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

    expect(prompt).toContain(
      "help me itemize this existing rough box",
    );
    expect(prompt).toContain("Use existing box B-012 with boxId box_12");
    expect(prompt).toContain("Do not create a replacement box");
    expect(prompt).toContain("Household context: household_123");
    expect(prompt).toContain("Move context: move_123");
    expect(prompt).toContain("Origin room hint: Garage");
    expect(prompt).toContain("Destination room hint: Workshop");
    expect(prompt).toContain("add_box_item_from_photo");
    expect(prompt).toContain("batch_add_box_contents");
    expect(prompt).toContain("keep the queue tied to this boxId");
    expect(prompt).toContain("verify with get_move_summary");
  });

  it("keeps load-plan handoffs oriented around the existing rough box", () => {
    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
        returnTo="load-plan"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Open box" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Everything you add here stays packed in B-012/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load plan" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/load-plan#load-plan",
    );
    expect(screen.getByRole("link", { name: "Boxes" })).toHaveAttribute(
      "href",
      "/app/movable-units",
    );
    expect(
      screen.getByText(/This is the existing rough box from the load plan/),
    ).toBeInTheDocument();
    const progress = screen.getByLabelText("Open-box progress for B-012");
    expect(
      within(progress).getByText("Open-box checklist"),
    ).toBeInTheDocument();
    expect(within(progress).getByText("2 estimate gaps")).toBeInTheDocument();
    expect(within(progress).getByText("Contents")).toBeInTheDocument();
    expect(within(progress).getByText("1 item")).toBeInTheDocument();
    expect(within(progress).getByText("Weight")).toBeInTheDocument();
    expect(within(progress).getByText("12 lb")).toBeInTheDocument();
    expect(within(progress).getByText("Missing dimensions")).toBeInTheDocument();
    expect(within(progress).getByText("Missing volume")).toBeInTheDocument();
    expect(
      within(progress).getByText(
        "B-012 still needs dimensions, volume before the load plan is fully useful.",
      ),
    ).toBeInTheDocument();
    expect(
      within(progress).getByRole("link", {
        name: "Dimensions: Missing dimensions",
      }),
    ).toHaveAttribute("href", "#box-estimates");
    expect(
      screen.getByText("Paste this into your assistant"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /create contents inside this existing rough box/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy assistant handoff for B-012" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Recorded contents")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Recorded contents for B-012")).getByText(
        "1 item",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Box estimates")).toBeInTheDocument();

    const actionNav = screen.getByLabelText("Open box actions for B-012");
    expect(
      within(actionNav).getByRole("link", { name: /Estimates/i }),
    ).toHaveAttribute("href", "#box-estimates");
    expect(
      within(actionNav).getByRole("link", { name: /Add item/i }),
    ).toHaveAttribute("href", "#quick-box-item");
    expect(
      within(actionNav).getByRole("link", { name: /Paste list/i }),
    ).toHaveAttribute("href", "#box-content-list");
    expect(
      within(actionNav).getByRole("link", { name: /Photo item/i }),
    ).toHaveAttribute("href", "#box-photo-item");
    expect(
      within(actionNav).getByRole("link", { name: /AI photos/i }),
    ).toHaveAttribute("href", "#box-ai-photo-queue");
    expect(
      within(actionNav).getByRole("link", { name: /^Contents/i }),
    ).toHaveAttribute("href", "#recorded-box-contents");
    expect(document.getElementById("box-estimates")).toBeInTheDocument();
    expect(document.getElementById("quick-box-item")).toBeInTheDocument();
    expect(document.getElementById("box-content-list")).toBeInTheDocument();
    expect(document.getElementById("box-photo-item")).toBeInTheDocument();
    expect(document.getElementById("box-ai-photo-queue")).toBeInTheDocument();
    expect(document.getElementById("recorded-box-contents")).toBeInTheDocument();
  });

  it("saves rough-box estimates from the open-box workflow", async () => {
    const user = userEvent.setup();
    lookupData.mutations.updateBox.mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
        returnTo="load-plan"
      />,
    );

    await user.type(screen.getByLabelText("Estimated weight for B-012"), "18");
    await user.type(screen.getByLabelText("Length in inches for B-012"), "18");
    await user.type(screen.getByLabelText("Width in inches for B-012"), "12");
    await user.type(screen.getByLabelText("Height in inches for B-012"), "10");
    await user.click(
      screen.getByRole("button", { name: "Save box estimates" }),
    );

    await waitFor(() =>
      expect(lookupData.mutations.updateBox).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        boxId: "box_12",
        estimatedWeightLb: 18,
        dimensionsIn: {
          lengthIn: 18,
          widthIn: 12,
          heightIn: 10,
        },
        estimatedVolumeCuFt: 1.25,
      }),
    );
    expect(
      await screen.findByText("B-012 estimates updated."),
    ).toBeInTheDocument();
  });

  it("quick-adds a named item inside the scanned box without requiring a photo", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createItem.mockResolvedValueOnce(
      "item_quick" as Id<"items">,
    );
    lookupData.mutations.addItem.mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
      />,
    );

    expect(screen.getByRole("button", { name: "Add to box" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("Quick item name inside B-012"),
      "Circular saw blades",
    );
    await user.clear(screen.getByLabelText("Quick item quantity inside B-012"));
    await user.type(
      screen.getByLabelText("Quick item quantity inside B-012"),
      "3",
    );
    await user.type(
      screen.getByLabelText("Quick item category inside B-012"),
      "Workshop",
    );
    await user.type(
      screen.getByLabelText("Quick item notes inside B-012"),
      "Three blades in sleeves.",
    );
    await user.click(screen.getByRole("button", { name: "Add to box" }));

    await waitFor(() =>
      expect(lookupData.mutations.createItem).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        name: "Circular saw blades",
        room: "Garage",
        destinationRoom: "Workshop",
        category: "Workshop",
        description: "Three blades in sleeves.",
        disposition: "mover",
        status: "packed",
        quantity: 3,
        needsReview: true,
        reviewFlags: ["boxContentsReview"],
        aiTags: ["box-content-capture"],
        createdVia: "manual",
      }),
    );
    expect(lookupData.mutations.addItem).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_12",
      itemId: "item_quick",
      quantity: 3,
    });
    expect(lookupData.mutations.updatePhoto).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Circular saw blades added to B-012."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Quick item name inside B-012")).toHaveValue(
      "",
    );
    expect(
      screen.getByLabelText("Quick item quantity inside B-012"),
    ).toHaveValue("1");
  });

  it("batch-adds several named contents inside the opened rough box", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createItem
      .mockResolvedValueOnce("item_batch_1" as Id<"items">)
      .mockResolvedValueOnce("item_batch_2" as Id<"items">);
    lookupData.mutations.addItem
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
        returnTo="load-plan"
      />,
    );

    expect(
      screen.getByText("Add several contents from a list"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add selected" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("Batch contents list for B-012"),
      "Socket organizer | Tools | 1 | Blue case\nRouter bits | Tools | 2 | Two pouches",
    );
    await user.click(screen.getByRole("button", { name: "Parse contents" }));

    const parsedTable = screen.getByRole("table", {
      name: "Parsed contents for B-012",
    });
    expect(
      within(parsedTable).getByDisplayValue("Socket organizer"),
    ).toBeInTheDocument();
    expect(
      within(parsedTable).getByDisplayValue("Router bits"),
    ).toBeInTheDocument();
    expect(within(parsedTable).getAllByDisplayValue("Tools")).toHaveLength(2);
    const parsedSummary = screen.getByLabelText(
      "Parsed contents summary for B-012",
    );
    expect(
      within(parsedSummary).getByText("Ready to add to B-012"),
    ).toBeInTheDocument();
    expect(
      within(parsedSummary).getByLabelText("Selected: 2"),
    ).toBeInTheDocument();
    expect(
      within(parsedSummary).getByLabelText("Total qty: 3"),
    ).toBeInTheDocument();
    expect(
      within(parsedSummary).getByLabelText("Categorized: 2"),
    ).toBeInTheDocument();
    expect(
      within(parsedSummary).getByLabelText("With notes: 2"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add selected" }));

    await waitFor(() =>
      expect(lookupData.mutations.createItem).toHaveBeenCalledTimes(2),
    );
    expect(lookupData.mutations.createItem).toHaveBeenNthCalledWith(1, {
      householdId: "household_123",
      moveId: "move_123",
      name: "Socket organizer",
      room: "Garage",
      destinationRoom: "Workshop",
      category: "Tools",
      description: "Blue case",
      disposition: "mover",
      status: "packed",
      quantity: 1,
      needsReview: true,
      reviewFlags: ["boxContentsReview"],
      aiTags: ["box-content-capture"],
      createdVia: "manual",
    });
    expect(lookupData.mutations.createItem).toHaveBeenNthCalledWith(2, {
      householdId: "household_123",
      moveId: "move_123",
      name: "Router bits",
      room: "Garage",
      destinationRoom: "Workshop",
      category: "Tools",
      description: "Two pouches",
      disposition: "mover",
      status: "packed",
      quantity: 2,
      needsReview: true,
      reviewFlags: ["boxContentsReview"],
      aiTags: ["box-content-capture"],
      createdVia: "manual",
    });
    expect(lookupData.mutations.addItem).toHaveBeenNthCalledWith(1, {
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_12",
      itemId: "item_batch_1",
      quantity: 1,
    });
    expect(lookupData.mutations.addItem).toHaveBeenNthCalledWith(2, {
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_12",
      itemId: "item_batch_2",
      quantity: 2,
    });
    expect(
      await screen.findByText("2 items were added to B-012."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review load plan" }),
    ).toHaveAttribute("href", "/app/moves/move_123/load-plan#load-plan");
    expect(screen.getByLabelText("Batch contents list for B-012")).toHaveValue(
      "",
    );
    expect(
      screen.queryByRole("table", { name: "Parsed contents for B-012" }),
    ).not.toBeInTheDocument();
  });

  it("parses natural quantities from headerless box-content columns", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createItem
      .mockResolvedValueOnce("item_blades" as Id<"items">)
      .mockResolvedValueOnce("item_oil" as Id<"items">);
    lookupData.mutations.addItem
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
        returnTo="load-plan"
      />,
    );

    expect(screen.getByText("3 circular saw blades")).toBeInTheDocument();
    expect(screen.getByText(/become quantity 3 automatically/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Batch contents list for B-012"),
      "3 circular saw blades | Tools | sleeves\nTwo oil bottles | Supplies | sealed",
    );
    await user.click(screen.getByRole("button", { name: "Parse contents" }));

    const parsedTable = screen.getByRole("table", {
      name: "Parsed contents for B-012",
    });
    expect(
      within(parsedTable).getByDisplayValue("circular saw blades"),
    ).toBeInTheDocument();
    expect(within(parsedTable).getByDisplayValue("oil bottles")).toBeInTheDocument();
    expect(within(parsedTable).getByDisplayValue("3")).toBeInTheDocument();
    expect(within(parsedTable).getByDisplayValue("2")).toBeInTheDocument();
    expect(within(parsedTable).getByDisplayValue("sleeves")).toBeInTheDocument();
    expect(within(parsedTable).getByDisplayValue("sealed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add selected" }));

    await waitFor(() =>
      expect(lookupData.mutations.createItem).toHaveBeenCalledTimes(2),
    );
    expect(lookupData.mutations.createItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "circular saw blades",
        category: "Tools",
        description: "sleeves",
        quantity: 3,
      }),
    );
    expect(lookupData.mutations.createItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "oil bottles",
        category: "Supplies",
        description: "sealed",
        quantity: 2,
      }),
    );
    expect(lookupData.mutations.addItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        boxId: "box_12",
        itemId: "item_blades",
        quantity: 3,
      }),
    );
    expect(lookupData.mutations.addItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        boxId: "box_12",
        itemId: "item_oil",
        quantity: 2,
      }),
    );
  });

  it("edits parsed box contents from mobile cards before saving", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createItem.mockResolvedValueOnce(
      "item_mobile" as Id<"items">,
    );
    lookupData.mutations.addItem.mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
        returnTo="load-plan"
      />,
    );

    await user.type(
      screen.getByLabelText("Batch contents list for B-012"),
      "Loose clamps | Hardware | 1 | mixed sizes",
    );
    await user.click(screen.getByRole("button", { name: "Parse contents" }));

    const mobileCards = screen.getByLabelText(
      "Parsed contents mobile cards for B-012",
    );
    expect(
      within(mobileCards).getByLabelText(
        "Mobile use parsed content Loose clamps",
      ),
    ).toBeChecked();

    await user.clear(
      within(mobileCards).getByLabelText(
        "Mobile parsed content name box-content-0",
      ),
    );
    await user.type(
      within(mobileCards).getByLabelText(
        "Mobile parsed content name box-content-0",
      ),
      "Spring clamps",
    );
    await user.clear(
      within(mobileCards).getByLabelText(
        "Mobile parsed content quantity Spring clamps",
      ),
    );
    await user.type(
      within(mobileCards).getByLabelText(
        "Mobile parsed content quantity Spring clamps",
      ),
      "4",
    );
    await user.clear(
      within(mobileCards).getByLabelText(
        "Mobile parsed content category Spring clamps",
      ),
    );
    await user.type(
      within(mobileCards).getByLabelText(
        "Mobile parsed content category Spring clamps",
      ),
      "Workshop",
    );
    await user.clear(
      within(mobileCards).getByLabelText(
        "Mobile parsed content notes Spring clamps",
      ),
    );
    await user.type(
      within(mobileCards).getByLabelText(
        "Mobile parsed content notes Spring clamps",
      ),
      "Four clamps from the open box.",
    );
    await user.click(screen.getByRole("button", { name: "Add selected" }));

    await waitFor(() =>
      expect(lookupData.mutations.createItem).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        name: "Spring clamps",
        room: "Garage",
        destinationRoom: "Workshop",
        category: "Workshop",
        description: "Four clamps from the open box.",
        disposition: "mover",
        status: "packed",
        quantity: 4,
        needsReview: true,
        reviewFlags: ["boxContentsReview"],
        aiTags: ["box-content-capture"],
        createdVia: "manual",
      }),
    );
    expect(lookupData.mutations.addItem).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_12",
      itemId: "item_mobile",
      quantity: 4,
    });
  });

  it("creates a photo-backed item inside the scanned box", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createItem.mockResolvedValueOnce(
      "item_created" as Id<"items">,
    );
    lookupData.mutations.addItem.mockResolvedValueOnce(undefined);
    lookupData.mutations.updatePhoto.mockResolvedValueOnce(undefined);

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
      />,
    );

    expect(screen.getByText("B-012")).toBeInTheDocument();
    expect(screen.getByText("Socket set")).toBeInTheDocument();
    expect(
      screen.getByText("Enter an item name before uploading the photo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Simulate Photo for new item in B-012",
      }),
    ).toBeDisabled();

    await user.type(
      screen.getByLabelText("Photo item name inside B-012"),
      "Loose router bits",
    );
    await user.clear(screen.getByLabelText("Photo item quantity inside B-012"));
    await user.type(
      screen.getByLabelText("Photo item quantity inside B-012"),
      "4",
    );
    await user.type(
      screen.getByLabelText("Photo item category inside B-012"),
      "Tools",
    );
    await user.type(
      screen.getByLabelText("Photo item notes inside B-012"),
      "Four small cases visible.",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Simulate Photo for new item in B-012",
      }),
    );

    await waitFor(() =>
      expect(lookupData.mutations.createItem).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        name: "Loose router bits",
        room: "Garage",
        destinationRoom: "Workshop",
        category: "Tools",
        description: "Four small cases visible.",
        disposition: "mover",
        status: "packed",
        quantity: 4,
        needsReview: true,
        reviewFlags: ["boxContentsReview", "photoEvidenceReview"],
        aiTags: ["box-content-capture", "photo-created-item"],
        createdVia: "manual",
      }),
    );
    expect(lookupData.mutations.addItem).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      boxId: "box_12",
      itemId: "item_created",
      quantity: 4,
    });
    expect(lookupData.mutations.updatePhoto).toHaveBeenCalledWith({
      householdId: "household_123",
      moveId: "move_123",
      photoId: "photo_uploaded_1",
      itemId: "item_created",
      boxId: "box_12",
      room: "Garage",
      caption: "Loose router bits",
      photoType: "item",
      notes: "Four small cases visible.",
    });
    expect(
      await screen.findByText("Loose router bits created inside B-012."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Photo item name inside B-012")).toHaveValue(
      "",
    );
    expect(
      screen.getByLabelText("Photo item quantity inside B-012"),
    ).toHaveValue("1");
  });

  it("queues open-box photos for AI itemization inside the existing box", async () => {
    const user = userEvent.setup();
    lookupData.mutations.createQueueEntry.mockResolvedValueOnce(
      "entry_1" as Id<"ingestionQueueEntries">,
    );

    render(
      <BoxLookup
        householdId="household_123"
        moveId="move_123"
        boxId="box_12"
      />,
    );

    await user.type(
      screen.getByLabelText("AI queue instructions for B-012"),
      "Mostly small drill bits and loose fasteners.",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Simulate Box-content photos for B-012",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Simulate Box-content photos for B-012",
      }),
    );

    expect(
      await screen.findByText("2 photos ready to queue."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Queue for AI itemization" }),
    );

    await waitFor(() =>
      expect(lookupData.mutations.createQueueEntry).toHaveBeenCalledWith({
        householdId: "household_123",
        moveId: "move_123",
        instructions: expect.stringContaining(
          "Open existing box B-012 (box_12)",
        ),
        roomHint: "Garage",
        dispositionHint: "mover",
        scopeHint: "multipleItems",
        mediaPhotoIds: ["photo_uploaded_1", "photo_uploaded_2"],
      }),
    );
    const instructions =
      lookupData.mutations.createQueueEntry.mock.calls[0]?.[0]?.instructions;
    expect(instructions).toContain("agent_workbench mode=intakeQueue");
    expect(instructions).toContain("committedItems");
    expect(instructions).toContain("attachMediaPhotoIds");
    expect(instructions).toContain("batch_add_box_contents");
    expect(
      instructions.match(/use batch_add_box_contents/g) ?? [],
    ).toHaveLength(1);
    expect(instructions).toContain("boxAssignments");
    expect(instructions).toContain(
      "Current box planning context: no manual estimates recorded; missing weight, complete dimensions, volume",
    );
    expect(instructions).toContain("Do not create a replacement box.");
    expect(instructions).toContain("User notes: Mostly small drill bits");
    expect(
      await screen.findByText("2 photos from B-012 queued for AI itemization."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("AI queue instructions for B-012"),
    ).toHaveValue("");
  });
});
