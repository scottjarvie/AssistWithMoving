import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import { assertHouseholdEntitlement } from "./billing";
import {
  generateShareToken,
  hashShareToken,
  normalizeShareLinkActions,
  safeShareLinkResult,
  shareTokenPreview,
  type ShareLinkAction,
  type ShareLinkScope,
} from "./documentation";
import { normalizeOptionalText } from "./moveFields";

export const defaultMoveLinkActions = ["view", "download"] as const;
const moveLinkAllowedActions = ["view", "viewPlan", "download"] as const;
export const maxShareLinkLifetimeMs = 366 * 24 * 60 * 60 * 1000;

export type ShareLinkRole =
  | "owner"
  | "admin"
  | "editor"
  | "packer"
  | "viewer"
  | "guest";

export type ShareLinkActor =
  | { type: "user"; userId: Id<"users"> }
  | { type: "apiKey"; apiKeyId: Id<"apiKeys">; userId: Id<"users"> };

export type CreateShareLinkRecordArgs = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  documentationProfileId?: Id<"documentationProfiles">;
  scope: ShareLinkScope;
  tokenHash: string;
  tokenPreview: string;
  label?: string;
  role: ShareLinkRole;
  allowedActions?: ShareLinkAction[];
  expiresAt: number;
};

export type CreateGeneratedShareLinkArgs = Omit<
  CreateShareLinkRecordArgs,
  "tokenHash" | "tokenPreview"
>;

export type RevokeShareLinkRecordArgs = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  shareLinkId: Id<"shareLinks">;
};

export function safeShareLinkMetadata(link: Doc<"shareLinks">) {
  return {
    _id: link._id,
    shareLinkId: link._id,
    householdId: link.householdId,
    moveId: link.moveId,
    documentationProfileId: link.documentationProfileId,
    scope: link.scope,
    tokenPreview: link.tokenPreview,
    label: link.label,
    role: link.role,
    status: link.status,
    allowedActions: link.allowedActions,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    accessCount: link.accessCount,
    lastAccessedAt: link.lastAccessedAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export async function createGeneratedShareLink(
  ctx: MutationCtx,
  args: CreateGeneratedShareLinkArgs,
  actor: ShareLinkActor
) {
  const token = generateShareToken();
  const tokenHash = await hashShareToken(token);
  const shareLinkId = await createShareLinkRecord(
    ctx,
    {
      ...args,
      tokenHash,
      tokenPreview: shareTokenPreview(token),
    },
    actor
  );

  return safeShareLinkResult({ shareLinkId, token });
}

export async function createShareLinkRecord(
  ctx: MutationCtx,
  args: CreateShareLinkRecordArgs,
  actor: ShareLinkActor
) {
  await assertHouseholdEntitlement(ctx, {
    householdId: args.householdId,
    dimension: "activeShareLinks",
  });

  const now = Date.now();
  if (args.expiresAt <= now) {
    throw new Error("Share link expiration must be in the future.");
  }
  if (args.expiresAt > now + maxShareLinkLifetimeMs) {
    throw new Error("Share link expiration cannot be more than one year out.");
  }
  if (args.scope === "profile" && !args.documentationProfileId) {
    throw new Error("Profile-scoped links need a documentation profile.");
  }

  const profile = args.documentationProfileId
    ? await ctx.db.get(args.documentationProfileId)
    : null;
  if (
    args.documentationProfileId &&
    (!profile ||
      profile.householdId !== args.householdId ||
      profile.moveId !== args.moveId ||
      profile.status === "archived")
  ) {
    throw new Error("Documentation profile not found.");
  }

  const allowedActions = normalizeShareLinkActions(
    args.allowedActions,
    profile?.allowedActions ??
      (args.allowedActions
        ? [...moveLinkAllowedActions]
        : [...defaultMoveLinkActions])
  );
  const shareLinkId = await ctx.db.insert("shareLinks", {
    householdId: args.householdId,
    moveId: args.moveId,
    documentationProfileId: args.documentationProfileId,
    scope: args.scope,
    tokenHash: args.tokenHash,
    tokenPreview: args.tokenPreview,
    label: normalizeOptionalText(args.label),
    role: args.role,
    status: "active",
    allowedActions,
    expiresAt: args.expiresAt,
    accessCount: 0,
    createdByUserId: actor.userId,
    ...(actor.type === "apiKey" ? { createdByApiKeyId: actor.apiKeyId } : {}),
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    ...auditActorFields(actor),
    category: "shareLink",
    action: "share_link.created",
    objectTable: "shareLinks",
    objectId: shareLinkId,
    metadata: {
      scope: args.scope,
      role: args.role,
      allowedActions,
      tokenPreview: args.tokenPreview,
    },
  });

  return shareLinkId;
}

export async function revokeShareLinkRecord(
  ctx: MutationCtx,
  args: RevokeShareLinkRecordArgs,
  actor: ShareLinkActor
) {
  const link = await ctx.db.get(args.shareLinkId);
  if (
    !link ||
    link.householdId !== args.householdId ||
    link.moveId !== args.moveId
  ) {
    throw new Error("Share link not found.");
  }

  const now = Date.now();
  const patch = {
    status: "revoked" as const,
    revokedAt: now,
    ...(actor.type === "user"
      ? { revokedByUserId: actor.userId }
      : { revokedByApiKeyId: actor.apiKeyId }),
    updatedAt: now,
  };

  await ctx.db.patch(args.shareLinkId, patch);

  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    ...auditActorFields(actor),
    category: "shareLink",
    action: "share_link.revoked",
    objectTable: "shareLinks",
    objectId: args.shareLinkId,
    metadata: { tokenPreview: link.tokenPreview },
  });

  return { ...link, ...patch };
}

function auditActorFields(actor: ShareLinkActor) {
  return actor.type === "user"
    ? { actorType: "user" as const, actorUserId: actor.userId }
    : { actorType: "apiKey" as const, actorApiKeyId: String(actor.apiKeyId) };
}
