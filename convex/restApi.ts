import { anyApi, type FunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { authenticateApiKey } from "./lib/apiKeyAuth";
import { hashApiKey } from "./lib/apiKeys";
import { getAiProviderStatus } from "./lib/aiProvider";
import {
  buildMoveDayChecklist,
  parseMoveDayFilter,
} from "./lib/moveDayChecklist";
import {
  aiUsageLimits,
  assertAiUsageAllowed,
  inputBytesFromText,
} from "./lib/aiUsage";
import { resolveBoxWeight } from "./lib/boxWeight";
import {
  requiresOverrideReason,
  validateAssignment,
} from "./lib/assignmentValidation";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  assignmentCsvRows,
  boxCsvRows,
  csvFromRows,
  exportFilename,
  exportMimeType,
  inventoryCsvRows,
  type ExportVisibility,
} from "./lib/exportRows";
import {
  documentationFieldKeys,
  documentationImageRules,
  documentationProfileStatuses,
  normalizeDocumentationFilters,
  normalizeDocumentationProfileConfig,
  shareLinkActions,
  type DocumentationFieldKey,
  type DocumentationFilters,
  type DocumentationImageRule,
  type DocumentationProfileStatus,
  type DocumentationProfileType,
  type ShareLinkAction,
} from "./lib/documentation";
import {
  estimateItem,
  roundEstimate,
  sumEstimateValues,
} from "./lib/estimateEngine";
import { itemDimensionsConfidenceForRead } from "../src/lib/inventory-measurements";
import { summarizeMoveQuestionsFromDocs } from "./lib/moveQuestionDocuments";
import {
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "./lib/householdMembers";
import {
  boxStatuses,
  documentationProfileTypes,
  defaultDocumentationProfilesForMoveType,
  exifHandlingStatuses,
  itemConditions,
  itemDispositions,
  itemFragilities,
  itemStatuses,
  measurementProvenanceSources,
  normalizeDocumentationProfileTypes,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
  normalizedSearchName,
  planningDefaultKeys,
  photoPrivacyLevels,
  photoSources,
  photoTypes,
  photoVerificationStatuses,
  photoVisibilityScopes,
  moveSpaceKinds,
  saleListingPlatforms,
  saleListingStatuses,
  saleResearchDepths,
  moveTypes,
  pcsBranches,
  pcsDependentStatuses,
  pcsShipmentTypes,
  transportResourcePresetKeys,
  transportResourceTypes,
} from "./lib/moveFields";
import {
  createGeneratedShareLink,
  revokeShareLinkRecord,
  safeShareLinkMetadata,
  type ShareLinkRole,
} from "./lib/shareLinks";
import {
  approvePlanningSuggestions,
  createPlanningSuggestionsForMove,
  rejectPlanningSuggestions,
  type PlanningSuggestionApprovalInput,
} from "./lib/aiPlanningSuggestionWorkflow";
import { suggestFromPhotoIntake } from "./lib/photoIntake";
import { canUsePhotoDerivativeForAi } from "./lib/photoVisibility";
import { suggestAssignmentForBox } from "./lib/planningSuggestions";
import { parseTextIntakeSuggestions } from "./lib/textIntakeParser";
import { getTransportResourcePreset } from "./lib/transportPresets";
import { insertMissingMovePlanningDefaults } from "./movePlanningDefaults";
import {
  describePlanDocument,
  normalizePlanDocument,
  renderPlanSnapshotSvg,
  type PlanDocumentInput,
  type PlanEntitySummary,
  type PlanPlacementSummary,
  type PlanSourceSummary,
} from "../src/lib/plan-describe";
import {
  bearerToken,
  bodyRecord as bodyObject,
  moveIdFromRestBodyOrQuery,
  moveIdFromRestRequest,
  paginate,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
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
} from "./lib/restApi";

const restMoveStatuses = ["planning", "active", "completed", "archived"] as const;
const restExportJobTypes = [
  "inventory",
  "boxes",
  "assignments",
  "documentationProfile",
] as const;
type RestExportJobType = (typeof restExportJobTypes)[number];
const restShareLinkStatuses = ["active", "revoked"] as const;
const restShareLinkScopes = ["move", "profile"] as const;
const restShareLinkRoles = [
  "owner",
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
] as const;
const restEstimateConfidences = [
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
] as const;
const restPlannedItemStatuses = [
  "idea",
  "decided",
  "purchased",
  "dropped",
] as const;
const restPlanningSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
] as const;
const restAiJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
const restAiSuggestionStatuses = [
  "pending",
  "approved",
  "edited",
  "rejected",
] as const;
const restMovePersonRoles = [
  "owner",
  "householdMember",
  "helper",
  "mover",
  "contact",
] as const;
const maxBatchUpsertItems = 100;

const internalFunctions = anyApi as unknown as {
  planOps: {
    applyApiOps: FunctionReference<
      "mutation",
      "internal",
      {
        householdId: Id<"households">;
        moveId: Id<"moves">;
        planId: Id<"floorPlans">;
        batchId: string;
        ops: unknown[];
        apiKeyId: Id<"apiKeys">;
        agentLabel?: string;
      },
      unknown
    >;
  };
};

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
    if (!requiredScopes.length) {
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
        requiredScopes,
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

      const response = await withIdempotency(ctx, args, auth, async () =>
        routeRequest(ctx, args, segments, auth)
      );
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
    if (!args.idempotencyKey || !args.requestHash) return;
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
    return await routeTopLevelItem(ctx, args, auth, moveIdSegment);
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
    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", auth.householdId)
      )
      .collect();
    return restOk(
      paginate(
        moves
          .filter((move) => move.status !== "archived")
          .map((move) => safeMove(move)),
        args.query
      )
    );
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
    const patch = movePatch(args.body);
    await ctx.db.patch(moveId, patch);
    await auditApiWrite(ctx, auth, moveId, "move.api_updated", "moves", moveId, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { moveId, ...patch } });
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
  if (nested === "planned-items") {
    return await routePlannedItems(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "boxes") {
    return await routeBoxes(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "assignments") {
    return await routeAssignments(ctx, args, auth, moveId, nestedId);
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
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        photos.filter((photo) => !photo.archivedAt).map((photo) => ({
          photoId: photo._id,
          itemId: photo.itemId,
          boxId: photo.boxId,
          spaceId: photo.spaceId,
          transportResourceId: photo.transportResourceId,
          transportZoneId: photo.transportZoneId,
          room: photo.room,
          photoType: photo.photoType,
          privacyLevel: photo.privacyLevel,
          verificationStatus: photo.verificationStatus,
          caption: photo.caption,
          width: photo.width,
          height: photo.height,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          capturedAt: photo.capturedAt,
          uploadedAt: photo.createdAt,
        })),
        args.query
      )
    );
  }

  return restError({ status: 404, code: "not_found", message: "Not found." });
}

async function routePlans(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment?: string,
  nested?: string
) {
  if (args.method === "GET" && !planIdSegment) {
    const moveId = planListMoveId(args, auth);
    if (!moveId) {
      return restError({
        status: 400,
        code: "move_required",
        message: "moveId is required for listing plans.",
      });
    }
    await requireApiMove(ctx, auth.householdId, moveId);
    const plans = await ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
      .collect();
    const activePlans = plans.filter((plan) => !plan.archivedAt);
    const summaries = await Promise.all(
      activePlans.map(async (plan) => ({
        planId: plan._id,
        moveId: plan.moveId,
        name: plan.name,
        kind: plan.kind,
        status: plan.status,
        levels: await planLevelSummaries(ctx, plan._id),
        updatedAt: plan.updatedAt,
      })),
    );
    return restOk(paginate(summaries, args.query));
  }

  if (!planIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Plan route not found.",
    });
  }

  const plan = await requireApiPlan(ctx, auth, planIdSegment);
  if (args.method === "GET" && !nested) {
    return restOk({ data: await planDocumentForApi(ctx, plan) });
  }
  if (args.method === "GET" && nested === "summary") {
    const document = await planDocumentForApi(ctx, plan);
    return restOk({ data: { planId: plan._id, summary: describePlanDocument(document) } });
  }
  if (args.method === "GET" && nested === "snapshot.svg") {
    const document = await planDocumentForApi(ctx, plan);
    return {
      status: 200,
      body: renderPlanSnapshotSvg(document, args.query.level),
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    };
  }
  if (nested === "proposals") {
    return await routePlanProposals(ctx, args, auth, plan);
  }
  if (args.method === "POST" && nested === "ops") {
    return await routePlanOps(ctx, args, auth, plan);
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Plan route not found.",
  });
}

async function routeHouseholds(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdIdSegment?: string,
  nested?: string,
  nestedId?: string
) {
  const householdId = householdIdSegment as Id<"households"> | undefined;
  if (!householdId || nested !== "members" || nestedId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Household route not found.",
    });
  }
  if (householdId !== auth.householdId) {
    return restError({
      status: 403,
      code: "forbidden",
      message: "API key is not scoped to this household.",
    });
  }

  if (args.method === "GET") {
    return restOk({
      data: await listApiHouseholdMembers(ctx, householdId),
    });
  }

  if (args.method === "POST") {
    return await routeAddHouseholdMember(ctx, args, auth, householdId);
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Household member route not found.",
  });
}

async function listApiHouseholdMembers(
  ctx: MutationCtx,
  householdId: Id<"households">
) {
  const memberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const members = await Promise.all(
    memberships
      .filter((membership) => membership.status !== "disabled")
      .map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          membershipId: membership._id,
          userId: membership.userId,
          email: user?.email ?? membership.invitedEmail,
          name: user?.name,
          role: membership.role,
          status: membership.status,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        };
      })
  );

  return members.sort((left, right) => {
    if (left.role === "owner") return -1;
    if (right.role === "owner") return 1;
    return (left.email ?? left.name ?? "").localeCompare(
      right.email ?? right.name ?? ""
    );
  });
}

async function routeAddHouseholdMember(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdId: Id<"households">
) {
  const body = bodyObject(args.body);
  const normalizedEmail = normalizeCollaboratorEmail(
    requiredBodyString(body.email, "email is required.")
  );
  if (!normalizedEmail) {
    throw new Error("Enter a collaborator email.");
  }

  const role = parseManagedHouseholdMemberRole(
    requiredBodyString(body.role, "role is required.")
  );
  if (!role) {
    throw new Error("Owner access cannot be granted from the API.");
  }

  const targetUser =
    (await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique()) ??
    (normalizedEmail === String(body.email).trim()
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", String(body.email).trim()))
          .unique());

  if (!targetUser || targetUser.status !== "active") {
    return restError({
      status: 409,
      code: "user_not_registered",
      message:
        "That person needs to sign in to MovingManifest once before they can be added by email.",
    });
  }

  if (targetUser._id === auth.createdByUserId) {
    throw new Error("The API key creator is already a member of this household.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", householdId).eq("userId", targetUser._id)
    )
    .unique();

  if (existing?.role === "owner") {
    throw new Error("Owner access cannot be changed from the API.");
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      role,
      status: "active",
      invitedEmail: normalizedEmail,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId,
      actorType: "apiKey",
      actorApiKeyId: auth.actor.apiKeyId,
      category: "household",
      action: "household.member_reactivated",
      objectTable: "householdMemberships",
      objectId: existing._id,
      metadata: {
        targetUserId: targetUser._id,
        role,
        email: normalizedEmail,
      },
    });
    return restOk(
      {
        data: {
          membershipId: existing._id,
          userId: targetUser._id,
          email: normalizedEmail,
          role,
          status: "active",
          reactivated: true,
        },
      },
      200
    );
  }

  const membershipId = await ctx.db.insert("householdMemberships", {
    householdId,
    userId: targetUser._id,
    role,
    status: "active",
    invitedEmail: normalizedEmail,
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  await recordAuditEvent(ctx, {
    householdId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "household",
    action: "household.member_added",
    objectTable: "householdMemberships",
    objectId: membershipId,
    metadata: {
      targetUserId: targetUser._id,
      role,
      email: normalizedEmail,
    },
  });

  return restOk(
    {
      data: {
        membershipId,
        userId: targetUser._id,
        email: normalizedEmail,
        role,
        status: "active",
        reactivated: false,
      },
    },
    201
  );
}

async function routePlanOps(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">
) {
  const body = bodyObject(args.body);
  const batchId = requiredBodyString(body.batchId, "batchId is required.");
  const ops = requiredOps(body.ops);
  const agentLabel = optionalString(body.agentLabel);

  try {
    const result = await ctx.runMutation(internalFunctions.planOps.applyApiOps, {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      batchId,
      ops,
      apiKeyId: auth.apiKeyId,
      agentLabel,
    });
    return restOk({ data: result }, 201);
  } catch (error) {
    const structured = structuredPlanOpError(error);
    if (structured) {
      return {
        status: 400,
        body: {
          error: {
            code: structured.code,
            message: structured.reason,
            index: structured.index,
          },
        },
      };
    }
    throw error;
  }
}

async function routePlanProposals(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">
) {
  if (args.method === "GET") {
    const statuses = args.query.includeReviewed === "true"
      ? (["pending", "applied", "partiallyApplied", "rejected"] as const)
      : (["pending"] as const);
    const proposals = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("planProposals")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", plan._id).eq("status", status)
            )
            .collect(),
        ),
      )
    ).flat();
    return restOk(
      paginate(
        proposals
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((proposal) => safePlanProposal(proposal)),
        args.query,
      ),
    );
  }

  if (args.method === "POST") {
    const body = bodyObject(args.body);
    const batchId = requiredBodyString(body.batchId, "batchId is required.");
    const ops = requiredOps(body.ops);
    const reasoning = requiredBodyString(body.reasoning, "reasoning is required.");
    const agentLabel = optionalString(body.agentLabel);
    const now = Date.now();
    const proposalId = await ctx.db.insert("planProposals", {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      batchId,
      ops,
      agentLabel,
      reasoning: reasoning.slice(0, 8000),
      status: "pending",
      appliedOpIndexes: [],
      createdByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId: auth.householdId,
      moveId: plan.moveId,
      actorType: "apiKey",
      actorApiKeyId: auth.actor.apiKeyId,
      category: "plan",
      action: "plan.proposal_created",
      objectTable: "planProposals",
      objectId: proposalId,
      metadata: {
        planId: plan._id,
        batchId,
        opCount: ops.length,
        agentLabel,
      },
    });
    const proposal = await ctx.db.get(proposalId);
    return restOk(
      { data: proposal ? safePlanProposal(proposal) : { proposalId } },
      201,
    );
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Plan proposal route not found.",
  });
}

function planListMoveId(
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  return (
    auth.moveId ??
    moveIdFromRestBodyOrQuery({
      body: args.body,
      query: args.query,
    })
  ) as Id<"moves"> | undefined;
}

