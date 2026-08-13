import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthorizationError, requireCurrentUser } from "./auth";
import { recordAuditEvent } from "./audit";

export function parseAdminEmails(value?: string) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isConfiguredAdminEmail(
  email: string | undefined,
  configured = process.env.ADMIN_EMAILS
) {
  if (!email) {
    return false;
  }

  return parseAdminEmails(configured).has(email.trim().toLowerCase());
}

export function appRoleForEmail(
  email: string | undefined,
  existingRole?: Doc<"users">["appRole"]
): Doc<"users">["appRole"] {
  if (existingRole === "admin" || isConfiguredAdminEmail(email)) {
    return "admin";
  }

  return "member";
}

export async function requireAppAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireCurrentUser(ctx);

  if (user.status !== "active" || user.appRole !== "admin") {
    throw new AuthorizationError("Requires Assist With Moving admin access.");
  }

  return user;
}

export async function recordAdminAccess(
  ctx: MutationCtx,
  user: Doc<"users">,
  action: string,
  metadata?: Record<string, unknown>,
  object?: { table: string; id: string }
) {
  return await recordAuditEvent(ctx, {
    actorType: "user",
    actorUserId: user._id,
    category: "admin",
    action,
    objectTable: object?.table,
    objectId: object?.id,
    metadata,
  });
}
