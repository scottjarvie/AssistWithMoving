// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the convex-test harness and the gateway caller bridge are intentionally synthetic. */

/**
 * First-night continuity through the possessions workflow.
 *
 * `firstNight` was always a real planning-default key: the load planner, the
 * mover/PCS/employer packets, the inventory filters and `moveQuestions` all read
 * it, and the web UI has always been able to set it. What a connected AI could
 * never do was write it. Both canonical OAuth write paths hardcoded
 * `planningDefaultKeys: []` on create and had no field at all on update, so an
 * AI could walk a whole house, describe every belonging correctly, and still not
 * say "these are the things the household needs the night they arrive".
 *
 * These tests defend the write and the two rules that make it safe:
 *
 *  - the vocabulary is closed — an unknown key is REFUSED, never stored, because
 *    a stored typo reads as a successful tag while being invisible to every
 *    filter that was supposed to act on it;
 *  - the write is version-safe — the field REPLACES the stored set, so a
 *    correction has to carry the version token it read, or a tag set by the
 *    person (or another AI) between the read and the write would vanish.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { convexTest } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import { createMovingServer } from "../../convex/httpRoutes/mcp";
import {
  GRANT_BOUNDARY_VERSION,
  buildConsentSnapshot,
  movingScopes,
} from "../../convex/lib/aiGrants";
import {
  normalizePlanningDefaultKeys,
  planningDefaultKeys,
} from "../../convex/lib/moveFields";
import { movePlanningDefaultPresets } from "../../convex/lib/planningDefaults";
import schema from "../../convex/schema";

type ModuleMap = Record<string, () => Promise<unknown>>;

function buildModuleMap(rootDir: string): ModuleMap {
  const modules: ModuleMap = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (/\.(?:ts|tsx|js)$/.test(entry)) {
        modules[path.relative(process.cwd(), fullPath).replace(/\\/g, "/")] = () =>
          import(pathToFileURL(fullPath).href);
      }
    }
  };
  walk(rootDir);
  return modules;
}

const modules = buildModuleMap(path.join(process.cwd(), "convex"));
const ISSUER = "https://moving-first-night-test.clerk.accounts.dev";
const SUBJECT = "user_moving_first_night_synthetic";
const PRINCIPAL = {
  issuer: ISSUER,
  subject: SUBJECT,
  clientId: "moving-first-night-synthetic-client",
  clientName: "Synthetic chosen AI",
};
const CALLER = { subject: SUBJECT } as any;

const planning = (internal as any).mcpPlanning;
const toolsWrite = (api as any).mcpToolsWrite;

function modernRequest(method: string, params: Record<string, unknown> = {}) {
  return new Request("https://movingmanifest.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      // The 2026-07-28 envelope requires the tool name in a header as well as
      // the body, and refuses the call if the two disagree.
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-first-night-proof`,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "moving-first-night-proof",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
});

async function seedWorkspace() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: SUBJECT,
      email: "moving-first-night@example.test",
      name: "Synthetic Move Owner",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Synthetic First Night Household",
      createdByUserId: userId,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(userId, { defaultHouseholdId: householdId });
    await ctx.db.insert("householdMemberships", {
      householdId,
      userId,
      role: "owner",
      status: "active",
      apiAccessStatus: "enabled",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const moveId = await ctx.db.insert("moves", {
      householdId,
      title: "Synthetic first-night move",
      type: "local",
      status: "planning",
      unitSystem: "imperial",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const itemId = await ctx.db.insert("items", {
      householdId,
      moveId,
      name: "Kettle",
      normalizedName: "kettle",
      quantity: 1,
      status: "active",
      condition: "good",
      disposition: "take",
      weightConfidence: "none",
      volumeConfidence: "none",
      fragility: "low",
      stackable: true,
      hazardousFlag: false,
      highValue: false,
      requiresPersonalTransport: false,
      planningDefaultKeys: ["fragile"],
      needsReview: false,
      reviewFlags: [],
      aiTags: [],
      createdVia: "manual",
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("aiGrants", {
      ownerUserId: userId,
      householdId,
      label: "Synthetic connection",
      clientId: PRINCIPAL.clientId,
      scopes: [...movingScopes],
      moveScope: "allMoves",
      status: "active",
      consentBoundaryVersion: GRANT_BOUNDARY_VERSION,
      consentSnapshot: buildConsentSnapshot([...movingScopes]),
      approvedAt: now,
      useCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, householdId, moveId, itemId };
  });
  return { t, ...ids };
}

/** The MCP refusal envelope `mcpError` encodes into a ConvexError. */
async function refusalOf(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected the call to be refused, but it succeeded.");
  } catch (error) {
    const raw =
      error instanceof Error
        ? String((error as { data?: unknown }).data ?? error.message)
        : String(error);
    const marker = raw.indexOf("MCP_MOVING_ERROR:");
    if (marker < 0) return { code: "UNMARKED", message: raw, recovery: "" };
    return JSON.parse(raw.slice(marker + "MCP_MOVING_ERROR:".length)) as {
      code: string;
      message: string;
      recovery: string;
    };
  }
}

