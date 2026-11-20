// @vitest-environment node
import type { FunctionReference } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createLegacyGrantGate } from "../../convex/http";
import { authenticateApiKey } from "../../convex/lib/apiKeyAuth";
import { ACCOUNT_DELETION_CONFIRMATION } from "../../convex/lib/accountPrivacy";
import { accessFixture } from "../helpers/ai-access";
import { nativeWebsiteIdentity } from "../helpers/website-session";

const subject = "synthetic-room-owner";
const issuer = "https://room-history.example.test";
const fixture = () => accessFixture(subject);

async function roomFixture() {
  const f = await fixture();
  const scope = { householdId: f.householdId, moveId: f.moveId };
  const createRoom = (name = "Synthetic studio") =>
    f.person.mutation(api.moveSpaces.create, { ...scope, kind: "originRoom", name });
  const spaceId = await createRoom();
  const args = { ...scope, spaceId };
  const read = (limit = 12) => f.person.query(api.moveSpaces.history, { ...args, limit });
  const receipts = () => f.t.run(ctx => ctx.db.query("auditLogs").withIndex("by_object_time", q =>
    q.eq("objectTable", "moveSpaces").eq("objectId", spaceId)).collect());
  return { ...f, scope, args, spaceId, read, receipts, createRoom };
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("rechecks household and move-only roles, field visibility, and scope on each read", async () => {
  const f = await roomFixture();
  const [participantId, membershipId] = await f.t.run(async ctx => {
    const now = Date.now();
    const createUser = (clerkUserId: string) => ctx.db.insert("users", {
      clerkUserId, name: "Synthetic member", appRole: "member", status: "active",
      createdAt: now, updatedAt: now, lastSeenAt: now,
    });
    return [
      await ctx.db.insert("moveParticipants", {
        ...f.scope, userId: await createUser("mover"), role: "viewer",
        accessKind: "moveOnly", participantType: "mover", status: "active",
        createdAt: now, updatedAt: now,
      }),
      await ctx.db.insert("householdMemberships", {
        householdId: f.householdId, userId: await createUser("editor"), role: "editor",
        status: "active", createdAt: now, updatedAt: now,
      }),
      await createUser("unrelated"),
    ];
  });
  const viewAs = (user: string, limit = 12) => f.t.withIdentity(nativeWebsiteIdentity(user)).query(api.moveSpaces.history, { ...f.args, limit });
  await f.person.mutation(api.moveSpaces.update, { ...f.args, floorLevel: "Synthetic address 123", notes: "Synthetic private note" });
  await f.person.mutation(api.moveSpaces.update, { ...f.args, floorLevel: "Synthetic address 123", notes: "Synthetic private note" });

  expect((await f.read())?.rows[0]).toMatchObject({
    fields: ["notes", "floorLevel"], operation: "updated", actor: { label: "Person" },
    transport: "web", source: "manual", evidence: "unknown",
  });
  expect((await viewAs("editor"))?.rows[0].fields).toContain("notes");
  expect((await viewAs("mover"))?.rows[0]).toMatchObject({
    fields: ["floorLevel"], actor: { label: "Editor unavailable" }, source: "unknown",
  });
  expect((await f.read())?.rows).toHaveLength(2);
  expect(await f.receipts()).toHaveLength(3);
  expect(JSON.stringify(await f.read())).not.toMatch(/Synthetic|address 123|private note/);
  await expect(f.t.withIdentity(nativeWebsiteIdentity("mover")).mutation(api.moveSpaces.update, {
    ...f.args, floorLevel: "Refused",
  })).rejects.toThrow();
  expect(await f.receipts()).toHaveLength(3);

  await f.t.run(async ctx => {
    await ctx.db.patch(participantId, { status: "disabled" });
    await ctx.db.patch(membershipId, { role: "viewer" });
  });
  expect(await viewAs("mover", 24)).toBeNull();
  expect((await viewAs("editor"))?.rows[0].fields).toEqual(["floorLevel"]);
  expect(await viewAs("unrelated")).toBeNull();
  expect(await f.t.query(api.moveSpaces.history, { ...f.args, limit: 12 })).toBeNull();
  const another = await f.t.run(ctx => ctx.db.insert("moves", {
    householdId: f.householdId, title: "Other move", type: "local", status: "planning",
    unitSystem: "imperial", createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  expect(await f.person.query(api.moveSpaces.history, { ...f.args, moveId: another, limit: 12 })).toBeNull();
});

async function connect(f: Awaited<ReturnType<typeof roomFixture>>, clientId: string) {
  await f.connect(clientId, "https://untrusted-name.example.test/branded");
  return (await f.connection(clientId))!.grantId!;
}

it("pins canonical saves, preserves native replay, and never resolves an old stamp to a replacement", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  const f = await roomFixture();
  const firstClient = "https://client.example.test/#never-project-this";
  const clientId = "synthetic-ai-one";
  const original = await connect(f, clientId);
  const second = await connect(f, "synthetic-ai-two");
  const save = (operationId: string, expectedRoomGrantId = original, verifiedClient = clientId, notes = "Private synthetic notes") =>
    f.t.mutation(internal.mcpPlanning.saveMoveContext, {
      principal: { subject, issuer, clientId: verifiedClient, clientName: firstClient },
      moveId: f.moveId, operationId, expectedRoomGrantId, requestHash: operationId, patch: {},
      spaces: [{ name: "Synthetic studio", notes }],
      reason: "Synthetic room correction",
    });
  await expect(f.t.mutation(internal.mcpPlanning.saveMoveContext, {
    principal: { subject, issuer, clientId },
    moveId: f.moveId, operationId: "missing-pin", requestHash: "missing-pin", patch: {},
    spaces: [{ name: "Synthetic studio", notes: "Denied" }], reason: "Missing verified grant",
  })).rejects.toThrow(/grant changed/);
  await expect(save("mismatched-pin", second)).rejects.toThrow(/grant changed/);
  expect((await f.read())?.rows).toHaveLength(1);
  const first = await save("initial");
  expect(await save("initial")).toMatchObject({ ...first, replay: true });
  const noChange = await save("no-change");
  expect(await save("no-change")).toMatchObject({ ...noChange, replay: true });
  await save("second-connection", second, "synthetic-ai-two", "Revised synthetic notes");
  const rows = (await f.read())!.rows;
  const bylines = rows.filter(row => row.transport === "mcp").map(row => row.actor.label);
  expect(bylines).toHaveLength(2);
  expect(new Set(bylines).size).toBe(2);
  expect(bylines.every(label => /^Connected AI · Connection [0-9A-F]{12}$/.test(label))).toBe(true);
  const projection = JSON.stringify(rows);
  for (const protectedValue of [original, second, firstClient, clientId, f.userId, f.spaceId, "synthetic notes"]) {
    expect(projection).not.toContain(protectedValue);
  }

  const replacement = await f.legacyGrant({ clientId });
  const connection = (await f.connection(clientId))!;
  await f.t.run(ctx => ctx.db.patch(connection._id, { grantId: replacement }));
  await expect(save("stale-handoff")).rejects.toThrow(/grant changed/);
  expect((await f.read())!.rows.filter(row => row.transport === "mcp").map(row => row.actor.label)).toEqual(bylines);
  await save("replacement", replacement, clientId, "New correction");
  expect((await f.read())!.rows[0].actor.label).not.toBe(bylines[1]);
  await f.t.run(ctx => ctx.db.delete(original));
  expect((await f.read())!.rows[2].actor.label).toBe("Connected AI");
  const activity = await f.person.query(api.audit.listForObject, { ...f.scope, objectTable: "moveSpaces", objectId: f.spaceId });
  expect(JSON.stringify(activity)).not.toContain("roomHistory");
});

it("records complete-result rooms when saved with independently listed source checks", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  const f = await roomFixture();
  const grantId = await connect(f, "complete-result");
  const sourceUrl = "https://untrusted.example.test/room-source";
  const args = {
    principal: { subject, issuer, clientId: "complete-result" },
    expectedRoomGrantId: grantId,
    moveId: f.moveId,
    operationId: "complete-room-result",
    requestHash: "complete-room-result-v1",
    resultKey: "room-study",
    title: "Synthetic room study",
    summary: "Room measured",
    body: "Room noted in an unrelated source check.",
    spaces: [{ name: "Synthetic studio", floorLevel: "Upper" }],
    sourceChecks: [{
      stableKey: "synthetic-comparison", title: "Synthetic comparison source",
      summary: "Separate planning evidence", status: "checked" as const, url: sourceUrl, relatedSpaceIds: [f.spaceId],
    }],
    reason: "Record the synthetic room study",
  };
  await expect(f.t.mutation(internal.mcpPlanning.saveCompleteResult, {
    ...args, expectedRoomGrantId: undefined,
  })).rejects.toThrow(/grant changed/);
  expect((await f.read())?.rows).toHaveLength(1);
  const result = await f.t.mutation(internal.mcpPlanning.saveCompleteResult, args);
  expect(await f.t.mutation(internal.mcpPlanning.saveCompleteResult, args)).toMatchObject({ ...result, replay: true });
  const history = await f.read();
  expect(history?.rows).toHaveLength(2);
  expect(history?.rows[0]).toMatchObject({ transport: "mcp", source: "unknown", evidence: "unknown", fields: ["floorLevel"] });
  expect(JSON.stringify(history)).not.toContain(sourceUrl);
});

it("carries the persisted gateway's verified grant into the internal room mutation", async () => {
  const f = await roomFixture();
  const clientId = "legacy-room-client";
  const grantId = await connect(f, clientId);
  const gate = createLegacyGrantGate({
    runMutation: (ref, ...args) => f.t.mutation(ref as FunctionReference<"mutation", "internal">, args[0] ?? {}),
    runAction: async () => { throw new Error("Opaque client IDs need no metadata fetch in this fixture."); },
  });
  const identity = { subject, claims: { client_id: clientId, movingInternalRoomGrant: "spoof" } };
  const spaces = [
    { spaceId: f.spaceId, name: "Synthetic studio", floorLevel: "Changed" },
    { spaceId: f.spaceId, name: "Synthetic studio", floorLevel: "Final" },
  ];
  await expect(f.t.mutation(internal.mcpToolsWrite.upsertSpaces, {
    ...f.scope, caller: { subject, claims: { client_id: clientId } }, spaces,
  })).rejects.toThrow(/verified room-write grant/);
  expect(await gate({} as never, {
    mode: "call", toolName: "upsert_spaces", toolKind: "mutation", identity,
    toolMetadata: null, args: { ...f.scope, spaces },
  })).toMatchObject({ allowed: true });
  expect(identity.claims.movingInternalRoomGrant).toBe(grantId);
  const write = () => f.t.mutation(internal.mcpToolsWrite.upsertSpaces, { ...f.scope, caller: identity, spaces });
  await write();
  await write();
  expect((await f.read())?.rows.map(row => row.fields)).toEqual([
    ["floorLevel"], ["name", "kind", "aliases", "sortOrder", "status", "capacity"],
  ]);
  const replacement = await f.legacyGrant({ clientId });
  const connection = (await f.connection(clientId))!;
  await f.t.run(ctx => ctx.db.patch(connection._id, { grantId: replacement }));
  await expect(write()).rejects.toThrow(/grant changed/);
  expect((await f.read())?.rows).toHaveLength(2);
});

it("projects REST key writes and setup material commits with native idempotency and current exact key", async () => {
  const f = await roomFixture();
  const key = await f.legacyKey();
  await f.finish();
  const request = (method: "POST" | "PATCH", path: string, body: unknown, idempotencyKey: string) =>
    f.t.mutation(internal.restApi.handle, {
      method, path, query: {}, authorization: `Bearer ${key.rawKey}`, body, idempotencyKey,
    });
  const path = `/moves/${f.moveId}/spaces/${f.spaceId}`;
  const direct = await request("PATCH", path, { floorLevel: "First" }, "direct");
  expect(direct, JSON.stringify(direct.body)).toMatchObject({ status: 200 });
  const setup = { moveId: f.moveId, spaces: [
    { name: "Synthetic studio", kind: "originRoom", floorLevel: "Second" },
    { name: "Synthetic shed", kind: "storage" },
  ] };
  expect((await request("POST", "/moves/setup", { ...setup, dryRun: true }, "preview")).status).toBe(200);
  expect((await f.read())?.rows).toHaveLength(2);
  const committed = await request("POST", "/moves/setup", setup, "material");
  expect(committed.status).toBe(200);
  expect((await request("POST", "/moves/setup", setup, "material")).body).toEqual(committed.body);
  const noChange = await request("POST", "/moves/setup", setup, "noop");
  expect(noChange.status).toBe(200);
  expect((await request("POST", "/moves/setup", setup, "noop")).body).toEqual(noChange.body);
  const rows = (await f.read())!.rows;
  expect(rows.map(row => row.transport)).toEqual(["rest", "rest", "web"]);
  expect(rows[0]).toMatchObject({ actor: { label: "API credential" }, source: "unknown", evidence: "unknown", fields: ["floorLevel", "sortOrder"] });
  expect(JSON.stringify(rows)).not.toContain(key.apiKeyId);
  const rooms = await f.person.query(api.moveSpaces.listForMove, f.scope);
  const shed = rooms.find(room => room.name === "Synthetic shed")!;
  expect((await f.person.query(api.moveSpaces.history, { ...f.scope, spaceId: shed._id, limit: 12 }))?.rows).toHaveLength(1);

  const auth = await f.t.run(ctx => authenticateApiKey(ctx, {
    rawKey: key.rawKey, requiredScopes: ["moves/write"], action: "PATCH /moves", moveId: f.moveId,
  }));
  await f.t.run(ctx => ctx.db.patch(auth.connectionId!, { isCurrent: false }));
  await expect(f.t.mutation(internal.restApi.commitRequest, {
    auth, request: { method: "PATCH", path, query: {}, body: { floorLevel: "Must not commit" } },
  })).rejects.toThrow(/not authorized/);
  expect((await f.read())?.rows).toHaveLength(3);
});

it("records only the settled room change in website bulk and keeps canonical archive separate", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  const f = await roomFixture();
  const grantId = await connect(f, "archiver");
  const kind = "originRoom" as const;
  const bulk = () => f.person.mutation(api.moveSpaces.upsertBatchForMove, { ...f.scope, spaces: [
    { kind, name: "Synthetic studio", floorLevel: "Intermediate" },
    { kind, name: "Synthetic studio", floorLevel: "Final" },
    { kind, name: "Second room" },
  ] });
  await bulk();
  await bulk();
  expect((await f.read())?.rows).toHaveLength(2);
  const archive = (action: "archive" | "restore", pinRoom = true) => f.t.mutation(internal.mcpArchive.archiveMoveRecords, {
    principal: { issuer, subject, clientId: "archiver" },
    expectedRoomGrantId: pinRoom ? grantId : undefined, moveId: f.moveId, operationId: action, action,
    records: [{ kind: "space", id: f.spaceId }], reason: "Synthetic archive status",
  });
  await expect(archive("archive", false)).rejects.toThrow(/grant changed/);
  expect((await f.read())?.rows).toHaveLength(2);
  await archive("archive");
  await archive("archive");
  await archive("restore");
  expect((await f.read())?.rows.slice(0, 2)).toMatchObject([
    { operation: "restored", fields: ["availability"] },
    { operation: "archived", fields: ["availability"] },
  ]);
  await f.reduce({ opId: "revoke", action: "revoke" }, "archiver");
  await expect(archive("archive")).rejects.toThrow(/GRANT_REQUIRED/);
  expect((await f.read())?.rows).toHaveLength(4);
});

async function restrictedMover(f: Awaited<ReturnType<typeof roomFixture>>) {
  await f.t.run(async ctx => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: "restricted-mover", name: "Synthetic mover", appRole: "member", status: "active",
      createdAt: now, updatedAt: now, lastSeenAt: now,
    });
    await ctx.db.insert("moveParticipants", {
      ...f.scope, userId, role: "viewer", accessKind: "moveOnly",
      participantType: "mover", status: "active", createdAt: now, updatedAt: now,
    });
  });
  return f.t.withIdentity(nativeWebsiteIdentity("restricted-mover"));
}

