import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { previewPublicPacket } from "../publicPackets";
import { recordAuditEvent } from "./audit";
import { accessState, connectionAccess, keyScopes, oauthIdentity, oauthScopes, readAccess, readConnection, requireSubject, snapshot } from "./carriedAccess";
import { connectionChange } from "./connectionHistory";
import { oauthClientIdFromClaims } from "./mcpClientIdentity";
import { checkPublishing } from "./publishingCheck";

export const publicationArgs = {
  acknowledgeContactDetails: v.optional(v.object({ emails: v.number(), phones: v.number(), addresses: v.number() })),
  restorePrivately: v.optional(v.boolean()),
};
export type PublicationInput = { acknowledgeContactDetails?: unknown; restorePrivately?: boolean };
type Actor = { ownerUserId: Id<"users">; verifiedClientId: string };
// These are the complete sources of recipient packets and public Layout Studio views.
const publicTables = ["moves", "items", "boxes", "boxItems", "itemPhotos", "moveSpaces", "movePeople", "transportResources", "transportZones", "documentationProfiles", "floorPlans", "planLevels", "planEntities", "planPlacements", "plannedItems"] as const;
function stable(value: unknown): string { return JSON.stringify(value, (key, entry) => key === "generatedAt" ? undefined : entry); }
async function packet(ctx: MutationCtx, link: Doc<"shareLinks">) {
  try { return await previewPublicPacket(ctx, { ...link, shareLinkId: link._id }); }
  catch { return null; } // Restoring a profile may turn an unavailable packet into a live one.
}
async function currentActor(ctx: MutationCtx, actor: Actor, publish: boolean, moveIds: Id<"moves">[]) {
  const root = await readAccess(ctx, actor.ownerUserId);
  const connection = await readConnection(ctx, actor.ownerUserId, actor.verifiedClientId);
  if (!root || !connection || accessState(connectionAccess(root, connection), connection) !== "active") throw new ConvexError("Publishing refused: this connection is stopped. Only the person can restore it at https://movingmanifest.com/settings/ai.");
  const access = connectionAccess(root, connection);
  const power = connection.kind === "key" ? "exports/create" : "moving.work.write";
  const scopes: readonly string[] = connection.kind === "key" ? keyScopes(access) : oauthScopes(access);
  if (publish && !scopes.includes(power)) throw new ConvexError(`Publishing refused: missing power ${power}. Only the person can restore it at https://movingmanifest.com/settings/ai. Restore privately with restorePrivately: true to keep the content private.`);
  if (access.moveIds && moveIds.some(id => !access.moveIds!.includes(id))) throw new ConvexError("Publishing refused: this move is outside the connection's current limits.");
  return { root, connection, access };
}

/** Runs inside the committing mutation. A refusal rolls back the entire write.
 * Snapshot before the first source write, then scan the actual resulting outgoing
 * batch. Private edits and pure archives don't publish. No transport can bypass
 * this by holding a stale discovery response or by catching an outer REST error.
 */
