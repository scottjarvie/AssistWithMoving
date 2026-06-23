import { anyApi, type FunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { authenticateApiKey } from "./lib/apiKeyAuth";
import { appRoleForEmail } from "./lib/admin";
import { apiKeyScopes, hashApiKey, type ApiKeyScope } from "./lib/apiKeys";
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
import {
  canTransitionIngestionStatus,
  allIngestionScopeHints,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionQueueIntents,
  ingestionScopeHintMatches,
  normalizeIngestionScopeHint,
  type IngestionScopeHint,
  type IngestionQueueIntent,
  type IngestionQueueStatus,
} from "./lib/ingestionQueue";
import { mediaKindForMimeType } from "./lib/mediaStorage";
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
  canMembershipUseApiAccess,
  defaultMemberApiAccessStatus,
  effectiveMemberApiAccessStatus,
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "./lib/householdMembers";
import {
  addOrInviteHouseholdMemberByEmail,
  claimPendingHouseholdInvitationsForUser,
} from "./lib/householdInvitations";
import { canPerformHouseholdAction, type PermissionAction } from "./lib/roles";
import {
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
import { selectDerivativeRef } from "./lib/photoDelivery";
import { suggestAssignmentForBox } from "./lib/planningSuggestions";
import { parseTextIntakeSuggestions } from "./lib/textIntakeParser";
import { getTransportResourcePreset } from "./lib/transportPresets";
import { insertMissingMovePlanningDefaults } from "./movePlanningDefaults";
import { defaultPlanShortIdCounters } from "./lib/planValidators";
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
  floorplanSolveToPlanOps,
  solveFloorplanPuzzle,
  type FloorplanPuzzleInput,
} from "../src/lib/floorplans/solver";
import type {
  FloorplanConfidence,
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanSolveDiagnostic,
} from "../src/lib/floorplans/types";
import {
  bearerToken,
  bodyRecord as bodyObject,
  moveIdFromRestBodyOrQuery,
  moveIdFromRestRequest,
  paginate,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
  restBoxCreateFields,
  restBoxPatch,
  restAssignmentFields,
  isLooseMovableUnitRestItem,
  restMovableUnitSummary,
  normalizeRestBoxCode,
  restAgentAttributionFields,
  restPrivateItemNoteAppendPatch,
  mergeRestItemResearchSources,
  restResponseErrorSummary,
  restMovableUnitLooseItemFailureRows,
  oauthNeedsHouseholdContextPayload,
  restMeContextPayload,
  restError,
  restErrorFromUnknown,
  restOk,
  safeRestBox,
  restApiRateLimit,
  restRateLimitResult,
  restRateLimitWindowStart,
  restRateLimited,
  withRestRateLimitHeaders,
  invalidField,
  RestApiError,
  type RestRequestInput,
  type RestRateLimitResult,
  type RestResponse,
} from "./lib/restApi";

const restMoveStatuses = [
  "planning",
  "active",
  "completed",
  "archived",
] as const;
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
const restPhotoDerivativeVariants = [
  "thumb",
  "card",
  "detail",
  "full",
] as const;
const restEstimateConfidences = [
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
] as const;
const restItemResearchSourceStatuses = [
  "used",
  "checked",
  "blocked",
  "gated",
  "failed",
  "notRelevant",
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
const restIngestionQueueStatuses = [
  "queued",
  "claimed",
  "processed",
  "needsInput",
  "resolved",
  "discarded",
] as const;
const restFloorplanEvidenceTypes = [
  "measurement",
  "knownFact",
  "assumption",
  "conflict",
  "note",
] as const;
const restFloorplanEvidenceSourceTypes = [
  "image",
  "textNote",
  "userEdit",
  "agentExtraction",
  "calculation",
] as const;
const restFloorplanMeasurementKinds = [
  "known",
  "assumption",
  "derived",
  "range",
] as const;
const restFloorplanMeasurementTypes = [
  "width",
  "depth",
  "clearWidth",
  "clearDepth",
  "height",
  "area",
  "grossArea",
  "conditionedArea",
  "excludedArea",
  "lotArea",
  "footprintArea",
  "perimeter",
  "exteriorWidth",
  "exteriorDepth",
  "areaVariance",
  "span",
  "wallThickness",
  "openingWidth",
  "fixtureOffset",
  "clearance",
  "unknown",
] as const;
const restFloorplanSpaceKinds = [
  "room",
  "hall",
  "closet",
  "bath",
  "utility",
  "kitchen",
  "circulation",
  "garage",
  "carport",
  "patio",
  "deck",
  "porch",
  "shed",
  "yard",
  "outdoor",
] as const;
const restFloorplanPropertyZoneKinds = [
  "houseShell",
  "garage",
  "carport",
  "patio",
  "deck",
  "porch",
  "shed",
  "yard",
  "driveway",
  "garden",
  "fence",
  "lot",
  "custom",
] as const;
const restFloorplanAreaRoles = [
  "conditioned",
  "unconditioned",
  "excluded",
  "outdoor",
  "unknown",
] as const;
const restFloorplanConstraintStrengths = [
  "hard",
  "strong",
  "soft",
  "displayOnly",
] as const;
const restFloorplanMeasurementUnits = [
  "in",
  "ft",
  "sqft",
  "acre",
  "percent",
  "count",
] as const;
const restFloorplanConnectionKinds = [
  "door",
  "opening",
  "hall",
  "throughRoom",
  "unknown",
] as const;
const restFloorplanMeasurementSubjectTypes = [
  "plan",
  "level",
  "room",
  "structure",
  "areaGroup",
  "lot",
  "zone",
  "shell",
  "opening",
  "fixture",
  "path",
] as const;
const restFloorplanObservationTypes = [
  "label",
  "ocrText",
  "measurementText",
  "roomName",
  "wallSegment",
  "opening",
  "door",
  "doorway",
  "doorlessPassage",
  "window",
  "fixture",
  "closet",
  "hall",
  "exteriorStructure",
  "patio",
  "carport",
  "shed",
  "lotFeature",
  "orientationClue",
  "areaTarget",
  "unknownMark",
  "sourceNote",
] as const;
const restFloorplanObservationStatuses = [
  "active",
  "needsReview",
  "superseded",
  "rejected",
] as const;
const restFloorplanRelationshipTypes = [
  "adjacentTo",
  "connectedTo",
  "contains",
  "partOf",
  "leftOf",
  "rightOf",
  "above",
  "below",
  "sameAs",
  "conflictsWith",
  "openingIn",
  "countsTowardArea",
  "excludedFromArea",
  "accessesThrough",
  "doorlessPassageBetween",
  "wallSharedWith",
] as const;
const restFloorplanSubjectKinds = [
  "room",
  "hall",
  "closet",
  "bathroom",
  "kitchen",
  "fixture",
  "opening",
  "wall",
  "structure",
  "zone",
  "lot",
  "unknown",
] as const;
const restMovePersonRoles = [
  "owner",
  "householdMember",
  "helper",
  "mover",
  "contact",
] as const;
const maxBatchUpsertItems = 100;
const defaultSectionLimit = 100;
const maxSectionLimit = 500;
const defaultSectionLimits = {
  resources: 100,
  zones: 100,
  people: 100,
  spaces: 100,
  items: 100,
  boxes: 200,
  assignments: 200,
  photos: 100,
  planningSuggestions: 100,
  documentationProfiles: 100,
  exports: 100,
  shareLinks: 100,
  salePipeline: 100,
  layoutPlans: 100,
  transportResources: 100,
  transportZones: 100,
} as const;
type ApiSectionName = keyof typeof defaultSectionLimits;
type ApiSectionOptions = {
  sections?: Set<string>;
  maxPerSection?: number;
};

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

const restOAuthIdentityValidator = v.object({
  tokenIdentifier: v.string(),
  subject: v.string(),
  issuer: v.string(),
  oauthClientId: v.optional(v.string()),
  oauthTokenId: v.optional(v.string()),
  name: v.optional(v.string()),
  pictureUrl: v.optional(v.string()),
  email: v.optional(v.string()),
});

export const handle = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE"),
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    body: v.optional(v.any()),
    oauthIdentity: v.optional(restOAuthIdentityValidator),
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

    const bearerTokenValue = bearerToken(args.authorization);
    if (!bearerTokenValue && !args.oauthIdentity) {
      return restError({
        status: 401,
        code: "unauthorized",
        message: "Use a Bearer API key or OAuth access token.",
      });
    }

    try {
      const moveId = moveIdFromRestRequest({
        segments,
        body: args.body,
        query: args.query,
      }) as Id<"moves"> | undefined;
      const action = `${args.method} /api/v1/${segments.join("/")}`;
      const oauthMeOnboarding = await routeOAuthMeOnboardingIfNeeded(ctx, {
        args,
        segments,
        bearerTokenValue,
      });
      if (oauthMeOnboarding) {
        return oauthMeOnboarding;
      }
      const auth = bearerTokenValue?.startsWith("mmk_")
        ? await authenticateApiKey(ctx, {
            rawKey: bearerTokenValue,
            requiredScopes,
            moveId,
            action,
            allowRestrictedKeyWithoutMoveId:
              segments[0] === "me" || segments[0] === "plans",
          })
        : await authenticateOAuthRestActor(ctx, {
            identity: args.oauthIdentity,
            requiredScopes,
            moveId,
            householdId: householdIdFromRestRequest(ctx, args),
            action,
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
        routeRequest(ctx, args, segments, auth),
      );
      return withRestRateLimitHeaders(response, rateLimit);
    } catch (error) {
      return restErrorFromUnknown(error);
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
      v.literal("DELETE"),
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    body: v.optional(v.any()),
    moveId: v.optional(v.string()),
    oauthIdentity: v.optional(restOAuthIdentityValidator),
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

    const bearerTokenValue = bearerToken(args.authorization);
    if (!bearerTokenValue && !args.oauthIdentity) {
      return {
        ok: false,
        response: restError({
          status: 401,
          code: "unauthorized",
          message: "Use a Bearer API key or OAuth access token.",
        }),
      };
    }

    try {
      const moveId = args.moveId
        ? (args.moveId as Id<"moves">)
        : (moveIdFromRestRequest({
            segments,
            body: args.body,
            query: args.query,
          }) as Id<"moves"> | undefined);
      const action = `${args.method} /api/v1/${segments.join("/")}`;
      const auth = bearerTokenValue?.startsWith("mmk_")
        ? await authenticateApiKey(ctx, {
            rawKey: bearerTokenValue,
            requiredScopes,
            moveId,
            action,
          })
        : await authenticateOAuthRestActor(ctx, {
            identity: args.oauthIdentity,
            requiredScopes,
            moveId,
            householdId: householdIdFromRestRequest(ctx, args),
            action,
          });
      return { ok: true, auth, segments };
    } catch (error) {
      return {
        ok: false,
        response: restErrorFromUnknown(error),
      };
    }
  },
});

async function routeOAuthMeOnboardingIfNeeded(
  ctx: MutationCtx,
  {
    args,
    segments,
    bearerTokenValue,
  }: {
    args: RestRequestInput;
    segments: string[];
    bearerTokenValue: string | null;
  },
) {
  if (
    args.method !== "GET" ||
    segments.length !== 1 ||
    segments[0] !== "me" ||
    bearerTokenValue?.startsWith("mmk_") ||
    !args.oauthIdentity?.oauthClientId
  ) {
    return null;
  }

  const user = await getOrCreateOAuthRestUser(ctx, args.oauthIdentity);
  const activeMemberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", user._id).eq("status", "active"),
    )
    .take(1);
  if (activeMemberships.length > 0) {
    return null;
  }

  return restOk(
    oauthNeedsHouseholdContextPayload({
      userId: user._id,
      email: user.email,
      name: user.name,
    }),
  );
}

async function authenticateOAuthRestActor(
  ctx: MutationCtx,
  {
    identity,
    requiredScopes,
    householdId,
    moveId,
    action,
  }: {
    identity: RestRequestInput["oauthIdentity"];
    requiredScopes: readonly ApiKeyScope[];
    householdId?: Id<"households">;
    moveId?: Id<"moves">;
    action: string;
  },
) {
  if (!identity) {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "OAuth access token was not accepted by MovingManifest.",
    });
  }
  if (!identity.oauthClientId) {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "OAuth access token is missing a client identity.",
    });
  }

  const user = await getOrCreateOAuthRestUser(ctx, identity);
  const effectiveHouseholdId = await resolveOAuthHouseholdId(ctx, {
    userId: user._id,
    householdId,
    moveId,
  });
  const membership = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household_user", (q) =>
      q.eq("householdId", effectiveHouseholdId).eq("userId", user._id),
    )
    .unique();

  if (!membership || membership.status !== "active") {
    throw new RestApiError({
      status: 403,
      code: "forbidden",
      message: "OAuth user is not an active member of this household.",
    });
  }
  if (
    !canMembershipUseApiAccess({
      role: membership.role,
      status: membership.status,
      apiAccessStatus: membership.apiAccessStatus,
    })
  ) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API access is disabled for this household member.",
    });
  }

  for (const permission of permissionActionsForApiScopes(requiredScopes)) {
    if (!canPerformHouseholdAction(membership.role, permission)) {
      throw new RestApiError({
        status: 403,
        code: "insufficient_scope",
        message: `OAuth user lacks ${permission} permission for this household.`,
      });
    }
  }

  const connection = await getOrCreateOAuthApiConnection(ctx, {
    householdId: effectiveHouseholdId,
    userId: user._id,
    oauthClientId: identity.oauthClientId,
  });
  if (connection.status !== "active") {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "OAuth MCP connection has been revoked.",
    });
  }

  const now = Date.now();
  await ctx.db.patch(connection._id, {
    lastUsedAt: now,
    lastUsedAction: action,
    updatedAt: now,
  });

  return {
    actor: {
      type: "apiKey" as const,
      apiKeyId: String(connection._id),
      scopes: connection.scopes,
    },
    connectionType: "oauth" as const,
    apiKeyId: connection._id,
    apiKeyName: connection.name,
    apiKeyTokenPreview: connection.tokenPreview,
    createdByUserId: user._id,
    householdId: effectiveHouseholdId,
    moveId: undefined,
    scopes: connection.scopes,
  };
}

async function getOrCreateOAuthRestUser(
  ctx: MutationCtx,
  identity: NonNullable<RestRequestInput["oauthIdentity"]>,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  const email = identity.email;
  const name = identity.name;
  const imageUrl = identity.pictureUrl;

  if (existing) {
    await ctx.db.patch(existing._id, {
      email,
      name,
      imageUrl,
      appRole: appRoleForEmail(email, existing.appRole),
      updatedAt: now,
      lastSeenAt: now,
    });
    await claimPendingHouseholdInvitationsForUser(ctx, {
      userId: existing._id,
      email,
      actorType: "user",
    });
    return { ...existing, email, name, imageUrl };
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email,
    name,
    imageUrl,
    appRole: appRoleForEmail(email),
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
  await claimPendingHouseholdInvitationsForUser(ctx, {
    userId,
    email,
    actorType: "user",
  });
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("OAuth user creation failed.");
  }
  return user;
}

async function resolveOAuthHouseholdId(
  ctx: MutationCtx,
  {
    userId,
    householdId,
    moveId,
  }: {
    userId: Id<"users">;
    householdId?: Id<"households">;
    moveId?: Id<"moves">;
  },
) {
  if (moveId) {
    const move = await ctx.db.get(moveId);
    if (move && move.status !== "archived") {
      return move.householdId;
    }
  }
  if (householdId) {
    return householdId;
  }

  const memberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );
  if (activeMemberships.length === 0) {
    throw new RestApiError({
      status: 403,
      code: "forbidden",
      message: "OAuth user does not belong to an active household.",
    });
  }
  return activeMemberships[0].householdId;
}

async function getOrCreateOAuthApiConnection(
  ctx: MutationCtx,
  {
    householdId,
    userId,
    oauthClientId,
  }: {
    householdId: Id<"households">;
    userId: Id<"users">;
    oauthClientId: string;
  },
) {
  const prefix = `oauth_${userId}_${householdId}_${oauthClientId}`;
  const existingConnections = await ctx.db
    .query("apiKeys")
    .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
    .collect();
  const activeConnection = existingConnections.find(
    (connection) => connection.status === "active",
  );
  if (activeConnection) return activeConnection;
  if (
    existingConnections.some((connection) => connection.status === "revoked")
  ) {
    throw new RestApiError({
      status: 401,
      code: "unauthorized",
      message: "OAuth MCP connection has been revoked.",
    });
  }

  const now = Date.now();
  const apiKeyId = await ctx.db.insert("apiKeys", {
    householdId,
    name: "OAuth MCP connection",
    prefix,
    tokenPreview: "OAuth connection",
    secretHash: await hashApiKey(`${prefix}:not-a-usable-secret`),
    scopes: [...apiKeyScopes],
    status: "active",
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId,
    actorType: "user",
    actorUserId: userId,
    category: "apiKey",
    action: "oauth_mcp_connection.created",
    objectTable: "apiKeys",
    objectId: apiKeyId,
    metadata: { scopes: [...apiKeyScopes], oauthClientId },
  });

  const created = await ctx.db.get(apiKeyId);
  if (!created) {
    throw new Error("OAuth MCP connection creation failed.");
  }
  return created;
}

function householdIdFromRestRequest(
  ctx: MutationCtx,
  args: Pick<RestRequestInput, "body" | "query">,
) {
  const body = bodyObject(args.body);
  const candidate =
    typeof body.householdId === "string"
      ? body.householdId
      : args.query.householdId;
  if (!candidate) return undefined;
  return ctx.db.normalizeId("households", candidate) ?? undefined;
}

function permissionActionsForApiScopes(
  scopes: readonly ApiKeyScope[],
): PermissionAction[] {
  const actions = new Set<PermissionAction>();
  for (const scope of scopes) {
    switch (scope) {
      case "moves/read":
        actions.add("household:read");
        break;
      case "moves/write":
        actions.add("household:edit");
        break;
      case "inventory/read":
        actions.add("inventory:read");
        break;
      case "inventory/write":
      case "photos/write":
        actions.add("inventory:edit");
        break;
      case "plans/read":
        actions.add("plan:read");
        break;
      case "plans/write":
        actions.add("plan:edit");
        break;
      case "exports/read":
        actions.add("documentation:read");
        break;
      case "exports/create":
        actions.add("documentation:create");
        break;
      case "members/manage":
        actions.add("household:manage_members");
        break;
    }
  }
  return [...actions];
}

export const checkIdempotency = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE"),
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
        q
          .eq("apiKeyId", args.apiKeyId)
          .eq("idempotencyKey", args.idempotencyKey!),
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
  },
) {
  const now = Date.now();
  await deleteExpiredRateLimitWindows(ctx, now);
  const windowStart = restRateLimitWindowStart(now);
  const windowEnd = windowStart + restApiRateLimit.windowMs;
  const existing = await ctx.db
    .query("apiRateLimitWindows")
    .withIndex("by_api_key_window", (q) =>
      q.eq("apiKeyId", args.apiKeyId).eq("windowStart", windowStart),
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
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  // When adding or renaming a REST route here, update convex/lib/routeManifest.mjs
  // and run npm run contract:drift so OpenAPI and MCP clients stay in sync.
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
    return await routeTopLevelBox(
      ctx,
      args,
      auth,
      moveIdSegment,
      nested,
      nestedId,
    );
  }
  if (resource === "photos") {
    return await routeTopLevelPhoto(ctx, args, auth, moveIdSegment, nested);
  }
  if (resource === "plans") {
    return await routePlans(
      ctx,
      args,
      auth,
      moveIdSegment,
      nested,
      nestedId,
      segments[4],
    );
  }
  if (resource === "households") {
    return await routeHouseholds(
      ctx,
      args,
      auth,
      moveIdSegment,
      nested,
      nestedId,
    );
  }
  if (resource !== "moves") {
    return restError({ status: 404, code: "not_found", message: "Not found." });
  }

  if (args.method === "GET" && segments.length === 1) {
    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", auth.householdId),
      )
      .collect();
    return restOk(
      paginate(
        moves
          .filter((move) => move.status !== "archived")
          .map((move) => safeMove(move)),
        args.query,
      ),
    );
  }
  if (
    args.method === "POST" &&
    segments[1] === "setup" &&
    segments.length === 2
  ) {
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
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "move.api_updated",
      "moves",
      moveId,
      {
        changedKeys: Object.keys(patch),
      },
    );
    return restOk({ data: { moveId, ...patch } });
  }
  if (nested === "summary" && args.method === "GET" && segments.length === 3) {
    return await routeMoveSummary(ctx, args, auth, move);
  }
  if (
    nested === "questions" &&
    args.method === "GET" &&
    segments.length === 3
  ) {
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
  if (
    nested === "agent-context" &&
    args.method === "GET" &&
    segments.length === 3
  ) {
    return await routeAgentContext(ctx, args, auth, move);
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
      segments[4],
    );
  }

  if (nested === "zones") {
    return await routeTransportZones(ctx, args, auth, moveId, nestedId);
  }

  if (nested === "people") {
    return await routeMovePeople(ctx, args, auth, moveId, nestedId);
  }

  if (nested === "items") {
    return await routeItems(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "planned-items") {
    return await routePlannedItems(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4],
    );
  }
  if (nested === "boxes") {
    return await routeBoxes(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "box-items") {
    return await routeMoveBoxItems(ctx, args, auth, moveId);
  }
  if (nested === "movable-units") {
    return await routeMovableUnits(ctx, args, auth, moveId, nestedId);
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
      segments[4],
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
  if (nested === "ingestion-queue") {
    return await routeIngestionQueue(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4],
      segments[5],
    );
  }
  if (nested === "documentation-profiles") {
    return await routeDocumentationProfiles(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4],
    );
  }
  if (nested === "exports") {
    return await routeExports(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "share-links") {
    return await routeShareLinks(
      ctx,
      args,
      auth,
      moveId,
      nestedId,
      segments[4],
    );
  }
  if (nested === "photos" && args.method === "GET") {
    const search = querySearchTerm(args.query);
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        photos
          .filter((photo) => !photo.archivedAt)
          .filter((photo) =>
            matchesSearch(search, [photo.caption, photo.fileName, photo.room]),
          )
          .map((photo) => safePhoto(photo)),
        args.query,
      ),
    );
  }

  return restError({ status: 404, code: "not_found", message: "Not found." });
}