it("keeps authorized recent entries through private churn and confines a valid token to its packet", async () => {
  const f = await roomFixture();
  const mover = await restrictedMover(f);
  const history = (limit: number) => mover.query(api.moveSpaces.history, { ...f.args, limit });
  const activity = () => mover.query(api.audit.listForMove, { ...f.scope, limit: 2 });
  const objectActivity = () => mover.query(api.audit.listForObject, {
    ...f.scope, objectTable: "moveSpaces", objectId: f.spaceId, limit: 1,
  });
  const batch = (notes: string, floorLevel = "Upper") =>
    f.person.mutation(api.moveSpaces.upsertBatchForMove, {
      ...f.scope, spaces: [{ kind: "originRoom", name: "Synthetic studio", floorLevel, notes }],
    });
  await batch("private-history-marker-first");
  const expected = await history(12);
  expect(expected?.rows.map(row => row.operation)).toEqual(["updated", "created"]);
  expect(expected?.rows[0].fields).toEqual(["floorLevel"]);
  expect((await history(1))?.hasMore).toBe(true);
  expect((await history(2))?.hasMore).toBe(false);
  const claimReceipt = await f.t.mutation(internal.audit.record, {
    ...f.scope, action: "claim.synthetic", category: "documentation", actorType: "user", actorUserId: f.userId,
  });
  const claimTimeline = async () => (await mover.query(api.claimCenter.summaryForMove, f.scope)).timeline;
  expect((await claimTimeline()).map(event => event.eventId)).toContain(claimReceipt);
  const before = await activity();
  const householdActivity = () => f.person.query(api.audit.listForHousehold, { householdId: f.householdId, limit: 2 });
  const beforeHousehold = await householdActivity();
  const beforeObject = await objectActivity();
  expect(beforeObject.map(event => event.action)).toEqual(["space.created"]);
  await batch("private-history-marker-second");
  expect((await activity()).slice(1)).toEqual(before.slice(0, 1));
  expect((await householdActivity()).slice(1)).toEqual(beforeHousehold.slice(0, 1));
  expect(await objectActivity()).toEqual(beforeObject);
  for (let index = 0; index < 65; index++) await batch(`private-history-marker-${index}`);
  expect(await history(12)).toEqual(expected);
  expect(await objectActivity()).toEqual(beforeObject);
  expect((await claimTimeline()).map(event => event.eventId)).toContain(claimReceipt);
  expect((await activity()).map(event => event.action)).toEqual(["spaces.batch_upserted", "spaces.batch_upserted"]);
  expect(await f.read(64)).toMatchObject({ olderOmitted: true, hasMore: false });
  expect((await f.receipts()).filter(row => row.roomHistory?.shared === false)).toHaveLength(62);
  expect((await mover.query(api.moveSpaces.listForMove, f.scope))[0]).toMatchObject({ name: "Synthetic studio", floorLevel: "Upper" });
  expect(JSON.stringify(await mover.query(api.moveSpaces.listForMove, f.scope))).not.toMatch(/private-history-marker|RoomHistoryOmitted/);
  expect((await f.person.query(api.moveSpaces.listForMove, f.scope))[0].notes).toBe("private-history-marker-64");

  const documentationProfileId = await f.person.mutation(api.documentationProfiles.create, {
    ...f.scope, type: "movingCompany", name: "Synthetic mover packet",
  });
  const { token } = await f.person.action(api.shareLinks.create, {
    ...f.scope, scope: "profile", documentationProfileId, role: "viewer",
    allowedActions: ["view"], expiresAt: Date.now() + 60_000,
  });
  const packet = await f.t.action(api.shareLinks.resolvePublicView, { token });
  expect(packet).toMatchObject({ status: "ready" });
  expect(JSON.stringify(packet)).not.toMatch(/roomHistory|private-history-marker|Connection [A-F0-9]{12}/);
  expect(await history(12)).toEqual(expected);
  expect(await f.t.query(api.moveSpaces.history, { ...f.args, limit: 12 })).toBeNull();
});

