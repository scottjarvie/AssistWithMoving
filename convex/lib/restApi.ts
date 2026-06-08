import type { ApiKeyScope } from "./apiKeys";

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RestRequestInput = {
  method: RestMethod;
  path: string;
  query: Record<string, string>;
  authorization?: string;
  idempotencyKey?: string;
  body?: unknown;
};

export type RestResponse = {
  status: number;
  body: unknown;
};

export function bearerToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function parseRestPath(path: string) {
  return path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

export function restError({
  status,
  code,
  message,
}: {
  status: number;
  code: string;
  message: string;
}): RestResponse {
  return {
    status,
    body: {
      error: {
        code,
        message,
      },
    },
  };
}

export function restOk(body: unknown, status = 200): RestResponse {
  return { status, body };
}

export function paginationFromQuery(query: Record<string, string>) {
  const limit = clampNumber(Number(query.limit || "50"), 1, 100);
  const cursor = query.cursor ? Number(query.cursor) : 0;
  return {
    limit,
    cursor: Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0,
  };
}

export function paginate<T>(rows: T[], query: Record<string, string>) {
  const { limit, cursor } = paginationFromQuery(query);
  const page = rows.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < rows.length ? String(cursor + limit) : null;
  return {
    data: page,
    page: {
      limit,
      nextCursor,
      total: rows.length,
    },
  };
}

export function requiredScopesForRestRoute({
  method,
  segments,
}: {
  method: RestMethod;
  segments: string[];
}): ApiKeyScope[] {
  if (segments[0] === "me" && method === "GET") {
    return ["moves/read"];
  }
  if (segments[0] === "uploads" && method === "POST") {
    return ["photos/write"];
  }
  if (segments[0] === "photos" && method !== "GET") {
    return ["photos/write"];
  }
  if (segments[0] === "items") {
    return method === "GET" ? ["inventory/read"] : ["inventory/write"];
  }
  if (segments[0] === "boxes") {
    return method === "GET" ? ["inventory/read"] : ["inventory/write"];
  }
  if (segments[0] === "exports" && method === "GET") {
    return ["exports/read"];
  }
  if (segments[0] !== "moves") return [];
  if (segments.length === 1 && method === "POST") {
    return ["moves/write"];
  }
  if (
    method === "POST" &&
    segments[2] === "assignments" &&
    segments[3] === "suggest"
  ) {
    return ["moves/read", "inventory/read"];
  }
  if (method === "GET") {
    if (segments[2] === "summary") {
      return ["moves/read", "inventory/read", "exports/read"];
    }
    if (segments[2] === "capacity-report") {
      return ["moves/read", "inventory/read"];
    }
    if (segments.includes("exports")) {
      return ["exports/read"];
    }
    if (segments.includes("share-links")) {
      return ["exports/read"];
    }
    if (segments.includes("documentation-profiles")) {
      return ["exports/read"];
    }
    if (segments.includes("items") || segments.includes("boxes")) {
      return ["inventory/read"];
    }
    if (segments.includes("assignments")) {
      return ["inventory/read"];
    }
    if (segments.includes("photos")) {
      return ["inventory/read"];
    }
    return ["moves/read"];
  }
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    if (segments.includes("exports")) {
      return ["exports/create"];
    }
    if (segments.includes("share-links")) {
      return ["exports/create"];
    }
    if (segments.includes("documentation-profiles")) {
      return ["exports/create"];
    }
    if (segments.includes("items") || segments.includes("boxes")) {
      return ["inventory/write"];
    }
    if (segments.includes("assignments")) {
      return ["inventory/write"];
    }
    return ["moves/write"];
  }
  return [];
}

export function requestHashInput({
  method,
  path,
  body,
}: Pick<RestRequestInput, "method" | "path" | "body">) {
  return JSON.stringify({
    method,
    path,
    body: stableJson(body ?? null),
  });
}

function stableJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJson(entry)])
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}
