import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";

const mockItems = vi.hoisted(() => ({
  rows: [] as unknown as InventoryItem[],
  update: vi.fn(),
  create: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mockItems.rows,
  useMutation: mockItems.useMutation,
}));

import { InventoryTable } from "@/components/inventory-table";

describe("InventoryTable", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/inventory");
    mockItems.rows = [
      inventoryItem("item_1", "Walnut media console", {
        description:
          "A very long note about scratches, cable holes, accessories, matching shelves, and packing context that should not force the entire table to become unusably wide.",
        needsReview: true,
        highValue: true,
        requiresPersonalTransport: true,
        signals: {
          photoCount: 2,
          evidencePhotoCount: 1,
          boxCount: 1,
          assignedBoxCount: 1,
          assignmentCount: 1,
          boxCodes: ["B-001"],
          assignedResourceNames: ["Truck"],
          assignedZoneNames: ["Front"],
        },
      }),
    ];
    mockItems.useMutation.mockReset();
    mockItems.useMutation.mockReturnValue(vi.fn());
  });

  it("keeps find controls above explicit, compact inventory records", () => {
    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByText("Find and filter")).toBeInTheDocument();
    expect(screen.getAllByText("All items").length).toBeGreaterThan(1);
    expect(screen.getByText("1 of 1 records")).toBeInTheDocument();
    expect(screen.getByLabelText("Search inventory")).toBeInTheDocument();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByText("Inventory records")).toBeInTheDocument();
    expect(screen.getByText("1 on this page / 1 filtered")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by Room" }),
    ).toBeInTheDocument();
    const cardList = screen.getByRole("list", { name: "Inventory item cards" });
    expect(within(cardList).getByText("Walnut media console")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Inventory records table" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Walnut media console")).toHaveLength(2);
    expect(screen.getAllByText("review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("value").length).toBeGreaterThan(0);
    expect(screen.getAllByText("personal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+5").length).toBeGreaterThan(0);
    expect(screen.queryByText("photos 2")).not.toBeInTheDocument();
  });

  it("opens on browsing items and keeps add/import workflows separate", async () => {
    const user = userEvent.setup();

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByRole("tab", { name: "Browse" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getAllByText("Walnut media console").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("New item name")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add" }));
    expect(screen.getByLabelText("New item name")).toBeInTheDocument();
    expect(screen.queryByText("Walnut media console")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Bulk paste" }));
    expect(
      screen.getByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New item name")).not.toBeInTheDocument();
  });

  it("opens the add workflow from the add-inventory hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/inventory#add-inventory",
    );

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Add" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(screen.getByLabelText("New item name")).toBeInTheDocument();
    expect(screen.queryByText("Walnut media console")).not.toBeInTheDocument();
  });

  it("opens the bulk paste workflow from the bulk-inventory hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/inventory#bulk-inventory",
    );

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Bulk paste" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(
      screen.getByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New item name")).not.toBeInTheDocument();
  });

  it("resets to the first page when search narrows inventory", async () => {
    const user = userEvent.setup();
    mockItems.rows = Array.from({ length: 12 }, (_, index) =>
      inventoryItem(`item_${index + 1}`, `Inventory item ${index + 1}`, {
        room: index === 0 ? "Attic" : "Garage",
      }),
    );

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search inventory"), "Attic");

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getAllByText("Inventory item 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Add inventory items or change the saved filter/search terms.")).not.toBeInTheDocument();
  });
});

function inventoryItem(
  id: string,
  name: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    _id: id as Id<"items">,
    name,
    description: "No special notes.",
    room: "Den",
    category: "Furniture",
    ownerContact: null,
    ownerPersonId: undefined,
    condition: "good",
    weightConfidence: "medium",
    volumeConfidence: "medium",
    status: "active",
    disposition: "mover",
    needsReview: false,
    highValue: false,
    requiresPersonalTransport: false,
    planningDefaultKeys: [],
    signals: {
      photoCount: 0,
      evidencePhotoCount: 0,
      boxCount: 0,
      assignedBoxCount: 0,
      assignmentCount: 0,
      boxCodes: [],
      assignedResourceNames: [],
      assignedZoneNames: [],
    },
    ...overrides,
  } as InventoryItem;
}
