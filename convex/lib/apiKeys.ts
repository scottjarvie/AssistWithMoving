import type { Id } from "../_generated/dataModel";
import type { PermissionAction } from "./roles";

export const apiKeyScopes = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "queue/read",
  "queue/write",
  "plans/read",
  "plans/write",
  "photos/write",
  "exports/read",
  "exports/create",
  "members/manage",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export type ApiKeyVerificationInput = {
  status: "active" | "revoked";
  scopes: ApiKeyScope[];
  householdId: Id<"households">;
  moveId?: Id<"moves">;
  expiresAt?: number;
  secretHash: string;
};

export type ApiKeyEffectiveStatus = "active" | "expired" | "revoked";

export function apiKeyEffectiveStatus(
  record: Pick<ApiKeyVerificationInput, "status" | "expiresAt">,
  now = Date.now(),
): ApiKeyEffectiveStatus {
  if (record.status === "revoked") return "revoked";
  if (record.expiresAt !== undefined && record.expiresAt <= now) {
    return "expired";
  }
  return "active";
}

export function countEffectivelyActiveApiKeys(
  records: Array<Pick<ApiKeyVerificationInput, "status" | "expiresAt">>,
  now = Date.now(),
) {
  return records.filter(
    (record) => apiKeyEffectiveStatus(record, now) === "active",
  ).length;
}

const textEncoder = new TextEncoder();
const generatedKeyPrefix = "mmk_";
const generatedLookupPrefixLength = 14;

export function normalizeApiKeyScopes(scopes: ApiKeyScope[]) {
  const allowed = new Set(apiKeyScopes);
  return Array.from(new Set(scopes.filter((scope) => allowed.has(scope)))).sort();
}

export function apiKeyPreview(rawKey: string) {
  if (rawKey.length <= 18) return rawKey;
  return `${rawKey.slice(0, 12)}...${rawKey.slice(-6)}`;
}

// Every "Invalid API key format" message keeps that exact phrase as its prefix
// (callers and tests match on it) but adds a specific, actionable hint so a
// failing agent/connector can see WHY — an OAuth token, a masked preview, or a
// genuinely wrong shape all used to collapse into one opaque error.
export function describeInvalidApiKeyFormat(rawKey: string) {
  const base = "Invalid API key format.";
  if (rawKey.startsWith("eyJ") || rawKey.split(".").length === 3) {
    return `${base} This looks like an OAuth/JWT token, not an Assist With Moving API key. The MCP/REST endpoints need a key that starts with "mmk_" — copy it from Settings → AI Connections (Authorization: Bearer mmk_...).`;
  }
  if (rawKey.includes("...") || rawKey.includes("…")) {
    return `${base} The value looks like a masked preview (it contains "..."). Copy the full one-time key shown when it was created, not the masked version.`;
  }
  if (!rawKey.startsWith(generatedKeyPrefix)) {
    return `${base} A Assist With Moving API key starts with "mmk_".`;
  }
  return `${base} The key is the wrong shape — copy the full key from Settings → AI Connections, or rotate it.`;
}

export function apiKeyPrefix(rawKey: string) {
  if (!rawKey.startsWith(generatedKeyPrefix)) {
    throw new Error(describeInvalidApiKeyFormat(rawKey));
  }

  const prefixStart = generatedKeyPrefix.length;
  const prefixEnd = prefixStart + generatedLookupPrefixLength;
  const prefix = rawKey.slice(prefixStart, prefixEnd);
  if (
    prefix.length !== generatedLookupPrefixLength ||
    rawKey[prefixEnd] !== "_"
  ) {
    throw new Error(describeInvalidApiKeyFormat(rawKey));
  }
  return prefix;
}

export function generateApiKeySecret() {
  const prefix = randomTokenPart(10);
  const secret = randomTokenPart(32);
  return `${generatedKeyPrefix}${prefix}_${secret}`;
}

export async function hashApiKey(rawKey: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(rawKey));
  return bytesToHex(new Uint8Array(digest));
}

export function apiKeyHasScopes(
  availableScopes: ApiKeyScope[],
  requiredScopes: ApiKeyScope[]
) {
  const available = new Set(availableScopes);
  return requiredScopes.every((scope) => available.has(scope));
}

export function scopesForPermissionAction(action: PermissionAction): ApiKeyScope[] {
  switch (action) {
    case "household:read":
      return ["moves/read"];
    case "household:edit":
      return ["moves/write"];
    case "inventory:read":
      return ["inventory/read"];
    case "inventory:edit":
    case "inventory:pack":
      return ["inventory/write"];
    case "queue:read":
      return ["queue/read"];
    case "queue:write":
    case "queue:run":
      return ["queue/write"];
    case "plan:read":
      return ["plans/read"];
    case "plan:edit":
      return ["plans/write"];
    case "documentation:read":
      return ["exports/read"];
    case "documentation:create":
      return ["exports/create"];
    case "household:manage_members":
      return ["members/manage"];
    case "household:manage_settings":
    case "documentation:manage":
    case "api_keys:manage":
    case "admin:read":
      return [];
  }
}

export function canApiKeyPerformAction(
  scopes: ApiKeyScope[],
  action: PermissionAction
) {
  const requiredScopes = scopesForPermissionAction(action);
  return requiredScopes.length > 0 && apiKeyHasScopes(scopes, requiredScopes);
}

export async function verifyApiKeyHash({
  rawKey,
  expectedHash,
}: {
  rawKey: string;
  expectedHash: string;
}) {
  const actualHash = await hashApiKey(rawKey);
  return timingSafeEqual(actualHash, expectedHash);
}

export function validateApiKeyRecord({
  record,
  householdId,
  moveId,
  requiredScopes,
  now = Date.now(),
}: {
  record: Pick<
    ApiKeyVerificationInput,
    "status" | "scopes" | "householdId" | "moveId" | "expiresAt"
  >;
  householdId?: Id<"households">;
  moveId?: Id<"moves">;
  requiredScopes: ApiKeyScope[];
  now?: number;
}) {
  if (apiKeyEffectiveStatus(record, now) !== "active") return false;
  if (householdId && record.householdId !== householdId) return false;
  if (record.moveId && moveId && record.moveId !== moveId) return false;
  if (record.moveId && !moveId) return false;
  return apiKeyHasScopes(record.scopes, requiredScopes);
}

function randomTokenPart(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
