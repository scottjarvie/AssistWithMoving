import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  estimates: {
    reportForMove: "estimates.reportForMove",
  },
}));

const reportData = vi.hoisted(() => ({
  report: {
    moveAllowanceLb: 8000,
    totalEstimatedWeightLb: 1220,
    totalEstimatedVolumeCuFt: 388,
    missingWeightCount: 2,
    missingVolumeCount: 1,
    roomTotals: [
      bucket("Garage", 4, 600, 120, 1, 0),
      bucket("Kitchen", 2, 180, 35, 0, 1),
    ],
    dispositionTotals: [
      bucket("keep", 5, 700, 200, 1, 1),
      bucket("donate", 1, 80, 12, 0, 0),
    ],
    ownerTotals: [],
    boxReports: [
      {
        boxId: "box_warning",
        code: "BOX-44",
        label: "Garage tools",
        room: "Garage",
        assignedResourceId: "resource_truck",
        assignedZoneId: "zone_truck_front",
        assignmentLocked: true,
        assignmentWarnings: ["capacity warning"],
        assignmentHardBlocks: ["restriction block"],
        itemCount: 4,
        estimatedWeightLb: 90,
        weightSource: "manual",
        weightSourceLabel: "manual estimate",
        estimatedVolumeCuFt: 14,
        warnings: ["overweightBox"],
      },
    ],
    resourceReports: [
      {
        resourceId: "resource_truck",
        name: "Rental truck",
        type: "movingTruck",
        estimatedWeightLb: 900,
        estimatedVolumeCuFt: 300,
        maxWeightLb: 2000,
        maxVolumeCuFt: 800,
        weightPercent: 45,
        volumePercent: 37.5,
      },
    ],
    zoneReports: [
      {
        zoneId: "zone_truck_front",
        resourceId: "resource_truck",
        name: "Truck front",
        estimatedWeightLb: 400,
        estimatedVolumeCuFt: 120,
      },
    ],
    itemEstimates: [
      {
        itemId: "item_missing",
        name: "Unmeasured bookcase",
        room: "Office",
        disposition: "keep",
        estimate: {
          warnings: ["missingWeightEstimate", "missingVolumeEstimate"],
        },
      },
    ],
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.estimates.reportForMove ? reportData.report : undefined,
}));

import { EstimateSummary } from "@/components/estimate-summary";

describe("EstimateSummary task tabs", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/inventory");
  });

  it("opens on overview and keeps dense estimate work behind focused tabs", async () => {
    const user = userEvent.setup();

    render(
      <EstimateSummary
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("1,220 lb")).toBeInTheDocument();
    expect(screen.getByText("Room and disposition rollup")).toBeInTheDocument();
    expect(screen.getByText("Review posture")).toBeInTheDocument();
    expect(screen.queryByText("Resource capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("BOX-44 - Garage tools")).not.toBeInTheDocument();
    expect(screen.queryByText("Unmeasured bookcase")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Capacity" }));
    expect(screen.getByText("Resource capacity")).toBeInTheDocument();
    expect(screen.getByText("Rental truck")).toBeInTheDocument();
    expect(screen.getByText("Truck front")).toBeInTheDocument();
    expect(screen.queryByText("BOX-44 - Garage tools")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Warnings" }));
    expect(screen.getByText("Estimate warnings")).toBeInTheDocument();
    expect(screen.getByText("BOX-44 - Garage tools")).toBeInTheDocument();
    expect(screen.getByText("overweightBox")).toBeInTheDocument();
    expect(screen.queryByText("Rental truck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Assumptions" }));
    expect(
      screen.getByText("Assumptions and missing estimates")
    ).toBeInTheDocument();
    expect(screen.getByText("Unmeasured bookcase")).toBeInTheDocument();
    expect(screen.getByText("missingWeightEstimate")).toBeInTheDocument();
    expect(screen.queryByText("BOX-44 - Garage tools")).not.toBeInTheDocument();
  });

  it("opens capacity from the estimate capacity hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/inventory#estimate-capacity"
    );

    render(
      <EstimateSummary
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Capacity" })).toHaveAttribute(
        "data-state",
        "active"
      );
    });

    expect(screen.getByText("Resource capacity")).toBeInTheDocument();
    expect(screen.getByText("Rental truck")).toBeInTheDocument();
    expect(screen.queryByText("Room and disposition rollup")).not.toBeInTheDocument();
  });

  it("opens warnings from the estimate warnings hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/inventory#estimate-warnings"
    );

    render(
      <EstimateSummary
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Warnings" })).toHaveAttribute(
        "data-state",
        "active"
      );
    });

    expect(screen.getByText("Estimate warnings")).toBeInTheDocument();
    expect(screen.getByText("BOX-44 - Garage tools")).toBeInTheDocument();
    expect(screen.queryByText("Rental truck")).not.toBeInTheDocument();
  });

  it("opens assumptions from the estimate assumptions hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/inventory#estimate-assumptions"
    );

    render(
      <EstimateSummary
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Assumptions" })).toHaveAttribute(
        "data-state",
        "active"
      );
    });

    expect(
      screen.getByText("Assumptions and missing estimates")
    ).toBeInTheDocument();
    expect(screen.getByText("Unmeasured bookcase")).toBeInTheDocument();
    expect(screen.queryByText("BOX-44 - Garage tools")).not.toBeInTheDocument();
  });
});

function bucket(
  label: string,
  itemCount: number,
  estimatedWeightLb: number,
  estimatedVolumeCuFt: number,
  missingWeightCount: number,
  missingVolumeCount: number
) {
  return {
    label,
    itemCount,
    estimatedWeightLb,
    estimatedVolumeCuFt,
    missingWeightCount,
    missingVolumeCount,
  };
}
