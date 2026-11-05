import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const redacted = "[redacted]";
const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|api.?key|private.?note|serial.?number|estimated.?value|purchase.?value|signing.?secret/i;

export type AuditMetadata = Record<string, unknown>;

const connectionIdentityKey = /client_?id|client_?name|api_?key|grant_?id|sourceGrantIds|superseded/i;
function hasConnectionIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => connectionIdentityKey.test(key) || hasConnectionIdentity(child));
}
function sharedMetadata(value: unknown, hideReason: boolean): unknown {
  if (Array.isArray(value)) return value.map(child => sharedMetadata(child, hideReason));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !connectionIdentityKey.test(key) && !(hideReason && /reason/i.test(key)))
    .map(([key, child]) => [key, sharedMetadata(child, hideReason)]));
}

/** Shared domain receipts retain work facts, never credential identity. Source stays intact. */
export function sharedAuditEvent(entry: Doc<"auditLogs">): Doc<"auditLogs"> {
  if (entry.objectTable === "aiGrants" || entry.objectTable === "apiKeys" || entry.action.startsWith("ai_grant.") || entry.action.startsWith("api_key.")) {
    return { ...entry, action: entry.category === "apiKey" ? "api_connection.changed" : "ai_connection.changed", actorApiKeyId: undefined, objectTable: undefined, objectId: undefined, metadata: undefined };
  }
  const hideReason = entry.actorType === "agent" || entry.actorType === "apiKey" || entry.actorApiKeyId !== undefined || hasConnectionIdentity(entry.metadata);
  return { ...entry, actorApiKeyId: undefined, metadata: entry.metadata ? sharedMetadata(entry.metadata, hideReason) as AuditMetadata : undefined };
}

export type AuditEventInput = {
  householdId?: Id<"households">;
  moveId?: Id<"moves">;
  // "agent" = a connected AI/automation acting on behalf of a real human; the
  // event still carries actorUserId (the human) so we can answer both "who did
  // this" and "whose agent did this". Keep in lockstep with the auditActorType
  // union in convex/schema.ts and the record validator in convex/audit.ts.
  actorType: "user" | "apiKey" | "agent" | "system" | "webhook";
  actorUserId?: Id<"users">;
  actorApiKeyId?: string;
  category:
    | "auth"
    | "household"
    | "inventory"
    | "plan"
    | "assignment"
    | "photo"
    | "documentation"
    | "shareLink"
    | "apiKey"
    | "export"
    | "ai"
    | "queue"
    | "admin"
    | "system";
  action: string;
  objectTable?: string;
  objectId?: string;
  metadata?: AuditMetadata;
};

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 6) {
    return "[max-depth]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return redactAuditMetadata(value as AuditMetadata, depth + 1);
  }

  return value;
}

export function redactAuditMetadata(
  metadata: AuditMetadata,
  depth = 0
): AuditMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? redacted : redactValue(value, depth),
    ])
  );
}

export async function recordAuditEvent(
  ctx: MutationCtx,
  input: AuditEventInput
) {
  return await ctx.db.insert("auditLogs", {
    ...input,
    metadata: input.metadata ? redactAuditMetadata(input.metadata) : undefined,
    createdAt: Date.now(),
  });
}
