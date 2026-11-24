import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "../lib/audit";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  normalizeOptionalText,
  normalizeSortOrder,
} from "../lib/moveFields";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { requireApiMovePerson } from "../lib/rest/require";
import { safeMovePerson } from "../lib/rest/safe";
import { movePersonPatch } from "../lib/rest/patch";
import {
  optionalNumber,
  asString,
  parseMovePersonRole,
} from "../lib/rest/parse";

export async function routeMovePeople(
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
    actorType: "agent",
    actorUserId: auth.createdByUserId,
    actorApiKeyId: auth.actor.apiKeyId,
    category: "household",
    action,
    objectTable: "movePeople",
    objectId: personId,
    metadata,
  });
}
