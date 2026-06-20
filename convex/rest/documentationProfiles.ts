import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "../lib/audit";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
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
} from "../lib/documentation";
import {
  documentationProfileTypes,
  itemDispositions,
  itemStatuses,
  normalizeOptionalText,
  planningDefaultKeys,
} from "../lib/moveFields";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/restApi";

type RestApiAuth = Awaited<ReturnType<typeof authenticateApiKey>>;

export async function routeDocumentationProfiles(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: RestApiAuth,
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

export function safeDocumentationProfile(profile: Doc<"documentationProfiles">) {
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

async function requireApiMutableDocumentationProfile(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  profileIdSegment: string,
) {
  const profile = await ctx.db.get(profileIdSegment as Id<"documentationProfiles">);
  if (!profile || profile.householdId !== householdId || profile.moveId !== moveId) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

async function auditApiDocumentationProfile(
  ctx: MutationCtx,
  auth: RestApiAuth,
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
  return parseLiteralArray(
    value,
    documentationFieldKeys,
    "includedFields",
  ) as DocumentationFieldKey[] | undefined;
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
      "filters.dispositions",
    ),
    statuses: parseLiteralArray(input.statuses, itemStatuses, "filters.statuses"),
    planningDefaultKeys: parseLiteralArray(
      input.planningDefaultKeys,
      planningDefaultKeys,
      "filters.planningDefaultKeys",
    ),
    room: asString(input.room),
    destinationRoom: asString(input.destinationRoom),
  });
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

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function includesLiteral(values: readonly string[], value: unknown) {
  return typeof value === "string" && values.includes(value);
}
