import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const boxData = vi.hoisted(() => ({
  queryCall: 0,
  boxes: [
    {
      box: {
        _id: "box_1" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "B-001",
        label: "Garage tools",
        room: "Garage",
        destinationRoom: "Storage",
        description: "Hand tools and small parts",
        status: "sealed",
        estimatedVolumeCuFt: 4,
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
            boxId: "box_1" as Id<"boxes">,
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
            category: "Tools",
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
  ],
  items: [
    {
      _id: "item_1" as Id<"items">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Socket set",
      status: "packed",
      category: "Tools",
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
  ],
  resources: [],
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => {
    const results = [boxData.boxes, boxData.items, boxData.resources];
    const result = results[boxData.queryCall % results.length];
    boxData.queryCall += 1;
    return result;
  },
}));

vi.mock("@/components/photo-upload-control", () => ({
  PhotoUploadControl: () => <div>Photo upload control</div>,
}));

vi.mock("@/components/photo-evidence-strip", () => ({
  PhotoEvidenceStrip: () => <div>Photo evidence strip</div>,
}));

import { BoxManager } from "@/components/box-manager";

describe("BoxManager", () => {
  beforeEach(() => {
    boxData.queryCall = 0;
  });

  it("opens on box records and keeps per-box work in task tabs", async () => {
    const user = userEvent.setup();

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByRole("tab", { name: "Boxes" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("B-001")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Create box" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Item to add to box")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add box" }));
    expect(screen.getByRole("form", { name: "Create box" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Contents" }));
    expect(screen.getByLabelText("Item to add to box")).toBeInTheDocument();
    expect(screen.getAllByText("Socket set").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByLabelText("Box label")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated box weight in pounds")).toBeInTheDocument();
    expect(screen.queryByLabelText("Item to add to box")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Photos" }));
    expect(screen.getByText("Photo upload control")).toBeInTheDocument();
    expect(screen.getByText("Photo evidence strip")).toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Load" }));
    expect(screen.getByLabelText("Assigned transport resource")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignment override reason")).toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
  });
});