async function planLevelSummaries(ctx: MutationCtx, planId: Id<"floorPlans">) {
  const levels = await ctx.db
    .query("planLevels")
    .withIndex("by_plan_sort", (q) => q.eq("planId", planId))
    .collect();
  return levels
    .filter((level) => !level.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((level) => ({
      levelId: level._id,
      name: level.name,
      levelType: level.levelType,
      sortOrder: level.sortOrder,
      ceilingHeightIn: level.ceilingHeightIn,
    }));
}

async function routeMoveSummary(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [
    resources,
    zones,
    people,
    items,
    boxes,
    assignments,
    photos,
    planningSuggestions,
    documentationProfiles,
    exportJobs,
    shareLinks,
  ] = await Promise.all([
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .take(120),
    ctx.db
      .query("documentationProfiles")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("shareLinks")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const activePeople = people.filter(
    (person) => person.householdId === auth.householdId && !person.archivedAt
  );
  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const visiblePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt
  );
  const activeDocumentationProfiles = documentationProfiles.filter(
    (profile) =>
      profile.householdId === auth.householdId && profile.status !== "archived"
  );
  const visiblePlanningSuggestions = planningSuggestions.filter(
    (suggestion) => suggestion.householdId === auth.householdId
  );
  const visibleExportJobs = exportJobs.filter(
    (job) => job.householdId === auth.householdId
  );
  const visibleShareLinks = shareLinks.filter(
    (link) => link.householdId === auth.householdId
  );
  const visibleAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId
  );

  return restOk({
    data: {
      move: safeMove(move),
      resources: activeResources.map((resource) => safeTransportResource(resource)),
      zones: activeZones.map((zone) => safeTransportZone(zone)),
      people: activePeople.map((person) => safeMovePerson(person)),
      items: activeItems.map((item) => safeItem(item)),
      boxes: activeBoxes.map((box) => safeBox(box)),
      assignments: visibleAssignments.map((assignment) =>
        safeAssignment(assignment)
      ),
      photos: visiblePhotos.map((photo) => safePhoto(photo)),
      planningSuggestions: visiblePlanningSuggestions.map((suggestion) =>
        safePlanningSuggestion(suggestion)
      ),
      documentationProfiles: activeDocumentationProfiles.map((profile) =>
        safeDocumentationProfile(profile)
      ),
      exports: visibleExportJobs.map((job) => safeExportJob(job)),
      shareLinks: visibleShareLinks.map((link) => safeApiShareLink(link)),
      counts: {
        resources: activeResources.length,
        zones: activeZones.length,
        people: activePeople.length,
        items: activeItems.length,
        boxes: activeBoxes.length,
        assignments: visibleAssignments.length,
        photos: visiblePhotos.length,
        planningSuggestions: visiblePlanningSuggestions.length,
        documentationProfiles: activeDocumentationProfiles.length,
        exports: visibleExportJobs.length,
        shareLinks: visibleShareLinks.length,
      },
      generatedAt: Date.now(),
    },
  });
}

async function routeMe(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  const [household, restrictedMove] = await Promise.all([
    ctx.db.get(auth.householdId),
    auth.moveId ? ctx.db.get(auth.moveId) : Promise.resolve(null),
  ]);
  return restOk({
    data: {
      household: household
        ? {
            householdId: household._id,
            name: household.name,
            slug: household.slug,
          }
        : { householdId: auth.householdId },
      apiKey: {
        apiKeyId: auth.apiKeyId,
        scopes: auth.scopes,
        moveRestricted: Boolean(auth.moveId),
        moveId: auth.moveId,
        createdByUserId: auth.createdByUserId,
      },
      restrictedMove:
        restrictedMove && restrictedMove.householdId === auth.householdId
          ? safeMove(restrictedMove)
          : null,
      generatedAt: Date.now(),
    },
  });
}

async function routeMoveQuestions(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, memberships, photos, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const summary = summarizeMoveQuestionsFromDocs({
    householdId: auth.householdId,
    move,
    items,
    boxes,
    memberships,
    photos,
    resources,
    zones,
  });

  return restOk({
    data: {
      move: {
        moveId: move._id,
        title: move.title,
        type: move.type,
      },
      ...summary,
      generatedAt: Date.now(),
    },
  });
}

async function routeMoveDayChecklist(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, memberships, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const summary = buildMoveDayChecklist({
    householdId: auth.householdId,
    move,
    items,
    boxes,
    memberships,
    resources,
    zones,
    filter: parseMoveDayFilter(args.query.filter) ?? "all",
    search: args.query.query ?? args.query.search,
  });
  const page = paginate(summary.checklist, args.query);

  return restOk({
    data: {
      ...summary,
      checklist: page.data,
      page: page.page,
    },
  });
}

async function routeCreateMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  if (auth.moveId) {
    return restError({
      status: 403,
      code: "move_restricted_key",
      message: "Move-restricted API keys cannot create new moves.",
    });
  }
  const body = bodyObject(args.body);
  const title = normalizeOptionalText(asString(body.title));
  if (!title) {
    return restError({
      status: 400,
      code: "invalid_move",
      message: "title is required.",
    });
  }
  const type = parseMoveType(body.type) ?? "other";
  await assertHouseholdEntitlement(ctx, {
    householdId: auth.householdId,
    dimension: "activeMoves",
  });

  const now = Date.now();
  const documentationProfileTypes = Array.isArray(body.documentationProfileTypes)
    ? parseDocumentationProfileTypes(body.documentationProfileTypes)
    : [...defaultDocumentationProfilesForMoveType(type)];
  const moveId = await ctx.db.insert("moves", {
    householdId: auth.householdId,
    title,
    type,
    status: "planning",
    origin: normalizeOptionalText(asString(body.origin)),
    destination: normalizeOptionalText(asString(body.destination)),
    dateStart: normalizeOptionalText(asString(body.dateStart)),
    dateEnd: normalizeOptionalText(asString(body.dateEnd)),
    unitSystem: parseUnitSystem(body.unitSystem) ?? "imperial",
    documentationProfileTypes,
    moveLevelWeightAllowanceLb: optionalNumber(body.moveLevelWeightAllowanceLb),
    pcsBranch: parsePcsBranch(body.pcsBranch),
    pcsRankPayGrade: normalizeOptionalText(asString(body.pcsRankPayGrade)),
    pcsDependentStatus: parsePcsDependentStatus(body.pcsDependentStatus),
    pcsShipmentType: parsePcsShipmentType(body.pcsShipmentType),
    pcsOrdersNumber: normalizeOptionalText(asString(body.pcsOrdersNumber)),
    pcsAllowanceNotes: normalizeOptionalText(asString(body.pcsAllowanceNotes)),
    pcsTransportationOfficeNotes: normalizeOptionalText(
      asString(body.pcsTransportationOfficeNotes)
    ),
    pcsRestrictedItemsNotes: normalizeOptionalText(
      asString(body.pcsRestrictedItemsNotes)
    ),
    proGearNotes: normalizeOptionalText(asString(body.proGearNotes)),
    notes: normalizeOptionalText(asString(body.notes)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  const planningDefaultIds = await insertMissingMovePlanningDefaults(ctx, {
    householdId: auth.householdId,
    moveId,
  });

  await auditApiWrite(ctx, auth, moveId, "move.api_created", "moves", moveId, {
    title,
    type,
    documentationProfileTypes,
    planningDefaultCount: planningDefaultIds.length,
  });
  const created = await ctx.db.get(moveId);
  return restOk(
    {
      data: {
        move: created ? safeMove(created) : { moveId },
        planningDefaultCount: planningDefaultIds.length,
      },
    },
    201
  );
}

async function routeSetupMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  if (auth.moveId) {
    return restError({
      status: 403,
      code: "move_restricted_key",
      message: "Move-restricted API keys cannot create or select moves.",
    });
  }

  const body = bodyObject(args.body);
  const dryRun = Boolean(body.dryRun);
  const updateExisting = body.updateExisting !== false;
  const requestedMoveId = optionalString(body.moveId);
  const normalizedRequestedMoveId = requestedMoveId
    ? ctx.db.normalizeId("moves", requestedMoveId)
    : null;
  if (requestedMoveId && !normalizedRequestedMoveId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Move not found.",
    });
  }
  const title = normalizeOptionalText(asString(body.title));
  const existingMove = normalizedRequestedMoveId
    ? await requireApiMove(ctx, auth.householdId, normalizedRequestedMoveId)
    : title && updateExisting
      ? await findApiMoveByTitle(ctx, auth.householdId, title)
      : null;

  if (!existingMove && !title) {
    return restError({
      status: 400,
      code: "invalid_move_setup",
      message: "title is required when setup is creating a move.",
    });
  }

  const roomSetupNote = setupRoomsNote(body);
  const baseNotes = normalizeOptionalText(asString(body.notes));
  const notes =
    roomSetupNote && baseNotes
      ? `${baseNotes}\n\n${roomSetupNote}`
      : (baseNotes ?? roomSetupNote);

  if (dryRun) {
    return restOk({
      data: {
        dryRun: true,
        action: existingMove ? "update" : "create",
        matchedMoveId: existingMove?._id,
        title,
        spaceCount: setupSpaceInputs(body).length,
        transportResourceCount: setupTransportInputs(body).length,
        itemCount: setupItemInputs(body).length,
        notes,
      },
    });
  }

  const now = Date.now();
  let moveId: Id<"moves">;
  let moveAction: "create" | "update";
  if (existingMove) {
    moveId = existingMove._id;
    moveAction = "update";
    const patch = setupMovePatch(body, notes);
    if (Object.keys(patch).length > 1) {
      await ctx.db.patch(moveId, patch);
      await auditApiWrite(ctx, auth, moveId, "move.api_setup_updated", "moves", moveId, {
        changedKeys: Object.keys(patch),
      });
    }
  } else {
    moveAction = "create";
    const type = parseMoveType(body.type) ?? "other";
    await assertHouseholdEntitlement(ctx, {
      householdId: auth.householdId,
      dimension: "activeMoves",
    });
    const documentationProfileTypes = Array.isArray(body.documentationProfileTypes)
      ? parseDocumentationProfileTypes(body.documentationProfileTypes)
      : [...defaultDocumentationProfilesForMoveType(type)];
    moveId = await ctx.db.insert("moves", {
      householdId: auth.householdId,
      title: title!,
      type,
      status: parseMoveStatus(body.status) ?? "planning",
      origin: normalizeOptionalText(asString(body.origin)),
      destination: normalizeOptionalText(asString(body.destination)),
      dateStart: normalizeOptionalText(asString(body.dateStart)),
      dateEnd: normalizeOptionalText(asString(body.dateEnd)),
      unitSystem: parseUnitSystem(body.unitSystem) ?? "imperial",
      documentationProfileTypes,
      moveLevelWeightAllowanceLb: optionalNumber(body.moveLevelWeightAllowanceLb),
      pcsBranch: parsePcsBranch(body.pcsBranch),
      pcsRankPayGrade: normalizeOptionalText(asString(body.pcsRankPayGrade)),
      pcsDependentStatus: parsePcsDependentStatus(body.pcsDependentStatus),
      pcsShipmentType: parsePcsShipmentType(body.pcsShipmentType),
      pcsOrdersNumber: normalizeOptionalText(asString(body.pcsOrdersNumber)),
      pcsAllowanceNotes: normalizeOptionalText(asString(body.pcsAllowanceNotes)),
      pcsTransportationOfficeNotes: normalizeOptionalText(
        asString(body.pcsTransportationOfficeNotes),
      ),
      pcsRestrictedItemsNotes: normalizeOptionalText(
        asString(body.pcsRestrictedItemsNotes),
      ),
      proGearNotes: normalizeOptionalText(asString(body.proGearNotes)),
      notes,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    const planningDefaultIds = await insertMissingMovePlanningDefaults(ctx, {
      householdId: auth.householdId,
      moveId,
    });
    await auditApiWrite(ctx, auth, moveId, "move.api_setup_created", "moves", moveId, {
      title,
      type,
      planningDefaultCount: planningDefaultIds.length,
    });
  }

  const spaceResults = [];
  for (const [index, input] of setupSpaceInputs(body).entries()) {
    spaceResults.push(await upsertApiMoveSpaceForSetup(ctx, auth, moveId, input, index));
  }

  const resourceResults = [];
  for (const [index, input] of setupTransportInputs(body).entries()) {
    resourceResults.push(
      await upsertApiTransportResourceForSetup(ctx, auth, moveId, input, index),
    );
  }

  let itemBatchResult: unknown = {
    dryRun: false,
    total: 0,
    succeeded: 0,
    failed: 0,
    results: [],
  };
  const items = setupItemInputs(body);
  if (items.length) {
    const batchResponse = await routeBatchUpsertItems(
      ctx,
      {
        ...args,
        method: "POST",
        path: `/moves/${moveId}/items/batch-upsert`,
        body: { items },
      },
      auth,
      moveId,
    );
    if (batchResponse.status >= 400) {
      throw new Error("Item setup failed.");
    }
    itemBatchResult =
      typeof batchResponse.body === "object" &&
      batchResponse.body &&
      "data" in batchResponse.body
        ? (batchResponse.body as { data?: unknown }).data
        : itemBatchResult;
  }

  const [move, resources, zones] = await Promise.all([
    ctx.db.get(moveId),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
  ]);

  return restOk(
    {
      data: {
        action: moveAction,
        move: move ? safeMove(move) : { moveId },
        resources: resources
          .filter((resource) => resource.householdId === auth.householdId)
          .filter((resource) => !resource.archivedAt)
          .map((resource) => safeTransportResource(resource)),
        zones: zones
          .filter((zone) => zone.householdId === auth.householdId)
          .filter((zone) => !zone.archivedAt)
          .map((zone) => safeTransportZone(zone)),
        setupResults: {
          spaces: spaceResults,
          resources: resourceResults,
          items: itemBatchResult,
        },
      },
    },
    moveAction === "create" ? 201 : 200,
  );
}

async function routeAgentContext(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [
    items,
    photos,
    spaces,
    resources,
    zones,
    saleListings,
    plans,
  ] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("saleListings")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt,
  );
  const activePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt,
  );
  const photosByItemId = new Map<string, number>();
  for (const photo of activePhotos) {
    if (!photo.itemId) continue;
    photosByItemId.set(
      String(photo.itemId),
      (photosByItemId.get(String(photo.itemId)) ?? 0) + 1,
    );
  }
  const listingByItemId = new Map(
    saleListings
      .filter((listing) => listing.householdId === auth.householdId)
      .filter((listing) => !listing.archivedAt)
      .map((listing) => [String(listing.itemId), listing]),
  );
  const sellItems = activeItems.filter((item) => item.disposition === "sell");
  const saleResearchSourceCount = Array.from(listingByItemId.values()).reduce(
    (total, listing) => total + listing.researchSourceCount,
    0,
  );

  return restOk({
    data: {
      move: safeMove(move),
      aiContract: {
        preferredSetupOrder: [
          "spaces",
          "transportResources",
          "transportZones",
          "items",
          "photos",
          "saleListings",
          "layoutPlan",
        ],
        roomCompatibility:
          "Use currentSpaceId/destinationSpaceId when available; keep room/destinationRoom names for readable fallback.",
        saleWorkflow:
          "Items with disposition=sell should have a linked saleListing for pricing, marketplace draft, research, and status.",
        measurementRule:
          "If dimensions or weights are estimated, include measurementProvenance with sourceType, confidence, recordedByLabel, recordedAt, and needsVerification.",
      },
      counts: {
        items: activeItems.length,
        photos: activePhotos.length,
        spaces: spaces.filter(
          (space) =>
            space.householdId === auth.householdId && space.status !== "archived",
        ).length,
        transportResources: resources.filter(
          (resource) =>
            resource.householdId === auth.householdId && !resource.archivedAt,
        ).length,
        transportZones: zones.filter(
          (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
        ).length,
        sellItems: sellItems.length,
        saleListings: listingByItemId.size,
        saleResearchSourceCount,
      },
      spaces: spaces
        .filter(
          (space) =>
            space.householdId === auth.householdId && space.status !== "archived",
        )
        .map((space) => safeMoveSpace(space)),
      transportResources: resources
        .filter(
          (resource) =>
            resource.householdId === auth.householdId && !resource.archivedAt,
        )
        .map((resource) => safeTransportResource(resource)),
      transportZones: zones
        .filter((zone) => zone.householdId === auth.householdId && !zone.archivedAt)
        .map((zone) => safeTransportZone(zone)),
      items: activeItems.map((item) => ({
        ...safeItem(item),
        photoCount: photosByItemId.get(String(item._id)) ?? 0,
        saleListingId: listingByItemId.get(String(item._id))?._id,
      })),
      salePipeline: sellItems.map((item) => {
        const listing = listingByItemId.get(String(item._id));
        return {
          item: safeItem(item),
          photoCount: photosByItemId.get(String(item._id)) ?? 0,
          listing: listing ? safeSaleListing(listing) : undefined,
          needsListing: !listing,
          needsMorePhotos: listing?.needsMorePhotos ?? true,
          researchDepth: listing?.researchDepth ?? "none",
          researchSourceCount: listing?.researchSourceCount ?? 0,
        };
      }),
      photos: activePhotos.slice(0, 250).map((photo) => safePhoto(photo)),
      layoutPlans: plans
        .filter((plan) => plan.householdId === auth.householdId && !plan.archivedAt)
        .map((plan) => ({
          planId: plan._id,
          name: plan.name,
          kind: plan.kind,
          status: plan.status,
          updatedAt: plan.updatedAt,
        })),
    },
  });
}

async function routeMoveSpaces(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  spaceIdSegment?: string
) {
  if (args.method === "GET" && !spaceIdSegment) {
    const spaces = await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        spaces
          .filter((space) => space.householdId === auth.householdId)
          .filter((space) => space.status !== "archived")
          .map((space) => safeMoveSpace(space)),
        args.query,
      ),
    );
  }

  if (args.method === "POST" && !spaceIdSegment) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const name = requiredBodyString(body.name, "name is required.");
    const kind = parseMoveSpaceKind(body.kind) ?? "custom";
    const spaceId = await ctx.db.insert("moveSpaces", {
      householdId: auth.householdId,
      moveId,
      kind,
      name,
      aliases: parseStringArray(body.aliases) ?? [],
      notes: normalizeOptionalText(asString(body.notes)),
      floorLevel: normalizeOptionalText(asString(body.floorLevel)),
      sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
      status: "active",
      transportResourceId: optionalString(body.transportResourceId) as
        | Id<"transportResources">
        | undefined,
      transportZoneId: optionalString(body.transportZoneId) as
        | Id<"transportZones">
        | undefined,
      linkedPlanEntityId: optionalString(body.linkedPlanEntityId) as
        | Id<"planEntities">
        | undefined,
      capacity: parseCapacity(body.capacity) ?? {},
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      updatedByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await auditApiWrite(ctx, auth, moveId, "space.api_created", "moveSpaces", spaceId, {
      name,
      kind,
    });
    const created = await ctx.db.get(spaceId);
    return restOk({ data: created ? safeMoveSpace(created) : { spaceId } }, 201);
  }

  if ((args.method === "PATCH" || args.method === "PUT") && spaceIdSegment) {
    const spaceId = spaceIdSegment as Id<"moveSpaces">;
    const space = await ctx.db.get(spaceId);
    if (!space || space.householdId !== auth.householdId || space.moveId !== moveId) {
      return restError({ status: 404, code: "not_found", message: "Space not found." });
    }
    const body = bodyObject(args.body);
    const patch: Partial<Doc<"moveSpaces">> = {
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: Date.now(),
    };
    if (body.kind !== undefined) patch.kind = parseMoveSpaceKind(body.kind) ?? space.kind;
    if (body.name !== undefined) patch.name = requiredBodyString(body.name, "name cannot be empty.");
    if (body.aliases !== undefined) patch.aliases = parseStringArray(body.aliases) ?? [];
    if (body.notes !== undefined) patch.notes = normalizeOptionalText(asString(body.notes));
    if (body.floorLevel !== undefined) {
      patch.floorLevel = normalizeOptionalText(asString(body.floorLevel));
    }
    if (body.sortOrder !== undefined) patch.sortOrder = normalizeSortOrder(optionalNumber(body.sortOrder));
    if (body.status !== undefined) {
      patch.status = parseMoveSpaceStatus(body.status) ?? space.status;
      patch.archivedAt = patch.status === "archived" ? Date.now() : undefined;
    }
    if (body.capacity !== undefined) patch.capacity = parseCapacity(body.capacity) ?? {};
    await ctx.db.patch(spaceId, patch);
    await auditApiWrite(ctx, auth, moveId, "space.api_updated", "moveSpaces", spaceId, {
      changedKeys: Object.keys(patch),
    });
    const updated = await ctx.db.get(spaceId);
    return restOk({ data: updated ? safeMoveSpace(updated) : { spaceId } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Space route not found.",
  });
}

async function routeSaleListings(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  listingIdSegment?: string
) {
  if (args.method === "GET" && !listingIdSegment) {
    const [listings, items, photos] = await Promise.all([
      ctx.db
        .query("saleListings")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_disposition", (q) =>
          q.eq("moveId", moveId).eq("disposition", "sell"),
        )
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
        .collect(),
    ]);
    const listingByItemId = new Map(
      listings
        .filter((listing) => listing.householdId === auth.householdId)
        .filter((listing) => !listing.archivedAt)
        .map((listing) => [String(listing.itemId), listing]),
    );
    const photoCounts = new Map<string, number>();
    for (const photo of photos) {
      if (photo.householdId !== auth.householdId || photo.archivedAt || !photo.itemId) {
        continue;
      }
      photoCounts.set(
        String(photo.itemId),
        (photoCounts.get(String(photo.itemId)) ?? 0) + 1,
      );
    }
    return restOk(
      paginate(
        items
          .filter((item) => item.householdId === auth.householdId && !item.deletedAt)
          .map((item) => ({
            item: safeItem(item),
            photoCount: photoCounts.get(String(item._id)) ?? 0,
            listing: listingByItemId.get(String(item._id))
              ? safeSaleListing(listingByItemId.get(String(item._id))!)
              : undefined,
          })),
        args.query,
      ),
    );
  }

  if (args.method === "POST" && !listingIdSegment) {
    const body = bodyObject(args.body);
    const itemId = requiredBodyString(body.itemId, "itemId is required.") as Id<"items">;
    const item = await ctx.db.get(itemId);
    if (!item || item.householdId !== auth.householdId || item.moveId !== moveId || item.deletedAt) {
      return restError({ status: 404, code: "not_found", message: "Item not found." });
    }
    const existing = (
      await ctx.db
        .query("saleListings")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect()
    ).find((listing) => !listing.archivedAt);
    const patch = saleListingPatchFromBody(body, auth);
    const now = Date.now();
    let listingId: Id<"saleListings">;
    if (existing) {
      listingId = existing._id;
      await ctx.db.patch(listingId, {
        ...patch,
        updatedByApiKeyId: auth.apiKeyId,
        updatedAt: now,
      });
    } else {
      listingId = await ctx.db.insert("saleListings", {
        householdId: auth.householdId,
        moveId,
        itemId,
        status: "needsPrep",
        platform: "facebookMarketplace",
        listingTitle: item.name,
        listingDescription: item.description,
        category: item.category,
        condition: item.condition === "unknown" ? undefined : item.condition,
        locationLabel: item.room,
        selectedPhotoIds: [],
        currency: "USD",
        pricingConfidence: "none",
        userOverrodePrice: false,
        researchDepth: "none",
        researchSourceCount: 0,
        researchSources: [],
        interestedCount: 0,
        needsMorePhotos: true,
        createdByApiKeyId: auth.apiKeyId,
        updatedByApiKeyId: auth.apiKeyId,
        createdAt: now,
        updatedAt: now,
        ...patch,
      });
      if (item.disposition !== "sell") {
        await ctx.db.patch(itemId, {
          disposition: "sell",
          updatedByUserId: item.updatedByUserId,
          updatedAt: now,
        });
      }
    }
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      existing ? "sale_listing.api_updated" : "sale_listing.api_created",
      "saleListings",
      listingId,
      { itemId },
    );
    const listing = await ctx.db.get(listingId);
    return restOk({ data: listing ? safeSaleListing(listing) : { listingId } }, existing ? 200 : 201);
  }

  if ((args.method === "PATCH" || args.method === "PUT") && listingIdSegment) {
    const listingId = listingIdSegment as Id<"saleListings">;
    const listing = await ctx.db.get(listingId);
    if (!listing || listing.householdId !== auth.householdId || listing.moveId !== moveId || listing.archivedAt) {
      return restError({
        status: 404,
        code: "not_found",
        message: "Sale listing not found.",
      });
    }
    const patch = saleListingPatchFromBody(bodyObject(args.body), auth);
    await ctx.db.patch(listingId, {
      ...patch,
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: Date.now(),
    });
    await auditApiWrite(ctx, auth, moveId, "sale_listing.api_updated", "saleListings", listingId, {
      changedKeys: Object.keys(patch),
    });
    const updated = await ctx.db.get(listingId);
    return restOk({ data: updated ? safeSaleListing(updated) : { listingId } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Sale listing route not found.",
  });
}

async function routeCapacityReport(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, assignments, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const activeAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId
  );
  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const itemById = new Map(activeItems.map((item) => [item._id, item]));
  const assignmentsByBoxId = new Map<Id<"boxes">, Doc<"boxItems">[]>();
  for (const assignment of activeAssignments) {
    const existing = assignmentsByBoxId.get(assignment.boxId) ?? [];
    existing.push(assignment);
    assignmentsByBoxId.set(assignment.boxId, existing);
  }

  const itemEstimates = activeItems.map((item) => ({
    itemId: item._id,
    name: item.name,
    room: item.room,
    disposition: item.disposition,
    estimate: estimateItem(item),
  }));
  const totalEstimatedWeightLb = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.weight)
  );
  const totalEstimatedVolumeCuFt = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.volume)
  );

  const boxReports = activeBoxes.map((box) => {
    const boxAssignments = assignmentsByBoxId.get(box._id) ?? [];
    const contentEstimates = boxAssignments
      .map((assignment) => {
        const item = itemById.get(assignment.itemId);
        return item
          ? estimateItem({
              ...item,
              quantity: assignment.quantity,
            })
          : null;
      })
      .filter((estimate): estimate is NonNullable<typeof estimate> =>
        Boolean(estimate)
      );
    const contentsWeight = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.weight)
    );
    const contentsVolume = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.volume)
    );
    const weightSummary = resolveBoxWeight({
      actualWeightLb: box.actualWeightLb,
      estimatedWeightLb: box.estimatedWeightLb,
      contentsEstimatedWeightLb: contentsWeight,
    });
    const estimatedWeightLb = weightSummary.valueLb ?? 0;
    const estimatedVolumeCuFt = box.estimatedVolumeCuFt ?? contentsVolume;
    const warnings: string[] = [];
    if (weightSummary.source === "missing") {
      warnings.push("missingBoxWeightEstimate");
    }
    if (!box.estimatedVolumeCuFt && contentsVolume === 0) {
      warnings.push("missingBoxVolumeEstimate");
    }
    if (estimatedWeightLb > 65) {
      warnings.push("overweightBox");
    }

    return {
      boxId: box._id,
      code: box.code,
      label: box.label,
      room: box.room,
      assignedResourceId: box.assignedResourceId,
      assignedZoneId: box.assignedZoneId,
      itemCount: boxAssignments.reduce(
        (sum, assignment) => sum + assignment.quantity,
        0
      ),
      estimatedWeightLb: roundEstimate(estimatedWeightLb),
      weightSource: weightSummary.source,
      weightSourceLabel: weightSummary.label,
      weightSummary,
      estimatedVolumeCuFt: roundEstimate(estimatedVolumeCuFt),
      assignmentLocked: box.assignmentLocked ?? false,
      assignmentWarnings: box.assignmentWarnings ?? [],
      assignmentHardBlocks: box.assignmentHardBlocks ?? [],
      warnings,
    };
  });

  const resourceReports = activeResources.map((resource) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedResourceId === resource._id
    );
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0)
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0)
    );
    return {
      resourceId: resource._id,
      name: resource.name,
      type: resource.type,
      estimatedWeightLb,
      estimatedVolumeCuFt,
      maxWeightLb: resource.capacity.maxWeightLb,
      maxVolumeCuFt: resource.capacity.maxVolumeCuFt,
      weightPercent: capacityPercent({
        used: estimatedWeightLb,
        max: resource.capacity.maxWeightLb,
        unlimited: resource.capacity.weightIsUnlimited,
      }),
      volumePercent: capacityPercent({
        used: estimatedVolumeCuFt,
        max: resource.capacity.maxVolumeCuFt,
        unlimited: resource.capacity.volumeIsUnlimited,
      }),
      assignedBoxCount: assignedBoxes.length,
      warningCount: assignedBoxes.reduce(
        (sum, box) =>
          sum +
          box.warnings.length +
          box.assignmentWarnings.length +
          box.assignmentHardBlocks.length,
        0
      ),
    };
  });

  const zoneReports = activeZones.map((zone) => {
    const assignedBoxes = boxReports.filter((box) => box.assignedZoneId === zone._id);
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0)
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0)
    );
    return {
      zoneId: zone._id,
      resourceId: zone.resourceId,
      name: zone.name,
      estimatedWeightLb,
      estimatedVolumeCuFt,
      maxWeightLb: zone.capacity.maxWeightLb,
      maxVolumeCuFt: zone.capacity.maxVolumeCuFt,
      weightPercent: capacityPercent({
        used: estimatedWeightLb,
        max: zone.capacity.maxWeightLb,
        unlimited: zone.capacity.weightIsUnlimited,
      }),
      volumePercent: capacityPercent({
        used: estimatedVolumeCuFt,
        max: zone.capacity.maxVolumeCuFt,
        unlimited: zone.capacity.volumeIsUnlimited,
      }),
      assignedBoxCount: assignedBoxes.length,
    };
  });

  return restOk({
    data: {
      moveId: move._id,
      moveAllowanceLb: move.moveLevelWeightAllowanceLb,
      totalEstimatedWeightLb,
      totalEstimatedVolumeCuFt,
      allowancePercent: capacityPercent({
        used: totalEstimatedWeightLb,
        max: move.moveLevelWeightAllowanceLb,
      }),
      missingWeightCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingWeightEstimate")
      ).length,
      missingVolumeCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingVolumeEstimate")
      ).length,
      unassignedBoxCount: boxReports.filter((box) => !box.assignedResourceId)
        .length,
      boxReports,
      resourceReports,
      zoneReports,
      itemEstimates: itemEstimates.slice(0, 100),
      generatedAt: Date.now(),
    },
  });
}

async function routeTransportResources(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  resourceIdSegment?: string,
  actionSegment?: string
) {
  if (actionSegment === "zones" && resourceIdSegment) {
    await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    if (args.method === "GET") {
      const zones = await ctx.db
        .query("transportZones")
        .withIndex("by_resource_sort", (q) =>
          q.eq("resourceId", resourceIdSegment as Id<"transportResources">)
        )
        .collect();
      return restOk(
        paginate(
          zones
            .filter((zone) => zone.householdId === auth.householdId)
            .filter((zone) => !zone.archivedAt)
            .map((zone) => safeTransportZone(zone)),
          args.query
        )
      );
    }
    if (args.method === "POST") {
      const body = bodyObject(args.body);
      const zoneId = await createApiTransportZone(ctx, auth, moveId, {
        ...body,
        resourceId: resourceIdSegment,
      });
      const zone = await ctx.db.get(zoneId);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "transport_zone.api_created",
        "transportZones",
        zoneId,
        { resourceId: resourceIdSegment, name: zone?.name }
      );
      return restOk({ data: { zone: zone ? safeTransportZone(zone) : { zoneId } } }, 201);
    }
  }

  if (args.method === "GET" && !resourceIdSegment) {
    const resources = await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        resources
          .filter((entry) => entry.householdId === auth.householdId)
          .filter((entry) => !entry.archivedAt)
          .map((entry) => safeTransportResource(entry)),
        args.query
      )
    );
  }

  if (args.method === "GET" && resourceIdSegment && !actionSegment) {
    const resource = await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    return restOk({ data: safeTransportResource(resource) });
  }

  if (args.method === "POST" && !resourceIdSegment) {
    return await createApiTransportResource(ctx, args, auth, moveId);
  }

  if (args.method === "PATCH" && resourceIdSegment && !actionSegment) {
    const resource = await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    const patch = transportResourcePatch(args.body, auth);
    await ctx.db.patch(resource._id, patch);
    const updated = await ctx.db.get(resource._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_resource.api_updated",
      "transportResources",
      resource._id,
      { changedKeys: Object.keys(patch) }
    );
    return restOk({
      data: updated ? safeTransportResource(updated) : { resourceId: resource._id },
    });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Resource route not found.",
  });
}

async function routeTransportZones(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  zoneIdSegment?: string
) {
  if (args.method === "GET" && !zoneIdSegment) {
    const zones = await ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        zones
          .filter((entry) => entry.householdId === auth.householdId)
          .filter((entry) => !entry.archivedAt)
          .map((entry) => safeTransportZone(entry)),
        args.query
      )
    );
  }

  if (args.method === "GET" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment
    );
    return restOk({ data: safeTransportZone(zone) });
  }

  if (args.method === "POST" && !zoneIdSegment) {
    const zoneId = await createApiTransportZone(
      ctx,
      auth,
      moveId,
      bodyObject(args.body)
    );
    const zone = await ctx.db.get(zoneId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_created",
      "transportZones",
      zoneId,
      { resourceId: zone?.resourceId, name: zone?.name }
    );
    return restOk({ data: { zone: zone ? safeTransportZone(zone) : { zoneId } } }, 201);
  }

  if (args.method === "PATCH" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment
    );
    const patch = await transportZonePatch(ctx, auth.householdId, moveId, args.body);
    await ctx.db.patch(zone._id, patch);
    const updated = await ctx.db.get(zone._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_updated",
      "transportZones",
      zone._id,
      { changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeTransportZone(updated) : { zoneId: zone._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Zone route not found.",
  });
}

async function routeMovePeople(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  personIdSegment?: string
) {
  if (args.method === "GET" && !personIdSegment) {
    const includeArchived = args.query.includeArchived === "true";
    const people = await ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        people
          .filter((person) => person.householdId === auth.householdId)
          .filter((person) => includeArchived || !person.archivedAt)
          .map((person) => safeMovePerson(person)),
        args.query
      )
    );
  }

  if (args.method === "GET" && personIdSegment) {
    const person = await requireApiMovePerson(
      ctx,
      auth.householdId,
      moveId,
      personIdSegment,
      args.query.includeArchived === "true"
    );
    return restOk({ data: safeMovePerson(person) });
  }

  if (args.method === "POST" && !personIdSegment) {
    const body = bodyObject(args.body);
    const name = normalizeOptionalText(asString(body.name));
    if (!name) {
      throw new Error("name is required.");
    }
    const role = parseMovePersonRole(body.role) ?? "contact";
    const now = Date.now();
    const personId = await ctx.db.insert("movePeople", {
      householdId: auth.householdId,
      moveId,
      name,
      role,
      email: normalizeOptionalText(asString(body.email)),
      phone: normalizeOptionalText(asString(body.phone)),
      notes: normalizeOptionalText(asString(body.notes)),
      sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    const person = await ctx.db.get(personId);
    await auditApiMovePerson(ctx, auth, moveId, "move_person.api_created", personId, {
      role,
      name,
    });
    return restOk(
      { data: person ? safeMovePerson(person) : { personId } },
      201
    );
  }

  if (args.method === "PATCH" && personIdSegment) {
    const person = await requireApiMovePerson(
      ctx,
      auth.householdId,
      moveId,
      personIdSegment,
      true
    );
    const patch = movePersonPatch(args.body, auth);
    await ctx.db.patch(person._id, patch);
    const updated = await ctx.db.get(person._id);
    await auditApiMovePerson(
      ctx,
      auth,
      moveId,
      "move_person.api_updated",
      person._id,
      { changedKeys: Object.keys(patch) }
    );
    return restOk({
      data: updated ? safeMovePerson(updated) : { personId: person._id },
    });
  }

  if (args.method === "DELETE" && personIdSegment) {
    const person = await requireApiMovePerson(
      ctx,
      auth.householdId,
      moveId,
      personIdSegment,
      true
    );
    const now = Date.now();
    await ctx.db.patch(person._id, {
      archivedAt: person.archivedAt ?? now,
      updatedByUserId: auth.createdByUserId,
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: now,
    });
    await auditApiMovePerson(
      ctx,
      auth,
      moveId,
      "move_person.api_archived",
      person._id
    );
    const updated = await ctx.db.get(person._id);
    return restOk({
      data: updated ? safeMovePerson(updated) : { personId: person._id },
    });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Move people route not found.",
  });
}

