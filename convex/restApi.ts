import {
  ConvexError,
  v,
} from "convex/values";
import { withSharedPublishing } from "./lib/sharedPublishing";
import {
  readAccess,
  readConnection,
  connectionAccess,
  accessState,
  keyScopes,
} from "./lib/carriedAccess";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import {
  agentAccessDisabled,
  resolveMoveAccess,
} from "./lib/moveAccess";
import { authenticateApiKey } from "./lib/apiKeyAuth";
import { SETTINGS_REFUSAL } from "./lib/connectionReduction";
import { hashApiKey } from "./lib/apiKeys";
import { normalizeOptionalText } from "./lib/moveFields";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  bearerToken,
  bodyRecord as bodyObject,
  moveIdFromRestRequest,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
  isShareLinkUnpublish,
  restError,
  restOk,
  restApiRateLimit,
  restRateLimitResult,
  restRateLimitWindowStart,
  restRateLimited,
  withRestRateLimitHeaders,
  type RestRequestInput,
  type RestRateLimitResult,
  type RestResponse,
  errorStatus,
} from "./lib/rest/core";
import { routeDocumentationProfiles } from "./rest/documentationProfiles";
import { internalFunctions } from "./lib/rest/functionReferences";
import { routeQueue } from "./rest/queue";
import { routePlans } from "./rest/plans";
import {
  routeHouseholds,
  routeMe,
} from "./rest/households";
import {
  routeListMoves,
  routeUpdateMove,
  routeMoveSummary,
  routeMoveQuestions,
  routeMoveDayChecklist,
  routeCreateMove,
  routeSetupMove,
  routeAgentContext,
  findApiMoveByTitle,
  setupSpaceInputs,
} from "./rest/moves";
import {
  routeMoveSpaces,
  routeSaleListings,
} from "./rest/spaces";
import {
  routeCapacityReport,
  routeTransportResources,
  routeTransportZones,
} from "./rest/transport";
import { routeMovePeople } from "./rest/people";
import {
  routeItems,
  routePlannedItems,
  routeMovableUnits,
} from "./rest/items";
import {
  routeBoxes,
  routeAssignments,
} from "./rest/boxes";
import {
  routePlanningSuggestions,
  routeAiJobs,
  routeAiTextSuggestions,
  routeAiPhotoSuggestions,
} from "./rest/aiSuggestions";
import {
  routeExports,
  routeShareLinks,
} from "./rest/exports";
import {
  routeListPhotos,
  routeTopLevelItem,
  routeTopLevelBox,
  routeTopLevelPhoto,
  routeTopLevelExport,
} from "./rest/objects";
import { requireApiMove } from "./lib/rest/require";
import { safeMove } from "./lib/rest/safe";
import {
  asString,
  optionalString,
} from "./lib/rest/parse";

export { routeMovableUnits } from "./rest/items";
export { setupMovePatch, movePatch, saleListingPatchFromBody } from "./lib/rest/patch";
export { createMoveWeightAllowanceLb } from "./lib/rest/parse";
export { errorStatus } from "./lib/rest/core";