it("keeps one retention budget under interleaved shared and private churn", async () => {
  vi.useFakeTimers();
  const f = await roomFixture();
  const controlRoomId = await f.createRoom("Shared-only control");
  const mover = await restrictedMover(f);
  const start = Date.now();
  const sharedTime = (index: number) => start + index * 20;
  const privateTime = (index: number) => sharedTime(index) + 10;
  const history = (spaceId: typeof f.spaceId, limit: number) =>
    mover.query(api.moveSpaces.history, { ...f.scope, spaceId, limit });

  for (let index = 1; index <= 70; index++) {
    vi.setSystemTime(sharedTime(index));
    await f.person.mutation(api.moveSpaces.update, { ...f.args, sortOrder: index });
    await f.person.mutation(api.moveSpaces.update, { ...f.args, spaceId: controlRoomId, sortOrder: index });
    expect((await f.receipts()).filter(row => row.roomHistory).length).toBeLessThanOrEqual(64);

    vi.setSystemTime(privateTime(index));
    await f.person.mutation(api.moveSpaces.update, { ...f.args, notes: `Private edit ${index}` });
    const retained = (await f.receipts()).filter(row => row.roomHistory);
    expect(retained).toHaveLength(Math.min(64, 2 * index + 1));

    if ([35, 63, 70].includes(index)) {
      for (const limit of [1, 12, 63, 64, 1000]) {
        expect(await history(f.spaceId, limit)).toEqual(await history(controlRoomId, limit));
      }
      expect(await history(f.spaceId, 64)).toMatchObject({ olderOmitted: index > 63, hasMore: false });
      expect(await f.read(64)).toMatchObject({ olderOmitted: true, hasMore: false });
    }
    if (index === 35) {
      expect(retained.filter(row => row.roomHistory?.shared === false).map(row => row.createdAt))
        .toEqual(Array.from({ length: 28 }, (_, offset) => privateTime(offset + 8)));
    }
  }

  const audit = await f.receipts();
  expect(audit.map(row => row.action)).toEqual(["space.created", ...Array(140).fill("space.updated")]);
  expect(audit.every(row => row.projectionOnly === undefined)).toBe(true);
  expect(audit.filter(row => row.metadata?.changedKeys instanceof Array && row.metadata.changedKeys.includes("notes")))
    .toHaveLength(70);
  expect(audit.filter(row => row.roomHistory).map(row => row.createdAt))
    .toEqual(Array.from({ length: 64 }, (_, offset) => sharedTime(offset + 7)));
  expect(await mover.query(api.audit.listForObject, { ...f.scope, objectTable: "moveSpaces", objectId: f.spaceId, limit: 2 }))
    .toMatchObject([{ createdAt: privateTime(70) }, { createdAt: sharedTime(70) }]);
});

