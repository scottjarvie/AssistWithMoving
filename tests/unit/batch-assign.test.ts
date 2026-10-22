import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { runBatchAssign } from "../../convex/lib/batchAssign";

type Row = Record<string, unknown> & { _id: string };

class FakeDb {
  readonly patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  readonly inserts: Array<{ table: string; value: Record<string, unknown> }> = [];

  constructor(private readonly tables: Record<string, Row[]>) {}

  async get(id: string) {
    for (const rows of Object.values(this.tables)) {
      const found = rows.find((row) => row._id === id);
      if (found) return found;
    }
    return null;
  }

  query(table: string) {
    const rows = this.tables[table] ?? [];
    return {
      withIndex: (_name: string, build: (query: unknown) => unknown) => {
        const clauses: Array<{ field: string; value: unknown }> = [];
        const query = {
          eq: (field: string, value: unknown) => {
            clauses.push({ field, value });
            return query;
          },
        };
        build(query);
        return {
          collect: async () =>
            rows.filter((row) =>
              clauses.every(({ field, value }) => row[field] === value),
            ),
        };
      },
    };
  }

  async patch(id: string, patch: Record<string, unknown>) {
    this.patches.push({ id, patch });
    const row = await this.get(id);
    if (!row) throw new Error("row not found");
    Object.assign(row, patch);
  }

  async insert(table: string, value: Record<string, unknown>) {
    this.inserts.push({ table, value });
    return `${table}_${this.inserts.length}`;
  }
}

const householdId = "household_1" as Id<"households">;
const moveId = "move_1" as Id<"moves">;
const actorUserId = "user_1" as Id<"users">;
const resourceId = "resource_1" as Id<"transportResources">;

function assignmentDb(capacity: Record<string, unknown> = { maxWeightLb: 100 }) {
  return new FakeDb({
    items: [
      {
        _id: "item_sofa",
        householdId,
        moveId,
        name: "Sofa",
        quantity: 1,
        planningDefaultKeys: [],
        fragility: "normal",
        assignmentLocked: false,
      },
      {
        _id: "item_locked",
        householdId,
        moveId,
        name: "Locked chair",
        quantity: 1,
        planningDefaultKeys: [],
        assignmentLocked: true,
      },
    ],
    boxes: [
      {
        _id: "box_sofa",
        householdId,
        moveId,
        code: "B-1",
        assignmentLocked: false,
      },
    ],
    boxItems: [
      {
        _id: "membership_sofa",
        householdId,
        moveId,
        boxId: "box_sofa",
        itemId: "item_sofa",
        quantity: 1,
      },
    ],
    transportResources: [
      {
        _id: resourceId,
        householdId,
        moveId,
        type: "truck",
        capacity,
      },
    ],
    transportZones: [],
    transportTrips: [],
    tripSpaces: [],
  });
}

function args(
  rows: Array<{ kind: "item" | "box"; recordId: Id<"items"> | Id<"boxes"> }>,
  target: Record<string, unknown> = { assignedResourceId: resourceId },
  dryRun = false,
) {
  return {
    householdId,
    moveId,
    actorUserId,
    rows,
    target,
    dryRun,
  } as never;
}

describe("batch assignment orchestration", () => {
  it("requires an override for over-capacity rows and keeps row failures isolated", async () => {
    const db = assignmentDb();
    const result = await runBatchAssign(
      { db: db as never } as unknown as MutationCtx,
      args(
        [
          { kind: "item", recordId: "item_sofa" as Id<"items"> },
          { kind: "box", recordId: "box_sofa" as Id<"boxes"> },
          { kind: "item", recordId: "item_locked" as Id<"items"> },
        ],
        { assignedResourceId: resourceId },
        true,
      ),
    );

    expect(result).toMatchObject({ total: 3, succeeded: 0, failed: 3, dryRun: true });
    expect(result.results[0]).toMatchObject({
      index: 0,
      ok: false,
      error: "Assignment warnings require an override reason.",
    });
    expect(result.results[1]).toMatchObject({
      index: 1,
      kind: "box",
      ok: false,
      error: "Assignment warnings require an override reason.",
    });
    expect(result.results[2]).toMatchObject({
      index: 2,
      ok: false,
      error: "Locked assignments must be changed manually.",
    });
    expect(db.patches).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("writes an approved assignment and records its validation warning", async () => {
    const db = assignmentDb();
    const result = await runBatchAssign(
      { db: db as never } as unknown as MutationCtx,
      args(
        [{ kind: "item", recordId: "item_sofa" as Id<"items"> }],
        {
          assignedResourceId: resourceId,
          assignmentOverrideReason: "Owner approved the load review.",
        },
      ),
    );

    expect(result).toMatchObject({ total: 1, succeeded: 1, failed: 0, dryRun: false });
    expect(result.results[0]?.assignmentWarnings).toContain(
      "resourceOverWeightCapacity",
    );
    expect(db.patches).toHaveLength(1);
    expect(db.patches[0]).toMatchObject({
      id: "item_sofa",
      patch: {
        assignedResourceId: resourceId,
        assignmentOverrideReason: "Owner approved the load review.",
        assignmentWarnings: expect.arrayContaining([
          "resourceOverWeightCapacity",
        ]),
        updatedByUserId: actorUserId,
      },
    });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      table: "auditLogs",
      value: {
        action: "assignment.batch_applied",
        objectTable: "items",
        objectId: "item_sofa",
      },
    });
  });

  it("validates successful dry runs without writing item or audit records", async () => {
    const db = assignmentDb({ maxWeightLb: 10_000 });
    const result = await runBatchAssign(
      { db: db as never } as unknown as MutationCtx,
      args(
        [{ kind: "item", recordId: "item_sofa" as Id<"items"> }],
        {
          assignedResourceId: resourceId,
          assignmentOverrideReason: "Owner reviewed the load.",
        },
        true,
      ),
    );

    expect(result).toMatchObject({ total: 1, succeeded: 1, failed: 0, dryRun: true });
    expect(db.patches).toEqual([]);
    expect(db.inserts).toEqual([]);
  });

  it("rejects assignments to resources outside the selected move", async () => {
    const db = assignmentDb();
    const result = await runBatchAssign(
      { db: db as never } as unknown as MutationCtx,
      args(
        [{ kind: "item", recordId: "item_sofa" as Id<"items"> }],
        { assignedResourceId: "resource_missing" as Id<"transportResources"> },
        true,
      ),
    );

    expect(result.results[0]).toMatchObject({
      ok: false,
      error: "Invalid transport resource.",
    });
    expect(db.patches).toEqual([]);
  });
});