async function routePlans(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment?: string,
  nested?: string,
  nestedId?: string,
  nestedAction?: string,
) {
  if (args.method === "POST" && !planIdSegment) {
    return await routeCreatePlan(ctx, args, auth);
  }

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
    return restOk({
      data: { planId: plan._id, summary: describePlanDocument(document) },
    });
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
  if (nested === "floorplan-evidence") {
    return await routeFloorplanEvidence(
      ctx,
      args,
      auth,
      plan,
      nestedId as Id<"floorplanEvidenceRecords"> | undefined,
      nestedAction,
    );
  }
  if (nested === "floorplan-observations") {
    return await routeFloorplanObservations(
      ctx,
      args,
      auth,
      plan,
      nestedId as Id<"floorplanObservations"> | undefined,
      nestedAction,
    );
  }
  if (nested === "floorplan-relationships") {
    return await routeFloorplanRelationships(
      ctx,
      args,
      auth,
      plan,
      nestedId as Id<"floorplanRelationships"> | undefined,
      nestedAction,
    );
  }
  if (args.method === "POST" && nested === "floorplan-reset-draft") {
    return await routeFloorplanResetDraft(ctx, args, auth, plan);
  }
  if (args.method === "POST" && nested === "floorplan-solve") {
    return await routeFloorplanSolve(ctx, args, auth, plan);
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

async function routeCreatePlan(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  const body = bodyObject(args.body);
  const moveId = moveIdFromRestBodyOrQuery({
    body: args.body,
    query: args.query,
  }) as Id<"moves"> | undefined;
  if (!moveId) {
    return restError({
      status: 400,
      code: "move_required",
      message: "moveId is required for creating a plan.",
    });
  }
  await requireApiMove(ctx, auth.householdId, moveId);

  const name = optionalString(body.name) ?? "Destination plan";
  const kind = optionalPlanKind(body.kind);
  const defaultWallThicknessIn =
    positiveNumber(body.defaultWallThicknessIn) ?? 4.5;
  const defaultCeilingHeightIn =
    positiveNumber(body.defaultCeilingHeightIn) ?? 96;
  const gridSnapIn = positiveNumber(body.gridSnapIn) ?? 3;
  const northAngleDeg = optionalNumber(body.northAngleDeg) ?? 0;
  const now = Date.now();

  const planId = await ctx.db.insert("floorPlans", {
    householdId: auth.householdId,
    moveId,
    name,
    kind,
    northAngleDeg,
    defaultWallThicknessIn,
    defaultCeilingHeightIn,
    gridSnapIn,
    shortIdCounters: { ...defaultPlanShortIdCounters },
    nextSeq: 1,
    status: "active",
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  const mainLevelId = await ctx.db.insert("planLevels", {
    householdId: auth.householdId,
    moveId,
    planId,
    name: optionalString(body.mainLevelName) ?? "Main floor",
    levelType: "indoor",
    sortOrder: 0,
    ceilingHeightIn: defaultCeilingHeightIn,
    createdAt: now,
    updatedAt: now,
  });
  const yardLevelId = await ctx.db.insert("planLevels", {
    householdId: auth.householdId,
    moveId,
    planId,
    name: optionalString(body.yardLevelName) ?? "Yard",
    levelType: "outdoor",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId: auth.householdId,
    moveId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "plan",
    action: "floor_plan.api_created",
    objectTable: "floorPlans",
    objectId: planId,
    metadata: {
      kind,
      name,
      levelIds: [mainLevelId, yardLevelId],
      apiKeyId: auth.apiKeyId,
    },
  });

  const plan = await ctx.db.get(planId);
  return restOk(
    {
      data: {
        planId,
        moveId,
        levelIds: [mainLevelId, yardLevelId],
        plan: plan ? await planDocumentForApi(ctx, plan) : undefined,
      },
    },
    201,
  );
}

async function routeHouseholds(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdIdSegment?: string,
  nested?: string,
  nestedId?: string,
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
  householdId: Id<"households">,
) {
  const memberships = await ctx.db
    .query("householdMemberships")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();
  const invitations = await ctx.db
    .query("householdInvitations")
    .withIndex("by_household_status", (q) =>
      q.eq("householdId", householdId).eq("status", "invited"),
    )
    .collect();
  const activeApiKeys = await ctx.db
    .query("apiKeys")
    .withIndex("by_household_status", (q) =>
      q.eq("householdId", householdId).eq("status", "active"),
    )
    .collect();
  const activeApiKeyCountByUser = new Map<string, number>();
  for (const key of activeApiKeys) {
    const creatorId = String(key.createdByUserId);
    activeApiKeyCountByUser.set(
      creatorId,
      (activeApiKeyCountByUser.get(creatorId) ?? 0) + 1,
    );
  }

  const members = await Promise.all(
    memberships
      .filter((membership) => membership.status !== "disabled")
      .map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        const apiAccessStatus = effectiveMemberApiAccessStatus({
          role: membership.role,
          status: membership.status,
          apiAccessStatus: membership.apiAccessStatus,
        });
        const roleAllowsApi =
          defaultMemberApiAccessStatus(membership.role) === "enabled";
        return {
          membershipId: membership._id,
          invitationId: null,
          userId: membership.userId,
          email: user?.email ?? membership.invitedEmail ?? null,
          name: user?.name ?? null,
          role: membership.role,
          status: membership.status,
          apiAccessStatus,
          apiAccessAllowed: roleAllowsApi && apiAccessStatus === "enabled",
          apiAccessReason: roleAllowsApi
            ? apiAccessStatus === "enabled"
              ? "Can create API keys and use keys they created."
              : "API access disabled; existing keys they created cannot be used."
            : "Role does not allow API key creation.",
          activeApiKeyCount:
            activeApiKeyCountByUser.get(String(membership.userId)) ?? 0,
          createdAt: membership.createdAt,
          updatedAt: membership.updatedAt,
        };
      }),
  );

  const pendingInvitations = invitations.map((invitation) => ({
    membershipId: null,
    invitationId: invitation._id,
    userId: null,
    email: invitation.invitedEmail,
    name: null,
    role: invitation.role,
    status: invitation.status,
    apiAccessStatus: defaultMemberApiAccessStatus(invitation.role),
    apiAccessAllowed:
      defaultMemberApiAccessStatus(invitation.role) === "enabled",
    apiAccessReason:
      defaultMemberApiAccessStatus(invitation.role) === "enabled"
        ? "Will be API-capable after accepting this invitation."
        : "Invited role does not allow API key creation.",
    activeApiKeyCount: 0,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  }));

  return [...members, ...pendingInvitations].sort((left, right) => {
    if (left.role === "owner") return -1;
    if (right.role === "owner") return 1;
    if (left.status === "invited" && right.status !== "invited") return 1;
    if (right.status === "invited" && left.status !== "invited") return -1;
    return (left.email ?? left.name ?? "").localeCompare(
      right.email ?? right.name ?? "",
    );
  });
}

async function routeAddHouseholdMember(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  householdId: Id<"households">,
) {
  const body = bodyObject(args.body);
  const normalizedEmail = normalizeCollaboratorEmail(
    requiredBodyString(body.email, "email is required."),
  );
  if (!normalizedEmail) {
    throw new Error("Enter a collaborator email.");
  }

  const role = parseManagedHouseholdMemberRole(
    requiredBodyString(body.role, "role is required."),
  );
  if (!role) {
    throw new Error("Owner access cannot be granted from the API.");
  }

  const result = await addOrInviteHouseholdMemberByEmail(ctx, {
    householdId,
    email: normalizedEmail,
    role,
    actor: {
      type: "apiKey",
      apiKeyId: auth.actor.apiKeyId,
      apiKeyRecordId: auth.apiKeyId,
      createdByUserId: auth.createdByUserId,
    },
  });

  if (result.kind === "member") {
    return restOk(
      {
        data: {
          membershipId: result.membershipId,
          userId: result.userId,
          email: result.email,
          role: result.role,
          status: result.status,
          apiAccessStatus: defaultMemberApiAccessStatus(result.role),
          apiAccessAllowed:
            defaultMemberApiAccessStatus(result.role) === "enabled",
          reactivated: result.reactivated,
        },
      },
      result.reactivated ? 200 : 201,
    );
  }

  return restOk(
    {
      data: {
        invitationId: result.invitationId,
        email: result.email,
        role: result.role,
        status: result.status,
        apiAccessStatus: defaultMemberApiAccessStatus(result.role),
        apiAccessAllowed:
          defaultMemberApiAccessStatus(result.role) === "enabled",
        alreadyInvited: result.alreadyInvited,
        requiresSignup: true,
      },
    },
    result.alreadyInvited ? 200 : 202,
  );
}

async function routePlanOps(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
) {
  const body = bodyObject(args.body);
  const batchId = requiredBodyString(body.batchId, "batchId is required.");
  const ops = requiredOps(body.ops);
  const agentLabel = optionalString(body.agentLabel);

  try {
    const result = await ctx.runMutation(
      internalFunctions.planOps.applyApiOps,
      {
        householdId: auth.householdId,
        moveId: plan.moveId,
        planId: plan._id,
        batchId,
        ops,
        apiKeyId: auth.apiKeyId,
        agentLabel,
      },
    );
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
  plan: Doc<"floorPlans">,
) {
  if (args.method === "GET") {
    const statuses =
      args.query.includeReviewed === "true"
        ? (["pending", "applied", "partiallyApplied", "rejected"] as const)
        : (["pending"] as const);
    const proposals = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("planProposals")
            .withIndex("by_plan_status", (q) =>
              q.eq("planId", plan._id).eq("status", status),
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
    const reasoning = requiredBodyString(
      body.reasoning,
      "reasoning is required.",
    );
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

async function routeFloorplanEvidence(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  evidenceId?: Id<"floorplanEvidenceRecords">,
  nestedAction?: string,
) {
  if (args.method === "GET" && !evidenceId) {
    const [
      evidence,
      observations,
      relationships,
      measurements,
      calculations,
      solveRuns,
    ] = await Promise.all([
      ctx.db
        .query("floorplanEvidenceRecords")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("floorplanObservations")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("floorplanRelationships")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("floorplanMeasurements")
        .withIndex("by_plan_subject", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("floorplanCalculationRecords")
        .withIndex("by_plan_status", (q) =>
          q.eq("planId", plan._id).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("floorplanSolveRuns")
        .withIndex("by_plan_created", (q) => q.eq("planId", plan._id))
        .order("desc")
        .take(5),
    ]);
    return restOk({
      data: {
        evidence: evidence
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanEvidence(entry)),
        observations: observations
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanObservation(entry)),
        relationships: relationships
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanRelationship(entry)),
        measurements: measurements
          .filter(
            (entry) =>
              entry.householdId === auth.householdId &&
              entry.status === "active",
          )
          .map((entry) => safeFloorplanMeasurement(entry)),
        calculations: calculations
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanCalculation(entry)),
        latestSolveRun: solveRuns
          .filter(
            (run) =>
              run.householdId === auth.householdId && run.status !== "archived",
          )
          .map((run) => safeFloorplanSolveRun(run))[0],
      },
    });
  }

  if (args.method === "POST" && !evidenceId) {
    return await routeCreateFloorplanEvidence(ctx, args, auth, plan);
  }

  if (!evidenceId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Floorplan evidence route not found.",
    });
  }

  const existing = await requireFloorplanEvidence(ctx, auth, plan, evidenceId);
  if (args.method === "PATCH" && !nestedAction) {
    const body = bodyObject(args.body);
    const patch = removeUndefined({
      title: optionalString(body.title),
      summary: normalizeOptionalText(asString(body.summary)),
      confidence: parseConfidence(body.confidence),
      facts: parseStringArray(body.facts),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(evidenceId, patch);
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.evidence_api_updated",
      "floorplanEvidenceRecords",
      evidenceId,
      { planId: plan._id, changedKeys: Object.keys(patch) },
    );
    const updated = await ctx.db.get(evidenceId);
    return restOk({ data: updated ? safeFloorplanEvidence(updated) : null });
  }

  if (args.method === "POST" && nestedAction === "supersede") {
    const now = Date.now();
    await ctx.db.patch(evidenceId, { status: "superseded", updatedAt: now });
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.evidence_api_superseded",
      "floorplanEvidenceRecords",
      evidenceId,
      { planId: plan._id, previousStatus: existing.status },
    );
    const updated = await ctx.db.get(evidenceId);
    return restOk({ data: updated ? safeFloorplanEvidence(updated) : null });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Floorplan evidence route not found.",
  });
}

async function routeCreateFloorplanEvidence(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
) {
  const body = bodyObject(args.body);
  const now = Date.now();
  const evidenceType = parseFloorplanEvidenceType(body.evidenceType);
  const confidence = parseConfidence(body.confidence) ?? "medium";
  const sourceType = parseFloorplanEvidenceSourceType(body.sourceType);
  const sourcePhotoId = optionalString(body.sourcePhotoId) as
    | Id<"itemPhotos">
    | undefined;
  if (sourcePhotoId) {
    await validateFloorplanSourcePhoto(
      ctx,
      auth.householdId,
      plan.moveId,
      sourcePhotoId,
    );
  }
  const evidenceId = await ctx.db.insert("floorplanEvidenceRecords", {
    householdId: auth.householdId,
    moveId: plan.moveId,
    planId: plan._id,
    evidenceType,
    status: "active",
    title: requiredBodyString(body.title, "title is required."),
    summary: normalizeOptionalText(asString(body.summary)),
    confidence,
    sourceType,
    areaRole: parseFloorplanAreaRole(body.areaRole),
    constraintStrength: parseFloorplanConstraintStrength(
      body.constraintStrength,
    ),
    sourcePhotoId,
    sourceLabel: normalizeOptionalText(asString(body.sourceLabel)),
    sourceRegion: parseFloorplanSourceRegion(body.sourceRegion),
    facts: parseStringArray(body.facts),
    createdByApiKeyId: auth.apiKeyId,
    agentLabel: normalizeOptionalText(asString(body.agentLabel)),
    createdAt: now,
    updatedAt: now,
  });

  const measurements = parseFloorplanMeasurementInputs(body.measurements);
  const measurementIds = [];
  for (const measurement of measurements) {
    const measurementId = await ctx.db.insert("floorplanMeasurements", {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      evidenceId,
      subjectType: measurement.subjectType,
      subjectKey: measurement.subjectKey,
      subjectLabel: measurement.subjectLabel,
      measurementType: measurement.measurementType,
      kind: measurement.kind,
      status: "active",
      valueIn: positiveNumber(measurement.valueIn),
      minIn: positiveNumber(measurement.minIn),
      maxIn: positiveNumber(measurement.maxIn),
      unit: measurement.unit,
      value: positiveNumber(measurement.value),
      minValue: positiveNumber(measurement.minValue),
      maxValue: positiveNumber(measurement.maxValue),
      displayValue: measurement.displayValue,
      confidence: measurement.confidence ?? confidence,
      areaRole: measurement.areaRole,
      constraintStrength: measurement.constraintStrength,
      provenance: [
        {
          sourceType,
          sourceId: String(evidenceId),
          sourcePhotoId,
          sourceLabel:
            normalizeOptionalText(asString(body.sourceLabel)) ??
            "Floorplan evidence",
          imageNumber: optionalNumber(body.imageNumber),
          imageRegion: parseFloorplanSourceRegion(body.sourceRegion),
          notes: normalizeOptionalText(asString(measurement.notes)),
          recordedAt: now,
          recordedByApiKeyId: auth.apiKeyId,
          recordedByLabel:
            normalizeOptionalText(asString(body.agentLabel)) ??
            `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`,
        },
      ],
      sourceObservationIds: measurement.sourceObservationIds,
      createdByApiKeyId: auth.apiKeyId,
      agentLabel: normalizeOptionalText(asString(body.agentLabel)),
      createdAt: now,
      updatedAt: now,
    });
    measurementIds.push(measurementId);
  }

  await auditApiWrite(
    ctx,
    auth,
    plan.moveId,
    "floorplan.evidence_api_created",
    "floorplanEvidenceRecords",
    evidenceId,
    {
      planId: plan._id,
      evidenceType,
      measurementCount: measurementIds.length,
    },
  );
  const created = await ctx.db.get(evidenceId);
  return restOk(
    {
      data: {
        evidence: created ? safeFloorplanEvidence(created) : { evidenceId },
        measurementIds,
      },
    },
    201,
  );
}

async function routeFloorplanObservations(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  observationId?: Id<"floorplanObservations">,
  nestedAction?: string,
) {
  if (args.method === "GET" && !observationId) {
    const observations = await ctx.db
      .query("floorplanObservations")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", plan._id).eq("status", "active"),
      )
      .collect();
    return restOk({
      data: {
        observations: observations
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanObservation(entry)),
      },
    });
  }

  if (args.method === "POST" && !observationId) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const inputs = parseFloorplanObservationInputs(body);
    const observationIds = [];
    for (const input of inputs) {
      if (input.sourcePhotoId) {
        await validateFloorplanSourcePhoto(
          ctx,
          auth.householdId,
          plan.moveId,
          input.sourcePhotoId,
        );
      }
      const sourceLabel = input.sourceLabel ?? "Floorplan observation";
      const insertedId = await ctx.db.insert("floorplanObservations", {
        householdId: auth.householdId,
        moveId: plan.moveId,
        planId: plan._id,
        evidenceId: input.evidenceId,
        sourcePhotoId: input.sourcePhotoId,
        sourceLabel,
        sourceRegion: input.sourceRegion,
        imageNumber: input.imageNumber,
        observationType: input.observationType,
        status: input.status ?? "active",
        title: input.title,
        subjectKey: input.subjectKey,
        subjectLabel: input.subjectLabel,
        subjectKind: input.subjectKind,
        rawText: input.rawText,
        normalized: input.normalized,
        confidence: input.confidence ?? "medium",
        provenance: [
          {
            sourceType: input.sourceType ?? "agentExtraction",
            sourceId: input.evidenceId ? String(input.evidenceId) : undefined,
            sourcePhotoId: input.sourcePhotoId,
            sourceLabel,
            imageNumber: input.imageNumber,
            imageRegion: input.sourceRegion,
            notes: input.notes,
            recordedAt: now,
            recordedByApiKeyId: auth.apiKeyId,
            recordedByLabel:
              input.agentLabel ??
              `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`,
          },
        ],
        relatedMeasurementIds: input.relatedMeasurementIds,
        relatedObservationIds: input.relatedObservationIds,
        createdByApiKeyId: auth.apiKeyId,
        agentLabel: input.agentLabel,
        createdAt: now,
        updatedAt: now,
      });
      observationIds.push(insertedId);
    }

    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.observations_api_created",
      "floorplanObservations",
      observationIds[0],
      { planId: plan._id, observationCount: observationIds.length },
    );
    const created = await Promise.all(
      observationIds.map((id) => ctx.db.get(id)),
    );
    return restOk(
      {
        data: {
          observationIds,
          observations: created
            .filter(isPresent)
            .map((entry) => safeFloorplanObservation(entry)),
        },
      },
      201,
    );
  }

  if (!observationId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Floorplan observation route not found.",
    });
  }

  const existing = await requireFloorplanObservation(
    ctx,
    auth,
    plan,
    observationId,
  );
  if (args.method === "PATCH" && !nestedAction) {
    const body = bodyObject(args.body);
    const patch = removeUndefined({
      title: optionalString(body.title),
      status: parseFloorplanObservationStatus(body.status),
      subjectKey: normalizeOptionalText(asString(body.subjectKey)),
      subjectLabel: normalizeOptionalText(asString(body.subjectLabel)),
      rawText: normalizeOptionalText(asString(body.rawText)),
      normalized: body.normalized,
      confidence: parseConfidence(body.confidence),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(observationId, patch);
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.observation_api_updated",
      "floorplanObservations",
      observationId,
      { planId: plan._id, changedKeys: Object.keys(patch) },
    );
    const updated = await ctx.db.get(observationId);
    return restOk({ data: updated ? safeFloorplanObservation(updated) : null });
  }

  if (args.method === "POST" && nestedAction === "supersede") {
    await ctx.db.patch(observationId, {
      status: "superseded",
      updatedAt: Date.now(),
    });
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.observation_api_superseded",
      "floorplanObservations",
      observationId,
      { planId: plan._id, previousStatus: existing.status },
    );
    const updated = await ctx.db.get(observationId);
    return restOk({ data: updated ? safeFloorplanObservation(updated) : null });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Floorplan observation route not found.",
  });
}

async function routeFloorplanRelationships(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  relationshipId?: Id<"floorplanRelationships">,
  nestedAction?: string,
) {
  if (args.method === "GET" && !relationshipId) {
    const relationships = await ctx.db
      .query("floorplanRelationships")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", plan._id).eq("status", "active"),
      )
      .collect();
    return restOk({
      data: {
        relationships: relationships
          .filter((entry) => entry.householdId === auth.householdId)
          .map((entry) => safeFloorplanRelationship(entry)),
      },
    });
  }

  if (args.method === "POST" && !relationshipId) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const inputs = parseFloorplanRelationshipInputs(ctx, body);
    const relationshipIds = [];
    for (const input of inputs) {
      const insertedId = await ctx.db.insert("floorplanRelationships", {
        householdId: auth.householdId,
        moveId: plan.moveId,
        planId: plan._id,
        evidenceId: input.evidenceId,
        relationshipType: input.relationshipType,
        status: input.status ?? "active",
        fromSubjectKey: input.fromSubjectKey,
        fromSubjectLabel: input.fromSubjectLabel,
        toSubjectKey: input.toSubjectKey,
        toSubjectLabel: input.toSubjectLabel,
        confidence: input.confidence ?? "medium",
        sourceObservationIds: input.sourceObservationIds,
        sourceMeasurementIds: input.sourceMeasurementIds,
        evidenceIds: input.evidenceIds,
        notes: input.notes,
        provenance: [
          {
            sourceType: input.sourceType ?? "agentExtraction",
            sourceId: input.evidenceId ? String(input.evidenceId) : undefined,
            sourceLabel: input.sourceLabel ?? "Floorplan relationship",
            notes: input.notes,
            recordedAt: now,
            recordedByApiKeyId: auth.apiKeyId,
            recordedByLabel:
              input.agentLabel ??
              `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`,
          },
        ],
        createdByApiKeyId: auth.apiKeyId,
        agentLabel: input.agentLabel,
        createdAt: now,
        updatedAt: now,
      });
      relationshipIds.push(insertedId);
    }

    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.relationships_api_created",
      "floorplanRelationships",
      relationshipIds[0],
      { planId: plan._id, relationshipCount: relationshipIds.length },
    );
    const created = await Promise.all(
      relationshipIds.map((id) => ctx.db.get(id)),
    );
    return restOk(
      {
        data: {
          relationshipIds,
          relationships: created
            .filter(isPresent)
            .map((entry) => safeFloorplanRelationship(entry)),
        },
      },
      201,
    );
  }

  if (!relationshipId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Floorplan relationship route not found.",
    });
  }

  const existing = await requireFloorplanRelationship(
    ctx,
    auth,
    plan,
    relationshipId,
  );
  if (args.method === "PATCH" && !nestedAction) {
    const body = bodyObject(args.body);
    const patch = removeUndefined({
      status: parseFloorplanObservationStatus(body.status),
      fromSubjectLabel: optionalString(body.fromSubjectLabel),
      toSubjectLabel: optionalString(body.toSubjectLabel),
      confidence: parseConfidence(body.confidence),
      notes: normalizeOptionalText(asString(body.notes)),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(relationshipId, patch);
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.relationship_api_updated",
      "floorplanRelationships",
      relationshipId,
      { planId: plan._id, changedKeys: Object.keys(patch) },
    );
    const updated = await ctx.db.get(relationshipId);
    return restOk({
      data: updated ? safeFloorplanRelationship(updated) : null,
    });
  }

  if (args.method === "POST" && nestedAction === "supersede") {
    await ctx.db.patch(relationshipId, {
      status: "superseded",
      updatedAt: Date.now(),
    });
    await auditApiWrite(
      ctx,
      auth,
      plan.moveId,
      "floorplan.relationship_api_superseded",
      "floorplanRelationships",
      relationshipId,
      { planId: plan._id, previousStatus: existing.status },
    );
    const updated = await ctx.db.get(relationshipId);
    return restOk({
      data: updated ? safeFloorplanRelationship(updated) : null,
    });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Floorplan relationship route not found.",
  });
}

async function routeFloorplanResetDraft(
  ctx: MutationCtx,
  _args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
) {
  const now = Date.now();
  const solveRuns = await ctx.db
    .query("floorplanSolveRuns")
    .withIndex("by_plan_created", (q) => q.eq("planId", plan._id))
    .collect();
  let archivedSolveRunCount = 0;
  for (const run of solveRuns) {
    if (
      run.householdId === auth.householdId &&
      run.moveId === plan.moveId &&
      run.status !== "archived"
    ) {
      await ctx.db.patch(run._id, { status: "archived" });
      archivedSolveRunCount += 1;
    }
  }

  const proposals = await ctx.db
    .query("planProposals")
    .withIndex("by_plan_status", (q) =>
      q.eq("planId", plan._id).eq("status", "pending"),
    )
    .collect();
  let rejectedProposalCount = 0;
  for (const proposal of proposals) {
    if (
      proposal.householdId === auth.householdId &&
      proposal.moveId === plan.moveId &&
      proposal.batchId.startsWith("floorplan_solve")
    ) {
      await ctx.db.patch(proposal._id, {
        status: "rejected",
        reviewedAt: now,
        updatedAt: now,
      });
      rejectedProposalCount += 1;
    }
  }

  await auditApiWrite(
    ctx,
    auth,
    plan.moveId,
    "floorplan.draft_api_reset",
    "floorPlans",
    plan._id,
    { archivedSolveRunCount, rejectedProposalCount },
  );

  return restOk({
    data: {
      planId: plan._id,
      archivedSolveRunCount,
      rejectedProposalCount,
      preserved: [
        "photos",
        "evidence",
        "observations",
        "relationships",
        "measurements",
      ],
    },
  });
}

async function routeFloorplanSolve(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
) {
  const body = bodyObject(args.body);
  const [measurements, observations, relationships] = await Promise.all([
    ctx.db
      .query("floorplanMeasurements")
      .withIndex("by_plan_subject", (q) => q.eq("planId", plan._id))
      .collect(),
    ctx.db
      .query("floorplanObservations")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", plan._id).eq("status", "active"),
      )
      .collect(),
    ctx.db
      .query("floorplanRelationships")
      .withIndex("by_plan_status", (q) =>
        q.eq("planId", plan._id).eq("status", "active"),
      )
      .collect(),
  ]);
  const activeMeasurementIds = measurements
    .filter(
      (measurement) =>
        measurement.householdId === auth.householdId &&
        measurement.status === "active",
    )
    .map((measurement) => measurement._id);
  const activeMeasurements = measurements.filter(
    (measurement) =>
      measurement.householdId === auth.householdId &&
      measurement.status === "active",
  );
  const activeObservations = observations.filter(
    (observation) => observation.householdId === auth.householdId,
  );
  const activeRelationships = relationships.filter(
    (relationship) => relationship.householdId === auth.householdId,
  );
  const activeObservationIds = activeObservations.map(
    (observation) => observation._id,
  );
  const activeRelationshipIds = activeRelationships.map(
    (relationship) => relationship._id,
  );
  const puzzle = {
    ...parseFloorplanPuzzleInput(body),
    measurements: activeMeasurements.map((measurement) =>
      floorplanMeasurementForSolver(measurement),
    ),
    observations: activeObservations.map((observation) =>
      floorplanObservationForSolver(observation),
    ),
    relationships: activeRelationships.map((relationship) =>
      floorplanRelationshipForSolver(relationship),
    ),
  };
  const solve = solveFloorplanPuzzle(puzzle);
  if (!Array.isArray(body.rooms) || body.rooms.length === 0) {
    solve.diagnostics = [
      ...evidenceGraphDiagnostics(activeObservations, activeRelationships),
      ...solve.diagnostics,
    ];
    if (solve.status === "valid" && solve.rooms.length === 0) {
      solve.status = "incomplete";
    }
  }
  const levels = await ctx.db
    .query("planLevels")
    .withIndex("by_plan_sort", (q) => q.eq("planId", plan._id))
    .collect();
  const levelId =
    optionalString(body.levelId) ??
    levels.find((level) => level.levelType === "indoor" && !level.archivedAt)
      ?._id;
  const proposedOps =
    levelId && body.includeProposedOps !== false
      ? floorplanSolveToPlanOps(solve, String(levelId))
      : [];
  const now = Date.now();
  const solveRunId = await ctx.db.insert("floorplanSolveRuns", {
    householdId: auth.householdId,
    moveId: plan.moveId,
    planId: plan._id,
    status: solve.status,
    solverVersion: solve.solverVersion,
    diagnostics: solve.diagnostics,
    geometry: solve,
    proposedOps,
    sourceMeasurementIds: activeMeasurementIds,
    sourceObservationIds: activeObservationIds,
    sourceRelationshipIds: activeRelationshipIds,
    createdByApiKeyId: auth.apiKeyId,
    agentLabel: normalizeOptionalText(asString(body.agentLabel)),
    createdAt: now,
  });
  const activeMeasurementIdSet = new Set(activeMeasurementIds.map(String));
  for (const calculation of solve.calculations) {
    const inputMeasurementIds = calculation.inputMeasurementIds
      .map((id) => ctx.db.normalizeId("floorplanMeasurements", id))
      .filter(
        (id): id is Id<"floorplanMeasurements"> =>
          Boolean(id) && activeMeasurementIdSet.has(String(id)),
      );
    await ctx.db.insert("floorplanCalculationRecords", {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      solveRunId,
      status: "active",
      calculationKind: calculation.kind,
      formulaName: calculation.formulaName,
      label: calculation.label,
      subjectKey: calculation.subjectKey,
      subjectLabel: calculation.subjectLabel,
      outputMeasurementType: calculation.outputMeasurementType,
      unit: calculation.unit,
      value: calculation.value,
      displayValue: calculation.displayValue,
      confidence: estimateConfidenceFromFloorplan(calculation.confidence),
      inputMeasurementIds,
      diagnostics: calculation.diagnostics,
      createdByApiKeyId: auth.apiKeyId,
      agentLabel: normalizeOptionalText(asString(body.agentLabel)),
      createdAt: now,
      updatedAt: now,
    });
  }

  let proposalId: Id<"planProposals"> | undefined;
  if (body.createProposal === true && proposedOps.length) {
    const batchId =
      optionalString(body.batchId) ?? `floorplan_solve_${now.toString(36)}`;
    const reasoning = [
      normalizeOptionalText(asString(body.reasoning)) ??
        "Floorplan solver generated draft room geometry from the measurement ledger.",
      solve.diagnostics.length
        ? `Validation diagnostics: ${solve.diagnostics
            .map((diagnostic) => `${diagnostic.severity}: ${diagnostic.title}`)
            .join("; ")}.`
        : "Validation diagnostics: no room overlaps detected.",
    ].join("\n\n");
    proposalId = await ctx.db.insert("planProposals", {
      householdId: auth.householdId,
      moveId: plan.moveId,
      planId: plan._id,
      batchId,
      ops: proposedOps,
      agentLabel: normalizeOptionalText(asString(body.agentLabel)),
      reasoning: reasoning.slice(0, 8000),
      status: "pending",
      appliedOpIndexes: [],
      createdByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
  }

  await auditApiWrite(
    ctx,
    auth,
    plan.moveId,
    "floorplan.solve_api_created",
    "floorplanSolveRuns",
    solveRunId,
    {
      planId: plan._id,
      status: solve.status,
      diagnosticCount: solve.diagnostics.length,
      proposalId,
    },
  );

  return restOk(
    {
      data: {
        solveRunId,
        proposalId,
        solve,
        proposedOps,
        validationWarnings: solve.diagnostics,
      },
    },
    201,
  );
}

function planListMoveId(
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  return (auth.moveId ??
    moveIdFromRestBodyOrQuery({
      body: args.body,
      query: args.query,
    })) as Id<"moves"> | undefined;
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
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">,
) {
  const sectionOptions = sectionOptionsFromQuery(args.query);
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
      .collect(),
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
    (resource) =>
      resource.householdId === auth.householdId && !resource.archivedAt,
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
  );
  const activePeople = people.filter(
    (person) => person.householdId === auth.householdId && !person.archivedAt,
  );
  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt,
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt,
  );
  const visiblePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt,
  );
  const activeDocumentationProfiles = documentationProfiles.filter(
    (profile) =>
      profile.householdId === auth.householdId && profile.status !== "archived",
  );
  const visiblePlanningSuggestions = planningSuggestions.filter(
    (suggestion) => suggestion.householdId === auth.householdId,
  );
  const visibleExportJobs = exportJobs.filter(
    (job) => job.householdId === auth.householdId,
  );
  const visibleShareLinks = shareLinks.filter(
    (link) => link.householdId === auth.householdId,
  );
  const visibleAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId,
  );
  const activeBoxItems = visibleAssignments.filter((assignment) =>
    activeBoxes.some((box) => box._id === assignment.boxId),
  );
  const movableUnitSummary = restMovableUnitSummary({
    boxes: activeBoxes,
    items: activeItems,
    boxItems: activeBoxItems,
  });
  const sectionData: Record<string, unknown> = {};
  const sectionMeta: Record<string, unknown> = {};
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "resources",
    activeResources.map((resource) => safeTransportResource(resource)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "zones",
    activeZones.map((zone) => safeTransportZone(zone)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "people",
    activePeople.map((person) => safeMovePerson(person)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "items",
    activeItems.map((item) => safeItem(item)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "boxes",
    activeBoxes.map((box) => safeBox(box)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "assignments",
    visibleAssignments.map((assignment) => safeAssignment(assignment)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "photos",
    visiblePhotos.map((photo) => safePhoto(photo)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "planningSuggestions",
    visiblePlanningSuggestions.map((suggestion) =>
      safePlanningSuggestion(suggestion),
    ),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "documentationProfiles",
    activeDocumentationProfiles.map((profile) =>
      safeDocumentationProfile(profile),
    ),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "exports",
    visibleExportJobs.map((job) => safeExportJob(job)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "shareLinks",
    visibleShareLinks.map((link) => safeApiShareLink(link)),
  );

  return restOk({
    data: {
      move: safeMove(move),
      ...sectionData,
      sectionMeta,
      counts: {
        resources: activeResources.length,
        zones: activeZones.length,
        people: activePeople.length,
        items: activeItems.length,
        boxes: activeBoxes.length,
        movableUnits: movableUnitSummary.total,
        looseMovableUnits: movableUnitSummary.looseItems,
        assignments: visibleAssignments.length,
        photos: visiblePhotos.length,
        planningSuggestions: visiblePlanningSuggestions.length,
        documentationProfiles: activeDocumentationProfiles.length,
        exports: visibleExportJobs.length,
        shareLinks: visibleShareLinks.length,
      },
      movableUnitSummary,
      generatedAt: Date.now(),
    },
  });
}

async function routeMe(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  const connectionType =
    (auth as typeof auth & { connectionType?: "oauth" | "apiKey" })
      .connectionType ?? "apiKey";
  const [household, restrictedMove, connectionUser, connectionMembership] =
    await Promise.all([
      ctx.db.get(auth.householdId),
      auth.moveId ? ctx.db.get(auth.moveId) : Promise.resolve(null),
      auth.createdByUserId
        ? ctx.db.get(auth.createdByUserId)
        : Promise.resolve(null),
      auth.createdByUserId
        ? ctx.db
            .query("householdMemberships")
            .withIndex("by_household_user", (q) =>
              q
                .eq("householdId", auth.householdId)
                .eq("userId", auth.createdByUserId),
            )
            .unique()
        : Promise.resolve(null),
    ]);
  const connectionApiAccessStatus = connectionMembership
    ? effectiveMemberApiAccessStatus({
        role: connectionMembership.role,
        status: connectionMembership.status,
        apiAccessStatus: connectionMembership.apiAccessStatus,
      })
    : null;
  return restOk({
    ...restMeContextPayload({
      household: household
        ? {
            householdId: household._id,
            name: household.name,
            slug: household.slug,
          }
        : { householdId: auth.householdId },
      apiKeyId: auth.apiKeyId,
      scopes: auth.scopes,
      connectionType,
      moveId: auth.moveId,
      createdByUserId: auth.createdByUserId,
      user: connectionUser
        ? {
            userId: connectionUser._id,
            email: connectionUser.email ?? null,
            name: connectionUser.name ?? null,
          }
        : null,
      householdMember: connectionMembership
        ? {
            membershipId: connectionMembership._id,
            role: connectionMembership.role,
            status: connectionMembership.status,
            apiAccessStatus: connectionApiAccessStatus,
            apiAccessAllowed: canMembershipUseApiAccess({
              role: connectionMembership.role,
              status: connectionMembership.status,
              apiAccessStatus: connectionMembership.apiAccessStatus,
            }),
          }
        : null,
      restrictedMove:
        restrictedMove && restrictedMove.householdId === auth.householdId
          ? safeMove(restrictedMove)
          : null,
      generatedAt: Date.now(),
    }),
  });
}

async function routeMoveQuestions(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">,
) {
  const [items, boxes, memberships, photos, resources, zones] =
    await Promise.all([
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
  move: Doc<"moves">,
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
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
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
  const documentationProfileTypes = Array.isArray(
    body.documentationProfileTypes,
  )
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
      asString(body.pcsTransportationOfficeNotes),
    ),
    pcsRestrictedItemsNotes: normalizeOptionalText(
      asString(body.pcsRestrictedItemsNotes),
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
    201,
  );
}

async function routeSetupMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
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
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "move.api_setup_updated",
        "moves",
        moveId,
        {
          changedKeys: Object.keys(patch),
        },
      );
    }
  } else {
    moveAction = "create";
    const type = parseMoveType(body.type) ?? "other";
    await assertHouseholdEntitlement(ctx, {
      householdId: auth.householdId,
      dimension: "activeMoves",
    });
    const documentationProfileTypes = Array.isArray(
      body.documentationProfileTypes,
    )
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
      moveLevelWeightAllowanceLb: optionalNumber(
        body.moveLevelWeightAllowanceLb,
      ),
      pcsBranch: parsePcsBranch(body.pcsBranch),
      pcsRankPayGrade: normalizeOptionalText(asString(body.pcsRankPayGrade)),
      pcsDependentStatus: parsePcsDependentStatus(body.pcsDependentStatus),
      pcsShipmentType: parsePcsShipmentType(body.pcsShipmentType),
      pcsOrdersNumber: normalizeOptionalText(asString(body.pcsOrdersNumber)),
      pcsAllowanceNotes: normalizeOptionalText(
        asString(body.pcsAllowanceNotes),
      ),
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
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "move.api_setup_created",
      "moves",
      moveId,
      {
        title,
        type,
        planningDefaultCount: planningDefaultIds.length,
      },
    );
  }

  const spaceResults = [];
  for (const [index, input] of setupSpaceInputs(body).entries()) {
    spaceResults.push(
      await upsertApiMoveSpaceForSetup(ctx, auth, moveId, input, index),
    );
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
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">,
) {
  const sectionOptions = sectionOptionsFromQuery(args.query);
  const [
    items,
    photos,
    spaces,
    resources,
    zones,
    saleListings,
    plans,
    boxes,
    boxItems,
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
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt,
  );
  const activePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt,
  );
  const activeSpaces = spaces.filter(
    (space) =>
      space.householdId === auth.householdId && space.status !== "archived",
  );
  const activeResources = resources.filter(
    (resource) =>
      resource.householdId === auth.householdId && !resource.archivedAt,
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
  );
  const activePlans = plans.filter(
    (plan) => plan.householdId === auth.householdId && !plan.archivedAt,
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt,
  );
  const activeBoxItems = boxItems.filter(
    (assignment) => assignment.householdId === auth.householdId,
  );
  const movableUnitSummary = restMovableUnitSummary({
    boxes: activeBoxes,
    items: activeItems,
    boxItems: activeBoxItems,
  });
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
  const salePipeline = sellItems.map((item) => {
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
  });
  const sectionData: Record<string, unknown> = {};
  const sectionMeta: Record<string, unknown> = {};
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "spaces",
    activeSpaces.map((space) => safeMoveSpace(space)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "transportResources",
    activeResources.map((resource) => safeTransportResource(resource)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "transportZones",
    activeZones.map((zone) => safeTransportZone(zone)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "items",
    activeItems.map((item) => ({
      ...safeItem(item),
      photoCount: photosByItemId.get(String(item._id)) ?? 0,
      saleListingId: listingByItemId.get(String(item._id))?._id,
    })),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "salePipeline",
    salePipeline,
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "photos",
    activePhotos.map((photo) => safePhoto(photo)),
  );
  addBoundedSection(
    sectionData,
    sectionMeta,
    sectionOptions,
    "layoutPlans",
    activePlans.map((plan) => ({
      planId: plan._id,
      name: plan.name,
      kind: plan.kind,
      status: plan.status,
      updatedAt: plan.updatedAt,
    })),
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
        movableUnitRule:
          "Use movableUnitSummary to answer rough box/large loose item load questions. Reuse gapExamples[].measurementPatchHint.target and assignmentExamples[].assignmentPatchHint.target for follow-up writes. Patch existing boxes or loose itemIds with batch_upsert_movable_units when weights, dimensions, or volume are missing.",
      },
      counts: {
        items: activeItems.length,
        boxes: activeBoxes.length,
        movableUnits: movableUnitSummary.total,
        looseMovableUnits: movableUnitSummary.looseItems,
        photos: activePhotos.length,
        spaces: activeSpaces.length,
        transportResources: activeResources.length,
        transportZones: activeZones.length,
        sellItems: sellItems.length,
        saleListings: listingByItemId.size,
        saleResearchSourceCount,
      },
      movableUnitSummary,
      ...sectionData,
      sectionMeta,
    },
  });
}

async function routeMoveSpaces(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  spaceIdSegment?: string,
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
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "space.api_created",
      "moveSpaces",
      spaceId,
      {
        name,
        kind,
      },
    );
    const created = await ctx.db.get(spaceId);
    return restOk(
      { data: created ? safeMoveSpace(created) : { spaceId } },
      201,
    );
  }

  if ((args.method === "PATCH" || args.method === "PUT") && spaceIdSegment) {
    const spaceId = spaceIdSegment as Id<"moveSpaces">;
    const space = await ctx.db.get(spaceId);
    if (
      !space ||
      space.householdId !== auth.householdId ||
      space.moveId !== moveId
    ) {
      return restError({
        status: 404,
        code: "not_found",
        message: "Space not found.",
      });
    }
    const body = bodyObject(args.body);
    const patch: Partial<Doc<"moveSpaces">> = {
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: Date.now(),
    };
    if (body.kind !== undefined)
      patch.kind = parseMoveSpaceKind(body.kind) ?? space.kind;
    if (body.name !== undefined)
      patch.name = requiredBodyString(body.name, "name cannot be empty.");
    if (body.aliases !== undefined)
      patch.aliases = parseStringArray(body.aliases) ?? [];
    if (body.notes !== undefined)
      patch.notes = normalizeOptionalText(asString(body.notes));
    if (body.floorLevel !== undefined) {
      patch.floorLevel = normalizeOptionalText(asString(body.floorLevel));
    }
    if (body.sortOrder !== undefined)
      patch.sortOrder = normalizeSortOrder(optionalNumber(body.sortOrder));
    if (body.status !== undefined) {
      patch.status = parseMoveSpaceStatus(body.status) ?? space.status;
      patch.archivedAt = patch.status === "archived" ? Date.now() : undefined;
    }
    if (body.capacity !== undefined)
      patch.capacity = parseCapacity(body.capacity) ?? {};
    await ctx.db.patch(spaceId, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "space.api_updated",
      "moveSpaces",
      spaceId,
      {
        changedKeys: Object.keys(patch),
      },
    );
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
  listingIdSegment?: string,
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
      if (
        photo.householdId !== auth.householdId ||
        photo.archivedAt ||
        !photo.itemId
      ) {
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
          .filter(
            (item) => item.householdId === auth.householdId && !item.deletedAt,
          )
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
    const itemId = requiredBodyString(
      body.itemId,
      "itemId is required.",
    ) as Id<"items">;
    const item = await ctx.db.get(itemId);
    if (
      !item ||
      item.householdId !== auth.householdId ||
      item.moveId !== moveId ||
      item.deletedAt
    ) {
      return restError({
        status: 404,
        code: "not_found",
        message: "Item not found.",
      });
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
    return restOk(
      { data: listing ? safeSaleListing(listing) : { listingId } },
      existing ? 200 : 201,
    );
  }

  if ((args.method === "PATCH" || args.method === "PUT") && listingIdSegment) {
    const listingId = listingIdSegment as Id<"saleListings">;
    const listing = await ctx.db.get(listingId);
    if (
      !listing ||
      listing.householdId !== auth.householdId ||
      listing.moveId !== moveId ||
      listing.archivedAt
    ) {
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
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "sale_listing.api_updated",
      "saleListings",
      listingId,
      {
        changedKeys: Object.keys(patch),
      },
    );
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
  move: Doc<"moves">,
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
    (item) => item.householdId === auth.householdId && !item.deletedAt,
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt,
  );
  const activeAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId,
  );
  const activeResources = resources.filter(
    (resource) =>
      resource.householdId === auth.householdId && !resource.archivedAt,
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
  );
  const itemById = new Map(activeItems.map((item) => [item._id, item]));
  const activeBoxIds = new Set(activeBoxes.map((box) => String(box._id)));
  const boxedItemIds = new Set<string>();
  const assignmentsByBoxId = new Map<Id<"boxes">, Doc<"boxItems">[]>();
  for (const assignment of activeAssignments) {
    if (activeBoxIds.has(String(assignment.boxId))) {
      boxedItemIds.add(String(assignment.itemId));
    }
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
    itemEstimates.map((item) => item.estimate.weight),
  );
  const totalEstimatedVolumeCuFt = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.volume),
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
        Boolean(estimate),
      );
    const contentsWeight = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.weight),
    );
    const contentsVolume = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.volume),
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
        0,
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

  const looseItemReports = activeItems
    .filter(
      (item) =>
        item.status !== "archived" &&
        !boxedItemIds.has(String(item._id)) &&
        isLooseMovableUnitRestItem(item),
    )
    .map((item) => {
      const estimate = estimateItem(item);
      return {
        itemId: item._id,
        name: item.name,
        room: item.room,
        destinationRoom: item.destinationRoom,
        status: item.status,
        disposition: item.disposition,
        quantity: item.quantity ?? 1,
        requiresPersonalTransport: item.requiresPersonalTransport,
        assignedResourceId: item.assignedResourceId,
        assignedZoneId: item.assignedZoneId,
        estimatedWeightLb: roundEstimate(estimate.weight?.value ?? 0),
        estimatedVolumeCuFt: roundEstimate(estimate.volume?.value ?? 0),
        warnings: estimate.warnings,
      };
    });

  const resourceReports = activeResources.map((resource) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedResourceId === resource._id,
    );
    const assignedLooseItems = looseItemReports.filter(
      (item) => item.assignedResourceId === resource._id,
    );
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedWeightLb,
          0,
        ),
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedVolumeCuFt,
          0,
        ),
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
      assignedLooseItemCount: assignedLooseItems.length,
      assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
      warningCount:
        assignedBoxes.reduce(
          (sum, box) =>
            sum +
            box.warnings.length +
            box.assignmentWarnings.length +
            box.assignmentHardBlocks.length,
          0,
        ) +
        assignedLooseItems.reduce((sum, item) => sum + item.warnings.length, 0),
    };
  });

  const zoneReports = activeZones.map((zone) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedZoneId === zone._id,
    );
    const assignedLooseItems = looseItemReports.filter(
      (item) => item.assignedZoneId === zone._id,
    );
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedWeightLb,
          0,
        ),
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedVolumeCuFt,
          0,
        ),
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
      assignedLooseItemCount: assignedLooseItems.length,
      assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
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
        item.estimate.warnings.includes("missingWeightEstimate"),
      ).length,
      missingVolumeCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingVolumeEstimate"),
      ).length,
      unassignedBoxCount: boxReports.filter((box) => !box.assignedResourceId)
        .length,
      boxReports,
      looseItemReports,
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
  actionSegment?: string,
) {
  if (actionSegment === "zones" && resourceIdSegment) {
    await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment,
    );
    if (args.method === "GET") {
      const zones = await ctx.db
        .query("transportZones")
        .withIndex("by_resource_sort", (q) =>
          q.eq("resourceId", resourceIdSegment as Id<"transportResources">),
        )
        .collect();
      return restOk(
        paginate(
          zones
            .filter((zone) => zone.householdId === auth.householdId)
            .filter((zone) => !zone.archivedAt)
            .map((zone) => safeTransportZone(zone)),
          args.query,
        ),
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
        { resourceId: resourceIdSegment, name: zone?.name },
      );
      return restOk(
        { data: { zone: zone ? safeTransportZone(zone) : { zoneId } } },
        201,
      );
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
        args.query,
      ),
    );
  }

  if (args.method === "GET" && resourceIdSegment && !actionSegment) {
    const resource = await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment,
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
      resourceIdSegment,
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
      { changedKeys: Object.keys(patch) },
    );
    return restOk({
      data: updated
        ? safeTransportResource(updated)
        : { resourceId: resource._id },
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
  zoneIdSegment?: string,
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
        args.query,
      ),
    );
  }

  if (args.method === "GET" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment,
    );
    return restOk({ data: safeTransportZone(zone) });
  }

  if (args.method === "POST" && !zoneIdSegment) {
    const zoneId = await createApiTransportZone(
      ctx,
      auth,
      moveId,
      bodyObject(args.body),
    );
    const zone = await ctx.db.get(zoneId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_created",
      "transportZones",
      zoneId,
      { resourceId: zone?.resourceId, name: zone?.name },
    );
    return restOk(
      { data: { zone: zone ? safeTransportZone(zone) : { zoneId } } },
      201,
    );
  }

  if (args.method === "PATCH" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment,
    );
    const patch = await transportZonePatch(
      ctx,
      auth.householdId,
      moveId,
      args.body,
    );
    await ctx.db.patch(zone._id, patch);
    const updated = await ctx.db.get(zone._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_updated",
      "transportZones",
      zone._id,
      { changedKeys: Object.keys(patch) },
    );
    return restOk({
      data: updated ? safeTransportZone(updated) : { zoneId: zone._id },
    });
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
  personIdSegment?: string,
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
        args.query,
      ),
    );
  }

  if (args.method === "GET" && personIdSegment) {
    const person = await requireApiMovePerson(
      ctx,
      auth.householdId,
      moveId,
      personIdSegment,
      args.query.includeArchived === "true",
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
    await auditApiMovePerson(
      ctx,
      auth,
      moveId,
      "move_person.api_created",
      personId,
      {
        role,
        name,
      },
    );
    return restOk(
      { data: person ? safeMovePerson(person) : { personId } },
      201,
    );
  }

  if (args.method === "PATCH" && personIdSegment) {
    const person = await requireApiMovePerson(
      ctx,
      auth.householdId,
      moveId,
      personIdSegment,
      true,
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
      { changedKeys: Object.keys(patch) },
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
      true,
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
      person._id,
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
  itemIdSegment?: string,
  action?: string,
) {
  if (args.method === "GET" && !itemIdSegment) {
    const search = querySearchTerm(args.query);
    const agentLabel = optionalString(args.query.agentLabel);
    const destinationRoom = optionalString(args.query.destinationRoom);
    const destinationSpaceId = optionalString(args.query.destinationSpaceId);
    const maxConfidence =
      args.query.maxConfidence !== undefined
        ? Number(args.query.maxConfidence)
        : undefined;
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
            args.query.status ? item.status === args.query.status : true,
          )
          .filter((item) =>
            args.query.disposition
              ? item.disposition === args.query.disposition
              : true,
          )
          .filter((item) =>
            destinationRoom ? item.destinationRoom === destinationRoom : true,
          )
          .filter((item) =>
            destinationSpaceId
              ? String(item.destinationSpaceId ?? "") === destinationSpaceId
              : true,
          )
          .filter((item) =>
            agentLabel ? item.agentLabel === agentLabel : true,
          )
          .filter((item) =>
            Number.isFinite(maxConfidence)
              ? (item.aiConfidenceScore ?? 1) <= (maxConfidence as number)
              : true,
          )
          .filter((item) =>
            matchesSearch(search, [
              item.name,
              item.description,
              item.room,
              item.destinationRoom,
              item.category,
            ]),
          )
          .map((item) => safeItem(item)),
        args.query,
      ),
    );
  }

  if (args.method === "GET" && itemIdSegment && !action) {
    const item = await requireApiItem(
      ctx,
      auth.householdId,
      moveId,
      itemIdSegment,
    );
    return restOk({ data: safeItem(item) });
  }

  if (args.method === "POST" && itemIdSegment && action === "notes") {
    const item = await requireApiItem(
      ctx,
      auth.householdId,
      moveId,
      itemIdSegment,
    );
    const { patch, noteLength } = restPrivateItemNoteAppendPatch({
      body: args.body,
      auth,
      item,
    });
    await ctx.db.patch(item._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "item.api_note_appended",
      "items",
      item._id,
      {
        noteLength,
      },
    );
    return restOk({
      data: {
        itemId: item._id,
        appended: true,
        updatedAt: patch.updatedAt,
      },
    });
  }

  if (args.method === "POST" && itemIdSegment === "batch-upsert") {
    return await routeBatchUpsertItems(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    await assertExternalItemKeyAvailable(ctx, auth.householdId, moveId, body);
    const { itemId, name } = await createApiItem(ctx, auth, moveId, body);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "item.api_created",
      "items",
      itemId,
      {
        name,
        externalSource: externalItemKeyFromInput(body)?.externalSource,
      },
    );
    return restOk({ data: { itemId } }, 201);
  }

  if (args.method === "PATCH" && itemIdSegment && !action) {
    const item = await requireApiItem(
      ctx,
      auth.householdId,
      moveId,
      itemIdSegment,
    );
    await assertExternalItemKeyAvailable(
      ctx,
      auth.householdId,
      moveId,
      args.body,
      item._id,
    );
    const patch = itemPatch(args.body, auth, item);
    await applyItemSpaceRefs(ctx, auth.householdId, moveId, args.body, patch);
    await ctx.db.patch(item._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "item.api_updated",
      "items",
      item._id,
      {
        changedKeys: Object.keys(patch),
      },
    );
    return restOk({ data: { itemId: item._id, ...patch } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Item route not found.",
  });
}

