// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { parseRestPath, requiredScopesForRestRoute } from "../../convex/lib/restApi";
import * as registrations from "../../convex/restApi";
import { restRouteManifest } from "../../scripts/contract-drift-check.mjs";
import { accessFixture } from "../helpers/ai-access";

beforeEach(() => vi.useFakeTimers({ now: 1_700_000_000_000 }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("pins the internal mutation addresses and argument schemas at the REST door", () => {
  const exports = Object.entries(registrations).flatMap(([name, value]) => {
    if (!("isInternal" in value) || !("isMutation" in value)) return [];
    return [{ name: `restApi:${name}`, args: JSON.parse(value.exportArgs()) }];
  });
  expect(exports.sort((a, b) => a.name.localeCompare(b.name))).toMatchSnapshot();
});

it("pins the route families, scopes, responses and refusal shapes with a fixture key", async () => {
  vi.stubEnv("B2_ENDPOINT", "");
  const f = await accessFixture("rest-route-table");
  const { rawKey } = await f.person.mutation(api.apiKeys.create, {
    householdId: f.householdId,
    name: "Synthetic REST fixture",
  });
  const move = `moves/${f.moveId}`;
  const routes = [
    ["GET", "me"],
    ["POST", "me/access"],
    ["GET", `households/${f.householdId}/members`],
    ["POST", `households/${f.householdId}/members`],
    ["GET", "moves"],
    ["POST", "moves"],
    ["POST", "moves/setup"],
    ["GET", move],
    ["GET", `${move}/summary`],
    ["GET", `${move}/questions`],
    ["GET", `${move}/move-day`],
    ["GET", `${move}/capacity-report`],
    ["GET", `${move}/agent-context`],
    ["GET", `${move}/spaces`],
    ["POST", `${move}/spaces`],
    ["GET", `${move}/sale-listings`],
    ["POST", `${move}/sale-listings`],
    ["GET", `${move}/queue`],
    ["GET", `${move}/queue/missing`],
    ["POST", `${move}/queue/missing/claim`],
    ["POST", `${move}/queue/missing/release`],
    ["POST", `${move}/queue/missing/needs-you`],
    ["POST", `${move}/queue/missing/complete`],
    ["POST", `${move}/queue/missing/failure`],
    ["GET", `${move}/resources`],
    ["GET", `${move}/zones`],
    ["GET", `${move}/people`],
    ["GET", `${move}/items`],
    ["POST", `${move}/items`],
    ["POST", `${move}/items/batch-upsert`],
    ["GET", `${move}/movable-units`],
    ["POST", `${move}/movable-units/batch-upsert`],
    ["GET", `${move}/planned-items`],
    ["POST", `${move}/planned-items/missing/convert`],
    ["GET", `${move}/boxes`],
    ["GET", `${move}/assignments`],
    ["POST", `${move}/assignments/suggest`],
    ["POST", `${move}/assignments/missing/restore`],
    ["GET", `${move}/planning-suggestions`],
    ["POST", `${move}/planning-suggestions/approve`],
    ["GET", `${move}/ai-jobs`],
    ["GET", `${move}/ai-text-suggestions`],
    ["GET", `${move}/ai-photo-suggestions`],
    ["GET", `${move}/documentation-profiles`],
    ["GET", `${move}/exports`],
    ["POST", `${move}/exports`],
    ["GET", `${move}/share-links`],
    ["POST", `${move}/share-links`],
    ["GET", `${move}/share-links/missing/comments`],
    ["POST", `${move}/share-links/missing/revoke`],
    ["GET", `${move}/photos`],
    ["GET", "plans"],
    ["GET", "plans/missing"],
    ["POST", "plans/missing/ops"],
    ["GET", "plans/missing/proposals"],
    ["GET", "items/missing"],
    ["GET", "boxes/missing"],
    ["GET", "boxes/missing/items"],
    ["GET", "photos/missing"],
    ["GET", "exports/missing"],
    ["POST", "images/upload"],
    ["POST", "photos/upload"],
    ["POST", "uploads/init"],
    ["POST", "photos/finalize"],
    ["GET", `${move}/unknown-route`],
    ["GET", "unknown-route"],
  ] as const;

  const covered = new Set(routes.map(([method, path]) => `${method} /${path}`));
  for (const { method, pathPattern } of restRouteManifest) {
    const path = pathPattern
      .replace("{moveId}", f.moveId)
      .replace("{householdId}", f.householdId)
      .replace(/\{\w+Id\}/g, "missing");
    expect(covered.has(`${method} ${path}`), `${method} ${pathPattern}`).toBe(true);
  }

  const outcomes = [];
  for (const [method, path] of routes) {
    const query = new URLSearchParams({ moveId: f.moveId, limit: "2" });
    const input = path === "uploads/init" || path === "photos/finalize"
      ? { moveId: f.moveId, uploadSessionId: "missing" }
      : {};
    const response = await f.t.fetch(`/api/v1/${path}?${query}`, {
      method,
      headers: { authorization: `Bearer ${rawKey}`, "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(input) : undefined,
    });
    const body = await response.json() as { error?: { code: string; message: string }; data?: unknown };
    const label = `${method} /${path.replace(f.moveId, "{moveId}").replace(f.householdId, "{householdId}")}`;
    const scopes = requiredScopesForRestRoute({ method, segments: parseRestPath(path) }).join(", ");
    const shape = body.error
      ? JSON.stringify(body.error)
      : Array.isArray(body.data) ? `array (${body.data.length})` : typeof body.data;
    outcomes.push(`${label} | ${scopes || "no scopes"} | ${response.status} | ${Object.keys(body).sort().join(", ")} | ${shape}`);
  }
  expect(outcomes).toMatchSnapshot();
});

it("replays an idempotent write and refuses a different body under the same key", async () => {
  const f = await accessFixture("rest-route-idempotency");
  const { rawKey } = await f.person.mutation(api.apiKeys.create, {
    householdId: f.householdId, name: "Synthetic write key",
  });
  const create = (name: string) => f.t.mutation(internal.restApi.handle, {
    method: "POST", path: `moves/${f.moveId}/items`, query: {},
    authorization: `Bearer ${rawKey}`, idempotencyKey: "synthetic-operation", body: { name },
  });
  const first = await create("Notebook");
  const replay = await create("Notebook");
  const conflict = await create("Pencil");
  expect(first.status).toBe(201);
  expect({ status: replay.status, body: replay.body }).toEqual({ status: first.status, body: first.body });
  expect(conflict).toMatchSnapshot();
  expect(await f.t.run((ctx) => ctx.db.query("items").collect())).toHaveLength(1);
});

it("authenticates before dispatch and keeps scope, move access and cursor semantics", async () => {
  const f = await accessFixture("rest-route-access");
  const otherMoveId = await f.t.run(async (ctx) => {
    const move = (await ctx.db.get(f.moveId))!;
    const fields = {
      householdId: move.householdId, createdByUserId: move.createdByUserId,
      type: move.type, unitSystem: move.unitSystem, createdAt: move.createdAt, updatedAt: move.updatedAt,
    };
    const second = await ctx.db.insert("moves", { ...fields, title: "Second move", status: "planning" });
    await ctx.db.insert("moves", { ...fields, title: "Archived move", status: "archived" });
    return second;
  });
  const full = await f.person.mutation(api.apiKeys.create, {
    householdId: f.householdId, name: "Read moves", scopes: ["moves/read"],
  });
  const restricted = await f.person.mutation(api.apiKeys.create, {
    householdId: f.householdId, moveId: f.moveId, name: "Read one move", scopes: ["moves/read"],
  });
  const call = (path: string, authorization?: string, query: Record<string, string> = {}) =>
    f.t.mutation(internal.restApi.handle, { method: "GET", path, query, authorization });
  const first = await call("moves", `Bearer ${full.rawKey}`, { limit: "1" });
  const second = await call("moves", `Bearer ${full.rawKey}`, { limit: "1", cursor: "1" });
  const only = await call("moves", `Bearer ${restricted.rawKey}`, { limit: "1" });

  expect({ first, second, only }).toMatchSnapshot("paginated move rows");
  expect({
    knownAnonymous: await call("moves"),
    unknownAnonymous: await call("unknown-route"),
    invalidKey: await call("moves", "Bearer mmk_synthetic_invalid"),
    missingScope: await call(`moves/${f.moveId}/items`, `Bearer ${full.rawKey}`),
    outsideMove: await call(`moves/${otherMoveId}`, `Bearer ${restricted.rawKey}`),
  }).toMatchSnapshot("authentication and access refusals");
});