async function messageOf(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected the call to be refused, but it succeeded.");
  } catch (error) {
    return error instanceof Error
      ? String((error as { data?: unknown }).data ?? error.message)
      : String(error);
  }
}

async function readItem(fixture: Awaited<ReturnType<typeof seedWorkspace>>) {
  return await fixture.t.run(async (ctx) => {
    const item = await ctx.db.get(fixture.itemId);
    if (!item) throw new Error("Seeded item vanished.");
    return item;
  });
}

// ---------------------------------------------------------------------------

describe("the planning-default vocabulary", () => {
  it("is one closed set shared by the presets, the validator and the tools", () => {
    // The presets are what the product SHOWS a person; the key list is what the
    // writes ACCEPT. If they ever diverge, an AI could set a tag with no
    // meaning, or a person could see a tag no AI can set.
    expect(movePlanningDefaultPresets.map((preset) => preset.key).sort()).toEqual(
      [...planningDefaultKeys].sort(),
    );
    expect(planningDefaultKeys).toContain("firstNight");
  });

  it("refuses an unknown key, keeps order, and drops duplicates", () => {
    expect(normalizePlanningDefaultKeys(undefined)).toBeUndefined();
    expect(normalizePlanningDefaultKeys([])).toEqual([]);
    expect(
      normalizePlanningDefaultKeys(["firstNight", "documents", "firstNight"]),
    ).toEqual(["firstNight", "documents"]);
    expect(() => normalizePlanningDefaultKeys(["first_night"])).toThrow(
      /Unsupported planningDefaultKeys value/,
    );
    // Near-misses are the realistic failure: a model inventing a plausible tag.
    expect(() => normalizePlanningDefaultKeys(["firstnight"])).toThrow();
    expect(() => normalizePlanningDefaultKeys(["utilities"])).toThrow();
    expect(() => normalizePlanningDefaultKeys([42 as unknown as string])).toThrow();
  });
});

