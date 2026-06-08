import { describe, expect, it } from "vitest";

import {
  bearerToken,
  paginate,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
  restError,
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
        segments: ["moves", "move1", "items"],
      })
    ).toEqual(["inventory/read"]);
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
        segments: ["moves", "move1", "capacity-report"],
      })
    ).toEqual(["moves/read", "inventory/read"]);
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
        method: "GET",
        segments: ["exports", "export1"],
      })
    ).toEqual(["exports/read"]);
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
});
