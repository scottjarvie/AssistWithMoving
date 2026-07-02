import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { addMoveParticipant } from "../../convex/lib/moveParticipantWrite";

describe("addMoveParticipant", () => {
  it("preserves an existing participant's agent kill-switch and queue delegations", async () => {
    const actorUserId = "user_owner" as Id<"users">;
    const helperUserId = "user_helper" as Id<"users">;
    const existingOwnerId = "user_existing_owner" as Id<"users">;
    const participantId = "participant_1" as Id<"moveParticipants">;
    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const existingParticipant = {
      _id: participantId,
      householdId: "household_1" as Id<"households">,
      moveId: "move_1" as Id<"moves">,
      userId: helperUserId,
      role: "viewer",
      accessKind: "moveOnly",
      participantType: "helper",
      status: "disabled",
      agentAccessStatus: "disabled",
      canRunQueueForUserIds: [existingOwnerId],
      createdAt: 1,
      updatedAt: 1,
    };
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            unique: async () => {
              if (table === "users") {
                return {
                  _id: helperUserId,
                  email: "helper@example.com",
                  status: "active",
                };
              }
              if (table === "moveParticipants") return existingParticipant;
              return null;
            },
          }),
        }),
        patch: async (id: string, patch: Record<string, unknown>) => {
          patches.push({ id, patch });
        },
        insert: async (table: string, row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return "audit_1";
        },
      },
    };

    await addMoveParticipant(ctx as never, {
      householdId: "household_1" as Id<"households">,
      moveId: "move_1" as Id<"moves">,
      actorUserId,
      actorRole: "owner",
      email: "helper@example.com",
      participantType: "helper",
      role: "editor",
      accessKind: "moveOnly",
      canRunMyQueue: true,
      actorKind: "user",
    });

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      id: participantId,
      patch: {
        status: "active",
        canRunQueueForUserIds: [existingOwnerId, actorUserId],
      },
    });
    expect(patches[0].patch).not.toHaveProperty("agentAccessStatus");
    expect(inserts).toContainEqual(
      expect.objectContaining({
        table: "auditLogs",
        row: expect.objectContaining({
          action: "move_participant.reactivated_via_invite",
        }),
      }),
    );
  });
});