it("preserves native receipts when trimming room metadata and drains the purged move only", async () => {
  vi.useFakeTimers();
  const f = await roomFixture();
  const unrelated = await f.t.run(async ctx => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: "unrelated-owner", name: "Another owner", appRole: "member", status: "active",
      createdAt: now, updatedAt: now, lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", { name: "Another household", ownerUserId: userId, createdByUserId: userId, createdAt: now, updatedAt: now });
    await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", createdAt: now, updatedAt: now });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Unrelated move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    return { householdId, moveId };
  });
  const other = f.t.withIdentity(nativeWebsiteIdentity("unrelated-owner"));
  const otherRoomId = await other.mutation(api.moveSpaces.create, { ...unrelated, name: "Unrelated room", kind: "custom" });
  await f.person.mutation(api.moveSpaces.upsertBatchForMove, { ...f.scope, spaces: [
    { kind: "originRoom", name: "Synthetic studio", floorLevel: "Early bulk edit" },
  ] });
  expect((await f.receipts()).some(row => row.action === "room.web_updated")).toBe(true);
  for (let index = 0; index < 66; index++) {
    vi.setSystemTime(Date.now() + 10);
    await f.person.mutation(api.moveSpaces.update, { ...f.args, sortOrder: index + 1 });
  }
  expect((await f.read(12))?.hasMore).toBe(true);
  const history = (await f.read(1000))!;
  expect(history).toMatchObject({ olderOmitted: true, hasMore: false, legacyCreation: null });
  expect(history.rows).toHaveLength(64);
  expect(history.rows[63].operation).toBe("updated");
  expect(await f.receipts()).toHaveLength(67);
  expect((await f.receipts()).some(row => row.action === "room.web_updated")).toBe(false);
  expect((await f.receipts()).filter(row => row.roomHistory)).toHaveLength(64);
  const exported = await f.person.mutation(api.accountPrivacy.createAccountExport, {});
  const artifact = await f.person.query(api.accountPrivacy.getAccountExportArtifact, { exportJobId: exported.exportJobId });
  expect(JSON.parse(artifact.artifactText)).not.toHaveProperty("auditLogs");
  expect(artifact.artifactText).not.toContain("roomHistory");
  await f.person.mutation(api.moves.purge, { ...f.scope, confirmTitle: "Private move" });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.read()).toBeNull();
  expect(await f.receipts()).toHaveLength(0);
  expect((await other.query(api.moveSpaces.history, {
    ...unrelated, spaceId: otherRoomId, limit: 12,
  }))?.rows).toHaveLength(1);
});