export const handle = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    body: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<RestResponse> => {
    const segments = parseRestPath(args.path);
    const requiredScopes = requiredScopesForRestRoute({
      method: args.method,
      segments,
    });
    const selfContext = segments.join("/") === "me" && args.method === "GET";
    const selfReduction = segments.join("/") === "me/access" && args.method === "POST";
    const unpublish = isShareLinkUnpublish({ method: args.method, segments });
    if (!requiredScopes.length && !selfReduction && !selfContext && !unpublish) {
      return restError({
        status: 404,
        code: "not_found",
        message: "API route not found.",
      });
    }

    const rawKey = bearerToken(args.authorization);
    if (!rawKey) {
      return restError({
        status: 401,
        code: "unauthorized",
        message: "Use a Bearer API key.",
      });
    }

    try {
      const moveId = moveIdFromRestRequest({
        segments,
        body: args.body,
        query: args.query,
      }) as Id<"moves"> | undefined;
      const action = `${args.method} /api/v1/${segments.join("/")}`;
      const auth = await authenticateApiKey(ctx, {
        rawKey,
        requiredScopes: selfReduction || selfContext ? [] : requiredScopes,
        recordUse: !selfReduction,
        inspectConnection: selfContext || selfReduction,
        moveId,
        action,
        allowRestrictedKeyWithoutMoveId:
          segments[0] === "me" || segments[0] === "plans",
      });

      const rateLimit = await checkApiRateLimit(ctx, {
        householdId: auth.householdId,
        moveId: auth.moveId,
        apiKeyId: auth.apiKeyId,
        action,
      });
      if (!rateLimit.allowed) {
        return restRateLimited(rateLimit);
      }

      if (selfReduction) {
        const body = args.body;
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(name => !["opId", "expectedVersion", "scopes", "moveIds", "expiresAt", "action"].includes(name)) || typeof body.expectedVersion !== "number" || (body.scopes !== undefined && (!Array.isArray(body.scopes) || body.scopes.some((s: unknown) => typeof s !== "string"))) || (body.moveIds !== undefined && (!Array.isArray(body.moveIds) || body.moveIds.some((s: unknown) => typeof s !== "string"))) || (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "number") || (body.action !== undefined && typeof body.action !== "string")) throw new Error(SETTINGS_REFUSAL);
        return withRestRateLimitHeaders(restOk({ data: await ctx.runMutation(internalFunctions.apiKeys.reduceCallingKey, { ...body, apiKeyId: auth.apiKeyId }) }), rateLimit);
      }
      const response = await ctx.runMutation(makeFunctionReference<"mutation", { request: RestRequestInput; auth: Awaited<ReturnType<typeof authenticateApiKey>> }, RestResponse>("restApi:commitRequest"), { request: args, auth });
      return withRestRateLimitHeaders(response, rateLimit);
    } catch (error) {
      return restError({
        status: errorStatus(error),
        code: "request_failed",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    }
  },
});

/** Isolated child transaction: the outer HTTP error response cannot commit a refused publication. */
export const commitRequest = internalMutation({
  args: { request: v.any(), auth: v.any() },
  handler: async (ctx, { request, auth }): Promise<RestResponse> => {
    const args = request as RestRequestInput;
    const segments = parseRestPath(args.path);
    const isSetup = args.method === "POST" && segments.join("/") === "moves/setup";
    const body = bodyObject(args.body);
    const writesSpace = segments[2] === "spaces" && (
      (args.method === "POST" && !segments[3]) ||
      ((args.method === "PATCH" || args.method === "PUT") && segments[3])
    );
    if (isSetup || (segments[0] === "moves" && writesSpace)) {
      const editsRooms = !isSetup || (!body.dryRun && setupSpaceInputs(body).length > 0);
      const refusal = await recheckRoomRequest(ctx, args, auth, segments, isSetup, editsRooms);
      if (refusal) return refusal;
    }
    return withSharedPublishing(ctx, { ownerUserId: auth.createdByUserId, verifiedClientId: `key:${auth.apiKeyId}` }, body, checked => withIdempotency(checked, args, auth, () => routeRequest(checked, args, segments, auth)));
  },
});

// Setup and room writes cross an internal transaction boundary after bearer verification.
async function recheckRoomRequest(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  segments: string[],
  setup: boolean,
  editsRooms: boolean,
) {
  const [key, root, connection] = await Promise.all([
    ctx.db.get(auth.apiKeyId),
    readAccess(ctx, auth.createdByUserId),
    readConnection(ctx, auth.createdByUserId, `key:${auth.apiKeyId}`),
  ]);
  const access = root && connection && connectionAccess(root, connection);
  const powers = requiredScopesForRestRoute({ method: args.method, segments });
  const currentScopes = access ? keyScopes(access) : [];
  if (!key || key.createdByUserId !== auth.createdByUserId || key.householdId !== auth.householdId ||
      key.credentialRetiredAt !== undefined || !connection || connection._id !== auth.connectionId ||
      connection.apiKeyId !== key._id || !access || accessState(access, connection) !== "active" ||
      powers.some(power => !currentScopes.includes(power))) {
    throw new Error("This API credential is not authorized to write rooms with its current access.");
  }
  if (setup && (access.moveIds !== undefined || auth.moveRestricted)) {
    return restError({
      status: 403,
      code: "move_restricted_key",
      message: "Move-restricted API keys cannot create or select moves.",
    });
  }
  if (!editsRooms) return;

  const body = bodyObject(args.body);
  const requestedMove = setup ? optionalString(body.moveId) : segments[1];
  const title = normalizeOptionalText(asString(body.title));
  const moveId = requestedMove ? ctx.db.normalizeId("moves", requestedMove)
    : setup && title && body.updateExisting !== false
      ? (await findApiMoveByTitle(ctx, auth.householdId, title))?._id
      : undefined;
  if (access.moveIds && (!moveId || !access.moveIds.includes(moveId))) {
    throw new Error("This API credential is not authorized to write rooms with its current access.");
  }
  const user = await ctx.db.get(key.createdByUserId);
  if (user?.status !== "active") throw new Error("This API credential is not authorized because its owner is inactive.");
  // Let the route keep its native malformed/not-found response.
  if (requestedMove && !moveId) return;
  if (moveId) {
    const moveAccess = await resolveMoveAccess(ctx, user._id, key.householdId, moveId);
    if (!agentAccessDisabled(moveAccess) && canPerformHouseholdAction(moveAccess.role, "inventory:edit")) return;
  } else {
    const membership = await ctx.db.query("householdMemberships").withIndex("by_household_user", q =>
      q.eq("householdId", key.householdId).eq("userId", user._id)).unique();
    if (membership?.status === "active" && membership.apiAccessStatus !== "disabled" &&
        canPerformHouseholdAction(membership.role, "inventory:edit")) return;
  }
  throw new Error("This API credential is not authorized to edit rooms in this move.");
}

