// @vitest-environment node
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  claimQueueItem,
  completeQueueItem,
  reviewQueueSuggestion,
  shapeQueueItem,
  type QueueAccessActor,
} from "../../convex/lib/queueService";
import { queueItemMatchesEffectiveState } from "../../convex/lib/queue";
import { createMovingServer } from "../../convex/httpRoutes/mcp";
import { hashApiKey, apiKeyPrefix } from "../../convex/lib/apiKeys";
import { movingScopes } from "../../convex/lib/aiGrants";
const modules = import.meta.glob("../../convex/**/*.ts");
const subject = "SYNTHETIC-AWL-0016";
const clientId = "synthetic-queue-ai";
const issuer = "https://queue-test.clerk.accounts.dev";
beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = issuer;
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: subject,
      email: "awl0016@example.test",
      name: subject,
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: subject,
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
      title: subject,
      type: "local",
      status: "planning",
      unitSystem: "imperial",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, householdId, moveId };
  });
  await t.mutation(internal.aiGrants.touchLegacyConnection, {
    subject,
    clientId,
  });
  const human: QueueAccessActor = {
    userId: ids.userId,
    actorType: "user",
    isManager: true,
    delegatedOwnerIds: [],
  };
  const ai: QueueAccessActor = {
    ...human,
    actorType: "agent",
    isManager: false,
    connectionId: clientId,
    label: "Synthetic AI",
  };
  const principal = { issuer, subject, clientId, clientName: "Synthetic AI" };
  const add = async (
    addedBy: "ai_suggestion" | "ai_on_request" = "ai_suggestion",
    op = "add",
  ) =>
    t.mutation(internal.mcpQueueWork.addQueueItem, {
      principal,
      moveId: ids.moveId,
      directive: "Compare mover quotes",
      addedBy,
      reason: "Two estimates use different units",
      options: ["Compare total cost", "Compare coverage"],
      operationId: op,
    });
  return {
    t,
    ...ids,
    human,
    ai,
    principal,
    add,
    person: t.withIdentity({ subject, sid: "sess_synthetic" }),
  };
}
describe("AWL-0016 Queue authority and lifecycle", () => {
  it("requires explicit AI origin and exact counts beyond a page; hides suggestions from lanes and briefs", async () => {
    const f = await fixture();
    await expect(
      f.t.mutation(internal.mcpQueueWork.addQueueItem, {
        principal: f.principal,
        moveId: f.moveId,
        directive: "Unclassified",
        operationId: "missing",
      }),
    ).rejects.toThrow(/addedBy/);
    await f.add();
    for (let i = 0; i < 105; i++) await f.add("ai_suggestion", `page:${i}`);
    expect(
      (
        await f.person.query(api.queue.counts, {
          householdId: f.householdId,
          moveId: f.moveId,
        })
      ).suggestions,
    ).toBe(106);
    expect(
      (
        await f.person.query(api.queue.counts, {
          householdId: f.householdId,
          moveId: f.moveId,
        })
      ).everything,
    ).toBe(0);
    expect(
      (
        await f.t.query(internal.mcpQueueWork.listQueueWork, {
          principal: f.principal,
          moveId: f.moveId,
        })
      ).work,
    ).toEqual([]);
    expect(
      (
        await f.t.query(internal.mcpPlanning.getMoveBrief, {
          principal: f.principal,
          moveId: f.moveId,
        })
      ).queue?.waitingForAi,
    ).toEqual([]);
    const first = await f.t.query(internal.mcpQueueWork.listSuggestions, {
      principal: f.principal,
      moveId: f.moveId,
    });
    expect(first.items).toHaveLength(50);
    expect(first.count).toBe(106);
    const second = await f.t.query(internal.mcpQueueWork.listSuggestions, {
      principal: f.principal,
      moveId: f.moveId,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(50);
    expect(second.count).toBe(106);
    const ordinary = await f.add("ai_on_request", "request");
    expect(ordinary.addedBy).toBe("ai_on_request");
    expect(
      (
        await f.t.query(internal.mcpQueueWork.listQueueWork, {
          principal: f.principal,
          moveId: f.moveId,
        })
      ).work,
    ).toHaveLength(1);
  });
  it("refuses every work mutation and AI decisions on an open idea, then accepts edited work", async () => {
    const f = await fixture();
    const idea = await f.add();
    const base = {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      idempotencyKey: "command",
    };
    for (const actorType of ["agent", "apiKey"] as const) {
      const actor = { ...f.ai, actorType };
      await expect(
        f.t.run((ctx) =>
          claimQueueItem(ctx, actor, {
            ...base,
            nextStep: "Illegitimate work",
          }),
        ),
      ).rejects.toThrow(/unaccepted/);
      await expect(
        f.t.run((ctx) =>
          completeQueueItem(ctx, actor, {
            ...base,
            resultSummary: "Illegitimate result",
          }),
        ),
      ).rejects.toThrow(/unaccepted/);
      for (const action of ["accept", "dismiss", "archive", "restore"] as const)
        await expect(
          f.t.run((ctx) =>
            reviewQueueSuggestion(ctx, actor, {
              ...base,
              action,
              directive: "Edited by AI",
            }),
          ),
        ).rejects.toThrow(/Only the person/);
    }
    const accepted = await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      operationId: "accept",
      action: "accept",
      directive: "Compare coverage first",
    });
    expect(accepted.state).toBe("waitingForAi");
    expect(accepted.directive).toBe("Compare coverage first");
    expect(accepted.addedBy).toBe("ai_suggestion");
    expect(accepted.suggestionStatus).toBe("accepted");
    await f.t.mutation(internal.mcpQueueWork.claimQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: accepted.version,
      operationId: "claim",
      nextStep: "Compare coverage",
    });
  });
  it("archives reasons verbatim, reopens, refuses repeated reasons and prevents withdrawal after person action", async () => {
    const f = await fixture();
    const idea = await f.add();
    const base = {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      operationId: "dismiss",
      action: "dismiss" as const,
      reason: "  I already compared these.\nKeep my wording.  ",
    };
    const dismissed = await f.person.mutation(api.queue.reviewSuggestion, base);
    expect(dismissed.dismissReason).toBe(base.reason);
    expect(dismissed.archivedAt).toBeTypeOf("number");
    await expect(f.add("ai_suggestion", "repeat")).rejects.toThrow(
      /new reason/,
    );
    const restored = await f.person.mutation(api.queue.reviewSuggestion, {
      ...base,
      action: "restore",
      operationId: "restore",
      expectedVersion: dismissed.version,
    });
    expect(restored.suggestionStatus).toBe("open");
    await expect(
      f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
        principal: f.principal,
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: restored.version,
        operationId: "withdraw",
      }),
    ).rejects.toThrow(/already acted/);
  });
  it("allows only the originating AI to withdraw an untouched idea and isolates it from household recovery", async () => {
    const f = await fixture();
    const idea = await f.add();
    await f.t.mutation(internal.aiGrants.touchLegacyConnection, {
      subject,
      clientId: "another-ai",
    });
    await expect(
      f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
        principal: { ...f.principal, clientId: "another-ai" },
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        operationId: "wrong",
      }),
    ).rejects.toThrow(/own suggestion/);
    const withdrawn = await f.t.mutation(
      internal.mcpQueueWork.withdrawSuggestion,
      {
        principal: f.principal,
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        operationId: "withdraw",
      },
    );
    expect(withdrawn.suggestionStatus).toBe("withdrawn");
  });
  it("raises and clears an input flag without state transitions, including legacy reads", async () => {
    const f = await fixture();
    const item = await f.add("ai_on_request");
    const claimed = await f.t.mutation(internal.mcpQueueWork.claimQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: item.version,
      operationId: "claim",
      nextStep: "Compare costs",
    });
    const flagged = await f.t.mutation(internal.mcpQueueWork.askQueueQuestion, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: claimed.queue.version,
      operationId: "ask",
      question: "Which currency?",
    });
    expect(flagged.queue.state).toBe("working");
    expect(flagged.queue.needsInput).toBe(true);
    expect(
      (
        await f.person.query(api.queue.counts, {
          householdId: f.householdId,
          moveId: f.moveId,
        })
      ).needsYou,
    ).toBe(1);
    const cleared = await f.person.mutation(api.queue.provideInput, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: flagged.queue.version,
      idempotencyKey: "answer",
      response: "USD",
    });
    expect(cleared.state).toBe("working");
    expect(cleared.needsInput).toBe(false);
    await f.t.run(async (ctx) => {
      await ctx.db.patch(item.queueItemId, {
        state: "needsYou",
        needsInput: undefined,
        requiredAction: "Old question",
      });
      const row = (await ctx.db.get(item.queueItemId))!;
      expect(shapeQueueItem(row).state).toBe("waitingForAi");
      expect(shapeQueueItem(row).needsInput).toBe(true);
      expect(queueItemMatchesEffectiveState(row, "needsYou", Date.now())).toBe(
        true,
      );
    });
  });
  it("narrowing suggestion power blocks ideas while requests still work", async () => {
    const f = await fixture();
    const state = await f.t.query(internal.aiGrants.describeConnection, {
      subject,
      clientId,
    });
    await f.t.mutation(internal.aiGrants.reduceConnection, {
      subject,
      clientId,
      expectedVersion: state.version!,
      opId: "no-ideas",
      scopes: movingScopes.filter(
        (scope) => scope !== "moving.suggestions.propose",
      ),
    });
    await expect(f.add()).rejects.toThrow(
      /suggestions.propose|permission|scope/i,
    );
    expect((await f.add("ai_on_request")).addedBy).toBe("ai_on_request");
  });
});