async function routePlannedItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  plannedItemIdSegment?: string,
  action?: string,
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
      data: updated
        ? safePlannedItem(updated)
        : { plannedItemId: plannedItem._id },
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
    return restOk({
      data: { plannedItemId: plannedItem._id, archivedAt: now },
    });
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
  moveId: Id<"moves">,
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
          ? await findApiItemByExternalKey(
              ctx,
              auth.householdId,
              moveId,
              externalKey,
            )
          : null;
      itemId = itemId ?? externalMatch?._id;
      if (itemId) {
        const item = await requireApiItem(
          ctx,
          auth.householdId,
          moveId,
          itemId,
        );
        const patch = itemPatch(input, auth, item);
        mergeItemPatchResearchSources(
          input,
          item,
          patch,
          `items.${index}.researchSourceMode`,
        );
        await applyItemSpaceRefs(ctx, auth.householdId, moveId, input, patch);
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
            item._id,
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
            { rowIndex: index, changedKeys: Object.keys(patch) },
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
        { rowIndex: index, name: created.name },
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
    failed > 0 ? 207 : 200,
  );
}

type RestMovableUnitBoxRow = {
  unit: Record<string, unknown>;
  unitIndex: number;
  unitCountIndex?: number;
  unitCount?: number;
};

async function routeMovableUnits(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action?: string,
) {
  if (
    args.method !== "POST" ||
    action !== "batch-upsert" ||
    parseRestPath(args.path).length !== 4
  ) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Movable units route not found.",
    });
  }

  const body = bodyObject(args.body);
  const units = Array.isArray(body.units) ? body.units : [];
  const dryRun = Boolean(body.dryRun);
  const idempotencyKey =
    optionalString(body.idempotencyKey) ?? optionalString(args.idempotencyKey);
  if (!units.length) {
    return restError({
      status: 400,
      code: "invalid_batch",
      message: "units must include at least one row.",
    });
  }
  if (units.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Movable unit batches are limited to ${maxBatchUpsertItems} input rows.`,
    });
  }

  const boxRows: RestMovableUnitBoxRow[] = [];
  const looseItemUnits: Array<{
    unit: Record<string, unknown>;
    unitIndex: number;
  }> = [];
  const missingStableLooseRows: number[] = [];
  const autoCodedBoxRows = new Set<number>();

  for (const [unitIndex, row] of units.entries()) {
    const unit = bodyObject(row);
    if (unit.kind === "box") {
      let expanded: RestMovableUnitBoxRow[];
      try {
        expanded = expandRestMovableUnitBoxRows(unit, unitIndex);
      } catch (error) {
        return restErrorFromUnknown(error);
      }
      boxRows.push(...expanded);
      if (
        expanded.some(
          ({ unit: boxUnit }) =>
            !optionalString(boxUnit.boxId) && !optionalString(boxUnit.code),
        )
      ) {
        autoCodedBoxRows.add(unitIndex);
      }
      continue;
    }

    if (unit.kind === "looseItem") {
      looseItemUnits.push({ unit, unitIndex });
      if (
        !optionalString(unit.itemId) &&
        !hasRestStableExternalItemKey(unit)
      ) {
        missingStableLooseRows.push(unitIndex);
      }
      continue;
    }

    return restError({
      status: 400,
      code: "validation_error",
      message: `units.${unitIndex}.kind must be "box" or "looseItem".`,
    });
  }

  if (boxRows.length + looseItemUnits.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Movable unit batches are limited to ${maxBatchUpsertItems} expanded rows.`,
    });
  }
  if (missingStableLooseRows.length) {
    return restError({
      status: 400,
      code: "stable_key_required",
      message: `looseItem rows require itemId for existing units or externalSource plus externalId for new units. Missing stable key on row index${missingStableLooseRows.length === 1 ? "" : "es"} ${missingStableLooseRows.join(", ")}.`,
    });
  }

  const autoCodedBoxWarning =
    autoCodedBoxRows.size && !idempotencyKey
      ? `Box rows without boxId or code will receive server-generated box codes. Pass a stable idempotencyKey before live writes for row index${autoCodedBoxRows.size === 1 ? "" : "es"} ${[...autoCodedBoxRows].join(", ")} so retries do not create duplicate auto-coded boxes.`
      : undefined;
  const boxPhotoAttachmentCount = boxRows.reduce(
    (total, { unit, unitIndex }) =>
      total + restMovableUnitBoxPhotoIds(unit, unitIndex).length,
    0,
  );

  if (!dryRun && autoCodedBoxWarning) {
    return restError({
      status: 400,
      code: "idempotency_required",
      message: `${autoCodedBoxWarning} Use explicit box codes or existing boxId rows if you do not want to rely on a batch idempotency key.`,
    });
  }

  const itemRows = looseItemUnits.map(({ unit }) =>
    movableUnitLooseItemBody(unit),
  );

  if (dryRun) {
    return restOk({
      data: {
        dryRun: true,
        summary: removeUndefined({
          totalUnits: boxRows.length + looseItemUnits.length,
          boxes: boxRows.length,
          looseItems: looseItemUnits.length,
          photoAttachments: boxPhotoAttachmentCount || undefined,
        }),
        requests: [
          ...boxRows.flatMap(({ unit, unitIndex, unitCountIndex, unitCount }) => {
            const boxBody = movableUnitBoxBody(unit);
            const boxId = optionalString(unit.boxId);
            const boxRequest = removeUndefined({
              method: boxId ? "PATCH" : "POST",
              path: boxId
                ? `/moves/${moveId}/boxes/${boxId}`
                : `/moves/${moveId}/boxes`,
              body: boxBody,
              unitIndex,
              unitCountIndex,
              unitCount,
            });
            const photoRequests = restMovableUnitBoxPhotoIds(
              unit,
              unitIndex,
            ).map((photoId, photoIndex) =>
              removeUndefined({
                method: "POST",
                path: `/photos/${photoId}/attach`,
                body: removeUndefined({
                  moveId,
                  photoId,
                  boxId,
                  boxCode: boxId ? undefined : normalizeRestBoxCode(unit.code),
                  dryRun: true,
                }),
                unitIndex,
                unitCountIndex,
                unitCount,
                photoIndex,
                deferredTarget:
                  boxId || normalizeRestBoxCode(unit.code)
                    ? undefined
                    : "Attach to the boxId returned by the preceding live box create request.",
              }),
            );
            return [boxRequest, ...photoRequests];
          }),
          ...(itemRows.length
            ? [
                {
                  method: "POST",
                  path: `/moves/${moveId}/items/batch-upsert`,
                  body: { dryRun: true, items: itemRows },
                  unitIndexes: looseItemUnits.map(({ unitIndex }) => unitIndex),
                },
              ]
            : []),
        ],
        warnings: autoCodedBoxWarning ? [autoCodedBoxWarning] : undefined,
        note: `Dry run only. Box rows with boxId update that box; rows with code update an exact existing code on live run or create a box if none exists. Box row photoIds attach to the resolved box after the box upsert. New loose item rows become active, reviewable movable units. Pass itemId to patch an existing loose movable unit without defaulting omitted status, quantity, needsReview, reviewFlags, or aiTags.${autoCodedBoxWarning ? " Live writes with auto-coded box rows require a stable idempotencyKey." : ""}`,
      },
    });
  }

  const boxResults = [];
  for (const [index, boxRow] of boxRows.entries()) {
    try {
      const result = await upsertRestMovableUnitBox(
        ctx,
        auth,
        moveId,
        boxRow.unit,
        {
          rowIndex: index,
        },
      );
      const photoIds = restMovableUnitBoxPhotoIds(
        boxRow.unit,
        boxRow.unitIndex,
      );
      const photoAttachments = photoIds.length
        ? await attachRestPhotosToMovableUnitBox(ctx, auth, moveId, {
            unit: boxRow.unit,
            result,
            photoIds,
          })
        : [];
      boxResults.push(
        removeUndefined({
          ...boxRow,
          ...result,
          photoIds: photoIds.length ? photoIds : undefined,
          photoAttachments: photoAttachments.length
            ? photoAttachments
            : undefined,
        }),
      );
    } catch (error) {
      boxResults.push(
        removeUndefined({
          unitIndex: boxRow.unitIndex,
          unitCountIndex: boxRow.unitCountIndex,
          unitCount: boxRow.unitCount,
          ok: false,
          action: optionalString(boxRow.unit.boxId) ? "update" : "upsert",
          boxId: optionalString(boxRow.unit.boxId),
          code: optionalString(boxRow.unit.code),
          error: error instanceof Error ? error.message : "Box row failed.",
        }),
      );
    }
  }

  const itemResponse = itemRows.length
    ? await routeBatchUpsertItems(
        ctx,
        {
          ...args,
          method: "POST",
          path: `/moves/${moveId}/items/batch-upsert`,
          body: { dryRun: false, items: itemRows },
        },
        auth,
        moveId,
      )
    : null;
  const itemError = restResponseErrorSummary(
    itemResponse,
    "Loose movable-unit item batch failed.",
  );
  const itemBody = bodyObject(itemResponse?.body);
  const itemData = bodyObject(itemBody.data);
  const itemResultRows = Array.isArray(itemData.results)
    ? itemData.results.map(bodyObject)
    : [];
  const looseItemResults =
    restMovableUnitLooseItemFailureRows({
      units: looseItemUnits,
      error: itemError,
    }) ??
    looseItemUnits.map(({ unit, unitIndex }, itemIndex) => {
      const result = itemResultRows.find((row) => row.index === itemIndex);
      return removeUndefined({
        unitIndex,
        itemIndex,
        ok: result?.ok,
        action: result?.action,
        itemId: result?.itemId ?? unit.itemId,
        name: result?.name ?? unit.name,
        externalSource: result?.externalSource ?? unit.externalSource,
        externalId: result?.externalId ?? unit.externalId,
        error: result?.error,
      });
    });

  const failed =
    boxResults.filter((row) => row.ok === false).length +
    looseItemResults.filter((row) => row.ok === false).length;

  return restOk(
    {
      data: {
        dryRun: false,
        summary: removeUndefined({
          totalUnits: boxRows.length + looseItemUnits.length,
          boxes: boxRows.length,
          looseItems: looseItemUnits.length,
          photoAttachments: boxPhotoAttachmentCount || undefined,
        }),
        boxes: boxResults,
        items: itemData,
        itemBatchError: itemError ?? undefined,
        looseItems: looseItemResults,
        nextStep:
          "Open the Load planner Movable units tab, or call get_move_summary/get_agent_context, to review missing weights, dimensions, volume, and load assignments.",
      },
    },
    failed > 0 ? 207 : 200,
  );
}

function expandRestMovableUnitBoxRows(
  unit: Record<string, unknown>,
  unitIndex: number,
): RestMovableUnitBoxRow[] {
  const count = parseRestMovableUnitBoxCount(unit.count);
  const photoIds = restMovableUnitBoxPhotoIds(unit, unitIndex);
  if (
    count > 1 &&
    (optionalString(unit.boxId) || optionalString(unit.code))
  ) {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: `Box row index ${unitIndex} has count ${count} with an existing boxId/code. Expand coded ranges into explicit box code rows, or omit count when patching an existing box.`,
    });
  }
  if (count > 1 && photoIds.length) {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: `Box row index ${unitIndex} has count ${count} with photoIds. Expand photographed boxes into one row per physical box so each photo attaches to the correct box.`,
    });
  }
  if (count === 1) {
    const singleUnit = { ...unit };
    delete singleUnit.count;
    return [{ unit: singleUnit, unitIndex }];
  }

  const baseLabel = normalizeCountedRestBoxLabel(unit.label ?? unit.name);
  return Array.from({ length: count }, (_, index) => {
    const expandedUnit: Record<string, unknown> = {
      ...unit,
      label: `${baseLabel} ${index + 1}`,
    };
    delete expandedUnit.count;
    return {
      unit: expandedUnit,
      unitIndex,
      unitCountIndex: index,
      unitCount: count,
    };
  });
}

function parseRestMovableUnitBoxCount(count: unknown) {
  if (count === undefined || count === null || count === "") return 1;
  const parsed = Number(count);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: "Box count must be an integer from 1 to 100.",
    });
  }
  return parsed;
}

function normalizeCountedRestBoxLabel(label: unknown) {
  const cleaned = typeof label === "string" ? label.trim() : "";
  const base = cleaned || "Box";
  return (
    base
      .replace(/\bboxes\b/i, "box")
      .replace(/\s+#?\d+$/i, "")
      .trim() || "Box"
  );
}

function movableUnitBoxBody(unit: Record<string, unknown>) {
  const body = { ...unit };
  delete body.kind;
  delete body.boxId;
  delete body.count;
  delete body.photoIds;
  if (body.label === undefined && body.name !== undefined) {
    body.label = body.name;
  }
  delete body.name;
  addRestDerivedEstimatedVolume(body);
  return body;
}

function restMovableUnitBoxPhotoIds(
  unit: Record<string, unknown>,
  unitIndex: number,
) {
  if (unit.photoIds === undefined) return [];
  let photoIds: string[];
  try {
    photoIds = uniqueRestStrings(parseIdArray(unit.photoIds));
  } catch {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: `Box row index ${unitIndex} photoIds must be an array of photo ID strings.`,
    });
  }
  if (photoIds.length > 20) {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: `Box row index ${unitIndex} has ${photoIds.length} photoIds; attach at most 20 photos to one box row.`,
    });
  }
  return photoIds;
}

function movableUnitLooseItemBody(unit: Record<string, unknown>) {
  const item = { ...unit };
  delete item.kind;
  addRestDerivedEstimatedVolume(item);
  const isExistingItemPatch = Boolean(optionalString(item.itemId));
  const requiresPersonalTransport =
    item.requiresPersonalTransport === true ||
    item.disposition === "personalTransport";
  const shouldSendMovableUnitTags =
    !isExistingItemPatch || Array.isArray(item.aiTags);
  return {
    ...item,
    ...(isExistingItemPatch ? {} : { status: item.status ?? "active" }),
    ...(isExistingItemPatch ? {} : { quantity: item.quantity ?? 1 }),
    ...(isExistingItemPatch ? {} : { needsReview: item.needsReview ?? true }),
    ...(isExistingItemPatch || item.disposition !== undefined
      ? {}
      : { disposition: requiresPersonalTransport ? "personalTransport" : "mover" }),
    ...(requiresPersonalTransport && item.requiresPersonalTransport === undefined
      ? { requiresPersonalTransport: true }
      : {}),
    ...(item.estimatedWeightLb !== undefined && item.weightConfidence === undefined
      ? { weightConfidence: "low" }
      : {}),
    ...(item.dimensionsIn !== undefined && item.dimensionsConfidence === undefined
      ? { dimensionsConfidence: "low" }
      : {}),
    ...(item.estimatedVolumeCuFt !== undefined && item.volumeConfidence === undefined
      ? { volumeConfidence: "low" }
      : {}),
    ...(shouldSendMovableUnitTags
      ? {
          aiTags: uniqueRestStrings([
            ...(Array.isArray(item.aiTags) ? item.aiTags : []),
            "movable-unit",
            "loose-item",
            ...(requiresPersonalTransport ? ["personal-transport"] : []),
          ]),
        }
      : {}),
    ...(isExistingItemPatch && item.reviewFlags === undefined
      ? {}
      : {
          reviewFlags: uniqueRestStrings([
            ...(Array.isArray(item.reviewFlags) ? item.reviewFlags : []),
            ...(isExistingItemPatch ? [] : ["movableUnitReview"]),
          ]),
        }),
  };
}

async function upsertRestMovableUnitBox(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  unit: Record<string, unknown>,
  { rowIndex }: { rowIndex: number },
) {
  const input = movableUnitBoxBody(unit);
  const requestedBoxId = optionalString(unit.boxId);
  const requestedCode = normalizeRestBoxCode(unit.code);
  const existing = requestedBoxId
    ? await requireApiBox(ctx, auth.householdId, moveId, requestedBoxId)
    : requestedCode
      ? await findApiBoxByCode(ctx, auth.householdId, moveId, requestedCode)
      : null;

  if (existing) {
    const patch = boxPatch(input);
    if (patch.code !== undefined) {
      await assertUniqueApiBoxCode(ctx, {
        householdId: auth.householdId,
        moveId,
        code: patch.code,
        currentBoxId: existing._id,
      });
    }
    Object.assign(
      patch,
      await boxDestinationRefsFromInput(ctx, auth.householdId, moveId, input),
    );
    await ctx.db.patch(existing._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "box.api_movable_unit_updated",
      "boxes",
      existing._id,
      { rowIndex, changedKeys: Object.keys(patch) },
    );
    return {
      ok: true,
      action: "update",
      boxId: existing._id,
      code: patch.code ?? existing.code,
      changedKeys: Object.keys(patch),
      matchedBy: requestedBoxId ? "boxId" : "code",
    };
  }

  const now = Date.now();
  const fields = restBoxCreateFields({ auth, moveId, body: input, now }) as Omit<
    Doc<"boxes">,
    "_id" | "_creationTime"
  >;
  Object.assign(
    fields,
    await boxDestinationRefsFromInput(ctx, auth.householdId, moveId, input),
  );
  await assertUniqueApiBoxCode(ctx, {
    householdId: auth.householdId,
    moveId,
    code: fields.code,
  });
  const boxId = await ctx.db.insert("boxes", fields);
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "box.api_movable_unit_created",
    "boxes",
    boxId,
    { rowIndex, code: fields.code },
  );
  return {
    ok: true,
    action: "create",
    boxId,
    code: fields.code,
  };
}