export const checkRateLimit = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    apiKeyId: v.id("apiKeys"),
    action: v.string(),
  },
  handler: async (ctx, args): Promise<RestRateLimitResult> => {
    return await checkApiRateLimit(ctx, args);
  },
});

export const authenticateActionRequest = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    body: v.optional(v.any()),
    moveId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const segments = parseRestPath(args.path);
    const requiredScopes = requiredScopesForRestRoute({
      method: args.method,
      segments,
    });
    if (!requiredScopes.length) {
      return {
        ok: false,
        response: restError({
          status: 404,
          code: "not_found",
          message: "API route not found.",
        }),
      };
    }

    const rawKey = bearerToken(args.authorization);
    if (!rawKey) {
      return {
        ok: false,
        response: restError({
          status: 401,
          code: "unauthorized",
          message: "Use a Bearer API key.",
        }),
      };
    }

    try {
      const auth = await authenticateApiKey(ctx, {
        rawKey,
        requiredScopes,
        moveId: args.moveId
          ? (args.moveId as Id<"moves">)
          : (moveIdFromRestRequest({
              segments,
              body: args.body,
              query: args.query,
            }) as Id<"moves"> | undefined),
        action: `${args.method} /api/v1/${segments.join("/")}`,
      });
      return { ok: true, auth, segments };
    } catch (error) {
      return {
        ok: false,
        response: restError({
          status: errorStatus(error),
          code: "request_failed",
          message: error instanceof Error ? error.message : "Request failed.",
        }),
      };
    }
  },
});

export const checkIdempotency = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    body: v.optional(v.any()),
    apiKeyId: v.id("apiKeys"),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.method === "GET" || !args.idempotencyKey) {
      return { replay: null, requestHash: null };
    }
    const requestHash = await hashApiKey(requestHashInput(args));
    const existing = await ctx.db
      .query("apiIdempotencyKeys")
      .withIndex("by_api_key_key", (q) =>
        q.eq("apiKeyId", args.apiKeyId).eq("idempotencyKey", args.idempotencyKey!)
      )
      .unique();
    if (!existing) {
      return { replay: null, requestHash };
    }
    if (existing.expiresAt < Date.now()) {
      await ctx.db.delete(existing._id);
      return { replay: null, requestHash };
    }
    if (existing.requestHash !== requestHash) {
      return {
        replay: restError({
          status: 409,
          code: "idempotency_conflict",
          message: "Idempotency key was already used with a different request.",
        }),
        requestHash: null,
      };
    }
    return {
      replay: {
        status: existing.status,
        body: existing.response,
      } satisfies RestResponse,
      requestHash: null,
    };
  },
});

