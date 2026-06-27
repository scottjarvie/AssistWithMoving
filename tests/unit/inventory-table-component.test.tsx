import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";

const apiMock = vi.hoisted(() => ({
  items: {
    facetedListForMove: "items.facetedListForMove",
    create: "items.create",
    update: "items.update",
    setDisposition: "items.setDisposition",
    batchUpdate: "items.batchUpdate",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
  // Cover-photo thumbnails on the compact item rows.
  photos: {
    listForMove: "photos.listForMove",
    getDisplayUrl: "photos.getDisplayUrl",
  },
  // Referenced by the always-mounted ItemDetailSheet; these resolve to undefined
  // through the useQuery mock and the sheet tolerates that.
  audit: {
    listForObject: "audit.listForObject",
  },
  movePeople: {
    listForMove: "movePeople.listForMove",
  },
  moveSpaces: {
    listForMove: "moveSpaces.listForMove",
  },
}));

const mockItems = vi.hoisted(() => ({
  rows: [] as unknown as InventoryItem[],
  useMutation: vi.fn(),
}));

// The disposition facet groups mirror the server (convex/items.ts). We rebuild
// the chip counts here so the rendered facet pills match whatever rows a test
// sets up.
const dispositionFacetGroups: Record<string, string[]> = {
  moving: ["take", "mover", "personalTransport", "storage"],
  sell: ["sell"],
  trash: ["dump"],
  donate: ["donate"],
};

function buildFacets(rows: InventoryItem[]) {
  const disposition: Record<string, number> = {};
  for (const item of rows) {
    disposition[item.disposition] = (disposition[item.disposition] ?? 0) + 1;
  }
  const groupCounts: Record<string, number> = {};
  for (const [group, dispositions] of Object.entries(dispositionFacetGroups)) {
    groupCounts[group] = dispositions.reduce(
      (sum, value) => sum + (disposition[value] ?? 0),
      0,
    );
  }
  return {
    disposition,
    total: rows.length,
    moving: groupCounts.moving ?? 0,
    sell: groupCounts.sell ?? 0,
    trash: groupCounts.trash ?? 0,
    donate: groupCounts.donate ?? 0,
  };
}

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  // The rebuilt table reads a single faceted query that returns both the rows
  // and the disposition facet counts. Transport resources are only needed for
  // the batch-assign menu and stay empty here.
  useQuery: (query: string) =>
    query === apiMock.items.facetedListForMove
      ? { items: mockItems.rows, facets: buildFacets(mockItems.rows) }
      : query === apiMock.transportResources.listForMoveWithZones
        ? []
        : query === apiMock.photos.listForMove
          ? []
          : undefined,
  useMutation: mockItems.useMutation,
  useAction: () => vi.fn(async () => ({ url: null })),
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

  it("shows the disposition facet, action controls, and dual record views", () => {
    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    // Headline disposition facet chips with live counts from the server facets.
    const facetGroup = screen.getByRole("group", {
      name: "Disposition filter",
    });
    for (const chip of ["All", "Moving", "Sell", "Trash", "Donate"]) {
      expect(
        within(facetGroup).getByRole("button", { name: new RegExp(chip) }),
      ).toBeInTheDocument();
    }
    // "All" is active by default and the single mover item lands in "Moving".
    expect(
      within(facetGroup).getByRole("button", { name: /All/ }),
    ).toHaveAttribute("aria-pressed", "true");

    // Action strip + counts.
    expect(screen.getByText("Inventory actions")).toBeInTheDocument();
    expect(screen.getByText("1 shown / 1 total")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulk paste" }),
    ).toBeInTheDocument();

    // Find/filter controls.
    expect(screen.getByText("Find and filter")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 records")).toBeInTheDocument();
    expect(screen.getByLabelText("Search inventory")).toBeInTheDocument();
    expect(screen.getByText("Columns")).toBeInTheDocument();

    // Records section + sortable headers.
    expect(screen.getByText("Inventory records")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by Room" }),
    ).toBeInTheDocument();

    // Records now render as compact, tappable rows (the whole row opens the
    // detail sheet, where editing lives). The detail-heavy columns/indicators
    // moved off the row to keep it short.
    expect(
      screen.getByRole("button", { name: "Open Walnut media console" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Walnut media console").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("uses browse action shortcuts to switch into intake workflows", async () => {
    const user = userEvent.setup();

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByRole("tab", { name: "Add" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByLabelText("New item name")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Browse: 1 record" }));
    await user.click(screen.getByRole("button", { name: "Bulk paste" }));

    expect(screen.getByRole("tab", { name: "Bulk paste" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
    ).toBeInTheDocument();
  });

  it("opens on browsing items and keeps add/import workflows separate", async () => {
    const user = userEvent.setup();

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Browse: 1 record" }),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByText(
        "Find, filter, sort, edit, and bulk update existing inventory records.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Walnut media console").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByLabelText("New item name")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add" }));
    expect(
      screen.getByText(
        "Create one item quickly when you already know the basic details.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New item name")).toBeInTheDocument();
    expect(screen.queryByText("Walnut media console")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Bulk paste" }));
    expect(
      screen.getByText(
        "Paste rough room notes and let the app turn them into inventory drafts.",
      ),
    ).toBeInTheDocument();
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

    expect(screen.getByRole("tab", { name: "Add" })).toHaveAttribute(
      "data-state",
      "active",
    );
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

    expect(screen.getByRole("tab", { name: "Bulk paste" })).toHaveAttribute(
      "data-state",
      "active",
    );
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
    expect(
      screen.queryByText(
        "Add inventory items or change the disposition facet, saved filter, and search terms.",
      ),
    ).not.toBeInTheDocument();
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
