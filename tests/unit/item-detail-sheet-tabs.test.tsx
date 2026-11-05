import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { InventoryItem, InventoryItemPatch } from "@/lib/inventory-types";

type HistoryFixture = { _id: string; action: string; category: string; actorType: "user" | "agent" | "apiKey" | "system" | "webhook"; createdAt: number; metadata?: Record<string, unknown> };
const sheetData = vi.hoisted(() => ({
  activity: [] as HistoryFixture[],
  earlierActivity: undefined as HistoryFixture[] | undefined,
  people: [
    {
      _id: "person_1",
      name: "Scott",
      role: "owner",
    },
  ],
  transport: [
    {
      resource: {
        _id: "transport_1",
        name: "Rental truck",
      },
      zones: [],
    },
  ],
  convert: vi.fn(),
}));

const componentMocks = vi.hoisted(() => ({
  PhotoEvidenceStrip: vi.fn(() => <div>Photo evidence strip</div>),
  PhotoUploadControl: vi.fn(() => <div>Photo upload control</div>),
  // The hero owns its own useAction(getDisplayUrl) + lightbox, so stub it here
  // the same way (the sheet's convex mock intentionally omits useAction).
  ItemHeroImage: vi.fn(() => <div>Item hero</div>),
  // The "choose existing photo" picker also uses useAction; stub it too.
  PhotoPickerDialog: vi.fn(() => <div>Photo picker</div>),
}));

// Sentinel api so useQuery can tell the queries apart (people vs the
// present-location space/transport lists added in MOVE-349 phase 7).
vi.mock("../../convex/_generated/api", () => {
  const makeNs = (ns: string) =>
    new Proxy({}, { get: (_t, prop) => `${ns}.${String(prop)}` });
  const api = new Proxy({}, { get: (_t, ns) => makeNs(String(ns)) });
  return { api };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn((query: string, args) => {
    if (args === "skip") return undefined;
    if (query === "audit.listForObject") return args.limit === 50 && sheetData.earlierActivity ? sheetData.earlierActivity : sheetData.activity;
    if (query === "movePeople.listForMove") return sheetData.people;
    if (query === "transportResources.listForMoveWithZones")
      return sheetData.transport;
    // moveSpaces.listForMove is empty here.
    return [];
  }),
  useMutation: () => sheetData.convert,
}));

vi.mock("@/components/photo-upload-control", () => ({
  PhotoUploadControl: componentMocks.PhotoUploadControl,
}));

vi.mock("@/components/photo-evidence-strip", () => ({
  PhotoEvidenceStrip: componentMocks.PhotoEvidenceStrip,
}));

vi.mock("@/components/item-hero-image", () => ({
  ItemHeroImage: componentMocks.ItemHeroImage,
}));

vi.mock("@/components/photo-picker-dialog", () => ({
  PhotoPickerDialog: componentMocks.PhotoPickerDialog,
}));

import { ItemDetailSheet } from "@/components/item-detail-sheet";

const item = {
  _id: "item_1" as Id<"items">,
  _creationTime: 1,
  householdId: "household_123" as Id<"households">,
  moveId: "move_123" as Id<"moves">,
  name: "Red toolbox",
  description: "Tools from the garage shelf.",
  room: "Garage",
  destinationRoom: "Storage",
  category: "Tools",
  subcategory: "Hand tools",
  ownerPersonId: "person_1" as Id<"movePeople">,
  status: "active",
  disposition: "mover",
  quantity: 1,
  condition: "good",
  fragility: "low",
  stackable: true,
  hazardousFlag: false,
  highValue: false,
  requiresPersonalTransport: false,
  needsReview: true,
  valueCents: 4000,
  replacementValueCents: 6500,
  serialNumber: "SN-123",
  modelNumber: "TB-42",
  dimensionsIn: { lengthIn: 18, widthIn: 9, heightIn: 9 },
  dimensionsConfidence: "manual",
  estimatedWeightLb: 24,
  weightConfidence: "medium",
  estimatedVolumeCuFt: 1.2,
  volumeConfidence: "medium",
  reviewFlags: ["verify contents"],
  privateNotes: "Check the small drawer before packing.",
  aiSummary: "Photo suggests one toolbox; quantity should be verified.",
  aiTags: ["tools", "garage"],
  planningDefaultKeys: [],
  createdAt: 1,
  updatedAt: 2,
  signals: {
    photoCount: 2,
    evidencePhotoCount: 1,
    boxCount: 1,
    assignedBoxCount: 1,
    assignmentCount: 1,
    boxCodes: ["B-001"],
    assignedResourceNames: ["Rental truck"],
    assignedZoneNames: ["Front"],
  },
} as unknown as InventoryItem;