async function routeItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  itemIdSegment?: string
) {
  if (args.method === "GET" && !itemIdSegment) {
    const items = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        items
          .filter((item) => !item.deletedAt)
          .filter((item) =>
            args.query.status ? item.status === args.query.status : true
          )
          .filter((item) =>
            args.query.disposition
              ? item.disposition === args.query.disposition
              : true
          )
          .map((item) => safeItem(item)),
        args.query
      )
    );
  }

  if (args.method === "GET" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    return restOk({ data: safeItem(item) });
  }

  if (args.method === "POST" && itemIdSegment === "batch-upsert") {
    return await routeBatchUpsertItems(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    await assertExternalItemKeyAvailable(ctx, auth.householdId, moveId, body);
    const { itemId, name } = await createApiItem(ctx, auth, moveId, body);
    await auditApiWrite(ctx, auth, moveId, "item.api_created", "items", itemId, {
      name,
      externalSource: externalItemKeyFromInput(body)?.externalSource,
    });
    return restOk({ data: { itemId } }, 201);
  }

  if (args.method === "PATCH" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    await assertExternalItemKeyAvailable(
      ctx,
      auth.householdId,
      moveId,
      args.body,
      item._id
    );
    const patch = itemPatch(args.body, auth, item);
    await ctx.db.patch(item._id, patch);
    await auditApiWrite(ctx, auth, moveId, "item.api_updated", "items", item._id, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { itemId: item._id, ...patch } });
  }

  return restError({ status: 404, code: "not_found", message: "Item route not found." });
}

