import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  dispositionPipelines: {
    summaryForMove: "dispositionPipelines.summaryForMove",
  },
}));

const mockData = vi.hoisted(() => ({
  summary: {
    counts: {
      itemCount: 5,
      quantity: 7,
      actionCount: 5,
      readyCount: 3,
      activeShareLinkCount: 1,
      totalValueCents: 12500,
    },
    topActions: [
      {
        groupKey: "sell",
        groupLabel: "Sell",
        key: "salePhotosNeeded",
        label: "To photograph for sale",
        count: 2,
        severity: "warning",
        anchor: "#photos",
        help: "Add item photos before listing sale items.",
      },
    ],
    groups: [
      group("sell", "Sell", "Items intended for sale, listing, and buyer pickup."),
      group(
        "free",
        "Free / giveaway",
        "Items offered through a limited pickup or giveaway link."
      ),
      group("donate", "Donation", "Donation pickup, drop-off, and delivered records."),
      group(
        "dump",
        "Dump run",
        "Disposal items that need a dump or special-disposal run."
      ),
      group("storage", "Storage", "Items leaving the living space for storage inventory."),
    ],
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.dispositionPipelines.summaryForMove
      ? mockData.summary
      : undefined,
}));

import { DispositionPipelinePanel } from "@/components/disposition-pipeline-panel";

describe("DispositionPipelinePanel task tabs", () => {
  beforeEach(() => {
    mockData.summary.groups = [
      group("sell", "Sell", "Items intended for sale, listing, and buyer pickup."),
      group(
        "free",
        "Free / giveaway",
        "Items offered through a limited pickup or giveaway link."
      ),
      group("donate", "Donation", "Donation pickup, drop-off, and delivered records."),
      group(
        "dump",
        "Dump run",
        "Disposal items that need a dump or special-disposal run."
      ),
      group("storage", "Storage", "Items leaving the living space for storage inventory."),
    ];
  });

  it("opens on action queues and separates summary, shortcuts, and disposition categories", async () => {
    const user = userEvent.setup();

    render(
      <DispositionPipelinePanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByRole("tab", { name: "Actions" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("Sell: To photograph for sale")).toBeInTheDocument();
    expect(screen.queryByText("Pipeline items")).not.toBeInTheDocument();
    expect(screen.queryByText("Go fix disposition inputs")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Items intended for sale, listing, and buyer pickup.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByText("Pipeline items")).toBeInTheDocument();
    expect(screen.getByText("Owner value")).toBeInTheDocument();
    expect(screen.queryByText("Sell: To photograph for sale")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(screen.getByText("Go fix disposition inputs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "#inventory"
    );
    expect(screen.queryByText("Pipeline items")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Sell / free" }));
    expect(
      screen.getByText("Items intended for sale, listing, and buyer pickup.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Items offered through a limited pickup or giveaway link.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Donation pickup, drop-off, and delivered records.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Donation" }));
    expect(
      screen.getByText("Donation pickup, drop-off, and delivered records.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Items intended for sale, listing, and buyer pickup.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dump" }));
    expect(
      screen.getByText("Disposal items that need a dump or special-disposal run.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Storage" }));
    expect(
      screen.getByText("Items leaving the living space for storage inventory.")
    ).toBeInTheDocument();
  });
});

function group(key: string, label: string, description: string) {
  return {
    key,
    label,
    description,
    profileType: undefined,
    manifestKind: key === "dump" ? undefined : "sellFree",
    itemCount: 1,
    quantity: 1,
    totalValueCents: 2500,
    photoCount: 1,
    boxedCount: 1,
    assignedCount: 1,
    readyCount: 1,
    activeProfileCount: key === "dump" ? 0 : 1,
    activeShareLinkCount: key === "sell" ? 1 : 0,
    actions: [
      {
        key: `${key}Action`,
        label: `${label} action`,
        count: 1,
        severity: "info",
        anchor: "#inventory",
        help: `${label} help`,
      },
    ],
    highlights: [
      {
        itemId: `${key}-item`,
        name: `${label} item`,
        room: "Garage",
        category: "Household",
        status: "active",
        quantity: 1,
        hasPhoto: true,
        boxed: true,
        assignedToPipeline: true,
      },
    ],
  };
}