describe("save_inventory (canonical stateless OAuth write path)", () => {
  it("creates a belonging already tagged firstNight", async () => {
    const fixture = await seedWorkspace();
    const result = await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-first-night-create",
      requestHash: "hash-create",
      items: [
        {
          createKey: "toiletries-bag",
          name: "Toiletries bag",
          room: "Bathroom",
          planningDefaultKeys: ["firstNight"],
        },
      ],
      reason: "Tag what the household needs the night they arrive.",
    });
    expect(result.items[0].action).toBe("created");
    const created = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows.find((row) => row.name === "Toiletries bag");
    });
    expect(created?.planningDefaultKeys).toEqual(["firstNight"]);
  });

  it("still defaults to no tags when the field is omitted on create", async () => {
    const fixture = await seedWorkspace();
    await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-untagged-create",
      requestHash: "hash-untagged",
      items: [{ createKey: "garden-hose", name: "Garden hose" }],
      reason: "An ordinary capture with no planning tag.",
    });
    const created = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows.find((row) => row.name === "Garden hose");
    });
    expect(created?.planningDefaultKeys).toEqual([]);
  });

  it("refuses an unknown key instead of storing it", async () => {
    // Two gates stand in front of a bad key, and the outer one fires first.
    // The tool's published input schema is a zod enum built from
    // `planningDefaultKeys` (convex/httpRoutes/mcp.ts), so a connected AI both
    // *sees* the vocabulary in tools/list and is refused at the transport with
    // the offending value named. Behind it, this mutation's own arg validator
    // refuses again. What both gates guarantee, and what matters to the person,
    // is asserted here: the call fails and NOTHING from the batch is stored.
    const fixture = await seedWorkspace();
    const message = await messageOf(
      fixture.t.mutation(planning.saveInventory, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        operationId: "synthetic-bad-key",
        requestHash: "hash-bad-key",
        items: [
          {
            createKey: "mystery",
            name: "Mystery box",
            planningDefaultKeys: ["utilitiesSetup"],
          },
        ],
        reason: "Invent a tag the product does not have.",
      }),
    );
    expect(message).toContain("utilitiesSetup");
    const names = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows.map((row) => row.name);
    });
    expect(names).not.toContain("Mystery box");
  });

  it("publishes the whole vocabulary in the tool schema an AI reads", async () => {
    // An AI can only use a closed vocabulary it can see. The published
    // inputSchema is where it learns the keys, and it is derived from
    // `planningDefaultKeys` rather than retyped, so it cannot drift.
    const actionCtx = { runQuery: async () => ({ scopes: [] }) } as any;
    const handler = createMcpHandler(
      () =>
        createMovingServer(actionCtx, PRINCIPAL, ["moving.work.write"]).server,
      { legacy: "stateless", responseMode: "json" },
    );
    const listed = await handler.fetch(modernRequest("tools/list"));
    const tools = ((await listed.json()) as any).result.tools as any[];
    const save = tools.find((tool) => tool.name === "save_inventory");
    const keys =
      save.inputSchema.properties.items.items.properties.planningDefaultKeys;
    expect(keys.items.enum.sort()).toEqual([...planningDefaultKeys].sort());
    expect(save.description).toContain("firstNight");
    await handler.close();
  });

  it("refuses an unknown key at the transport, before anything is read", async () => {
    // The refusal a connected AI actually receives. No database call happens:
    // the stub action context would throw if the handler got that far.
    const actionCtx = {
      runQuery: async () => ({ scopes: [] }),
      runMutation: async () => {
        throw new Error("A refused write must never reach the database.");
      },
    } as any;
    const handler = createMcpHandler(
      () =>
        createMovingServer(actionCtx, PRINCIPAL, ["moving.work.write"]).server,
      { legacy: "stateless", responseMode: "json" },
    );
    const response = await handler.fetch(
      modernRequest("tools/call", {
        name: "save_inventory",
        arguments: {
          moveId: "synthetic_move_id",
          operationId: "synthetic-transport-refusal",
          items: [
            {
              createKey: "mystery",
              name: "Mystery box",
              planningDefaultKeys: ["firstWeek"],
            },
          ],
          reason: "Invent a tag the product does not have.",
        },
      }),
    );
    const body = JSON.stringify(await response.json());
    expect(body).toContain("isError");
    // The refusal points at the exact array element and spells out every legal
    // key, so a model can correct itself in one turn instead of guessing.
    expect(body).toContain("items.0.planningDefaultKeys.0");
    for (const key of planningDefaultKeys) expect(body).toContain(key);
    await handler.close();
  });

  it("replaces the tag set on an update, and leaves it alone when omitted", async () => {
    const fixture = await seedWorkspace();
    const before = await readItem(fixture);
    expect(before.planningDefaultKeys).toEqual(["fragile"]);

    // A correction that never mentions tags must not erase them.
    await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-rename",
      requestHash: "hash-rename",
      items: [
        {
          itemId: fixture.itemId,
          expectedUpdatedAt: before.updatedAt,
          name: "Electric kettle",
        },
      ],
      reason: "Rename only.",
    });
    const renamed = await readItem(fixture);
    expect(renamed.name).toBe("Electric kettle");
    expect(renamed.planningDefaultKeys).toEqual(["fragile"]);

    // A correction that DOES mention tags replaces the whole set. The AI keeps
    // "fragile" by resending it — that is the documented contract.
    await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-tag",
      requestHash: "hash-tag",
      items: [
        {
          itemId: fixture.itemId,
          expectedUpdatedAt: renamed.updatedAt,
          planningDefaultKeys: ["fragile", "firstNight"],
        },
      ],
      reason: "The household wants tea the night they arrive.",
    });
    const tagged = await readItem(fixture);
    expect(tagged.planningDefaultKeys).toEqual(["fragile", "firstNight"]);
    expect(tagged.name).toBe("Electric kettle");

    // An explicit empty array is a deliberate clear, not an accident.
    await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-clear",
      requestHash: "hash-clear",
      items: [
        {
          itemId: fixture.itemId,
          expectedUpdatedAt: tagged.updatedAt,
          planningDefaultKeys: [],
        },
      ],
      reason: "Clear the tags deliberately.",
    });
    expect((await readItem(fixture)).planningDefaultKeys).toEqual([]);
  });

  it("refuses a tag write that carries a stale version token", async () => {
    const fixture = await seedWorkspace();
    const stale = await readItem(fixture);

    // Somebody else — the person in the web app, or another AI — edits first.
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.itemId, {
        planningDefaultKeys: ["fragile", "irreplaceable"],
        updatedAt: stale.updatedAt + 1_000,
      });
    });

    const refusal = await refusalOf(
      fixture.t.mutation(planning.saveInventory, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        operationId: "synthetic-stale-tag",
        requestHash: "hash-stale",
        items: [
          {
            itemId: fixture.itemId,
            expectedUpdatedAt: stale.updatedAt,
            planningDefaultKeys: ["firstNight"],
          },
        ],
        reason: "Write against a version that is no longer current.",
      }),
    );
    expect(refusal.code).toBe("STALE_VERSION");
    // The concurrent change survived intact — this is the whole point.
    expect((await readItem(fixture)).planningDefaultKeys).toEqual([
      "fragile",
      "irreplaceable",
    ]);
  });

  it("returns the current tags and the version token together on a read", async () => {
    const fixture = await seedWorkspace();
    const records = await fixture.t.query(planning.getMoveRecords, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      records: [{ kind: "item", id: String(fixture.itemId) }],
    });
    const record = (records.records ?? records)[0] as any;
    expect(record.planningDefaultKeys).toEqual(["fragile"]);
    expect(typeof record.updatedAt).toBe("number");
  });
});

