import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  moves: { updateBasics: "moves.updateBasics" },
}));
const updateBasics = vi.hoisted(() => vi.fn());

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) => {
    if (mutation === apiMock.moves.updateBasics) {
      return updateBasics;
    }
    return vi.fn();
  },
}));

import { LocationConfigCard } from "@/components/configure/location-config-card";

describe("LocationConfigCard", () => {
  beforeEach(() => {
    updateBasics.mockReset();
  });

  it("shows a ConvexError message when address saving fails", async () => {
    const user = userEvent.setup();
    updateBasics.mockRejectedValueOnce(
      new ConvexError("That address could not be parsed"),
    );

    render(
      <LocationConfigCard
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        side="start"
        location={undefined}
      />,
    );

    await user.type(screen.getByLabelText("Start address label"), "Home");
    await user.click(screen.getByRole("button", { name: "Save address" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "That address could not be parsed",
    );
  });
});