async function attachRestPhotosToMovableUnitBox(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  {
    unit,
    result,
    photoIds,
  }: {
    unit: Record<string, unknown>;
    result: Record<string, unknown>;
    photoIds: string[];
  },
) {
  const boxId = optionalString(result.boxId) ?? optionalString(unit.boxId);
  const boxCode =
    optionalString(result.code) ?? normalizeRestBoxCode(unit.code);
  if (!boxId && !boxCode) {
    throw new RestApiError({
      status: 400,
      code: "box_target_missing",
      message:
        "Cannot attach box photoIds because the box upsert did not return a boxId or code.",
    });
  }

  const attachments = [];
  for (const photoId of photoIds) {
    const photo = await requireApiPhotoById(
      ctx,
      auth.householdId,
      photoId,
    );
    if (photo.moveId !== moveId) {
      throw new RestApiError({
        status: 404,
        code: "not_found",
        message: "Photo not found.",
      });
    }
    const patch = await photoAttachPatch(ctx, {
      householdId: auth.householdId,
      moveId,
      reviewedByUserId: auth.createdByUserId,
      body: removeUndefined({
        photoId,
        boxId,
        boxCode: boxId ? undefined : boxCode,
      }),
    });
    await ctx.db.patch(photo._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "photo.api_attached_from_movable_unit_batch",
      "itemPhotos",
      photo._id,
      { changedKeys: Object.keys(patch), boxId: patch.boxId ?? boxId },
    );
    attachments.push(
      removeUndefined({
        photoId: photo._id,
        boxId: patch.boxId ?? boxId,
        boxCode: boxId ? undefined : boxCode,
        changedKeys: Object.keys(patch),
      }),
    );
  }
  return attachments;
}

async function findApiBoxByCode(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  code: string,
) {
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId).eq("code", code))
    .collect();
  return (
    boxes.find((box) => box.householdId === householdId && !box.archivedAt) ??
    null
  );
}

function addRestDerivedEstimatedVolume(body: Record<string, unknown>) {
  if (body.estimatedVolumeCuFt !== undefined && body.estimatedVolumeCuFt !== null) {
    return body;
  }
  const dimensions = bodyObject(body.dimensionsIn);
  const length = optionalNumber(dimensions.lengthIn);
  const width = optionalNumber(dimensions.widthIn);
  const height = optionalNumber(dimensions.heightIn);
  if (!length || !width || !height) {
    return body;
  }
  body.estimatedVolumeCuFt = roundEstimate((length * width * height) / 1728);
  return body;
}

function hasRestStableExternalItemKey(unit: Record<string, unknown>) {
  return Boolean(optionalString(unit.externalSource) && optionalString(unit.externalId));
}

function uniqueRestStrings(values: unknown[]) {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())),
    ),
  ];
}

async function assertUniqueApiBoxCode(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    code,
    currentBoxId,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    code: unknown;
    currentBoxId?: Id<"boxes">;
  },
) {
  const normalizedCode = normalizeRestBoxCode(code);
  if (!normalizedCode) {
    return;
  }

  const matches = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) =>
      q.eq("moveId", moveId).eq("code", normalizedCode),
    )
    .collect();
  const conflict = matches.find(
    (box) =>
      box.householdId === householdId &&
      !box.archivedAt &&
      box._id !== currentBoxId,
  );
  if (!conflict) {
    return;
  }

  throw new RestApiError({
    status: 409,
    code: "duplicate_box_code",
    message: `Box code "${normalizedCode}" already exists for this move. Update the existing box instead of creating a duplicate.`,
    fields: [
      {
        path: "code",
        message: `Box code "${normalizedCode}" already exists.`,
      },
    ],
  });
}

async function routeBoxes(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  boxIdSegment?: string,
  nestedSegment?: string,
) {
  if (boxIdSegment && nestedSegment === "items") {
    return await routeMoveBoxItems(
      ctx,
      {
        ...args,
        body: {
          ...bodyObject(args.body),
          boxId: boxIdSegment,
        },
      },
      auth,
      moveId,
    );
  }

  if (nestedSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Box route not found.",
    });
  }

  if (args.method === "GET" && !boxIdSegment) {
    const search = querySearchTerm(args.query);
    const destinationRoom = optionalString(args.query.destinationRoom);
    const destinationSpaceId = optionalString(args.query.destinationSpaceId);
    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        boxes
          .filter((box) => !box.archivedAt)
          .filter((box) =>
            destinationRoom ? box.destinationRoom === destinationRoom : true,
          )
          .filter((box) =>
            destinationSpaceId
              ? String(box.destinationSpaceId ?? "") === destinationSpaceId
              : true,
          )
          .filter((box) =>
            matchesSearch(search, [
              box.code,
              box.label,
              box.room,
              box.description,
            ]),
          )
          .map((box) => safeBox(box)),
        args.query,
      ),
    );
  }

  if (args.method === "GET" && boxIdSegment) {
    const box = await requireApiBox(
      ctx,
      auth.householdId,
      moveId,
      boxIdSegment,
    );
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "POST" && !boxIdSegment) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const code = body.code ? normalizeBoxCode(String(body.code)) : `API-${now}`;
    const fields = restBoxCreateFields({ auth, moveId, body, now }) as Omit<
      Doc<"boxes">,
      "_id" | "_creationTime"
    >;
    Object.assign(
      fields,
      await boxDestinationRefsFromInput(ctx, auth.householdId, moveId, body),
    );
    await assertUniqueApiBoxCode(ctx, {
      householdId: auth.householdId,
      moveId,
      code: fields.code,
    });
    const boxId = await ctx.db.insert("boxes", fields);
    await auditApiWrite(ctx, auth, moveId, "box.api_created", "boxes", boxId, {
      code,
    });
    return restOk({ data: { boxId } }, 201);
  }

  if (args.method === "PATCH" && boxIdSegment) {
    const box = await requireApiBox(
      ctx,
      auth.householdId,
      moveId,
      boxIdSegment,
    );
    const patch = boxPatch(args.body);
    if (patch.code !== undefined) {
      await assertUniqueApiBoxCode(ctx, {
        householdId: auth.householdId,
        moveId,
        code: patch.code,
        currentBoxId: box._id,
      });
    }
    Object.assign(
      patch,
      await boxDestinationRefsFromInput(
        ctx,
        auth.householdId,
        moveId,
        args.body,
      ),
    );
    await ctx.db.patch(box._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "box.api_updated",
      "boxes",
      box._id,
      {
        changedKeys: Object.keys(patch),
      },
    );
    return restOk({ data: { boxId: box._id, ...patch } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Box route not found.",
  });
}

async function routeMoveBoxItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  if (
    args.method !== "POST" &&
    args.method !== "PUT" &&
    args.method !== "DELETE"
  ) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Box item route not found.",
    });
  }

  const body = bodyObject(args.body);
  const rows = Array.isArray(body.items) ? body.items : [body];
  if (!rows.length) {
    return restError({
      status: 400,
      code: "validation_error",
      message: "Provide at least one item assignment row.",
      fields: [
        {
          path: "items",
          message: "items must contain at least one assignment row.",
        },
      ],
    });
  }
  if (rows.length > 100) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: "Box item requests are limited to 100 rows.",
    });
  }

  const dryRun = Boolean(body.dryRun);
  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = {
      ...body,
      ...bodyObject(row),
    };
    try {
      const box = await resolveApiBoxRef(ctx, auth.householdId, moveId, input);
      const item = await resolveApiItemRef(
        ctx,
        auth.householdId,
        moveId,
        input,
      );
      if (args.method === "DELETE") {
        const result = await deleteApiBoxItemAssignment(ctx, {
          auth,
          moveId,
          box,
          item,
          dryRun,
          route: "move_box_items",
        });
        results.push({ index, ok: true, ...result });
      } else {
        const result = await upsertApiBoxItemAssignment(ctx, {
          auth,
          moveId,
          box,
          item,
          quantity: positiveNumber(input.quantity) ?? 1,
          notes: normalizeOptionalText(asString(input.notes)),
          dryRun,
          route: "move_box_items",
        });
        results.push({ index, ok: true, ...result });
      }
    } catch (error) {
      results.push({
        index,
        ok: false,
        error: error instanceof Error ? error.message : "Assignment failed.",
        code: error instanceof RestApiError ? error.code : undefined,
        fields: error instanceof RestApiError ? error.fields : undefined,
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return restOk(
    {
      data: Array.isArray(body.items)
        ? {
            dryRun,
            total: rows.length,
            succeeded: rows.length - failed,
            failed,
            results,
          }
        : results[0],
    },
    failed > 0 ? 207 : args.method === "POST" ? 201 : 200,
  );
}

async function upsertApiBoxItemAssignment(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    box,
    item,
    quantity,
    notes,
    dryRun,
    route,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    box: Doc<"boxes">;
    item: Doc<"items">;
    quantity: number;
    notes?: string;
    dryRun: boolean;
    route: string;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("boxItems")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .collect();
  const current = existing.find((entry) => entry.moveId === moveId);
  const patch = {
    boxId: box._id,
    quantity,
    notes,
    updatedAt: now,
  };

  if (dryRun) {
    return {
      dryRun,
      created: !current,
      assignmentId: current?._id,
      boxId: box._id,
      boxCode: box.code,
      itemId: item._id,
    };
  }

  if (current) {
    await ctx.db.patch(current._id, patch);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_upserted",
      "boxItems",
      current._id,
      { route, boxId: box._id, itemId: item._id },
    );
    return {
      dryRun,
      created: false,
      assignmentId: current._id,
      boxId: box._id,
      boxCode: box.code,
      itemId: item._id,
    };
  }

  const assignmentId = await ctx.db.insert("boxItems", {
    householdId: auth.householdId,
    moveId,
    itemId: item._id,
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
    { route, boxId: box._id, itemId: item._id },
  );
  return {
    dryRun,
    created: true,
    assignmentId,
    boxId: box._id,
    boxCode: box.code,
    itemId: item._id,
  };
}

async function deleteApiBoxItemAssignment(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    box,
    item,
    dryRun,
    route,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    box: Doc<"boxes">;
    item: Doc<"items">;
    dryRun: boolean;
    route: string;
  },
) {
  const assignments = await ctx.db
    .query("boxItems")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .collect();
  const assignment = assignments.find(
    (entry) => entry.moveId === moveId && entry.boxId === box._id,
  );
  if (!assignment) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Assignment not found.",
    });
  }

  if (!dryRun) {
    await ctx.db.delete(assignment._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_deleted",
      "boxItems",
      assignment._id,
      { route, boxId: box._id, itemId: item._id },
    );
  }

  return {
    dryRun,
    deleted: !dryRun,
    assignmentId: assignment._id,
    boxId: box._id,
    boxCode: box.code,
    itemId: item._id,
  };
}

async function routeAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  assignmentIdSegment?: string,
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
        args.query,
      ),
    );
  }

  if (
    (args.method === "POST" || args.method === "PUT") &&
    !assignmentIdSegment
  ) {
    const body = bodyObject(args.body);
    const box = await resolveApiBoxRef(ctx, auth.householdId, moveId, body);
    const item = await resolveApiItemRef(ctx, auth.householdId, moveId, body);
    const result = await upsertApiBoxItemAssignment(ctx, {
      auth,
      moveId,
      box,
      item,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      dryRun: Boolean(body.dryRun),
      route: "assignments",
    });
    return restOk({ data: result }, result.created ? 201 : 200);
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
      assignmentId,
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
  moveId: Id<"moves">,
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
    (box) => box.householdId === auth.householdId && !box.archivedAt,
  );
  const activeResources = resources.filter(
    (resource) =>
      resource.householdId === auth.householdId && !resource.archivedAt,
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
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
  moveId: Id<"moves">,
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
    const itemId = optionalString(input.itemId);
    const assignedResourceId = optionalString(input.assignedResourceId);
    const assignedZoneId = optionalString(input.assignedZoneId);
    const overrideReason = normalizeOptionalText(
      asString(input.overrideReason),
    );
    try {
      if ((boxId ? 1 : 0) + (itemId ? 1 : 0) !== 1) {
        throw new Error("Exactly one of boxId or itemId is required.");
      }
      if (!assignedResourceId)
        throw new Error("assignedResourceId is required.");
      if (boxId) {
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
            },
          );
        }
        results.push({
          index,
          ok: true,
          targetType: "box",
          boxId: box._id,
          assignedResourceId,
          assignedZoneId: assignedZoneId || undefined,
          assignmentWarnings: validation.softWarnings,
          assignmentHardBlocks: validation.hardBlocks,
          dryRun,
        });
        continue;
      }

      if (!itemId) {
        throw new Error("itemId is required.");
      }
      const item = await requireApiItem(ctx, auth.householdId, moveId, itemId);
      if (item.assignmentLocked) {
        throw new Error("Locked assignments must be changed manually.");
      }
      const validation = await validateApiItemAssignment(ctx, {
        householdId: auth.householdId,
        moveId,
        item,
        assignedResourceId,
        assignedZoneId,
        overrideReason,
      });
      if (!dryRun) {
        await ctx.db.patch(item._id, {
          assignedResourceId: assignedResourceId as Id<"transportResources">,
          assignedZoneId: assignedZoneId as Id<"transportZones"> | undefined,
          assignmentOverrideReason: overrideReason,
          assignmentWarnings: validation.softWarnings,
          assignmentHardBlocks: validation.hardBlocks,
          assignmentValidatedAt: Date.now(),
          updatedByUserId: auth.createdByUserId,
          updatedAt: Date.now(),
        });
        await auditApiWrite(
          ctx,
          auth,
          moveId,
          "assignment.api_applied",
          "items",
          item._id,
          {
            rowIndex: index,
            assignedResourceId,
            assignedZoneId,
            warningCount: validation.softWarnings.length,
          },
        );
      }
      results.push({
        index,
        ok: true,
        targetType: "item",
        itemId: item._id,
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
        itemId: itemId || undefined,
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
    failed > 0 ? 207 : 200,
  );
}

async function routePlanningSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string,
  actionSegment?: string,
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
        (status ? suggestion.status === status : true),
    );
    if (suggestionIdSegment && !actionSegment) {
      const suggestion = visibleSuggestions.find(
        (entry) => entry._id === suggestionIdSegment,
      );
      if (!suggestion) {
        throw new Error("AI planning suggestion not found.");
      }
      return restOk({ data: safePlanningSuggestion(suggestion) });
    }
    if (!suggestionIdSegment) {
      return restOk(
        paginate(
          visibleSuggestions.map((entry) => safePlanningSuggestion(entry)),
          args.query,
        ),
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
      result.suggestionIds.map((suggestionId) => ctx.db.get(suggestionId)),
    );
    return restOk(
      {
        data: {
          aiJobId: result.aiJobId,
          suggestionIds: result.suggestionIds,
          suggestions: suggestions
            .filter((entry): entry is Doc<"aiPlanningSuggestions"> =>
              Boolean(entry),
            )
            .map((entry) => safePlanningSuggestion(entry)),
        },
      },
      201,
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
      (suggestionId) => suggestionId as Id<"aiPlanningSuggestions">,
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
  aiJobIdSegment?: string,
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
      (status ? job.status === status : true),
  );

  if (aiJobIdSegment) {
    const job = visibleJobs.find((entry) => entry._id === aiJobIdSegment);
    if (!job) {
      throw new Error("AI job not found.");
    }
    return restOk({ data: safeAiJob(job) });
  }

  return restOk(
    paginate(
      visibleJobs.map((job) => safeAiJob(job)),
      args.query,
    ),
  );
}

async function routeAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string,
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
      (status ? suggestion.status === status : true),
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment,
    );
    if (!suggestion) {
      throw new Error("AI text suggestion not found.");
    }
    return restOk({ data: safeAiTextSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiTextSuggestion(suggestion)),
      args.query,
    ),
  );
}

async function routeAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  suggestionIdSegment?: string,
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
      (status ? suggestion.status === status : true),
  );

  if (suggestionIdSegment) {
    const suggestion = visibleSuggestions.find(
      (entry) => entry._id === suggestionIdSegment,
    );
    if (!suggestion) {
      throw new Error("AI photo suggestion not found.");
    }
    return restOk({ data: safeAiPhotoSuggestion(suggestion) });
  }

  return restOk(
    paginate(
      visibleSuggestions.map((suggestion) => safeAiPhotoSuggestion(suggestion)),
      args.query,
    ),
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
  moveId: Id<"moves">,
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
    { suggestionCount: suggestionIds.length },
  );

  const suggestions = await Promise.all(
    suggestionIds.map((suggestionId) => ctx.db.get(suggestionId)),
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
    201,
  );
}

async function routeGenerateAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
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
        "Photo privacy or derivative status does not allow AI intake.",
      );
    }
    if (photo.sizeBytes > aiUsageLimits.maxPhotoInputBytes) {
      throw new Error("Photo is too large for AI intake.");
    }

    const existingPending = await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_photo_status", (q) =>
        q.eq("photoId", photo._id).eq("status", "pending"),
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
      { photoId: photo._id, suggestionCount: suggestionIds.length },
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
    allSuggestionIds.map((suggestionId) => ctx.db.get(suggestionId)),
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
    createdAiJobIds.length ? 201 : 200,
  );
}

async function routeIngestionQueue(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  entryId?: string,
  action?: string,
  actionId?: string,
) {
  if (args.method === "GET" && !entryId) {
    return await routeListIngestionQueue(ctx, args, auth, moveId);
  }
  if (args.method === "POST" && !entryId) {
    return await routeCreateIngestionQueueEntry(ctx, args, auth, moveId);
  }
  if (args.method === "POST" && entryId === "claim" && !action) {
    return await routeClaimIngestionQueue(ctx, args, auth, moveId);
  }
  if (!entryId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Ingestion queue route not found.",
    });
  }
  const queueEntryId = entryId as Id<"ingestionQueueEntries">;
  if (args.method === "POST" && action === "results" && !actionId) {
    return await routeSubmitIngestionQueueResults(
      ctx,
      args,
      auth,
      moveId,
      queueEntryId,
    );
  }
  if (args.method === "POST" && action === "status" && !actionId) {
    return await routeSetIngestionQueueStatus(
      ctx,
      args,
      auth,
      moveId,
      queueEntryId,
    );
  }
  return restError({
    status: 404,
    code: "not_found",
    message: "Ingestion queue route not found.",
  });
}

async function routeListIngestionQueue(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const status = optionalIngestionQueueStatus(args.query.status);
  const scopeHint = optionalIngestionScopeHint(args.query.scopeHint);
  const targetPlanId = optionalString(args.query.targetPlanId) as
    | Id<"floorPlans">
    | undefined;
  if (targetPlanId) {
    await requireApiPlanForMove(ctx, auth, moveId, targetPlanId);
  }
  const room = normalizeOptionalText(args.query.room);
  const hasAudio = optionalBooleanQuery(args.query.hasAudio);
  const hasVideo = optionalBooleanQuery(args.query.hasVideo);
  const hasImage = optionalBooleanQuery(args.query.hasImage);
  const includeMedia = args.query.includeMedia !== "false";
  const now = Date.now();

  const entries =
    status === "queued"
      ? [
          ...(await ctx.db
            .query("ingestionQueueEntries")
            .withIndex("by_move_status_order", (q) =>
              q.eq("moveId", moveId).eq("status", "queued"),
            )
            .collect()),
          ...(await ctx.db
            .query("ingestionQueueEntries")
            .withIndex("by_move_status_order", (q) =>
              q.eq("moveId", moveId).eq("status", "claimed"),
            )
            .collect()),
        ]
      : status
        ? await ctx.db
            .query("ingestionQueueEntries")
            .withIndex("by_move_status_order", (q) =>
              q.eq("moveId", moveId).eq("status", status),
            )
            .collect()
        : await ctx.db
            .query("ingestionQueueEntries")
            .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
            .order("desc")
            .collect();

  const rows = [];
  for (const entry of entries) {
    if (entry.householdId !== auth.householdId) continue;
    const media = await mediaForIngestionEntry(
      ctx,
      auth.householdId,
      moveId,
      entry,
    );
    const summary = ingestionMediaSummary(media);
    const effective = effectiveIngestionStatus(entry, now);
    if (status && effective !== status) continue;
    if (!ingestionScopeHintMatches(entry.scopeHint, scopeHint)) continue;
    if (targetPlanId && entry.targetPlanId !== targetPlanId) continue;
    if (
      room &&
      normalizedSearchName(entry.roomHint ?? "") !== normalizedSearchName(room)
    ) {
      continue;
    }
    if (hasAudio !== undefined && summary.hasAudio !== hasAudio) continue;
    if (hasVideo !== undefined && summary.hasVideo !== hasVideo) continue;
    if (hasImage !== undefined && summary.hasImage !== hasImage) continue;
    rows.push(
      safeIngestionQueueEntry(entry, {
        now,
        media: includeMedia ? media : undefined,
        mediaSummary: summary,
      }),
    );
  }

  return restOk(paginate(rows, args.query));
}

async function routeCreateIngestionQueueEntry(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const body = bodyObject(args.body);
  const instructions = normalizeOptionalText(asString(body.instructions));
  const roomHint = normalizeOptionalText(asString(body.roomHint));
  const dispositionHint = normalizeOptionalText(asString(body.dispositionHint));
  const targetPlanId = optionalString(body.targetPlanId) as
    | Id<"floorPlans">
    | undefined;
  const scopeHint =
    normalizeIngestionScopeHint(
      optionalIngestionScopeHint(asString(body.scopeHint)),
    ) ?? (targetPlanId ? "floorPlan" : "inventory");
  const intent =
    optionalIngestionQueueIntent(asString(body.intent)) ??
    (scopeHint === "floorPlan" ? "floorPlan" : "general");
  const target = await resolveApiIngestionTarget(ctx, auth, moveId, {
    targetBoxId: optionalString(body.targetBoxId) as Id<"boxes"> | undefined,
    targetItemId: optionalString(body.targetItemId) as Id<"items"> | undefined,
    targetBoxCode: asString(body.targetBoxCode),
    targetLabel: asString(body.targetLabel),
  });
  const mediaPhotoIds = parseIngestionMediaPhotoIds(body.mediaPhotoIds);
  if (!instructions && mediaPhotoIds.length === 0) {
    throw invalidField(
      "instructions",
      "A queue entry needs instructions, mediaPhotoIds, or both.",
    );
  }
  await validateApiIngestionMediaIds(
    ctx,
    auth.householdId,
    moveId,
    mediaPhotoIds,
  );
  if (targetPlanId) {
    await requireApiPlanForMove(ctx, auth, moveId, targetPlanId);
  }

  const now = Date.now();
  const entryId = await ctx.db.insert("ingestionQueueEntries", {
    householdId: auth.householdId,
    moveId,
    status: "queued",
    instructions,
    roomHint,
    dispositionHint,
    scopeHint,
    intent,
    ...target,
    targetPlanId,
    mediaPhotoIds,
    sortOrder: now,
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "ingestion.entry_api_created",
    "ingestionQueueEntries",
    entryId,
    {
      mediaCount: mediaPhotoIds.length,
      scopeHint,
      intent,
      ...target,
      targetPlanId,
    },
  );

  const created = await ctx.db.get(entryId);
  return restOk(
    {
      data: created
        ? safeIngestionQueueEntry(created, {
            now,
            media: await mediaForIngestionEntry(
              ctx,
              auth.householdId,
              moveId,
              created,
            ),
          })
        : { entryId },
    },
    201,
  );
}

async function routeClaimIngestionQueue(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const body = bodyObject(args.body);
  const batchSize = Math.min(
    Math.max(Math.floor(Number(body.batchSize ?? 1)), 1),
    10,
  );
  const agentLabel = normalizeOptionalText(asString(body.agentLabel));
  const scopeHint = optionalIngestionScopeHint(asString(body.scopeHint));
  const targetPlanId = optionalString(body.targetPlanId) as
    | Id<"floorPlans">
    | undefined;
  if (targetPlanId) {
    await requireApiPlanForMove(ctx, auth, moveId, targetPlanId);
  }
  const now = Date.now();
  const queued = await ctx.db
    .query("ingestionQueueEntries")
    .withIndex("by_move_status_order", (q) =>
      q.eq("moveId", moveId).eq("status", "queued"),
    )
    .take(200);

  let candidates = filterIngestionClaimCandidates(queued, {
    householdId: auth.householdId,
    scopeHint,
    targetPlanId,
  }).slice(0, batchSize);
  if (candidates.length < batchSize) {
    const claimed = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_status_order", (q) =>
        q.eq("moveId", moveId).eq("status", "claimed"),
      )
      .take(200);
    const expired = filterIngestionClaimCandidates(
      claimed.filter((entry) => ingestionClaimIsExpired(entry, now)),
      {
        householdId: auth.householdId,
        scopeHint,
        targetPlanId,
      },
    );
    candidates = [...candidates, ...expired].slice(0, batchSize);
  }

  const claimedIds: Id<"ingestionQueueEntries">[] = [];
  for (const entry of candidates) {
    await ctx.db.patch(entry._id, {
      status: "claimed",
      claimedByUserId: undefined,
      claimedByApiKeyId: auth.apiKeyId,
      claimedByAgentLabel: agentLabel,
      claimedAt: now,
      claimExpiresAt: now + ingestionClaimDurationMs,
      updatedAt: now,
    });
    claimedIds.push(entry._id);
  }

  if (claimedIds.length) {
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "ingestion.entries_api_claimed",
      "ingestionQueueEntries",
      moveId,
      { entryIds: claimedIds, count: claimedIds.length, agentLabel },
    );
  }

  const claimedEntries = await Promise.all(
    claimedIds.map((id) => ctx.db.get(id)),
  );
  const data = [];
  for (const entry of claimedEntries) {
    if (!entry) continue;
    const media = await mediaForIngestionEntry(
      ctx,
      auth.householdId,
      moveId,
      entry,
    );
    data.push(
      safeIngestionQueueEntry(entry, {
        now,
        media,
        mediaSummary: ingestionMediaSummary(media),
      }),
    );
  }
  return restOk({ data, claimExpiresAt: now + ingestionClaimDurationMs });
}

async function routeSetIngestionQueueStatus(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  entryId: Id<"ingestionQueueEntries">,
) {
  const entry = await requireApiIngestionEntry(
    ctx,
    auth.householdId,
    moveId,
    entryId,
  );
  const body = bodyObject(args.body);
  const status = requiredIngestionQueueStatus(body.status);
  const now = Date.now();
  assertIngestionTransition(entry, status, now);
  const question = normalizeOptionalText(asString(body.question));
  const agentSummary = normalizeOptionalText(asString(body.agentSummary));

  await ctx.db.patch(entryId, {
    status,
    ...(status === "queued"
      ? {
          claimedByUserId: undefined,
          claimedByApiKeyId: undefined,
          claimedByAgentLabel: undefined,
          claimedAt: undefined,
          claimExpiresAt: undefined,
          agentQuestion: undefined,
        }
      : {}),
    ...(status === "needsInput" ? { agentQuestion: question } : {}),
    ...(agentSummary !== undefined ? { agentSummary } : {}),
    ...(status === "processed" ? { processedAt: now } : {}),
    ...(status === "resolved" ? { resolvedAt: now } : {}),
    updatedAt: now,
  });

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    `ingestion.entry_api_${status}`,
    "ingestionQueueEntries",
    entryId,
    { question: question ?? null },
  );
  const updated = await ctx.db.get(entryId);
  return restOk({
    data: updated
      ? safeIngestionQueueEntry(updated, {
          now,
          mediaSummary: ingestionMediaSummary(
            await mediaForIngestionEntry(
              ctx,
              auth.householdId,
              moveId,
              updated,
            ),
          ),
        })
      : null,
  });
}

async function routeSubmitIngestionQueueResults(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  entryId: Id<"ingestionQueueEntries">,
) {
  const entry = await requireApiIngestionEntry(
    ctx,
    auth.householdId,
    moveId,
    entryId,
  );
  const body = bodyObject(args.body);
  const committedItems = parseIngestionCommittedItems(body.committedItems);
  const committedBoxes = parseIngestionCommittedBoxes(body.committedBoxes);
  const boxAssignments = parseIngestionBoxAssignments(body.boxAssignments);
  const loadAssignments = parseIngestionLoadAssignments(body.loadAssignments);
  const proposedItems = parseIngestionProposedItems(body.proposedItems, entry);
  const resultItemIds = parseOptionalItemIds(body.resultItemIds);
  const resultRefs = parseIngestionResultRefs(body.resultRefs);
  const question = normalizeOptionalText(asString(body.needsInputQuestion));
  const agentSummary = normalizeOptionalText(asString(body.agentSummary));
  const now = Date.now();
  const nextStatus: IngestionQueueStatus = question
    ? "needsInput"
    : "processed";
  assertIngestionTransition(entry, nextStatus, now);
  await validateApiResultItems(ctx, auth.householdId, moveId, resultItemIds);

  const committedResult = committedItems.length
    ? await commitIngestionItems(ctx, {
        auth,
        moveId,
        entry,
        committedItems,
        now,
      })
    : {
        itemIds: [] as Id<"items">[],
        results: [] as Record<string, unknown>[],
      };

  const committedBoxResult = committedBoxes.length
    ? await commitIngestionBoxes(ctx, {
        auth,
        moveId,
        committedBoxes,
        now,
        entryId,
      })
    : { boxIds: [] as Id<"boxes">[], results: [] as Record<string, unknown>[] };

  const boxAssignmentResult = boxAssignments.length
    ? await commitIngestionBoxAssignments(ctx, {
        auth,
        moveId,
        boxAssignments,
      })
    : {
        assignmentIds: [] as Id<"boxItems">[],
        results: [] as Record<string, unknown>[],
      };

  const loadAssignmentResult = loadAssignments.length
    ? await commitIngestionLoadAssignments(ctx, {
        auth,
        moveId,
        loadAssignments,
        entryId,
      })
    : {
        boxIds: [] as Id<"boxes">[],
        itemIds: [] as Id<"items">[],
        results: [] as Record<string, unknown>[],
      };

  let aiJobId: Id<"aiJobs"> | undefined;
  const suggestionIds: Id<"aiTextSuggestions">[] = [];
  const proposedItemsWithSpaceRefs = proposedItems.length
    ? await resolveApiAiTextDraftSpaceRefs(ctx, {
        auth,
        moveId,
        drafts: proposedItems,
      })
    : proposedItems;
  if (proposedItemsWithSpaceRefs.length) {
    aiJobId = await createIngestionAiTextSuggestions(ctx, {
      auth,
      moveId,
      entry,
      proposedItems: proposedItemsWithSpaceRefs,
      agentSummary,
      now,
      suggestionIds,
    });
  }
  const allResultItemIds = [...resultItemIds];
  for (const itemId of committedResult.itemIds) {
    pushUniqueId(allResultItemIds, itemId);
  }

  const refs = [
    ...resultRefs,
    ...allResultItemIds.map((id) => ({ type: "item", id: String(id) })),
    ...committedBoxResult.boxIds.map((id) => ({ type: "box", id: String(id) })),
    ...boxAssignmentResult.assignmentIds.map((id) => ({
      type: "boxItemAssignment",
      id: String(id),
    })),
    ...loadAssignmentResult.boxIds.map((id) => ({
      type: "loadAssignmentBox",
      id: String(id),
    })),
    ...loadAssignmentResult.itemIds.map((id) => ({
      type: "loadAssignmentItem",
      id: String(id),
    })),
    ...suggestionIds.map((id) => ({
      type: "aiTextSuggestion",
      id: String(id),
    })),
  ];

  await ctx.db.patch(entryId, {
    status: nextStatus,
    agentSummary,
    agentQuestion: question,
    resultItemIds: allResultItemIds,
    resultSuggestionIds: suggestionIds,
    resultRefs: refs,
    processedAt: nextStatus === "processed" ? now : undefined,
    updatedAt: now,
  });

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    nextStatus === "processed"
      ? "ingestion.entry_api_processed"
      : "ingestion.entry_api_needs_input",
    "ingestionQueueEntries",
    entryId,
    {
      aiJobId,
      suggestionIds,
      committedItemCount: committedResult.itemIds.length,
      committedResults: committedResult.results,
      committedBoxCount: committedBoxResult.boxIds.length,
      committedBoxResults: committedBoxResult.results,
      boxAssignmentCount: boxAssignmentResult.assignmentIds.length,
      boxAssignmentResults: boxAssignmentResult.results,
      loadAssignmentCount:
        loadAssignmentResult.boxIds.length +
        loadAssignmentResult.itemIds.length,
      loadAssignmentBoxCount: loadAssignmentResult.boxIds.length,
      loadAssignmentItemCount: loadAssignmentResult.itemIds.length,
      loadAssignmentResults: loadAssignmentResult.results,
      proposedItemCount: proposedItems.length,
      resultItemIds: allResultItemIds,
      resultRefs: refs,
    },
  );

  const suggestions = await Promise.all(
    suggestionIds.map((suggestionId) => ctx.db.get(suggestionId)),
  );
  const updated = await ctx.db.get(entryId);
  return restOk({
    data: {
      entry: updated
        ? safeIngestionQueueEntry(updated, {
            now,
            mediaSummary: ingestionMediaSummary(
              await mediaForIngestionEntry(
                ctx,
                auth.householdId,
                moveId,
                updated,
              ),
            ),
          })
        : null,
      aiJobId,
      suggestionIds,
      committedItemIds: committedResult.itemIds,
      committedResults: committedResult.results,
      committedBoxIds: committedBoxResult.boxIds,
      committedBoxResults: committedBoxResult.results,
      boxAssignmentIds: boxAssignmentResult.assignmentIds,
      boxAssignmentResults: boxAssignmentResult.results,
      loadAssignmentBoxIds: loadAssignmentResult.boxIds,
      loadAssignmentItemIds: loadAssignmentResult.itemIds,
      loadAssignmentResults: loadAssignmentResult.results,
      suggestions: suggestions
        .filter((suggestion): suggestion is Doc<"aiTextSuggestions"> =>
          Boolean(suggestion),
        )
        .map((suggestion) => safeAiTextSuggestion(suggestion)),
    },
  });
}

