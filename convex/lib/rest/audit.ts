import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { recordAuditEvent } from "../audit";
import type { authenticateApiKey } from "../apiKeyAuth";

export async function auditApiWrite(
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
    // "agent" + BOTH ids: the API key (which agent) AND the human who owns it
    // (whose agent) — so "who did what / whose agent did what" is answerable
    // from the audit row itself, not a later join.
    actorType: "agent",
    actorUserId: auth.createdByUserId,
    actorApiKeyId: auth.actor.apiKeyId,
    category: "apiKey",
    action,
    objectTable,
    objectId,
    metadata,
  });
}