async function checkApiRateLimit(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId?: Id<"moves">;
    apiKeyId: Id<"apiKeys">;
    action: string;
  }
) {
  const now = Date.now();
  await deleteExpiredRateLimitWindows(ctx, now);
  const windowStart = restRateLimitWindowStart(now);
  const windowEnd = windowStart + restApiRateLimit.windowMs;
  const existing = await ctx.db
    .query("apiRateLimitWindows")
    .withIndex("by_api_key_window", (q) =>
      q.eq("apiKeyId", args.apiKeyId).eq("windowStart", windowStart)
    )
    .unique();
  const count = (existing?.count ?? 0) + 1;

  if (existing) {
    await ctx.db.patch(existing._id, {
      count,
      lastAction: args.action,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("apiRateLimitWindows", {
      householdId: args.householdId,
      moveId: args.moveId,
      apiKeyId: args.apiKeyId,
      windowStart,
      windowEnd,
      count,
      limit: restApiRateLimit.limit,
      lastAction: args.action,
      createdAt: now,
      updatedAt: now,
    });
  }

  return restRateLimitResult({
    count,
    now,
    limit: restApiRateLimit.limit,
    windowStart,
    windowMs: restApiRateLimit.windowMs,
  });
}

async function deleteExpiredRateLimitWindows(ctx: MutationCtx, now: number) {
  const expired = await ctx.db
    .query("apiRateLimitWindows")
    .withIndex("by_expires", (q) => q.lt("windowEnd", now))
    .take(25);

  for (const window of expired) {
    await ctx.db.delete(window._id);
  }
}

function hasUploadRefusal(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as { body?: unknown; error?: { code?: string }; data?: { results?: Array<{ ok?: boolean; code?: string; refusal?: { code?: string } }> } };
  if (body.body) return hasUploadRefusal(body.body);
  const isRefusal = (code?: string) => code === "USAGE_LIMIT_REACHED" || code === "FILE_TOO_LARGE";
  if (isRefusal(body.error?.code)) return true;
  return body.data?.results?.some(result => result.ok === false && (isRefusal(result.code) || isRefusal(result.refusal?.code))) ?? false;
}

export const storeIdempotency = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    apiKeyId: v.id("apiKeys"),
    idempotencyKey: v.optional(v.string()),
    requestHash: v.optional(v.string()),
    response: v.any(),
    status: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reply = (args.response && typeof args.response === "object" ? args.response : {}) as { error?: { code?: string }; data?: { results?: Array<{ ok?: boolean; code?: string }> } };
    const transferErrors = ["photo_upload_failed", "upload_init_failed", "upload_finalize_failed"];
    if (transferErrors.includes(reply.error?.code ?? "") || (Array.isArray(reply.data?.results) && reply.data.results.some(item => item.ok === false && transferErrors.includes(item.code ?? "")))) return;

    if (!args.idempotencyKey || !args.requestHash) return;
    if (hasUploadRefusal(args.response)) return;
    await ctx.db.insert("apiIdempotencyKeys", {
      householdId: args.householdId,
      moveId: args.moveId,
      apiKeyId: args.apiKeyId,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      response: args.response,
      status: args.status,
      createdAt: Date.now(),
      expiresAt: args.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    });
  },
});

