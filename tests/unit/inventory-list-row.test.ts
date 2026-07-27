import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import { toInventoryListRow } from "../../convex/lib/inventoryListRow";
import { redactItemForVisibility } from "../../convex/lib/loadPlanSnapshot";
import { visibilityForHouseholdRole } from "../../convex/lib/roles";

const householdId = "household-1" as Id<"households">;
const moveId = "move-1" as Id<"moves">;
const signals = {
  photoCount: 2,
  evidencePhotoCount: 1,
  boxCount: 1,
  assignedBoxCount: 1,
  assignmentCount: 1,
  boxCodes: ["B-001"],
  assignedResourceNames: ["Truck"],
  assignedZoneNames: ["Front"],
};
const ownerContact = {
  _id: "person-1" as Id<"movePeople">,
  name: "Scott",
  role: "owner" as const,
};

function fullItem(index = 1) {
  return {
    _id: `item-${index}` as Id<"items">,
    _creationTime: index,
    householdId,
    moveId,
    code: `item-${String(index).padStart(4, "0")}`,
    name: `Walnut cabinet ${index}`,
    nickname: `Cabinet ${index}`,
    description:
      "A long description with condition, packing, provenance, and handling details that belong on the detail view.",
    room: "Living room",
    destinationRoom: "Family room",
    category: "Furniture",
    subcategory: "Storage",
    ownerPersonId: ownerContact._id,
    disposition: "mover",
    status: "active",
    quantity: 1,
    condition: "good",
    valueCents: 125_000,
    replacementValueCents: 150_000,
    serialNumber: `SERIAL-${index}`,
    modelNumber: "MODEL-PRIVATE",
    dimensionsIn: { lengthIn: 48, widthIn: 20, heightIn: 72 },
    measurementProvenance: {
      dimensions: {
        sourceType: "manualMeasurement",
        confidence: "manual",
        notes: "Measured privately in the home.",
        recordedAt: index,
        needsVerification: false,
      },
    },
    estimatedWeightLb: 120,
    actualWeightLb: 125,
    estimatedVolumeCuFt: 40,
    estimatedPackedVolumeCuFt: 44,
    fragility: "standard",
    highValue: true,
    requiresPersonalTransport: false,
    planningDefaultKeys: ["firstNight"],
    needsReview: true,
    privateNotes: "Owner-only handling note.",
    aiSummary: "Contains private market-value analysis.",
    researchSummary: "Private valuation summary.",
    researchSources: ["https://example.com/private-source"],
    researchNotes: "Private research notes.",
    createdAt: index,
    updatedAt: index,
    signals,
    ownerContact,
  } as unknown as Doc<"items"> & {
    signals: typeof signals;
    ownerContact: typeof ownerContact;
  };
}

const droppedKeys = [
  "measurementProvenance",
  "researchSummary",
  "researchSources",
  "researchNotes",
  "aiSummary",
  "privateNotes",
  "serialNumber",
  "modelNumber",
  "description",
  "dimensionsIn",
] as const;

describe("toInventoryListRow", () => {
  it("omits detail-only provenance, prose, identifiers, and dimensions", () => {
    const row = toInventoryListRow(
      fullItem(),
      visibilityForHouseholdRole("owner"),
    );

    for (const key of droppedKeys) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("applies visibility redaction before projection", () => {
    const item = fullItem();
    const visibility = visibilityForHouseholdRole("guest");
    const redacted = redactItemForVisibility(item, visibility);
    const row = toInventoryListRow(item, visibility);

    expect(row.valueCents).toBe(redacted.valueCents);
    expect(row.hasReplacementValue).toBe(
      Boolean(redacted.replacementValueCents),
    );
    expect(row.hasSerialNumber).toBe(Boolean(redacted.serialNumber));
    expect(row).not.toHaveProperty("serialNumber");
  });

  it("preserves signals and owner contact", () => {
    const row = toInventoryListRow(
      fullItem(),
      visibilityForHouseholdRole("owner"),
    );

    expect(row.signals).toBe(signals);
    expect(row.ownerContact).toBe(ownerContact);
  });

  it("cuts a 100-item serialized payload by at least half", () => {
    const visibility = visibilityForHouseholdRole("owner");
    const fullRows = Array.from({ length: 100 }, (_, index) =>
      fullItem(index + 1),
    );
    const slimRows = fullRows.map((item) =>
      toInventoryListRow(item, visibility),
    );
    const fullBytes = JSON.stringify(fullRows).length;
    const slimBytes = JSON.stringify(slimRows).length;

    expect(slimBytes).toBeLessThanOrEqual(fullBytes * 0.5);
  });
});