async function routePlannedItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  plannedItemIdSegment?: string,
  action?: string
) {
  if (args.method === "GET" && !plannedItemIdSegment) {
    const includeArchived = args.query.includeArchived === "true";
    const plannedItems = await ctx.db
      .query("plannedItems")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        plannedItems
          .filter((plannedItem) => plannedItem.householdId === auth.householdId)
          .filter((plannedItem) => includeArchived || !plannedItem.archivedAt)
          .map((plannedItem) => safePlannedItem(plannedItem)),
        args.query,
      ),
    );
  }

  if (args.method === "GET" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      args.query.includeArchived === "true",
    );
    return restOk({ data: safePlannedItem(plannedItem) });
  }

  if (args.method === "POST" && !plannedItemIdSegment) {
    const body = bodyObject(args.body);
    const name = normalizeItemName(String(body.name ?? ""));
    if (!name) {
      throw new Error("name is required.");
    }
    const now = Date.now();
    const plannedItemId = await ctx.db.insert("plannedItems", {
      householdId: auth.householdId,
      moveId,
      name,
      normalizedName: normalizedSearchName(name),
      category: normalizeOptionalText(asString(body.category)),
      subcategory: normalizeOptionalText(asString(body.subcategory)),
      description: normalizeOptionalText(asString(body.description)),
      dimensionsIn: parseDimensionsIn(body.dimensionsIn),
      dimensionsConfidence: parsePlanningConfidence(
        body.dimensionsConfidence,
        "dimensionsConfidence",
      ),
      estimatedPriceCents: optionalNumber(body.estimatedPriceCents),
      url: normalizeOptionalText(asString(body.url)),
      priority: normalizePlannedItemPriority(optionalNumber(body.priority)),
      notes: normalizeOptionalText(asString(body.notes)),
      status: parsePlannedItemStatus(body.status) ?? "idea",
      createdVia: "api",
      createdByUserId: auth.createdByUserId,
      updatedByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_created",
      "plannedItems",
      plannedItemId,
      { name },
    );
    return restOk({ data: { plannedItemId } }, 201);
  }

  if (args.method === "PATCH" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const patch = plannedItemPatch(args.body, auth.createdByUserId);
    await ctx.db.patch(plannedItem._id, patch);
    const updated = await ctx.db.get(plannedItem._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_updated",
      "plannedItems",
      plannedItem._id,
      { changedKeys: Object.keys(patch) },
    );
    return restOk({
      data: updated ? safePlannedItem(updated) : { plannedItemId: plannedItem._id },
    });
  }

  if (args.method === "POST" && plannedItemIdSegment && action === "convert") {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const result = await convertApiPlannedItem(ctx, auth, plannedItem);
    return restOk({ data: result }, 201);
  }

  if (args.method === "DELETE" && plannedItemIdSegment) {
    const plannedItem = await requireApiPlannedItem(
      ctx,
      auth.householdId,
      moveId,
      plannedItemIdSegment,
      false,
    );
    const now = Date.now();
    await ctx.db.patch(plannedItem._id, {
      archivedAt: now,
      updatedAt: now,
      updatedByUserId: auth.createdByUserId,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "planned_item.api_archived",
      "plannedItems",
      plannedItem._id,
      {},
    );
    return restOk({ data: { plannedItemId: plannedItem._id, archivedAt: now } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Planned item route not found.",
  });
}

async function routeBatchUpsertItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const rows = Array.isArray(body.items) ? body.items : [];
  const dryRun = Boolean(body.dryRun);
  if (!rows.length) {
    return restError({
      status: 400,
      code: "invalid_batch",
      message: "items must include at least one row.",
    });
  }
  if (rows.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Batch item imports are limited to ${maxBatchUpsertItems} rows.`,
    });
  }

  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = bodyObject(row);
    let itemId = optionalString(input.itemId);
    try {
      const externalKey = externalItemKeyFromInput(input);
      const externalMatch =
        !itemId && externalKey
          ? await findApiItemByExternalKey(ctx, auth.householdId, moveId, externalKey)
          : null;
      itemId = itemId ?? externalMatch?._id;
      if (itemId) {
        const item = await requireApiItem(ctx, auth.householdId, moveId, itemId);
        const patch = itemPatch(input, auth, item);
        if (
          externalKey &&
          (item.externalSource !== externalKey.externalSource ||
            item.externalId !== externalKey.externalId)
        ) {
          await assertExternalItemKeyAvailable(
            ctx,
            auth.householdId,
            moveId,
            input,
            item._id
          );
        }
        if (!dryRun) {
          await ctx.db.patch(item._id, patch);
          await auditApiWrite(
            ctx,
            auth,
            moveId,
            "item.api_batch_updated",
            "items",
            item._id,
            { rowIndex: index, changedKeys: Object.keys(patch) }
          );
        }
        results.push({
          index,
          ok: true,
          action: "update",
          itemId: item._id,
          externalSource: item.externalSource ?? externalKey?.externalSource,
          externalId: item.externalId ?? externalKey?.externalId,
          changedKeys: Object.keys(patch),
          matchedBy: externalMatch ? "externalKey" : "itemId",
          dryRun,
        });
        continue;
      }

      const name = normalizeItemName(String(input.name ?? ""));
      if (!name) {
        throw new Error("name is required when creating an item.");
      }
      if (dryRun) {
        results.push({
          index,
          ok: true,
          action: "create",
          name,
          dryRun,
        });
        continue;
      }
      const created = await createApiItem(ctx, auth, moveId, input);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_batch_created",
        "items",
        created.itemId,
        { rowIndex: index, name: created.name }
      );
      results.push({
        index,
        ok: true,
        action: "create",
        itemId: created.itemId,
        name: created.name,
        externalSource: created.externalSource,
        externalId: created.externalId,
        dryRun,
      });
    } catch (error) {
      results.push({
        index,
        ok: false,
        action: itemId ? "update" : "create",
        itemId: itemId || undefined,
        error: error instanceof Error ? error.message : "Row failed.",
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;

  return restOk(
    {
      data: {
        dryRun,
        total: rows.length,
        succeeded: results.filter((result) => result.ok).length,
        failed,
        results,
      },
    },
    failed > 0 ? 207 : 200
  );
}

async function routeBoxes(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  boxIdSegment?: string
) {
  if (args.method === "GET" && !boxIdSegment) {
    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        boxes.filter((box) => !box.archivedAt).map((box) => safeBox(box)),
        args.query
      )
    );
  }

  if (args.method === "GET" && boxIdSegment) {
    const box = await requireApiBox(ctx, auth.householdId, moveId, boxIdSegment);
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "POST" && !boxIdSegment) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const code = body.code ? normalizeBoxCode(String(body.code)) : `API-${now}`;
    const boxId = await ctx.db.insert("boxes", {
      householdId: auth.householdId,
      moveId,
      code,
      label: normalizeOptionalText(asString(body.label)),
      room: normalizeOptionalText(asString(body.room)),
      destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
      description: normalizeOptionalText(asString(body.description)),
      status: parseBoxStatus(body.status) ?? "open",
      estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
      actualWeightLb: optionalNumber(body.actualWeightLb),
      estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
      assignmentLocked: false,
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: now,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    await auditApiWrite(ctx, auth, moveId, "box.api_created", "boxes", boxId, {
      code,
    });
    return restOk({ data: { boxId } }, 201);
  }

  if (args.method === "PATCH" && boxIdSegment) {
    const box = await requireApiBox(ctx, auth.householdId, moveId, boxIdSegment);
    const patch = boxPatch(args.body);
    await ctx.db.patch(box._id, patch);
    await auditApiWrite(ctx, auth, moveId, "box.api_updated", "boxes", box._id, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { boxId: box._id, ...patch } });
  }

  return restError({ status: 404, code: "not_found", message: "Box route not found." });
}

async function routeAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  assignmentIdSegment?: string
) {
  if (args.method === "POST" && assignmentIdSegment === "suggest") {
    return await routeAssignmentSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && assignmentIdSegment === "apply") {
    return await routeApplyAssignments(ctx, args, auth, moveId);
  }

  if (args.method === "GET") {
    const assignments = await ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        assignments.map((assignment) => ({
          assignmentId: assignment._id,
          boxId: assignment.boxId,
          itemId: assignment.itemId,
          quantity: assignment.quantity,
          notes: assignment.notes,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        })),
        args.query
      )
    );
  }

  if ((args.method === "POST" || args.method === "PUT") && !assignmentIdSegment) {
    const body = bodyObject(args.body);
    const boxId = String(body.boxId ?? "") as Id<"boxes">;
    const itemId = String(body.itemId ?? "") as Id<"items">;
    await requireApiBox(ctx, auth.householdId, moveId, boxId);
    await requireApiItem(ctx, auth.householdId, moveId, itemId);
    const now = Date.now();
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect();
    const current = existing.find((entry) => entry.moveId === moveId);
    const patch = {
      boxId,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      updatedAt: now,
    };
    if (current) {
      await ctx.db.patch(current._id, patch);
      return restOk({ data: { assignmentId: current._id } });
    }
    const assignmentId = await ctx.db.insert("boxItems", {
      householdId: auth.householdId,
      moveId,
      itemId,
      ...patch,
      createdAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_upserted",
      "boxItems",
      assignmentId,
      { boxId, itemId }
    );
    return restOk({ data: { assignmentId } }, 201);
  }

  if (args.method === "DELETE" && assignmentIdSegment) {
    const assignmentId = assignmentIdSegment as Id<"boxItems">;
    const assignment = await ctx.db.get(assignmentId);
    if (
      !assignment ||
      assignment.moveId !== moveId ||
      assignment.householdId !== auth.householdId
    ) {
      throw new Error("Assignment not found.");
    }
    await ctx.db.delete(assignmentId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_deleted",
      "boxItems",
      assignmentId
    );
    return restOk({ data: { deleted: true } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Assignment route not found.",
  });
}

async function routeAssignmentSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const limit = boundedInteger(body.limit, 1, 100, 50);
  const [boxes, resources, zones] = await Promise.all([
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
  ]);
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const suggestions = [];

  for (const box of activeBoxes) {
    if (suggestions.length >= limit) break;
    const loadableBox = await loadableApiBoxFor(ctx, box);
    const suggestion = suggestAssignmentForBox({
      box: {
        ...loadableBox,
        boxId: box._id,
        code: box.code,
        assignedResourceId: box.assignedResourceId,
        assignmentLocked: box.assignmentLocked,
      },
      resources: activeResources.map((resource) => ({
        resourceId: resource._id,
        type: resource.type,
        name: resource.name,
        capacity: resource.capacity,
      })),
      zones: activeZones.map((zone) => ({
        zoneId: zone._id,
        resourceId: zone.resourceId,
        name: zone.name,
        capacity: zone.capacity,
      })),
    });
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return restOk({
    data: {
      suggestions,
      counts: {
        boxesConsidered: activeBoxes.length,
        resourcesConsidered: activeResources.length,
        zonesConsidered: activeZones.length,
        suggestions: suggestions.length,
      },
      generatedAt: Date.now(),
    },
  });
}

async function routeApplyAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const dryRun = Boolean(body.dryRun);
  const rows = Array.isArray(body.assignments) ? body.assignments : [];
  if (!rows.length) {
    return restError({
      status: 400,
      code: "invalid_assignments",
      message: "assignments must include at least one row.",
    });
  }
  if (rows.length > 100) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: "Assignment apply requests are limited to 100 rows.",
    });
  }

  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = bodyObject(row);
    const boxId = optionalString(input.boxId);
    const assignedResourceId = optionalString(input.assignedResourceId);
    const assignedZoneId = optionalString(input.assignedZoneId);
    const overrideReason = normalizeOptionalText(asString(input.overrideReason));
    try {
      if (!boxId) throw new Error("boxId is required.");
      if (!assignedResourceId) throw new Error("assignedResourceId is required.");
      const box = await requireApiBox(ctx, auth.householdId, moveId, boxId);
      if (box.assignmentLocked) {
        throw new Error("Locked assignments must be changed manually.");
      }
      const validation = await validateApiBoxAssignment(ctx, {
        householdId: auth.householdId,
        moveId,
        box,
        assignedResourceId,
        assignedZoneId,
        overrideReason,
      });
      if (!dryRun) {
        await ctx.db.patch(box._id, {
          assignedResourceId: assignedResourceId as Id<"transportResources">,
          assignedZoneId: assignedZoneId as Id<"transportZones"> | undefined,
          assignmentOverrideReason: overrideReason,
          assignmentWarnings: validation.softWarnings,
          assignmentHardBlocks: validation.hardBlocks,
          assignmentValidatedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await auditApiWrite(
          ctx,
          auth,
          moveId,
          "assignment.api_applied",
          "boxes",
          box._id,
          {
            rowIndex: index,
            assignedResourceId,
            assignedZoneId,
            warningCount: validation.softWarnings.length,
          }
        );
      }
      results.push({
        index,
        ok: true,
        boxId: box._id,
        assignedResourceId,
        assignedZoneId: assignedZoneId || undefined,
        assignmentWarnings: validation.softWarnings,
        assignmentHardBlocks: validation.hardBlocks,
        dryRun,
      });
    } catch (error) {
      results.push({
        index,
        ok: false,
        boxId: boxId || undefined,
        assignedResourceId: assignedResourceId || undefined,
        assignedZoneId: assignedZoneId || undefined,
        error: error instanceof Error ? error.message : "Assignment failed.",
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return restOk(
    {
      data: {
        dryRun,
        total: rows.length,
        succeeded: rows.length - failed,
        failed,
        results,
      },
    },
    failed > 0 ? 207 : 200
  );
}

async function routePlanningSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET") {
    const suggestions = await ctx.db
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    const status = parsePlanningSuggestionStatus(args.query.status);
    const visibleSuggestions = suggestions.filter(
      (suggestion) =>
        suggestion.householdId === auth.householdId &&
        (status ? suggestion.status === status : true)
    );
    if (suggestionIdSegment && !actionSegment) {
      const suggestion = visibleSuggestions.find(
        (entry) => entry._id === suggestionIdSegment
      );
      if (!suggestion) {
        throw new Error("AI planning suggestion not found.");
      }
      return restOk({ data: safePlanningSuggestion(suggestion) });
    }
    if (!suggestionIdSegment) {
      return restOk(
        paginate(visibleSuggestions.map((entry) => safePlanningSuggestion(entry)), args.query)
      );
    }
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "generate" &&
    !actionSegment
  ) {
    const result = await createPlanningSuggestionsForMove(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
    });
    const suggestions = await Promise.all(
      result.suggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
    );
    return restOk(
      {
        data: {
          aiJobId: result.aiJobId,
          suggestionIds: result.suggestionIds,
          suggestions: suggestions
            .filter((entry): entry is Doc<"aiPlanningSuggestions"> => Boolean(entry))
            .map((entry) => safePlanningSuggestion(entry)),
        },
      },
      201
    );
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "approve" &&
    !actionSegment
  ) {
    const approvals = parsePlanningApprovals(args.body);
    const result = await approvePlanningSuggestions(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
      approvals,
    });
    return restOk({ data: result });
  }

  if (
    args.method === "POST" &&
    suggestionIdSegment === "reject" &&
    !actionSegment
  ) {
    const body = bodyObject(args.body);
    const suggestionIds = parseIdArray(body.suggestionIds).map(
      (suggestionId) => suggestionId as Id<"aiPlanningSuggestions">
    );
    if (!suggestionIds.length) {
      return restError({
        status: 400,
        code: "invalid_suggestions",
        message: "suggestionIds must include at least one suggestion ID.",
      });
    }
    const result = await rejectPlanningSuggestions(ctx, {
      householdId: auth.householdId,
      moveId,
      actor: {
        type: "apiKey",
        userId: auth.createdByUserId,
        apiKeyId: auth.apiKeyId,
      },
      suggestionIds,
    });
    return restOk({ data: result });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Planning suggestion route not found.",
  });
}

async function routeAiJobs(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  aiJobIdSegment?: string
) {
  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI job route not found.",
    });
  }

  if (aiJobIdSegment === "provider-status") {
    return restOk({
      data: {
        ...getAiProviderStatus(),
        generatedAt: Date.now(),
      },
    });
  }

  const jobs = await ctx.db
    .query("aiJobs")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiJobStatus(args.query.status);
  const visibleJobs = jobs.filter(
    (job) =>
      job.householdId === auth.householdId &&
      (status ? job.status === status : true)
  );

  if (aiJobIdSegment) {
    const job = visibleJobs.find((entry) => entry._id === aiJobIdSegment);
    if (!job) {
      throw new Error("AI job not found.");
    }
    return restOk({ data: safeAiJob(job) });
  }

  return restOk(paginate(visibleJobs.map((job) => safeAiJob(job)), args.query));
}

async function routeAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string
) {
  if (args.method === "POST" && suggestionIdSegment === "generate") {
    return await routeGenerateAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "approve") {
    return await routeApproveAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "reject") {
    return await routeRejectAiTextSuggestions(ctx, args, auth, moveId);
  }

  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI text suggestion route not found.",
    });
  }

  const suggestions = await ctx.db
    .query("aiTextSuggestions")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiSuggestionStatus(args.query.status);
  const visibleSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.householdId === auth.householdId &&
      (status ? suggestion.status === status : true)
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment
    );
    if (!suggestion) {
      throw new Error("AI text suggestion not found.");
    }
    return restOk({ data: safeAiTextSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiTextSuggestion(suggestion)),
      args.query
    )
  );
}

async function routeAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string
) {
  if (args.method === "POST" && suggestionIdSegment === "generate") {
    return await routeGenerateAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "approve") {
    return await routeApproveAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && suggestionIdSegment === "reject") {
    return await routeRejectAiPhotoSuggestions(ctx, args, auth, moveId);
  }

  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "AI photo suggestion route not found.",
    });
  }

  const suggestions = await ctx.db
    .query("aiPhotoSuggestions")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const status = parseAiSuggestionStatus(args.query.status);
  const visibleSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.householdId === auth.householdId &&
      (status ? suggestion.status === status : true)
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment
    );
    if (!suggestion) {
      throw new Error("AI photo suggestion not found.");
    }
    return restOk({ data: safeAiPhotoSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiPhotoSuggestion(suggestion)),
      args.query
    )
  );
}

type RestAiTextItemDraft = NonNullable<Doc<"aiTextSuggestions">["itemDraft"]>;
type RestAiTextBoxDraft = NonNullable<Doc<"aiTextSuggestions">["boxDraft"]>;
type RestAiPhotoItemDraft = NonNullable<Doc<"aiPhotoSuggestions">["itemDraft"]>;
type RestAiPhotoBoxDraft = NonNullable<Doc<"aiPhotoSuggestions">["boxDraft"]>;

type RestAiTextApproval = {
  suggestionId: Id<"aiTextSuggestions">;
  itemDraft?: RestAiTextItemDraft;
  boxDraft?: RestAiTextBoxDraft;
};

type RestAiPhotoApproval = {
  suggestionId: Id<"aiPhotoSuggestions">;
  itemDraft?: RestAiPhotoItemDraft;
  boxDraft?: RestAiPhotoBoxDraft;
};

async function routeGenerateAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const sourceText = parseAiTextGenerationSource(args.body);
  await assertAiUsageAllowed(ctx, {
    householdId: auth.householdId,
    moveId,
    userId: auth.createdByUserId,
    inputSizeBytes: inputBytesFromText(sourceText),
    estimatedCents: 0,
  });

  const parsed = parseTextIntakeSuggestions(sourceText).slice(0, 80);
  if (!parsed.length) {
    throw new Error("No inventory suggestions could be found in that text.");
  }

  const now = Date.now();
  const aiJobId = await ctx.db.insert("aiJobs", {
    householdId: auth.householdId,
    moveId,
    type: "inventoryExtraction",
    status: "succeeded",
    modality: "text",
    provider: "mock",
    model: "text-intake-parser-v1",
    inputRef: { source: "apiAiTextIntake", sourceText },
    inputSummary: sourceText.slice(0, 500),
    outputRef: {
      suggestionCount: parsed.length,
      itemCount: parsed.filter((suggestion) => suggestion.type === "item")
        .length,
      boxCount: parsed.filter((suggestion) => suggestion.type === "box").length,
    },
    outputSummary: `${parsed.length} text intake suggestions created.`,
    confidence: "medium",
    reviewStatus: "unreviewed",
    tokenUsage: {
      inputTokens: Math.max(32, Math.ceil(sourceText.length / 4)),
      outputTokens: parsed.length * 32,
      totalTokens:
        Math.max(32, Math.ceil(sourceText.length / 4)) + parsed.length * 32,
    },
    cost: {
      estimatedCents: 0,
      actualCents: 0,
      currency: "USD",
    },
    retryCount: 0,
    maxRetries: 0,
    createdByUserId: auth.createdByUserId,
    createdByApiKeyId: auth.apiKeyId,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const suggestionIds: Id<"aiTextSuggestions">[] = [];
  for (const suggestion of parsed) {
    const suggestionId = await ctx.db.insert("aiTextSuggestions", {
      householdId: auth.householdId,
      moveId,
      aiJobId,
      type: suggestion.type,
      status: "pending",
      sourceText,
      sourceLine: suggestion.sourceLine,
      sourceIndex: suggestion.sourceIndex,
      confidence: suggestion.confidence,
      reasoning: suggestion.reasoning,
      itemDraft: suggestion.itemDraft
        ? normalizeApiAiTextItemDraft(suggestion.itemDraft)
        : undefined,
      boxDraft: suggestion.boxDraft
        ? normalizeApiAiTextBoxDraft(suggestion.boxDraft)
        : undefined,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    suggestionIds.push(suggestionId);
  }

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_text_intake.api_created",
    "aiJobs",
    aiJobId,
    { suggestionCount: suggestionIds.length }
  );

  const suggestions = await Promise.all(
    suggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
  );
  return restOk(
    {
      data: {
        aiJobId,
        suggestionIds,
        suggestions: suggestions
          .filter((entry): entry is Doc<"aiTextSuggestions"> => Boolean(entry))
          .map((entry) => safeAiTextSuggestion(entry)),
      },
    },
    201
  );
}

async function routeGenerateAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const photoIds = parseAiPhotoGenerationIds(args.body);
  const results = [];
  const createdAiJobIds: Id<"aiJobs">[] = [];
  const allSuggestionIds: Id<"aiPhotoSuggestions">[] = [];

  for (const photoId of photoIds) {
    const photo = await requireApiPhotoById(ctx, auth.householdId, photoId);
    if (photo.moveId !== moveId) {
      throw new Error("Photo not found.");
    }
    if (!canUsePhotoDerivativeForAi(photo)) {
      throw new Error(
        "Photo privacy or derivative status does not allow AI intake."
      );
    }
    if (photo.sizeBytes > aiUsageLimits.maxPhotoInputBytes) {
      throw new Error("Photo is too large for AI intake.");
    }

    const existingPending = await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_photo_status", (q) =>
        q.eq("photoId", photo._id).eq("status", "pending")
      )
      .collect();
    if (existingPending.length) {
      const suggestionIds = existingPending.map((suggestion) => suggestion._id);
      allSuggestionIds.push(...suggestionIds);
      results.push({
        photoId: photo._id,
        aiJobId: existingPending[0].aiJobId,
        suggestionIds,
        reusedPending: true,
      });
      continue;
    }

    await assertAiUsageAllowed(ctx, {
      householdId: auth.householdId,
      moveId,
      userId: auth.createdByUserId,
      inputSizeBytes: photo.sizeBytes,
      estimatedCents: 0,
    });

    const duplicatePhotoIds = await duplicatePhotoIdsForApiMove(ctx, photo);
    const suggestions = suggestFromPhotoIntake({
      photoId: photo._id,
      caption: photo.caption,
      room: photo.room,
      photoType: photo.photoType,
      privacyLevel: photo.privacyLevel,
      width: photo.width,
      height: photo.height,
      duplicatePhotoIds,
    }).slice(0, 12);

    const now = Date.now();
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: auth.householdId,
      moveId,
      type: "photoIntake",
      status: "succeeded",
      modality: "vision",
      provider: "mock",
      model: "photo-intake-parser-v1",
      inputRef: {
        source: "apiAiPhotoIntake",
        photoId: photo._id,
        derivativeVariant: "card",
      },
      inputSummary:
        photo.width && photo.height
          ? `${photo.photoType} photo ${photo.width}x${photo.height}`
          : `${photo.photoType} photo`,
      outputRef: {
        suggestionCount: suggestions.length,
        duplicatePhotoIds,
      },
      outputSummary: `${suggestions.length} photo intake suggestions created.`,
      confidence: "medium",
      reviewStatus: "unreviewed",
      tokenUsage: {
        inputTokens: 512,
        outputTokens: suggestions.length * 48,
        totalTokens: 512 + suggestions.length * 48,
      },
      cost: {
        estimatedCents: 0,
        actualCents: 0,
        currency: "USD",
      },
      retryCount: 0,
      maxRetries: 0,
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const suggestionIds: Id<"aiPhotoSuggestions">[] = [];
    for (const suggestion of suggestions) {
      const suggestionId = await ctx.db.insert("aiPhotoSuggestions", {
        householdId: auth.householdId,
        moveId,
        photoId: photo._id,
        aiJobId,
        type: suggestion.type,
        status: "pending",
        sourceDerivativeVariant: suggestion.sourceDerivativeVariant,
        sourceSummary: suggestion.sourceSummary,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        itemDraft: suggestion.itemDraft
          ? normalizeApiAiPhotoItemDraft(suggestion.itemDraft)
          : undefined,
        boxDraft: suggestion.boxDraft
          ? normalizeApiAiPhotoBoxDraft(suggestion.boxDraft)
          : undefined,
        duplicatePhotoIds: suggestion.duplicatePhotoIds as
          | Id<"itemPhotos">[]
          | undefined,
        createdByUserId: auth.createdByUserId,
        createdAt: now,
        updatedAt: now,
      });
      suggestionIds.push(suggestionId);
    }

    await ctx.db.patch(photo._id, {
      aiProcessed: true,
      verificationStatus: "needsReview",
      updatedAt: now,
    });

    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_photo_intake.api_created",
      "aiJobs",
      aiJobId,
      { photoId: photo._id, suggestionCount: suggestionIds.length }
    );

    createdAiJobIds.push(aiJobId);
    allSuggestionIds.push(...suggestionIds);
    results.push({
      photoId: photo._id,
      aiJobId,
      suggestionIds,
      reusedPending: false,
    });
  }

  const suggestions = await Promise.all(
    allSuggestionIds.map((suggestionId) => ctx.db.get(suggestionId))
  );
  return restOk(
    {
      data: {
        aiJobIds: createdAiJobIds,
        suggestionIds: allSuggestionIds,
        results,
        suggestions: suggestions
          .filter((entry): entry is Doc<"aiPhotoSuggestions"> => Boolean(entry))
          .map((entry) => safeAiPhotoSuggestion(entry)),
      },
    },
    createdAiJobIds.length ? 201 : 200
  );
}

async function routeApproveAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const { dryRun, approvals } = parseAiTextApprovals(args.body);
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals
  );
  const now = Date.now();
  const boxIdsByLabel = new Map<string, Id<"boxes">>();
  const createdItemIds: Id<"items">[] = [];
  const createdBoxIds: Id<"boxes">[] = [];
  const assignmentIds: Id<"boxItems">[] = [];
  const results = [];

  for (const { suggestion, approval } of loaded.filter(
    (entry) => entry.suggestion.type === "box"
  )) {
    const draft =
      approval.boxDraft ?? normalizeApiAiTextBoxDraft(suggestion.boxDraft);
    if (!draft) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action: "skipped",
        reason: "Suggestion has no box draft.",
        dryRun,
      });
      continue;
    }
    const action = approval.boxDraft ? "edit" : "approve";
    if (dryRun) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedBoxLabel: draft.label,
        plannedBoxCode: draft.code,
        dryRun,
      });
      continue;
    }

    const { boxId, created } = await ensureApiBoxFromAiTextDraft(ctx, {
      auth,
      moveId,
      draft,
      now,
    });
    boxIdsByLabel.set(normalizeApiAiBoxLabelKey(draft.label), boxId);
    if (created) pushUniqueId(createdBoxIds, boxId);
    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedBoxId: boxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedBoxId: boxId,
      createdBox: created,
      dryRun,
    });
  }

  for (const { suggestion, approval } of loaded.filter(
    (entry) => entry.suggestion.type === "item"
  )) {
    const draft =
      approval.itemDraft ?? normalizeApiAiTextItemDraft(suggestion.itemDraft);
    if (!draft) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action: "skipped",
        reason: "Suggestion has no item draft.",
        dryRun,
      });
      continue;
    }
    const action = approval.itemDraft ? "edit" : "approve";
    if (dryRun) {
      const existingBox = draft.suggestedBoxLabel
        ? await findApiAiBoxByLabel(ctx, moveId, draft.suggestedBoxLabel)
        : null;
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedItemName: draft.name,
        plannedBoxLabel: draft.suggestedBoxLabel,
        wouldUseExistingBox: Boolean(existingBox),
        dryRun,
      });
      continue;
    }

    const itemId = await createApiItemFromAiTextDraft(ctx, {
      auth,
      moveId,
      draft,
      now,
    });
    createdItemIds.push(itemId);
    let approvedBoxId: Id<"boxes"> | undefined;
    let assignmentId: Id<"boxItems"> | undefined;

    if (draft.suggestedBoxLabel) {
      const labelKey = normalizeApiAiBoxLabelKey(draft.suggestedBoxLabel);
      approvedBoxId = boxIdsByLabel.get(labelKey);
      if (!approvedBoxId) {
        const createdBox = await ensureApiBoxFromAiTextDraft(ctx, {
          auth,
          moveId,
          draft: {
            label: draft.suggestedBoxLabel,
            room: draft.room,
            destinationRoom: draft.destinationRoom,
            description: "Created from approved AI text intake contents.",
          },
          now,
        });
        approvedBoxId = createdBox.boxId;
        boxIdsByLabel.set(labelKey, approvedBoxId);
        if (createdBox.created) pushUniqueId(createdBoxIds, approvedBoxId);
      }
      assignmentId = await addApiAiTextItemToBox(ctx, {
        auth,
        moveId,
        boxId: approvedBoxId,
        itemId,
        quantity: draft.quantity,
        now,
      });
      assignmentIds.push(assignmentId);
    }

    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedItemId: itemId,
      approvedBoxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedItemId: itemId,
      approvedBoxId,
      assignmentId,
      dryRun,
    });
  }

  if (!dryRun) {
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_text_intake.api_approved",
      "aiTextSuggestions",
      moveId,
      {
        suggestionIds: loaded.map((entry) => entry.suggestion._id),
        createdItemIds,
        createdBoxIds,
        assignmentIds,
      }
    );
  }

  return restOk({
    data: {
      dryRun,
      reviewedSuggestionIds: loaded.map((entry) => entry.suggestion._id),
      createdItemIds,
      createdBoxIds,
      assignmentIds,
      results,
    },
  });
}

async function routeRejectAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds"
  ) as Id<"aiTextSuggestions">[];
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId }))
  );
  const now = Date.now();
  for (const { suggestion } of loaded) {
    await ctx.db.patch(suggestion._id, {
      status: "rejected",
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_text_intake.api_rejected",
    "aiTextSuggestions",
    moveId,
    { suggestionIds }
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function routeApproveAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const { dryRun, approvals } = parseAiPhotoApprovals(args.body);
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals
  );
  const now = Date.now();
  const createdItemIds: Id<"items">[] = [];
  const createdBoxIds: Id<"boxes">[] = [];
  const results = [];

  for (const { suggestion, approval } of loaded) {
    const itemDraft =
      approval.itemDraft ?? normalizeApiAiPhotoItemDraft(suggestion.itemDraft);
    const boxDraft =
      approval.boxDraft ?? normalizeApiAiPhotoBoxDraft(suggestion.boxDraft);
    const action = approval.itemDraft || approval.boxDraft ? "edit" : "approve";

    if (dryRun) {
      results.push({
        suggestionId: suggestion._id,
        type: suggestion.type,
        action,
        plannedItemName: itemDraft?.name,
        plannedBoxLabel: boxDraft?.label,
        dryRun,
      });
      continue;
    }

    let approvedItemId: Id<"items"> | undefined;
    let approvedBoxId: Id<"boxes"> | undefined;

    if (boxDraft) {
      approvedBoxId = await createApiBoxFromAiPhotoDraft(ctx, {
        auth,
        moveId,
        draft: boxDraft,
        now,
      });
      createdBoxIds.push(approvedBoxId);
      await ctx.db.patch(suggestion.photoId, {
        boxId: approvedBoxId,
        verificationStatus: "verified",
        reviewedByUserId: auth.createdByUserId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    if (itemDraft) {
      approvedItemId = await createApiItemFromAiPhotoDraft(ctx, {
        auth,
        moveId,
        draft: itemDraft,
        photoId: suggestion.photoId,
        now,
      });
      createdItemIds.push(approvedItemId);
      await ctx.db.patch(suggestion.photoId, {
        itemId: approvedItemId,
        verificationStatus: "verified",
        reviewedByUserId: auth.createdByUserId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(suggestion._id, {
      status: action === "edit" ? "edited" : "approved",
      approvedItemId,
      approvedBoxId,
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
    results.push({
      suggestionId: suggestion._id,
      type: suggestion.type,
      action,
      approvedItemId,
      approvedBoxId,
      dryRun,
    });
  }

  if (!dryRun) {
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ai_photo_intake.api_approved",
      "aiPhotoSuggestions",
      moveId,
      {
        suggestionIds: loaded.map((entry) => entry.suggestion._id),
        createdItemIds,
        createdBoxIds,
      }
    );
  }

  return restOk({
    data: {
      dryRun,
      reviewedSuggestionIds: loaded.map((entry) => entry.suggestion._id),
      createdItemIds,
      createdBoxIds,
      results,
    },
  });
}

async function routeRejectAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds"
  ) as Id<"aiPhotoSuggestions">[];
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId }))
  );
  const now = Date.now();
  for (const { suggestion } of loaded) {
    await ctx.db.patch(suggestion._id, {
      status: "rejected",
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ai_photo_intake.api_rejected",
    "aiPhotoSuggestions",
    moveId,
    { suggestionIds }
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function loadPendingApiAiTextSuggestions(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  approvals: RestAiTextApproval[]
) {
  const loaded: {
    suggestion: Doc<"aiTextSuggestions">;
    approval: RestAiTextApproval;
  }[] = [];
  for (const approval of approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== householdId ||
      suggestion.moveId !== moveId
    ) {
      throw new Error("AI text suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI text suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function loadPendingApiAiPhotoSuggestions(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  approvals: RestAiPhotoApproval[]
) {
  const loaded: {
    suggestion: Doc<"aiPhotoSuggestions">;
    approval: RestAiPhotoApproval;
  }[] = [];
  for (const approval of approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== householdId ||
      suggestion.moveId !== moveId
    ) {
      throw new Error("AI photo suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI photo suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function createApiItemFromAiTextDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiTextItemDraft;
    now: number;
  }
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveNumber(args.draft.quantity) ?? 1,
    condition: "unknown",
    dimensionsConfidence: "none",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: args.draft.fragility ?? "low",
    stackable: true,
    hazardousFlag: false,
    highValue: args.draft.highValue ?? false,
    requiresPersonalTransport:
      args.draft.disposition === "personalTransport" ||
      args.draft.planningDefaultKeys?.includes("sensitive") === true,
    planningDefaultKeys: args.draft.planningDefaultKeys ?? [],
    needsReview: false,
    reviewFlags: [],
    aiSummary: `Approved from text intake: ${args.draft.suggestedBoxLabel ?? args.draft.room ?? "move notes"}.`,
    aiTags: ["textIntake"],
    createdVia: "textAI",
    reviewedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    updatedByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "item.api_created_from_ai_text",
    "items",
    itemId,
    { name, disposition: args.draft.disposition }
  );
  return itemId;
}

async function ensureApiBoxFromAiTextDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiTextBoxDraft;
    now: number;
  }
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI text intake box";
  const existing = await findApiAiBoxByLabel(ctx, args.moveId, label);
  if (existing) return { boxId: existing._id, created: false };

  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-BOX"
  );
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
    description: normalizeOptionalText(args.draft.description),
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "box.api_created_from_ai_text",
    "boxes",
    boxId,
    { code, label }
  );
  return { boxId, created: true };
}

async function addApiAiTextItemToBox(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    boxId: Id<"boxes">;
    itemId: Id<"items">;
    quantity: number;
    now: number;
  }
) {
  const assignmentId = await ctx.db.insert("boxItems", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    boxId: args.boxId,
    itemId: args.itemId,
    quantity: positiveNumber(args.quantity) ?? 1,
    notes: "Approved from AI text intake.",
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.patch(args.itemId, {
    status: "packed",
    updatedAt: args.now,
  });
  await ctx.db.patch(args.boxId, {
    status: "packing",
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "assignment.api_created_from_ai_text",
    "boxItems",
    assignmentId,
    { boxId: args.boxId, itemId: args.itemId }
  );
  return assignmentId;
}

async function createApiItemFromAiPhotoDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiPhotoItemDraft;
    photoId: Id<"itemPhotos">;
    now: number;
  }
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveNumber(args.draft.quantity) ?? 1,
    condition: "unknown",
    dimensionsConfidence: "none",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: args.draft.fragility ?? "low",
    stackable: true,
    hazardousFlag: false,
    highValue: args.draft.highValue ?? false,
    requiresPersonalTransport:
      args.draft.disposition === "personalTransport" ||
      args.draft.planningDefaultKeys?.includes("sensitive") === true,
    planningDefaultKeys: args.draft.planningDefaultKeys ?? [],
    needsReview: false,
    reviewFlags: [],
    aiSummary: `Approved from photo intake ${args.photoId}.`,
    aiTags: ["photoIntake"],
    createdVia: "photoAI",
    reviewedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    updatedByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "item.api_created_from_ai_photo",
    "items",
    itemId,
    { photoId: args.photoId, name }
  );
  return itemId;
}

async function createApiBoxFromAiPhotoDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiPhotoBoxDraft;
    now: number;
  }
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI photo box";
  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-PHOTO-BOX"
  );
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    description: normalizeOptionalText(args.draft.description),
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: args.now,
    createdByUserId: args.auth.createdByUserId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "box.api_created_from_ai_photo",
    "boxes",
    boxId,
    { code, label }
  );
  return boxId;
}

async function findApiAiBoxByLabel(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string
) {
  const normalizedLabel = normalizeApiAiBoxLabelKey(label);
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  return (
    boxes.find(
      (box) =>
        !box.archivedAt &&
        (normalizeApiAiBoxLabelKey(box.label ?? "") === normalizedLabel ||
          normalizeApiAiBoxLabelKey(box.code) === normalizedLabel)
    ) ?? null
  );
}

async function uniqueApiAiBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string,
  fallback: string
) {
  const base = normalizeBoxCode(label) || fallback;
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const codes = new Set(boxes.map((box) => box.code));
  if (!codes.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const code = normalizeBoxCode(`${base}-${index}`);
    if (code && !codes.has(code)) return code;
  }
  throw new Error("Could not create a unique box code.");
}

function parseAiTextApprovals(body: unknown) {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  assertAiReviewBatchSize(rows, "AI text suggestion approvals");
  const approvals = rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiTextSuggestions">,
      itemDraft: parseApiAiTextItemDraft(approval.itemDraft, "approval.itemDraft"),
      boxDraft: parseApiAiTextBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI text suggestion approval."
  );
  return { dryRun: Boolean(input.dryRun), approvals };
}

function parseAiPhotoApprovals(body: unknown) {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  assertAiReviewBatchSize(rows, "AI photo suggestion approvals");
  const approvals = rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiPhotoSuggestions">,
      itemDraft: parseApiAiPhotoItemDraft(approval.itemDraft, "approval.itemDraft"),
      boxDraft: parseApiAiPhotoBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI photo suggestion approval."
  );
  return { dryRun: Boolean(input.dryRun), approvals };
}

function parseAiSuggestionIds(value: unknown, label: string) {
  const ids = parseIdArray(value);
  assertAiReviewBatchSize(ids, label);
  assertUniqueReviewIds(ids, `Duplicate ${label} value.`);
  return ids;
}

function assertAiReviewBatchSize(rows: unknown[], label: string) {
  if (!rows.length) {
    throw new Error(`${label} must include at least one suggestion.`);
  }
  if (rows.length > 100) {
    throw new Error(`${label} are limited to 100 suggestions.`);
  }
}

function assertUniqueReviewIds(ids: string[], message: string) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(message);
  }
}

function parseApiAiTextItemDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  return parseApiAiItemDraft(value, label, true) as RestAiTextItemDraft;
}

function parseApiAiPhotoItemDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  return parseApiAiItemDraft(value, label, false) as RestAiPhotoItemDraft;
}

function parseApiAiItemDraft(
  value: unknown,
  label: string,
  includeDestinationRoom: boolean
) {
  const input = bodyObject(value);
  const name = normalizeItemName(String(input.name ?? ""));
  if (!name) {
    throw new Error(`${label}.name is required.`);
  }
  const disposition = parseDisposition(input.disposition) ?? "undecided";
  return removeUndefined({
    name,
    room: normalizeOptionalText(asString(input.room)),
    destinationRoom: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationRoom))
      : undefined,
    category: normalizeOptionalText(asString(input.category)),
    disposition,
    quantity: positiveNumber(input.quantity) ?? 1,
    description: normalizeOptionalText(asString(input.description)),
    suggestedBoxLabel: normalizeOptionalText(asString(input.suggestedBoxLabel)),
    fragility: parseItemFragility(input.fragility, `${label}.fragility`),
    highValue:
      input.highValue === undefined ? undefined : Boolean(input.highValue),
    planningDefaultKeys:
      parseLiteralArray(
        input.planningDefaultKeys,
        planningDefaultKeys,
        `${label}.planningDefaultKeys`
      ) ?? [],
  });
}

function parseApiAiTextBoxDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  const draft = parseApiAiBoxDraft(value, label, true);
  return draft as RestAiTextBoxDraft;
}

function parseApiAiPhotoBoxDraft(value: unknown, label: string) {
  if (value === undefined) return undefined;
  const draft = parseApiAiBoxDraft(value, label, false);
  return draft as RestAiPhotoBoxDraft;
}

function parseApiAiBoxDraft(
  value: unknown,
  label: string,
  includeDestinationRoom: boolean
) {
  const input = bodyObject(value);
  const draftLabel = normalizeOptionalText(asString(input.label));
  if (!draftLabel) {
    throw new Error(`${label}.label is required.`);
  }
  return removeUndefined({
    code:
      input.code === undefined
        ? undefined
        : normalizeBoxCode(String(input.code)) || undefined,
    label: draftLabel,
    room: normalizeOptionalText(asString(input.room)),
    destinationRoom: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationRoom))
      : undefined,
    description: normalizeOptionalText(asString(input.description)),
  });
}

function normalizeApiAiTextItemDraft(
  draft: RestAiTextItemDraft | undefined
): RestAiTextItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeApiAiTextBoxDraft(
  draft: RestAiTextBoxDraft | undefined
): RestAiTextBoxDraft | undefined {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI text intake box",
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    description: normalizeOptionalText(draft.description),
  };
}

function normalizeApiAiPhotoItemDraft(
  draft: RestAiPhotoItemDraft | undefined
): RestAiPhotoItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeApiAiPhotoBoxDraft(
  draft: RestAiPhotoBoxDraft | undefined
): RestAiPhotoBoxDraft | undefined {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI photo box",
    room: normalizeOptionalText(draft.room),
    description: normalizeOptionalText(draft.description),
  };
}

function parseItemFragility(value: unknown, label: string) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(itemFragilities, value)) {
    throw new Error(`Unsupported ${label}.`);
  }
  return value as RestAiTextItemDraft["fragility"];
}

function normalizeApiAiBoxLabelKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function pushUniqueId<TId extends string>(ids: TId[], id: TId) {
  if (!ids.includes(id)) ids.push(id);
}

function parseAiTextGenerationSource(body: unknown) {
  const sourceText = asString(bodyObject(body).sourceText)?.trim().slice(0, 12000);
  if (!sourceText) {
    throw new Error("Text intake needs sourceText.");
  }
  return sourceText;
}

function parseAiPhotoGenerationIds(body: unknown) {
  const input = bodyObject(body);
  const photoIds =
    input.photoId !== undefined
      ? [optionalString(input.photoId)].filter((entry): entry is string =>
          Boolean(entry)
        )
      : parseIdArray(input.photoIds);
  if (!photoIds.length) {
    throw new Error("photoIds must include at least one photo ID.");
  }
  if (photoIds.length > 50) {
    throw new Error("photoIds are limited to 50 photos.");
  }
  assertUniqueReviewIds(photoIds, "Duplicate photoId value.");
  return photoIds as Id<"itemPhotos">[];
}

async function duplicatePhotoIdsForApiMove(
  ctx: MutationCtx,
  photo: Doc<"itemPhotos">
) {
  if (!photo.originalHash) return [];
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_move_created", (q) => q.eq("moveId", photo.moveId))
    .collect();
  return photos
    .filter(
      (candidate) =>
        candidate._id !== photo._id &&
        !candidate.archivedAt &&
        candidate.originalHash === photo.originalHash
    )
    .map((candidate) => candidate._id);
}

async function routeDocumentationProfiles(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  profileIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET") {
    const profiles = await ctx.db
      .query("documentationProfiles")
      .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
      .collect();
    const status = parseDocumentationProfileStatus(args.query.status);
    const visibleProfiles = profiles.filter(
      (profile) =>
        profile.householdId === auth.householdId &&
        (status ? profile.status === status : profile.status !== "archived")
    );
    if (profileIdSegment && !actionSegment) {
      const profile = visibleProfiles.find((entry) => entry._id === profileIdSegment);
      if (!profile) {
        throw new Error("Documentation profile not found.");
      }
      return restOk({ data: safeDocumentationProfile(profile) });
    }
    if (!profileIdSegment) {
      return restOk(
        paginate(
          visibleProfiles.map((profile) => safeDocumentationProfile(profile)),
          args.query
        )
      );
    }
  }

  if (args.method === "POST" && !profileIdSegment) {
    const body = bodyObject(args.body);
    const type = parseDocumentationProfileType(body.type);
    if (!type) {
      throw new Error("type is required.");
    }
    const status = parseDocumentationProfileStatus(body.status) ?? "active";
    if (status === "archived") {
      throw new Error("New documentation profiles cannot start archived.");
    }
    const config = normalizeDocumentationProfileConfig({
      type,
      name: asString(body.name),
      includedFields: parseDocumentationFieldKeys(body.includedFields),
      imageRule: parseDocumentationImageRule(body.imageRule),
      filters: parseDocumentationFilters(body.filters),
      allowedActions: parseShareLinkActions(body.allowedActions),
      disclaimer: asString(body.disclaimer),
    });
    const now = Date.now();
    const documentationProfileId = await ctx.db.insert("documentationProfiles", {
      householdId: auth.householdId,
      moveId,
      type,
      status,
      name: config.name,
      includedFields: config.includedFields,
      imageRule: config.imageRule,
      filters: config.filters,
      allowedActions: config.allowedActions,
      disclaimer: config.disclaimer,
      ownerNotes: normalizeOptionalText(asString(body.ownerNotes)),
      exportHistory: [],
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });

    await auditApiDocumentationProfile(
      ctx,
      auth,
      moveId,
      "documentation_profile.created",
      documentationProfileId,
      { type, status, includedFields: config.includedFields }
    );
    const profile = await ctx.db.get(documentationProfileId);
    return restOk(
      {
        data: profile
          ? safeDocumentationProfile(profile)
          : { documentationProfileId },
      },
      201
    );
  }

  if (args.method === "PATCH" && profileIdSegment && !actionSegment) {
    const existing = await requireApiMutableDocumentationProfile(
      ctx,
      auth.householdId,
      moveId,
      profileIdSegment
    );
    const body = bodyObject(args.body);
    const type = parseDocumentationProfileType(body.type) ?? existing.type;
    const status = parseDocumentationProfileStatus(body.status) ?? existing.status;
    const config = normalizeDocumentationProfileConfig({
      type,
      name: body.name === undefined ? existing.name : asString(body.name),
      includedFields:
        body.includedFields === undefined
          ? existing.includedFields
          : parseDocumentationFieldKeys(body.includedFields),
      imageRule:
        body.imageRule === undefined
          ? existing.imageRule
          : parseDocumentationImageRule(body.imageRule),
      filters:
        body.filters === undefined
          ? existing.filters
          : parseDocumentationFilters(body.filters),
      allowedActions:
        body.allowedActions === undefined
          ? existing.allowedActions
          : parseShareLinkActions(body.allowedActions),
      disclaimer:
        body.disclaimer === undefined ? existing.disclaimer : asString(body.disclaimer),
    });
    const now = Date.now();
    const patch = {
      type,
      status,
      name: config.name,
      includedFields: config.includedFields,
      imageRule: config.imageRule,
      filters: config.filters,
      allowedActions: config.allowedActions,
      disclaimer: config.disclaimer,
      ownerNotes:
        body.ownerNotes === undefined
          ? existing.ownerNotes
          : normalizeOptionalText(asString(body.ownerNotes)),
      updatedByUserId: auth.createdByUserId,
      updatedByApiKeyId: auth.apiKeyId,
      archivedAt:
        status === "archived"
          ? (existing.archivedAt ?? now)
          : status !== existing.status
            ? undefined
            : existing.archivedAt,
      updatedAt: now,
    };
    await ctx.db.patch(existing._id, patch);
    await auditApiDocumentationProfile(
      ctx,
      auth,
      moveId,
      "documentation_profile.updated",
      existing._id,
      { previousStatus: existing.status, nextStatus: status, type }
    );
    const updated = await ctx.db.get(existing._id);
    return restOk({
      data: updated
        ? safeDocumentationProfile(updated)
        : { documentationProfileId: existing._id },
    });
  }

  if (
    profileIdSegment &&
    ((args.method === "DELETE" && !actionSegment) ||
      (args.method === "POST" && actionSegment === "archive"))
  ) {
    const existing = await requireApiMutableDocumentationProfile(
      ctx,
      auth.householdId,
      moveId,
      profileIdSegment
    );
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: "archived",
      archivedAt: now,
      updatedByUserId: auth.createdByUserId,
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: now,
    });
    await auditApiDocumentationProfile(
      ctx,
      auth,
      moveId,
      "documentation_profile.archived",
      existing._id
    );
    return restOk({
      data: { archived: true, documentationProfileId: existing._id },
    });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Documentation profile route not found.",
  });
}

async function routeExports(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  exportIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET" && !exportIdSegment) {
    const jobs = await ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        jobs
          .filter((job) => job.householdId === auth.householdId)
          .map((job) => safeExportJob(job)),
        args.query
      )
    );
  }

  if (args.method === "POST" && !exportIdSegment) {
    const body = bodyObject(args.body);
    const result = await createApiCsvExport(ctx, {
      auth,
      moveId,
      type: parseExportJobType(body.type) ?? "inventory",
      documentationProfileId: optionalString(body.documentationProfileId) as
        | Id<"documentationProfiles">
        | undefined,
    });
    return restOk({ data: result }, 201);
  }

  if (args.method === "GET" && exportIdSegment) {
    const job = await requireApiExportJob(
      ctx,
      auth.householdId,
      moveId,
      exportIdSegment
    );
    if (actionSegment === "download") {
      return restOk({ data: artifactForApiExport(job) });
    }
    return restOk({ data: safeExportJob(job) });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Export route not found.",
  });
}

async function routeShareLinks(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  shareLinkIdSegment?: string,
  actionSegment?: string
) {
  if (
    args.method === "GET" &&
    shareLinkIdSegment === "comments" &&
    !actionSegment
  ) {
    return await routeShareLinkComments(ctx, args, auth, moveId);
  }

  if (args.method === "GET" && shareLinkIdSegment && actionSegment === "comments") {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment
    );
    return await routeShareLinkComments(ctx, args, auth, moveId, link._id);
  }

  if (args.method === "GET" && !shareLinkIdSegment) {
    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
      .collect();
    const status = parseShareLinkStatus(args.query.status);
    return restOk(
      paginate(
        links
          .filter(
            (link) =>
              link.householdId === auth.householdId &&
              (!status || link.status === status)
          )
          .map((link) => safeApiShareLink(link)),
        args.query
      )
    );
  }

  if (args.method === "GET" && shareLinkIdSegment && !actionSegment) {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment
    );
    return restOk({ data: safeApiShareLink(link) });
  }

  if (args.method === "POST" && !shareLinkIdSegment) {
    const body = bodyObject(args.body);
    const documentationProfileId = optionalString(body.documentationProfileId) as
      | Id<"documentationProfiles">
      | undefined;
    const expiresAt =
      optionalNumber(body.expiresAt) ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
    const result = await createGeneratedShareLink(
      ctx,
      {
        householdId: auth.householdId,
        moveId,
        documentationProfileId,
        scope:
          parseShareLinkScope(body.scope) ??
          (documentationProfileId ? "profile" : "move"),
        label: normalizeOptionalText(asString(body.label)),
        role: parseShareLinkRole(body.role) ?? "guest",
        allowedActions: parseShareLinkActions(body.allowedActions),
        expiresAt,
      },
      {
        type: "apiKey",
        apiKeyId: auth.apiKeyId,
        userId: auth.createdByUserId,
      }
    );
    return restOk(
      {
        data: {
          ...result,
          url: `/share/${result.token}`,
          expiresAt,
        },
      },
      201
    );
  }

  if (
    shareLinkIdSegment &&
    ((args.method === "DELETE" && !actionSegment) ||
      (args.method === "POST" && actionSegment === "revoke"))
  ) {
    const link = await revokeShareLinkRecord(
      ctx,
      {
        householdId: auth.householdId,
        moveId,
        shareLinkId: shareLinkIdSegment as Id<"shareLinks">,
      },
      {
        type: "apiKey",
        apiKeyId: auth.apiKeyId,
        userId: auth.createdByUserId,
      }
    );
    return restOk({ data: { revoked: true, shareLink: safeApiShareLink(link) } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Share link route not found.",
  });
}

async function routeShareLinkComments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  shareLinkId?: Id<"shareLinks">
) {
  const documentationProfileId = optionalString(
    args.query.documentationProfileId
  ) as Id<"documentationProfiles"> | undefined;
  const comments = await ctx.db
    .query("shareLinkComments")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .order("desc")
    .collect();
  const page = paginate(
    comments.filter(
      (comment) =>
        comment.householdId === auth.householdId &&
        (!shareLinkId || comment.shareLinkId === shareLinkId) &&
        (!documentationProfileId ||
          comment.documentationProfileId === documentationProfileId)
    ),
    args.query
  );

  return restOk({
    ...page,
    data: await Promise.all(
      page.data.map((comment) => safeApiShareLinkComment(ctx, comment))
    ),
  });
}

async function routeTopLevelItem(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  itemIdSegment?: string
) {
  if (!itemIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Item not found." });
  }
  const item = await requireApiItemById(ctx, auth.householdId, itemIdSegment);
  assertApiObjectMoveAccess(auth, item.moveId);
  assertRequestedMoveMatches(args, item.moveId, "Item not found.");

  if (args.method === "GET") {
    return restOk({ data: safeItem(item) });
  }

  if (args.method === "PATCH") {
    const patch = itemPatch(args.body, auth, item);
    await ctx.db.patch(item._id, patch);
    const updated = await ctx.db.get(item._id);
    await auditApiWrite(
      ctx,
      auth,
      item.moveId,
      "item.api_updated",
      "items",
      item._id,
      { route: "top_level", changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeItem(updated) : { itemId: item._id } });
  }

  if (args.method === "DELETE") {
    const now = Date.now();
    await ctx.db.patch(item._id, {
      deletedAt: now,
      updatedAt: now,
      updatedByUserId: auth.createdByUserId,
    });
    await auditApiWrite(
      ctx,
      auth,
      item.moveId,
      "item.api_deleted",
      "items",
      item._id,
      { route: "top_level" }
    );
    return restOk({ data: { deleted: true, itemId: item._id } });
  }

  return restError({ status: 404, code: "not_found", message: "Item route not found." });
}

async function routeTopLevelBox(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  boxIdSegment?: string,
  nestedSegment?: string,
  nestedIdSegment?: string
) {
  if (!boxIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Box not found." });
  }
  const box = await requireApiBoxById(ctx, auth.householdId, boxIdSegment);
  assertApiObjectMoveAccess(auth, box.moveId);
  assertRequestedMoveMatches(args, box.moveId, "Box not found.");

  if (nestedSegment === "items") {
    return await routeTopLevelBoxItems(ctx, args, auth, box, nestedIdSegment);
  }

  if (nestedSegment) {
    return restError({ status: 404, code: "not_found", message: "Box route not found." });
  }

  if (args.method === "GET") {
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "PATCH") {
    const patch = boxPatch(args.body);
    await ctx.db.patch(box._id, patch);
    const updated = await ctx.db.get(box._id);
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "box.api_updated",
      "boxes",
      box._id,
      { route: "top_level", changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeBox(updated) : { boxId: box._id } });
  }

  return restError({ status: 404, code: "not_found", message: "Box route not found." });
}

async function routeTopLevelBoxItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  box: Doc<"boxes">,
  itemIdSegment?: string
) {
  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    const itemId = String(body.itemId ?? "") as Id<"items">;
    const item = await requireApiItem(ctx, auth.householdId, box.moveId, itemId);
    const now = Date.now();
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const current = existing.find((entry) => entry.moveId === box.moveId);
    const patch = {
      boxId: box._id,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      updatedAt: now,
    };

    if (current) {
      await ctx.db.patch(current._id, patch);
      await auditApiWrite(
        ctx,
        auth,
        box.moveId,
        "assignment.api_upserted",
        "boxItems",
        current._id,
        { route: "top_level_box", boxId: box._id, itemId: item._id }
      );
      return restOk({ data: { assignmentId: current._id } });
    }

    const assignmentId = await ctx.db.insert("boxItems", {
      householdId: auth.householdId,
      moveId: box.moveId,
      itemId: item._id,
      ...patch,
      createdAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "assignment.api_upserted",
      "boxItems",
      assignmentId,
      { route: "top_level_box", boxId: box._id, itemId: item._id }
    );
    return restOk({ data: { assignmentId } }, 201);
  }

  if (args.method === "DELETE" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, box.moveId, itemIdSegment);
    const assignments = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", item._id))
      .collect();
    const assignment = assignments.find(
      (entry) => entry.moveId === box.moveId && entry.boxId === box._id
    );
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    await ctx.db.delete(assignment._id);
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "assignment.api_deleted",
      "boxItems",
      assignment._id,
      { route: "top_level_box", boxId: box._id, itemId: item._id }
    );
    return restOk({ data: { deleted: true, assignmentId: assignment._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Box item route not found.",
  });
}

async function routeTopLevelPhoto(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  photoIdSegment?: string,
  actionSegment?: string
) {
  if (!photoIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Photo not found." });
  }
  if (args.method !== "POST" || actionSegment !== "attach") {
    return restError({
      status: 404,
      code: "not_found",
      message: "Photo route not found.",
    });
  }

  const photo = await requireApiPhotoById(ctx, auth.householdId, photoIdSegment);
  assertApiObjectMoveAccess(auth, photo.moveId);
  assertRequestedMoveMatches(args, photo.moveId, "Photo not found.");
  const patch = await photoAttachPatch(ctx, {
    householdId: auth.householdId,
    moveId: photo.moveId,
    reviewedByUserId: auth.createdByUserId,
    body: args.body,
  });
  if (!Object.keys(patch).some((key) => key !== "updatedAt")) {
    return restError({
      status: 400,
      code: "empty_photo_patch",
      message: "Provide at least one photo attachment or metadata field.",
    });
  }
  await ctx.db.patch(photo._id, patch);
  const updated = await ctx.db.get(photo._id);
  await auditApiWrite(
    ctx,
    auth,
    photo.moveId,
    "photo.api_attached",
    "itemPhotos",
    photo._id,
    { changedKeys: Object.keys(patch) }
  );
  return restOk({ data: updated ? safePhoto(updated) : { photoId: photo._id } });
}

async function routeTopLevelExport(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  exportIdSegment?: string
) {
  if (!exportIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Export not found." });
  }
  const moveId = requiredQueryMoveId(args.query);
  const job = await requireApiExportJob(ctx, auth.householdId, moveId, exportIdSegment);
  return restOk({
    data:
      args.query.download === "1" || args.query.download === "true"
        ? artifactForApiExport(job)
        : safeExportJob(job),
  });
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

async function requireApiMove(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">
) {
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId || move.status === "archived") {
    throw new Error("Move not found.");
  }
  return move;
}

async function requireApiPlan(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment: string
) {
  const plan = await ctx.db.get(planIdSegment as Id<"floorPlans">);
  if (
    !plan ||
    plan.householdId !== auth.householdId ||
    plan.archivedAt ||
    plan.status !== "active"
  ) {
    throw new Error("Plan not found.");
  }
  if (auth.moveId && auth.moveId !== plan.moveId) {
    throw new Error("Plan not found.");
  }
  await requireApiMove(ctx, auth.householdId, plan.moveId);
  return plan;
}

async function planDocumentForApi(
  ctx: MutationCtx,
  plan: Doc<"floorPlans">
): Promise<PlanDocumentInput> {
  const [levels, entities, placements, items, boxes, plannedItems, pendingProposals] =
    await Promise.all([
      ctx.db
        .query("planLevels")
        .withIndex("by_plan_sort", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planEntities")
        .withIndex("by_plan_type", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planPlacements")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("plannedItems")
        .withIndex("by_move_updated", (q) => q.eq("moveId", plan.moveId))
        .collect(),
      ctx.db
        .query("planProposals")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "pending")
        )
        .collect(),
    ]);
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const boxesById = new Map(boxes.map((box) => [String(box._id), box]));
  const plannedItemsById = new Map(
    plannedItems.map((plannedItem) => [String(plannedItem._id), plannedItem]),
  );

  return normalizePlanDocument({
    plan: {
      planId: plan._id,
      moveId: plan.moveId,
      name: plan.name,
      kind: plan.kind,
      northAngleDeg: plan.northAngleDeg,
      defaultWallThicknessIn: plan.defaultWallThicknessIn,
      defaultCeilingHeightIn: plan.defaultCeilingHeightIn,
      gridSnapIn: plan.gridSnapIn,
      shortIdCounters: plan.shortIdCounters,
      nextSeq: plan.nextSeq,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    levels: levels
      .filter((level) => !level.archivedAt)
      .map((level) => ({
        levelId: level._id,
        name: level.name,
        levelType: level.levelType,
        sortOrder: level.sortOrder,
        ceilingHeightIn: level.ceilingHeightIn,
      })),
    entities: entities
      .filter((entity) => !entity.archivedAt)
      .map((entity): PlanEntitySummary => ({
        entityId: entity._id,
        levelId: entity.levelId,
        shortId: entity.shortId,
        entityType: entity.entityType,
        name: entity.name,
        color: entity.color,
        locked: entity.locked,
        wall: entity.wall,
        room: entity.room,
        opening: entity.opening,
        feature: entity.feature,
        zone: entity.zone,
        annotation: entity.annotation,
      })),
    placements: placements
      .filter((placement) => !placement.archivedAt)
      .map((placement): PlanPlacementSummary => ({
        placementId: placement._id,
        levelId: placement.levelId,
        shortId: placement.shortId,
        source: placementSourceForApi(
          placement,
          itemsById,
          boxesById,
          plannedItemsById,
        ),
        x: placement.x,
        y: placement.y,
        rotationDeg: placement.rotationDeg,
        footprintOverrideIn: placement.footprintOverrideIn,
        parentPlacementId: placement.parentPlacementId,
        containmentMode: placement.containmentMode,
        zOrder: placement.zOrder,
        color: placement.color,
        locked: placement.locked,
      })),
    pendingProposalCount: pendingProposals.length,
  });
}

function placementSourceForApi(
  placement: Doc<"planPlacements">,
  itemsById: Map<string, Doc<"items">>,
  boxesById: Map<string, Doc<"boxes">>,
  plannedItemsById: Map<string, Doc<"plannedItems">>,
): PlanSourceSummary | undefined {
  if (placement.itemId) {
    const item = itemsById.get(String(placement.itemId));
    return {
      kind: "item",
      sourceId: String(placement.itemId),
      label: item?.name ?? "Item",
      dimensionsIn: item?.dimensionsIn,
      confidence: itemDimensionsConfidenceForRead({
        dimensionsIn: item?.dimensionsIn,
        dimensionsConfidence: item?.dimensionsConfidence,
      }),
    };
  }
  if (placement.boxId) {
    const box = boxesById.get(String(placement.boxId));
    return {
      kind: "box",
      sourceId: String(placement.boxId),
      label: box?.label ?? box?.code ?? "Box",
      dimensionsIn: box?.dimensionsIn,
    };
  }
  if (placement.plannedItemId) {
    const plannedItem = plannedItemsById.get(String(placement.plannedItemId));
    return {
      kind: "plannedItem",
      sourceId: String(placement.plannedItemId),
      label: plannedItem?.name ?? `Planned item ${placement.plannedItemId}`,
      dimensionsIn: plannedItem?.dimensionsIn,
      confidence: plannedItem?.dimensionsConfidence,
    };
  }
  if (placement.templateKey) {
    return {
      kind: "template",
      sourceId: placement.templateKey,
      label: placement.templateKey,
      confidence: "medium",
    };
  }
  return undefined;
}

function safePlanProposal(proposal: Doc<"planProposals">) {
  return {
    proposalId: proposal._id,
    planId: proposal.planId,
    moveId: proposal.moveId,
    batchId: proposal.batchId,
    ops: proposal.ops,
    agentLabel: proposal.agentLabel,
    reasoning: proposal.reasoning,
    status: proposal.status,
    appliedOpIndexes: proposal.appliedOpIndexes,
    reviewedByUserId: proposal.reviewedByUserId,
    reviewedAt: proposal.reviewedAt,
    createdByApiKeyId: proposal.createdByApiKeyId,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

async function requireApiItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  itemIdSegment: string
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.moveId !== moveId || item.deletedAt) {
    throw new Error("Item not found.");
  }
  return item;
}

async function requireApiPlannedItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  plannedItemIdSegment: string,
  includeArchived = false
) {
  const plannedItem = await ctx.db.get(plannedItemIdSegment as Id<"plannedItems">);
  if (
    !plannedItem ||
    plannedItem.householdId !== householdId ||
    plannedItem.moveId !== moveId ||
    (!includeArchived && plannedItem.archivedAt)
  ) {
    throw new Error("Planned item not found.");
  }
  return plannedItem;
}

async function requireApiItemById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  itemIdSegment: string
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.deletedAt) {
    throw new Error("Item not found.");
  }
  return item;
}

async function requireApiBox(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  boxIdSegment: string
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.moveId !== moveId || box.archivedAt) {
    throw new Error("Box not found.");
  }
  return box;
}

async function requireApiBoxById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  boxIdSegment: string
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.archivedAt) {
    throw new Error("Box not found.");
  }
  return box;
}

async function requireApiMovePerson(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  personIdSegment: string,
  includeArchived = false
) {
  const person = await ctx.db.get(personIdSegment as Id<"movePeople">);
  if (
    !person ||
    person.householdId !== householdId ||
    person.moveId !== moveId ||
    (!includeArchived && person.archivedAt)
  ) {
    throw new Error("Move person not found.");
  }
  return person;
}

async function requireApiPhotoById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  photoIdSegment: string
) {
  const photo = await ctx.db.get(photoIdSegment as Id<"itemPhotos">);
  if (!photo || photo.householdId !== householdId || photo.archivedAt) {
    throw new Error("Photo not found.");
  }
  return photo;
}

async function requireApiTransportResource(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  resourceIdSegment: string
) {
  const resource = await ctx.db.get(
    resourceIdSegment as Id<"transportResources">
  );
  if (
    !resource ||
    resource.householdId !== householdId ||
    resource.moveId !== moveId ||
    resource.archivedAt
  ) {
    throw new Error("Transport resource not found.");
  }
  return resource;
}

async function requireApiTransportZone(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  zoneIdSegment: string
) {
  const zone = await ctx.db.get(zoneIdSegment as Id<"transportZones">);
  if (
    !zone ||
    zone.householdId !== householdId ||
    zone.moveId !== moveId ||
    zone.archivedAt
  ) {
    throw new Error("Transport zone not found.");
  }
  return zone;
}

async function requireApiDocumentationProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  if (!args.documentationProfileId) {
    throw new Error("Documentation profile export requires a profile.");
  }
  const profile = await ctx.db.get(args.documentationProfileId);
  if (
    !profile ||
    profile.householdId !== args.householdId ||
    profile.moveId !== args.moveId ||
    profile.status === "archived"
  ) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

async function requireApiMutableDocumentationProfile(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  profileIdSegment: string
) {
  const profile = await ctx.db.get(profileIdSegment as Id<"documentationProfiles">);
  if (!profile || profile.householdId !== householdId || profile.moveId !== moveId) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

async function requireApiExportJob(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  exportIdSegment: string
) {
  const job = await ctx.db.get(exportIdSegment as Id<"exportJobs">);
  if (!job || job.householdId !== householdId || job.moveId !== moveId) {
    throw new Error("Export job not found.");
  }
  return job;
}

async function requireApiShareLink(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  shareLinkIdSegment: string
) {
  const link = await ctx.db.get(shareLinkIdSegment as Id<"shareLinks">);
  if (!link || link.householdId !== householdId || link.moveId !== moveId) {
    throw new Error("Share link not found.");
  }
  return link;
}

function requiredQueryMoveId(query: Record<string, string>) {
  if (!query.moveId) {
    throw new Error("moveId query parameter is required.");
  }
  return query.moveId as Id<"moves">;
}

function assertApiObjectMoveAccess(
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  objectMoveId: Id<"moves">
) {
  if (auth.moveId && auth.moveId !== objectMoveId) {
    throw new Error("API key is not allowed for this operation.");
  }
}

function assertRequestedMoveMatches(
  args: RestRequestInput,
  objectMoveId: Id<"moves">,
  message: string
) {
  const requestedMoveId = optionalRequestMoveId(args);
  if (requestedMoveId && requestedMoveId !== objectMoveId) {
    throw new Error(message);
  }
}

function optionalRequestMoveId(args: RestRequestInput) {
  return moveIdFromRestBodyOrQuery({
    body: args.body,
    query: args.query,
  }) as Id<"moves"> | undefined;
}

function safeMove(move: Doc<"moves">) {
  return {
    moveId: move._id,
    title: move.title,
    type: move.type,
    status: move.status,
    origin: move.origin,
    destination: move.destination,
    dateStart: move.dateStart,
    dateEnd: move.dateEnd,
    unitSystem: move.unitSystem,
    documentationProfileTypes: move.documentationProfileTypes,
    createdAt: move.createdAt,
    updatedAt: move.updatedAt,
  };
}

function safeItem(item: Doc<"items">) {
  return {
    itemId: item._id,
    name: item.name,
    externalSource: item.externalSource,
    externalId: item.externalId,
    description: item.description,
    room: item.room,
    destinationRoom: item.destinationRoom,
    currentSpaceId: item.currentSpaceId,
    destinationSpaceId: item.destinationSpaceId,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    quantity: item.quantity,
    condition: item.condition,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    serialNumber: item.serialNumber,
    modelNumber: item.modelNumber,
    dimensionsIn: item.dimensionsIn,
    measurementProvenance: item.measurementProvenance,
    dimensionsConfidence: itemDimensionsConfidenceForRead({
      dimensionsIn: item.dimensionsIn,
      dimensionsConfidence: item.dimensionsConfidence,
    }),
    estimatedWeightLb: item.estimatedWeightLb,
    estimatedWeightLowLb: item.estimatedWeightLowLb,
    estimatedWeightHighLb: item.estimatedWeightHighLb,
    actualWeightLb: item.actualWeightLb,
    estimatedVolumeCuFt: item.estimatedVolumeCuFt,
    estimatedPackedVolumeCuFt: item.estimatedPackedVolumeCuFt,
    weightConfidence: item.weightConfidence,
    volumeConfidence: item.volumeConfidence,
    highValue: item.highValue,
    needsReview: item.needsReview,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function safePlannedItem(plannedItem: Doc<"plannedItems">) {
  return {
    plannedItemId: plannedItem._id,
    moveId: plannedItem.moveId,
    name: plannedItem.name,
    category: plannedItem.category,
    subcategory: plannedItem.subcategory,
    description: plannedItem.description,
    dimensionsIn: plannedItem.dimensionsIn,
    dimensionsConfidence: plannedItem.dimensionsConfidence,
    estimatedPriceCents: plannedItem.estimatedPriceCents,
    url: plannedItem.url,
    priority: plannedItem.priority,
    notes: plannedItem.notes,
    status: plannedItem.status,
    convertedItemId: plannedItem.convertedItemId,
    createdVia: plannedItem.createdVia,
    createdAt: plannedItem.createdAt,
    updatedAt: plannedItem.updatedAt,
    archivedAt: plannedItem.archivedAt,
  };
}

function safeBox(box: Doc<"boxes">) {
  return {
    boxId: box._id,
    code: box.code,
    label: box.label,
    room: box.room,
    destinationRoom: box.destinationRoom,
    status: box.status,
    estimatedWeightLb: box.estimatedWeightLb,
    actualWeightLb: box.actualWeightLb,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
  };
}

function safeMovePerson(person: Doc<"movePeople">) {
  return {
    personId: person._id,
    name: person.name,
    role: person.role,
    email: person.email,
    phone: person.phone,
    notes: person.notes,
    sortOrder: person.sortOrder,
    archivedAt: person.archivedAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

function safeTransportResource(resource: Doc<"transportResources">) {
  return {
    resourceId: resource._id,
    type: resource.type,
    name: resource.name,
    description: resource.description,
    capacity: resource.capacity,
    capacityReviewStatus: resource.capacityReviewStatus ?? "unreviewed",
    capacityNotes: resource.capacityNotes,
    capacityReviewedAt: resource.capacityReviewedAt,
    capacityReviewedByUserId: resource.capacityReviewedByUserId,
    rules: resource.rules,
    sortOrder: resource.sortOrder,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

function safeTransportZone(zone: Doc<"transportZones">) {
  return {
    zoneId: zone._id,
    resourceId: zone.resourceId,
    name: zone.name,
    description: zone.description,
    capacity: zone.capacity,
    preferredTags: zone.preferredTags,
    sortOrder: zone.sortOrder,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

function safeMoveSpace(space: Doc<"moveSpaces">) {
  return {
    spaceId: space._id,
    kind: space.kind,
    name: space.name,
    aliases: space.aliases,
    notes: space.notes,
    floorLevel: space.floorLevel,
    sortOrder: space.sortOrder,
    status: space.status,
    transportResourceId: space.transportResourceId,
    transportZoneId: space.transportZoneId,
    linkedPlanEntityId: space.linkedPlanEntityId,
    capacity: space.capacity,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

function safeSaleListing(listing: Doc<"saleListings">) {
  return {
    listingId: listing._id,
    itemId: listing.itemId,
    status: listing.status,
    platform: listing.platform,
    platformLabel: listing.platformLabel,
    listingTitle: listing.listingTitle,
    listingDescription: listing.listingDescription,
    category: listing.category,
    condition: listing.condition,
    locationLabel: listing.locationLabel,
    selectedPhotoIds: listing.selectedPhotoIds,
    listingUrl: listing.listingUrl,
    listedAt: listing.listedAt,
    lastRefreshedAt: listing.lastRefreshedAt,
    suggestedPriceLowCents: listing.suggestedPriceLowCents,
    suggestedPriceHighCents: listing.suggestedPriceHighCents,
    officialPriceCents: listing.officialPriceCents,
    currency: listing.currency,
    pricingConfidence: listing.pricingConfidence,
    priceDecisionSource: listing.priceDecisionSource,
    userOverrodePrice: listing.userOverrodePrice,
    researchDepth: listing.researchDepth,
    researchSourceCount: listing.researchSourceCount,
    researchSources: listing.researchSources,
    researchedAt: listing.researchedAt,
    researchedByApiKeyId: listing.researchedByApiKeyId,
    researchedByLabel: listing.researchedByLabel,
    researchNotes: listing.researchNotes,
    interestedCount: listing.interestedCount,
    inquiryNotes: listing.inquiryNotes,
    offerNotes: listing.offerNotes,
    buyerNotes: listing.buyerNotes,
    pickupStatus: listing.pickupStatus,
    soldPriceCents: listing.soldPriceCents,
    soldAt: listing.soldAt,
    needsMorePhotos: listing.needsMorePhotos,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

function safeAssignment(assignment: Doc<"boxItems">) {
  return {
    assignmentId: assignment._id,
    boxId: assignment.boxId,
    itemId: assignment.itemId,
    quantity: assignment.quantity,
    notes: assignment.notes,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

function safePlanningSuggestion(suggestion: Doc<"aiPlanningSuggestions">) {
  return {
    suggestionId: suggestion._id,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    itemId: suggestion.itemId,
    boxId: suggestion.boxId,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    assumptions: suggestion.assumptions,
    estimateDraft: suggestion.estimateDraft,
    assignmentDraft: suggestion.assignmentDraft,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

function safeAiJob(job: Doc<"aiJobs">) {
  return {
    aiJobId: job._id,
    type: job.type,
    status: job.status,
    modality: job.modality,
    provider: job.provider,
    model: job.model,
    inputSummary: job.inputSummary,
    outputSummary: job.outputSummary,
    confidence: job.confidence,
    reviewStatus: job.reviewStatus,
    tokenUsage: job.tokenUsage,
    cost: job.cost,
    maxCostCents: job.maxCostCents,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    canceledAt: job.canceledAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function safeAiTextSuggestion(suggestion: Doc<"aiTextSuggestions">) {
  return {
    suggestionId: suggestion._id,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    sourceLine: suggestion.sourceLine,
    sourceIndex: suggestion.sourceIndex,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    itemDraft: suggestion.itemDraft,
    boxDraft: suggestion.boxDraft,
    approvedItemId: suggestion.approvedItemId,
    approvedBoxId: suggestion.approvedBoxId,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

function safeAiPhotoSuggestion(suggestion: Doc<"aiPhotoSuggestions">) {
  return {
    suggestionId: suggestion._id,
    photoId: suggestion.photoId,
    aiJobId: suggestion.aiJobId,
    type: suggestion.type,
    status: suggestion.status,
    sourceDerivativeVariant: suggestion.sourceDerivativeVariant,
    sourceSummary: suggestion.sourceSummary,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    itemDraft: suggestion.itemDraft,
    boxDraft: suggestion.boxDraft,
    duplicatePhotoIds: suggestion.duplicatePhotoIds,
    approvedItemId: suggestion.approvedItemId,
    approvedBoxId: suggestion.approvedBoxId,
    reviewedAt: suggestion.reviewedAt,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

function safePhoto(photo: Doc<"itemPhotos">) {
  return {
    photoId: photo._id,
    itemId: photo.itemId,
    boxId: photo.boxId,
    spaceId: photo.spaceId,
    transportResourceId: photo.transportResourceId,
    transportZoneId: photo.transportZoneId,
    room: photo.room,
    documentationProfileTypes: photo.documentationProfileTypes,
    photoType: photo.photoType,
    privacyLevel: photo.privacyLevel,
    visibilityScope: photo.visibilityScope,
    verificationStatus: photo.verificationStatus,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}

function safeDocumentationProfile(profile: Doc<"documentationProfiles">) {
  return {
    documentationProfileId: profile._id,
    type: profile.type,
    name: profile.name,
    status: profile.status,
    includedFields: profile.includedFields,
    imageRule: profile.imageRule,
    filters: profile.filters,
    allowedActions: profile.allowedActions,
    disclaimer: profile.disclaimer,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function safeExportJob(job: Doc<"exportJobs">) {
  return {
    exportJobId: job._id,
    moveId: job.moveId,
    documentationProfileId: job.documentationProfileId,
    type: job.type,
    format: job.format,
    status: job.status,
    filename: job.filename,
    mimeType: job.mimeType,
    rowCount: job.rowCount,
    sizeBytes: job.sizeBytes,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
  };
}

function safeApiShareLink(link: Doc<"shareLinks">) {
  const safe = safeShareLinkMetadata(link);
  return {
    shareLinkId: safe._id,
    moveId: safe.moveId,
    documentationProfileId: safe.documentationProfileId,
    scope: safe.scope,
    tokenPreview: safe.tokenPreview,
    label: safe.label,
    role: safe.role,
    status: safe.status,
    allowedActions: safe.allowedActions,
    expiresAt: safe.expiresAt,
    revokedAt: safe.revokedAt,
    accessCount: safe.accessCount,
    lastAccessedAt: safe.lastAccessedAt,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  };
}

async function safeApiShareLinkComment(
  ctx: MutationCtx,
  comment: Doc<"shareLinkComments">
) {
  const [link, profile] = await Promise.all([
    ctx.db.get(comment.shareLinkId),
    ctx.db.get(comment.documentationProfileId),
  ]);
  return {
    commentId: comment._id,
    shareLinkId: comment.shareLinkId,
    documentationProfileId: comment.documentationProfileId,
    shareLabel: link?.label,
    profileName: profile?.name,
    role: comment.role,
    authorLabel: comment.authorLabel,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

function artifactForApiExport(job: Doc<"exportJobs">) {
  if (job.status !== "completed" || !job.artifactText) {
    throw new Error("Export artifact is not ready.");
  }
  if (job.expiresAt && job.expiresAt < Date.now()) {
    throw new Error("Export artifact has expired.");
  }
  return {
    ...safeExportJob(job),
    artifactText: job.artifactText,
    encoding: "utf-8",
  };
}

async function findApiMoveByTitle(
  ctx: MutationCtx,
  householdId: Id<"households">,
  title: string,
) {
  const normalized = title.trim().toLowerCase();
  const moves = await ctx.db
    .query("moves")
    .withIndex("by_household_status", (q) => q.eq("householdId", householdId))
    .collect();
  return (
    moves.find(
      (move) =>
        move.status !== "archived" &&
        move.title.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

function setupMovePatch(
  body: Record<string, unknown>,
  notes: string | undefined,
): Partial<Doc<"moves">> {
  const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
  if (body.title !== undefined) {
    const title = normalizeOptionalText(asString(body.title));
    if (!title) throw new Error("title cannot be empty.");
    patch.title = title;
  }
  if (body.status !== undefined) {
    patch.status = parseMoveStatus(body.status) ?? "planning";
  }
  if (body.type !== undefined) {
    patch.type = parseMoveType(body.type) ?? "other";
  }
  if (body.origin !== undefined) {
    patch.origin = normalizeOptionalText(asString(body.origin));
  }
  if (body.destination !== undefined) {
    patch.destination = normalizeOptionalText(asString(body.destination));
  }
  if (body.dateStart !== undefined) {
    patch.dateStart = normalizeOptionalText(asString(body.dateStart));
  }
  if (body.dateEnd !== undefined) {
    patch.dateEnd = normalizeOptionalText(asString(body.dateEnd));
  }
  if (body.unitSystem !== undefined) {
    patch.unitSystem = parseUnitSystem(body.unitSystem) ?? "imperial";
  }
  if (body.documentationProfileTypes !== undefined) {
    patch.documentationProfileTypes = Array.isArray(body.documentationProfileTypes)
      ? parseDocumentationProfileTypes(body.documentationProfileTypes)
      : undefined;
  }
  if (body.moveLevelWeightAllowanceLb !== undefined) {
    patch.moveLevelWeightAllowanceLb = optionalNumber(
      body.moveLevelWeightAllowanceLb,
    );
  }
  if (
    body.notes !== undefined ||
    body.originRooms !== undefined ||
    body.destinationRooms !== undefined
  ) {
    patch.notes = notes;
  }
  return patch;
}

function setupRoomsNote(body: Record<string, unknown>) {
  const originRooms = parseStringArray(body.originRooms);
  const destinationRooms = parseStringArray(body.destinationRooms);
  const lines = [];
  if (originRooms?.length) {
    lines.push(`Origin rooms/spaces: ${originRooms.join("; ")}.`);
  }
  if (destinationRooms?.length) {
    lines.push(`Destination rooms/spaces: ${destinationRooms.join("; ")}.`);
  }
  return lines.length ? `AI setup room list\n${lines.join("\n")}` : undefined;
}

function setupTransportInputs(body: Record<string, unknown>) {
  const inputs = Array.isArray(body.transportResources)
    ? body.transportResources
    : [];
  if (inputs.length > 25) {
    throw new Error("transportResources are limited to 25 rows.");
  }
  return inputs.map((input) => bodyObject(input));
}

function setupSpaceInputs(body: Record<string, unknown>) {
  const explicitSpaces = Array.isArray(body.spaces)
    ? body.spaces.map((input) => bodyObject(input))
    : [];
  const originRooms = (parseStringArray(body.originRooms) ?? []).map((name, index) => ({
    kind: "originRoom",
    name,
    sortOrder: index,
  }));
  const destinationRooms = (parseStringArray(body.destinationRooms) ?? []).map(
    (name, index) => ({
      kind: "destinationRoom",
      name,
      sortOrder: 1000 + index,
    }),
  );
  const inputs = [...originRooms, ...destinationRooms, ...explicitSpaces];
  if (inputs.length > 100) {
    throw new Error("spaces plus origin/destination rooms are limited to 100 rows.");
  }
  return inputs;
}

function setupItemInputs(body: Record<string, unknown>) {
  const inputs = Array.isArray(body.items) ? body.items : [];
  if (inputs.length > maxBatchUpsertItems) {
    throw new Error(`items are limited to ${maxBatchUpsertItems} rows.`);
  }
  return inputs.map((input) => bodyObject(input));
}

async function upsertApiMoveSpaceForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
  index: number,
) {
  const name = requiredBodyString(input.name, "spaces[].name is required.");
  const kind = parseMoveSpaceKind(input.kind) ?? "custom";
  const existing = (
    await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_name", (q) => q.eq("moveId", moveId).eq("name", name))
      .collect()
  ).find(
    (space) =>
      space.householdId === auth.householdId &&
      space.kind === kind &&
      space.status !== "archived",
  );
  const now = Date.now();
  const patch: Partial<Doc<"moveSpaces">> = {
    aliases: parseStringArray(input.aliases) ?? existing?.aliases ?? [],
    notes: normalizeOptionalText(asString(input.notes)),
    floorLevel: normalizeOptionalText(asString(input.floorLevel)),
    sortOrder: normalizeSortOrder(optionalNumber(input.sortOrder) ?? index),
    transportResourceId: optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined,
    transportZoneId: optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined,
    capacity: parseCapacity(input.capacity) ?? existing?.capacity ?? {},
    updatedByApiKeyId: auth.apiKeyId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return { action: "updated" as const, spaceId: existing._id, name, kind };
  }

  const spaceId = await ctx.db.insert("moveSpaces", {
    householdId: auth.householdId,
    moveId,
    kind,
    name,
    aliases: parseStringArray(input.aliases) ?? [],
    notes: normalizeOptionalText(asString(input.notes)),
    floorLevel: normalizeOptionalText(asString(input.floorLevel)),
    sortOrder: normalizeSortOrder(optionalNumber(input.sortOrder) ?? index),
    status: "active",
    transportResourceId: optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined,
    transportZoneId: optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined,
    linkedPlanEntityId: optionalString(input.linkedPlanEntityId) as
      | Id<"planEntities">
      | undefined,
    capacity: parseCapacity(input.capacity) ?? {},
    createdByUserId: auth.createdByUserId,
    createdByApiKeyId: auth.apiKeyId,
    updatedByApiKeyId: auth.apiKeyId,
    createdAt: now,
    updatedAt: now,
  });
  await auditApiWrite(ctx, auth, moveId, "space.api_setup_created", "moveSpaces", spaceId, {
    name,
    kind,
  });
  return { action: "created" as const, spaceId, name, kind };
}

async function upsertApiTransportResourceForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
  index: number,
) {
  const name = normalizeOptionalText(asString(input.name));
  const presetKey = parseTransportResourcePresetKey(input.presetKey);
  const preset = presetKey ? getTransportResourcePreset(presetKey) : null;
  const resolvedName = name ?? preset?.name;
  if (!resolvedName) {
    throw new Error("transportResources[].name is required unless presetKey is provided.");
  }

  const existing = await findApiTransportResourceByName(
    ctx,
    auth.householdId,
    moveId,
    resolvedName,
  );
  const now = Date.now();
  let resourceId: Id<"transportResources">;
  let action: "create" | "update";
  if (existing) {
    action = "update";
    resourceId = existing._id;
    const patch = transportResourcePatch(input, auth);
    if (preset && input.type === undefined) patch.type = preset.type;
    if (input.name === undefined) patch.name = resolvedName;
    if (input.description === undefined && preset?.description) {
      patch.description = preset.description;
    }
    if (input.capacity === undefined && preset?.capacity) {
      patch.capacity = preset.capacity;
    }
    if (input.rules === undefined && preset?.rules) {
      patch.rules = normalizeRuleList(preset.rules);
    }
    await ctx.db.patch(resourceId, patch);
  } else {
    action = "create";
    const type = preset?.type ?? parseTransportResourceType(input.type);
    if (!type) {
      throw new Error("transportResources[].type is required unless presetKey is provided.");
    }
    resourceId = await ctx.db.insert("transportResources", {
      householdId: auth.householdId,
      moveId,
      type,
      name: resolvedName,
      description:
        normalizeOptionalText(asString(input.description)) ?? preset?.description,
      capacity: parseCapacity(input.capacity) ?? preset?.capacity ?? {},
      capacityReviewStatus:
        parseCapacityReviewStatus(input.capacityReviewStatus) ?? "unreviewed",
      capacityNotes: normalizeOptionalText(asString(input.capacityNotes)),
      rules: normalizeRuleList(parseStringArray(input.rules) ?? preset?.rules ?? []),
      sortOrder:
        input.sortOrder !== undefined
          ? normalizeSortOrder(optionalNumber(input.sortOrder))
          : now + index,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const explicitZones = Array.isArray(input.zones)
    ? input.zones.map((zone) => bodyObject(zone))
    : [];
  const presetZones =
    !explicitZones.length && preset
      ? preset.zones.map((zone, zoneIndex) => ({
          name: zone.name,
          description: zone.description,
          preferredTags: [...(zone.preferredTags ?? [])],
          sortOrder: now + index + zoneIndex + 1,
        }))
      : [];
  const zones = [...explicitZones, ...presetZones];
  const zoneResults = [];
  for (const [zoneIndex, zone] of zones.entries()) {
    zoneResults.push(
      await upsertApiTransportZoneForSetup(ctx, auth, moveId, resourceId, zone, zoneIndex),
    );
  }

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    `transport_resource.api_setup_${action}`,
    "transportResources",
    resourceId,
    { name: resolvedName, zoneCount: zoneResults.length },
  );
  return { action, resourceId, name: resolvedName, zones: zoneResults };
}

async function upsertApiTransportZoneForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  resourceId: Id<"transportResources">,
  input: Record<string, unknown>,
  index: number,
) {
  const name = normalizeOptionalText(asString(input.name));
  if (!name) throw new Error("transportResources[].zones[].name is required.");
  const existing = await findApiTransportZoneByName(
    ctx,
    auth.householdId,
    moveId,
    resourceId,
    name,
  );
  if (existing) {
    const patch = await transportZonePatch(ctx, auth.householdId, moveId, {
      ...input,
      resourceId,
    });
    await ctx.db.patch(existing._id, patch);
    return { action: "update" as const, zoneId: existing._id, name };
  }

  const now = Date.now();
  const zoneId = await ctx.db.insert("transportZones", {
    householdId: auth.householdId,
    moveId,
    resourceId,
    name,
    description: normalizeOptionalText(asString(input.description)),
    capacity: parseCapacity(input.capacity) ?? {},
    preferredTags: normalizeRuleList(parseStringArray(input.preferredTags) ?? []),
    sortOrder:
      input.sortOrder !== undefined
        ? normalizeSortOrder(optionalNumber(input.sortOrder))
        : now + index,
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return { action: "create" as const, zoneId, name };
}

async function findApiTransportResourceByName(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  name: string,
) {
  const normalized = name.trim().toLowerCase();
  const resources = await ctx.db
    .query("transportResources")
    .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
    .collect();
  return (
    resources.find(
      (resource) =>
        resource.householdId === householdId &&
        !resource.archivedAt &&
        resource.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

async function findApiTransportZoneByName(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  resourceId: Id<"transportResources">,
  name: string,
) {
  const normalized = name.trim().toLowerCase();
  const zones = await ctx.db
    .query("transportZones")
    .withIndex("by_resource_sort", (q) => q.eq("resourceId", resourceId))
    .collect();
  return (
    zones.find(
      (zone) =>
        zone.householdId === householdId &&
        zone.moveId === moveId &&
        !zone.archivedAt &&
        zone.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

async function createApiTransportResource(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const presetKey = parseTransportResourcePresetKey(body.presetKey);
  const now = Date.now();

  if (presetKey) {
    const preset = getTransportResourcePreset(presetKey);
    const resourceId = await ctx.db.insert("transportResources", {
      householdId: auth.householdId,
      moveId,
      type: preset.type,
      name: normalizeOptionalText(asString(body.name)) ?? preset.name,
      description: normalizeOptionalText(asString(body.description)) ?? preset.description,
      capacity: parseCapacity(body.capacity) ?? preset.capacity,
      capacityReviewStatus:
        parseCapacityReviewStatus(body.capacityReviewStatus) ?? "unreviewed",
      capacityNotes: normalizeOptionalText(asString(body.capacityNotes)),
      rules: normalizeRuleList(parseStringArray(body.rules) ?? preset.rules),
      sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    const zoneIds = [];
    for (const [index, zone] of preset.zones.entries()) {
      zoneIds.push(
        await ctx.db.insert("transportZones", {
          householdId: auth.householdId,
          moveId,
          resourceId,
          name: zone.name,
          description: zone.description,
          capacity: {},
          preferredTags: normalizeRuleList(zone.preferredTags ?? []),
          sortOrder: now + index,
          createdByUserId: auth.createdByUserId,
          createdAt: now,
          updatedAt: now,
        })
      );
    }
    const [resource, zones] = await Promise.all([
      ctx.db.get(resourceId),
      Promise.all(zoneIds.map((zoneId) => ctx.db.get(zoneId))),
    ]);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_resource.api_preset_created",
      "transportResources",
      resourceId,
      { presetKey, type: preset.type, zoneCount: zoneIds.length }
    );
    return restOk(
      {
        data: {
          resource: resource ? safeTransportResource(resource) : { resourceId },
          zones: zones
            .filter((zone): zone is Doc<"transportZones"> => Boolean(zone))
            .map((zone) => safeTransportZone(zone)),
        },
      },
      201
    );
  }

  const type = parseTransportResourceType(body.type);
  if (!type) {
    throw new Error("type is required unless presetKey is provided.");
  }
  const name = normalizeOptionalText(asString(body.name));
  if (!name) {
    throw new Error("name is required.");
  }
  const resourceId = await ctx.db.insert("transportResources", {
    householdId: auth.householdId,
    moveId,
    type,
    name,
    description: normalizeOptionalText(asString(body.description)),
    capacity: parseCapacity(body.capacity) ?? {},
    capacityReviewStatus:
      parseCapacityReviewStatus(body.capacityReviewStatus) ?? "unreviewed",
    capacityNotes: normalizeOptionalText(asString(body.capacityNotes)),
    rules: normalizeRuleList(parseStringArray(body.rules) ?? []),
    sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  const resource = await ctx.db.get(resourceId);
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "transport_resource.api_created",
    "transportResources",
    resourceId,
    { type, name }
  );
  return restOk(
    { data: { resource: resource ? safeTransportResource(resource) : { resourceId } } },
    201
  );
}

async function createApiTransportZone(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>
) {
  const resourceId = optionalString(body.resourceId);
  if (!resourceId) {
    throw new Error("resourceId is required.");
  }
  await requireApiTransportResource(ctx, auth.householdId, moveId, resourceId);
  const name = normalizeOptionalText(asString(body.name));
  if (!name) {
    throw new Error("name is required.");
  }
  const now = Date.now();
  return await ctx.db.insert("transportZones", {
    householdId: auth.householdId,
    moveId,
    resourceId: resourceId as Id<"transportResources">,
    name,
    description: normalizeOptionalText(asString(body.description)),
    capacity: parseCapacity(body.capacity) ?? {},
    preferredTags: normalizeRuleList(parseStringArray(body.preferredTags) ?? []),
    sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
}

async function loadableApiBoxFor(ctx: MutationCtx, box: Doc<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();
  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { item, membership } : null;
    })
  );
  const activeContents = contents.filter(
    (entry): entry is { item: Doc<"items">; membership: Doc<"boxItems"> } =>
      Boolean(entry)
  );
  const contentEstimates = activeContents.map(({ item, membership }) =>
    estimateItem({ ...item, quantity: membership.quantity })
  );
  const contentsWeight = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.weight)
  );
  const contentsVolume = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.volume)
  );

  return {
    estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt ?? contentsVolume,
    dimensionsIn: box.dimensionsIn,
    itemCount: activeContents.reduce(
      (sum, entry) => sum + entry.membership.quantity,
      0
    ),
    hasFragile: activeContents.some((entry) => entry.item.fragility === "high"),
    hasHighValue: activeContents.some((entry) => entry.item.highValue),
    hasSensitive: activeContents.some((entry) =>
      entry.item.planningDefaultKeys.includes("sensitive")
    ),
    hasPersonalTransport: activeContents.some(
      (entry) => entry.item.requiresPersonalTransport
    ),
    hasHazardous: activeContents.some((entry) => entry.item.hazardousFlag),
  };
}

async function validateApiBoxAssignment(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    box: Doc<"boxes">;
    assignedResourceId: string;
    assignedZoneId?: string;
    overrideReason?: string;
  }
) {
  const resource = await requireApiTransportResource(
    ctx,
    args.householdId,
    args.moveId,
    args.assignedResourceId
  );
  const zone = args.assignedZoneId
    ? await requireApiTransportZone(
        ctx,
        args.householdId,
        args.moveId,
        args.assignedZoneId
      )
    : null;
  if (zone && zone.resourceId !== resource._id) {
    throw new Error("Zone does not belong to the assigned resource.");
  }
  const loadableBox = await loadableApiBoxFor(ctx, args.box);
  const validation = validateAssignment({
    box: loadableBox,
    target: {
      resourceType: resource.type,
      capacity: mergeCapacity(resource.capacity, zone?.capacity),
    },
  });
  if (validation.hardBlocks.length) {
    throw new Error(`Assignment blocked: ${validation.hardBlocks.join(", ")}`);
  }
  if (requiresOverrideReason(validation) && !args.overrideReason) {
    throw new Error("Assignment warnings require an override reason.");
  }
  return validation;
}

async function createApiItem(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>
) {
  const now = Date.now();
  const name = normalizeItemName(String(body.name ?? ""));
  const externalKey = externalItemKeyFromInput(body);
  const itemId = await ctx.db.insert("items", {
    householdId: auth.householdId,
    moveId,
    name,
    normalizedName: normalizedSearchName(name),
    externalSource: externalKey?.externalSource,
    externalId: externalKey?.externalId,
    description: normalizeOptionalText(asString(body.description)),
    room: normalizeOptionalText(asString(body.room)),
    destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
    category: normalizeOptionalText(asString(body.category)),
    subcategory: normalizeOptionalText(asString(body.subcategory)),
    disposition: parseDisposition(body.disposition) ?? "undecided",
    status: parseItemStatus(body.status) ?? "active",
    quantity: positiveNumber(body.quantity) ?? 1,
    condition: parseCondition(body.condition) ?? "unknown",
    valueCents: optionalNumber(body.valueCents),
    replacementValueCents: optionalNumber(body.replacementValueCents),
    serialNumber: normalizeOptionalText(asString(body.serialNumber)),
    modelNumber: normalizeOptionalText(asString(body.modelNumber)),
    dimensionsIn: parseDimensionsIn(body.dimensionsIn),
    measurementProvenance:
      parseMeasurementProvenance(body.measurementProvenance, auth, now) ??
      inferredApiMeasurementProvenance(body, auth, now),
    estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
    estimatedWeightLowLb: optionalNumber(body.estimatedWeightLowLb),
    estimatedWeightHighLb: optionalNumber(body.estimatedWeightHighLb),
    actualWeightLb: optionalNumber(body.actualWeightLb),
    estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
    estimatedPackedVolumeCuFt: optionalNumber(body.estimatedPackedVolumeCuFt),
    dimensionsConfidence:
      parsePlanningConfidence(body.dimensionsConfidence, "dimensionsConfidence") ??
      "none",
    weightConfidence:
      parsePlanningConfidence(body.weightConfidence, "weightConfidence") ?? "none",
    volumeConfidence:
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ?? "none",
    fragility: parseFragility(body.fragility) ?? "low",
    stackable: body.stackable === undefined ? true : Boolean(body.stackable),
    hazardousFlag: Boolean(body.hazardousFlag),
    highValue: Boolean(body.highValue),
    requiresPersonalTransport: Boolean(body.requiresPersonalTransport),
    planningDefaultKeys: parsePlanningDefaultKeys(body.planningDefaultKeys) ?? [],
    needsReview: Boolean(body.needsReview),
    reviewFlags: normalizeRuleList(parseStringArray(body.reviewFlags) ?? []),
    privateNotes: normalizeOptionalText(asString(body.privateNotes)),
    aiSummary: normalizeOptionalText(asString(body.aiSummary)),
    aiTags: normalizeRuleList(parseStringArray(body.aiTags) ?? []),
    createdVia: "api",
    createdByUserId: auth.createdByUserId,
    updatedByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  return { itemId, name, ...externalKey };
}

async function convertApiPlannedItem(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plannedItem: Doc<"plannedItems">
) {
  if (plannedItem.convertedItemId) {
    return {
      itemId: plannedItem.convertedItemId,
      reparentedPlacementCount: 0,
    };
  }

  const now = Date.now();
  const itemId = await ctx.db.insert("items", {
    householdId: plannedItem.householdId,
    moveId: plannedItem.moveId,
    name: plannedItem.name,
    normalizedName: plannedItem.normalizedName,
    description: plannedItem.description,
    category: plannedItem.category,
    subcategory: plannedItem.subcategory,
    disposition: "take",
    status: "active",
    quantity: 1,
    condition: "unknown",
    dimensionsIn: plannedItem.dimensionsIn,
    dimensionsConfidence: plannedItem.dimensionsConfidence ?? "medium",
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
    privateNotes: plannedItem.notes,
    aiTags: [],
    createdVia: "api",
    reviewedAt: now,
    createdByUserId: auth.createdByUserId,
    updatedByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  const placements = (
    await ctx.db
      .query("planPlacements")
      .withIndex("by_planned_item", (q) => q.eq("plannedItemId", plannedItem._id))
      .collect()
  ).filter(
    (placement) =>
      placement.householdId === plannedItem.householdId &&
      placement.moveId === plannedItem.moveId &&
      !placement.archivedAt,
  );

  await Promise.all(
    placements.map((placement) =>
      ctx.db.patch(placement._id, {
        itemId,
        plannedItemId: undefined,
        updatedAt: now,
      }),
    ),
  );

  await ctx.db.patch(plannedItem._id, {
    status: "purchased",
    convertedItemId: itemId,
    updatedByUserId: auth.createdByUserId,
    updatedAt: now,
  });

  await auditApiWrite(
    ctx,
    auth,
    plannedItem.moveId,
    "planned_item.api_converted",
    "plannedItems",
    plannedItem._id,
    {
      itemId,
      reparentedPlacementCount: placements.length,
    },
  );

  return { itemId, reparentedPlacementCount: placements.length };
}

async function createApiCsvExport(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    type: RestExportJobType;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  const [items, boxes, boxItems, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
  ]);
  const profile =
    args.type === "documentationProfile"
      ? await requireApiDocumentationProfile(ctx, {
          householdId: args.auth.householdId,
          moveId: args.moveId,
          documentationProfileId: args.documentationProfileId,
        })
      : null;
  const visibility = apiExportVisibility(profile);
  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const filteredItems = profile
    ? activeItems.filter((item) => itemMatchesProfile(item, profile))
    : activeItems;
  const resourceNameById = new Map(
    resources.map((resource) => [resource._id, resource.name])
  );
  const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
  const rows = rowsForExport({
    type: args.type,
    items: filteredItems,
    boxes: activeBoxes,
    boxItems,
    resourceNameById,
    zoneNameById,
    visibility,
  });
  const artifactText = csvFromRows(rows);
  const now = Date.now();
  const filename = exportFilename({
    type: args.type,
    format: "csv",
    slug: profile?.name ?? args.type,
  });
  const exportJobId = await ctx.db.insert("exportJobs", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    documentationProfileId: profile?._id,
    type: args.type,
    format: "csv",
    status: "completed",
    version: 1,
    filename,
    mimeType: exportMimeType("csv"),
    artifactText,
    rowCount: Math.max(rows.length - 1, 0),
    sizeBytes: artifactText.length,
    filters: profile?.filters,
    createdByUserId: args.auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });

  if (profile) {
    await ctx.db.patch(profile._id, {
      exportHistory: [
        {
          exportJobId: String(exportJobId),
          format: "csv" as const,
          createdByUserId: args.auth.createdByUserId,
          createdAt: now,
        },
        ...profile.exportHistory,
      ].slice(0, 25),
      updatedAt: now,
    });
  }

  await auditApiWrite(ctx, args.auth, args.moveId, "export.api_completed", "exportJobs", exportJobId, {
    type: args.type,
    format: "csv",
    rowCount: Math.max(rows.length - 1, 0),
    documentationProfileId: profile?._id,
  });

  return {
    exportJobId,
    filename,
    rowCount: Math.max(rows.length - 1, 0),
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  };
}

function apiExportVisibility(
  profile: Doc<"documentationProfiles"> | null
): ExportVisibility {
  if (!profile) {
    return { values: false, serials: false, privateNotes: false };
  }
  return {
    values:
      profile.includedFields.includes("estimatedValues") ||
      profile.includedFields.includes("purchaseValues"),
    serials: profile.includedFields.includes("serialNumbers"),
    privateNotes: profile.includedFields.includes("privateNotes"),
  };
}

function itemMatchesProfile(
  item: Doc<"items">,
  profile: Doc<"documentationProfiles">
) {
  const filters = profile.filters;
  if (filters.dispositions?.length && !filters.dispositions.includes(item.disposition)) {
    return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (
    filters.planningDefaultKeys?.length &&
    !filters.planningDefaultKeys.some((key) => item.planningDefaultKeys.includes(key))
  ) {
    return false;
  }
  if (filters.room && item.room !== filters.room) {
    return false;
  }
  if (filters.destinationRoom && item.destinationRoom !== filters.destinationRoom) {
    return false;
  }
  return true;
}

function rowsForExport({
  type,
  items,
  boxes,
  boxItems,
  resourceNameById,
  zoneNameById,
  visibility,
}: {
  type: RestExportJobType;
  items: Doc<"items">[];
  boxes: Doc<"boxes">[];
  boxItems: Doc<"boxItems">[];
  resourceNameById: Map<Id<"transportResources">, string>;
  zoneNameById: Map<Id<"transportZones">, string>;
  visibility: ExportVisibility;
}) {
  switch (type) {
    case "inventory":
    case "documentationProfile":
      return inventoryCsvRows(items, visibility);
    case "boxes":
      return boxCsvRows(
        boxes.map((box) => ({
          ...box,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
        }))
      );
    case "assignments":
      return assignmentCsvRows(
        boxes.map((box) => ({
          boxCode: box.code,
          boxLabel: box.label,
          boxStatus: box.status,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
          itemCount: boxItems
            .filter((membership) => membership.boxId === box._id)
            .reduce((total, membership) => total + membership.quantity, 0),
          estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        }))
      );
  }
}

function movePatch(body: unknown): Partial<Doc<"moves">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
  if (input.title !== undefined) patch.title = String(input.title).trim();
  if (input.status !== undefined) patch.status = parseMoveStatus(input.status);
  if (input.origin !== undefined) patch.origin = normalizeOptionalText(asString(input.origin));
  if (input.destination !== undefined) {
    patch.destination = normalizeOptionalText(asString(input.destination));
  }
  if (input.dateStart !== undefined) patch.dateStart = normalizeOptionalText(asString(input.dateStart));
  if (input.dateEnd !== undefined) patch.dateEnd = normalizeOptionalText(asString(input.dateEnd));
  return patch;
}

function transportResourcePatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
): Partial<Doc<"transportResources">> {
  const input = bodyObject(body);
  const now = Date.now();
  const patch: Partial<Doc<"transportResources">> = { updatedAt: now };
  if (input.type !== undefined) {
    const type = parseTransportResourceType(input.type);
    if (!type) throw new Error("Invalid transport resource type.");
    patch.type = type;
  }
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.capacity !== undefined) {
    patch.capacity = parseCapacity(input.capacity) ?? {};
  }
  if (input.capacityReviewStatus !== undefined) {
    const status = parseCapacityReviewStatus(input.capacityReviewStatus);
    if (!status) throw new Error("Invalid capacityReviewStatus.");
    patch.capacityReviewStatus = status;
    patch.capacityReviewedAt = now;
    patch.capacityReviewedByUserId = auth.createdByUserId;
  }
  if (input.capacityNotes !== undefined) {
    patch.capacityNotes = normalizeOptionalText(asString(input.capacityNotes));
  }
  if (input.rules !== undefined) {
    patch.rules = normalizeRuleList(parseStringArray(input.rules) ?? []);
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  return patch;
}

async function transportZonePatch(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  body: unknown
): Promise<Partial<Doc<"transportZones">>> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"transportZones">> = { updatedAt: Date.now() };
  if (input.resourceId !== undefined) {
    const resourceId = optionalString(input.resourceId);
    if (!resourceId) throw new Error("resourceId cannot be empty.");
    await requireApiTransportResource(ctx, householdId, moveId, resourceId);
    patch.resourceId = resourceId as Id<"transportResources">;
  }
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.capacity !== undefined) {
    patch.capacity = parseCapacity(input.capacity) ?? {};
  }
  if (input.preferredTags !== undefined) {
    patch.preferredTags = normalizeRuleList(parseStringArray(input.preferredTags) ?? []);
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  return patch;
}

function movePersonPatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
): Partial<Doc<"movePeople">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"movePeople">> = {
    updatedByUserId: auth.createdByUserId,
    updatedByApiKeyId: auth.apiKeyId,
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = normalizeOptionalText(asString(input.name));
    if (!name) throw new Error("name cannot be empty.");
    patch.name = name;
  }
  if (input.role !== undefined) {
    const role = parseMovePersonRole(input.role);
    if (!role) throw new Error("Invalid move person role.");
    patch.role = role;
  }
  if (input.email !== undefined) {
    patch.email = normalizeOptionalText(asString(input.email));
  }
  if (input.phone !== undefined) {
    patch.phone = normalizeOptionalText(asString(input.phone));
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  if (input.archivedAt !== undefined) {
    patch.archivedAt = optionalNumber(input.archivedAt);
  }
  return patch;
}

function verificationNeeded(confidence: Doc<"items">["weightConfidence"]) {
  return confidence !== "manual" && confidence !== "actual";
}

function hasDimensionsIn(dimensions: Doc<"items">["dimensionsIn"] | undefined) {
  return Boolean(
    dimensions &&
      (dimensions.lengthIn !== undefined ||
        dimensions.widthIn !== undefined ||
        dimensions.heightIn !== undefined),
  );
}

function parseMeasurementProvenanceSource(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(measurementProvenanceSources, value)) {
    throw new Error("Unsupported measurement provenance sourceType.");
  }
  return value as NonNullable<
    NonNullable<Doc<"items">["measurementProvenance"]>["weight"]
  >["sourceType"];
}

function apiMeasurementProvenanceEntry({
  input,
  auth,
  now,
  fallbackSourceType,
  fallbackConfidence,
  fallbackLabel,
  fallbackNotes,
}: {
  input: Record<string, unknown>;
  auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  now: number;
  fallbackSourceType: NonNullable<
    NonNullable<Doc<"items">["measurementProvenance"]>["weight"]
  >["sourceType"];
  fallbackConfidence: Doc<"items">["weightConfidence"];
  fallbackLabel: string;
  fallbackNotes?: string;
}): NonNullable<NonNullable<Doc<"items">["measurementProvenance"]>["weight"]> {
  const confidence =
    parsePlanningConfidence(input.confidence, "measurementProvenance.confidence") ??
    fallbackConfidence;
  const apiKeyLabel = `${auth.apiKeyName} (${auth.apiKeyTokenPreview})`;
  return {
    sourceType:
      parseMeasurementProvenanceSource(input.sourceType) ?? fallbackSourceType,
    confidence,
    label: normalizeOptionalText(asString(input.label)) ?? fallbackLabel,
    notes: normalizeOptionalText(asString(input.notes)) ?? fallbackNotes,
    recordedAt: optionalNumber(input.recordedAt) ?? now,
    recordedByUserId: auth.createdByUserId,
    recordedByApiKeyId: auth.apiKeyId,
    recordedByLabel:
      normalizeOptionalText(asString(input.recordedByLabel)) ??
      `API key: ${apiKeyLabel}`,
    needsVerification:
      input.needsVerification === undefined
        ? verificationNeeded(confidence)
        : Boolean(input.needsVerification),
  };
}

function parseMeasurementProvenance(
  value: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  now: number,
): Doc<"items">["measurementProvenance"] | undefined {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  const provenance: NonNullable<Doc<"items">["measurementProvenance"]> = {};
  if (input.dimensions !== undefined) {
    provenance.dimensions = apiMeasurementProvenanceEntry({
      input: bodyObject(input.dimensions),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Dimensions",
    });
  }
  if (input.weight !== undefined) {
    provenance.weight = apiMeasurementProvenanceEntry({
      input: bodyObject(input.weight),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Weight",
    });
  }
  if (input.volume !== undefined) {
    provenance.volume = apiMeasurementProvenanceEntry({
      input: bodyObject(input.volume),
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: "low",
      fallbackLabel: "Volume",
    });
  }
  return Object.keys(provenance).length ? provenance : undefined;
}

function inferredApiMeasurementProvenance(
  body: Record<string, unknown>,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  now: number,
  existing?: Doc<"items">,
): Doc<"items">["measurementProvenance"] | undefined {
  const provenance: NonNullable<Doc<"items">["measurementProvenance"]> = {
    ...(existing?.measurementProvenance ?? {}),
  };
  let changed = false;
  const dimensions = parseDimensionsIn(body.dimensionsIn);
  if (body.dimensionsIn !== undefined && hasDimensionsIn(dimensions)) {
    changed = true;
    const confidence =
      parsePlanningConfidence(body.dimensionsConfidence, "dimensionsConfidence") ??
      "low";
    provenance.dimensions = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Dimensions",
      fallbackNotes: "Measurement values were supplied through the API.",
    });
  }
  if (
    body.actualWeightLb !== undefined ||
    body.estimatedWeightLb !== undefined ||
    body.estimatedWeightLowLb !== undefined ||
    body.estimatedWeightHighLb !== undefined
  ) {
    changed = true;
    const confidence =
      body.actualWeightLb !== undefined
        ? "actual"
        : (parsePlanningConfidence(body.weightConfidence, "weightConfidence") ??
          "low");
    provenance.weight = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Weight",
      fallbackNotes: "Weight values were supplied through the API.",
    });
  }
  if (
    body.estimatedVolumeCuFt !== undefined ||
    body.estimatedPackedVolumeCuFt !== undefined
  ) {
    changed = true;
    const confidence =
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ?? "low";
    provenance.volume = apiMeasurementProvenanceEntry({
      input: {},
      auth,
      now,
      fallbackSourceType: "api",
      fallbackConfidence: confidence,
      fallbackLabel: "Volume",
      fallbackNotes: "Volume values were supplied through the API.",
    });
  }
  return changed ? provenance : undefined;
}

function itemPatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  existing?: Doc<"items">,
): Partial<Doc<"items">> {
  const input = bodyObject(body);
  const now = Date.now();
  const patch: Partial<Doc<"items">> = {
    updatedByUserId: auth.createdByUserId,
    updatedAt: now,
  };
  if (input.name !== undefined) {
    const name = normalizeItemName(String(input.name));
    patch.name = name;
    patch.normalizedName = normalizedSearchName(name);
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.disposition !== undefined) patch.disposition = parseDisposition(input.disposition);
  if (input.status !== undefined) patch.status = parseItemStatus(input.status);
  if (input.quantity !== undefined) patch.quantity = positiveNumber(input.quantity) ?? 1;
  if (input.condition !== undefined) patch.condition = parseCondition(input.condition);
  if (input.valueCents !== undefined) patch.valueCents = optionalNumber(input.valueCents);
  if (input.replacementValueCents !== undefined) {
    patch.replacementValueCents = optionalNumber(input.replacementValueCents);
  }
  if (input.serialNumber !== undefined) {
    patch.serialNumber = normalizeOptionalText(asString(input.serialNumber));
  }
  if (input.modelNumber !== undefined) {
    patch.modelNumber = normalizeOptionalText(asString(input.modelNumber));
  }
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseDimensionsIn(input.dimensionsIn);
  }
  if (input.measurementProvenance !== undefined) {
    patch.measurementProvenance = {
      ...(existing?.measurementProvenance ?? {}),
      ...parseMeasurementProvenance(input.measurementProvenance, auth, now),
    };
  }
  if (input.dimensionsConfidence !== undefined) {
    patch.dimensionsConfidence = parsePlanningConfidence(
      input.dimensionsConfidence,
      "dimensionsConfidence"
    );
  }
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalNumber(input.estimatedWeightLb);
  }
  if (input.estimatedWeightLowLb !== undefined) {
    patch.estimatedWeightLowLb = optionalNumber(input.estimatedWeightLowLb);
  }
  if (input.estimatedWeightHighLb !== undefined) {
    patch.estimatedWeightHighLb = optionalNumber(input.estimatedWeightHighLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalNumber(input.estimatedVolumeCuFt);
  }
  if (input.estimatedPackedVolumeCuFt !== undefined) {
    patch.estimatedPackedVolumeCuFt = optionalNumber(input.estimatedPackedVolumeCuFt);
  }
  if (input.weightConfidence !== undefined) {
    patch.weightConfidence =
      parsePlanningConfidence(input.weightConfidence, "weightConfidence") ?? "none";
  }
  if (input.volumeConfidence !== undefined) {
    patch.volumeConfidence =
      parsePlanningConfidence(input.volumeConfidence, "volumeConfidence") ?? "none";
  }
  if (input.fragility !== undefined) {
    patch.fragility = parseFragility(input.fragility) ?? "low";
  }
  if (input.stackable !== undefined) patch.stackable = Boolean(input.stackable);
  if (input.hazardousFlag !== undefined) {
    patch.hazardousFlag = Boolean(input.hazardousFlag);
  }
  if (input.highValue !== undefined) patch.highValue = Boolean(input.highValue);
  if (input.requiresPersonalTransport !== undefined) {
    patch.requiresPersonalTransport = Boolean(input.requiresPersonalTransport);
  }
  if (input.planningDefaultKeys !== undefined) {
    patch.planningDefaultKeys = parsePlanningDefaultKeys(input.planningDefaultKeys) ?? [];
  }
  if (input.needsReview !== undefined) patch.needsReview = Boolean(input.needsReview);
  if (input.reviewFlags !== undefined) {
    patch.reviewFlags = normalizeRuleList(parseStringArray(input.reviewFlags) ?? []);
  }
  if (input.privateNotes !== undefined) {
    patch.privateNotes = normalizeOptionalText(asString(input.privateNotes));
  }
  if (input.aiSummary !== undefined) {
    patch.aiSummary = normalizeOptionalText(asString(input.aiSummary));
  }
  if (input.aiTags !== undefined) {
    patch.aiTags = normalizeRuleList(parseStringArray(input.aiTags) ?? []);
  }
  if (input.externalSource !== undefined || input.externalId !== undefined) {
    const externalKey = externalItemKeyFromInput(input);
    patch.externalSource = externalKey?.externalSource;
    patch.externalId = externalKey?.externalId;
  }
  if (input.measurementProvenance === undefined) {
    const inferredProvenance = inferredApiMeasurementProvenance(
      input,
      auth,
      now,
      existing,
    );
    if (inferredProvenance) {
      patch.measurementProvenance = inferredProvenance;
    }
  }
  return patch;
}

function plannedItemPatch(
  body: unknown,
  userId: Id<"users">
): Partial<Doc<"plannedItems">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"plannedItems">> = {
    updatedByUserId: userId,
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = normalizeItemName(String(input.name));
    if (!name) {
      throw new Error("name is required.");
    }
    patch.name = name;
    patch.normalizedName = normalizedSearchName(name);
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.subcategory !== undefined) {
    patch.subcategory = normalizeOptionalText(asString(input.subcategory));
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.dimensionsIn !== undefined) {
    patch.dimensionsIn = parseDimensionsIn(input.dimensionsIn);
  }
  if (input.dimensionsConfidence !== undefined) {
    patch.dimensionsConfidence = parsePlanningConfidence(
      input.dimensionsConfidence,
      "dimensionsConfidence"
    );
  }
  if (input.estimatedPriceCents !== undefined) {
    patch.estimatedPriceCents = optionalNumber(input.estimatedPriceCents);
  }
  if (input.url !== undefined) {
    patch.url = normalizeOptionalText(asString(input.url));
  }
  if (input.priority !== undefined) {
    patch.priority = normalizePlannedItemPriority(optionalNumber(input.priority));
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.status !== undefined) {
    patch.status = parsePlannedItemStatus(input.status) ?? "idea";
  }
  return patch;
}

function parseDimensionsIn(
  value: unknown
): Doc<"items">["dimensionsIn"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("dimensionsIn must be an object.");
  }
  const input = value as Record<string, unknown>;
  const dimensions = removeUndefined({
    lengthIn: optionalNumber(input.lengthIn),
    widthIn: optionalNumber(input.widthIn),
    heightIn: optionalNumber(input.heightIn),
  });
  return Object.keys(dimensions).length ? dimensions : undefined;
}

function boxPatch(body: unknown): Partial<Doc<"boxes">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"boxes">> = { updatedAt: Date.now() };
  if (input.code !== undefined) patch.code = normalizeBoxCode(String(input.code));
  if (input.label !== undefined) patch.label = normalizeOptionalText(asString(input.label));
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.status !== undefined) patch.status = parseBoxStatus(input.status);
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalNumber(input.estimatedWeightLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalNumber(input.estimatedVolumeCuFt);
  }
  return patch;
}

async function photoAttachPatch(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    reviewedByUserId: Id<"users">;
    body: unknown;
  }
): Promise<Partial<Doc<"itemPhotos">>> {
  const input = bodyObject(args.body);
  const now = Date.now();
  const patch: Partial<Doc<"itemPhotos">> = { updatedAt: now };

  if (input.itemId !== undefined) {
    const itemId = optionalString(input.itemId) as Id<"items"> | undefined;
    if (itemId) {
      await requireApiItem(ctx, args.householdId, args.moveId, itemId);
    }
    patch.itemId = itemId;
  }
  if (input.boxId !== undefined) {
    const boxId = optionalString(input.boxId) as Id<"boxes"> | undefined;
    if (boxId) {
      await requireApiBox(ctx, args.householdId, args.moveId, boxId);
    }
    patch.boxId = boxId;
  }
  if (input.spaceId !== undefined) {
    const spaceId = optionalString(input.spaceId) as Id<"moveSpaces"> | undefined;
    if (spaceId) {
      const space = await ctx.db.get(spaceId);
      if (
        !space ||
        space.householdId !== args.householdId ||
        space.moveId !== args.moveId ||
        space.status === "archived"
      ) {
        throw new Error("Space not found.");
      }
    }
    patch.spaceId = spaceId;
  }
  if (input.transportResourceId !== undefined) {
    const transportResourceId = optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined;
    if (transportResourceId) {
      const resource = await ctx.db.get(transportResourceId);
      if (
        !resource ||
        resource.householdId !== args.householdId ||
        resource.moveId !== args.moveId ||
        resource.archivedAt
      ) {
        throw new Error("Transport resource not found.");
      }
    }
    patch.transportResourceId = transportResourceId;
  }
  if (input.transportZoneId !== undefined) {
    const transportZoneId = optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined;
    if (transportZoneId) {
      const zone = await ctx.db.get(transportZoneId);
      if (
        !zone ||
        zone.householdId !== args.householdId ||
        zone.moveId !== args.moveId ||
        zone.archivedAt
      ) {
        throw new Error("Transport zone not found.");
      }
    }
    patch.transportZoneId = transportZoneId;
  }
  if (input.room !== undefined) {
    patch.room = normalizeOptionalText(asString(input.room));
  }
  if (input.claimId !== undefined) {
    patch.claimId = normalizeOptionalText(asString(input.claimId));
  }
  if (input.documentationProfileTypes !== undefined) {
    patch.documentationProfileTypes = parseDocumentationProfileTypes(
      input.documentationProfileTypes
    );
  }
  if (input.caption !== undefined) {
    patch.caption = normalizeOptionalText(asString(input.caption));
  }
  if (input.photoType !== undefined) {
    const photoType = parsePhotoType(input.photoType);
    if (!photoType) throw new Error("Unsupported photoType.");
    patch.photoType = photoType;
  }
  if (input.privacyLevel !== undefined) {
    const privacyLevel = parsePhotoPrivacyLevel(input.privacyLevel);
    if (!privacyLevel) throw new Error("Unsupported privacyLevel.");
    patch.privacyLevel = privacyLevel;
  }
  if (input.visibilityScope !== undefined) {
    const visibilityScope = parsePhotoVisibilityScope(input.visibilityScope);
    if (!visibilityScope) throw new Error("Unsupported visibilityScope.");
    patch.visibilityScope = visibilityScope;
  }
  if (input.source !== undefined) {
    const source = parsePhotoSource(input.source);
    if (!source) throw new Error("Unsupported source.");
    patch.source = source;
  }
  if (input.exifHandlingStatus !== undefined) {
    const exifHandlingStatus = parseExifHandlingStatus(input.exifHandlingStatus);
    if (!exifHandlingStatus) throw new Error("Unsupported exifHandlingStatus.");
    patch.exifHandlingStatus = exifHandlingStatus;
  }
  if (input.confidence !== undefined) {
    const confidence = parseConfidence(input.confidence);
    if (!confidence) throw new Error("Unsupported confidence.");
    patch.confidence = confidence;
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.verificationStatus !== undefined) {
    const verificationStatus = parsePhotoVerificationStatus(
      input.verificationStatus
    );
    if (!verificationStatus) throw new Error("Unsupported verificationStatus.");
    patch.verificationStatus = verificationStatus;
    patch.reviewedAt = now;
    patch.reviewedByUserId = args.reviewedByUserId;
  }
  if (input.aiProcessed !== undefined) {
    patch.aiProcessed = Boolean(input.aiProcessed);
  }
  if (input.capturedAt !== undefined) {
    patch.capturedAt = optionalNumber(input.capturedAt);
  }

  return patch;
}

async function auditApiWrite(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action: string,
  objectTable: string,
  objectId: string,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent(ctx, {
    householdId: auth.householdId,
    moveId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "apiKey",
    action,
    objectTable,
    objectId,
    metadata,
  });
}

async function auditApiDocumentationProfile(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action: string,
  documentationProfileId: Id<"documentationProfiles">,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent(ctx, {
    householdId: auth.householdId,
    moveId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "documentation",
    action,
    objectTable: "documentationProfiles",
    objectId: documentationProfileId,
    metadata,
  });
}

async function auditApiMovePerson(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action: string,
  personId: Id<"movePeople">,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent(ctx, {
    householdId: auth.householdId,
    moveId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "household",
    action,
    objectTable: "movePeople",
    objectId: personId,
    metadata,
  });
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown) {
  const number = optionalNumber(value);
  return number && number > 0 ? number : undefined;
}

function normalizePlannedItemPriority(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(4, Math.max(1, Math.round(value)));
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredBodyString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function requiredOps(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("ops must be an array.");
  }
  return value;
}

function structuredPlanOpError(error: unknown) {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as {
      code?: unknown;
      index?: unknown;
      reason?: unknown;
    };
    if (
      parsed.code === "plan_op_invalid" &&
      typeof parsed.index === "number" &&
      typeof parsed.reason === "string"
    ) {
      return {
        code: parsed.code,
        index: parsed.index,
        reason: parsed.reason,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeExternalKeyPart(value: unknown, label: string) {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.slice(0, 160) : undefined;
}

function externalItemKeyFromInput(input: Record<string, unknown>) {
  const hasSource = input.externalSource !== undefined;
  const hasId = input.externalId !== undefined;
  if (!hasSource && !hasId) return null;

  const externalSource = normalizeExternalKeyPart(
    input.externalSource,
    "externalSource"
  );
  const externalId = normalizeExternalKeyPart(input.externalId, "externalId");
  if (!externalSource && !externalId) return null;
  if (!externalSource || !externalId) {
    throw new Error("externalSource and externalId must be provided together.");
  }
  return { externalSource, externalId };
}

async function findApiItemByExternalKey(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  externalKey: { externalSource: string; externalId: string }
) {
  const item = await ctx.db
    .query("items")
    .withIndex("by_move_external_key", (q) =>
      q
        .eq("moveId", moveId)
        .eq("externalSource", externalKey.externalSource)
        .eq("externalId", externalKey.externalId)
    )
    .collect();
  return (
    item.find((entry) => entry.householdId === householdId && !entry.deletedAt) ??
    null
  );
}

async function assertExternalItemKeyAvailable(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: unknown,
  allowedItemId?: Id<"items">
) {
  const externalKey = externalItemKeyFromInput(bodyObject(input));
  if (!externalKey) return;
  const existing = await findApiItemByExternalKey(
    ctx,
    householdId,
    moveId,
    externalKey
  );
  if (existing && existing._id !== allowedItemId) {
    throw new Error("External source key already exists for this move.");
  }
}

function parseMoveStatus(value: unknown) {
  return includesLiteral(restMoveStatuses, value)
    ? (value as Doc<"moves">["status"])
    : undefined;
}

function parseMoveType(value: unknown) {
  return includesLiteral(moveTypes, value) ? (value as Doc<"moves">["type"]) : undefined;
}

function parseUnitSystem(value: unknown) {
  return value === "imperial" || value === "metric"
    ? (value as Doc<"moves">["unitSystem"])
    : undefined;
}

function parsePcsBranch(value: unknown) {
  return includesLiteral(pcsBranches, value)
    ? (value as Doc<"moves">["pcsBranch"])
    : undefined;
}

function parsePcsDependentStatus(value: unknown) {
  return includesLiteral(pcsDependentStatuses, value)
    ? (value as Doc<"moves">["pcsDependentStatus"])
    : undefined;
}

function parsePcsShipmentType(value: unknown) {
  return includesLiteral(pcsShipmentTypes, value)
    ? (value as Doc<"moves">["pcsShipmentType"])
    : undefined;
}

function parseItemStatus(value: unknown) {
  return includesLiteral(itemStatuses, value)
    ? (value as Doc<"items">["status"])
    : undefined;
}

function parsePlannedItemStatus(value: unknown) {
  return includesLiteral(restPlannedItemStatuses, value)
    ? (value as Doc<"plannedItems">["status"])
    : undefined;
}

function parseDisposition(value: unknown) {
  return includesLiteral(itemDispositions, value)
    ? (value as Doc<"items">["disposition"])
    : undefined;
}

function parseMoveSpaceKind(value: unknown) {
  return includesLiteral(moveSpaceKinds, value)
    ? (value as Doc<"moveSpaces">["kind"])
    : undefined;
}

function parseMoveSpaceStatus(value: unknown) {
  return value === "active" || value === "archived"
    ? (value as Doc<"moveSpaces">["status"])
    : undefined;
}

function parseSaleListingStatus(value: unknown) {
  return includesLiteral(saleListingStatuses, value)
    ? (value as Doc<"saleListings">["status"])
    : undefined;
}

function parseSaleListingPlatform(value: unknown) {
  return includesLiteral(saleListingPlatforms, value)
    ? (value as Doc<"saleListings">["platform"])
    : undefined;
}

function parseSaleResearchDepth(value: unknown) {
  return includesLiteral(saleResearchDepths, value)
    ? (value as Doc<"saleListings">["researchDepth"])
    : undefined;
}

function parseSaleResearchSources(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 25).map((entry) => {
    const source = bodyObject(entry);
    return {
      title: normalizeOptionalText(asString(source.title)),
      url: normalizeOptionalText(asString(source.url)),
      summary: normalizeOptionalText(asString(source.summary)),
      priceCents: optionalNumber(source.priceCents),
      checkedAt: optionalNumber(source.checkedAt),
    };
  });
}

function parsePhotoIdArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 20) as Id<"itemPhotos">[];
}

function saleListingPatchFromBody(
  body: Record<string, unknown>,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
): Partial<Doc<"saleListings">> {
  const patch: Partial<Doc<"saleListings">> = {};
  if (body.status !== undefined) {
    patch.status = parseSaleListingStatus(body.status) ?? "needsPrep";
  }
  if (body.platform !== undefined) {
    patch.platform = parseSaleListingPlatform(body.platform) ?? "facebookMarketplace";
  }
  if (body.platformLabel !== undefined) {
    patch.platformLabel = normalizeOptionalText(asString(body.platformLabel));
  }
  if (body.listingTitle !== undefined) {
    patch.listingTitle = normalizeOptionalText(asString(body.listingTitle));
  }
  if (body.listingDescription !== undefined) {
    patch.listingDescription = normalizeOptionalText(asString(body.listingDescription));
  }
  if (body.category !== undefined) {
    patch.category = normalizeOptionalText(asString(body.category));
  }
  if (body.condition !== undefined) {
    patch.condition = normalizeOptionalText(asString(body.condition));
  }
  if (body.locationLabel !== undefined) {
    patch.locationLabel = normalizeOptionalText(asString(body.locationLabel));
  }
  if (body.selectedPhotoIds !== undefined) {
    patch.selectedPhotoIds = parsePhotoIdArray(body.selectedPhotoIds) ?? [];
  }
  if (body.listingUrl !== undefined) {
    patch.listingUrl = normalizeOptionalText(asString(body.listingUrl));
  }
  if (body.listedAt !== undefined) patch.listedAt = optionalNumber(body.listedAt);
  if (body.lastRefreshedAt !== undefined) {
    patch.lastRefreshedAt = optionalNumber(body.lastRefreshedAt);
  }
  if (body.suggestedPriceLowCents !== undefined) {
    patch.suggestedPriceLowCents = optionalNumber(body.suggestedPriceLowCents);
  }
  if (body.suggestedPriceHighCents !== undefined) {
    patch.suggestedPriceHighCents = optionalNumber(body.suggestedPriceHighCents);
  }
  if (body.officialPriceCents !== undefined) {
    patch.officialPriceCents = optionalNumber(body.officialPriceCents);
  }
  if (body.currency !== undefined) {
    const currency = normalizeOptionalText(asString(body.currency))?.toUpperCase();
    patch.currency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  }
  if (body.pricingConfidence !== undefined) {
    patch.pricingConfidence = parseConfidence(body.pricingConfidence) ?? "none";
  }
  if (body.priceDecisionSource !== undefined) {
    patch.priceDecisionSource = normalizeOptionalText(asString(body.priceDecisionSource));
  }
  if (body.userOverrodePrice !== undefined) {
    patch.userOverrodePrice = Boolean(body.userOverrodePrice);
  }
  if (body.researchDepth !== undefined) {
    patch.researchDepth = parseSaleResearchDepth(body.researchDepth) ?? "none";
  }
  if (body.researchSources !== undefined) {
    patch.researchSources = parseSaleResearchSources(body.researchSources) ?? [];
    patch.researchSourceCount = patch.researchSources.length;
  }
  if (body.researchSourceCount !== undefined) {
    patch.researchSourceCount = Math.max(
      0,
      Math.floor(optionalNumber(body.researchSourceCount) ?? 0),
    );
  }
  if (
    body.researchDepth !== undefined ||
    body.researchSources !== undefined ||
    body.researchSourceCount !== undefined ||
    body.researchNotes !== undefined
  ) {
    patch.researchedAt = optionalNumber(body.researchedAt) ?? Date.now();
    patch.researchedByApiKeyId = auth.apiKeyId;
    patch.researchedByLabel = `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`;
  }
  if (body.researchNotes !== undefined) {
    patch.researchNotes = normalizeOptionalText(asString(body.researchNotes));
  }
  if (body.interestedCount !== undefined) {
    patch.interestedCount = Math.max(
      0,
      Math.floor(optionalNumber(body.interestedCount) ?? 0),
    );
  }
  if (body.inquiryNotes !== undefined) {
    patch.inquiryNotes = normalizeOptionalText(asString(body.inquiryNotes));
  }
  if (body.offerNotes !== undefined) {
    patch.offerNotes = normalizeOptionalText(asString(body.offerNotes));
  }
  if (body.buyerNotes !== undefined) {
    patch.buyerNotes = normalizeOptionalText(asString(body.buyerNotes));
  }
  if (body.pickupStatus !== undefined) {
    patch.pickupStatus = normalizeOptionalText(asString(body.pickupStatus));
  }
  if (body.soldPriceCents !== undefined) {
    patch.soldPriceCents = optionalNumber(body.soldPriceCents);
  }
  if (body.soldAt !== undefined) patch.soldAt = optionalNumber(body.soldAt);
  if (body.needsMorePhotos !== undefined) {
    patch.needsMorePhotos = Boolean(body.needsMorePhotos);
  }
  return patch;
}

function parseCondition(value: unknown) {
  return includesLiteral(itemConditions, value)
    ? (value as Doc<"items">["condition"])
    : undefined;
}

function parseBoxStatus(value: unknown) {
  return includesLiteral(boxStatuses, value)
    ? (value as Doc<"boxes">["status"])
    : undefined;
}

function parseMovePersonRole(value: unknown) {
  return includesLiteral(restMovePersonRoles, value)
    ? (value as Doc<"movePeople">["role"])
    : undefined;
}

function parsePhotoType(value: unknown) {
  return includesLiteral(photoTypes, value)
    ? (value as Doc<"itemPhotos">["photoType"])
    : undefined;
}

function parsePhotoPrivacyLevel(value: unknown) {
  return includesLiteral(photoPrivacyLevels, value)
    ? (value as Doc<"itemPhotos">["privacyLevel"])
    : undefined;
}

function parsePhotoVisibilityScope(value: unknown) {
  return includesLiteral(photoVisibilityScopes, value)
    ? (value as Doc<"itemPhotos">["visibilityScope"])
    : undefined;
}

function parsePhotoSource(value: unknown) {
  return includesLiteral(photoSources, value)
    ? (value as Doc<"itemPhotos">["source"])
    : undefined;
}

function parseExifHandlingStatus(value: unknown) {
  return includesLiteral(exifHandlingStatuses, value)
    ? (value as Doc<"itemPhotos">["exifHandlingStatus"])
    : undefined;
}

function parsePhotoVerificationStatus(value: unknown) {
  return includesLiteral(photoVerificationStatuses, value)
    ? (value as Doc<"itemPhotos">["verificationStatus"])
    : undefined;
}

function parseConfidence(value: unknown) {
  return includesLiteral(restEstimateConfidences, value)
    ? (value as Doc<"itemPhotos">["confidence"])
    : undefined;
}

function parsePlanningSuggestionStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restPlanningSuggestionStatuses, value)) {
    throw new Error("Unsupported planning suggestion status.");
  }
  return value as Doc<"aiPlanningSuggestions">["status"];
}

function parseAiJobStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restAiJobStatuses, value)) {
    throw new Error("Unsupported AI job status.");
  }
  return value as Doc<"aiJobs">["status"];
}

function parseAiSuggestionStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restAiSuggestionStatuses, value)) {
    throw new Error("Unsupported AI suggestion status.");
  }
  return value as Doc<"aiTextSuggestions">["status"];
}

function parsePlanningApprovals(body: unknown): PlanningSuggestionApprovalInput[] {
  const input = bodyObject(body);
  const rows = Array.isArray(input.approvals) ? input.approvals : [];
  if (!rows.length) {
    throw new Error("approvals must include at least one suggestion.");
  }
  if (rows.length > 100) {
    throw new Error("Planning suggestion approvals are limited to 100 rows.");
  }
  return rows.map((row) => {
    const approval = bodyObject(row);
    const suggestionId = optionalString(approval.suggestionId);
    if (!suggestionId) {
      throw new Error("approval.suggestionId is required.");
    }
    return {
      suggestionId: suggestionId as Id<"aiPlanningSuggestions">,
      estimateDraft: parseEstimateDraftPatch(approval.estimateDraft),
      assignmentDraft: parseAssignmentDraftPatch(approval.assignmentDraft),
      assignmentOverrideReason: normalizeOptionalText(
        asString(approval.assignmentOverrideReason)
      ),
    };
  });
}

function parseEstimateDraftPatch(
  value: unknown
): PlanningSuggestionApprovalInput["estimateDraft"] {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  return removeUndefined({
    category: normalizeOptionalText(asString(input.category)),
    estimatedWeightLb: optionalNumber(input.estimatedWeightLb),
    estimatedWeightLowLb: optionalNumber(input.estimatedWeightLowLb),
    estimatedWeightHighLb: optionalNumber(input.estimatedWeightHighLb),
    estimatedVolumeCuFt: optionalNumber(input.estimatedVolumeCuFt),
    estimatedPackedVolumeCuFt: optionalNumber(input.estimatedPackedVolumeCuFt),
    weightConfidence: parsePlanningConfidence(
      input.weightConfidence,
      "estimateDraft.weightConfidence"
    ),
    volumeConfidence: parsePlanningConfidence(
      input.volumeConfidence,
      "estimateDraft.volumeConfidence"
    ),
  });
}

function parseAssignmentDraftPatch(
  value: unknown
): PlanningSuggestionApprovalInput["assignmentDraft"] {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  return removeUndefined({
    assignedResourceId: optionalString(input.assignedResourceId) as
      | Id<"transportResources">
      | undefined,
    assignedZoneId: optionalString(input.assignedZoneId) as
      | Id<"transportZones">
      | undefined,
    assignmentWarnings: parseStringArray(input.assignmentWarnings),
    assignmentHardBlocks: parseStringArray(input.assignmentHardBlocks),
    weightPercent: optionalNumber(input.weightPercent),
    volumePercent: optionalNumber(input.volumePercent),
    overrideReason: normalizeOptionalText(asString(input.overrideReason)),
  });
}

function parsePlanningConfidence(value: unknown, label: string) {
  if (value === undefined || value === "") return undefined;
  if (value === "estimated") return "low";
  if (!includesLiteral(restEstimateConfidences, value)) {
    throw new Error(`Unsupported ${label}.`);
  }
  return value as Doc<"aiPlanningSuggestions">["confidence"];
}

function parseFragility(value: unknown): Doc<"items">["fragility"] | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(itemFragilities, value)) {
    throw new Error("Unsupported fragility.");
  }
  return value as Doc<"items">["fragility"];
}

function parsePlanningDefaultKeys(
  value: unknown,
): Doc<"items">["planningDefaultKeys"] | undefined {
  return parseLiteralArray(
    value,
    planningDefaultKeys,
    "planningDefaultKeys",
  ) as Doc<"items">["planningDefaultKeys"] | undefined;
}

function parseDocumentationProfileTypes(value: unknown) {
  const values = parseStringArray(value)?.filter((entry) =>
    includesLiteral(documentationProfileTypes, entry)
  ) as (typeof documentationProfileTypes)[number][] | undefined;
  return normalizeDocumentationProfileTypes(values);
}

function parseExportJobType(value: unknown) {
  return includesLiteral(restExportJobTypes, value)
    ? (value as RestExportJobType)
    : undefined;
}

function parseDocumentationProfileType(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(documentationProfileTypes, value)) {
    throw new Error("Unsupported documentation profile type.");
  }
  return value as DocumentationProfileType;
}

function parseDocumentationProfileStatus(
  value: unknown
): DocumentationProfileStatus | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(documentationProfileStatuses, value)) {
    throw new Error("Unsupported documentation profile status.");
  }
  return value as DocumentationProfileStatus;
}

function parseDocumentationFieldKeys(
  value: unknown
): DocumentationFieldKey[] | undefined {
  return parseLiteralArray(
    value,
    documentationFieldKeys,
    "includedFields"
  ) as DocumentationFieldKey[] | undefined;
}

function parseDocumentationImageRule(
  value: unknown
): DocumentationImageRule | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(documentationImageRules, value)) {
    throw new Error("Unsupported documentation imageRule.");
  }
  return value as DocumentationImageRule;
}

function parseDocumentationFilters(value: unknown): DocumentationFilters | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("filters must be an object.");
  }
  const input = bodyObject(value);
  return normalizeDocumentationFilters({
    dispositions: parseLiteralArray(
      input.dispositions,
      itemDispositions,
      "filters.dispositions"
    ),
    statuses: parseLiteralArray(input.statuses, itemStatuses, "filters.statuses"),
    planningDefaultKeys: parseLiteralArray(
      input.planningDefaultKeys,
      planningDefaultKeys,
      "filters.planningDefaultKeys"
    ),
    room: asString(input.room),
    destinationRoom: asString(input.destinationRoom),
  });
}

function parseLiteralArray<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string
): TValue[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  const entries: TValue[] = [];
  for (const entry of value) {
    if (!includesLiteral(allowed, entry)) {
      throw new Error(`Unsupported ${label} value.`);
    }
    entries.push(entry as TValue);
  }
  return Array.from(new Set(entries));
}

function parseShareLinkStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkStatuses, value)) {
    throw new Error("Unsupported share link status.");
  }
  return value as (typeof restShareLinkStatuses)[number];
}

function parseShareLinkScope(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkScopes, value)) {
    throw new Error("Unsupported share link scope.");
  }
  return value as (typeof restShareLinkScopes)[number];
}

function parseShareLinkRole(value: unknown): ShareLinkRole | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(restShareLinkRoles, value)) {
    throw new Error("Unsupported share link role.");
  }
  return value as ShareLinkRole;
}

function parseShareLinkActions(value: unknown): ShareLinkAction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("allowedActions must be an array.");
  }
  const actions: ShareLinkAction[] = [];
  for (const action of value) {
    if (!includesLiteral(shareLinkActions, action)) {
      throw new Error("Unsupported share link action.");
    }
    actions.push(action as ShareLinkAction);
  }
  return Array.from(new Set(actions));
}

function parseTransportResourceType(value: unknown) {
  return includesLiteral(transportResourceTypes, value)
    ? (value as Doc<"transportResources">["type"])
    : undefined;
}

function parseTransportResourcePresetKey(value: unknown) {
  return includesLiteral(transportResourcePresetKeys, value)
    ? (value as (typeof transportResourcePresetKeys)[number])
    : undefined;
}

function parseCapacityReviewStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (value === "unreviewed" || value === "estimated" || value === "confirmed") {
    return value;
  }
  throw new Error("Invalid capacityReviewStatus.");
}

function parseCapacity(value: unknown):
  | Doc<"transportResources">["capacity"]
  | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const capacity: Doc<"transportResources">["capacity"] = {};
  const maxWeightLb = optionalNumber(input.maxWeightLb);
  const maxVolumeCuFt = optionalNumber(input.maxVolumeCuFt);
  const maxItemCount = optionalNumber(input.maxItemCount);
  if (maxWeightLb !== undefined) capacity.maxWeightLb = maxWeightLb;
  if (maxVolumeCuFt !== undefined) capacity.maxVolumeCuFt = maxVolumeCuFt;
  if (maxItemCount !== undefined) capacity.maxItemCount = maxItemCount;
  if (input.weightIsUnlimited !== undefined) {
    capacity.weightIsUnlimited = Boolean(input.weightIsUnlimited);
  }
  if (input.volumeIsUnlimited !== undefined) {
    capacity.volumeIsUnlimited = Boolean(input.volumeIsUnlimited);
  }

  if (
    input.dimensions &&
    typeof input.dimensions === "object" &&
    !Array.isArray(input.dimensions)
  ) {
    const dimensionsInput = input.dimensions as Record<string, unknown>;
    const dimensions: NonNullable<
      Doc<"transportResources">["capacity"]["dimensions"]
    > = {};
    const lengthIn = optionalNumber(dimensionsInput.lengthIn);
    const widthIn = optionalNumber(dimensionsInput.widthIn);
    const heightIn = optionalNumber(dimensionsInput.heightIn);
    if (lengthIn !== undefined) dimensions.lengthIn = lengthIn;
    if (widthIn !== undefined) dimensions.widthIn = widthIn;
    if (heightIn !== undefined) dimensions.heightIn = heightIn;
    if (Object.keys(dimensions).length) {
      capacity.dimensions = dimensions;
    }
  }

  return capacity;
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

function parseIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of IDs.");
  }
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  if (ids.length !== value.length) {
    throw new Error("ID arrays may only contain strings.");
  }
  return ids;
}

function removeUndefined<TValue extends Record<string, unknown>>(value: TValue) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as {
    [TKey in keyof TValue as undefined extends TValue[TKey] ? TKey : TKey]:
      | Exclude<TValue[TKey], undefined>
      | undefined;
  };
}

function capacityPercent({
  used,
  max,
  unlimited,
}: {
  used: number;
  max?: number;
  unlimited?: boolean;
}) {
  return max && !unlimited ? roundEstimate((used / max) * 100) : undefined;
}

function mergeCapacity(
  resourceCapacity: Doc<"transportResources">["capacity"],
  zoneCapacity?: Doc<"transportZones">["capacity"]
) {
  if (!zoneCapacity) {
    return resourceCapacity;
  }

  return {
    maxWeightLb: minOptional(
      resourceCapacity.maxWeightLb,
      zoneCapacity.maxWeightLb
    ),
    maxVolumeCuFt: minOptional(
      resourceCapacity.maxVolumeCuFt,
      zoneCapacity.maxVolumeCuFt
    ),
    maxItemCount: minOptional(
      resourceCapacity.maxItemCount,
      zoneCapacity.maxItemCount
    ),
    dimensions: {
      lengthIn: minOptional(
        resourceCapacity.dimensions?.lengthIn,
        zoneCapacity.dimensions?.lengthIn
      ),
      widthIn: minOptional(
        resourceCapacity.dimensions?.widthIn,
        zoneCapacity.dimensions?.widthIn
      ),
      heightIn: minOptional(
        resourceCapacity.dimensions?.heightIn,
        zoneCapacity.dimensions?.heightIn
      ),
    },
    weightIsUnlimited:
      resourceCapacity.weightIsUnlimited === true &&
      zoneCapacity.weightIsUnlimited === true,
    volumeIsUnlimited:
      resourceCapacity.volumeIsUnlimited === true &&
      zoneCapacity.volumeIsUnlimited === true,
  };
}

function minOptional(first?: number, second?: number) {
  if (typeof first !== "number") return second;
  if (typeof second !== "number") return first;
  return Math.min(first, second);
}

function includesLiteral(values: readonly string[], value: unknown) {
  return typeof value === "string" && values.includes(value);
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid api key") || message.includes("bearer")) return 401;
  if (message.includes("not allowed") || message.includes("scope")) return 403;
  if (message.includes("not found")) return 404;
  if (message.includes("idempotency") || message.includes("already exists")) {
    return 409;
  }
  return 400;
}