it("keeps a proven legacy creation neutral, and account removal leaves shared work without access", async () => {
  const f = await roomFixture();
  await f.t.run(async ctx => {
    for (const receipt of await ctx.db.query("auditLogs").withIndex("by_object_time", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", f.spaceId)).collect()) {
      await ctx.db.patch(receipt._id, { roomHistory: undefined });
    }
  });
  expect(await f.read()).toMatchObject({ rows: [], legacyCreation: { operation: "created" }, olderOmitted: false });
  await f.person.mutation(api.moveSpaces.update, { ...f.args, notes: "Legacy private edit" });
  await f.t.run(async ctx => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: "legacy-viewer", name: "Synthetic viewer", appRole: "member", status: "active",
      createdAt: now, updatedAt: now, lastSeenAt: now,
    });
    await ctx.db.insert("householdMemberships", {
      householdId: f.householdId, userId, role: "viewer", status: "active", createdAt: now, updatedAt: now,
    });
    for (const receipt of await ctx.db.query("auditLogs").withIndex("by_object_time", q =>
      q.eq("objectTable", "moveSpaces").eq("objectId", f.spaceId)).collect()) {
      if (receipt.roomHistory) await ctx.db.patch(receipt._id, { roomHistory: { ...receipt.roomHistory, shared: undefined } });
    }
  });
  const viewer = f.t.withIdentity(nativeWebsiteIdentity("legacy-viewer"));
  expect(await viewer.query(api.moveSpaces.history, { ...f.args, limit: 1 })).toMatchObject({
    rows: [], hasMore: false, olderOmitted: false, legacyCreation: { operation: "created" },
  });
  const request = await f.person.mutation(api.accountPrivacy.requestAccountDeletion, {});
  await f.person.mutation(api.accountPrivacy.completeAccountDeletion, {
    requestId: request, confirmation: ACCOUNT_DELETION_CONFIRMATION,
  });
  expect(await f.read()).toBeNull();
  expect(await f.receipts()).toHaveLength(2);
});

