import { convexTest } from "convex-test";
import type { Doc } from "../../convex/_generated/dataModel";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { buildConsentSnapshot, movingScopes, GRANT_BOUNDARY_VERSION } from "../../convex/lib/aiGrants";
import { apiKeyScopes, generateApiKeySecret, apiKeyPrefix, apiKeyPreview, hashApiKey } from "../../convex/lib/apiKeys";
import type { PersonChange } from "../../convex/lib/carriedAccess";
const modules = import.meta.glob("../../convex/**/*.ts");
export async function accessFixture(subject = "awl-owner") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkUserId: subject, name: "Owner", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
    const householdId = await ctx.db.insert("households", { name: "Home", ownerUserId: userId, createdByUserId: userId, createdAt: now, updatedAt: now });
    const membershipId = await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdByUserId: userId, createdAt: now, updatedAt: now });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Private move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    return { userId, householdId, membershipId, moveId };
  });
  const person = t.withIdentity({ subject, sid: "sess_awl_owner" });
  const root = () => t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", ids.userId)).unique());
  const connect = async (clientId = "ai-one", clientName?: string) => {
    await t.mutation(internal.aiGrants.touchLegacyConnection, { subject, clientId, clientName });
    return t.query(internal.aiGrants.describeConnection, { subject, clientId });
  };
  const finish = async () => {
    while (!(await root())?.bootstrapped) await t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: ids.userId });
  };
  const connection = (clientId = "ai-one") => t.run(ctx => ctx.db.query("aiAccessConnections").withIndex("by_owner_client", q => q.eq("ownerUserId", ids.userId).eq("verifiedClientId", `oauth:${clientId}`)).unique());
  const reduce = async (input: { opId: string; scopes?: string[]; action?: string; expiresAt?: number | null; moveIds?: string[]; expectedVersion?: number }, clientId = "ai-one") => t.mutation(internal.aiGrants.reduceConnection, { subject, clientId, expectedVersion: (await root())!.revision, ...input });
  const change = async (input: Omit<PersonChange, "expectedVersion"> & { expectedVersion?: number }, clientId = "ai-one") => person.mutation(api.connectionSettings.change, { connectionId: (await connection(clientId))!._id, expectedVersion: (await root())!.revision, ...input });
  const legacyGrant = async (overrides: Partial<Doc<"aiGrants">> = {}) => t.run(ctx => ctx.db.insert("aiGrants", {
    ownerUserId: ids.userId, householdId: ids.householdId, label: "Legacy AI", scopes: [...movingScopes], moveScope: "allMoves", status: "active", consentBoundaryVersion: GRANT_BOUNDARY_VERSION, consentSnapshot: buildConsentSnapshot([...movingScopes]), approvedAt: Date.now() - 1000, useCount: 0, version: 1, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, ...overrides,
  }));
  const legacyKey = async (overrides: Partial<Doc<"apiKeys">> = {}) => {
    const rawKey = generateApiKeySecret();
    const secretHash = await hashApiKey(rawKey);
    const apiKeyId = await t.run(ctx => ctx.db.insert("apiKeys", { householdId: ids.householdId, name: "Legacy key", prefix: apiKeyPrefix(rawKey), tokenPreview: apiKeyPreview(rawKey), secretHash, scopes: [...apiKeyScopes], status: "active", createdByUserId: ids.userId, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000, ...overrides }));
    return { rawKey, apiKeyId };
  };
  const request = (rawKey: string, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => t.mutation(internal.restApi.handle, { method, path, query: {}, authorization: `Bearer ${rawKey}`, body });
  return { t, person, root, connect, connection, finish, reduce, change, legacyGrant, legacyKey, request, ...ids };
}
export type AccessFixture = Awaited<ReturnType<typeof accessFixture>>;
