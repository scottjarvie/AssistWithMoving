import { render, screen } from "@testing-library/react";
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
}));

const componentMocks = vi.hoisted(() => ({
  PhotoEvidenceStrip: vi.fn(() => <div>Photo evidence strip</div>),
  PhotoUploadControl: vi.fn(() => <div>Photo upload control</div>),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_query, args) => {
    if (args === "skip") return undefined;
    if (args?.objectTable === "items") return sheetData.activity;
    return sheetData.people;
  }),
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
    expect(
      screen.getByRole("link", {
        name: "Queue AI follow-up for this item",
      }),
    ).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture?intent=existingItem&targetItemId=item_1&targetLabel=Red+toolbox",
    );
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
});