describe("upsert_items (canonical gateway OAuth write path)", () => {
  it("creates a belonging already tagged firstNight", async () => {
    const fixture = await seedWorkspace();
    await fixture.t.mutation(toolsWrite.upsertItems, {
      caller: CALLER,
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      items: [
        {
          name: "Bedding box",
          room: "Bedroom",
          planningDefaultKeys: ["firstNight"],
        },
      ],
    });
    const created = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows.find((row) => row.name === "Bedding box");
    });
    expect(created?.planningDefaultKeys).toEqual(["firstNight"]);
  });

  it("refuses an unknown key, even on a dry run that would save nothing", async () => {
    // The gateway publishes this tool's argument validator directly, so the
    // closed union refuses the call before the handler runs — and the handler's
    // own normalizer refuses again behind it. Either way nothing is stored, and
    // a dry run is not a way to slip a bad tag past validation.
    const fixture = await seedWorkspace();
    for (const dryRun of [true, false]) {
      const message = await messageOf(
        fixture.t.mutation(toolsWrite.upsertItems, {
          caller: CALLER,
          householdId: fixture.householdId,
          moveId: fixture.moveId,
          dryRun,
          items: [{ name: "Mystery crate", planningDefaultKeys: ["firstWeek"] }],
        }),
      );
      expect(message).toContain("firstWeek");
    }
    const names = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows.map((row) => row.name);
    });
    expect(names).not.toContain("Mystery crate");
  });

  it("leaves stored tags alone when a partial update omits the field", async () => {
    const fixture = await seedWorkspace();
    await fixture.t.mutation(toolsWrite.upsertItems, {
      caller: CALLER,
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      items: [{ itemId: fixture.itemId, name: "Kettle", room: "Kitchen" }],
    });
    const updated = await readItem(fixture);
    expect(updated.room).toBe("Kitchen");
    expect(updated.planningDefaultKeys).toEqual(["fragile"]);
  });

  it("refuses a tag change with no version token at all", async () => {
    const fixture = await seedWorkspace();
    const message = await messageOf(
      fixture.t.mutation(toolsWrite.upsertItems, {
        caller: CALLER,
        householdId: fixture.householdId,
        moveId: fixture.moveId,
        items: [
          {
            itemId: fixture.itemId,
            name: "Kettle",
            planningDefaultKeys: ["firstNight"],
          },
        ],
      }),
    );
    expect(message).toContain("expectedUpdatedAt");
    expect((await readItem(fixture)).planningDefaultKeys).toEqual(["fragile"]);
  });

  it("refuses a tag change whose version token lost a race", async () => {
    const fixture = await seedWorkspace();
    const stale = await readItem(fixture);
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.itemId, {
        planningDefaultKeys: ["fragile", "medication"],
        updatedAt: stale.updatedAt + 1_000,
      });
    });
    const message = await messageOf(
      fixture.t.mutation(toolsWrite.upsertItems, {
        caller: CALLER,
        householdId: fixture.householdId,
        moveId: fixture.moveId,
        items: [
          {
            itemId: fixture.itemId,
            name: "Kettle",
            expectedUpdatedAt: stale.updatedAt,
            planningDefaultKeys: ["firstNight"],
          },
        ],
      }),
    );
    expect(message).toContain("changed after it was read");
    expect((await readItem(fixture)).planningDefaultKeys).toEqual([
      "fragile",
      "medication",
    ]);
  });

  it("applies the tag change once the AI re-reads and retries", async () => {
    const fixture = await seedWorkspace();
    const fresh = await fixture.t.query(toolsWrite.getItem, {
      caller: CALLER,
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      itemId: fixture.itemId,
    });
    // get_item is the read that makes the retry possible: it hands back both
    // the tags being replaced and the version token the write must carry.
    expect(fresh.planningDefaultKeys).toEqual(["fragile"]);
    await fixture.t.mutation(toolsWrite.upsertItems, {
      caller: CALLER,
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      items: [
        {
          itemId: fixture.itemId,
          name: "Kettle",
          expectedUpdatedAt: fresh.updatedAt,
          planningDefaultKeys: [...fresh.planningDefaultKeys, "firstNight"],
        },
      ],
    });
    expect((await readItem(fixture)).planningDefaultKeys).toEqual([
      "fragile",
      "firstNight",
    ]);
  });

  it("keeps working for a caller that sends no version token and no tags", async () => {
    // Backward compatibility: expectedUpdatedAt is optional, so every existing
    // client that only edits ordinary fields is untouched by this change.
    const fixture = await seedWorkspace();
    await fixture.t.mutation(toolsWrite.upsertItems, {
      caller: CALLER,
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      items: [{ itemId: fixture.itemId, name: "Kettle", quantity: 2 }],
    });
    const updated = await readItem(fixture);
    expect(updated.quantity).toBe(2);
    expect(updated.planningDefaultKeys).toEqual(["fragile"]);
  });
});

describe("what firstNight now reaches", () => {
  it("flows straight into the first-night question the move already asks", async () => {
    // The payoff. `moveQuestions` has always had a first-night question that
    // reads this tag; until now nothing an AI wrote could answer it.
    const fixture = await seedWorkspace();
    const before = await readItem(fixture);
    await fixture.t.mutation(planning.saveInventory, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-first-night-flow",
      requestHash: "hash-flow",
      items: [
        {
          itemId: fixture.itemId,
          expectedUpdatedAt: before.updatedAt,
          planningDefaultKeys: ["firstNight"],
        },
        {
          createKey: "phone-chargers",
          name: "Phone chargers",
          planningDefaultKeys: ["firstNight", "electronics"],
        },
      ],
      reason: "Build the first-night set from the possessions already captured.",
    });
    const firstNight = await fixture.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", fixture.moveId))
        .collect();
      return rows
        .filter((row) => row.planningDefaultKeys.includes("firstNight"))
        .map((row) => row.name)
        .sort();
    });
    expect(firstNight).toEqual(["Kettle", "Phone chargers"]);
  });
});
