import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  moveSpaces: {
    listForMove: "moveSpaces.listForMove",
    create: "moveSpaces.create",
    update: "moveSpaces.update",
  },
}));

const areasData = vi.hoisted(() => ({
  spaces: [
    {
      _id: "space_1" as Id<"moveSpaces">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Garage",
      kind: "originRoom",
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"moveSpaces">,
  ],
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => areasData.mutation,
  useQuery: (query: string) =>
    query === apiMock.moveSpaces.listForMove ? areasData.spaces : undefined,
}));

import { MoveAreasPanel } from "@/components/configure/move-areas-panel";

describe("MoveAreasPanel space edit path", () => {
  beforeEach(() => {
    areasData.mutation.mockReset();
  });

  it("closes the capacity edit with Escape without saving", async () => {
    const user = userEvent.setup();

    render(
      <MoveAreasPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        kind="originRoom"
        title="Start areas"
        description="Rooms being packed."
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Garage floor"), "2nd");
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("button", { name: "Save area" }),
    ).not.toBeInTheDocument();
    expect(areasData.mutation).not.toHaveBeenCalled();
  });

  it("shows the clean ConvexError reason when the capacity edit fails", async () => {
    const user = userEvent.setup();
    areasData.mutation.mockRejectedValueOnce(
      new ConvexError("Space name is required."),
    );

    render(
      <MoveAreasPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        kind="originRoom"
        title="Start areas"
        description="Rooms being packed."
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save area" }));

    // The rejection renders inline instead of becoming an unhandled promise
    // rejection with no UI feedback.
    expect(
      await screen.findByText("Space name is required."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Request ID|CONVEX/);
    // Negative guard: the edit form stays open so the user can retry.
    expect(screen.getByRole("button", { name: "Save area" })).toBeInTheDocument();
  });
});