function renderSheet({
  itemOverride,
  onSave = vi.fn().mockResolvedValue(undefined),
}: {
  itemOverride?: Partial<InventoryItem>;
  onSave?: (patch: InventoryItemPatch) => Promise<void>;
} = {}) {
  const renderedItem = { ...item, ...itemOverride } as InventoryItem;
  return render(
    <ItemDetailSheet
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
      item={renderedItem}
      open
      onOpenChange={vi.fn()}
      onSave={onSave}
    />
  );
}

describe("ItemDetailSheet task tabs", () => {
  beforeEach(() => { sheetData.activity = []; sheetData.earlierActivity = undefined; });
  it("opens the saved record and keeps every editor one labelled step away", async () => {
    const user = userEvent.setup();
    renderSheet();

    expect(screen.getByRole("tab", { name: "Record" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByLabelText("Item dossier")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence history" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Red toolbox");
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Review flags")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Stackable")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Photo upload control")).toBeInTheDocument();
    expect(screen.getByText("Photo evidence strip")).toBeInTheDocument();
    expect(screen.getByText("Attached photos")).toBeInTheDocument();
    expect(
      screen.getByText(/The main item photo is already used as the thumbnail/)
    ).toBeInTheDocument();
    expect(componentMocks.PhotoUploadControl).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Other Photos" }),
      undefined,
    );
    expect(componentMocks.PhotoEvidenceStrip).toHaveBeenCalledWith(
      expect.objectContaining({
        omitFirstPhoto: true,
        label: "Other photos",
        emptyLabel: "No other photos yet.",
      }),
      undefined,
    );
    expect(screen.queryByLabelText("Review flags")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Handling" }));
    expect(screen.getByText("Box membership")).toBeInTheDocument();
    expect(screen.getByText("Transport assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Stackable")).toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Review" }));
    expect(screen.getByLabelText("Needs review")).toBeInTheDocument();
    expect(screen.getByLabelText("Review flags")).toBeInTheDocument();
    expect(screen.getByLabelText("AI tags")).toBeInTheDocument();
    expect(screen.getByLabelText("AI reasoning")).toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
  });

  it("shows sell pricing + mark-sold for sell, and mark-trashed for dump", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("tab", { name: "Details" }));
    const disposition = screen.getByDisplayValue("mover");

    await user.selectOptions(disposition, "sell");
    expect(
      screen.getByLabelText("Asking price in dollars"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark sold" }),
    ).toBeInTheDocument();

    await user.selectOptions(disposition, "dump");
    expect(
      screen.getByRole("button", { name: /Mark trashed/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark sold" }),
    ).not.toBeInTheDocument();
  });

  it("keeps transport visible for leaving-inventory items that are still assigned", async () => {
    const user = userEvent.setup();
    renderSheet({
      itemOverride: {
        disposition: "sell",
        assignedResourceId: "transport_1" as Id<"transportResources">,
      },
    });
    await user.click(screen.getByRole("tab", { name: "Details" }));

    expect(
      screen.queryByLabelText("Origination space"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Destination space"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Transportation method")).toHaveValue(
      "transport:transport_1",
    );
    expect(
      screen.getByText(/still assigned to transport/),
    ).toBeInTheDocument();
  });

  it("converts a misclassified item into a numbered box after confirming", async () => {
    const user = userEvent.setup();
    sheetData.convert.mockReset();
    sheetData.convert.mockResolvedValue({ boxId: "box_new", code: "B-027" });
    renderSheet();

    await user.click(screen.getByRole("button", { name: "More item actions" }));
    await user.click(
      screen.getByRole("button", { name: /Convert to a box\/tote/ }),
    );
    // Requires an explicit confirm before it replaces the item.
    expect(sheetData.convert).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep as item" }));
    expect(screen.getByRole("button", { name: "More item actions" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "More item actions" }));
    await user.click(screen.getByRole("button", { name: /Convert to a box\/tote/ }));
    await user.click(screen.getByRole("button", { name: "Convert to box" }));

    await waitFor(() => {
      expect(sheetData.convert).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item_1" }),
      );
    });
  });

  it("keeps high-confidence estimated weight as estimated on an unrelated save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({
      itemOverride: {
        actualWeightLb: undefined,
        estimatedWeightLb: 40,
        estimatedWeightLowLb: undefined,
        estimatedWeightHighLb: undefined,
        weightConfidence: "high",
      },
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Details" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Red toolbox updated");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0];
    expect(patch).toMatchObject({ estimatedWeightLb: 40 });
    expect(patch).not.toHaveProperty("actualWeightLb");
    expect(patch).not.toHaveProperty("weightConfidence");
  });

  it("demotes an actual weight to an estimate when the checkbox is enabled", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({
      itemOverride: {
        actualWeightLb: 40,
        estimatedWeightLb: undefined,
        estimatedWeightLowLb: undefined,
        estimatedWeightHighLb: undefined,
        weightConfidence: "actual",
      },
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Measurements" }));
    await user.click(screen.getAllByLabelText("I only have an estimate")[0]);
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      estimatedWeightLb: 40,
      clearActualWeight: true,
      weightConfidence: "low",
    });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("actualWeightLb");
  });

  it("does not rewrite confidence or clear actual weight when weight is blanked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({
      itemOverride: {
        actualWeightLb: 40,
        estimatedWeightLb: undefined,
        estimatedWeightLowLb: undefined,
        estimatedWeightHighLb: undefined,
        weightConfidence: "actual",
      },
      onSave,
    });

    await user.click(screen.getByRole("tab", { name: "Measurements" }));
    await user.clear(screen.getByLabelText("Weight (lb)"));
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0];
    expect(patch).not.toHaveProperty("weightConfidence");
    expect(patch).not.toHaveProperty("clearActualWeight");
    expect(patch).not.toHaveProperty("actualWeightLb");
    expect(patch).not.toHaveProperty("estimatedWeightLb");
  });

  it("opens related fact history without claiming that submitted keys prove provenance", async () => {
    const user = userEvent.setup();
    sheetData.activity = Array.from({ length: 8 }, (_, index) => ({ _id: `synthetic-history-${index}`, action: index === 7 ? "item.status.changed" : "item.updated", category: "inventory", actorType: index % 2 ? "user" : "apiKey", createdAt: 1000 - index, metadata: { changedKeys: [index === 7 ? "status" : "name"] } }));
    renderSheet();
    expect(screen.queryByText("item status changed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 earlier loaded entries/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Status: related history" }));
    const source = screen.getByText("item status changed").closest("li");
    expect(source).toHaveFocus();
    expect(screen.queryByRole("button", { name: /3 earlier loaded entries/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Entry author: API key" })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Entry author: AI / automation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /from its entry/ })).not.toBeInTheDocument();
    expect(screen.getByText("Recorded fields: status")).toBeInTheDocument();
  });

  it("links inline classification after a full save as related history, even without changedKeys", async () => {
    const user = userEvent.setup();
    // Deliberately not sorted: use the latest related event, not array order.
    sheetData.activity = [
      { _id: "synthetic-save", action: "item.updated", category: "inventory", actorType: "user", createdAt: 1000, metadata: { changedKeys: ["name", "disposition"] } },
      { _id: "synthetic-classification", action: "item.disposition_set", category: "inventory", actorType: "user", createdAt: 2000, metadata: { dispositionFrom: "mover", dispositionTo: "personalTransport" } },
    ];
    renderSheet({ itemOverride: { disposition: "personalTransport" } });
    await user.click(screen.getByRole("button", { name: "Disposition: related history" }));
    expect(screen.getByText("item disposition set").closest("li")).toHaveFocus();
    expect(screen.getByText(/Disposition:.*Personal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /from its entry/ })).not.toBeInTheDocument();
    expect(screen.getByText(/does not identify the origin of each current value/)).toBeInTheDocument();
  });

  it("hands keyboard focus to the destination tab from Contents and Edit notes", async () => {
    const user = userEvent.setup();
    renderSheet();
    within(screen.getByRole("navigation", { name: "Item contents" })).getByRole("button", { name: "Measurements" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tab", { name: "Measurements" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Measurements" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Back to saved record" }));
    expect(screen.getByRole("tab", { name: "Record" })).toHaveFocus();
    screen.getByRole("button", { name: "Edit notes" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tab", { name: "Review" })).toHaveFocus();
    expect(screen.getByLabelText("Private notes")).toBeVisible();
  });

  it("announces missing related history even after requesting the bounded history", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Status: open loaded history" }));
    expect(screen.getByText(/No related status update identified in the latest 0 loaded entries/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("tab", { name: "Record" })).toHaveFocus();
  });

  it("finds related history returned by the larger query and offers an explicit jump", async () => {
    const user = userEvent.setup();
    sheetData.activity = [{ _id: "synthetic-rename", action: "item.updated", category: "inventory", actorType: "user", createdAt: 2000, metadata: { changedKeys: ["name"] } }];
    sheetData.earlierActivity = [...sheetData.activity, { _id: "synthetic-status", action: "item.status.changed", category: "inventory", actorType: "agent", createdAt: 1000, metadata: { statusFrom: "draft", statusTo: "active" } }];
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Status: open loaded history" }));
    expect(screen.getByText(/Related status update found/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open related update" }));
    expect(screen.getByText("item status changed").closest("li")).toHaveFocus();
  });

  it("retains unsaved fields while moving between the record and its editors", async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit item details" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Synthetic unfinished rename" } });
    await user.click(screen.getByRole("tab", { name: "Record" }));
    expect(screen.getByRole("heading", { name: "Red toolbox" })).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Synthetic unfinished rename");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Red toolbox" } });
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it.each([
    { label: "Weight (lb)", original: "40", changed: "41", confidence: "weightConfidence", estimateLabel: "I only have an estimate", estimateIndex: 0 },
    { label: "Length (in)", original: "18", changed: "19", confidence: "dimensionsConfidence", estimateLabel: "These are estimates", estimateIndex: 0 },
    { label: "Volume (cu ft)", original: "1.2", changed: "1.3", confidence: "volumeConfidence", estimateLabel: "I only have an estimate", estimateIndex: 1 },
  ])("clears dirty state after $label and its estimate flag are reverted", async ({ label, original, changed, confidence, estimateLabel, estimateIndex }) => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSheet({ itemOverride: { estimatedWeightLb: 40, weightConfidence: "low", dimensionsConfidence: "actual", volumeConfidence: "low" }, onSave });
    await userEvent.click(screen.getByRole("tab", { name: "Measurements" }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: changed } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(label), { target: { value: original } });
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    const measurement = confidence === "dimensionsConfidence" ? "Dimensions" : confidence === "weightConfidence" ? "Weight" : "Volume";
    await userEvent.click(screen.getByRole("tab", { name: "Advanced" }));
    expect(within(screen.getByRole("group", { name: `${measurement} measurement source` })).getByText(confidence === "dimensionsConfidence" ? "actual" : "low")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Measurements" }));
    const estimate = screen.getAllByLabelText(estimateLabel)[estimateIndex];
    fireEvent.click(estimate);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(estimate);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).not.toHaveProperty(confidence);
  });
});