async function routeApproveAiTextSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const { dryRun, approvals } = parseAiTextApprovals(args.body);
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals,
  );
  const now = Date.now();
  const boxIdsByLabel = new Map<string, Id<"boxes">>();
  const createdItemIds: Id<"items">[] = [];
  const createdBoxIds: Id<"boxes">[] = [];
  const assignmentIds: Id<"boxItems">[] = [];
  const results = [];

  for (const { suggestion, approval } of loaded.filter(
    (entry) => entry.suggestion.type === "box",
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
    (entry) => entry.suggestion.type === "item",
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
    await attachAiTextSuggestionMediaToItem(ctx, {
      auth,
      moveId,
      suggestion,
      itemId,
      photoIds: draft.attachMediaPhotoIds ?? [],
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
      },
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
  moveId: Id<"moves">,
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds",
  ) as Id<"aiTextSuggestions">[];
  const loaded = await loadPendingApiAiTextSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId })),
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
    { suggestionIds },
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function routeApproveAiPhotoSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const { dryRun, approvals } = parseAiPhotoApprovals(args.body);
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    approvals,
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
      },
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
  moveId: Id<"moves">,
) {
  const suggestionIds = parseAiSuggestionIds(
    bodyObject(args.body).suggestionIds,
    "suggestionIds",
  ) as Id<"aiPhotoSuggestions">[];
  const loaded = await loadPendingApiAiPhotoSuggestions(
    ctx,
    auth.householdId,
    moveId,
    suggestionIds.map((suggestionId) => ({ suggestionId })),
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
    { suggestionIds },
  );
  return restOk({ data: { rejectedSuggestionIds: suggestionIds } });
}

async function loadPendingApiAiTextSuggestions(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  approvals: RestAiTextApproval[],
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
  approvals: RestAiPhotoApproval[],
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
  },
) {
  const name = normalizeItemName(args.draft.name);
  const hasResearch =
    Boolean(normalizeOptionalText(args.draft.researchSummary)) ||
    Boolean(args.draft.researchSources?.length) ||
    Boolean(normalizeOptionalText(args.draft.researchNotes)) ||
    Boolean(args.draft.researchConfidence);
  const spaceRefs = await apiAiTextDraftSpaceRefs(ctx, {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    draft: args.draft,
  });
  const itemId = await ctx.db.insert("items", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    currentSpaceId: spaceRefs.currentSpaceId,
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
    destinationSpaceId: spaceRefs.destinationSpaceId,
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveNumber(args.draft.quantity) ?? 1,
    condition: "unknown",
    dimensionsIn: args.draft.dimensionsIn,
    dimensionsConfidence: args.draft.dimensionsConfidence ?? "none",
    estimatedWeightLb: args.draft.estimatedWeightLb,
    estimatedWeightLowLb: args.draft.estimatedWeightLowLb,
    estimatedWeightHighLb: args.draft.estimatedWeightHighLb,
    weightConfidence: args.draft.weightConfidence ?? "none",
    estimatedVolumeCuFt: args.draft.estimatedVolumeCuFt,
    volumeConfidence: args.draft.volumeConfidence ?? "none",
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
    researchSummary: normalizeOptionalText(args.draft.researchSummary),
    researchSources: args.draft.researchSources ?? [],
    researchNotes: normalizeOptionalText(args.draft.researchNotes),
    researchConfidence: args.draft.researchConfidence,
    researchedAt: hasResearch ? args.now : undefined,
    researchedByUserId: hasResearch ? args.auth.createdByUserId : undefined,
    researchedByApiKeyId: hasResearch ? args.auth.apiKeyId : undefined,
    researchedByLabel: hasResearch
      ? `API key: ${args.auth.apiKeyName} (${args.auth.apiKeyTokenPreview})`
      : undefined,
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
    { name, disposition: args.draft.disposition },
  );
  return itemId;
}

async function attachAiTextSuggestionMediaToItem(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    suggestion,
    itemId,
    photoIds,
    now,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    suggestion: Doc<"aiTextSuggestions">;
    itemId: Id<"items">;
    photoIds: Id<"itemPhotos">[];
    now: number;
  },
) {
  if (!photoIds.length) return;

  const aiJob = await ctx.db.get(suggestion.aiJobId);
  const inputRef = bodyObject(aiJob?.inputRef);
  if (inputRef.source !== "apiIngestionQueue") {
    throw invalidField(
      "attachMediaPhotoIds",
      "AI text suggestion media attachments are only available for ingestion queue suggestions.",
    );
  }
  const entryId = optionalString(inputRef.entryId) as
    | Id<"ingestionQueueEntries">
    | undefined;
  if (!entryId) {
    throw invalidField(
      "attachMediaPhotoIds",
      "AI text suggestion is missing its source queue entry.",
    );
  }
  const entry = await requireApiIngestionEntry(
    ctx,
    auth.householdId,
    moveId,
    entryId,
  );
  await attachIngestionMediaToItem(ctx, {
    auth,
    moveId,
    entry,
    itemId,
    photoIds,
    now,
  });
}

async function ensureApiBoxFromAiTextDraft(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    draft: RestAiTextBoxDraft;
    now: number;
  },
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI text intake box";
  const existing = await findApiAiBoxByLabel(ctx, args.moveId, label);
  if (existing) return { boxId: existing._id, created: false };

  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-BOX",
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
    { code, label },
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
  },
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
    { boxId: args.boxId, itemId: args.itemId },
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
  },
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
    dimensionsIn: args.draft.dimensionsIn,
    dimensionsConfidence: args.draft.dimensionsConfidence ?? "none",
    estimatedWeightLb: args.draft.estimatedWeightLb,
    estimatedWeightLowLb: args.draft.estimatedWeightLowLb,
    estimatedWeightHighLb: args.draft.estimatedWeightHighLb,
    weightConfidence: args.draft.weightConfidence ?? "none",
    estimatedVolumeCuFt: args.draft.estimatedVolumeCuFt,
    volumeConfidence: args.draft.volumeConfidence ?? "none",
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
    { photoId: args.photoId, name },
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
  },
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI photo box";
  const code = await uniqueApiAiBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label,
    "AI-PHOTO-BOX",
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
    { code, label },
  );
  return boxId;
}

async function findApiAiBoxByLabel(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string,
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
          normalizeApiAiBoxLabelKey(box.code) === normalizedLabel),
    ) ?? null
  );
}

async function uniqueApiAiBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string,
  fallback: string,
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
      itemDraft: parseApiAiTextItemDraft(
        approval.itemDraft,
        "approval.itemDraft",
      ),
      boxDraft: parseApiAiTextBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI text suggestion approval.",
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
      itemDraft: parseApiAiPhotoItemDraft(
        approval.itemDraft,
        "approval.itemDraft",
      ),
      boxDraft: parseApiAiPhotoBoxDraft(approval.boxDraft, "approval.boxDraft"),
    };
  });
  assertUniqueReviewIds(
    approvals.map((approval) => approval.suggestionId),
    "Duplicate AI photo suggestion approval.",
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
  includeDestinationRoom: boolean,
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
    spaceId: optionalString(input.spaceId),
    spaceName: normalizeOptionalText(asString(input.spaceName)),
    currentSpaceId: optionalString(input.currentSpaceId),
    destinationRoom: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationRoom))
      : undefined,
    destinationSpaceId: includeDestinationRoom
      ? optionalString(input.destinationSpaceId)
      : undefined,
    destinationSpaceName: includeDestinationRoom
      ? normalizeOptionalText(asString(input.destinationSpaceName))
      : undefined,
    category: normalizeOptionalText(asString(input.category)),
    disposition,
    quantity: positiveNumber(input.quantity) ?? 1,
    description: normalizeOptionalText(asString(input.description)),
    dimensionsIn: parseDimensionsIn(input.dimensionsIn),
    dimensionsConfidence:
      parsePlanningConfidence(
        input.dimensionsConfidence,
        `${label}.dimensionsConfidence`,
      ) ?? undefined,
    estimatedWeightLb: optionalNumber(input.estimatedWeightLb),
    estimatedWeightLowLb: optionalNumber(input.estimatedWeightLowLb),
    estimatedWeightHighLb: optionalNumber(input.estimatedWeightHighLb),
    weightConfidence:
      parsePlanningConfidence(
        input.weightConfidence,
        `${label}.weightConfidence`,
      ) ?? undefined,
    estimatedVolumeCuFt: optionalNumber(input.estimatedVolumeCuFt),
    volumeConfidence:
      parsePlanningConfidence(
        input.volumeConfidence,
        `${label}.volumeConfidence`,
      ) ?? undefined,
    suggestedBoxLabel: normalizeOptionalText(asString(input.suggestedBoxLabel)),
    fragility: parseItemFragility(input.fragility, `${label}.fragility`),
    highValue:
      input.highValue === undefined ? undefined : Boolean(input.highValue),
    planningDefaultKeys:
      parseLiteralArray(
        input.planningDefaultKeys,
        planningDefaultKeys,
        `${label}.planningDefaultKeys`,
      ) ?? [],
    researchSummary: normalizeOptionalText(asString(input.researchSummary)),
    researchSources:
      input.researchSources === undefined
        ? undefined
        : (parseItemResearchSources(input.researchSources) ?? []),
    researchNotes: normalizeOptionalText(asString(input.researchNotes)),
    researchConfidence:
      parsePlanningConfidence(
        input.researchConfidence,
        `${label}.researchConfidence`,
      ) ?? undefined,
    attachMediaPhotoIds: parsePhotoIdArray(input.attachMediaPhotoIds),
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
  includeDestinationRoom: boolean,
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
  draft: RestAiTextItemDraft | undefined,
): RestAiTextItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    currentSpaceId: draft.currentSpaceId,
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    destinationSpaceId: draft.destinationSpaceId,
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    dimensionsIn: draft.dimensionsIn,
    dimensionsConfidence: draft.dimensionsConfidence,
    estimatedWeightLb: draft.estimatedWeightLb,
    estimatedWeightLowLb: draft.estimatedWeightLowLb,
    estimatedWeightHighLb: draft.estimatedWeightHighLb,
    weightConfidence: draft.weightConfidence,
    estimatedVolumeCuFt: draft.estimatedVolumeCuFt,
    volumeConfidence: draft.volumeConfidence,
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
    researchSummary: normalizeOptionalText(draft.researchSummary),
    researchSources: draft.researchSources ?? [],
    researchNotes: normalizeOptionalText(draft.researchNotes),
    researchConfidence: draft.researchConfidence,
    attachMediaPhotoIds: draft.attachMediaPhotoIds ?? [],
  };
}

async function resolveApiAiTextDraftSpaceRefs(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    drafts: RestAiTextItemDraft[];
  },
) {
  const resolved: RestAiTextItemDraft[] = [];
  for (const draft of args.drafts) {
    const spaceRefs = await apiAiTextDraftSpaceRefs(ctx, {
      householdId: args.auth.householdId,
      moveId: args.moveId,
      draft,
    });
    resolved.push(
      removeUndefined({
        ...draft,
        currentSpaceId: spaceRefs.currentSpaceId,
        destinationSpaceId: spaceRefs.destinationSpaceId,
        spaceId: undefined,
        spaceName: undefined,
        destinationSpaceName: undefined,
      }) as RestAiTextItemDraft,
    );
  }
  return resolved;
}

async function apiAiTextDraftSpaceRefs(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    draft: RestAiTextItemDraft;
  },
): Promise<
  Partial<Pick<Doc<"items">, "currentSpaceId" | "destinationSpaceId">>
> {
  const input = bodyObject(args.draft);
  const refs: Partial<
    Pick<Doc<"items">, "currentSpaceId" | "destinationSpaceId">
  > = {};

  if (
    input.currentSpaceId !== undefined ||
    input.spaceId !== undefined ||
    input.spaceName !== undefined
  ) {
    const currentSpace = await resolveApiSpaceRef(
      ctx,
      args.householdId,
      args.moveId,
      {
        ...input,
        currentSpaceId: input.currentSpaceId ?? input.spaceId,
      },
      { idPath: "currentSpaceId", namePath: "spaceName" },
    );
    refs.currentSpaceId = currentSpace?._id;
  }

  if (
    input.destinationSpaceId !== undefined ||
    input.destinationSpaceName !== undefined
  ) {
    const destinationSpace = await resolveApiSpaceRef(
      ctx,
      args.householdId,
      args.moveId,
      input,
      { idPath: "destinationSpaceId", namePath: "destinationSpaceName" },
    );
    refs.destinationSpaceId = destinationSpace?._id;
  }

  return refs;
}

function normalizeApiAiTextBoxDraft(
  draft: RestAiTextBoxDraft | undefined,
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
  draft: RestAiPhotoItemDraft | undefined,
): RestAiPhotoItemDraft | undefined {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveNumber(draft.quantity) ?? 1,
    description: normalizeOptionalText(draft.description),
    dimensionsIn: draft.dimensionsIn,
    dimensionsConfidence: draft.dimensionsConfidence,
    estimatedWeightLb: draft.estimatedWeightLb,
    estimatedWeightLowLb: draft.estimatedWeightLowLb,
    estimatedWeightHighLb: draft.estimatedWeightHighLb,
    weightConfidence: draft.weightConfidence,
    estimatedVolumeCuFt: draft.estimatedVolumeCuFt,
    volumeConfidence: draft.volumeConfidence,
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeApiAiPhotoBoxDraft(
  draft: RestAiPhotoBoxDraft | undefined,
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
  const sourceText = asString(bodyObject(body).sourceText)
    ?.trim()
    .slice(0, 12000);
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
          Boolean(entry),
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
  photo: Doc<"itemPhotos">,
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
        candidate.originalHash === photo.originalHash,
    )
    .map((candidate) => candidate._id);
}

async function routeDocumentationProfiles(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  profileIdSegment?: string,
  actionSegment?: string,
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
        (status ? profile.status === status : profile.status !== "archived"),
    );
    if (profileIdSegment && !actionSegment) {
      const profile = visibleProfiles.find(
        (entry) => entry._id === profileIdSegment,
      );
      if (!profile) {
        throw new Error("Documentation profile not found.");
      }
      return restOk({ data: safeDocumentationProfile(profile) });
    }
    if (!profileIdSegment) {
      return restOk(
        paginate(
          visibleProfiles.map((profile) => safeDocumentationProfile(profile)),
          args.query,
        ),
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
    const documentationProfileId = await ctx.db.insert(
      "documentationProfiles",
      {
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
      },
    );

    await auditApiDocumentationProfile(
      ctx,
      auth,
      moveId,
      "documentation_profile.created",
      documentationProfileId,
      { type, status, includedFields: config.includedFields },
    );
    const profile = await ctx.db.get(documentationProfileId);
    return restOk(
      {
        data: profile
          ? safeDocumentationProfile(profile)
          : { documentationProfileId },
      },
      201,
    );
  }

  if (args.method === "PATCH" && profileIdSegment && !actionSegment) {
    const existing = await requireApiMutableDocumentationProfile(
      ctx,
      auth.householdId,
      moveId,
      profileIdSegment,
    );
    const body = bodyObject(args.body);
    const type = parseDocumentationProfileType(body.type) ?? existing.type;
    const status =
      parseDocumentationProfileStatus(body.status) ?? existing.status;
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
        body.disclaimer === undefined
          ? existing.disclaimer
          : asString(body.disclaimer),
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
      { previousStatus: existing.status, nextStatus: status, type },
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
      profileIdSegment,
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
      existing._id,
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
  actionSegment?: string,
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
        args.query,
      ),
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
      exportIdSegment,
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
  actionSegment?: string,
) {
  if (
    args.method === "GET" &&
    shareLinkIdSegment === "comments" &&
    !actionSegment
  ) {
    return await routeShareLinkComments(ctx, args, auth, moveId);
  }

  if (
    args.method === "GET" &&
    shareLinkIdSegment &&
    actionSegment === "comments"
  ) {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment,
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
              (!status || link.status === status),
          )
          .map((link) => safeApiShareLink(link)),
        args.query,
      ),
    );
  }

  if (args.method === "GET" && shareLinkIdSegment && !actionSegment) {
    const link = await requireApiShareLink(
      ctx,
      auth.householdId,
      moveId,
      shareLinkIdSegment,
    );
    return restOk({ data: safeApiShareLink(link) });
  }

  if (args.method === "POST" && !shareLinkIdSegment) {
    const body = bodyObject(args.body);
    const documentationProfileId = optionalString(
      body.documentationProfileId,
    ) as Id<"documentationProfiles"> | undefined;
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
      },
    );
    return restOk(
      {
        data: {
          ...result,
          url: `/share/${result.token}`,
          expiresAt,
        },
      },
      201,
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
      },
    );
    return restOk({
      data: { revoked: true, shareLink: safeApiShareLink(link) },
    });
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
  shareLinkId?: Id<"shareLinks">,
) {
  const documentationProfileId = optionalString(
    args.query.documentationProfileId,
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
          comment.documentationProfileId === documentationProfileId),
    ),
    args.query,
  );

  return restOk({
    ...page,
    data: await Promise.all(
      page.data.map((comment) => safeApiShareLinkComment(ctx, comment)),
    ),
  });
}

async function routeTopLevelItem(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  itemIdSegment?: string,
) {
  if (!itemIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Item not found.",
    });
  }
  const item = await requireApiItemById(ctx, auth.householdId, itemIdSegment);
  assertApiObjectMoveAccess(auth, item.moveId);
  assertRequestedMoveMatches(args, item.moveId, "Item not found.");

  if (args.method === "GET") {
    return restOk({ data: safeItem(item) });
  }

  if (args.method === "PATCH") {
    const patch = itemPatch(args.body, auth, item);
    await applyItemSpaceRefs(
      ctx,
      auth.householdId,
      item.moveId,
      args.body,
      patch,
    );
    await ctx.db.patch(item._id, patch);
    const updated = await ctx.db.get(item._id);
    await auditApiWrite(
      ctx,
      auth,
      item.moveId,
      "item.api_updated",
      "items",
      item._id,
      { route: "top_level", changedKeys: Object.keys(patch) },
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
      { route: "top_level" },
    );
    return restOk({ data: { deleted: true, itemId: item._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Item route not found.",
  });
}

async function routeTopLevelBox(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  boxIdSegment?: string,
  nestedSegment?: string,
  nestedIdSegment?: string,
) {
  if (!boxIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Box not found.",
    });
  }
  const box = await requireApiBoxById(ctx, auth.householdId, boxIdSegment);
  assertApiObjectMoveAccess(auth, box.moveId);
  assertRequestedMoveMatches(args, box.moveId, "Box not found.");

  if (nestedSegment === "items") {
    return await routeTopLevelBoxItems(ctx, args, auth, box, nestedIdSegment);
  }

  if (nestedSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Box route not found.",
    });
  }

  if (args.method === "GET") {
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "PATCH") {
    const patch = boxPatch(args.body);
    if (patch.code !== undefined) {
      await assertUniqueApiBoxCode(ctx, {
        householdId: auth.householdId,
        moveId: box.moveId,
        code: patch.code,
        currentBoxId: box._id,
      });
    }
    Object.assign(
      patch,
      await boxDestinationRefsFromInput(
        ctx,
        auth.householdId,
        box.moveId,
        args.body,
      ),
    );
    await ctx.db.patch(box._id, patch);
    const updated = await ctx.db.get(box._id);
    await auditApiWrite(
      ctx,
      auth,
      box.moveId,
      "box.api_updated",
      "boxes",
      box._id,
      { route: "top_level", changedKeys: Object.keys(patch) },
    );
    return restOk({ data: updated ? safeBox(updated) : { boxId: box._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Box route not found.",
  });
}

async function routeTopLevelBoxItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  box: Doc<"boxes">,
  itemIdSegment?: string,
) {
  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    const item = await resolveApiItemRef(
      ctx,
      auth.householdId,
      box.moveId,
      body,
    );
    const result = await upsertApiBoxItemAssignment(ctx, {
      auth,
      moveId: box.moveId,
      box,
      item,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      dryRun: Boolean(body.dryRun),
      route: "top_level_box",
    });
    return restOk({ data: result }, result.created ? 201 : 200);
  }

  if (args.method === "DELETE" && itemIdSegment) {
    const item = await requireApiItem(
      ctx,
      auth.householdId,
      box.moveId,
      itemIdSegment,
    );
    const result = await deleteApiBoxItemAssignment(ctx, {
      auth,
      moveId: box.moveId,
      box,
      item,
      dryRun: false,
      route: "top_level_box",
    });
    return restOk({ data: result });
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
  actionSegment?: string,
) {
  if (!photoIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Photo not found.",
    });
  }
  if (args.method !== "POST" || actionSegment !== "attach") {
    return restError({
      status: 404,
      code: "not_found",
      message: "Photo route not found.",
    });
  }

  const photo = await requireApiPhotoById(
    ctx,
    auth.householdId,
    photoIdSegment,
  );
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
    { changedKeys: Object.keys(patch) },
  );
  return restOk({
    data: updated ? safePhoto(updated) : { photoId: photo._id },
  });
}

async function routeTopLevelExport(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  exportIdSegment?: string,
) {
  if (!exportIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Export not found.",
    });
  }
  const moveId = requiredQueryMoveId(args.query);
  const job = await requireApiExportJob(
    ctx,
    auth.householdId,
    moveId,
    exportIdSegment,
  );
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
  createResponse: () => Promise<RestResponse>,
) {
  if (args.method === "GET" || !args.idempotencyKey) {
    return await createResponse();
  }
  const requestHash = await hashApiKey(requestHashInput(args));
  const existing = await ctx.db
    .query("apiIdempotencyKeys")
    .withIndex("by_api_key_key", (q) =>
      q
        .eq("apiKeyId", auth.apiKeyId)
        .eq("idempotencyKey", args.idempotencyKey!),
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
  if (response.status >= 500) {
    return response;
  }
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
  moveId: Id<"moves">,
) {
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId || move.status === "archived") {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Move not found.",
    });
  }
  return move;
}

async function requireApiPlan(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  planIdSegment: string,
) {
  const plan = await ctx.db.get(planIdSegment as Id<"floorPlans">);
  if (
    !plan ||
    plan.householdId !== auth.householdId ||
    plan.archivedAt ||
    plan.status !== "active"
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Plan not found.",
    });
  }
  if (auth.moveId && auth.moveId !== plan.moveId) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Plan not found.",
    });
  }
  await requireApiMove(ctx, auth.householdId, plan.moveId);
  return plan;
}

async function planDocumentForApi(
  ctx: MutationCtx,
  plan: Doc<"floorPlans">,
): Promise<PlanDocumentInput> {
  const [
    levels,
    entities,
    placements,
    items,
    boxes,
    plannedItems,
    pendingProposals,
  ] = await Promise.all([
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
        q.eq("planId", plan._id).eq("status", "pending"),
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
      .map(
        (entity): PlanEntitySummary => ({
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
        }),
      ),
    placements: placements
      .filter((placement) => !placement.archivedAt)
      .map(
        (placement): PlanPlacementSummary => ({
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
        }),
      ),
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
  itemIdSegment: string,
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (
    !item ||
    item.householdId !== householdId ||
    item.moveId !== moveId ||
    item.deletedAt
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Item not found.",
    });
  }
  return item;
}

async function requireApiPlannedItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  plannedItemIdSegment: string,
  includeArchived = false,
) {
  const plannedItem = await ctx.db.get(
    plannedItemIdSegment as Id<"plannedItems">,
  );
  if (
    !plannedItem ||
    plannedItem.householdId !== householdId ||
    plannedItem.moveId !== moveId ||
    (!includeArchived && plannedItem.archivedAt)
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Planned item not found.",
    });
  }
  return plannedItem;
}

async function requireApiItemById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  itemIdSegment: string,
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.deletedAt) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Item not found.",
    });
  }
  return item;
}

async function requireApiBox(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  boxIdSegment: string,
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (
    !box ||
    box.householdId !== householdId ||
    box.moveId !== moveId ||
    box.archivedAt
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Box not found.",
    });
  }
  return box;
}

async function resolveApiBoxRef(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
) {
  const boxId = optionalString(input.boxId);
  if (boxId) {
    return await requireApiBox(ctx, householdId, moveId, boxId);
  }

  const boxCode = normalizeRestBoxCode(input.boxCode);
  if (!boxCode) {
    throw invalidField("boxId", "Provide boxId or boxCode to resolve the box.");
  }

  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const active = boxes.filter(
    (box) => box.householdId === householdId && !box.archivedAt,
  );
  const matches = active.filter(
    (box) => normalizeRestBoxCode(box.code) === boxCode,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw referenceError({
      status: 409,
      code: "ambiguous_name",
      path: "boxCode",
      message: `Box code "${boxCode}" matched multiple boxes.`,
      candidates: matches.map((box) => box.code),
    });
  }
  throw referenceError({
    status: 404,
    code: "name_not_found",
    path: "boxCode",
    message: `Box code "${boxCode}" was not found in this move.`,
    candidates: active.map((box) => box.code).slice(0, 5),
  });
}

async function requireApiBoxById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  boxIdSegment: string,
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.archivedAt) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Box not found.",
    });
  }
  return box;
}

async function requireApiMovePerson(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  personIdSegment: string,
  includeArchived = false,
) {
  const person = await ctx.db.get(personIdSegment as Id<"movePeople">);
  if (
    !person ||
    person.householdId !== householdId ||
    person.moveId !== moveId ||
    (!includeArchived && person.archivedAt)
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Move person not found.",
    });
  }
  return person;
}

async function requireApiPhotoById(
  ctx: MutationCtx,
  householdId: Id<"households">,
  photoIdSegment: string,
) {
  const photo = await ctx.db.get(photoIdSegment as Id<"itemPhotos">);
  if (!photo || photo.householdId !== householdId || photo.archivedAt) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Photo not found.",
    });
  }
  return photo;
}

async function resolveApiItemRef(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
) {
  const itemId = optionalString(input.itemId);
  if (itemId) {
    return await requireApiItem(ctx, householdId, moveId, itemId);
  }

  const externalKey = externalItemKeyFromInput(input);
  if (!externalKey) {
    throw invalidField(
      "itemId",
      "Provide itemId or externalSource and externalId to resolve the item.",
    );
  }
  const item = await findApiItemByExternalKey(
    ctx,
    householdId,
    moveId,
    externalKey,
  );
  if (!item) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: `Item external key ${externalKey.externalSource}/${externalKey.externalId} was not found in this move.`,
      fields: [
        {
          path: "externalId",
          message:
            "No active item exists with this externalSource and externalId in the move.",
        },
      ],
    });
  }
  return item;
}

async function resolveApiSpaceRef(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
  options: { idPath?: string; namePath?: string } = {},
) {
  const idPath = options.idPath ?? "spaceId";
  const namePath = options.namePath ?? "spaceName";
  const spaceId = optionalString(input[idPath]);
  if (spaceId) {
    const space = await ctx.db.get(spaceId as Id<"moveSpaces">);
    if (
      !space ||
      space.householdId !== householdId ||
      space.moveId !== moveId ||
      space.status === "archived"
    ) {
      throw new RestApiError({
        status: 404,
        code: "not_found",
        message: "Space not found.",
      });
    }
    return space;
  }

  const spaceName = normalizeOptionalText(asString(input[namePath]));
  if (!spaceName) return null;
  const spaces = await ctx.db
    .query("moveSpaces")
    .withIndex("by_move_name", (q) => q.eq("moveId", moveId))
    .collect();
  const active = spaces.filter(
    (space) => space.householdId === householdId && space.status !== "archived",
  );
  const normalized = spaceName.toLowerCase();
  const matches = active.filter(
    (space) => space.name.toLowerCase() === normalized,
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw referenceError({
      status: 409,
      code: "ambiguous_name",
      path: namePath,
      message: `Space name "${spaceName}" matched multiple spaces.`,
      candidates: matches.map((space) => space.name),
    });
  }
  throw referenceError({
    status: 404,
    code: "name_not_found",
    path: namePath,
    message: `Space name "${spaceName}" was not found in this move.`,
    candidates: active.map((space) => space.name).slice(0, 5),
  });
}

const destinationAssignableSpaceKinds = new Set<Doc<"moveSpaces">["kind"]>([
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "custom",
]);

function assertDestinationAssignableSpace(
  space: Doc<"moveSpaces">,
  path: string,
) {
  if (destinationAssignableSpaceKinds.has(space.kind)) {
    return;
  }
  throw new RestApiError({
    status: 400,
    code: "validation_error",
    message:
      "Destination location must be a destination room, storage, yard/outdoor, or custom space.",
    fields: [
      {
        path,
        message:
          "Origin rooms and transport spaces cannot be used as destination locations.",
        validValues: Array.from(destinationAssignableSpaceKinds),
      },
    ],
  });
}

async function boxDestinationRefsFromInput(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  body: unknown,
): Promise<
  Partial<Pick<Doc<"boxes">, "destinationRoom" | "destinationSpaceId">>
> {
  const input = bodyObject(body);
  const patch: Partial<
    Pick<Doc<"boxes">, "destinationRoom" | "destinationSpaceId">
  > = {};

  if (input.clearDestinationSpace === true) {
    patch.destinationSpaceId = undefined;
  }

  if (
    input.destinationSpaceId !== undefined ||
    input.destinationSpaceName !== undefined
  ) {
    const destinationSpace = await resolveApiSpaceRef(
      ctx,
      householdId,
      moveId,
      input,
      { idPath: "destinationSpaceId", namePath: "destinationSpaceName" },
    );
    if (destinationSpace) {
      assertDestinationAssignableSpace(
        destinationSpace,
        input.destinationSpaceId !== undefined
          ? "destinationSpaceId"
          : "destinationSpaceName",
      );
      patch.destinationSpaceId = destinationSpace._id;
      if (input.destinationRoom === undefined) {
        patch.destinationRoom = destinationSpace.name;
      }
    }
  }

  return patch;
}

function referenceError({
  status,
  code,
  path,
  message,
  candidates,
}: {
  status: number;
  code: string;
  path: string;
  message: string;
  candidates: string[];
}) {
  return new RestApiError({
    status,
    code,
    message,
    fields: [
      {
        path,
        message:
          candidates.length > 0
            ? "Use one of the listed candidate values or pass the explicit ID."
            : "No candidates were found for this move.",
        validValues: candidates,
      },
    ],
  });
}

