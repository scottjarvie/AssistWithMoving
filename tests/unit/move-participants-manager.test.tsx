import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  moveParticipants: {
    listForMove: "moveParticipants.listForMove",
    invite: "moveParticipants.invite",
    update: "moveParticipants.update",
    setMyQueueDelegation: "moveParticipants.setMyQueueDelegation",
    setStatus: "moveParticipants.setStatus",
  },
  households: {
    updateMemberRole: "households.updateMemberRole",
    disableMember: "households.disableMember",
  },
  movePeople: {
    create: "movePeople.create",
    archive: "movePeople.archive",
  },
}));

const data = vi.hoisted(() => ({
  result: {
    canManage: true,
    accessKind: "householdBacked" as const,
    presets: [],
    contacts: [],
    people: [
      {
        key: "member:self",
        kind: "householdMember" as const,
        participantId: null,
        membershipId: "mem_self" as Id<"householdMemberships">,
        userId: "user_scott" as Id<"users">,
        name: "Scott Jarvie",
        email: "scott@thejarvie.com",
        imageUrl: null,
        role: "owner" as const,
        accessKind: "householdBacked" as const,
        participantType: "householdMember" as const,
        status: "active" as const,
        agentAccessStatus: "enabled" as const,
        canRunQueueForUserIds: [],
        isSelf: true,
      },
      {
        key: "member:m1",
        kind: "householdMember" as const,
        participantId: null,
        membershipId: "mem_1" as Id<"householdMemberships">,
        userId: "user_erin" as Id<"users">,
        name: "Erin Jarvie",
        email: "erin@thejarvie.com",
        imageUrl: null,
        role: "editor" as const,
        accessKind: "householdBacked" as const,
        participantType: "householdMember" as const,
        status: "active" as const,
        agentAccessStatus: "enabled" as const,
        canRunQueueForUserIds: [],
        isSelf: false,
      },
      {
        key: "participant:p1",
        kind: "pendingInvite" as const,
        participantId: "part_1" as Id<"moveParticipants">,
        membershipId: null,
        userId: null,
        name: "ACME Movers",
        email: "crew@acme.example",
        imageUrl: null,
        role: "viewer" as const,
        accessKind: "moveOnly" as const,
        participantType: "mover" as const,
        status: "invited" as const,
        agentAccessStatus: "enabled" as const,
        canRunQueueForUserIds: [],
        isSelf: false,
      },
    ],
  },
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({ api: apiMock }));

vi.mock("convex/react", () => ({
  useMutation: () => data.mutation,
  useQuery: (query: string) =>
    query === apiMock.moveParticipants.listForMove ? data.result : undefined,
}));

import { MoveParticipantsManager } from "@/components/move-participants-manager";

beforeEach(() => {
  data.mutation.mockReset();
  data.mutation.mockResolvedValue(undefined);
});

describe("MoveParticipantsManager", () => {
  const householdId = "household_123" as Id<"households">;
  const moveId = "move_123" as Id<"moves">;

  it("renders the add-person form and the people roster for a manager", () => {
    render(
      <MoveParticipantsManager householdId={householdId} moveId={moveId} />,
    );

    // The add-person affordance (manager-only).
    expect(
      screen.getByLabelText("Person's email"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Participant type")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add person/i }),
    ).toBeInTheDocument();

    // The roster shows a household member (all-moves access) and a walled-off
    // pending mover (this move only).
    expect(screen.getByText("Erin Jarvie")).toBeInTheDocument();
    expect(screen.getByText("ACME Movers")).toBeInTheDocument();
    expect(screen.getAllByText("All your moves").length).toBeGreaterThan(0);
    expect(screen.getByText("This move only")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("shares only the viewer's own queue through the consent mutation", async () => {
    const user = userEvent.setup();
    render(
      <MoveParticipantsManager householdId={householdId} moveId={moveId} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Let them run my queue" }),
    );

    expect(data.mutation).toHaveBeenCalledWith({
      householdId,
      moveId,
      participantId: undefined,
      targetUserId: "user_erin",
      canRunMyQueue: true,
    });
  });
});