// Exercise the actual legacy mutation and the shared HTTP/stdio adapter against
// a real in-memory Convex backend, not a mocked acceptance response.
describe("AWL-0016 every AI door", () => {
  it("legacy capture refuses omitted origin; own ideas never become capture work", async () => {
    const f = await fixture();
    const caller = { subject, claims: { azp: clientId } };
    await expect(
      f.t.mutation(internal.mcpToolsWrite.captureToQueue, {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        entries: [{ instructions: "Own idea" }],
      }),
    ).rejects.toThrow(/addedBy/);
    const idea = await f.t.mutation(
      internal.mcpToolsCanonicalQueue.addQueueItem,
      {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        directive: "Legacy idea",
        addedBy: "ai_suggestion",
        reason: "A useful follow-up",
        operationId: "legacy",
      },
    );
    await expect(
      f.t.mutation(internal.mcpToolsCanonicalQueue.claimQueueItem, {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        idempotencyKey: "claim",
        nextStep: "Not accepted",
      }),
    ).rejects.toThrow(/unaccepted/);
    const captures = await f.t.run((ctx) =>
      ctx.db.query("ingestionQueueEntries").collect(),
    );
    expect(captures).toEqual([]);
  });
  it("HTTP REST, hosted MCP and stdio's shared handlers refuse work and AI decisions", async () => {
    const f = await fixture();
    const raw = "mmk_SYNTHETICAWL16_notrealabcdef";
    const { apiKeyScopes } = await import("../../convex/lib/apiKeys");
    await f.t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("apiKeys", {
        householdId: f.householdId,
        name: "Synthetic key",
        prefix: apiKeyPrefix(raw),
        tokenPreview: "synthetic",
        secretHash: await hashApiKey(raw),
        scopes: [...apiKeyScopes],
        scopeChoice: "full",
        status: "active",
        createdByUserId: f.userId,
        createdAt: now,
        updatedAt: now,
      });
    });
    const rest = async (
      method: "GET" | "POST",
      path: string,
      body?: unknown,
      idempotencyKey?: string,
    ) =>
      f.t.mutation(internal.restApi.handle, {
        method,
        path: path.replace(/^\/api\/v1\//, ""),
        body,
        query: {},
        authorization: `Bearer ${raw}`,
        idempotencyKey,
      });
    const missing = await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue`,
      { directive: "Unclassified" },
      "missing",
    );
    expect(missing.status).toBeGreaterThanOrEqual(400);
    const added = await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue`,
      {
        directive: "REST idea",
        addedBy: "ai_suggestion",
        reason: "Useful idea",
      },
      "add-rest",
    );
    expect(added.status).toBe(201);
    const idea = (
      added.body as { data: { queueItemId: string; version: number } }
    ).data;
    for (const action of [
      "claim",
      "complete",
      "accept",
      "dismiss",
      "edit-accept",
    ]) {
      const r = await rest(
        "POST",
        `/api/v1/moves/${f.moveId}/queue/${idea.queueItemId}/${action}`,
        {
          expectedVersion: idea.version,
          nextStep: "Illegitimate",
          resultSummary: "Illegitimate",
        },
        action,
      );
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
    for (const kind of [
      "ai-text-suggestions",
      "ai-photo-suggestions",
      "planning-suggestions",
    ])
      for (const action of ["approve", "reject"]) {
        const decision = await rest(
          "POST",
          `/api/v1/moves/${f.moveId}/${kind}/${action}`,
          { suggestionIds: ["synthetic"] },
          `${kind}:${action}`,
        );
        expect(decision.status).toBeGreaterThanOrEqual(400);
        expect(JSON.stringify(decision.body)).toContain("Only the person");
      }
    const { registerTools } =
      await import("../../mcp-server/assistwithmoving-mcp.mjs");
    const tools = new Map<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >();
    const target = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (input: Record<string, unknown>) => Promise<unknown>,
      ) => {
        tools.set(name, handler);
      },
    };
    registerTools(target, {
      baseUrl: "https://synthetic.invalid/api/v1",
      apiKey: raw,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const result = await rest(
        (init?.method ?? "GET") as "GET" | "POST",
        url.pathname,
        init?.body ? JSON.parse(String(init.body)) : undefined,
        (init?.headers as Record<string, string>)?.["idempotency-key"],
      );
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const response = await tools.get("claim_queue_item")!({
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        nextStep: "Not accepted",
        idempotencyKey: "adapter",
      });
      expect(JSON.stringify(response)).toMatch(/unaccepted/);
      const add = await tools.get("add_queue_item")!({
        moveId: f.moveId,
        directive: "Missing origin",
        operationId: "adapter-add",
      });
      expect(JSON.stringify(add)).toMatch(/addedBy/);
      const suggestions = await tools.get("list_queue_suggestions")!({
        moveId: f.moveId,
      });
      expect(JSON.stringify(suggestions)).toContain("REST idea");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

it("canonical MCP protocol refuses a claim and omitted addedBy through its actual catalog", async () => {
  const f = await fixture();
  const idea = await f.add();
  const { createMcpHandler } = await import("@modelcontextprotocol/server");
  const handler = createMcpHandler(
    () =>
      createMovingServer(
        {
          runQuery: (ref: Parameters<typeof f.t.query>[0], args: never) =>
            f.t.query(ref, args),
          runMutation: (ref: Parameters<typeof f.t.mutation>[0], args: never) =>
            f.t.mutation(ref, args),
        } as never,
        f.principal,
        [...movingScopes],
      ).server,
    { legacy: "stateless", responseMode: "json" },
  );
  async function call(name: string, args: Record<string, unknown>) {
    const response = await handler.fetch(
      new Request("https://moving.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": name,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name,
            arguments: args,
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": {
                name: "Synthetic AI",
                version: "1",
              },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      }),
    );
    return response.json();
  }
  const rejected = await call("claim_queue_work", {
    moveId: f.moveId,
    queueItemId: idea.queueItemId,
    expectedVersion: idea.version,
    operationId: "protocol-claim",
    nextStep: "Not accepted",
  });
  expect(JSON.stringify(rejected)).toMatch(/unaccepted/);
  const missing = await call("add_queue_item", {
    moveId: f.moveId,
    directive: "Unclassified",
    operationId: "protocol-missing",
  });
  expect(JSON.stringify(missing)).toMatch(/addedBy/);
});

it("keeps suggestions private from another household manager and validates From records", async () => {
  const f = await fixture();
  const idea = await f.add();
  const other = await f.t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: "SYNTHETIC-other-person",
      email: "other@example.test",
      name: "Synthetic manager",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    await ctx.db.insert("householdMemberships", {
      householdId: f.householdId,
      userId,
      role: "owner",
      status: "active",
      apiAccessStatus: "enabled",
      createdByUserId: f.userId,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
  const manager = f.t.withIdentity({
    subject: "SYNTHETIC-other-person",
    sid: "synthetic-manager",
  });
  expect(
    (
      await manager.query(api.queue.suggestionView, {
        householdId: f.householdId,
        moveId: f.moveId,
      })
    ).items,
  ).toEqual([]);
  await expect(
    manager.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      action: "accept",
      expectedVersion: idea.version,
      operationId: "not-yours",
    }),
  ).rejects.toThrow(/owner/);
  await expect(
    manager.mutation(api.queue.provideInput, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      response: "Peek",
      expectedVersion: idea.version,
      idempotencyKey: "manager-input",
    }),
  ).rejects.toThrow(/private/);
  await expect(
    manager.mutation(api.queue.cancel, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      reason: "Peek",
      expectedVersion: idea.version,
      idempotencyKey: "manager-cancel",
    }),
  ).rejects.toThrow(/private/);
  const source = await f.t.run(async (ctx) => {
    const row = (await ctx.db.get(idea.queueItemId))!;
    const { _id, _creationTime, ...fields } = row;
    void _id;
    void _creationTime;
    return ctx.db.insert("queueItems", {
      ...fields,
      ownerUserId: other,
      createdByUserId: other,
    });
  });
  await expect(
    f.t.mutation(internal.mcpQueueWork.addQueueItem, {
      principal: f.principal,
      moveId: f.moveId,
      directive: "Foreign reference",
      addedBy: "ai_suggestion",
      reason: "Not mine",
      fromRecord: { type: "queue", id: source },
      operationId: "foreign",
    }),
  ).rejects.toThrow(/same person/);
  const own = await f.t.mutation(internal.mcpQueueWork.addQueueItem, {
    principal: f.principal,
    moveId: f.moveId,
    directive: "Own reference",
    addedBy: "ai_on_request",
    fromRecord: {
      type: "queue",
      id: idea.queueItemId,
      label: "Untrusted title",
    },
    operationId: "own",
  });
  expect(own.fromRecord?.label).toBe(idea.directive);
});
