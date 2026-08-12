import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { rotateApiKeyForUser } from "../../convex/apiKeys";
import { authenticateApiKey } from "../../convex/lib/apiKeyAuth";
import { generateApiKeySecret, hashApiKey } from "../../convex/lib/apiKeys";

const householdId = "household_123" as Id<"households">;
const apiKeyId = "api_key_123" as Id<"apiKeys">;
const actorUserId = "user_123" as Id<"users">;

function apiKeyRecord(
  overrides: Partial<{
    status: "active" | "revoked";
    expiresAt: number;
  }> = {},
) {
  return {
    _id: apiKeyId,
    _creationTime: 1,
    householdId,
    name: "Packing helper",
    prefix: "lookup-prefix",
    tokenPreview: "mmk_lookup...secret",
    secretHash: "stored-hash",
    scopes: ["moves/read" as const],
    status: "active" as const,
    createdByUserId: actorUserId,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mutationContext(record: ReturnType<typeof apiKeyRecord>) {
  const get = vi.fn().mockResolvedValue(record);
  const patch = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockResolvedValue("inserted_id");

  return {
    ctx: { db: { get, patch, insert } } as unknown as MutationCtx,
    patch,
    insert,
  };
}

describe("API-key rotation lifecycle", () => {
  it("refuses a revoked key before any write and directs the owner to create a new key", async () => {
    const { ctx, patch, insert } = mutationContext(
      apiKeyRecord({ status: "revoked" }),
    );

    await expect(
      rotateApiKeyForUser(ctx, { householdId, apiKeyId }, actorUserId, 2_000),
    ).rejects.toThrow(/revoked.*create a new key/i);
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses an expired key before any write and directs the owner to create a new key", async () => {
    const { ctx, patch, insert } = mutationContext(
      apiKeyRecord({ expiresAt: 1_000 }),
    );

    await expect(
      rotateApiKeyForUser(ctx, { householdId, apiKeyId }, actorUserId, 2_000),
    ).rejects.toThrow(/expired.*create a new key/i);
    expect(patch).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("preserves a future expiry and returns the raw secret only in the mutation result", async () => {
    const { ctx, patch, insert } = mutationContext(
      apiKeyRecord({ expiresAt: 5_000 }),
    );

    const result = await rotateApiKeyForUser(
      ctx,
      { householdId, apiKeyId },
      actorUserId,
      2_000,
    );

    expect(patch).toHaveBeenCalledWith(
      apiKeyId,
      expect.objectContaining({ status: "revoked", updatedAt: 2_000 }),
    );
    expect(insert).toHaveBeenCalledWith(
      "apiKeys",
      expect.objectContaining({
        expiresAt: 5_000,
        secretHash: expect.any(String),
        status: "active",
      }),
    );
    const insertedKey = insert.mock.calls.find(([table]) => table === "apiKeys")?.[1];
    expect(insertedKey).not.toHaveProperty("rawKey");
    expect(result.rawKey).toMatch(/^mmk_/);
    expect(result.rawKey).not.toBe(insertedKey?.secretHash);
  });
});

describe("API-key last-use receipts", () => {
  async function authenticationContext(
    overrides: Partial<ReturnType<typeof apiKeyRecord>> = {},
    membership: { role: "owner"; status: "active" | "disabled"; apiAccessStatus?: "disabled" } | null = {
      role: "owner",
      status: "active",
    },
  ) {
    const rawKey = generateApiKeySecret();
    const key = {
      ...apiKeyRecord(),
      prefix: rawKey.slice("mmk_".length, "mmk_".length + 14),
      secretHash: await hashApiKey(rawKey),
      ...overrides,
    };
    const patch = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn((table: string) => ({
      withIndex: vi.fn(() => ({
        unique: vi.fn().mockResolvedValue(
          table === "apiKeys" ? key : membership,
        ),
      })),
    }));

    return {
      rawKey,
      patch,
      ctx: { db: { query, patch } } as unknown as MutationCtx,
    };
  }

  it("does not write a last-use receipt when authentication is denied", async () => {
    const { ctx, rawKey, patch } = await authenticationContext({
      expiresAt: Date.now() - 1,
    });

    await expect(
      authenticateApiKey(ctx, {
        rawKey,
        requiredScopes: ["moves/read"],
        action: "moves:list",
      }),
    ).rejects.toThrow(/expired/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it("writes the action receipt only after successful authentication", async () => {
    const { ctx, rawKey, patch } = await authenticationContext({
      expiresAt: Date.now() + 60_000,
    });

    await authenticateApiKey(ctx, {
      rawKey,
      requiredScopes: ["moves/read"],
      action: "moves:list",
    });

    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith(
      apiKeyId,
      expect.objectContaining({
        lastUsedAction: "moves:list",
        lastUsedAt: expect.any(Number),
      }),
    );
  });

  it("rejects keys whose creator membership is no longer active", async () => {
    const { ctx, rawKey, patch } = await authenticationContext(
      {},
      { role: "owner", status: "disabled" },
    );
    await expect(
      authenticateApiKey(ctx, {
        rawKey,
        requiredScopes: ["moves/read"],
        action: "moves:list",
      }),
    ).rejects.toThrow(/no longer has active household access/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects household keys whose creator membership was removed", async () => {
    const { ctx, rawKey, patch } = await authenticationContext({}, null);
    await expect(
      authenticateApiKey(ctx, {
        rawKey,
        requiredScopes: ["moves/read"],
        action: "moves:list",
      }),
    ).rejects.toThrow(/no longer has active household access/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it("does not fall back to a stored role when live move access is gone", async () => {
    const rawKey = generateApiKeySecret();
    const moveId = "move_123" as Id<"moves">;
    const key = {
      ...apiKeyRecord(),
      prefix: rawKey.slice("mmk_".length, "mmk_".length + 14),
      secretHash: await hashApiKey(rawKey),
      moveId,
      participantMoveRole: "owner" as const,
    };
    const patch = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn((table: string) => ({
      withIndex: vi.fn(() => ({
        unique: vi.fn().mockResolvedValue(table === "apiKeys" ? key : null),
      })),
    }));
    const get = vi.fn().mockResolvedValue({ _id: moveId, householdId });
    const ctx = { db: { query, get, patch } } as unknown as MutationCtx;
    await expect(
      authenticateApiKey(ctx, {
        rawKey,
        requiredScopes: ["moves/read"],
        householdId,
        moveId,
        action: "move:get",
      }),
    ).rejects.toThrow(/no access to this move/i);
    expect(patch).not.toHaveBeenCalled();
  });
});
