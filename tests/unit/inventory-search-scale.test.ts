// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- optional emulator read-volume instrumentation wraps Convex query builders. */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { searchItems, searchBoxes } from "../../convex/lib/inventorySearch";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
async function fixture(size: number) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: "synthetic-search", email: "search@example.test", name: "Synthetic", appRole: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 });
    const householdId = await ctx.db.insert("households", { name: "Synthetic", createdByUserId: userId, ownerUserId: userId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdByUserId: userId, createdAt: 1, updatedAt: 1 });
    const move = { householdId, title: "Synthetic cross country move", type: "longDistance" as const, status: "planning" as const, unitSystem: "imperial" as const, createdByUserId: userId, createdAt: 1, updatedAt: 1 };
    const moveId = await ctx.db.insert("moves", move);
    const hiddenMoveId = await ctx.db.insert("moves", move);
    for (const id of [moveId, hiddenMoveId]) {
      for (let i = 0; i < size; i++) {
        const name = i === 0 ? "Vintage blender" : `Synthetic plate ${i}`;
        await ctx.db.insert("items", { householdId, moveId: id, name, normalizedName: name.toLowerCase(), room: "Kitchen", category: "Appliances", description: i === 1 ? "Old keepsake mixer" : "", disposition: "take", status: "active", quantity: 1, needsReview: false, condition: "unknown", weightConfidence: "none", volumeConfidence: "none", fragility: "low", stackable: false, hazardousFlag: false, highValue: false, requiresPersonalTransport: false, planningDefaultKeys: [], reviewFlags: [], aiTags: [], createdVia: "manual", updatedByUserId: userId, createdByUserId: userId, createdAt: i + 1, updatedAt: i + 1 });
      }
      for (let i = 0; i < Math.min(size, 300); i++) {
        await ctx.db.insert("boxes", { householdId, moveId: id, code: `B-${i}`, label: i === 0 ? "Blender supplies" : "", nickname: "", room: "Kitchen", description: "", status: "open", createdByUserId: userId, createdAt: i + 1, updatedAt: i + 1 });
      }
    }
    return { householdId, moveId };
  });
  return { t, ...ids };
}

describe("source-index inventory search", () => {
  for (const size of [60, 1500, 5000]) {
    it(`finds old inventory without leaking another move (${size} items)`, async () => {
      const f = await fixture(size);
      if (process.env.MOVING_SEARCH_BENCH) {
        for (const after of [false, true]) {
          const stats = { documents: 0, jsonBytes: 0, ranges: 0 };
          const start = performance.now();
          const reply = await f.t.run(async ctx => {
            const wrap = (builder: any): any => new Proxy(builder, { get(target, key) {
              if (key === "take") return async (n: number) => {
                stats.ranges++;
                const rows = await target.take(n);
                stats.documents += rows.length;
                stats.jsonBytes += Buffer.byteLength(JSON.stringify(rows));
                return rows;
              };
              const value = target[key];
              return typeof value === "function" ? (...args: any[]) => wrap(value.apply(target, args)) : value;
            } });
            const measured = { ...ctx, db: new Proxy(ctx.db, { get(target, key) {
              if (key === "query") return (table: string) => wrap((target.query as any)(table));
              return Reflect.get(target, key);
            } }) };
            if (after) return (await searchItems(measured, f.moveId, "blender")).rows.map(row => ({ id: row._id, title: row.name }));
            const rows = await measured.db.query("items").withIndex("by_move_updated", q => q.eq("moveId", f.moveId)).order("desc").take(120);
            return rows.filter(row => row.name.toLowerCase().includes("blender")).map(row => ({ id: row._id, title: row.name }));
          });
          console.log(JSON.stringify({ size, after, ...stats, emulatorMs: performance.now() - start, projectedReplyBytes: Buffer.byteLength(JSON.stringify(reply)), matches: reply.length }));
        }
      }
      const found = await f.t.run(ctx => searchItems(ctx, f.moveId, "blender"));
      expect(found.rows.map(row => row.name)).toEqual(["Vintage blender"]);
      expect(found.truncated).toBe(false);
      expect(found.rows.every(row => row.moveId === f.moveId)).toBe(true);
      const description = await f.t.run(ctx => searchItems(ctx, f.moveId, "keepsake"));
      expect(description.rows).toHaveLength(1);
      const boxes = await f.t.run(ctx => searchBoxes(ctx, f.moveId, "blender"));
      expect(boxes.rows.map(row => row.label)).toEqual(["Blender supplies"]);
      const legacy = await f.t.query(internal.mcpToolsWrite.searchInventory, { caller: { subject: "synthetic-search" }, ...{ householdId: f.householdId, moveId: f.moveId }, query: "blender", room: "Kitchen", needsReview: false });
      expect(legacy.map(row => row.name)).toEqual(["Vintage blender"]);
      await f.t.run(async ctx => { await ctx.db.patch(found.rows[0]._id, { deletedAt: 123 }); await ctx.db.patch(boxes.rows[0]._id, { archivedAt: 123 }); });
      expect((await f.t.run(ctx => searchItems(ctx, f.moveId, "blender"))).rows).toHaveLength(0);
      expect((await f.t.run(ctx => searchBoxes(ctx, f.moveId, "blender"))).rows).toHaveLength(0);
    }, 60000);
  }
  it("signals broad hit caps instead of claiming completeness", async () => {
    const f = await fixture(150);
    const found = await f.t.run(ctx => searchItems(ctx, f.moveId, "plate"));
    expect(found.rows).toHaveLength(50);
    expect(found.truncated).toBe(true);
    const noQuery = await f.t.run(ctx => searchItems(ctx, f.moveId, ""));
    expect(noQuery.rows).toHaveLength(120);
    expect(noQuery.truncated).toBe(true);
  });
});
