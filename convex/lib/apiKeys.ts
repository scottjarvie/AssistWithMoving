import type { Id } from "../_generated/dataModel";
import type { PermissionAction } from "./roles";

export const apiKeyScopes = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "photos/write",
  "exports/read",
  "exports/create",
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

const textEncoder = new TextEncoder();

export function normalizeApiKeyScopes(scopes: ApiKeyScope[]) {
  const allowed = new Set(apiKeyScopes);
  return Array.from(new Set(scopes.filter((scope) => allowed.has(scope)))).sort();
}

export function apiKeyPreview(rawKey: string) {
  if (rawKey.length <= 18) return rawKey;
  return `${rawKey.slice(0, 12)}...${rawKey.slice(-6)}`;
}

export function apiKeyPrefix(rawKey: string) {
  const [, prefix] = rawKey.split("_");
  if (!prefix) {
    throw new Error("Invalid API key format.");
  }
  return prefix;
}

export function generateApiKeySecret() {
  const prefix = randomTokenPart(10);
  const secret = randomTokenPart(32);
  return `mmk_${prefix}_${secret}`;
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
    case "documentation:read":
      return ["exports/read"];
    case "documentation:create":
      return ["exports/create"];
    case "household:manage_members":
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
  if (record.status !== "active") return false;
  if (record.expiresAt !== undefined && record.expiresAt <= now) return false;
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
