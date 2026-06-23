import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  households: {
    listMembers: "households.listMembers",
    addExistingMember: "households.addExistingMember",
    updateMemberRole: "households.updateMemberRole",
    updateMemberApiAccess: "households.updateMemberApiAccess",
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
      apiAccessStatus: "enabled" as const,
      apiAccessAllowed: true,
      apiAccessReason: "Can create API keys and use keys they created.",
      activeApiKeyCount: 1,
      isCurrentUser: true,
    },
    {
      membershipId: "membership_helper" as Id<"householdMemberships">,
      invitationId: null,
      name: "Packing helper",
      email: "helper@example.com",
      role: "packer",
      status: "active",
      apiAccessStatus: "disabled" as const,
      apiAccessAllowed: false,
      apiAccessReason: "Role does not allow API key creation.",
      activeApiKeyCount: 0,
      isCurrentUser: false,
    },
    {
      membershipId: "membership_admin" as Id<"householdMemberships">,
      invitationId: null,
      name: "Admin helper",
      email: "admin@example.com",
      role: "admin",
      status: "active",
      apiAccessStatus: "enabled" as const,
      apiAccessAllowed: true,
      apiAccessReason: "Can create API keys and use keys they created.",
      activeApiKeyCount: 2,
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
    expect(
      screen.getByText(
        "Review current household access before changing roles or disabling a collaborator.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Scott Jarvie")).toHaveLength(2);
    expect(screen.getAllByText("Packing helper")).toHaveLength(2);
    expect(screen.getAllByText("Admin helper")).toHaveLength(2);
    expect(screen.getAllByText("API on")).toHaveLength(2);
    expect(screen.getAllByText("Enabled")).toHaveLength(2);
    expect(screen.getAllByText("API off")).toHaveLength(1);
    expect(screen.getAllByText("Disabled")).toHaveLength(1);
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
    expect(screen.getAllByText("API and agent access")).toHaveLength(2);
    expect(
      screen.getAllByText("Role does not allow API key creation."),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Disable API access" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", {
        name: "Manage access for admin@example.com",
      })[0],
    );

    expect(screen.getAllByText("API and agent access")).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Disable API access" }),
    ).toHaveLength(2);
    expect(screen.getAllByText(/2 active keys created by this member/)).toHaveLength(
      2,
    );

    await user.click(screen.getByRole("tab", { name: "Invite" }));

    expect(screen.getByRole("tab", { name: "Invite" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Invite one collaborator by email and choose the least access needed for their job.",
      ),
    ).toBeInTheDocument();
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
    expect(screen.queryByText("Admin helper")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Role for helper@example.com"),
    ).not.toBeInTheDocument();
  });
});
