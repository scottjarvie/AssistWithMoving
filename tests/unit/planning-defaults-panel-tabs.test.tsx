import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  movePlanningDefaults: {
    listForMove: "movePlanningDefaults.listForMove",
    ensureForMove: "movePlanningDefaults.ensureForMove",
  },
}));

const planningDefaultData = vi.hoisted(() => ({
  defaults: [
    {
      _id: "planning_default_1" as Id<"movePlanningDefaults">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      key: "firstNight",
      label: "First night",
      description: "Keep these easy to reach.",
      handling: "keepAccessible",
      sensitiveByDefault: false,
      recommendedResourceTypes: ["personalVehicle", "truck"],
      documentationProfileTypes: ["loadCrew", "movingCompany"],
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"movePlanningDefaults">,
  ],
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => planningDefaultData.mutation,
  useQuery: (query: string) =>
    query === apiMock.movePlanningDefaults.listForMove
      ? planningDefaultData.defaults
      : undefined,
}));

import { PlanningDefaultsPanel } from "@/components/planning-defaults-panel";

function renderPlanningDefaultsPanel() {
  render(
    <PlanningDefaultsPanel
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />,
  );
}

describe("PlanningDefaultsPanel task tabs", () => {
  it("opens on defaults and keeps privacy guidance behind its tab", async () => {
    const user = userEvent.setup();

    renderPlanningDefaultsPanel();

    expect(screen.getByRole("tab", { name: "Defaults" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("First night")).toBeInTheDocument();
    expect(screen.getByText("Keep these easy to reach.")).toBeInTheDocument();
    expect(screen.queryByText("Privacy posture")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Values, serials, private notes, and sensitive photos"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ensure/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Privacy" }));

    expect(screen.getByRole("tab", { name: "Privacy" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Privacy posture")).toBeInTheDocument();
    expect(
      screen.getByText(/Values, serials, private notes, and sensitive photos/),
    ).toBeInTheDocument();
    expect(screen.queryByText("First night")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ensure/i }),
    ).toBeInTheDocument();
  });
});
