import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { setMyQueueDelegationForPolicy } from "../../convex/moveParticipants";

const householdId = "household_1" as Id<"households">;
const moveId = "move_1" as Id<"moves">;
const otherMoveId = "move_2" as Id<"moves">;
const actorUserId = "user_owner" as Id<"users">;
const helperUserId = "user_helper" as Id<"users">;
const otherOwnerId = "user_other_owner" as Id<"users">;
const participantId = "participant_1" as Id<"moveParticipants">;

function userPolicy() {
  return {
    actor: {
      type: "user",
      userId: actorUserId,
      clerkUserId: "clerk_owner",
      appRole: "member",
    },
    householdId,
    moveId,
    role: "owner",
    accessKind: "householdBacked",
    visibility: {},
  } as never;
}

function apiKeyPolicy() {
  return {
    actor: {
      type: "apiKey",
      apiKeyId: "key_1",
      scopes: ["inventory:read"],
    },
    householdId,
    moveId,
    role: "owner",
    accessKind: "householdBacked",
    visibility: {},
  } as never;
}

function participant(overrides: Record<string, unknown> = {}) {
  return {
    _id: participantId,
    householdId,
    moveId,
    userId: helperUserId,
    role: "viewer",
    accessKind: "moveOnly",
    participantType: "helper",
    status: "active",
    agentAccessStatus: "enabled",
    canRunQueueForUserIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createCtx({
  participants = [],
  memberships = [],
}: {
  participants?: Record<string, unknown>[];
  memberships?: Record<string, unknown>[];
} = {}) {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const inserted = new Map<string, Record<string, unknown>>();

  const findById = (id: string) =>
    inserted.get(id) ??
    participants.find((entry) => entry._id === id) ??
    null;

  return {
    ctx: {
      db: {
        get: async (id: string) => findById(id),
        query: (table: string) => ({
          withIndex: (_index: string, build: (q: unknown) => unknown) => {
            const clauses: Array<{ field: string; value: unknown }> = [];
            const q = {
              eq: (field: string, value: unknown) => {
                clauses.push({ field, value });
                return q;
              },
            };
            build(q);
            return {
              unique: async () => {
                const rows =
                  table === "moveParticipants"
                    ? participants
                    : table === "householdMemberships"
                      ? memberships
                      : [];
                return (
                  rows.find((row) =>
                    clauses.every((clause) => row[clause.field] === clause.value),
                  ) ?? null
                );
              },
            };
          },
        }),
        insert: async (table: string, row: Record<string, unknown>) => {
          inserts.push({ table, row });
          const id =
            table === "moveParticipants"
              ? "participant_inserted"
              : `audit_${inserts.length}`;
          inserted.set(id, { _id: id, ...row });
          return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
          patches.push({ id, patch });
        },
      },
    },
    patches,
    inserts,
  };
}

describe("setMyQueueDelegationForPolicy", () => {
  it("rejects agents because queue sharing requires a signed-in user", async () => {
    const { ctx } = createCtx();

    await expect(
      setMyQueueDelegationForPolicy(
        ctx as never,
        { householdId, moveId, targetUserId: helperUserId, canRunMyQueue: true },
        apiKeyPolicy(),
      ),
    ).rejects.toThrow(/signed-in user/);
  });

  it("rejects self-delegation", async () => {
    const { ctx } = createCtx();

    await expect(
      setMyQueueDelegationForPolicy(
        ctx as never,
        { householdId, moveId, targetUserId: actorUserId, canRunMyQueue: true },
        userPolicy(),
      ),
    ).rejects.toThrow(/already run your own queue/);
  });

  it("rejects a participant from another move or household", async () => {
    const { ctx } = createCtx({
      participants: [
        participant({
          moveId: otherMoveId,
        }),
      ],
    });

    await expect(
      setMyQueueDelegationForPolicy(
        ctx as never,
        { householdId, moveId, participantId, canRunMyQueue: true },
        userPolicy(),
      ),
    ).rejects.toThrow(/active participant on this move/);
  });

  it("rejects a bare target user who is not active on the move or household", async () => {
    const { ctx } = createCtx({
      memberships: [
        {
          _id: "membership_1",
          householdId,
          userId: helperUserId,
          role: "viewer",
          status: "disabled",
        },
      ],
    });

    await expect(
      setMyQueueDelegationForPolicy(
        ctx as never,
        { householdId, moveId, targetUserId: helperUserId, canRunMyQueue: true },
        userPolicy(),
      ),
    ).rejects.toThrow(/active participant on this move/);
  });

  it("only adds and removes the caller's user id", async () => {
    const targetParticipant = participant({
      canRunQueueForUserIds: [otherOwnerId],
    });
    const { ctx, patches } = createCtx({
      participants: [targetParticipant],
    });

    await setMyQueueDelegationForPolicy(
      ctx as never,
      { householdId, moveId, participantId, canRunMyQueue: true },
      userPolicy(),
    );

    expect(patches[0]).toMatchObject({
      id: participantId,
      patch: {
        canRunQueueForUserIds: [otherOwnerId, actorUserId],
        updatedByUserId: actorUserId,
      },
    });

    (
      targetParticipant as { canRunQueueForUserIds: Id<"users">[] }
    ).canRunQueueForUserIds = [otherOwnerId, actorUserId];
    await setMyQueueDelegationForPolicy(
      ctx as never,
      { householdId, moveId, participantId, canRunMyQueue: false },
      userPolicy(),
    );

    expect(patches[1]).toMatchObject({
      id: participantId,
      patch: {
        canRunQueueForUserIds: [otherOwnerId],
        updatedByUserId: actorUserId,
      },
    });
  });
});
