import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import {
  claimQueueItem,
  completeQueueItem,
  createQueueItem,
  provideQueueInput,
  reportQueueFailure,
  requestQueueInput,
  shapeQueueItem,
  type QueueAccessActor,
} from "../../convex/lib/queueService";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

class FakeDb {
  tables = new Map<string, Row[]>();
  counter = 0;

  query(table: string) {
    const conditions: Array<[string, unknown]> = [];
    const chain = {
      withIndex: (_name: string, build?: (q: unknown) => unknown) => {
        const builder = {
          eq: (field: string, value: unknown) => {
            conditions.push([field, value]);
            return builder;
          },
        };
        build?.(builder);
        return chain;
      },
      unique: async () => {
        const rows = (this.tables.get(table) ?? []).filter((row) =>
          conditions.every(([field, value]) => row[field] === value),
        );
        if (rows.length > 1) throw new Error("fake unique violation");
        return rows[0] ?? null;
      },
    };
    return chain;
  }

  async insert(table: string, value: Record<string, unknown>) {
    const id = `${table}_${++this.counter}`;
    const row = { ...value, _id: id, _creationTime: this.counter } as Row;
    this.tables.set(table, [...(this.tables.get(table) ?? []), row]);
    return id;
  }

  async get(id: string) {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id);
      if (row) return row;
    }
    return null;
  }

  async patch(id: string, patch: Record<string, unknown>) {
    const row = await this.get(id);
    if (!row) throw new Error("row not found");
    Object.assign(row, patch);
  }
}

