// @vitest-environment node
import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { accessFixture } from "../helpers/ai-access";

it("loads a member's active move in one query and reacts to move-only access", async () => {
  const f = await accessFixture();
  const read = () => f.person.query(api.moves.workspaceBootstrap, {});
  const initial = await read();
  expect(initial.householdId).toBe(f.householdId);
  expect(initial.households.map(({ household }) => household._id)).toEqual([f.householdId]);
  expect(initial.moves.map(move => move._id)).toEqual([f.moveId]);

  const participant = await f.t.run(async ctx => {
    await ctx.db.patch(f.membershipId, { status: "disabled" });
    return ctx.db.insert("moveParticipants", {
      householdId: f.householdId, moveId: f.moveId, userId: f.userId,
      role: "viewer", accessKind: "moveOnly", participantType: "helper",
      status: "active", createdAt: 1, updatedAt: 1,
    });
  });

  expect(await read()).toMatchObject({ householdId: f.householdId, households: [], moves: [{ _id: f.moveId }] });
  expect(await f.person.query(api.moves.getForLink, { moveId: f.moveId })).toMatchObject({ _id: f.moveId });
  await f.t.run(ctx => ctx.db.delete(participant));
  expect(await read()).toMatchObject({ householdId: null, households: [], moves: [] });
  expect(await f.person.query(api.moves.getForLink, { moveId: f.moveId })).toBeNull();
});