async function routeRequest(
  ctx: MutationCtx,
  args: RestRequestInput,
  segments: string[],
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  const [resource, moveIdSegment, nested, nestedId] = segments;
  if (resource === "me" && args.method === "GET" && segments.length === 1) {
    return await routeMe(ctx, auth);
  }
  if (resource === "exports" && args.method === "GET") {
    return await routeTopLevelExport(ctx, args, auth, moveIdSegment);
  }
  if (resource === "items") {
    return await routeTopLevelItem(ctx, args, auth, moveIdSegment, nested, nestedId);
  }
  if (resource === "boxes") {
    return await routeTopLevelBox(ctx, args, auth, moveIdSegment, nested, nestedId);
  }
  if (resource === "photos") {
    return await routeTopLevelPhoto(ctx, args, auth, moveIdSegment, nested);
  }
  if (resource === "plans") {
    return await routePlans(ctx, args, auth, moveIdSegment, nested);
  }
  if (resource === "households") {
    return await routeHouseholds(ctx, args, auth, moveIdSegment, nested, nestedId);
  }
  if (resource !== "moves") {
    return restError({ status: 404, code: "not_found", message: "Not found." });
  }

  if (args.method === "GET" && segments.length === 1) {
    return await routeListMoves(ctx, args, auth);
  }
  if (args.method === "POST" && segments[1] === "setup" && segments.length === 2) {
    return await routeSetupMove(ctx, args, auth);
  }
  if (args.method === "POST" && segments.length === 1) {
    return await routeCreateMove(ctx, args, auth);
  }

  const moveId = moveIdSegment as Id<"moves"> | undefined;
  if (!moveId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Move route not found.",
    });
  }
  const move = await requireApiMove(ctx, auth.householdId, moveId);

  if (args.method === "GET" && segments.length === 2) {
    return restOk({ data: safeMove(move) });
  }
  if (args.method === "PATCH" && segments.length === 2) {
    return await routeUpdateMove(ctx, args, auth, moveId);
  }
  if (nested === "summary" && args.method === "GET" && segments.length === 3) {
    return await routeMoveSummary(ctx, auth, move);
  }
  if (nested === "questions" && args.method === "GET" && segments.length === 3) {
    return await routeMoveQuestions(ctx, auth, move);
  }
  if (nested === "move-day" && args.method === "GET" && segments.length === 3) {
    return await routeMoveDayChecklist(ctx, args, auth, move);
  }
  if (
    nested === "capacity-report" &&
    args.method === "GET" &&
    segments.length === 3
  ) {
    return await routeCapacityReport(ctx, auth, move);
  }
  if (nested === "agent-context" && args.method === "GET" && segments.length === 3) {
    return await routeAgentContext(ctx, auth, move);
  }

  if (nested === "spaces") {
    return await routeMoveSpaces(ctx, args, auth, moveId, nestedId);
  }

  if (["ai-text-suggestions","ai-photo-suggestions","planning-suggestions"].includes(nested??"") && args.method === "POST" && ["approve","reject"].includes(nestedId??"")) throw new ConvexError("Only the person can accept, dismiss or edit-accept AI proposals on the website.");
  if (nested === "queue") {
    return await routeQueue(ctx, args, auth, moveId, nestedId, segments[4]);
  }

  if (nested === "sale-listings") {
    return await routeSaleListings(ctx, args, auth, moveId, nestedId);
  }

  if (nested === "resources") {
    return await routeTransportResources(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4]
    );
  }

  if (nested === "zones") {
    return await routeTransportZones(ctx, args, auth, moveId, nestedId);
  }

  if (nested === "people") {
    return await routeMovePeople(ctx, args, auth, moveId, nestedId);
  }

  if (nested === "items") {
    return await routeItems(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "movable-units") {
    return await routeMovableUnits(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "planned-items") {
    return await routePlannedItems(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "boxes") {
    return await routeBoxes(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "assignments") {
    return await routeAssignments(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "planning-suggestions") {
    return await routePlanningSuggestions(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4]
    );
  }
  if (nested === "ai-jobs") {
    return await routeAiJobs(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "ai-text-suggestions") {
    return await routeAiTextSuggestions(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "ai-photo-suggestions") {
    return await routeAiPhotoSuggestions(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "documentation-profiles") {
    return await routeDocumentationProfiles(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4]
    );
  }
  if (nested === "exports") {
    return await routeExports(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "share-links") {
    return await routeShareLinks(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "photos" && args.method === "GET") {
    return await routeListPhotos(ctx, args, moveId);
  }

  return restError({ status: 404, code: "not_found", message: "Not found." });
}

async function withIdempotency(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  createResponse: () => Promise<RestResponse>
) {
  if (args.method === "GET" || !args.idempotencyKey) {
    return await createResponse();
  }
  const requestHash = await hashApiKey(requestHashInput(args));
  const existing = await ctx.db
    .query("apiIdempotencyKeys")
    .withIndex("by_api_key_key", (q) =>
      q.eq("apiKeyId", auth.apiKeyId).eq("idempotencyKey", args.idempotencyKey!)
    )
    .unique();
  if (existing) {
    if (existing.expiresAt < Date.now()) {
      await ctx.db.delete(existing._id);
      return await withIdempotency(ctx, args, auth, createResponse);
    }
    if (existing.requestHash !== requestHash) {
      return restError({
        status: 409,
        code: "idempotency_conflict",
        message: "Idempotency key was already used with a different request.",
      });
    }
    return {
      status: existing.status,
      body: existing.response,
    };
  }
  const response = await createResponse();
  await ctx.db.insert("apiIdempotencyKeys", {
    householdId: auth.householdId,
    moveId: auth.moveId,
    apiKeyId: auth.apiKeyId,
    idempotencyKey: args.idempotencyKey,
    requestHash,
    response: response.body,
    status: response.status,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return response;
}