async function requireApiTransportResource(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  resourceIdSegment: string,
) {
  const resource = await ctx.db.get(
    resourceIdSegment as Id<"transportResources">,
  );
  if (
    !resource ||
    resource.householdId !== householdId ||
    resource.moveId !== moveId ||
    resource.archivedAt
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Transport resource not found.",
    });
  }
  return resource;
}

async function requireApiTransportZone(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  zoneIdSegment: string,
) {
  const zone = await ctx.db.get(zoneIdSegment as Id<"transportZones">);
  if (
    !zone ||
    zone.householdId !== householdId ||
    zone.moveId !== moveId ||
    zone.archivedAt
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Transport zone not found.",
    });
  }
  return zone;
}

async function requireApiDocumentationProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId?: Id<"documentationProfiles">;
  },
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
  profileIdSegment: string,
) {
  const profile = await ctx.db.get(
    profileIdSegment as Id<"documentationProfiles">,
  );
  if (
    !profile ||
    profile.householdId !== householdId ||
    profile.moveId !== moveId
  ) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

async function requireApiExportJob(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  exportIdSegment: string,
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
  shareLinkIdSegment: string,
) {
  const link = await ctx.db.get(shareLinkIdSegment as Id<"shareLinks">);
  if (!link || link.householdId !== householdId || link.moveId !== moveId) {
    throw new Error("Share link not found.");
  }
  return link;
}

function requiredQueryMoveId(query: Record<string, string>) {
  if (!query.moveId) {
    throw invalidField("moveId", "moveId query parameter is required.");
  }
  return query.moveId as Id<"moves">;
}

function assertApiObjectMoveAccess(
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  objectMoveId: Id<"moves">,
) {
  if (auth.moveId && auth.moveId !== objectMoveId) {
    throw new RestApiError({
      status: 403,
      code: "insufficient_scope",
      message: "API key is not allowed for this operation.",
    });
  }
}

function assertRequestedMoveMatches(
  args: RestRequestInput,
  objectMoveId: Id<"moves">,
  message: string,
) {
  const requestedMoveId = optionalRequestMoveId(args);
  if (requestedMoveId && requestedMoveId !== objectMoveId) {
    throw new RestApiError({ status: 404, code: "not_found", message });
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
    destinationSpaceName: item.destinationSpaceId
      ? item.destinationRoom
      : undefined,
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
    assignedResourceId: item.assignedResourceId,
    assignedZoneId: item.assignedZoneId,
    assignmentLocked: item.assignmentLocked,
    assignmentOverrideReason: item.assignmentOverrideReason,
    assignmentWarnings: item.assignmentWarnings ?? [],
    assignmentHardBlocks: item.assignmentHardBlocks ?? [],
    assignmentValidatedAt: item.assignmentValidatedAt,
    agentLabel: item.agentLabel,
    aiConfidenceScore: item.aiConfidenceScore,
    researchSummary: item.researchSummary,
    researchSources: item.researchSources ?? [],
    researchNotes: item.researchNotes,
    researchConfidence: item.researchConfidence,
    researchedAt: item.researchedAt,
    researchedByLabel: item.researchedByLabel,
    deletedAt: item.deletedAt,
    archivedAt: item.deletedAt ?? null,
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
  return safeRestBox(box);
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

function effectiveIngestionStatus(
  entry: Doc<"ingestionQueueEntries">,
  now: number,
): IngestionQueueStatus {
  return ingestionClaimIsExpired(entry, now) ? "queued" : entry.status;
}

function optionalIngestionQueueStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  return requiredIngestionQueueStatus(value);
}

function parseFloorplanEvidenceType(value: unknown) {
  if (value === undefined || value === "") return "note";
  if (includesLiteral(restFloorplanEvidenceTypes, value)) {
    return value as (typeof restFloorplanEvidenceTypes)[number];
  }
  throw invalidField(
    "evidenceType",
    "Unsupported floorplan evidence type.",
    restFloorplanEvidenceTypes,
  );
}

function parseFloorplanEvidenceSourceType(value: unknown) {
  if (value === undefined || value === "") return "agentExtraction";
  if (includesLiteral(restFloorplanEvidenceSourceTypes, value)) {
    return value as (typeof restFloorplanEvidenceSourceTypes)[number];
  }
  throw invalidField(
    "sourceType",
    "Unsupported floorplan evidence source type.",
    restFloorplanEvidenceSourceTypes,
  );
}

function parseFloorplanMeasurementKind(value: unknown) {
  if (value === undefined || value === "") return "known";
  if (includesLiteral(restFloorplanMeasurementKinds, value)) {
    return value as (typeof restFloorplanMeasurementKinds)[number];
  }
  throw invalidField(
    "kind",
    "Unsupported floorplan measurement kind.",
    restFloorplanMeasurementKinds,
  );
}

function parseFloorplanMeasurementType(value: unknown) {
  if (includesLiteral(restFloorplanMeasurementTypes, value)) {
    return value as (typeof restFloorplanMeasurementTypes)[number];
  }
  throw invalidField(
    "measurementType",
    "Unsupported floorplan measurement type.",
    restFloorplanMeasurementTypes,
  );
}

function parseFloorplanSpaceKind(value: unknown) {
  if (value === undefined) return undefined;
  if (includesLiteral(restFloorplanSpaceKinds, value)) {
    return value as (typeof restFloorplanSpaceKinds)[number];
  }
  throw invalidField(
    "kind",
    "Unsupported floorplan space kind.",
    restFloorplanSpaceKinds,
  );
}

function parseFloorplanPropertyZoneKind(value: unknown, path: string) {
  if (includesLiteral(restFloorplanPropertyZoneKinds, value)) {
    return value as (typeof restFloorplanPropertyZoneKinds)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan property zone kind.",
    restFloorplanPropertyZoneKinds,
  );
}

function parseFloorplanAreaRole(value: unknown, path = "areaRole") {
  if (value === undefined || value === "") return undefined;
  if (includesLiteral(restFloorplanAreaRoles, value)) {
    return value as (typeof restFloorplanAreaRoles)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan area role.",
    restFloorplanAreaRoles,
  );
}

function parseFloorplanConstraintStrength(
  value: unknown,
  path = "constraintStrength",
) {
  if (value === undefined || value === "") return undefined;
  if (includesLiteral(restFloorplanConstraintStrengths, value)) {
    return value as (typeof restFloorplanConstraintStrengths)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan constraint strength.",
    restFloorplanConstraintStrengths,
  );
}

function parseFloorplanMeasurementUnit(value: unknown, path = "unit") {
  if (value === undefined || value === "") return undefined;
  if (includesLiteral(restFloorplanMeasurementUnits, value)) {
    return value as (typeof restFloorplanMeasurementUnits)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan measurement unit.",
    restFloorplanMeasurementUnits,
  );
}

function parseFloorplanConnectionKind(value: unknown, path: string) {
  if (includesLiteral(restFloorplanConnectionKinds, value)) {
    return value as (typeof restFloorplanConnectionKinds)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan connection kind.",
    restFloorplanConnectionKinds,
  );
}

function parseFloorplanMeasurementSubjectType(value: unknown) {
  if (includesLiteral(restFloorplanMeasurementSubjectTypes, value)) {
    return value as (typeof restFloorplanMeasurementSubjectTypes)[number];
  }
  throw invalidField(
    "subjectType",
    "Unsupported floorplan measurement subject type.",
    restFloorplanMeasurementSubjectTypes,
  );
}

function parseFloorplanMeasurementInputs(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField("measurements", "Expected an array of measurements.");
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    return {
      subjectType: parseFloorplanMeasurementSubjectType(input.subjectType),
      subjectKey: requiredBodyString(
        input.subjectKey,
        `measurements.${index}.subjectKey is required.`,
      ),
      subjectLabel: requiredBodyString(
        input.subjectLabel,
        `measurements.${index}.subjectLabel is required.`,
      ),
      measurementType: parseFloorplanMeasurementType(input.measurementType),
      kind: parseFloorplanMeasurementKind(input.kind),
      valueIn: optionalNumber(input.valueIn),
      minIn: optionalNumber(input.minIn),
      maxIn: optionalNumber(input.maxIn),
      unit: parseFloorplanMeasurementUnit(
        input.unit,
        `measurements.${index}.unit`,
      ),
      value: optionalNumber(input.value),
      minValue: optionalNumber(input.minValue),
      maxValue: optionalNumber(input.maxValue),
      displayValue:
        optionalString(input.displayValue) ??
        displayMeasurementValue(
          input.valueIn ?? input.value,
          input.minIn ?? input.minValue,
          input.maxIn ?? input.maxValue,
        ),
      confidence: parseConfidence(input.confidence),
      areaRole: parseFloorplanAreaRole(
        input.areaRole,
        `measurements.${index}.areaRole`,
      ),
      constraintStrength: parseFloorplanConstraintStrength(
        input.constraintStrength,
        `measurements.${index}.constraintStrength`,
      ),
      sourceObservationIds: parseOptionalTypedIdArray<"floorplanObservations">(
        input.sourceObservationIds,
      ),
      notes: normalizeOptionalText(asString(input.notes)),
    };
  });
}

function parseFloorplanObservationInputs(value: Record<string, unknown>) {
  const rows = Array.isArray(value.observations)
    ? value.observations
    : [value].filter((entry) => Object.keys(entry).length > 0);
  if (!rows.length) {
    throw invalidField(
      "observations",
      "Provide at least one floorplan observation.",
    );
  }
  return rows.map((entry, index) => {
    const input = bodyObject(entry);
    const sourcePhotoId = optionalString(input.sourcePhotoId) as
      | Id<"itemPhotos">
      | undefined;
    return {
      evidenceId: optionalString(input.evidenceId) as
        | Id<"floorplanEvidenceRecords">
        | undefined,
      sourceType: parseFloorplanEvidenceSourceType(input.sourceType),
      sourcePhotoId,
      sourceLabel: normalizeOptionalText(asString(input.sourceLabel)),
      sourceRegion: parseFloorplanSourceRegion(input.sourceRegion),
      imageNumber: optionalNumber(input.imageNumber),
      observationType: parseFloorplanObservationType(
        input.observationType,
        `observations.${index}.observationType`,
      ),
      status: parseFloorplanObservationStatus(
        input.status,
        `observations.${index}.status`,
      ),
      title: requiredBodyString(
        input.title,
        `observations.${index}.title is required.`,
      ),
      subjectKey: normalizeOptionalText(asString(input.subjectKey)),
      subjectLabel: normalizeOptionalText(asString(input.subjectLabel)),
      subjectKind: parseFloorplanSubjectKind(
        input.subjectKind,
        `observations.${index}.subjectKind`,
      ),
      rawText: normalizeOptionalText(asString(input.rawText)),
      normalized: input.normalized,
      confidence: parseConfidence(input.confidence),
      relatedMeasurementIds: parseOptionalTypedIdArray<"floorplanMeasurements">(
        input.relatedMeasurementIds,
      ),
      relatedObservationIds: parseOptionalTypedIdArray<"floorplanObservations">(
        input.relatedObservationIds,
      ),
      notes: normalizeOptionalText(asString(input.notes)),
      agentLabel: normalizeOptionalText(
        asString(input.agentLabel ?? value.agentLabel),
      ),
    };
  });
}

function parseFloorplanRelationshipInputs(
  _ctx: MutationCtx,
  value: Record<string, unknown>,
) {
  const rows = Array.isArray(value.relationships)
    ? value.relationships
    : [value].filter((entry) => Object.keys(entry).length > 0);
  if (!rows.length) {
    throw invalidField(
      "relationships",
      "Provide at least one floorplan relationship.",
    );
  }
  return rows.map((entry, index) => {
    const input = bodyObject(entry);
    return {
      evidenceId: optionalString(input.evidenceId) as
        | Id<"floorplanEvidenceRecords">
        | undefined,
      sourceType: parseFloorplanEvidenceSourceType(input.sourceType),
      sourceLabel: normalizeOptionalText(asString(input.sourceLabel)),
      relationshipType: parseFloorplanRelationshipType(
        input.relationshipType,
        `relationships.${index}.relationshipType`,
      ),
      status: parseFloorplanObservationStatus(
        input.status,
        `relationships.${index}.status`,
      ),
      fromSubjectKey: requiredBodyString(
        input.fromSubjectKey,
        `relationships.${index}.fromSubjectKey is required.`,
      ),
      fromSubjectLabel:
        optionalString(input.fromSubjectLabel) ??
        requiredBodyString(
          input.fromSubjectKey,
          `relationships.${index}.fromSubjectKey is required.`,
        ),
      toSubjectKey: requiredBodyString(
        input.toSubjectKey,
        `relationships.${index}.toSubjectKey is required.`,
      ),
      toSubjectLabel:
        optionalString(input.toSubjectLabel) ??
        requiredBodyString(
          input.toSubjectKey,
          `relationships.${index}.toSubjectKey is required.`,
        ),
      confidence: parseConfidence(input.confidence),
      sourceObservationIds: parseOptionalTypedIdArray<"floorplanObservations">(
        input.sourceObservationIds,
      ),
      sourceMeasurementIds: parseOptionalTypedIdArray<"floorplanMeasurements">(
        input.sourceMeasurementIds,
      ),
      evidenceIds: parseOptionalTypedIdArray<"floorplanEvidenceRecords">(
        input.evidenceIds,
      ),
      notes: normalizeOptionalText(asString(input.notes)),
      agentLabel: normalizeOptionalText(
        asString(input.agentLabel ?? value.agentLabel),
      ),
    };
  });
}

function parseFloorplanObservationType(value: unknown, path: string) {
  if (includesLiteral(restFloorplanObservationTypes, value)) {
    return value as (typeof restFloorplanObservationTypes)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan observation type.",
    restFloorplanObservationTypes,
  );
}

function parseFloorplanObservationStatus(value: unknown, path = "status") {
  if (value === undefined || value === "") return undefined;
  if (includesLiteral(restFloorplanObservationStatuses, value)) {
    return value as (typeof restFloorplanObservationStatuses)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan observation status.",
    restFloorplanObservationStatuses,
  );
}

function parseFloorplanRelationshipType(value: unknown, path: string) {
  if (includesLiteral(restFloorplanRelationshipTypes, value)) {
    return value as (typeof restFloorplanRelationshipTypes)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan relationship type.",
    restFloorplanRelationshipTypes,
  );
}

function parseFloorplanSubjectKind(value: unknown, path: string) {
  if (value === undefined || value === "") return undefined;
  if (includesLiteral(restFloorplanSubjectKinds, value)) {
    return value as (typeof restFloorplanSubjectKinds)[number];
  }
  throw invalidField(
    path,
    "Unsupported floorplan subject kind.",
    restFloorplanSubjectKinds,
  );
}

function parseOptionalTypedIdArray<TTable extends TableNames>(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw invalidField("ids", "Expected an array of IDs.");
  }
  return value.filter(
    (entry): entry is Id<TTable> => typeof entry === "string",
  );
}

function parseFloorplanPuzzleInput(
  value: Record<string, unknown>,
): FloorplanPuzzleInput {
  const rooms = Array.isArray(value.rooms) ? value.rooms : [];
  return {
    rooms: rooms.map((entry, index) => {
      const room = bodyObject(entry);
      const relativeTo = room.relativeTo
        ? parseFloorplanRelativeTo(room.relativeTo, index)
        : undefined;
      return {
        id: requiredBodyString(room.id, `rooms.${index}.id is required.`),
        label:
          optionalString(room.label) ??
          requiredBodyString(room.id, `rooms.${index}.id is required.`),
        kind: parseFloorplanSpaceKind(room.kind),
        areaRole: parseFloorplanAreaRole(
          room.areaRole,
          `rooms.${index}.areaRole`,
        ),
        confidence: parseFloorplanVisualConfidence(room.confidence),
        xIn: optionalNumber(room.xIn),
        yIn: optionalNumber(room.yIn),
        widthIn: optionalNumber(room.widthIn),
        depthIn: optionalNumber(room.depthIn),
        clearWidthIn: optionalNumber(room.clearWidthIn),
        clearDepthIn: optionalNumber(room.clearDepthIn),
        wallThicknessIn: optionalNumber(room.wallThicknessIn),
        widthRangeIn: parseFloorplanRange(
          room.widthRangeIn,
          `rooms.${index}.widthRangeIn`,
        ),
        depthRangeIn: parseFloorplanRange(
          room.depthRangeIn,
          `rooms.${index}.depthRangeIn`,
        ),
        accessNote: normalizeOptionalText(asString(room.accessNote)),
        unresolvedSubspaces: parseStringArray(room.unresolvedSubspaces),
        connectsTo: parseFloorplanConnections(room.connectsTo, index),
        containedIn: optionalString(room.containedIn),
        partialOutside: room.partialOutside === true,
        sourceMeasurementIds: parseStringArray(room.sourceMeasurementIds),
        relativeTo,
      };
    }),
    zones: parseFloorplanPropertyZones(value.zones),
  };
}

function parseFloorplanPropertyZones(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw invalidField("zones", "zones must be an array.");
  }
  return value.map((entry, index) => {
    const zone = bodyObject(entry);
    return {
      id: requiredBodyString(zone.id, `zones.${index}.id is required.`),
      label:
        optionalString(zone.label) ??
        requiredBodyString(zone.id, `zones.${index}.id is required.`),
      kind: parseFloorplanPropertyZoneKind(zone.kind, `zones.${index}.kind`),
      areaRole: parseFloorplanAreaRole(
        zone.areaRole,
        `zones.${index}.areaRole`,
      ),
      confidence: parseFloorplanVisualConfidence(zone.confidence),
      xIn: optionalNumber(zone.xIn),
      yIn: optionalNumber(zone.yIn),
      widthIn: optionalNumber(zone.widthIn),
      depthIn: optionalNumber(zone.depthIn),
      widthRangeIn: parseFloorplanRange(
        zone.widthRangeIn,
        `zones.${index}.widthRangeIn`,
      ),
      depthRangeIn: parseFloorplanRange(
        zone.depthRangeIn,
        `zones.${index}.depthRangeIn`,
      ),
      sourceMeasurementIds: parseStringArray(zone.sourceMeasurementIds),
      partialOutside: zone.partialOutside === true,
      note: normalizeOptionalText(asString(zone.note)),
    };
  });
}

function parseFloorplanConnections(value: unknown, roomIndex: number) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw invalidField(
      `rooms.${roomIndex}.connectsTo`,
      "connectsTo must be an array.",
    );
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    const confidence = (parseFloorplanVisualConfidence(input.confidence) ??
      "low") as "high" | "medium" | "low" | "conflict";
    return {
      targetRoomId: requiredBodyString(
        input.targetRoomId,
        `rooms.${roomIndex}.connectsTo.${index}.targetRoomId is required.`,
      ),
      label: requiredBodyString(
        input.label,
        `rooms.${roomIndex}.connectsTo.${index}.label is required.`,
      ),
      kind: parseFloorplanConnectionKind(
        input.kind,
        `rooms.${roomIndex}.connectsTo.${index}.kind`,
      ),
      confidence,
      note: normalizeOptionalText(asString(input.note)),
    };
  });
}

function parseFloorplanRelativeTo(value: unknown, index: number) {
  const input = bodyObject(value);
  const relation = input.relation;
  if (
    relation !== "rightOf" &&
    relation !== "leftOf" &&
    relation !== "above" &&
    relation !== "below"
  ) {
    throw invalidField(
      `rooms.${index}.relativeTo.relation`,
      "relation must be rightOf, leftOf, above, or below.",
    );
  }
  const typedRelation = relation as "rightOf" | "leftOf" | "above" | "below";
  const align = input.align;
  if (
    align !== undefined &&
    align !== "start" &&
    align !== "center" &&
    align !== "end"
  ) {
    throw invalidField(
      `rooms.${index}.relativeTo.align`,
      "align must be start, center, or end.",
    );
  }
  const typedAlign = align as "start" | "center" | "end" | undefined;
  return {
    roomId: requiredBodyString(
      input.roomId,
      `rooms.${index}.relativeTo.roomId is required.`,
    ),
    relation: typedRelation,
    align: typedAlign,
    gapIn: optionalNumber(input.gapIn),
  };
}

function parseFloorplanRange(value: unknown, path: string) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number"
  ) {
    throw invalidField(path, "Range must be [minIn, maxIn].");
  }
  return [value[0], value[1]] as [number, number];
}

function parseFloorplanVisualConfidence(
  value: unknown,
): FloorplanConfidence | undefined {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "conflict"
  ) {
    return value;
  }
  return undefined;
}

function floorplanConfidenceFromEstimate(
  confidence: string,
): FloorplanConfidence {
  if (
    confidence === "high" ||
    confidence === "medium" ||
    confidence === "low"
  ) {
    return confidence;
  }
  if (confidence === "actual" || confidence === "manual") return "high";
  return "low";
}

function estimateConfidenceFromFloorplan(confidence: FloorplanConfidence) {
  return confidence === "conflict" ? "low" : confidence;
}

function parseFloorplanSourceRegion(value: unknown) {
  if (value === undefined) return undefined;
  const input = bodyObject(value);
  const region = {
    xPct: optionalNumber(input.xPct),
    yPct: optionalNumber(input.yPct),
    widthPct: optionalNumber(input.widthPct),
    heightPct: optionalNumber(input.heightPct),
  };
  if (
    region.xPct === undefined ||
    region.yPct === undefined ||
    region.widthPct === undefined ||
    region.heightPct === undefined
  ) {
    throw invalidField(
      "sourceRegion",
      "sourceRegion requires xPct, yPct, widthPct, and heightPct.",
    );
  }
  return region as {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  };
}

async function validateFloorplanSourcePhoto(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  photoId: Id<"itemPhotos">,
) {
  const photo = await ctx.db.get(photoId);
  if (
    !photo ||
    photo.householdId !== householdId ||
    photo.moveId !== moveId ||
    photo.archivedAt
  ) {
    throw invalidField(
      "sourcePhotoId",
      "Source photo was not found on this move.",
    );
  }
}

async function requireFloorplanEvidence(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  evidenceId: Id<"floorplanEvidenceRecords">,
) {
  const evidence = await ctx.db.get(evidenceId);
  if (
    !evidence ||
    evidence.householdId !== auth.householdId ||
    evidence.moveId !== plan.moveId ||
    evidence.planId !== plan._id
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Floorplan evidence not found.",
    });
  }
  return evidence;
}

async function requireFloorplanObservation(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  observationId: Id<"floorplanObservations">,
) {
  const observation = await ctx.db.get(observationId);
  if (
    !observation ||
    observation.householdId !== auth.householdId ||
    observation.moveId !== plan.moveId ||
    observation.planId !== plan._id
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Floorplan observation not found.",
    });
  }
  return observation;
}

async function requireFloorplanRelationship(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  plan: Doc<"floorPlans">,
  relationshipId: Id<"floorplanRelationships">,
) {
  const relationship = await ctx.db.get(relationshipId);
  if (
    !relationship ||
    relationship.householdId !== auth.householdId ||
    relationship.moveId !== plan.moveId ||
    relationship.planId !== plan._id
  ) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Floorplan relationship not found.",
    });
  }
  return relationship;
}