export async function withSharedPublishing<T>(ctx: MutationCtx, actorSource: Actor | (() => Promise<Actor | null>), options: PublicationInput, work: (ctx: MutationCtx) => Promise<T>): Promise<T> {
  const restorePrivately = options.restorePrivately === true;
  const moves = new Map<string, Promise<Array<{ link: Doc<"shareLinks">; before: string }>>>();
  function beforeMove(moveId: Id<"moves">) {
    if (!moves.has(moveId)) moves.set(moveId, (async () => {
      const links = await ctx.db.query("shareLinks").withIndex("by_move_status", q => q.eq("moveId", moveId).eq("status", "active")).collect();
      return Promise.all(links.filter(link => link.expiresAt > Date.now()).map(async link => ({ link, before: stable(await packet(ctx, link)) })));
    })());
    return moves.get(moveId)!;
  }
  const db = new Proxy(ctx.db, { get(target, name) {
    if (name === "insert") return async (table: string, value: Record<string, unknown>) => {
      if (publicTables.includes(table as typeof publicTables[number]) && value.moveId) await beforeMove(value.moveId as Id<"moves">);
      return target.insert(table as "items", value as never);
    };
    if (name === "patch" || name === "replace") return async (id: string, value: Record<string, unknown>) => {
      const table = publicTables.find(table => target.normalizeId(table, id));
      // Pure archive/deletion reduces exposure. Restores (cleared timestamps)
      // and edits, including moves into another shared container, are checked.
      const reducing = value.deletedAt !== undefined || value.archivedAt !== undefined || value.status === "archived";
      if (table && !reducing) {
        const old = await target.get(id as Id<"items">);
        const moveId = value.moveId ?? (table === "moves" ? id : old && "moveId" in old ? old.moveId : undefined);
        if (moveId) await beforeMove(moveId as Id<"moves">);
      }
      return name === "patch" ? target.patch(id as Id<"items">, value as never) : target.replace(id as Id<"items">, value as never);
    };
    const value = Reflect.get(target, name);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await work({ ...ctx, db });
  const changed: Array<{ link: Doc<"shareLinks">; after: unknown }> = [];
  for (const promise of moves.values()) for (const { link, before } of await promise) {
    const current = await ctx.db.get(link._id);
    if (!current || current.status !== "active" || current.expiresAt <= Date.now()) continue;
    const after = await packet(ctx, current);
    if (stable(after) !== before) changed.push({ link: current, after });
  }
  if (!changed.length) return result;
  const actor = typeof actorSource === "function" ? await actorSource() : actorSource;
  if (!actor) return result; // Person-only internal upload completion.
  const { root, connection, access } = await currentActor(ctx, actor, !restorePrivately, changed.map(({ link }) => link.moveId));
  if (restorePrivately) {
    for (const { link } of changed) await ctx.db.patch(link._id, { status: "revoked", revokedAt: Date.now(), revokedByUserId: actor.ownerUserId, revokedByApiKeyId: connection.apiKeyId, updatedAt: Date.now() });
  } else {
    if (changed.some(({ after }) => !after)) throw new ConvexError("Publishing refused: the resulting stored packet cannot be scanned. Retry the restore with restorePrivately: true to revoke its links and keep it private.");
    try { checkPublishing(changed.map(({ after }) => after), options.acknowledgeContactDetails); }
    catch (error) { throw new ConvexError(`${error instanceof Error ? error.message : "Publishing check failed."} For a private restore, retry with restorePrivately: true; this revokes the affected links.`); }
  }
  for (const { link } of changed) {
    const receipt = await recordAuditEvent(ctx, { householdId: link.householdId, moveId: link.moveId, actorType: "agent", actorUserId: actor.ownerUserId, actorApiKeyId: connection.apiKeyId, category: "shareLink", action: restorePrivately ? "share_link.unpublished_for_private_restore" : "share_link.content_published", objectTable: "shareLinks", objectId: link._id, metadata: { source: "mcp", attribution: "Your AI" } });
    await connectionChange(ctx, { ownerUserId: actor.ownerUserId, accessOwnerId: root._id, connectionId: String(connection._id), actor: "ai", before: snapshot(access, connection), after: { ...snapshot(access, connection), shareLinkId: link._id }, message: restorePrivately ? "Your AI restored content privately and unpublished its share link." : "Your AI published an update to shared content after checking it for private details.", opId: `publish:${receipt}` });
  }
  return result;
}

type ActorArguments = {
  apiKeyId?: string;
  principal?: { subject: string; clientId?: string; claims?: Record<string, unknown> };
  caller?: { subject: string; clientId?: string; claims?: Record<string, unknown> };
  apiActor?: { apiKeyId: string; oauthCaller?: { subject: string; clientId?: string; claims?: Record<string, unknown> } };
};
async function actorFromArgs(ctx: MutationCtx, args: ActorArguments): Promise<Actor | null> {
  const keyId = args.apiKeyId ?? (args.apiActor?.apiKeyId !== "mcp-oauth" ? args.apiActor?.apiKeyId : undefined);
  if (keyId) {
    const id = ctx.db.normalizeId("apiKeys", keyId);
    const key = id && await ctx.db.get(id);
    if (!key) throw new ConvexError("A current verified API key is required.");
    return { ownerUserId: key.createdByUserId, verifiedClientId: `key:${key._id}` };
  }
  const caller = args.principal ?? args.caller ?? args.apiActor?.oauthCaller;
  if (!caller) { if (args.apiActor) throw new ConvexError("A verified connection is required to publish uploaded content."); return null; }
  const user = await requireSubject(ctx, caller.subject);
  const clientId = caller.clientId ?? oauthClientIdFromClaims(caller.claims);
  return { ownerUserId: user._id, verifiedClientId: oauthIdentity(clientId ?? "") };
}

// Preserve Convex's builder inference; all validators and the publication check
// are added at registration, shared by canonical, legacy and upload callbacks.
// The generic Convex builder accepts arbitrary validated domain arguments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const aiMutation: typeof internalMutation = ((definition: any) => internalMutation({
  ...definition,
  args: { ...definition.args, ...publicationArgs },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx: MutationCtx, args: any) => {
    return withSharedPublishing(ctx, () => actorFromArgs(ctx, args), { ...args.apiActor, ...args }, checked => definition.handler(checked, args));
  },
})) as typeof internalMutation;
