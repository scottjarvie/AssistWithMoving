import { describe, expect, it } from "vitest";

import {
  bearerToken,
  bodyRecord,
  moveIdFromRestBodyOrQuery,
  moveIdFromRestRequest,
  paginate,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
  restError,
  restOk,
  restRateLimitHeaders,
  restRateLimitResult,
  restRateLimitWindowStart,
  restRateLimited,
  withRestRateLimitHeaders,
} from "../../convex/lib/restApi";

describe("REST API helpers", () => {
  it("parses bearer tokens", () => {
    expect(bearerToken("Bearer mmk_prefix_secret")).toBe("mmk_prefix_secret");
    expect(bearerToken("bearer key")).toBe("key");
    expect(bearerToken("Basic key")).toBe(null);
    expect(bearerToken(undefined)).toBe(null);
  });

  it("parses route segments and scopes", () => {
    expect(parseRestPath("/moves/move1/items/")).toEqual([
      "moves",
      "move1",
      "items",
    ]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["me"],
      })
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "items"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "setup"],
      })
    ).toEqual(["moves/read", "moves/write", "inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "items"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "items", "batch-upsert"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "planned-items"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planned-items"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "planned-items", "planned1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planned-items", "planned1", "convert"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "planned-items", "planned1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["items", "item1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["items", "item1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["boxes", "box1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["boxes", "box1", "items"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["boxes", "box1", "items", "item1"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["photos", "photo1", "attach"],
      })
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans"],
      })
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "summary"],
      })
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "snapshot.svg"],
      })
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["plans", "plan1", "proposals"],
      })
    ).toEqual(["plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["plans", "plan1", "ops"],
      })
    ).toEqual(["plans/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["plans", "plan1", "proposals"],
      })
    ).toEqual(["plans/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves"],
      })
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "summary"],
      })
    ).toEqual(["moves/read", "inventory/read", "exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "questions"],
      })
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "move-day"],
      })
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "capacity-report"],
      })
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "resources"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "resources", "resource1"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "people"],
      })
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "people"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "people", "person1"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "people", "person1"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "zones"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "resources", "resource1", "zones"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "assignments", "suggest"],
      })
    ).toEqual(["moves/read", "inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "assignments", "apply"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "planning-suggestions"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-jobs"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-text-suggestions"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "ai-photo-suggestions"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "generate"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "approve"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-text-suggestions", "reject"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "generate"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "approve"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "ai-photo-suggestions", "reject"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "generate"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "approve"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "planning-suggestions", "reject"],
      })
    ).toEqual(["inventory/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["uploads", "init"],
      })
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["photos", "finalize"],
      })
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "exports"],
      })
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "exports"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "documentation-profiles"],
      })
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "documentation-profiles"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "PATCH",
        segments: ["moves", "move1", "documentation-profiles", "profile1"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "documentation-profiles", "profile1"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links"],
      })
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links", "comments"],
      })
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "share-links", "share1", "comments"],
      })
    ).toEqual(["exports/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "share-links"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "DELETE",
        segments: ["moves", "move1", "share-links", "share1"],
      })
    ).toEqual(["exports/create"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["exports", "export1"],
      })
    ).toEqual(["exports/read"]);
  });

  it("derives move context for move-restricted top-level routes", () => {
    expect(
      moveIdFromRestRequest({
        segments: ["moves", "move1", "items"],
        body: { moveId: "ignored" },
        query: { moveId: "also-ignored" },
      })
    ).toBe("move1");

    expect(
      moveIdFromRestRequest({
        segments: ["moves"],
        body: { moveId: "ignored" },
        query: { moveId: "also-ignored" },
      })
    ).toBeUndefined();

    expect(
      moveIdFromRestRequest({
        segments: ["moves", "setup"],
        body: { moveId: "move-from-setup" },
        query: {},
      })
    ).toBe("move-from-setup");

    expect(
      moveIdFromRestRequest({
        segments: ["moves", "setup"],
        body: { title: "New move setup" },
        query: {},
      })
    ).toBeUndefined();

    expect(
      moveIdFromRestRequest({
        segments: ["items", "item1"],
        body: { moveId: "move-from-body" },
        query: {},
      })
    ).toBe("move-from-body");

    expect(
      moveIdFromRestRequest({
        segments: ["boxes", "box1", "items", "item1"],
        body: {},
        query: { moveId: "move-from-query" },
      })
    ).toBe("move-from-query");

    expect(
      moveIdFromRestRequest({
        segments: ["photos", "photo1", "attach"],
        body: { moveId: "photo-move" },
        query: {},
      })
    ).toBe("photo-move");

    expect(
      moveIdFromRestRequest({
        segments: ["plans", "plan1"],
        body: {},
        query: { moveId: "plan-move" },
      })
    ).toBe("plan-move");
  });

  it("keeps body/query move context parsing safe for non-object bodies", () => {
    expect(
      moveIdFromRestBodyOrQuery({
        body: ["move1"],
        query: { moveId: "move-from-query" },
      })
    ).toBe("move-from-query");
    expect(bodyRecord(null)).toEqual({});
    expect(bodyRecord(["not", "a", "record"])).toEqual({});
    expect(bodyRecord({ moveId: "move1" })).toEqual({ moveId: "move1" });
  });

  it("paginates with cursor and limit", () => {
    expect(paginate([1, 2, 3, 4], { limit: "2" })).toEqual({
      data: [1, 2],
      page: { limit: 2, nextCursor: "2", total: 4 },
    });
    expect(paginate([1, 2, 3, 4], { limit: "2", cursor: "2" })).toEqual({
      data: [3, 4],
      page: { limit: 2, nextCursor: null, total: 4 },
    });
  });

  it("uses stable request hash input for idempotency", () => {
    expect(
      requestHashInput({
        method: "POST",
        path: "moves/move1/items",
        body: { b: 2, a: 1 },
      })
    ).toBe(
      requestHashInput({
        method: "POST",
        path: "moves/move1/items",
        body: { a: 1, b: 2 },
      })
    );
  });

  it("returns consistent error shapes", () => {
    expect(
      restError({ status: 403, code: "forbidden", message: "No scope." })
    ).toEqual({
      status: 403,
      body: {
        error: {
          code: "forbidden",
          message: "No scope.",
        },
      },
    });
  });

  it("builds API rate-limit windows and headers", () => {
    const windowStart = restRateLimitWindowStart(301_000, 300_000);

    expect(windowStart).toBe(300_000);

    const allowed = restRateLimitResult({
      count: 2,
      now: 301_000,
      limit: 3,
      windowStart,
      windowMs: 300_000,
    });

    expect(allowed).toEqual({
      allowed: true,
      limit: 3,
      remaining: 1,
      resetAt: 600_000,
      retryAfterSeconds: 299,
    });
    expect(restRateLimitHeaders(allowed)).toEqual({
      "X-RateLimit-Limit": "3",
      "X-RateLimit-Remaining": "1",
      "X-RateLimit-Reset": "600",
    });
    expect(withRestRateLimitHeaders(restOk({ ok: true }), allowed)).toEqual({
      status: 200,
      body: { ok: true },
      headers: {
        "X-RateLimit-Limit": "3",
        "X-RateLimit-Remaining": "1",
        "X-RateLimit-Reset": "600",
      },
    });

    const limited = restRateLimitResult({
      count: 4,
      now: 301_000,
      limit: 3,
      windowStart,
      windowMs: 300_000,
    });

    expect(limited.allowed).toBe(false);
    expect(restRateLimited(limited)).toEqual({
      status: 429,
      body: {
        error: {
          code: "rate_limited",
          message: "API rate limit exceeded. Retry after 299 seconds.",
        },
      },
      headers: {
        "X-RateLimit-Limit": "3",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "600",
        "Retry-After": "299",
      },
    });
  });
});
