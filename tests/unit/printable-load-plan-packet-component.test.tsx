import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    listForMove: "boxes.listForMove",
  },
  estimates: {
    reportForMove: "estimates.reportForMove",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
}));

const packetData = vi.hoisted(() => ({
  boxes: [
    {
      box: {
        _id: "box_1" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "BOX-001",
        label: "Kitchen essentials",
        room: "Kitchen",
        destinationRoom: "Kitchen",
        status: "sealed",
        assignmentWarnings: [],
        assignmentHardBlocks: [],
        assignmentLocked: false,
        assignedResourceId: "resource_1" as Id<"transportResources">,
        assignedZoneId: "zone_1" as Id<"transportZones">,
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"boxes">,
      contents: [
        {
          item: {
            _id: "item_boxed" as Id<"items">,
            _creationTime: 1,
            householdId: "household_123" as Id<"households">,
            moveId: "move_123" as Id<"moves">,
            name: "Coffee mugs",
            status: "packed",
            room: "Kitchen",
            category: "Kitchen",
            disposition: "mover",
            planningDefaultKeys: [],
            quantity: 1,
            highValue: false,
            fragile: false,
            fragility: "standard",
            hazardousFlag: false,
            requiresPersonalTransport: false,
            needsReview: false,
            createdAt: 1,
            updatedAt: 1,
          } as unknown as Doc<"items">,
          membership: {
            quantity: 4,
          },
        },
      ],
      itemCount: 4,
      weightSummary: {
        valueLb: 18,
        label: "contents-derived",
        source: "contents",
      },
    },
  ],
  resources: [
    {
      resource: {
        _id: "resource_1" as Id<"transportResources">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        name: "Moving truck",
        type: "truck",
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"transportResources">,
      zones: [
        {
          _id: "zone_1" as Id<"transportZones">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          resourceId: "resource_1" as Id<"transportResources">,
          name: "Front",
          createdAt: 1,
          updatedAt: 1,
        } as unknown as Doc<"transportZones">,
      ],
    },
  ],
  report: {
    boxReports: [
      {
        boxId: "box_1" as Id<"boxes">,
        estimatedWeightLb: 18,
        estimatedVolumeCuFt: 3,
        warnings: [],
        weightSummary: {
          valueLb: 18,
          label: "contents-derived",
          source: "contents",
        },
      },
    ],
    looseItemReports: [
      {
        itemId: "item_treadmill" as Id<"items">,
        name: "Treadmill",
        room: "Garage",
        destinationRoom: "Basement",
        status: "active",
        disposition: "mover",
        quantity: 1,
        requiresPersonalTransport: false,
        assignedResourceId: "resource_1" as Id<"transportResources">,
        assignedZoneId: "zone_1" as Id<"transportZones">,
        estimatedWeightLb: 220,
        estimatedVolumeCuFt: 82.1,
        warnings: [],
      },
      {
        itemId: "item_table_saw" as Id<"items">,
        name: "Table saw",
        room: "Garage",
        destinationRoom: "Workshop",
        status: "active",
        disposition: "mover",
        quantity: 1,
        requiresPersonalTransport: false,
        estimatedWeightLb: 80,
        estimatedVolumeCuFt: 14,
        warnings: ["missing-load-assignment"],
      },
      {
        itemId: "item_camera_bag" as Id<"items">,
        name: "Camera backpack",
        room: "Office",
        destinationRoom: "Owner car",
        status: "active",
        disposition: "personalTransport",
        quantity: 1,
        requiresPersonalTransport: true,
        estimatedWeightLb: 12,
        estimatedVolumeCuFt: 1,
        warnings: [],
      },
    ],
    resourceReports: [
      {
        resourceId: "resource_1" as Id<"transportResources">,
        estimatedWeightLb: 238,
        estimatedVolumeCuFt: 85.1,
        assignedBoxCount: 1,
        assignedLooseItemCount: 1,
        assignedUnitCount: 2,
      },
    ],
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.boxes.listForMove:
        return packetData.boxes;
      case apiMock.transportResources.listForMoveWithZones:
        return packetData.resources;
      case apiMock.estimates.reportForMove:
        return packetData.report;
      default:
        return undefined;
    }
  },
}));

import { PrintableLoadPlanPacket } from "@/components/printable-load-plan-packet";

function renderPacket() {
  render(
    <PrintableLoadPlanPacket
      householdId="household_123"
      moveId="move_123"
      mode="owner"
    />
  );
}

describe("PrintableLoadPlanPacket", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows and exports assigned, unassigned, and owner-carried loose units", async () => {
    const user = userEvent.setup();
    let capturedBlob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:load-plan";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderPacket();

    expect(screen.getByText("Loose")).toBeInTheDocument();
    expect(screen.getByText("Treadmill")).toBeInTheDocument();
    expect(screen.getAllByText("Table saw").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Camera backpack").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 loose").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => expect(capturedBlob).toBeDefined());
    const csv = await capturedBlob?.text();
    expect(csv).toContain('"unit_type"');
    expect(csv).toContain('"box"');
    expect(csv).toContain('"loose_item"');
    expect(csv).toContain('"Treadmill"');
    expect(csv).toContain('"Table saw"');
    expect(csv).toContain('"Personal transport"');
    expect(csv).toContain('"Camera backpack"');
  });
});