function safeFloorplanEvidence(entry: Doc<"floorplanEvidenceRecords">) {
  return {
    evidenceId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    evidenceType: entry.evidenceType,
    status: entry.status,
    title: entry.title,
    summary: entry.summary,
    confidence: entry.confidence,
    sourceType: entry.sourceType,
    areaRole: entry.areaRole,
    constraintStrength: entry.constraintStrength,
    sourcePhotoId: entry.sourcePhotoId,
    sourceLabel: entry.sourceLabel,
    sourceRegion: entry.sourceRegion,
    facts: entry.facts,
    agentLabel: entry.agentLabel,
    supersededById: entry.supersededById,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function safeFloorplanObservation(entry: Doc<"floorplanObservations">) {
  return {
    observationId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    evidenceId: entry.evidenceId,
    sourcePhotoId: entry.sourcePhotoId,
    sourceLabel: entry.sourceLabel,
    sourceRegion: entry.sourceRegion,
    imageNumber: entry.imageNumber,
    observationType: entry.observationType,
    status: entry.status,
    title: entry.title,
    subjectKey: entry.subjectKey,
    subjectLabel: entry.subjectLabel,
    subjectKind: entry.subjectKind,
    rawText: entry.rawText,
    normalized: entry.normalized,
    confidence: entry.confidence,
    provenance: entry.provenance,
    relatedMeasurementIds: entry.relatedMeasurementIds,
    relatedObservationIds: entry.relatedObservationIds,
    supersededById: entry.supersededById,
    agentLabel: entry.agentLabel,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function safeFloorplanRelationship(entry: Doc<"floorplanRelationships">) {
  return {
    relationshipId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    evidenceId: entry.evidenceId,
    relationshipType: entry.relationshipType,
    status: entry.status,
    fromSubjectKey: entry.fromSubjectKey,
    fromSubjectLabel: entry.fromSubjectLabel,
    toSubjectKey: entry.toSubjectKey,
    toSubjectLabel: entry.toSubjectLabel,
    confidence: entry.confidence,
    sourceObservationIds: entry.sourceObservationIds,
    sourceMeasurementIds: entry.sourceMeasurementIds,
    evidenceIds: entry.evidenceIds,
    notes: entry.notes,
    provenance: entry.provenance,
    supersededById: entry.supersededById,
    agentLabel: entry.agentLabel,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function safeFloorplanMeasurement(entry: Doc<"floorplanMeasurements">) {
  return {
    measurementId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    evidenceId: entry.evidenceId,
    subjectType: entry.subjectType,
    subjectKey: entry.subjectKey,
    subjectLabel: entry.subjectLabel,
    measurementType: entry.measurementType,
    kind: entry.kind,
    status: entry.status,
    valueIn: entry.valueIn,
    minIn: entry.minIn,
    maxIn: entry.maxIn,
    unit: entry.unit,
    value: entry.value,
    minValue: entry.minValue,
    maxValue: entry.maxValue,
    displayValue: entry.displayValue,
    confidence: entry.confidence,
    areaRole: entry.areaRole,
    constraintStrength: entry.constraintStrength,
    provenance: entry.provenance,
    sourceObservationIds: entry.sourceObservationIds,
    derivedFromMeasurementIds: entry.derivedFromMeasurementIds,
    supersededById: entry.supersededById,
    agentLabel: entry.agentLabel,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function safeFloorplanCalculation(entry: Doc<"floorplanCalculationRecords">) {
  return {
    calculationId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    solveRunId: entry.solveRunId,
    status: entry.status,
    calculationKind: entry.calculationKind,
    formulaName: entry.formulaName,
    label: entry.label,
    subjectKey: entry.subjectKey,
    subjectLabel: entry.subjectLabel,
    outputMeasurementType: entry.outputMeasurementType,
    unit: entry.unit,
    value: entry.value,
    displayValue: entry.displayValue,
    confidence: entry.confidence,
    inputMeasurementIds: entry.inputMeasurementIds,
    outputMeasurementId: entry.outputMeasurementId,
    diagnostics: entry.diagnostics,
    agentLabel: entry.agentLabel,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function floorplanMeasurementForSolver(entry: Doc<"floorplanMeasurements">) {
  return {
    id: String(entry._id),
    subjectType: entry.subjectType,
    subjectKey: entry.subjectKey,
    subjectLabel: entry.subjectLabel,
    measurementType: entry.measurementType,
    kind: entry.kind,
    status: entry.status,
    valueIn: entry.valueIn,
    minIn: entry.minIn,
    maxIn: entry.maxIn,
    unit: entry.unit,
    value: entry.value,
    minValue: entry.minValue,
    maxValue: entry.maxValue,
    displayValue: entry.displayValue,
    confidence: floorplanConfidenceFromEstimate(entry.confidence),
    areaRole: entry.areaRole,
    constraintStrength: entry.constraintStrength,
    provenance: entry.provenance.map((source, index) => ({
      id: `${entry._id}-prov-${index}`,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePhotoId: source.sourcePhotoId
        ? String(source.sourcePhotoId)
        : undefined,
      sourceLabel: source.sourceLabel,
      imageNumber: source.imageNumber,
      imageRegion: source.imageRegion,
      notes: source.notes,
      recordedByLabel: source.recordedByLabel,
    })),
    derivedFromMeasurementIds: entry.derivedFromMeasurementIds?.map(String),
  };
}

function floorplanObservationForSolver(
  entry: Doc<"floorplanObservations">,
): FloorplanObservation {
  return {
    id: String(entry._id),
    observationType: entry.observationType,
    status: entry.status,
    title: entry.title,
    subjectKey: entry.subjectKey,
    subjectLabel: entry.subjectLabel,
    subjectKind: entry.subjectKind,
    rawText: entry.rawText,
    normalized: entry.normalized,
    confidence: floorplanConfidenceFromEstimate(entry.confidence),
    sourcePhotoId: entry.sourcePhotoId
      ? String(entry.sourcePhotoId)
      : undefined,
    sourceLabel: entry.sourceLabel ?? "Floorplan evidence",
    imageNumber: entry.imageNumber,
    imageRegion: entry.sourceRegion,
    relatedMeasurementIds: entry.relatedMeasurementIds?.map(String),
    relatedObservationIds: entry.relatedObservationIds?.map(String),
    supersededById: entry.supersededById
      ? String(entry.supersededById)
      : undefined,
    notes: undefined,
    provenance: entry.provenance.map((source, index) => ({
      id: `${entry._id}-prov-${index}`,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePhotoId: source.sourcePhotoId
        ? String(source.sourcePhotoId)
        : undefined,
      sourceLabel: source.sourceLabel,
      imageNumber: source.imageNumber,
      imageRegion: source.imageRegion,
      notes: source.notes,
      recordedByLabel: source.recordedByLabel,
    })),
  };
}

function floorplanRelationshipForSolver(
  entry: Doc<"floorplanRelationships">,
): FloorplanRelationship {
  return {
    id: String(entry._id),
    relationshipType: entry.relationshipType,
    status: entry.status,
    fromSubjectKey: entry.fromSubjectKey,
    fromSubjectLabel: entry.fromSubjectLabel,
    toSubjectKey: entry.toSubjectKey,
    toSubjectLabel: entry.toSubjectLabel,
    confidence: floorplanConfidenceFromEstimate(entry.confidence),
    sourceObservationIds: entry.sourceObservationIds?.map(String),
    sourceMeasurementIds: entry.sourceMeasurementIds?.map(String),
    evidenceIds: entry.evidenceIds?.map(String),
    supersededById: entry.supersededById
      ? String(entry.supersededById)
      : undefined,
    notes: entry.notes,
    provenance: entry.provenance.map((source, index) => ({
      id: `${entry._id}-prov-${index}`,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePhotoId: source.sourcePhotoId
        ? String(source.sourcePhotoId)
        : undefined,
      sourceLabel: source.sourceLabel,
      imageNumber: source.imageNumber,
      imageRegion: source.imageRegion,
      notes: source.notes,
      recordedByLabel: source.recordedByLabel,
    })),
  };
}

function evidenceGraphDiagnostics(
  observations: Doc<"floorplanObservations">[],
  relationships: Doc<"floorplanRelationships">[],
) {
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  if (!observations.length) {
    diagnostics.push({
      id: "no-observations",
      severity: "warning",
      title: "No extracted observations yet",
      detail:
        "The solver needs AI/user observations before it can honestly generate CAD-like geometry.",
    });
  }
  const relationshipSubjectKeys = new Set(
    relationships.flatMap((relationship) => [
      relationship.fromSubjectKey,
      relationship.toSubjectKey,
    ]),
  );
  const floating = observations.filter(
    (observation) =>
      observation.subjectKey &&
      [
        "opening",
        "door",
        "doorway",
        "doorlessPassage",
        "window",
        "fixture",
      ].includes(observation.observationType) &&
      !relationshipSubjectKeys.has(observation.subjectKey),
  );
  if (floating.length) {
    diagnostics.push({
      id: "floating-openings-fixtures",
      severity: "warning",
      title: "Some openings or fixtures are not attached",
      detail: `${floating
        .slice(0, 5)
        .map((observation) => observation.title)
        .join(
          ", ",
        )} need openingIn/connectedTo/partOf relationships before draft generation.`,
    });
  }
  const conflicts = relationships.filter(
    (relationship) => relationship.relationshipType === "conflictsWith",
  );
  if (conflicts.length) {
    diagnostics.push({
      id: "active-relationship-conflicts",
      severity: "conflict",
      title: "Conflict relationships are active",
      detail:
        "Resolve or supersede conflicts before generating a final non-overlapping layout.",
    });
  }
  return diagnostics;
}

function safeFloorplanSolveRun(entry: Doc<"floorplanSolveRuns">) {
  return {
    solveRunId: entry._id,
    planId: entry.planId,
    moveId: entry.moveId,
    status: entry.status,
    solverVersion: entry.solverVersion,
    diagnostics: entry.diagnostics,
    geometry: entry.geometry,
    proposedOps: entry.proposedOps,
    sourceMeasurementIds: entry.sourceMeasurementIds,
    sourceObservationIds: entry.sourceObservationIds,
    sourceRelationshipIds: entry.sourceRelationshipIds,
    agentLabel: entry.agentLabel,
    createdAt: entry.createdAt,
  };
}

function displayMeasurementValue(
  valueIn: unknown,
  minIn: unknown,
  maxIn: unknown,
) {
  const value = optionalNumber(valueIn);
  if (value !== undefined) return `${value} in`;
  const min = optionalNumber(minIn);
  const max = optionalNumber(maxIn);
  if (min !== undefined && max !== undefined) return `${min}-${max} in`;
  return "unmeasured";
}

function requiredIngestionQueueStatus(value: unknown): IngestionQueueStatus {
  if (
    typeof value === "string" &&
    restIngestionQueueStatuses.includes(
      value as (typeof restIngestionQueueStatuses)[number],
    )
  ) {
    return value as IngestionQueueStatus;
  }
  throw invalidField(
    "status",
    "Unsupported ingestion queue status.",
    restIngestionQueueStatuses,
  );
}

function optionalIngestionScopeHint(
  value: unknown,
): IngestionScopeHint | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value === "string" &&
    allIngestionScopeHints.includes(
      value as (typeof allIngestionScopeHints)[number],
    )
  ) {
    return value as IngestionScopeHint;
  }
  throw invalidField(
    "scopeHint",
    "Unsupported ingestion queue scope hint.",
    allIngestionScopeHints,
  );
}

function optionalIngestionQueueIntent(
  value: unknown,
): IngestionQueueIntent | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value === "string" &&
    ingestionQueueIntents.includes(
      value as (typeof ingestionQueueIntents)[number],
    )
  ) {
    return value as IngestionQueueIntent;
  }
  throw invalidField(
    "intent",
    "Unsupported ingestion queue intent.",
    ingestionQueueIntents,
  );
}

function parseIngestionMediaPhotoIds(value: unknown): Id<"itemPhotos">[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidField("mediaPhotoIds", "Expected an array of photo IDs.");
  }
  return value.map((entry, index) => {
    const photoId = optionalString(entry);
    if (!photoId) {
      throw invalidField(
        `mediaPhotoIds.${index}`,
        "Photo IDs must be strings.",
      );
    }
    return photoId as Id<"itemPhotos">;
  });
}

async function validateApiIngestionMediaIds(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  mediaPhotoIds: Id<"itemPhotos">[],
) {
  for (const photoId of mediaPhotoIds) {
    const photo = await ctx.db.get(photoId);
    if (
      !photo ||
      photo.householdId !== householdId ||
      photo.moveId !== moveId ||
      photo.archivedAt
    ) {
      throw invalidField(
        "mediaPhotoIds",
        "Attached media does not belong to this move.",
      );
    }
  }
}

async function requireApiPlanForMove(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  planId: Id<"floorPlans">,
) {
  const plan = await ctx.db.get(planId);
  if (
    !plan ||
    plan.householdId !== auth.householdId ||
    plan.moveId !== moveId ||
    plan.archivedAt
  ) {
    throw invalidField("targetPlanId", "Target floor plan was not found.");
  }
  return plan;
}

function filterIngestionClaimCandidates(
  entries: Doc<"ingestionQueueEntries">[],
  filters: {
    householdId: Id<"households">;
    scopeHint?: IngestionScopeHint;
    targetPlanId?: Id<"floorPlans">;
  },
) {
  return entries.filter((entry) => {
    if (entry.householdId !== filters.householdId) return false;
    if (!ingestionScopeHintMatches(entry.scopeHint, filters.scopeHint))
      return false;
    if (filters.targetPlanId && entry.targetPlanId !== filters.targetPlanId) {
      return false;
    }
    return true;
  });
}

function optionalBooleanQuery(value: string | undefined) {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw invalidField("query", "Boolean query filters must be true or false.");
}

async function resolveApiIngestionTarget(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  input: {
    targetBoxId?: Id<"boxes">;
    targetItemId?: Id<"items">;
    targetBoxCode?: string | undefined;
    targetLabel?: string | undefined;
  },
) {
  const cleanTargetLabel = normalizeOptionalText(input.targetLabel);
  const cleanTargetBoxCode =
    input.targetBoxCode !== undefined
      ? normalizeBoxCode(input.targetBoxCode) || undefined
      : undefined;

  let targetBox: Doc<"boxes"> | null = null;
  if (input.targetBoxId) {
    targetBox = await ctx.db.get(input.targetBoxId);
    if (
      !targetBox ||
      targetBox.householdId !== auth.householdId ||
      targetBox.moveId !== moveId ||
      targetBox.archivedAt
    ) {
      throw invalidField("targetBoxId", "Target box was not found.");
    }
  } else if (cleanTargetBoxCode) {
    targetBox = await ctx.db
      .query("boxes")
      .withIndex("by_move_code", (q) =>
        q.eq("moveId", moveId).eq("code", cleanTargetBoxCode),
      )
      .unique();
    if (!targetBox || targetBox.householdId !== auth.householdId) {
      throw invalidField("targetBoxCode", "Target box code was not found.");
    }
  }

  let targetItem: Doc<"items"> | null = null;
  if (input.targetItemId) {
    targetItem = await ctx.db.get(input.targetItemId);
    if (
      !targetItem ||
      targetItem.householdId !== auth.householdId ||
      targetItem.moveId !== moveId ||
      targetItem.deletedAt
    ) {
      throw invalidField("targetItemId", "Target item was not found.");
    }
  }

  if (targetBox && targetItem) {
    throw invalidField(
      "target",
      "Choose either a target box or a target item for this queue entry.",
    );
  }

  return {
    targetBoxId: targetBox?._id,
    targetItemId: targetItem?._id,
    targetBoxCode: targetBox?.code ?? cleanTargetBoxCode,
    targetLabel:
      cleanTargetLabel ??
      targetBox?.label ??
      targetBox?.code ??
      targetItem?.name,
  };
}

async function requireApiIngestionEntry(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  entryId: Id<"ingestionQueueEntries">,
) {
  const entry = await ctx.db.get(entryId);
  if (!entry || entry.householdId !== householdId || entry.moveId !== moveId) {
    throw new RestApiError({
      status: 404,
      code: "not_found",
      message: "Ingestion queue entry not found.",
    });
  }
  return entry;
}

function assertIngestionTransition(
  entry: Doc<"ingestionQueueEntries">,
  to: IngestionQueueStatus,
  now: number,
) {
  const from = effectiveIngestionStatus(entry, now);
  if (!canTransitionIngestionStatus(from, to)) {
    throw invalidField(
      "status",
      `Cannot move a ${from} queue entry to ${to}.`,
      restIngestionQueueStatuses,
    );
  }
}

async function mediaForIngestionEntry(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  entry: Doc<"ingestionQueueEntries">,
) {
  const media = await Promise.all(
    entry.mediaPhotoIds.map((id) => ctx.db.get(id)),
  );
  return media.filter(
    (photo): photo is Doc<"itemPhotos"> =>
      photo !== null &&
      photo.householdId === householdId &&
      photo.moveId === moveId &&
      !photo.archivedAt,
  );
}

function ingestionMediaKind(photo: Doc<"itemPhotos">) {
  return photo.mediaKind ?? mediaKindForMimeType(photo.mimeType) ?? "image";
}

function ingestionMediaSummary(media: Doc<"itemPhotos">[]) {
  const kinds = media.map(ingestionMediaKind);
  return {
    count: media.length,
    imageCount: kinds.filter((kind) => kind === "image").length,
    audioCount: kinds.filter((kind) => kind === "audio").length,
    videoCount: kinds.filter((kind) => kind === "video").length,
    hasImage: kinds.includes("image"),
    hasAudio: kinds.includes("audio"),
    hasVideo: kinds.includes("video"),
  };
}

function safeIngestionMedia(photo: Doc<"itemPhotos">) {
  return {
    ...safePhoto(photo),
    mediaKind: ingestionMediaKind(photo),
    evidenceUrlPath: `/api/v1/moves/${photo.moveId}/ingestion-queue/{entryId}/evidence/${photo._id}/url`,
  };
}

function safeIngestionQueueEntry(
  entry: Doc<"ingestionQueueEntries">,
  {
    now,
    media,
    mediaSummary,
  }: {
    now: number;
    media?: Doc<"itemPhotos">[];
    mediaSummary?: ReturnType<typeof ingestionMediaSummary>;
  },
) {
  return {
    entryId: entry._id,
    moveId: entry.moveId,
    status: effectiveIngestionStatus(entry, now),
    storedStatus: entry.status,
    instructions: entry.instructions,
    roomHint: entry.roomHint,
    dispositionHint: entry.dispositionHint,
    scopeHint: entry.scopeHint,
    intent: entry.intent,
    targetBoxId: entry.targetBoxId,
    targetItemId: entry.targetItemId,
    targetBoxCode: entry.targetBoxCode,
    targetLabel: entry.targetLabel,
    targetPlanId: entry.targetPlanId,
    mediaPhotoIds: entry.mediaPhotoIds,
    mediaSummary: mediaSummary ?? ingestionMediaSummary(media ?? []),
    media: media?.map((photo) => ({
      ...safeIngestionMedia(photo),
      evidenceUrlPath: `/api/v1/moves/${entry.moveId}/ingestion-queue/${entry._id}/evidence/${photo._id}/url`,
    })),
    sortOrder: entry.sortOrder,
    claimedByAgentLabel: entry.claimedByAgentLabel,
    claimedAt: entry.claimedAt,
    claimExpiresAt: entry.claimExpiresAt,
    agentSummary: entry.agentSummary,
    agentQuestion: entry.agentQuestion,
    resultItemIds: entry.resultItemIds,
    resultSuggestionIds: entry.resultSuggestionIds,
    resultRefs: entry.resultRefs,
    processedAt: entry.processedAt,
    resolvedAt: entry.resolvedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function parseOptionalItemIds(value: unknown) {
  if (value === undefined) return [] as Id<"items">[];
  if (!Array.isArray(value)) {
    throw invalidField("resultItemIds", "Expected an array of IDs.");
  }
  return value.map((id) => {
    if (typeof id !== "string" || !id) {
      throw invalidField("resultItemIds", "IDs must be non-empty strings.");
    }
    return id as Id<"items">;
  });
}

function parseIngestionResultRefs(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField("resultRefs", "Expected an array of result references.");
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    const type = normalizeOptionalText(asString(input.type));
    const id = normalizeOptionalText(asString(input.id));
    if (!type || !id) {
      throw invalidField(
        `resultRefs.${index}`,
        "Each result reference needs type and id.",
      );
    }
    const label = normalizeOptionalText(asString(input.label));
    return {
      type,
      id,
      ...(label ? { label } : {}),
    };
  });
}

function parseIngestionProposedItems(
  value: unknown,
  entry: Doc<"ingestionQueueEntries">,
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField("proposedItems", "Expected an array of proposed items.");
  }
  if (value.length > 100) {
    throw invalidField("proposedItems", "Proposed items are limited to 100.");
  }
  return value.map((rawEntry, index) => {
    const input = bodyObject(rawEntry);
    const draft = parseApiAiTextItemDraft(input, `proposedItems.${index}`);
    if (!draft) {
      throw invalidField(`proposedItems.${index}`, "Expected a proposed item.");
    }
    if (input.attachMediaPhotoIds !== undefined) {
      draft.attachMediaPhotoIds = parseIngestionAttachedMediaIds(
        input.attachMediaPhotoIds,
        entry,
        `proposedItems.${index}.attachMediaPhotoIds`,
      );
    }
    return draft;
  });
}

function parseIngestionCommittedItems(
  value: unknown,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField(
      "committedItems",
      "Expected an array of committed items.",
    );
  }
  if (value.length > 100) {
    throw invalidField("committedItems", "Committed items are limited to 100.");
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    if (!Object.keys(input).length) {
      throw invalidField(
        `committedItems.${index}`,
        "Expected a committed item.",
      );
    }
    return input;
  });
}

function parseIngestionCommittedBoxes(
  value: unknown,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField(
      "committedBoxes",
      "Expected an array of committed boxes.",
    );
  }
  if (value.length > 100) {
    throw invalidField("committedBoxes", "Committed boxes are limited to 100.");
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    if (!Object.keys(input).length) {
      throw invalidField(
        `committedBoxes.${index}`,
        "Expected a committed box.",
      );
    }
    return input;
  });
}

function parseIngestionBoxAssignments(
  value: unknown,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField(
      "boxAssignments",
      "Expected an array of box assignments.",
    );
  }
  if (value.length > 100) {
    throw invalidField("boxAssignments", "Box assignments are limited to 100.");
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    if (!Object.keys(input).length) {
      throw invalidField(
        `boxAssignments.${index}`,
        "Expected a box assignment.",
      );
    }
    return input;
  });
}

function parseIngestionLoadAssignments(
  value: unknown,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField(
      "loadAssignments",
      "Expected an array of load assignments.",
    );
  }
  if (value.length > 100) {
    throw invalidField(
      "loadAssignments",
      "Load assignments are limited to 100.",
    );
  }
  return value.map((entry, index) => {
    const input = bodyObject(entry);
    if (!Object.keys(input).length) {
      throw invalidField(
        `loadAssignments.${index}`,
        "Expected a load assignment.",
      );
    }
    return input;
  });
}

function parseIngestionAttachedMediaIds(
  value: unknown,
  entry: Doc<"ingestionQueueEntries">,
  path: string,
): Id<"itemPhotos">[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw invalidField(path, "Expected an array of queue media photo IDs.");
  }
  const allowed = new Set(entry.mediaPhotoIds.map(String));
  return value.map((id, index) => {
    const photoId = optionalString(id);
    if (!photoId) {
      throw invalidField(
        `${path}.${index}`,
        "Photo IDs must be non-empty strings.",
      );
    }
    if (!allowed.has(photoId)) {
      throw invalidField(
        `${path}.${index}`,
        "Committed item media attachments must reference media on this queue entry.",
      );
    }
    return photoId as Id<"itemPhotos">;
  });
}

function committedItemInputWithoutQueueFields(input: Record<string, unknown>) {
  const itemInput = { ...input };
  delete itemInput.attachMediaPhotoIds;
  delete itemInput.appendNote;
  delete itemInput.appendNoteLabel;
  delete itemInput.researchSourceMode;
  return itemInput;
}

function committedItemAppendNoteBody(input: Record<string, unknown>) {
  if (input.appendNote === undefined) return undefined;
  return {
    note: input.appendNote,
    label: input.appendNoteLabel,
    agentLabel: input.agentLabel,
  };
}

function itemResearchSourceModeForPatch(
  input: Record<string, unknown>,
  fieldPath: string,
) {
  const mode = input.researchSourceMode;
  if (mode === undefined || mode === null || mode === "" || mode === "append") {
    return "append";
  }
  if (mode === "replace") {
    return "replace";
  }
  throw invalidField(
    fieldPath,
    "researchSourceMode must be append or replace.",
  );
}

function mergeItemPatchResearchSources(
  rawInput: Record<string, unknown>,
  item: Doc<"items">,
  patch: Partial<Doc<"items">>,
  fieldPath: string,
) {
  if (rawInput.researchSources === undefined) return;
  if (itemResearchSourceModeForPatch(rawInput, fieldPath) === "replace") return;
  patch.researchSources = mergeRestItemResearchSources(
    item.researchSources,
    parseItemResearchSources(rawInput.researchSources) ?? [],
  ) as NonNullable<Doc<"items">["researchSources"]>;
}

async function commitIngestionItems(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    entry,
    committedItems,
    now,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    entry: Doc<"ingestionQueueEntries">;
    committedItems: Record<string, unknown>[];
    now: number;
  },
) {
  const itemIds: Id<"items">[] = [];
  const results: Record<string, unknown>[] = [];

  for (const [index, rawInput] of committedItems.entries()) {
    const attachMediaPhotoIds = parseIngestionAttachedMediaIds(
      rawInput.attachMediaPhotoIds,
      entry,
      `committedItems.${index}.attachMediaPhotoIds`,
    );
    const input = committedItemInputWithoutQueueFields(rawInput);
    const externalKey = externalItemKeyFromInput(input);
    const explicitItemId = optionalString(input.itemId) as
      | Id<"items">
      | undefined;
    const externalMatch =
      !explicitItemId && externalKey
        ? await findApiItemByExternalKey(
            ctx,
            auth.householdId,
            moveId,
            externalKey,
          )
        : null;
    const matchedItemId = explicitItemId ?? externalMatch?._id;

    let itemId: Id<"items">;
    let action: "create" | "update";
    let changedKeys: string[] = [];
    let appendedNoteLength: number | undefined;
    const appendNoteBody = committedItemAppendNoteBody(rawInput);

    if (matchedItemId) {
      const item = await requireApiItem(
        ctx,
        auth.householdId,
        moveId,
        matchedItemId,
      );
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
          item._id,
        );
      }
      const patch = itemPatch(input, auth, item);
      mergeItemPatchResearchSources(
        rawInput,
        item,
        patch,
        `committedItems.${index}.researchSourceMode`,
      );
      await applyItemSpaceRefs(ctx, auth.householdId, moveId, input, patch);
      await ctx.db.patch(item._id, patch);
      itemId = item._id;
      action = "update";
      changedKeys = Object.keys(patch);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_ingestion_committed_updated",
        "items",
        itemId,
        { entryId: entry._id, rowIndex: index, changedKeys },
      );
    } else {
      const name = normalizeItemName(String(input.name ?? ""));
      if (!name) {
        throw invalidField(
          `committedItems.${index}.name`,
          "name is required when creating a committed item.",
        );
      }
      await assertExternalItemKeyAvailable(
        ctx,
        auth.householdId,
        moveId,
        input,
      );
      const created = await createApiItem(ctx, auth, moveId, input);
      itemId = created.itemId;
      action = "create";
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_ingestion_committed_created",
        "items",
        itemId,
        { entryId: entry._id, rowIndex: index, name: created.name },
      );
    }

    await attachIngestionMediaToItem(ctx, {
      auth,
      moveId,
      entry,
      itemId,
      photoIds: attachMediaPhotoIds,
      now,
    });
    if (appendNoteBody) {
      const item = await requireApiItem(ctx, auth.householdId, moveId, itemId);
      const { patch, noteLength } = restPrivateItemNoteAppendPatch({
        body: appendNoteBody,
        auth,
        item,
        now,
      });
      await ctx.db.patch(itemId, patch);
      appendedNoteLength = noteLength;
      changedKeys = Array.from(new Set([...changedKeys, "privateNotes"]));
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_ingestion_note_appended",
        "items",
        itemId,
        { entryId: entry._id, rowIndex: index, noteLength },
      );
    }
    pushUniqueId(itemIds, itemId);
    results.push({
      index,
      ok: true,
      action,
      itemId,
      matchedBy: externalMatch
        ? "externalKey"
        : explicitItemId
          ? "itemId"
          : undefined,
      attachedMediaPhotoIds: attachMediaPhotoIds,
      appendedNote: appendedNoteLength !== undefined,
      appendedNoteLength,
      changedKeys,
    });
  }

  return { itemIds, results };
}

async function commitIngestionBoxes(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    committedBoxes,
    now,
    entryId,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    committedBoxes: Record<string, unknown>[];
    now: number;
    entryId: Id<"ingestionQueueEntries">;
  },
) {
  const boxIds: Id<"boxes">[] = [];
  const results: Record<string, unknown>[] = [];

  for (const [index, input] of committedBoxes.entries()) {
    const fields = restBoxCreateFields({
      auth,
      moveId,
      body: input,
      now,
    }) as Omit<Doc<"boxes">, "_id" | "_creationTime">;
    Object.assign(
      fields,
      await boxDestinationRefsFromInput(ctx, auth.householdId, moveId, input),
    );
    const boxId = await ctx.db.insert("boxes", fields);
    pushUniqueId(boxIds, boxId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "box.api_ingestion_committed_created",
      "boxes",
      boxId,
      { entryId, rowIndex: index, code: fields.code },
    );
    results.push({
      index,
      ok: true,
      action: "create",
      boxId,
      boxCode: fields.code,
    });
  }

  return { boxIds, results };
}

async function commitIngestionBoxAssignments(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    boxAssignments,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    boxAssignments: Record<string, unknown>[];
  },
) {
  const assignmentIds: Id<"boxItems">[] = [];
  const results: Record<string, unknown>[] = [];

  for (const [index, input] of boxAssignments.entries()) {
    const box = await resolveApiBoxRef(ctx, auth.householdId, moveId, input);
    const item = await resolveApiItemRef(ctx, auth.householdId, moveId, input);
    const result = await upsertApiBoxItemAssignment(ctx, {
      auth,
      moveId,
      box,
      item,
      quantity: positiveNumber(input.quantity) ?? 1,
      notes: normalizeOptionalText(asString(input.notes)),
      dryRun: false,
      route: "ingestion_queue",
    });
    if (result.assignmentId) {
      pushUniqueId(assignmentIds, result.assignmentId);
    }
    results.push({ index, ok: true, ...result });
  }

  return { assignmentIds, results };
}

async function commitIngestionLoadAssignments(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    loadAssignments,
    entryId,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    loadAssignments: Record<string, unknown>[];
    entryId: Id<"ingestionQueueEntries">;
  },
) {
  const boxIds: Id<"boxes">[] = [];
  const itemIds: Id<"items">[] = [];
  const results: Record<string, unknown>[] = [];

  for (const [index, input] of loadAssignments.entries()) {
    const hasBoxRef = Boolean(
      optionalString(input.boxId) || optionalString(input.boxCode),
    );
    const hasItemRef = Boolean(
      optionalString(input.itemId) || externalItemKeyFromInput(input),
    );
    const assignedResourceId = optionalString(input.assignedResourceId);
    const assignedZoneId = optionalString(input.assignedZoneId);
    const overrideReason = normalizeOptionalText(
      asString(input.overrideReason),
    );
    if ((hasBoxRef ? 1 : 0) + (hasItemRef ? 1 : 0) !== 1) {
      throw invalidField(
        `loadAssignments.${index}`,
        "Exactly one box ref (boxId or boxCode) or item ref (itemId or externalSource/externalId) is required.",
      );
    }
    if (!assignedResourceId) {
      throw invalidField(
        `loadAssignments.${index}.assignedResourceId`,
        "assignedResourceId is required.",
      );
    }

    if (hasBoxRef) {
      const box = await resolveApiBoxRef(ctx, auth.householdId, moveId, input);
      if (box.assignmentLocked) {
        throw invalidField(
          `loadAssignments.${index}.boxId`,
          "Locked assignments must be changed manually.",
        );
      }
      const validation = await validateApiBoxAssignment(ctx, {
        householdId: auth.householdId,
        moveId,
        box,
        assignedResourceId,
        assignedZoneId,
        overrideReason,
      });
      const now = Date.now();
      await ctx.db.patch(box._id, {
        assignedResourceId: assignedResourceId as Id<"transportResources">,
        assignedZoneId: assignedZoneId as Id<"transportZones"> | undefined,
        assignmentOverrideReason: overrideReason,
        assignmentWarnings: validation.softWarnings,
        assignmentHardBlocks: validation.hardBlocks,
        assignmentValidatedAt: now,
        updatedAt: now,
      });
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "assignment.api_ingestion_load_applied",
        "boxes",
        box._id,
        {
          entryId,
          rowIndex: index,
          assignedResourceId,
          assignedZoneId,
          warningCount: validation.softWarnings.length,
        },
      );
      pushUniqueId(boxIds, box._id);
      results.push({
        index,
        ok: true,
        targetType: "box",
        boxId: box._id,
        boxCode: box.code,
        assignedResourceId,
        assignedZoneId: assignedZoneId || undefined,
        assignmentWarnings: validation.softWarnings,
        assignmentHardBlocks: validation.hardBlocks,
      });
      continue;
    }

    const item = await resolveApiItemRef(ctx, auth.householdId, moveId, input);
    if (item.assignmentLocked) {
      throw invalidField(
        `loadAssignments.${index}.itemId`,
        "Locked assignments must be changed manually.",
      );
    }
    const validation = await validateApiItemAssignment(ctx, {
      householdId: auth.householdId,
      moveId,
      item,
      assignedResourceId,
      assignedZoneId,
      overrideReason,
    });
    const now = Date.now();
    await ctx.db.patch(item._id, {
      assignedResourceId: assignedResourceId as Id<"transportResources">,
      assignedZoneId: assignedZoneId as Id<"transportZones"> | undefined,
      assignmentOverrideReason: overrideReason,
      assignmentWarnings: validation.softWarnings,
      assignmentHardBlocks: validation.hardBlocks,
      assignmentValidatedAt: now,
      updatedByUserId: auth.createdByUserId,
      updatedAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_ingestion_load_applied",
      "items",
      item._id,
      {
        entryId,
        rowIndex: index,
        assignedResourceId,
        assignedZoneId,
        warningCount: validation.softWarnings.length,
      },
    );
    pushUniqueId(itemIds, item._id);
    results.push({
      index,
      ok: true,
      targetType: "item",
      itemId: item._id,
      itemName: item.name,
      assignedResourceId,
      assignedZoneId: assignedZoneId || undefined,
      assignmentWarnings: validation.softWarnings,
      assignmentHardBlocks: validation.hardBlocks,
    });
  }

  return { boxIds, itemIds, results };
}

async function attachIngestionMediaToItem(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    entry,
    itemId,
    photoIds,
    now,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    entry: Doc<"ingestionQueueEntries">;
    itemId: Id<"items">;
    photoIds: Id<"itemPhotos">[];
    now: number;
  },
) {
  for (const photoId of photoIds) {
    const photo = await ctx.db.get(photoId);
    if (
      !photo ||
      photo.householdId !== auth.householdId ||
      photo.moveId !== moveId ||
      photo.archivedAt ||
      !entry.mediaPhotoIds.includes(photoId)
    ) {
      throw invalidField(
        "attachMediaPhotoIds",
        "Attached queue media does not belong to this queue entry.",
      );
    }
    await ctx.db.patch(photoId, {
      itemId,
      verificationStatus: "verified",
      reviewedByUserId: auth.createdByUserId,
      reviewedAt: now,
      updatedAt: now,
    });
  }
}

async function validateApiResultItems(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  itemIds: Id<"items">[],
) {
  for (const itemId of itemIds) {
    const item = await ctx.db.get(itemId);
    if (!item || item.householdId !== householdId || item.moveId !== moveId) {
      throw new RestApiError({
        status: 404,
        code: "not_found",
        message: "Result item not found.",
      });
    }
  }
}