describe("Queue service integration", () => {
  it("runs an attributable, idempotent human/AI lifecycle with retries", async () => {
    const db = new FakeDb();
    const ctx = { db } as unknown as MutationCtx;
    const householdId = "household_1" as Id<"households">;
    const moveId = "move_1" as Id<"moves">;
    const userId = "user_1" as Id<"users">;
    const apiKeyId = "key_1" as Id<"apiKeys">;
    const human: QueueAccessActor = {
      userId,
      actorType: "user",
      label: "Scott",
      isManager: false,
      delegatedOwnerIds: [],
    };
    const agent: QueueAccessActor = {
      userId,
      apiKeyId,
      actorType: "apiKey",
      label: "Moving helper",
      isManager: false,
      delegatedOwnerIds: [],
    };

    const created = await createQueueItem(ctx, human, {
      householdId,
      moveId,
      directive: "Compare the two mover estimates and record the differences.",
      contextKind: "move",
      idempotencyKey: "create-1",
      maxAttempts: 2,
    });
    const replayedCreate = await createQueueItem(ctx, human, {
      householdId,
      moveId,
      directive: "Compare the two mover estimates and record the differences.",
      idempotencyKey: "create-1",
    });
    expect(replayedCreate._id).toBe(created._id);
    expect(shapeQueueItem(created).stateLabel).toBe("Waiting for your AI");

    const claimed = await claimQueueItem(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      nextStep: "Read both estimates and normalize line items.",
      expectedVersion: 1,
      idempotencyKey: "claim-1",
    });
    expect(claimed.state).toBe("working");
    expect(claimed.claimedByApiKeyId).toBe(apiKeyId);
    const replayedClaim = await claimQueueItem(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      nextStep: "Read both estimates and normalize line items.",
      expectedVersion: 1,
      idempotencyKey: "claim-1",
    });
    expect(replayedClaim.version).toBe(2);
    await expect(
      claimQueueItem(ctx, agent, {
        householdId,
        moveId,
        queueItemId: created._id,
        nextStep: "Duplicate stale claim",
        expectedVersion: 1,
        idempotencyKey: "claim-stale",
      }),
    ).rejects.toThrow(/changed since|Cannot move/i);

    const retry = await reportQueueFailure(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      code: "source_temporarily_unavailable",
      message: "The second uploaded estimate is not readable yet.",
      retryable: true,
      retryAfterMs: 0,
      expectedVersion: 2,
      idempotencyKey: "failure-1",
    });
    expect(retry.state).toBe("waitingForAi");
    expect(retry.waitingReason).toBe("retryScheduled");
    expect(retry.attemptCount).toBe(1);

    const reclaimed = await claimQueueItem(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      nextStep: "Retry the second estimate and compare totals.",
      expectedVersion: 3,
      idempotencyKey: "claim-2",
    });
    const needsYou = await requestQueueInput(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      requiredAction: "Upload the missing page 3 from the Blue Van estimate.",
      expectedVersion: reclaimed.version,
      idempotencyKey: "needs-you-1",
    });
    expect(needsYou.state).toBe("needsYou");
    expect(needsYou.requiredAction).toMatch(/page 3/);

    const answered = await provideQueueInput(ctx, human, {
      householdId,
      moveId,
      queueItemId: created._id,
      response: "Page 3 is now attached to the move documents.",
      expectedVersion: needsYou.version,
      idempotencyKey: "answer-1",
    });
    expect(answered.state).toBe("waitingForAi");

    const finalClaim = await claimQueueItem(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      nextStep: "Finish the normalized comparison with the new page.",
      expectedVersion: answered.version,
      idempotencyKey: "claim-3",
    });
    const resultItemId = (await db.insert("items", {
      householdId,
      moveId,
      name: "Mover comparison record",
    })) as Id<"items">;
    const done = await completeQueueItem(ctx, agent, {
      householdId,
      moveId,
      queueItemId: created._id,
      resultSummary:
        "Blue Van is $420 less; North Star includes packing materials and two extra labor hours.",
      resultRefs: [{ type: "item", id: resultItemId, label: "Mover comparison" }],
      expectedVersion: finalClaim.version,
      idempotencyKey: "complete-1",
    });
    expect(done.state).toBe("done");
    expect(done.terminalReason).toBe("completed");

    const activities = db.tables.get("queueActivities") ?? [];
    expect(activities.map((activity) => activity.type)).toEqual([
      "created",
      "claimed",
      "retryScheduled",
      "claimed",
      "inputRequested",
      "inputProvided",
      "claimed",
      "completed",
    ]);
    expect(db.tables.get("auditLogs")).toHaveLength(activities.length);
  });

  it("enforces owner/delegation access before a claim", async () => {
    const db = new FakeDb();
    const ctx = { db } as unknown as MutationCtx;
    const ownerId = "owner" as Id<"users">;
    const otherId = "other" as Id<"users">;
    const householdId = "household" as Id<"households">;
    const moveId = "move" as Id<"moves">;
    const owner: QueueAccessActor = {
      userId: ownerId,
      actorType: "user",
      isManager: false,
      delegatedOwnerIds: [],
    };
    const other: QueueAccessActor = {
      userId: otherId,
      actorType: "agent",
      isManager: false,
      delegatedOwnerIds: [],
    };
    const item = await createQueueItem(ctx, owner, {
      householdId,
      moveId,
      directive: "Inventory the garage shelf.",
    });
    await claimQueueItem(ctx, { ...owner, actorType: "agent" }, {
      householdId,
      moveId,
      queueItemId: item._id,
      nextStep: "Start the owner's inventory",
      expectedVersion: 1,
      idempotencyKey: "known-claim-key",
    });
    await expect(
      claimQueueItem(ctx, other, {
        householdId,
        moveId,
        queueItemId: item._id,
        nextStep: "Start inventory",
        expectedVersion: 2,
        idempotencyKey: "known-claim-key",
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("records an expired lease before transparently reclaiming the handoff", async () => {
    const db = new FakeDb();
    const ctx = { db } as unknown as MutationCtx;
    const householdId = "household" as Id<"households">;
    const moveId = "move" as Id<"moves">;
    const userId = "user" as Id<"users">;
    const actor: QueueAccessActor = {
      userId,
      actorType: "agent",
      isManager: false,
      delegatedOwnerIds: [],
    };
    const item = await createQueueItem(ctx, { ...actor, actorType: "user" }, {
      householdId,
      moveId,
      directive: "Review the storage estimate.",
    });
    const firstClaim = await claimQueueItem(ctx, actor, {
      householdId,
      moveId,
      queueItemId: item._id,
      nextStep: "Open the estimate.",
      expectedVersion: 1,
      idempotencyKey: "claim-1",
    });
    await db.patch(item._id, { claimExpiresAt: 0 });

    await claimQueueItem(ctx, actor, {
      householdId,
      moveId,
      queueItemId: item._id,
      nextStep: "Resume the estimate review.",
      expectedVersion: firstClaim.version,
      idempotencyKey: "claim-2",
    });

    expect(
      (db.tables.get("queueActivities") ?? []).map((activity) => activity.type),
    ).toEqual(["created", "claimed", "released", "claimed"]);
  });

  it("rejects result references from another move", async () => {
    const db = new FakeDb();
    const ctx = { db } as unknown as MutationCtx;
    const householdId = "household" as Id<"households">;
    const moveId = "move_a" as Id<"moves">;
    const userId = "user" as Id<"users">;
    const actor: QueueAccessActor = {
      userId,
      actorType: "agent",
      isManager: false,
      delegatedOwnerIds: [],
    };
    const item = await createQueueItem(ctx, { ...actor, actorType: "user" }, {
      householdId,
      moveId,
      directive: "Summarize the packing exception.",
    });
    const claimed = await claimQueueItem(ctx, actor, {
      householdId,
      moveId,
      queueItemId: item._id,
      nextStep: "Read the exception record.",
      expectedVersion: 1,
      idempotencyKey: "claim",
    });
    const foreignItemId = (await db.insert("items", {
      householdId,
      moveId: "move_b",
      name: "Foreign record",
    })) as Id<"items">;
    await expect(
      completeQueueItem(ctx, actor, {
        householdId,
        moveId,
        queueItemId: item._id,
        resultRefs: [{ type: "item", id: foreignItemId }],
        expectedVersion: claimed.version,
        idempotencyKey: "complete",
      }),
    ).rejects.toThrow(/does not belong to this move/i);

    await expect(
      completeQueueItem(ctx, actor, {
        householdId,
        moveId,
        queueItemId: item._id,
        resultRefs: Array.from({ length: 51 }, (_, index) => ({
          type: "item",
          id: `item_${index}`,
        })),
        expectedVersion: claimed.version,
        idempotencyKey: "too-many-result-refs",
      }),
    ).rejects.toThrow(/at most 50/i);

    await expect(
      completeQueueItem(ctx, actor, {
        householdId,
        moveId,
        queueItemId: item._id,
        resultRefs: [null] as never,
        expectedVersion: claimed.version,
        idempotencyKey: "malformed-result-ref",
      }),
    ).rejects.toThrow(/string type and id/i);
  });
});
