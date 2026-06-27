import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";

const sheetData = vi.hoisted(() => ({
  activity: [],
  people: [
    {
      _id: "person_1",
      name: "Scott",
      role: "owner",
    },
  ],
  convert: vi.fn(),
}));

const componentMocks = vi.hoisted(() => ({
  PhotoEvidenceStrip: vi.fn(() => <div>Photo evidence strip</div>),
  PhotoUploadControl: vi.fn(() => <div>Photo upload control</div>),
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
    if (query === "audit.listForObject") return sheetData.activity;
    if (query === "movePeople.listForMove") return sheetData.people;
    // moveSpaces.listForMove + transportResources.listForMoveWithZones — empty here.
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
  weightConfidence: "estimated",
  estimatedVolumeCuFt: 1.2,
  volumeConfidence: "estimated",
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

function renderSheet() {
  return render(
    <ItemDetailSheet
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
      item={item}
      open
      onOpenChange={vi.fn()}
      onSave={vi.fn()}
    />
  );
}

describe("ItemDetailSheet task tabs", () => {
  it("opens on details and keeps evidence, handling, and review work separate", async () => {
    const user = userEvent.setup();
    renderSheet();

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "data-state",
      "active"
    );
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

  it("converts a misclassified item into a numbered box after confirming", async () => {
    const user = userEvent.setup();
    sheetData.convert.mockReset();
    sheetData.convert.mockResolvedValue({ boxId: "box_new", code: "B-027" });
    renderSheet();

    await user.click(
      screen.getByRole("button", { name: /Convert to a box\/tote/ }),
    );
    // Requires an explicit confirm before it replaces the item.
    expect(sheetData.convert).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Convert to box" }));

    await waitFor(() => {
      expect(sheetData.convert).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item_1" }),
      );
    });
  });
});