it("applies a key's current move restriction before REST setup routing or replay", async () => {
  const f = await roomFixture();
  const key = await f.legacyKey();
  await f.finish();
  const setupPath = "/moves/setup";
  const setup = {
    moveId: f.moveId,
    spaces: [{ kind: "originRoom", name: "Synthetic studio", floorLevel: "Authorized" }],
  };
  const request = { method: "POST" as const, path: setupPath, query: {}, body: setup, idempotencyKey: "setup-replay" };
  const authorization = `Bearer ${key.rawKey}`;
  expect((await f.t.mutation(internal.restApi.handle, { ...request, authorization })).status).toBe(200);
  const auth = await f.t.run(ctx => authenticateApiKey(ctx, {
    rawKey: key.rawKey, requiredScopes: ["moves/write"], action: "POST /api/v1/moves/setup", moveId: f.moveId,
  }));
  expect(auth.moveRestricted).toBe(false);
  await f.t.mutation(internal.apiKeys.reduceCallingKey, {
    apiKeyId: key.apiKeyId, expectedVersion: auth.version, opId: "restrict-before-commit", moveIds: [f.moveId],
  });

  const expected = {
    status: 403, body: { error: { code: "move_restricted_key", message: "Move-restricted API keys cannot create or select moves." } },
  };
  for (const body of [
    setup,
    { ...setup, spaces: [{ ...setup.spaces[0], floorLevel: "Refused" }] },
    { title: "Private move", spaces: setup.spaces },
    { title: "Unlisted move", spaces: setup.spaces },
    { moveId: f.moveId, title: "Refused without rooms" },
    { ...setup, dryRun: true },
  ]) {
    expect(await f.t.mutation(internal.restApi.commitRequest, { auth, request: { ...request, body } })).toMatchObject(expected);
  }
  expect(await f.t.mutation(internal.restApi.handle, { ...request, authorization })).toMatchObject(expected);
  expect(await f.t.run(ctx => ctx.db.get(f.spaceId))).toMatchObject({ floorLevel: "Authorized" });
  expect((await f.read())?.rows).toHaveLength(2);
  expect((await f.request(key.rawKey, "PATCH", `/moves/${f.moveId}/spaces/${f.spaceId}`, { floorLevel: "Still allowed" })).status).toBe(200);
});

