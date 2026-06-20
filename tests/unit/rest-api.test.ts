import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { routeMovableUnits } from "../../convex/restApi";

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
        segments: ["households", "household1", "members"],
      })
    ).toEqual(["members/manage"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["households", "household1", "members"],
      })
    ).toEqual(["members/manage"]);
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
        method: "POST",
        segments: ["moves", "move1", "movable-units", "batch-upsert"],
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
        method: "GET",
        segments: ["moves", "move1", "agent-context"],
      })
    ).toEqual(["moves/read", "inventory/read", "plans/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "spaces"],
      })
    ).toEqual(["moves/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "spaces"],
      })
    ).toEqual(["moves/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "GET",
        segments: ["moves", "move1", "sale-listings"],
      })
    ).toEqual(["inventory/read"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["moves", "move1", "sale-listings"],
      })
    ).toEqual(["inventory/write"]);
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
        segments: ["photos", "upload"],
      })
    ).toEqual(["photos/write"]);
    expect(
      requiredScopesForRestRoute({
        method: "POST",
        segments: ["images", "upload"],
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

  it("locks documentation profile route-family scopes before extraction", () => {
    const cases = [
      {
        method: "GET",
        path: "/moves/move1/documentation-profiles",
        scopes: ["exports/read"],
      },
      {
        method: "GET",
        path: "/moves/move1/documentation-profiles/profile1",
        scopes: ["exports/read"],
      },
      {
        method: "POST",
        path: "/moves/move1/documentation-profiles",
        scopes: ["exports/create"],
      },
      {
        method: "PATCH",
        path: "/moves/move1/documentation-profiles/profile1",
        scopes: ["exports/create"],
      },
      {
        method: "DELETE",
        path: "/moves/move1/documentation-profiles/profile1",
        scopes: ["exports/create"],
      },
      {
        method: "POST",
        path: "/moves/move1/documentation-profiles/profile1/archive",
        scopes: ["exports/create"],
      },
    ] as const;

    for (const route of cases) {
      expect(
        requiredScopesForRestRoute({
          method: route.method,
          segments: parseRestPath(route.path),
        })
      ).toEqual(route.scopes);
    }
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
  it("dry-runs movable-unit batch-upsert with counted boxes and stable loose items", async () => {
    const response = await routeMovableUnits(
      {} as never,
      movableUnitsRequest({
        dryRun: true,
        units: [
          {
            kind: "box",
            label: "Medium boxes",
            count: 2,
            dimensionsIn: { lengthIn: 18, widthIn: 18, heightIn: 16 },
            estimatedWeightLb: 30,
          },
          {
            kind: "looseItem",
            name: "Treadmill",
            externalSource: "agent-rough-list",
            externalId: "treadmill-main",
            dimensionsIn: { lengthIn: 70, widthIn: 32, heightIn: 58 },
          },
        ],
      }),
      restTestAuth,
      restTestMoveId,
      "batch-upsert"
    );

    expect(response.status).toBe(200);
    const data = responseData(response);
    expect(data.summary).toEqual({ totalUnits: 3, boxes: 2, looseItems: 1 });
    expect(data.requests).toHaveLength(3);
    expect(data.requests[0]).toMatchObject({
      method: "POST",
      path: "/moves/" + restTestMoveId + "/boxes",
      unitIndex: 0,
      unitCountIndex: 0,
      unitCount: 2,
      body: {
        label: "Medium box 1",
        estimatedWeightLb: 30,
        estimatedVolumeCuFt: 3,
      },
    });
    expect(data.requests[1]).toMatchObject({
      body: {
        label: "Medium box 2",
        estimatedVolumeCuFt: 3,
      },
    });
    expect(data.requests[2]).toMatchObject({
      method: "POST",
      path: "/moves/" + restTestMoveId + "/items/batch-upsert",
      unitIndexes: [1],
      body: {
        dryRun: true,
        items: [
          expect.objectContaining({
            name: "Treadmill",
            externalSource: "agent-rough-list",
            externalId: "treadmill-main",
            status: "active",
            quantity: 1,
            needsReview: true,
            disposition: "mover",
            estimatedVolumeCuFt: 75.2,
            dimensionsConfidence: "low",
            volumeConfidence: "low",
            reviewFlags: ["movableUnitReview"],
            aiTags: ["movable-unit", "loose-item"],
          }),
        ],
      },
    });
    expect(data.warnings?.[0]).toContain("idempotencyKey");
  });

  it("requires stable loose-item keys and refuses counted existing boxes", async () => {
    const missingKey = await routeMovableUnits(
      {} as never,
      movableUnitsRequest({
        dryRun: true,
        units: [{ kind: "looseItem", name: "Unkeyed item" }],
      }),
      restTestAuth,
      restTestMoveId,
      "batch-upsert"
    );
    expect(missingKey.status).toBe(400);
    expect(responseError(missingKey)).toMatchObject({ code: "stable_key_required" });

    const countedExisting = await routeMovableUnits(
      {} as never,
      movableUnitsRequest({
        dryRun: true,
        units: [{ kind: "box", code: "B-001", count: 2 }],
      }),
      restTestAuth,
      restTestMoveId,
      "batch-upsert"
    );
    expect(countedExisting.status).toBe(400);
    expect(responseError(countedExisting)).toMatchObject({ code: "validation_error" });
    expect(responseError(countedExisting).message).toContain("count 2");
  });

  it("live-upserts rough movable units and preserves unit index mapping", async () => {
    const { ctx, patches, inserts } = restRouteTestCtx({
      box_rough_1: restTestBox({
        _id: "box_rough_1" as Id<"boxes">,
        code: "B-001",
      }),
      item_rough_1: restTestItem({
        _id: "item_rough_1" as Id<"items">,
        name: "Old treadmill label",
        normalizedName: "old treadmill label",
      }),
    });

    const response = await routeMovableUnits(
      ctx,
      movableUnitsRequest({
        idempotencyKey: "rough-batch-1",
        units: [
          {
            kind: "box",
            boxId: "box_rough_1",
            label: "Garage rough box",
            dimensionsIn: { lengthIn: 24, widthIn: 18, heightIn: 18 },
            estimatedWeightLb: 42,
          },
          {
            kind: "looseItem",
            itemId: "item_rough_1",
            name: "Treadmill",
            dimensionsIn: { lengthIn: 70, widthIn: 32, heightIn: 58 },
            estimatedWeightLb: 190,
          },
        ],
      }),
      restTestAuth,
      restTestMoveId,
      "batch-upsert"
    );

    expect(response.status).toBe(200);
    const data = responseData(response);
    expect(data.summary).toEqual({ totalUnits: 2, boxes: 1, looseItems: 1 });
    expect(data.boxes).toMatchObject([
      {
        unitIndex: 0,
        ok: true,
        action: "update",
        boxId: "box_rough_1",
        code: "B-001",
        matchedBy: "boxId",
      },
    ]);
    expect(data.looseItems).toMatchObject([
      {
        unitIndex: 1,
        itemIndex: 0,
        ok: true,
        action: "update",
        itemId: "item_rough_1",
      },
    ]);
    expect(patches.find((patch) => patch.id === "box_rough_1")?.patch).toMatchObject({
      label: "Garage rough box",
      dimensionsIn: { lengthIn: 24, widthIn: 18, heightIn: 18 },
      estimatedWeightLb: 42,
      estimatedVolumeCuFt: 4.5,
    });
    expect(patches.find((patch) => patch.id === "item_rough_1")?.patch).toMatchObject({
      name: "Treadmill",
      normalizedName: "treadmill",
      dimensionsIn: { lengthIn: 70, widthIn: 32, heightIn: 58 },
      estimatedWeightLb: 190,
      estimatedVolumeCuFt: 75.2,
    });
    expect(inserts.filter((insert) => insert.table === "auditLogs")).toHaveLength(2);
  });

});


type RestTestRecord = Record<string, unknown> & { _id: string };
type MovableUnitsResponseData = Record<string, unknown> & {
  summary: Record<string, unknown>;
  requests: Array<Record<string, unknown>>;
  warnings?: string[];
  boxes: Array<Record<string, unknown>>;
  looseItems: Array<Record<string, unknown>>;
};

const restTestMoveId = "move_rest_test" as Id<"moves">;
const restTestHouseholdId = "household_rest_test" as Id<"households">;
const restTestUserId = "user_rest_test" as Id<"users">;

const restTestAuth = {
  householdId: restTestHouseholdId,
  createdByUserId: restTestUserId,
  apiKeyId: "api_key_rest_test",
  apiKeyName: "REST test key",
  apiKeyTokenPreview: "mmk_test",
  actor: { apiKeyId: "api_key_rest_test" },
} as never;

function movableUnitsRequest(body: unknown) {
  return {
    method: "POST" as const,
    path: "/moves/" + restTestMoveId + "/movable-units/batch-upsert",
    query: {},
    body,
  };
}

function responseData(response: { body: unknown }) {
  return bodyRecord(response.body).data as MovableUnitsResponseData;
}

function responseError(response: { body: unknown }) {
  return bodyRecord(bodyRecord(response.body).error) as Record<string, string>;
}

function restRouteTestCtx(records: Record<string, RestTestRecord>) {
  const store = new Map(Object.entries(records));
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; id: string; value: Record<string, unknown> }> = [];
  const ctx = {
    db: {
      get: async (id: string) => store.get(String(id)) ?? null,
      patch: async (id: string, patch: Record<string, unknown>) => {
        patches.push({ id: String(id), patch });
        const current = store.get(String(id)) ?? ({ _id: String(id) } as RestTestRecord);
        store.set(String(id), { ...current, ...patch });
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = table + "_" + (inserts.length + 1);
        inserts.push({ table, id, value });
        store.set(id, { _id: id, _creationTime: Date.now(), ...value });
        return id;
      },
      query: () => ({
        withIndex: () => ({
          order: () => ({ collect: async () => [] }),
          collect: async () => [],
          first: async () => null,
        }),
        order: () => ({ collect: async () => [] }),
        collect: async () => [],
      }),
    },
  };
  return { ctx: ctx as never, patches, inserts };
}

function restTestBox(overrides: Partial<RestTestRecord> = {}) {
  const now = Date.now();
  return {
    _id: "box_rest_test",
    _creationTime: now,
    householdId: restTestHouseholdId,
    moveId: restTestMoveId,
    code: "B-REST",
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: now,
    createdByUserId: restTestUserId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as RestTestRecord;
}

function restTestItem(overrides: Partial<RestTestRecord> = {}) {
  const now = Date.now();
  return {
    _id: "item_rest_test",
    _creationTime: now,
    householdId: restTestHouseholdId,
    moveId: restTestMoveId,
    name: "Rest test item",
    normalizedName: "rest test item",
    disposition: "mover",
    status: "active",
    quantity: 1,
    condition: "unknown",
    dimensionsConfidence: "none",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: "low",
    stackable: true,
    hazardousFlag: false,
    highValue: false,
    requiresPersonalTransport: false,
    planningDefaultKeys: [],
    needsReview: false,
    reviewFlags: [],
    aiTags: [],
    createdVia: "api",
    createdByUserId: restTestUserId,
    updatedByUserId: restTestUserId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as RestTestRecord;
}