async function createIngestionAiTextSuggestions(
  ctx: MutationCtx,
  {
    auth,
    moveId,
    entry,
    proposedItems,
    agentSummary,
    now,
    suggestionIds,
  }: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    entry: Doc<"ingestionQueueEntries">;
    proposedItems: RestAiTextItemDraft[];
    agentSummary?: string;
    now: number;
    suggestionIds: Id<"aiTextSuggestions">[];
  },
) {
  const sourceText = [
    entry.instructions,
    entry.roomHint ? `Room: ${entry.roomHint}` : undefined,
    entry.dispositionHint ? `Disposition: ${entry.dispositionHint}` : undefined,
    agentSummary,
  ]
    .filter(Boolean)
    .join("\n");
  await assertAiUsageAllowed(ctx, {
    householdId: auth.householdId,
    moveId,
    userId: auth.createdByUserId,
    inputSizeBytes: inputBytesFromText(sourceText || "ingestion queue result"),
    estimatedCents: 0,
  });
  const aiJobId = await ctx.db.insert("aiJobs", {
    householdId: auth.householdId,
    moveId,
    type: "inventoryExtraction",
    status: "succeeded",
    modality: "structured",
    provider: "external-agent",
    model: "ingestion-queue-api",
    inputRef: {
      source: "apiIngestionQueue",
      entryId: entry._id,
      mediaPhotoIds: entry.mediaPhotoIds,
    },
    inputSummary: sourceText.slice(0, 500),
    outputRef: {
      proposedItemCount: proposedItems.length,
    },
    outputSummary: `${proposedItems.length} ingestion queue item suggestions submitted.`,
    confidence: "medium",
    reviewStatus: "unreviewed",
    tokenUsage: {
      inputTokens: Math.max(32, Math.ceil((sourceText.length || 32) / 4)),
      outputTokens: proposedItems.length * 48,
      totalTokens:
        Math.max(32, Math.ceil((sourceText.length || 32) / 4)) +
        proposedItems.length * 48,
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

  for (const [index, draft] of proposedItems.entries()) {
    const suggestionId = await ctx.db.insert("aiTextSuggestions", {
      householdId: auth.householdId,
      moveId,
      aiJobId,
      type: "item",
      status: "pending",
      sourceText: sourceText || `Ingestion queue entry ${entry._id}`,
      sourceLine: draft.name,
      sourceIndex: index,
      confidence: draft.highValue ? "medium" : "low",
      reasoning:
        agentSummary ??
        "Submitted by an external agent from ingestion queue evidence.",
      itemDraft: normalizeApiAiTextItemDraft(draft),
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    suggestionIds.push(suggestionId);
  }

  return aiJobId;
}

function safePhoto(photo: Doc<"itemPhotos">) {
  const mediaKind = restPhotoMediaKind(photo);
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
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    mediaKind,
    media: safePhotoMedia(photo),
    source: photo.source,
    exifHandlingStatus: photo.exifHandlingStatus,
    originalMetadata: {
      source: photo.source,
      mediaKind,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      width: photo.width,
      height: photo.height,
      capturedAt: photo.capturedAt,
      exifHandlingStatus: photo.exifHandlingStatus,
      hasOriginalHash: Boolean(photo.originalHash),
      derivativeStatus: photo.derivativeStatus,
      derivativesUpdatedAt: photo.derivativesUpdatedAt,
    },
    derivativeStatus: photo.derivativeStatus,
    derivativeError: photo.derivativeError,
    derivativesUpdatedAt: photo.derivativesUpdatedAt,
    agentLabel: photo.agentLabel,
    aiConfidenceScore: photo.aiConfidenceScore,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}

function restPhotoMediaKind(photo: Doc<"itemPhotos">) {
  return photo.mediaKind ?? mediaKindForMimeType(photo.mimeType) ?? "image";
}

function safePhotoMedia(photo: Doc<"itemPhotos">) {
  const mediaKind = restPhotoMediaKind(photo);
  const displayUrlBasePath = `/api/v1/photos/${photo._id}/display-url?moveId=${photo.moveId}`;
  const canAttemptDisplay =
    mediaKind === "image" &&
    photo.visibilityScope !== "private" &&
    !["claimOnly", "sensitive", "hiddenFromGuests", "private"].includes(
      photo.privacyLevel,
    );
  const derivativeReady =
    canAttemptDisplay &&
    photo.derivativeStatus === "ready" &&
    canUsePhotoDerivativeForAi(photo);

  const displayStatus =
    mediaKind !== "image"
      ? "unsupported"
      : !canAttemptDisplay
        ? "restricted"
        : derivativeReady
          ? "ready"
          : photo.derivativeStatus === "failed"
            ? "failed"
            : "pending";

  const variants = restPhotoDerivativeVariants.map((variant) => {
    const selected =
      canAttemptDisplay && photo.derivativeStatus === "ready"
        ? selectDerivativeRef(photo.derivativeRefs, variant)
        : null;
    return {
      variant,
      status: selected
        ? ("ready" as const)
        : displayStatus === "failed"
          ? ("failed" as const)
          : displayStatus === "restricted"
            ? ("restricted" as const)
            : displayStatus === "unsupported"
              ? ("unsupported" as const)
              : ("pending" as const),
      url: null,
      displayUrlPath: selected
        ? `${displayUrlBasePath}&variant=${variant}`
        : undefined,
      servedVariant: selected?.variant,
    };
  });

  return {
    kind: mediaKind,
    display: {
      status: displayStatus,
      url: null,
      displayUrlPath: derivativeReady
        ? `${displayUrlBasePath}&variant=detail`
        : undefined,
      variants,
      note:
        displayStatus === "ready"
          ? "Use displayUrlPath to request a short-lived derivative URL."
          : displayStatus === "pending"
            ? "Image derivatives are not ready yet."
            : displayStatus === "failed"
              ? "Derivative generation failed; retry or inspect derivativeError."
              : displayStatus === "restricted"
                ? "This photo's privacy settings do not allow API derivative display."
                : "Display derivatives are available only for image evidence.",
    },
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
  comment: Doc<"shareLinkComments">,
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
    patch.documentationProfileTypes = Array.isArray(
      body.documentationProfileTypes,
    )
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
  const originRooms = (parseStringArray(body.originRooms) ?? []).map(
    (name, index) => ({
      kind: "originRoom",
      name,
      sortOrder: index,
    }),
  );
  const destinationRooms = (parseStringArray(body.destinationRooms) ?? []).map(
    (name, index) => ({
      kind: "destinationRoom",
      name,
      sortOrder: 1000 + index,
    }),
  );
  const inputs = [...originRooms, ...destinationRooms, ...explicitSpaces];
  if (inputs.length > 100) {
    throw new Error(
      "spaces plus origin/destination rooms are limited to 100 rows.",
    );
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
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "space.api_setup_created",
    "moveSpaces",
    spaceId,
    {
      name,
      kind,
    },
  );
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
    throw new Error(
      "transportResources[].name is required unless presetKey is provided.",
    );
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
      throw new Error(
        "transportResources[].type is required unless presetKey is provided.",
      );
    }
    resourceId = await ctx.db.insert("transportResources", {
      householdId: auth.householdId,
      moveId,
      type,
      name: resolvedName,
      description:
        normalizeOptionalText(asString(input.description)) ??
        preset?.description,
      capacity: parseCapacity(input.capacity) ?? preset?.capacity ?? {},
      capacityReviewStatus:
        parseCapacityReviewStatus(input.capacityReviewStatus) ?? "unreviewed",
      capacityNotes: normalizeOptionalText(asString(input.capacityNotes)),
      rules: normalizeRuleList(
        parseStringArray(input.rules) ?? preset?.rules ?? [],
      ),
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
      await upsertApiTransportZoneForSetup(
        ctx,
        auth,
        moveId,
        resourceId,
        zone,
        zoneIndex,
      ),
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
    preferredTags: normalizeRuleList(
      parseStringArray(input.preferredTags) ?? [],
    ),
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
  moveId: Id<"moves">,
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
      description:
        normalizeOptionalText(asString(body.description)) ?? preset.description,
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
        }),
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
      { presetKey, type: preset.type, zoneCount: zoneIds.length },
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
      201,
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
    { type, name },
  );
  return restOk(
    {
      data: {
        resource: resource ? safeTransportResource(resource) : { resourceId },
      },
    },
    201,
  );
}

async function createApiTransportZone(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>,
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
    preferredTags: normalizeRuleList(
      parseStringArray(body.preferredTags) ?? [],
    ),
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
    }),
  );
  const activeContents = contents.filter(
    (entry): entry is { item: Doc<"items">; membership: Doc<"boxItems"> } =>
      Boolean(entry),
  );
  const contentEstimates = activeContents.map(({ item, membership }) =>
    estimateItem({ ...item, quantity: membership.quantity }),
  );
  const contentsWeight = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.weight),
  );
  const contentsVolume = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.volume),
  );

  return {
    estimatedWeightLb:
      box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt ?? contentsVolume,
    dimensionsIn: box.dimensionsIn,
    itemCount: activeContents.reduce(
      (sum, entry) => sum + entry.membership.quantity,
      0,
    ),
    hasFragile: activeContents.some((entry) => entry.item.fragility === "high"),
    hasHighValue: activeContents.some((entry) => entry.item.highValue),
    hasSensitive: activeContents.some((entry) =>
      entry.item.planningDefaultKeys.includes("sensitive"),
    ),
    hasPersonalTransport: activeContents.some(
      (entry) => entry.item.requiresPersonalTransport,
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
  },
) {
  const resource = await requireApiTransportResource(
    ctx,
    args.householdId,
    args.moveId,
    args.assignedResourceId,
  );
  const zone = args.assignedZoneId
    ? await requireApiTransportZone(
        ctx,
        args.householdId,
        args.moveId,
        args.assignedZoneId,
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

function loadableApiItemFor(item: Doc<"items">) {
  const estimate = estimateItem(item);
  return {
    estimatedWeightLb: estimate.weight?.value ?? 0,
    estimatedVolumeCuFt: estimate.volume?.value ?? 0,
    dimensionsIn: item.dimensionsIn,
    itemCount: item.quantity ?? 1,
    hasFragile: item.fragility === "high",
    hasHighValue: item.highValue,
    hasSensitive: item.planningDefaultKeys.includes("sensitive"),
    hasPersonalTransport: item.requiresPersonalTransport,
    hasHazardous: item.hazardousFlag,
  };
}

async function validateApiItemAssignment(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    item: Doc<"items">;
    assignedResourceId: string;
    assignedZoneId?: string;
    overrideReason?: string;
  },
) {
  const resource = await requireApiTransportResource(
    ctx,
    args.householdId,
    args.moveId,
    args.assignedResourceId,
  );
  const zone = args.assignedZoneId
    ? await requireApiTransportZone(
        ctx,
        args.householdId,
        args.moveId,
        args.assignedZoneId,
      )
    : null;
  if (zone && zone.resourceId !== resource._id) {
    throw new Error("Zone does not belong to the assigned resource.");
  }
  const validation = validateAssignment({
    box: loadableApiItemFor(args.item),
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
  body: Record<string, unknown>,
) {
  const now = Date.now();
  const name = normalizeItemName(String(body.name ?? ""));
  const externalKey = externalItemKeyFromInput(body);
  const spaceRefs = await itemSpaceRefsFromInput(
    ctx,
    auth.householdId,
    moveId,
    body,
  );
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
    ...spaceRefs,
    category: normalizeOptionalText(asString(body.category)),
    subcategory: normalizeOptionalText(asString(body.subcategory)),
    disposition:
      body.disposition !== undefined
        ? enumField("disposition", body.disposition, itemDispositions)
        : "undecided",
    status:
      body.status !== undefined
        ? enumField("status", body.status, itemStatuses)
        : "active",
    quantity: positiveNumber(body.quantity) ?? 1,
    condition:
      body.condition !== undefined
        ? enumField("condition", body.condition, itemConditions)
        : "unknown",
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
      parsePlanningConfidence(
        body.dimensionsConfidence,
        "dimensionsConfidence",
      ) ?? "none",
    weightConfidence:
      parsePlanningConfidence(body.weightConfidence, "weightConfidence") ??
      "none",
    volumeConfidence:
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ??
      "none",
    fragility:
      body.fragility !== undefined
        ? enumField("fragility", body.fragility, itemFragilities)
        : "low",
    stackable: body.stackable === undefined ? true : Boolean(body.stackable),
    hazardousFlag: Boolean(body.hazardousFlag),
    highValue: Boolean(body.highValue),
    requiresPersonalTransport: Boolean(body.requiresPersonalTransport),
    planningDefaultKeys:
      parsePlanningDefaultKeys(body.planningDefaultKeys) ?? [],
    needsReview: Boolean(body.needsReview),
    reviewFlags: normalizeRuleList(parseStringArray(body.reviewFlags) ?? []),
    privateNotes: normalizeOptionalText(asString(body.privateNotes)),
    aiSummary: normalizeOptionalText(asString(body.aiSummary)),
    aiTags: normalizeRuleList(parseStringArray(body.aiTags) ?? []),
    ...restAssignmentFields(body, now),
    ...itemResearchFieldsFromBody(body, auth, now),
    ...restAgentAttributionFields(body, auth, { defaultLabel: true }),
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
  plannedItem: Doc<"plannedItems">,
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
      .withIndex("by_planned_item", (q) =>
        q.eq("plannedItemId", plannedItem._id),
      )
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
  },
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
    resources.map((resource) => [resource._id, resource.name]),
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

  await auditApiWrite(
    ctx,
    args.auth,
    args.moveId,
    "export.api_completed",
    "exportJobs",
    exportJobId,
    {
      type: args.type,
      format: "csv",
      rowCount: Math.max(rows.length - 1, 0),
      documentationProfileId: profile?._id,
    },
  );

  return {
    exportJobId,
    filename,
    rowCount: Math.max(rows.length - 1, 0),
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  };
}

function apiExportVisibility(
  profile: Doc<"documentationProfiles"> | null,
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
  profile: Doc<"documentationProfiles">,
) {
  const filters = profile.filters;
  if (
    filters.dispositions?.length &&
    !filters.dispositions.includes(item.disposition)
  ) {
    return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (
    filters.planningDefaultKeys?.length &&
    !filters.planningDefaultKeys.some((key) =>
      item.planningDefaultKeys.includes(key),
    )
  ) {
    return false;
  }
  if (filters.room && item.room !== filters.room) {
    return false;
  }
  if (
    filters.destinationRoom &&
    item.destinationRoom !== filters.destinationRoom
  ) {
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
          assignedZone: box.assignedZoneId
            ? zoneNameById.get(box.assignedZoneId)
            : undefined,
        })),
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
          assignedZone: box.assignedZoneId
            ? zoneNameById.get(box.assignedZoneId)
            : undefined,
          itemCount: boxItems
            .filter((membership) => membership.boxId === box._id)
            .reduce((total, membership) => total + membership.quantity, 0),
          estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        })),
      );
  }
}

function movePatch(body: unknown): Partial<Doc<"moves">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
  if (input.title !== undefined) patch.title = String(input.title).trim();
  if (input.status !== undefined) patch.status = parseMoveStatus(input.status);
  if (input.origin !== undefined)
    patch.origin = normalizeOptionalText(asString(input.origin));
  if (input.destination !== undefined) {
    patch.destination = normalizeOptionalText(asString(input.destination));
  }
  if (input.dateStart !== undefined)
    patch.dateStart = normalizeOptionalText(asString(input.dateStart));
  if (input.dateEnd !== undefined)
    patch.dateEnd = normalizeOptionalText(asString(input.dateEnd));
  return patch;
}

function transportResourcePatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
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
  body: unknown,
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
    patch.preferredTags = normalizeRuleList(
      parseStringArray(input.preferredTags) ?? [],
    );
  }
  if (input.sortOrder !== undefined) {
    patch.sortOrder = normalizeSortOrder(optionalNumber(input.sortOrder));
  }
  return patch;
}

function movePersonPatch(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
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
    parsePlanningConfidence(
      input.confidence,
      "measurementProvenance.confidence",
    ) ?? fallbackConfidence;
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
      parsePlanningConfidence(
        body.dimensionsConfidence,
        "dimensionsConfidence",
      ) ?? "low";
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
      parsePlanningConfidence(body.volumeConfidence, "volumeConfidence") ??
      "low";
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
  if (input.room !== undefined)
    patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(
      asString(input.destinationRoom),
    );
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.disposition !== undefined) {
    patch.disposition = enumField(
      "disposition",
      input.disposition,
      itemDispositions,
    );
  }
  if (input.status !== undefined) {
    patch.status = enumField("status", input.status, itemStatuses);
  }
  if (input.quantity !== undefined)
    patch.quantity = positiveNumber(input.quantity) ?? 1;
  if (input.condition !== undefined) {
    patch.condition = enumField("condition", input.condition, itemConditions);
  }
  if (input.valueCents !== undefined)
    patch.valueCents = optionalNumber(input.valueCents);
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
      "dimensionsConfidence",
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
    patch.estimatedPackedVolumeCuFt = optionalNumber(
      input.estimatedPackedVolumeCuFt,
    );
  }
  if (input.weightConfidence !== undefined) {
    patch.weightConfidence =
      parsePlanningConfidence(input.weightConfidence, "weightConfidence") ??
      "none";
  }
  if (input.volumeConfidence !== undefined) {
    patch.volumeConfidence =
      parsePlanningConfidence(input.volumeConfidence, "volumeConfidence") ??
      "none";
  }
  if (input.fragility !== undefined) {
    patch.fragility = enumField("fragility", input.fragility, itemFragilities);
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
    patch.planningDefaultKeys =
      parsePlanningDefaultKeys(input.planningDefaultKeys) ?? [];
  }
  if (input.needsReview !== undefined)
    patch.needsReview = Boolean(input.needsReview);
  if (input.reviewFlags !== undefined) {
    patch.reviewFlags = normalizeRuleList(
      parseStringArray(input.reviewFlags) ?? [],
    );
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
  Object.assign(patch, restAssignmentFields(input, now));
  Object.assign(patch, itemResearchFieldsFromBody(input, auth, now));
  if (input.agentLabel !== undefined || input.aiConfidenceScore !== undefined) {
    Object.assign(patch, restAgentAttributionFields(input));
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

async function itemSpaceRefsFromInput(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  body: unknown,
) {
  const input = bodyObject(body);
  const refs: Partial<
    Pick<Doc<"items">, "currentSpaceId" | "destinationSpaceId">
  > = {};
  if (
    input.spaceId !== undefined ||
    input.currentSpaceId !== undefined ||
    input.spaceName !== undefined
  ) {
    const currentSpace = await resolveApiSpaceRef(
      ctx,
      householdId,
      moveId,
      {
        ...input,
        currentSpaceId: input.currentSpaceId ?? input.spaceId,
      },
      { idPath: "currentSpaceId", namePath: "spaceName" },
    );
    refs.currentSpaceId = currentSpace?._id;
  }
  if (
    input.destinationSpaceId !== undefined ||
    input.destinationSpaceName !== undefined
  ) {
    const destinationSpace = await resolveApiSpaceRef(
      ctx,
      householdId,
      moveId,
      input,
      { idPath: "destinationSpaceId", namePath: "destinationSpaceName" },
    );
    refs.destinationSpaceId = destinationSpace?._id;
  }
  return refs;
}

async function applyItemSpaceRefs(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  body: unknown,
  patch: Partial<Doc<"items">>,
) {
  Object.assign(
    patch,
    await itemSpaceRefsFromInput(ctx, householdId, moveId, body),
  );
}

function plannedItemPatch(
  body: unknown,
  userId: Id<"users">,
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
      "dimensionsConfidence",
    );
  }
  if (input.estimatedPriceCents !== undefined) {
    patch.estimatedPriceCents = optionalNumber(input.estimatedPriceCents);
  }
  if (input.url !== undefined) {
    patch.url = normalizeOptionalText(asString(input.url));
  }
  if (input.priority !== undefined) {
    patch.priority = normalizePlannedItemPriority(
      optionalNumber(input.priority),
    );
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
  value: unknown,
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
  return restBoxPatch(body) as Partial<Doc<"boxes">>;
}

async function photoAttachPatch(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    reviewedByUserId: Id<"users">;
    body: unknown;
  },
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
  } else if (
    input.externalSource !== undefined ||
    input.externalId !== undefined
  ) {
    const item = await resolveApiItemRef(
      ctx,
      args.householdId,
      args.moveId,
      input,
    );
    patch.itemId = item._id;
  }
  if (input.boxId !== undefined) {
    const boxId = optionalString(input.boxId) as Id<"boxes"> | undefined;
    if (boxId) {
      await requireApiBox(ctx, args.householdId, args.moveId, boxId);
    }
    patch.boxId = boxId;
  } else if (input.boxCode !== undefined) {
    const box = await resolveApiBoxRef(
      ctx,
      args.householdId,
      args.moveId,
      input,
    );
    patch.boxId = box._id;
  }
  if (input.spaceId !== undefined) {
    const spaceId = optionalString(input.spaceId) as
      | Id<"moveSpaces">
      | undefined;
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
  } else if (input.spaceName !== undefined) {
    const space = await resolveApiSpaceRef(
      ctx,
      args.householdId,
      args.moveId,
      input,
    );
    patch.spaceId = space?._id;
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
      input.documentationProfileTypes,
    );
  }
  if (input.caption !== undefined) {
    patch.caption = normalizeOptionalText(asString(input.caption));
  }
  if (input.photoType !== undefined) {
    patch.photoType = enumField("photoType", input.photoType, photoTypes);
  }
  if (input.privacyLevel !== undefined) {
    patch.privacyLevel = enumField(
      "privacyLevel",
      input.privacyLevel,
      photoPrivacyLevels,
    );
  }
  if (input.visibilityScope !== undefined) {
    patch.visibilityScope = enumField(
      "visibilityScope",
      input.visibilityScope,
      photoVisibilityScopes,
    );
  }
  if (input.source !== undefined) {
    const source = parsePhotoSource(input.source);
    if (!source) throw new Error("Unsupported source.");
    patch.source = source;
  }
  if (input.exifHandlingStatus !== undefined) {
    const exifHandlingStatus = parseExifHandlingStatus(
      input.exifHandlingStatus,
    );
    if (!exifHandlingStatus) throw new Error("Unsupported exifHandlingStatus.");
    patch.exifHandlingStatus = exifHandlingStatus;
  }
  if (input.confidence !== undefined) {
    const confidence = parseConfidence(input.confidence);
    if (!confidence) throw new Error("Unsupported confidence.");
    patch.confidence = confidence;
  }
  if (input.agentLabel !== undefined || input.aiConfidenceScore !== undefined) {
    Object.assign(patch, restAgentAttributionFields(input));
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeOptionalText(asString(input.notes));
  }
  if (input.verificationStatus !== undefined) {
    const verificationStatus = parsePhotoVerificationStatus(
      input.verificationStatus,
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
  metadata?: Record<string, unknown>,
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
  metadata?: Record<string, unknown>,
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
  metadata?: Record<string, unknown>,
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
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalPlanKind(value: unknown): "destination" | "origin" {
  if (value === undefined || value === "") {
    return "destination";
  }
  if (value === "destination" || value === "origin") {
    return value;
  }
  throw invalidField("kind", "Plan kind must be destination or origin.");
}

function positiveNumber(value: unknown) {
  const number = optionalNumber(value);
  return number && number > 0 ? number : undefined;
}

function normalizePlannedItemPriority(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(4, Math.max(1, Math.round(value)));
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
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

function querySearchTerm(query: Record<string, string>) {
  return optionalString(query.query) ?? optionalString(query.search);
}

function sectionOptionsFromQuery(
  query: Record<string, string>,
): ApiSectionOptions {
  const sections = optionalString(query.sections)
    ?.split(",")
    .map((section) => section.trim())
    .filter(Boolean);
  const requestedLimit = Number(optionalString(query.maxPerSection) ?? "");
  return {
    sections: sections?.length ? new Set(sections) : undefined,
    maxPerSection: Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), maxSectionLimit)
      : undefined,
  };
}

function sectionIncluded(options: ApiSectionOptions, section: ApiSectionName) {
  return !options.sections || options.sections.has(section);
}

function boundedSection<T>(
  rows: T[],
  section: ApiSectionName,
  options: ApiSectionOptions,
) {
  const defaultLimit = defaultSectionLimits[section] ?? defaultSectionLimit;
  const limit = options.maxPerSection ?? defaultLimit;
  return {
    rows: rows.slice(0, limit),
    meta: {
      total: rows.length,
      limit,
      returned: Math.min(rows.length, limit),
      truncated: rows.length > limit,
    },
  };
}

function addBoundedSection<T>(
  target: Record<string, unknown>,
  meta: Record<string, unknown>,
  options: ApiSectionOptions,
  section: ApiSectionName,
  rows: T[],
) {
  if (!sectionIncluded(options, section)) return;
  const bounded = boundedSection(rows, section, options);
  target[section] = bounded.rows;
  meta[section] = bounded.meta;
}

function matchesSearch(search: string | undefined, values: unknown[]) {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return values
    .filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number",
    )
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function requiredBodyString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidField("body", message);
  }
  return value.trim();
}

function requiredOps(value: unknown) {
  if (!Array.isArray(value)) {
    throw invalidField("ops", "ops must be an array.");
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
    "externalSource",
  );
  const externalId = normalizeExternalKeyPart(input.externalId, "externalId");
  if (!externalSource && !externalId) return null;
  if (!externalSource || !externalId) {
    throw new RestApiError({
      status: 400,
      code: "validation_error",
      message: "externalSource and externalId must be provided together.",
      fields: [
        {
          path: "externalSource",
          message: "externalSource is required when externalId is provided.",
        },
        {
          path: "externalId",
          message: "externalId is required when externalSource is provided.",
        },
      ],
    });
  }
  return { externalSource, externalId };
}

async function findApiItemByExternalKey(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  externalKey: { externalSource: string; externalId: string },
) {
  const item = await ctx.db
    .query("items")
    .withIndex("by_move_external_key", (q) =>
      q
        .eq("moveId", moveId)
        .eq("externalSource", externalKey.externalSource)
        .eq("externalId", externalKey.externalId),
    )
    .collect();
  return (
    item.find(
      (entry) => entry.householdId === householdId && !entry.deletedAt,
    ) ?? null
  );
}

async function assertExternalItemKeyAvailable(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  input: unknown,
  allowedItemId?: Id<"items">,
) {
  const externalKey = externalItemKeyFromInput(bodyObject(input));
  if (!externalKey) return;
  const existing = await findApiItemByExternalKey(
    ctx,
    householdId,
    moveId,
    externalKey,
  );
  if (existing && existing._id !== allowedItemId) {
    throw new RestApiError({
      status: 409,
      code: "external_key_conflict",
      message: "External source key already exists for this move.",
      fields: [
        {
          path: "externalId",
          message:
            "externalSource and externalId must be unique within a move.",
        },
      ],
    });
  }
}

function parseMoveStatus(value: unknown) {
  return includesLiteral(restMoveStatuses, value)
    ? (value as Doc<"moves">["status"])
    : undefined;
}

function parseMoveType(value: unknown) {
  return includesLiteral(moveTypes, value)
    ? (value as Doc<"moves">["type"])
    : undefined;
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

function parseItemResearchSources(
  value: unknown,
): NonNullable<Doc<"items">["researchSources"]> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, 25)
    .map((entry) => {
      const source = bodyObject(entry);
      return removeUndefined({
        title: normalizeOptionalText(asString(source.title)),
        url: normalizeOptionalText(asString(source.url)),
        summary: normalizeOptionalText(asString(source.summary)),
        status: parseItemResearchSourceStatus(source.status),
        checkedAt: optionalNumber(source.checkedAt),
      });
    })
    .filter((source) => Object.keys(source).length > 0);
}

function parseItemResearchSourceStatus(value: unknown) {
  return includesLiteral(restItemResearchSourceStatuses, value)
    ? (value as (typeof restItemResearchSourceStatuses)[number])
    : undefined;
}

function itemResearchFieldsFromBody(
  body: unknown,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  now: number,
): Partial<Doc<"items">> {
  const input = bodyObject(body);
  const touched =
    input.researchSummary !== undefined ||
    input.researchSources !== undefined ||
    input.researchNotes !== undefined ||
    input.researchConfidence !== undefined ||
    input.researchedAt !== undefined ||
    input.researchedByLabel !== undefined;

  if (!touched) return {};

  const patch: Partial<Doc<"items">> = {
    researchedAt: optionalNumber(input.researchedAt) ?? now,
    researchedByUserId: auth.createdByUserId,
    researchedByApiKeyId: auth.apiKeyId,
    researchedByLabel:
      normalizeOptionalText(asString(input.researchedByLabel)) ??
      `API key: ${auth.apiKeyName} (${auth.apiKeyTokenPreview})`,
  };

  if (input.researchSummary !== undefined) {
    patch.researchSummary = normalizeOptionalText(
      asString(input.researchSummary),
    );
  }
  if (input.researchSources !== undefined) {
    patch.researchSources =
      parseItemResearchSources(input.researchSources) ?? [];
  }
  if (input.researchNotes !== undefined) {
    patch.researchNotes = normalizeOptionalText(asString(input.researchNotes));
  }
  if (input.researchConfidence !== undefined) {
    patch.researchConfidence = parsePlanningConfidence(
      input.researchConfidence,
      "researchConfidence",
    );
  }

  return patch;
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
    patch.platform =
      parseSaleListingPlatform(body.platform) ?? "facebookMarketplace";
  }
  if (body.platformLabel !== undefined) {
    patch.platformLabel = normalizeOptionalText(asString(body.platformLabel));
  }
  if (body.listingTitle !== undefined) {
    patch.listingTitle = normalizeOptionalText(asString(body.listingTitle));
  }
  if (body.listingDescription !== undefined) {
    patch.listingDescription = normalizeOptionalText(
      asString(body.listingDescription),
    );
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
  if (body.listedAt !== undefined)
    patch.listedAt = optionalNumber(body.listedAt);
  if (body.lastRefreshedAt !== undefined) {
    patch.lastRefreshedAt = optionalNumber(body.lastRefreshedAt);
  }
  if (body.suggestedPriceLowCents !== undefined) {
    patch.suggestedPriceLowCents = optionalNumber(body.suggestedPriceLowCents);
  }
  if (body.suggestedPriceHighCents !== undefined) {
    patch.suggestedPriceHighCents = optionalNumber(
      body.suggestedPriceHighCents,
    );
  }
  if (body.officialPriceCents !== undefined) {
    patch.officialPriceCents = optionalNumber(body.officialPriceCents);
  }
  if (body.currency !== undefined) {
    const currency = normalizeOptionalText(
      asString(body.currency),
    )?.toUpperCase();
    patch.currency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  }
  if (body.pricingConfidence !== undefined) {
    patch.pricingConfidence = parseConfidence(body.pricingConfidence) ?? "none";
  }
  if (body.priceDecisionSource !== undefined) {
    patch.priceDecisionSource = normalizeOptionalText(
      asString(body.priceDecisionSource),
    );
  }
  if (body.userOverrodePrice !== undefined) {
    patch.userOverrodePrice = Boolean(body.userOverrodePrice);
  }
  if (body.researchDepth !== undefined) {
    patch.researchDepth = parseSaleResearchDepth(body.researchDepth) ?? "none";
  }
  if (body.researchSources !== undefined) {
    patch.researchSources =
      parseSaleResearchSources(body.researchSources) ?? [];
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

function parseMovePersonRole(value: unknown) {
  return includesLiteral(restMovePersonRoles, value)
    ? (value as Doc<"movePeople">["role"])
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

function parsePlanningApprovals(
  body: unknown,
): PlanningSuggestionApprovalInput[] {
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
        asString(approval.assignmentOverrideReason),
      ),
    };
  });
}

function parseEstimateDraftPatch(
  value: unknown,
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
      "estimateDraft.weightConfidence",
    ),
    volumeConfidence: parsePlanningConfidence(
      input.volumeConfidence,
      "estimateDraft.volumeConfidence",
    ),
  });
}

function parseAssignmentDraftPatch(
  value: unknown,
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
    includesLiteral(documentationProfileTypes, entry),
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
  value: unknown,
): DocumentationProfileStatus | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(documentationProfileStatuses, value)) {
    throw new Error("Unsupported documentation profile status.");
  }
  return value as DocumentationProfileStatus;
}

function parseDocumentationFieldKeys(
  value: unknown,
): DocumentationFieldKey[] | undefined {
  return parseLiteralArray(value, documentationFieldKeys, "includedFields") as
    | DocumentationFieldKey[]
    | undefined;
}

function parseDocumentationImageRule(
  value: unknown,
): DocumentationImageRule | undefined {
  if (value === undefined || value === "") return undefined;
  if (!includesLiteral(documentationImageRules, value)) {
    throw new Error("Unsupported documentation imageRule.");
  }
  return value as DocumentationImageRule;
}

function parseDocumentationFilters(
  value: unknown,
): DocumentationFilters | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("filters must be an object.");
  }
  const input = bodyObject(value);
  return normalizeDocumentationFilters({
    dispositions: parseLiteralArray(
      input.dispositions,
      itemDispositions,
      "filters.dispositions",
    ),
    statuses: parseLiteralArray(
      input.statuses,
      itemStatuses,
      "filters.statuses",
    ),
    planningDefaultKeys: parseLiteralArray(
      input.planningDefaultKeys,
      planningDefaultKeys,
      "filters.planningDefaultKeys",
    ),
    room: asString(input.room),
    destinationRoom: asString(input.destinationRoom),
  });
}

function parseLiteralArray<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string,
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
  if (
    value === "unreviewed" ||
    value === "estimated" ||
    value === "confirmed"
  ) {
    return value;
  }
  throw new Error("Invalid capacityReviewStatus.");
}

function parseCapacity(
  value: unknown,
): Doc<"transportResources">["capacity"] | undefined {
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
  const ids = value.filter(
    (entry): entry is string => typeof entry === "string",
  );
  if (ids.length !== value.length) {
    throw new Error("ID arrays may only contain strings.");
  }
  return ids;
}

function removeUndefined<TValue extends Record<string, unknown>>(
  value: TValue,
) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as {
    [TKey in keyof TValue as undefined extends TValue[TKey] ? TKey : TKey]:
      | Exclude<TValue[TKey], undefined>
      | undefined;
  };
}

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
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
  zoneCapacity?: Doc<"transportZones">["capacity"],
) {
  if (!zoneCapacity) {
    return resourceCapacity;
  }

  return {
    maxWeightLb: minOptional(
      resourceCapacity.maxWeightLb,
      zoneCapacity.maxWeightLb,
    ),
    maxVolumeCuFt: minOptional(
      resourceCapacity.maxVolumeCuFt,
      zoneCapacity.maxVolumeCuFt,
    ),
    maxItemCount: minOptional(
      resourceCapacity.maxItemCount,
      zoneCapacity.maxItemCount,
    ),
    dimensions: {
      lengthIn: minOptional(
        resourceCapacity.dimensions?.lengthIn,
        zoneCapacity.dimensions?.lengthIn,
      ),
      widthIn: minOptional(
        resourceCapacity.dimensions?.widthIn,
        zoneCapacity.dimensions?.widthIn,
      ),
      heightIn: minOptional(
        resourceCapacity.dimensions?.heightIn,
        zoneCapacity.dimensions?.heightIn,
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

function enumField<T extends string>(
  path: string,
  value: unknown,
  validValues: readonly T[],
): T {
  if (includesLiteral(validValues, value)) {
    return value as T;
  }
  throw invalidField(path, `Unsupported ${path}.`, validValues);
}
