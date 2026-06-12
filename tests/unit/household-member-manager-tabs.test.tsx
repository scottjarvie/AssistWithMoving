import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  households: {
    listMembers: "households.listMembers",
    addExistingMember: "households.addExistingMember",
    updateMemberRole: "households.updateMemberRole",
    disableMember: "households.disableMember",
    revokeInvitation: "households.revokeInvitation",
  },
}));

const householdMemberData = vi.hoisted(() => ({
  mutation: vi.fn(),
  members: [
    {
      membershipId: "membership_owner" as Id<"householdMemberships">,
      invitationId: null,
      name: "Scott Jarvie",
      email: "scott@example.com",
      role: "owner",
      status: "active",
      isCurrentUser: true,
    },
    {
      membershipId: "membership_helper" as Id<"householdMemberships">,
      invitationId: null,
      name: "Packing helper",
      email: "helper@example.com",
      role: "packer",
      status: "active",
      isCurrentUser: false,
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => householdMemberData.mutation,
  useQuery: (query: string) =>
    query === apiMock.households.listMembers
      ? householdMemberData.members
      : undefined,
}));

import { HouseholdMemberManager } from "@/components/household-member-manager";

describe("HouseholdMemberManager task tabs", () => {
  it("opens on current members and keeps invites behind a separate task", async () => {
    const user = userEvent.setup();

    render(
      <HouseholdMemberManager
        enabled
        households={[
          {
            household: {
              _id: "household_123" as Id<"households">,
              name: "Jarvie household",
            },
            role: "owner",
          },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getAllByText("Scott Jarvie")).toHaveLength(2);
    expect(screen.getAllByText("Packing helper")).toHaveLength(2);
    expect(
      screen.queryByLabelText("Role for helper@example.com"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Add collaborator email for Jarvie household"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/MovingManifest keeps a pending invitation/),
    ).not.toBeInTheDocument();

    const manageButtons = screen.getAllByRole("button", {
      name: "Manage access for helper@example.com",
    });
    expect(manageButtons).toHaveLength(2);

    await user.click(manageButtons[0]);

    expect(
      screen.getAllByLabelText("Role for helper@example.com"),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Disable access" }),
    ).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Invite" }));

    expect(screen.getByRole("tab", { name: "Invite" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByLabelText("Add collaborator email for Jarvie household"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("New collaborator role for Jarvie household"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/MovingManifest keeps a pending invitation/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Scott Jarvie")).not.toBeInTheDocument();
    expect(screen.queryByText("Packing helper")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Role for helper@example.com"),
    ).not.toBeInTheDocument();
  });
});
