import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConvexError } from "convex/values";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  movePeople: {
    listForMove: "movePeople.listForMove",
    create: "movePeople.create",
    update: "movePeople.update",
    archive: "movePeople.archive",
  },
}));

const peopleData = vi.hoisted(() => ({
  people: [
    {
      _id: "person_1" as Id<"movePeople">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Riley Helper",
      role: "helper",
      email: "riley@example.com",
      phone: "555-0101",
      notes: "Available Saturday morning.",
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"movePeople">,
  ],
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => peopleData.mutation,
  useQuery: (query: string) =>
    query === apiMock.movePeople.listForMove ? peopleData.people : undefined,
}));

import { MovePeopleManager } from "@/components/move-people-manager";

function renderMovePeopleManager() {
  render(
    <MovePeopleManager
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />,
  );
}

describe("MovePeopleManager task tabs", () => {
  beforeEach(() => {
    peopleData.mutation.mockReset();
  });

  it("shows the clean ConvexError reason when saving a contact fails", async () => {
    const user = userEvent.setup();
    peopleData.mutation.mockRejectedValueOnce(
      new ConvexError("Contact name is required."),
    );

    renderMovePeopleManager();

    await user.click(
      screen.getAllByRole("button", { name: "Edit Riley Helper" })[0],
    );
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    const status = await screen.findByText("Contact name is required.");
    expect(status).toBeInTheDocument();
    // Negative guard: the verbose Convex client wrapper (function path,
    // request id) must never reach the UI.
    expect(document.body.textContent).not.toMatch(/Request ID|CONVEX/);
  });

  it("opens on contact records and keeps contact creation separate", async () => {
    const user = userEvent.setup();

    renderMovePeopleManager();

    expect(screen.getByRole("tab", { name: "Contacts" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Review the people, offices, movers, helpers, and claim contacts already tied to this move.",
      ),
    ).toBeInTheDocument();
    const contactCards = screen.getByRole("list", {
      name: "Move contact cards",
    });
    const contactCard = within(contactCards).getByRole("listitem");
    expect(within(contactCard).getByText("Riley Helper")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Contact name for Riley Helper"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Contact email for Riley Helper"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contact notes")).not.toBeInTheDocument();

    await user.click(
      within(contactCard).getByRole("button", { name: "Edit Riley Helper" }),
    );

    expect(
      screen.getAllByLabelText("Contact name for Riley Helper"),
    ).toHaveLength(2);
    expect(
      screen.getAllByLabelText("Contact email for Riley Helper"),
    ).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Add contact" }));

    expect(
      screen.getByText(
        "Add one new move contact without mixing the form into the active contact list.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Contact name")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact role")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact notes")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Contact name for Riley Helper"),
    ).not.toBeInTheDocument();
  });
});