it("uses current private-note visibility in projected room reads and note searches", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  const f = await roomFixture();
  const notes = "private-projection-marker";
  await f.person.mutation(api.moveSpaces.update, { ...f.args, notes });
  const clientId = "projection-client";
  await connect(f, clientId);
  const key = await f.legacyKey();
  const principal = { subject, issuer, clientId };
  const readMcp = () => f.t.query(internal.mcpPlanning.getMoveRecords, {
    principal, moveId: f.moveId, records: [{ kind: "space", id: f.spaceId }],
  });
  const searchMcp = () => f.t.query(internal.mcpPlanning.searchMoveRecords, {
    principal, moveId: f.moveId, kinds: ["space"], query: notes,
  });
  const readRest = (route: string) => f.request(key.rawKey, "GET", `/moves/${f.moveId}/${route}`);
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { role: "editor" }));
  expect(JSON.stringify(await readMcp())).toContain(notes);
  expect((await searchMcp()).records).toHaveLength(1);
  expect(JSON.stringify((await readRest("spaces")).body)).toContain(notes);
  expect(JSON.stringify((await readRest("agent-context")).body)).toContain(notes);
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { role: "viewer" }));
  expect(JSON.stringify(await readMcp())).not.toContain(notes);
  expect(JSON.stringify(await readMcp())).toContain("Synthetic studio");
  expect((await searchMcp()).records).toEqual([]);
  for (const route of ["spaces", "agent-context"]) {
    const response = await readRest(route);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain("Synthetic studio");
    expect(JSON.stringify(response.body)).not.toContain(notes);
  }
});
