// @vitest-environment node
import type { FunctionReference } from "convex/server";
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
import {
  nativeWebsiteClaims,
  nativeWebsiteIdentity,
} from "../helpers/website-session";
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
    clientName: "Synthetic AI",
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
    person: t.withIdentity(nativeWebsiteIdentity(subject, issuer)),
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
    expect(accepted.suggestionActedAt).toBeTypeOf("number");
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
    expect(dismissed.suggestionActedAt).toBeTypeOf("number");
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
    expect(restored.suggestionActedAt).toBe(dismissed.suggestionActedAt);
    await expect(f.add("ai_suggestion", "repeat-after-reopen")).rejects.toThrow(
      /new reason/,
    );
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
  it("records a person reply permanently even on an older accepted suggestion", async () => {
    const f = await fixture();
    const idea = await f.add();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(idea.queueItemId, {
        suggestionStatus: "accepted",
        needsInput: true,
        requiredAction: "Which estimate?",
        suggestionActedAt: undefined,
      });
    });
    const replied = await f.person.mutation(api.queue.provideInput, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      response: "The second estimate",
      idempotencyKey: "person-reply",
    });
    expect(replied.suggestionActedAt).toBeTypeOf("number");
    const archived = await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      action: "archive",
      operationId: "person-archive",
      expectedVersion: replied.version,
    });
    const reopened = await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      action: "restore",
      operationId: "person-reopen",
      expectedVersion: archived.version,
    });
    expect(archived.suggestionActedAt).toBe(replied.suggestionActedAt);
    expect(reopened.suggestionActedAt).toBe(replied.suggestionActedAt);
    await expect(
      f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
        principal: f.principal,
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        operationId: "withdraw-after-reply",
        expectedVersion: reopened.version,
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
    const reopened = await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      action: "restore",
      operationId: "reopen-withdrawn",
      expectedVersion: withdrawn.version,
    });
    expect(reopened.suggestionActedAt).toBeTypeOf("number");
    // A previous successful withdraw opId cannot bypass a later person action.
    await expect(
      f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
        principal: f.principal,
        moveId: f.moveId,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        operationId: "withdraw",
      }),
    ).rejects.toThrow(/already acted/);
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
    const requested = await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue`,
      { directive: "Requested", addedBy: "ai_on_request" },
      "requested-flag",
    );
    const requestItem = (
      requested.body as { data: { queueItemId: string; version: number } }
    ).data;
    await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue/${requestItem.queueItemId}/claim`,
      { expectedVersion: requestItem.version, nextStep: "Compare" },
      "request-claim",
    );
    const asked = await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue/${requestItem.queueItemId}/needs-you`,
      { expectedVersion: 2, requiredAction: "Which mover?" },
      "request-question",
    );
    expect(asked.status).toBe(200);
    for (const action of ["complete", "failure", "archive"]) {
      const refusal = await rest(
        "POST",
        `/api/v1/moves/${f.moveId}/queue/${requestItem.queueItemId}/${action}`,
        {
          expectedVersion: 3,
          resultSummary: "Clear",
          code: "error",
          message: "Retry",
          retryable: true,
          needsInput: false,
          archived: action === "archive",
        },
        `forbidden-clear:${action}`,
      );
      expect(refusal.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(refusal.body)).toContain(
        "Only the person can clear Needs your input",
      );
    }
    const archiveRefusal = await rest(
      "POST",
      `/api/v1/moves/${f.moveId}/queue/${requestItem.queueItemId}/archive`,
      { expectedVersion: 3 },
      "archive-without-clear-field",
    );
    expect(JSON.stringify(archiveRefusal.body)).toContain(
      "Only the person can clear Needs your input",
    );
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
      const cannotFinish = await tools.get("complete_queue_item")!({
        moveId: f.moveId,
        queueItemId: requestItem.queueItemId,
        expectedVersion: 3,
        resultSummary: "AI clears",
        idempotencyKey: "adapter-flag",
      });
      expect(JSON.stringify(cannotFinish)).toContain(
        "Only the person can clear Needs your input",
      );
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
  await f.add("ai_suggestion", "cursor-second");
  const firstPage = (
    await call("list_queue_suggestions", { moveId: f.moveId, limit: 1 })
  ).result.structuredContent;
  expect(firstPage.items).toHaveLength(1);
  expect(firstPage.nextCursor).not.toBeNull();
  const secondPage = (
    await call("list_queue_suggestions", {
      moveId: f.moveId,
      limit: 1,
      cursor: firstPage.nextCursor,
    })
  ).result.structuredContent;
  expect(secondPage.items).toHaveLength(1);
  expect(secondPage.items[0].queueItemId).not.toBe(
    firstPage.items[0].queueItemId,
  );
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
  const manager = f.t.withIdentity(
    nativeWebsiteIdentity(
      "SYNTHETIC-other-person",
      issuer,
      "sess_synthetic_manager",
    ),
  );
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
  const work = await f.add("ai_on_request", "manager-archive-work");
  const archiveArgs = {
    householdId: f.householdId,
    moveId: f.moveId,
    queueItemId: work.queueItemId,
    action: "archive" as const,
    expectedVersion: work.version,
    operationId: "manager-archive",
  };
  const archived = await manager.mutation(
    api.queue.reviewSuggestion,
    archiveArgs,
  );
  expect(archived.archivedAt).toBeTypeOf("number");
  expect(archived.state).toBe(work.state);
  expect(
    (await manager.mutation(api.queue.reviewSuggestion, archiveArgs)).version,
  ).toBe(archived.version);
  await expect(
    manager.mutation(api.queue.reviewSuggestion, {
      ...archiveArgs,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      operationId: "manager-open-suggestion",
    }),
  ).rejects.toThrow(/owner/);
  const sharedSpace = await f.t.run((ctx) =>
    ctx.db.insert("moveSpaces", {
      householdId: f.householdId,
      moveId: f.moveId,
      kind: "originRoom",
      name: "Partner's room",
      capacity: {},
      aliases: [],
      sortOrder: 1,
      status: "active",
      createdByUserId: other,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const shared = await f.t.mutation(internal.mcpQueueWork.addQueueItem, {
    principal: f.principal,
    moveId: f.moveId,
    directive: "Shared room context",
    addedBy: "ai_on_request",
    fromRecord: { type: "space", id: sharedSpace },
    operationId: "shared-space",
  });
  expect(shared.fromRecord?.id).toBe(sharedSpace);
  expect(
    (
      await f.person.query(api.queue.get, {
        householdId: f.householdId,
        moveId: f.moveId,
        queueItemId: shared.queueItemId,
      })
    ).fromRecord?.id,
  ).toBe(sharedSpace);
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
  const mismatched = await f.t.mutation(internal.mcpQueueWork.addQueueItem, {
    principal: f.principal,
    moveId: f.moveId,
    directive: "Foreign reference",
    addedBy: "ai_suggestion",
    reason: "Not mine",
    fromRecord: { type: "queue", id: source },
    operationId: "foreign",
  });
  expect(mismatched.fromRecord).toBeNull();
  expect(mismatched.directive).toBe("Foreign reference");
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

// Campaign lessons 1–11: these extend, rather than relax, the existing boundaries.
describe("AWL-0016 audit lessons", () => {
  it("only a person clears the flag; asking drops the lease, answering keeps state and permits a fresh claim", async () => {
    const f = await fixture();
    const item = await f.add("ai_on_request");
    const claimed = await f.t.mutation(internal.mcpQueueWork.claimQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: item.version,
      operationId: "lesson-claim",
      nextStep: "Compare",
    });
    const asked = await f.t.mutation(internal.mcpQueueWork.askQueueQuestion, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: claimed.queue.version,
      operationId: "lesson-ask",
      question: "Which mover?",
    });
    expect(asked.queue.state).toBe("working");
    expect(asked.queue.needsInput).toBe(true);
    expect(asked.queue.claim?.expiresAt ?? null).toBeNull();
    for (const [ref, payload] of [
      [internal.mcpQueueWork.completeQueueWork, { resultSummary: "Done" }],
      [internal.mcpQueueWork.releaseQueueWork, { reason: "Clear" }],
      [internal.mcpQueueWork.claimQueueWork, { nextStep: "Clear" }],
    ] as const)
      await expect(
        f.t.mutation(ref, {
          principal: f.principal,
          moveId: f.moveId,
          queueItemId: item.queueItemId,
          expectedVersion: asked.queue.version,
          operationId: "lesson-refuse",
          ...payload,
        } as never),
      ).rejects.toThrow(/Only the person can clear Needs your input/);
    const caller = { subject, claims: { azp: clientId } };
    await expect(
      f.t.mutation(internal.mcpToolsCanonicalQueue.reportQueueFailure, {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        queueItemId: item.queueItemId,
        expectedVersion: asked.queue.version,
        idempotencyKey: "lesson-failure",
        code: "error",
        message: "Retry",
        retryable: true,
      }),
    ).rejects.toThrow("Only the person can clear Needs your input");
    const oauth = f.t.withIdentity({
      subject,
      client_id: clientId,
      tokenType: "oauth",
    });
    await expect(
      oauth.mutation(api.queue.provideInput, {
        householdId: f.householdId,
        moveId: f.moveId,
        queueItemId: item.queueItemId,
        response: "AI answer",
      }),
    ).rejects.toThrow();
    await expect(
      f.t.run((ctx) =>
        reviewQueueSuggestion(ctx, f.ai, {
          householdId: f.householdId,
          moveId: f.moveId,
          queueItemId: item.queueItemId,
          expectedVersion: asked.queue.version,
          idempotencyKey: "hide-flag",
          action: "archive",
        }),
      ),
    ).rejects.toThrow("Only the person can clear Needs your input");
    const answer = await f.person.mutation(api.queue.provideInput, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      response: "Blue Van",
      expectedVersion: asked.queue.version,
      idempotencyKey: "human-answer",
    });
    expect(answer.state).toBe("working");
    expect(answer.needsInput).toBe(false);
    expect(
      (
        await f.t.query(internal.mcpQueueWork.listQueueWork, {
          principal: f.principal,
          moveId: f.moveId,
        })
      ).work.map((i) => i.queueItemId),
    ).toContain(item.queueItemId);
    const resumed = await f.t.mutation(internal.mcpQueueWork.claimQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: answer.version,
      operationId: "lesson-resume",
      nextStep: "Resume",
    });
    expect(resumed.queue.state).toBe("working");
    expect(resumed.queue.claim?.expiresAt).toBeTypeOf("number");
    const done = await f.t.mutation(internal.mcpQueueWork.completeQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: resumed.queue.version,
      operationId: "answer-first",
      resultSummary: "Comparison saved",
    });
    const afterAnswer = await f.t.mutation(
      internal.mcpQueueWork.askQueueQuestion,
      {
        principal: f.principal,
        moveId: f.moveId,
        queueItemId: item.queueItemId,
        expectedVersion: done.queue.version,
        operationId: "question-after-answer",
        question: "Which option should we choose?",
      },
    );
    expect(afterAnswer.queue.state).toBe("done");
    expect(
      (
        await f.person.query(api.queue.badges, {
          householdId: f.householdId,
          moveId: f.moveId,
        })
      ).needsYou,
    ).toBe(1);
    const cleared = await f.person.mutation(api.queue.provideInput, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      response: "",
      clearOnly: true,
      expectedVersion: afterAnswer.queue.version,
      idempotencyKey: "human-clear",
    });
    expect(cleared.state).toBe("done");
    expect(cleared.needsInput).toBe(false);
  });
  it("counts flagged Answered items in both the pill and tab past 500 and does not fetch the Queue body for nav", async () => {
    const f = await fixture();
    const base = await f.add("ai_on_request");
    await f.t.run(async (ctx) => {
      const row = (await ctx.db.get(base.queueItemId))!;
      const { _id, _creationTime, ...fields } = row;
      void _id;
      void _creationTime;
      await ctx.db.patch(base.queueItemId, {
        state: "done",
        needsInput: true,
        requiredAction: "Pick one",
        terminalReason: "completed",
        resultSummary: "Answered",
      });
      for (let i = 0; i < 525; i++)
        await ctx.db.insert("queueItems", {
          ...fields,
          state: "done",
          needsInput: true,
          requiredAction: "Review",
          directive: `Answered ${i}`,
          terminalReason: "completed",
          resultSummary: "Answer",
        });
      await ctx.db.insert("queueItems", {
        ...fields,
        state: "done",
        needsInput: true,
        archivedAt: Date.now(),
      });
    });
    const badges = await f.person.query(api.queue.badges, {
      householdId: f.householdId,
      moveId: f.moveId,
    });
    const counts = await f.person.query(api.queue.counts, {
      householdId: f.householdId,
      moveId: f.moveId,
    });
    expect(badges.needsYou).toBe(526);
    expect(counts.needsYou).toBe(526);
    expect(counts.needsInputOpen).toBe(526);
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("convex/queue.ts", "utf8").split(
      "export const badges =",
    )[1];
    expect(source).not.toContain(".collect()");
    expect(source).not.toContain(".take(");
  });
  it("checks previous dismissals through its index after 600 unrelated rows; non-work does not consume a work limit", async () => {
    const f = await fixture();
    const early = await f.add("ai_on_request", "early-work");
    const idea = await f.add();
    await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      action: "dismiss",
      expectedVersion: idea.version,
      operationId: "dismiss",
    });
    await f.t.run(async (ctx) => {
      const row = (await ctx.db.get(early.queueItemId))!;
      const { _id, _creationTime, ...fields } = row;
      void _id;
      void _creationTime;
      for (let i = 0; i < 610; i++)
        await ctx.db.insert("queueItems", {
          ...fields,
          directive: `Other idea ${i}`,
          addedBy: "ai_suggestion",
          suggestionStatus: i % 2 ? "open" : "dismissed",
          suggestionReason: "Other",
          archivedAt: i % 2 ? undefined : Date.now(),
          updatedAt: Date.now() + i,
        });
    });
    await expect(f.add("ai_suggestion", "same-dismissed-idea")).rejects.toThrow(
      /new reason/,
    );
    const work = await f.t.query(internal.mcpQueueWork.listQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      limit: 1,
    });
    expect(work.work.map((i) => i.queueItemId)).toEqual([early.queueItemId]);
    const brief = await f.t.query(internal.mcpPlanning.getMoveBrief, {
      principal: f.principal,
      moveId: f.moveId,
    });
    expect(brief.queue?.waitingForAi.map((i) => i.queueItemId)).toContain(
      early.queueItemId,
    );
  });
  it("failed work keeps state and flag; timeout recovery drains old flagged and archived leases without stalling", async () => {
    const f = await fixture();
    const item = await f.add("ai_on_request");
    const claimed = await f.t.mutation(internal.mcpQueueWork.claimQueueWork, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: item.queueItemId,
      expectedVersion: item.version,
      operationId: "fail-claim",
      nextStep: "Compare",
    });
    const failed = await f.t.run((ctx) =>
      import("../../convex/lib/queueService").then((m) =>
        m.reportQueueFailure(ctx, f.ai, {
          householdId: f.householdId,
          moveId: f.moveId,
          queueItemId: item.queueItemId,
          expectedVersion: claimed.queue.version,
          code: "blocked",
          message: "Need a decision",
          retryable: false,
          idempotencyKey: "fail-once",
        }),
      ),
    );
    expect(failed.state).toBe("working");
    expect(failed.needsInput).toBe(true);
    expect(failed.claimExpiresAt).toBeUndefined();
    await f.t.run(async (ctx) => {
      const row = (await ctx.db.get(item.queueItemId))!;
      const { _id, _creationTime, ...fields } = row;
      void _id;
      void _creationTime;
      for (let i = 0; i < 215; i++)
        await ctx.db.insert("queueItems", {
          ...fields,
          archivedAt: i % 2 ? Date.now() : undefined,
          claimExpiresAt: Date.now() - 1000,
          claimedByUserId: f.userId,
        });
    });
    for (let i = 0; i < 3; i++)
      await f.t.mutation(internal.queue.maintainLeasesAndExpiry, {});
    expect(
      await f.t.run((ctx) =>
        ctx.db
          .query("queueItems")
          .withIndex("by_state_claim_expiry", (q) =>
            q
              .eq("state", "working")
              .gt("claimExpiresAt", undefined)
              .lt("claimExpiresAt", Date.now()),
          )
          .collect(),
      ),
    ).toEqual([]);
    expect(
      (
        await f.person.query(api.queue.get, {
          householdId: f.householdId,
          moveId: f.moveId,
          queueItemId: item.queueItemId,
        })
      ).needsInput,
    ).toBe(true);
  });
  it("broken From context never hides the item or breaks a replay, and withdraw has normal history and audit", async () => {
    const f = await fixture();
    const source = await f.add("ai_on_request", "source");
    const args = {
      principal: f.principal,
      moveId: f.moveId,
      directive: "Linked work",
      addedBy: "ai_on_request" as const,
      fromRecord: { type: "queue", id: source.queueItemId },
      operationId: "linked",
    };
    const linked = await f.t.mutation(internal.mcpQueueWork.addQueueItem, args);
    await f.t.run((ctx) => ctx.db.delete(source.queueItemId));
    const reread = await f.person.query(api.queue.get, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: linked.queueItemId,
    });
    expect(reread.directive).toBe("Linked work");
    expect(reread.fromRecord).toBeNull();
    expect(
      (await f.t.mutation(internal.mcpQueueWork.addQueueItem, args))
        .queueItemId,
    ).toBe(linked.queueItemId);
    const idea = await f.add();
    await f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
      principal: f.principal,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      operationId: "withdraw-audit",
    });
    const [history, audit] = await f.t.run(
      async (ctx) =>
        [
          await ctx.db
            .query("queueActivities")
            .withIndex("by_item_idempotency", (q) =>
              q
                .eq("queueItemId", idea.queueItemId)
                .eq("idempotencyKey", "withdraw-audit"),
            )
            .unique(),
          await ctx.db
            .query("auditLogs")
            .filter((q) =>
              q.and(
                q.eq(q.field("objectId"), idea.queueItemId),
                q.eq(q.field("action"), "queue.suggestionReviewed"),
              ),
            )
            .collect(),
        ] as const,
    );
    expect(history?.actorType).toBe("agent");
    expect(history?.message).toBe("withdraw");
    expect(audit).toHaveLength(1);
  });
});

it("AWL-0015 still gives old narrowed connections new powers unless explicitly removed", async () => {
  const { accessFixture } = await import("../helpers/ai-access");
  const f = await accessFixture("SYNTHETIC-lessons-grants");
  const old = await f.legacyGrant({
    clientId: "old-narrowed",
    scopes: ["moving.context.read"],
    scopeChoice: "chosen",
  });
  await f.connect("old-narrowed");
  await f.finish();
  const state = await f.connect("old-narrowed");
  expect(state.scopes).toContain("moving.suggestions.propose");
  expect(
    state.scopes.filter((scope) => scope !== "moving.suggestions.propose"),
  ).toEqual(["moving.context.read"]);
  await f.reduce(
    { scopes: ["moving.context.read"], opId: "explicitly-remove-proposals" },
    "old-narrowed",
  );
  expect((await f.connect("new-ai")).scopes).not.toContain(
    "moving.suggestions.propose",
  );
  expect((await f.t.run((ctx) => ctx.db.get(old)))?.scopes).toEqual([
    "moving.context.read",
  ]);
});

it("legacy capture questions keep state, clear leases, and cannot be cleared by an AI or a generic OAuth update", async () => {
  const f = await fixture();
  const entryId = await f.t.run((ctx) =>
    ctx.db.insert("ingestionQueueEntries", {
      householdId: f.householdId,
      moveId: f.moveId,
      ownerUserId: f.userId,
      createdByUserId: f.userId,
      status: "claimed",
      mediaPhotoIds: [],
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
      claimedByUserId: f.userId,
      claimedByConnectionId: `oauth:${clientId}`,
      claimExpiresAt: Date.now() + 60000,
    }),
  );
  const caller = { subject, claims: { azp: clientId } };
  const asked = await f.t.mutation(internal.mcpToolsQueue.submitQueueResult, {
    caller,
    householdId: f.householdId,
    moveId: f.moveId,
    entryId,
    needsInputQuestion: "Which room?",
  });
  expect(asked.state).toBe("working");
  const row = await f.t.run((ctx) => ctx.db.get(entryId));
  expect(row?.status).toBe("claimed");
  expect(row?.needsInput).toBe(true);
  expect(row?.needsInputAt).toBeTypeOf("number");
  expect(row?.needsInputBy).toBeTypeOf("string");
  expect(row?.claimExpiresAt).toBeUndefined();
  await expect(
    f.t.mutation(internal.mcpToolsQueue.submitQueueResult, {
      caller,
      householdId: f.householdId,
      moveId: f.moveId,
      entryId,
      agentSummary: "AI clears it",
    }),
  ).rejects.toThrow(/Only the person/);
  await expect(
    f.t
      .withIdentity({ subject, client_id: clientId, tokenType: "oauth" })
      .mutation(api.ingestionQueue.updateEntry, {
        householdId: f.householdId,
        moveId: f.moveId,
        entryId,
        instructions: "AI clears via revise",
      }),
  ).rejects.toThrow();
  await f.person.mutation(api.ingestionQueue.updateEntry, {
    householdId: f.householdId,
    moveId: f.moveId,
    entryId,
    instructions: "Bedroom",
  });
  const answered = await f.t.run((ctx) => ctx.db.get(entryId));
  expect(answered?.status).toBe("queued");
  expect(answered?.needsInput).toBe(false);
});

describe("AWL-0016 audit follow-up", () => {
  it("rejects questions on another connection's claim and on closed captures, without changing their data", async () => {
    const f = await fixture();
    const caller = { subject, claims: { azp: clientId } };
    const makeCapture = (
      fields: Partial<
        import("../../convex/_generated/dataModel").Doc<"ingestionQueueEntries">
      > = {},
    ) =>
      f.t.run((ctx) =>
        ctx.db.insert("ingestionQueueEntries", {
          householdId: f.householdId,
          moveId: f.moveId,
          ownerUserId: f.userId,
          createdByUserId: f.userId,
          status: "queued",
          mediaPhotoIds: [],
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
          ...fields,
        }),
      );
    const otherUserId = await f.t.run(async (ctx) => {
      const row = (await ctx.db.get(f.userId))!;
      const { _id, _creationTime, ...fields } = row;
      void _id;
      void _creationTime;
      return ctx.db.insert("users", {
        ...fields,
        clerkUserId: "SYNTHETIC-other-claimer",
      });
    });
    for (const fields of [
      {
        status: "claimed" as const,
        claimedByUserId: otherUserId,
        claimedByConnectionId: `oauth:${clientId}`,
        claimExpiresAt: Date.now() + 60000,
      },

      {
        status: "claimed" as const,
        claimedByUserId: f.userId,
        claimedByConnectionId: "oauth:other-ai",
        claimExpiresAt: Date.now() + 60000,
      },
      {
        status: "claimed" as const,
        claimedByUserId: f.userId,
        claimedByConnectionId: "oauth:other-ai",
        claimExpiresAt: 1,
      },
      { status: "resolved" as const },
      { status: "discarded" as const },
    ]) {
      const entryId = await makeCapture(fields);
      const before = await f.t.run((ctx) => ctx.db.get(entryId));
      await expect(
        f.t.mutation(internal.mcpToolsQueue.submitQueueResult, {
          caller,
          householdId: f.householdId,
          moveId: f.moveId,
          entryId,
          needsInputQuestion: "Which room?",
        }),
      ).rejects.toThrow(/another AI|Resolved or discarded/);
      expect(await f.t.run((ctx) => ctx.db.get(entryId))).toEqual(before);
    }
    const entryId = await makeCapture();
    const claimed = await f.t.mutation(internal.mcpToolsQueue.claimQueue, {
      caller,
      householdId: f.householdId,
      moveId: f.moveId,
      batchSize: 1,
      agentLabel: "Named AI",
    });
    expect(JSON.stringify(claimed)).toContain(entryId);
    const asked = await f.t.mutation(internal.mcpToolsQueue.submitQueueResult, {
      caller,
      householdId: f.householdId,
      moveId: f.moveId,
      entryId,
      needsInputQuestion: "Which room?",
    });
    expect(asked.needsInput).toBe(true);
    expect(
      (await f.t.run((ctx) => ctx.db.get(entryId)))?.claimedByConnectionId,
    ).toBeUndefined();
    await f.person.mutation(api.ingestionQueue.setEntryStatus, {
      householdId: f.householdId,
      moveId: f.moveId,
      entryId,
      status: "resolved",
    });
    expect((await f.t.run((ctx) => ctx.db.get(entryId)))?.needsInput).toBe(
      false,
    );
    const discardId = await makeCapture({
      status: "claimed",
      needsInput: true,
      agentQuestion: "Which room?",
    });
    await f.person.mutation(api.ingestionQueue.setEntryStatus, {
      householdId: f.householdId,
      moveId: f.moveId,
      entryId: discardId,
      status: "discarded",
    });
    expect((await f.t.run((ctx) => ctx.db.get(discardId)))?.status).toBe(
      "discarded",
    );
  });
  it("includes flagged Answered work and personal captures in the move brief", async () => {
    const f = await fixture();
    const done = await f.add("ai_on_request");
    const entryId = await f.t.run(async (ctx) => {
      await ctx.db.patch(done.queueItemId, {
        state: "done",
        needsInput: true,
        requiredAction: "Share this?",
      });
      return ctx.db.insert("ingestionQueueEntries", {
        householdId: f.householdId,
        moveId: f.moveId,
        createdByUserId: f.userId,
        status: "claimed",
        needsInput: true,
        agentQuestion: "Which room?",
        mediaPhotoIds: [],
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const brief = await f.t.query(internal.mcpPlanning.getMoveBrief, {
      principal: f.principal,
      moveId: f.moveId,
    });
    expect(JSON.stringify(brief.queue?.needsInput)).toContain(done.queueItemId);
    expect(JSON.stringify(brief.queue?.needsInput)).toContain(entryId);
    expect(JSON.stringify(brief.queue?.needsInput)).toContain("Which room?");
  });
  it("uses a normalized fixed-size dismissal key even for maximum multibyte text", async () => {
    const f = await fixture();
    const { queueSuggestionFingerprint } =
      await import("../../convex/lib/queueSuggestions");
    const directive = "界".repeat(4000),
      reason = "由".repeat(4000);
    const fingerprint = await queueSuggestionFingerprint(directive, reason);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await queueSuggestionFingerprint(` ${directive} `, ` ${reason} `),
    ).toBe(fingerprint);
    expect(
      await queueSuggestionFingerprint(directive, reason + "different"),
    ).not.toBe(fingerprint);
    const idea = await f.t.mutation(internal.mcpQueueWork.addQueueItem, {
      principal: f.principal,
      moveId: f.moveId,
      directive,
      reason,
      addedBy: "ai_suggestion",
      operationId: "long-idea",
    });
    expect(
      (await f.t.run((ctx) => ctx.db.get(idea.queueItemId)))
        ?.suggestionFingerprint,
    ).toBe(fingerprint);
    await f.person.mutation(api.queue.reviewSuggestion, {
      householdId: f.householdId,
      moveId: f.moveId,
      queueItemId: idea.queueItemId,
      expectedVersion: idea.version,
      action: "dismiss",
      operationId: "long-dismiss",
    });
    await expect(
      f.t.mutation(internal.mcpQueueWork.addQueueItem, {
        principal: f.principal,
        moveId: f.moveId,
        directive,
        reason,
        addedBy: "ai_suggestion",
        operationId: "long-repeat",
      }),
    ).rejects.toThrow(/new reason/);
  });
});

it("refuses disabled Propose suggestions on legacy, capture-tool and API-key doors while requests still work", async () => {
  const f = await fixture();
  const caller = { subject, claims: { azp: clientId } };
  const named = await f.t.mutation(internal.mcpToolsWrite.captureToQueue, {
    caller,
    householdId: f.householdId,
    moveId: f.moveId,
    entries: [{ instructions: "A named work idea" }],
    addedBy: "ai_suggestion",
    reason: "A useful follow-up",
    operationId: "named-capture",
  });
  expect(
    (
      await f.t.run((ctx) =>
        ctx.db.get(
          named
            .entryIds[0] as import("../../convex/_generated/dataModel").Id<"queueItems">,
        ),
      )
    )?.addedByLabel,
  ).toBe("Synthetic AI");
  const state = await f.t.query(internal.aiGrants.describeConnection, {
    subject,
    clientId,
  });
  await f.t.mutation(internal.aiGrants.reduceConnection, {
    subject,
    clientId,
    expectedVersion: state.version!,
    opId: "remove-propose-all-doors",
    scopes: movingScopes.filter(
      (scope) => scope !== "moving.suggestions.propose",
    ),
  });
  const base = { caller, householdId: f.householdId, moveId: f.moveId };
  await expect(
    f.t.mutation(internal.mcpToolsCanonicalQueue.addQueueItem, {
      ...base,
      directive: "Own idea",
      addedBy: "ai_suggestion",
      reason: "My idea",
      operationId: "legacy-no-propose",
    }),
  ).rejects.toThrow(/Propose suggestions/);
  expect(
    (
      await f.t.mutation(internal.mcpToolsCanonicalQueue.addQueueItem, {
        ...base,
        directive: "Requested",
        addedBy: "ai_on_request",
        operationId: "legacy-request",
      })
    ).addedBy,
  ).toBe("ai_on_request");
  await expect(
    f.t.mutation(internal.mcpToolsWrite.captureToQueue, {
      ...base,
      entries: [{ instructions: "Own idea" }],
      addedBy: "ai_suggestion",
      reason: "My idea",
      operationId: "capture-no-propose",
    }),
  ).rejects.toThrow(/Propose suggestions/);
  expect(
    (
      await f.t.mutation(internal.mcpToolsWrite.captureToQueue, {
        ...base,
        entries: [{ instructions: "Requested" }],
        addedBy: "ai_on_request",
        operationId: "capture-request",
      })
    ).entryIds,
  ).toHaveLength(1);
  const raw = "mmk_SYNTHETICAWL16_audit_no_propose";
  const { apiKeyScopes } = await import("../../convex/lib/apiKeys");
  await f.t.run(async (ctx) => {
    await ctx.db.insert("apiKeys", {
      householdId: f.householdId,
      name: "No proposals",
      prefix: apiKeyPrefix(raw),
      tokenPreview: "synthetic",
      secretHash: await hashApiKey(raw),
      scopes: apiKeyScopes.filter((scope) => scope !== "queue/suggest"),
      withheldScopes: ["queue/suggest"],
      scopeChoice: "chosen",
      status: "active",
      createdByUserId: f.userId,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const rest = (addedBy: "ai_on_request" | "ai_suggestion") =>
    f.t.mutation(internal.restApi.handle, {
      method: "POST",
      path: `moves/${f.moveId}/queue`,
      query: {},
      authorization: `Bearer ${raw}`,
      idempotencyKey: `key-${addedBy}`,
      body: { directive: "Key work", addedBy, reason: "Key idea" },
    });
  const refused = await rest("ai_suggestion");
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(refused)).toMatch(/Propose suggestions|queue\/suggest/);
  expect((await rest("ai_on_request")).status).toBeLessThan(300);
});

it("lesson 15: narrowed move reach applies before suggestion reads, history and counts for every lifecycle", async () => {
  const f = await fixture();
  const otherMove = await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.moveId))!;
    const { _id, _creationTime, ...fields } = original;
    void _id;
    void _creationTime;
    return ctx.db.insert("moves", {
      ...fields,
      title: "SYNTHETIC unreachable move",
    });
  });
  const groups = [];
  for (const moveId of [f.moveId, otherMove]) {
    const rows = [];
    for (const status of [
      "open",
      "dismissed",
      "withdrawn",
      "accepted",
    ] as const) {
      const idea = await f.t.mutation(internal.mcpQueueWork.addQueueItem, {
        principal: f.principal,
        moveId,
        directive: `${moveId}:${status}`,
        addedBy: "ai_suggestion",
        reason: `Private reason ${moveId}:${status}`,
        operationId: `reach-${moveId}-${status}`,
      });
      if (status === "withdrawn")
        await f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
          principal: f.principal,
          moveId,
          queueItemId: idea.queueItemId,
          expectedVersion: idea.version,
          operationId: `withdraw-${moveId}`,
        });
      else if (status !== "open")
        await f.person.mutation(api.queue.reviewSuggestion, {
          householdId: f.householdId,
          moveId,
          queueItemId: idea.queueItemId,
          expectedVersion: idea.version,
          action: status === "accepted" ? "accept" : "dismiss",
          operationId: `person-${moveId}-${status}`,
          reason: `Private dismissal ${moveId}`,
        });
      rows.push({ id: idea.queueItemId, status });
    }
    groups.push({ moveId, rows });
  }
  const grant = await f.t.query(internal.aiGrants.describeConnection, {
    subject,
    clientId,
  });
  await f.t.mutation(internal.aiGrants.reduceConnection, {
    subject,
    clientId,
    expectedVersion: grant.version!,
    opId: "one-move-reach",
    moveIds: [f.moveId],
  });
  const caller = { subject, claims: { azp: clientId } };
  for (const archived of [false, true]) {
    const expected = archived ? ["dismissed", "withdrawn"] : ["open"];
    const canonical = await f.t.query(internal.mcpQueueWork.listSuggestions, {
      principal: f.principal,
      moveId: f.moveId,
      archived,
      limit: 1,
    });
    expect(canonical.count).toBe(1);
    expect(expected).toContain(canonical.items[0].suggestionStatus);
    if (archived) {
      expect(canonical.nextCursor).not.toBeNull();
      expect(
        (
          await f.t.query(internal.mcpQueueWork.listSuggestions, {
            principal: f.principal,
            moveId: f.moveId,
            archived,
            limit: 1,
            cursor: canonical.nextCursor!,
          })
        ).items[0].queueItemId,
      ).not.toBe(canonical.items[0].queueItemId);
    }
    await expect(
      f.t.query(internal.mcpQueueWork.listSuggestions, {
        principal: f.principal,
        moveId: otherMove,
        archived,
        limit: 1,
      }),
    ).rejects.toThrow(/move|power/);
    const legacy = await f.t.query(
      internal.mcpToolsCanonicalQueue.listSuggestions,
      {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        archived,
        limit: 1,
      },
    );
    expect(legacy.count).toBe(1);
    expect(expected).toContain(legacy.items[0].suggestionStatus);
    await expect(
      f.t.query(internal.mcpToolsCanonicalQueue.listSuggestions, {
        caller,
        householdId: f.householdId,
        moveId: otherMove,
        archived,
        limit: 1,
      }),
    ).rejects.toThrow(/connection|move/);
  }
  for (const { id } of groups[0].rows) {
    expect(
      (
        await f.t.query(internal.mcpToolsCanonicalQueue.getQueueItem, {
          caller,
          householdId: f.householdId,
          moveId: f.moveId,
          queueItemId: id,
        })
      ).item.queueItemId,
    ).toBe(id);
  }
  for (const { id } of groups[1].rows) {
    await expect(
      f.t.query(internal.mcpToolsCanonicalQueue.getQueueItem, {
        caller,
        householdId: f.householdId,
        moveId: otherMove,
        queueItemId: id,
      }),
    ).rejects.toThrow(/connection|move/);
    await expect(
      f.t.query(internal.mcpToolsCanonicalQueue.getQueueItem, {
        caller,
        householdId: f.householdId,
        moveId: f.moveId,
        queueItemId: id,
      }),
    ).rejects.toThrow(/not found|move/i);
  }
  const accepted = groups[0].rows.find((row) => row.status === "accepted")!;
  expect(
    JSON.stringify(
      await f.t.query(internal.mcpQueueWork.listQueueWork, {
        principal: f.principal,
        moveId: f.moveId,
      }),
    ),
  ).toContain(accepted.id);
  await expect(
    f.t.query(internal.mcpQueueWork.listQueueWork, {
      principal: f.principal,
      moveId: otherMove,
    }),
  ).rejects.toThrow(/move|power/);
  const hiddenOpen = groups[1].rows.find((row) => row.status === "open")!;
  await expect(
    f.t.mutation(internal.mcpQueueWork.withdrawSuggestion, {
      principal: f.principal,
      moveId: otherMove,
      queueItemId: hiddenOpen.id,
      expectedVersion: 1,
      operationId: "denied-foreign-withdraw",
    }),
  ).rejects.toThrow(/move|power/);
  await expect(
    f.t.mutation(internal.mcpToolsCanonicalQueue.withdrawSuggestion, {
      caller,
      householdId: f.householdId,
      moveId: otherMove,
      queueItemId: hiddenOpen.id,
      expectedVersion: 1,
      idempotencyKey: "denied-legacy-withdraw",
    }),
  ).rejects.toThrow(/connection|move/);
  expect(
    (
      await f.person.query(api.queue.suggestionView, {
        householdId: f.householdId,
        moveId: otherMove,
      })
    ).count,
  ).toBe(1);
  const raw = "mmk_SYNTHETICAWL16_one_move_reach";
  const { apiKeyScopes } = await import("../../convex/lib/apiKeys");
  await f.t.run(async (ctx) => {
    await ctx.db.insert("apiKeys", {
      householdId: f.householdId,
      moveId: f.moveId,
      name: "One move only",
      prefix: apiKeyPrefix(raw),
      tokenPreview: "synthetic",
      secretHash: await hashApiKey(raw),
      scopes: [...apiKeyScopes],
      scopeChoice: "full",
      status: "active",
      createdByUserId: f.userId,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const rest = (
    moveId: typeof f.moveId,
    suffix: string,
    query: Record<string, string> = {},
  ) =>
    f.t.mutation(internal.restApi.handle, {
      method: "GET",
      path: `moves/${moveId}/queue${suffix}`,
      query,
      authorization: `Bearer ${raw}`,
    });
  for (const archived of ["false", "true"]) {
    const allowed = await rest(f.moveId, "/suggestions", {
      archived,
      limit: "1",
    });
    expect(allowed.status).toBe(200);
    expect(JSON.stringify(allowed)).not.toContain(otherMove);
    const denied = await rest(otherMove, "/suggestions", {
      archived,
      limit: "1",
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(denied)).not.toContain("Private reason");
  }
  for (const { id } of groups[0].rows)
    expect((await rest(f.moveId, `/${id}`)).status).toBe(200);
  for (const { id } of groups[1].rows)
    expect((await rest(otherMove, `/${id}`)).status).toBeGreaterThanOrEqual(
      400,
    );
});

it("lesson 16: website Queue and capture operations require person-session proof, even for an active AI with full grants", async () => {
  const f = await fixture();
  const idea = await f.add();
  const work = await f.add("ai_on_request", "person-work");
  const entryId = await f.t.run((ctx) =>
    ctx.db.insert("ingestionQueueEntries", {
      householdId: f.householdId,
      moveId: f.moveId,
      createdByUserId: f.userId,
      ownerUserId: f.userId,
      status: "queued",
      mediaPhotoIds: [],
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const base = { householdId: f.householdId, moveId: f.moveId };
  const { SETTINGS_REFUSAL } =
    await import("../../convex/lib/connectionReduction");
  const queries = [
    [api.queue.listForMove, { paginationOpts: { cursor: null, numItems: 10 } }],
    [
      api.queue.listCaptureAdapter,
      { paginationOpts: { cursor: null, numItems: 10 } },
    ],
    [
      api.queue.listLegacyCaptureAdapter,
      { ownerUserId: f.userId, paginationOpts: { cursor: null, numItems: 10 } },
    ],
    [api.queue.connectionStatus, {}],
    [api.queue.get, { queueItemId: idea.queueItemId }],
    [
      api.queue.listActivity,
      {
        queueItemId: idea.queueItemId,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    ],
    [api.queue.suggestionView, {}],
    [api.queue.counts, {}],
    [api.queue.archived, {}],
    [
      api.queue.suggestionPage,
      { paginationOpts: { cursor: null, numItems: 10 } },
    ],
    [api.queue.badges, {}],
    [api.ingestionQueue.listForMove, {}],
  ] as const;
  const mutations = [
    [api.queue.createDirective, { directive: "AI bypass" }],
    [
      api.queue.provideInput,
      { queueItemId: work.queueItemId, response: "AI bypass" },
    ],
    [api.queue.cancel, { queueItemId: work.queueItemId, reason: "AI bypass" }],
    ...(["accept", "dismiss", "restore", "archive"] as const).map(
      (action) =>
        [
          api.queue.reviewSuggestion,
          {
            queueItemId: idea.queueItemId,
            action,
            expectedVersion: idea.version,
            operationId: `ai-bypass-${action}`,
          },
        ] as const,
    ),
    [api.ingestionQueue.createEntry, { instructions: "AI bypass" }],
    [api.ingestionQueue.updateEntry, { entryId, instructions: "AI bypass" }],
    [api.ingestionQueue.appendMedia, { entryId, mediaPhotoIds: [] }],
    [api.ingestionQueue.setMediaUploadState, { entryId, state: "complete" }],
    [api.ingestionQueue.setEntryStatus, { entryId, status: "discarded" }],
    [api.ingestionQueue.claimNext, {}],
    [
      api.ingestionQueue.submitResult,
      { entryId, needsInputQuestion: "AI bypass" },
    ],
  ] as const;
  for (const identity of [
    {
      ...nativeWebsiteIdentity(subject, issuer),
      azp: "https://foreign-ai.example.test/client.json",
    },
    { ...nativeWebsiteIdentity(subject, issuer), client_id: clientId },
    { ...nativeWebsiteIdentity(subject, issuer), scope: "openid" },
    { ...nativeWebsiteIdentity(subject, issuer), scp: ["openid"] },
    { subject },
    { subject, client_id: clientId, tokenType: "oauth" },
    {
      subject,
      sid: "sess_not_a_person",
      client_id: clientId,
      tokenType: "oauth",
    },
    {
      subject,
      azp: "https://synthetic-ai.example.test/client.json",
      tokenType: "oauth",
    },
  ]) {
    const ai = f.t.withIdentity(identity);
    for (const [ref, args] of queries)
      await expect(
        ai.query(
          ref as FunctionReference<
            "query",
            "public",
            Record<string, unknown>,
            unknown
          >,
          { ...base, ...args },
        ),
      ).rejects.toThrow(SETTINGS_REFUSAL);
    for (const [ref, args] of mutations)
      await expect(
        ai.mutation(
          ref as FunctionReference<
            "mutation",
            "public",
            Record<string, unknown>,
            unknown
          >,
          { ...base, ...args },
        ),
      ).rejects.toThrow(SETTINGS_REFUSAL);
  }
  expect((await f.person.query(api.queue.suggestionView, base)).count).toBe(1);
  expect((await f.person.query(api.queue.badges, base)).suggestions).toBe(1);
  expect(
    await f.person.query(api.ingestionQueue.listForMove, base),
  ).toHaveLength(1);
  expect(
    (
      await f.person.mutation(api.queue.reviewSuggestion, {
        ...base,
        queueItemId: idea.queueItemId,
        expectedVersion: idea.version,
        action: "accept",
        operationId: "real-person-accept",
      })
    ).suggestionStatus,
  ).toBe("accepted");
});

it("lesson 17: exact native website claims without azp read and decide, but foreign azp and OAuth markers cannot", async () => {
  const f = await fixture();
  const idea = await f.add();
  expect(Object.keys(nativeWebsiteClaims()).sort()).toEqual([
    "aud",
    "exp",
    "fva",
    "iat",
    "iss",
    "nbf",
    "sid",
    "sts",
    "sub",
    "v",
  ]);
  const base = { householdId: f.householdId, moveId: f.moveId };
  expect((await f.person.query(api.queue.suggestionView, base)).count).toBe(1);
  for (const markers of [
    { client_id: "" },
    { scope: "" },
    { scp: [] },
    { azp: "https://foreign.example/client.json" },
    { azp: "opaque-oauth" },
  ]) {
    const actor = f.t.withIdentity({
      ...nativeWebsiteIdentity(subject, issuer),
      ...markers,
    });
    await expect(actor.query(api.queue.badges, base)).rejects.toThrow(
      /only reduce/,
    );
    await expect(
      actor.mutation(api.queue.reviewSuggestion, {
        ...base,
        queueItemId: idea.queueItemId,
        action: "accept",
        expectedVersion: idea.version,
        operationId: "native-accept",
      }),
    ).rejects.toThrow(/only reduce/);
  }
  const sameSite = f.t.withIdentity({
    ...nativeWebsiteIdentity(subject, issuer),
    azp: "https://movingmanifest.com",
  });
  expect((await sameSite.query(api.queue.suggestionView, base)).count).toBe(1);
  expect(
    (
      await f.person.mutation(api.queue.reviewSuggestion, {
        ...base,
        queueItemId: idea.queueItemId,
        action: "accept",
        expectedVersion: idea.version,
        operationId: "native-accept",
      })
    ).suggestionStatus,
  ).toBe("accepted");
});

it("requeues a person's answered flagged capture when claimed has no lease", async () => {
  const f = await fixture();
  const entryId = await f.t.run((ctx) =>
    ctx.db.insert("ingestionQueueEntries", {
      householdId: f.householdId,
      moveId: f.moveId,
      ownerUserId: f.userId,
      createdByUserId: f.userId,
      status: "claimed",
      needsInput: true,
      agentQuestion: "Which room?",
      mediaPhotoIds: [],
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await f.person.mutation(api.ingestionQueue.updateEntry, {
    householdId: f.householdId,
    moveId: f.moveId,
    entryId,
    instructions: "Bedroom",
  });
  expect(await f.t.run((ctx) => ctx.db.get(entryId))).toMatchObject({
    status: "queued",
    needsInput: false,
  });
  const claimed = await f.t.mutation(internal.mcpToolsQueue.claimQueue, {
    caller: { subject, claims: { azp: clientId } },
    householdId: f.householdId,
    moveId: f.moveId,
    batchSize: 1,
    agentLabel: "Named AI",
  });
  expect(JSON.stringify(claimed)).toContain(entryId);
});

it("website submitResult refuses a question on resolved and discarded captures", async () => {
  const f = await fixture();
  for (const status of ["resolved", "discarded"] as const) {
    const entryId = await f.t.run((ctx) =>
      ctx.db.insert("ingestionQueueEntries", {
        householdId: f.householdId,
        moveId: f.moveId,
        ownerUserId: f.userId,
        createdByUserId: f.userId,
        status,
        mediaPhotoIds: [],
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const before = await f.t.run((ctx) => ctx.db.get(entryId));
    await expect(
      f.person.mutation(api.ingestionQueue.submitResult, {
        householdId: f.householdId,
        moveId: f.moveId,
        entryId,
        needsInputQuestion: "Which room?",
      }),
    ).rejects.toThrow(/Resolved or discarded/);
    expect(await f.t.run((ctx) => ctx.db.get(entryId))).toEqual(before);
  }
});

it("queue.counts excludes the partner's modern and legacy captures", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...fields } = (await ctx.db.get(f.userId))!;
    void _id;
    void _creationTime;
    const partner = await ctx.db.insert("users", {
      ...fields,
      clerkUserId: "SYNTHETIC-partner-captures",
    });
    const common = {
      householdId: f.householdId,
      moveId: f.moveId,
      status: "queued" as const,
      mediaPhotoIds: [],
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    await ctx.db.insert("ingestionQueueEntries", {
      ...common,
      ownerUserId: f.userId,
      createdByUserId: f.userId,
    });
    // The partner owns this one even though the querying person created it.
    await ctx.db.insert("ingestionQueueEntries", {
      ...common,
      ownerUserId: partner,
      createdByUserId: f.userId,
      needsInput: true,
      agentQuestion: "Private partner question",
    });
    await ctx.db.insert("ingestionQueueEntries", {
      ...common,
      createdByUserId: partner,
      needsInput: true,
      agentQuestion: "Private legacy partner question",
    });
  });
  expect(
    await f.person.query(api.queue.counts, {
      householdId: f.householdId,
      moveId: f.moveId,
    }),
  ).toMatchObject({
    waitingForAi: 1,
    working: 0,
    done: 0,
    everything: 1,
    needsYou: 0,
    needsInputOpen: 0,
    suggestions: 0,
  });
});
