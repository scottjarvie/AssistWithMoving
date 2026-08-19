// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the convex-test ActionCtx bridge and the fetch stub are intentionally synthetic. */

/**
 * Private-media byte delivery for a connected AI.
 *
 * The photos are the whole point of Moving's inventory workflow: a person
 * photographs a room, and their chosen AI is supposed to look at what is in the
 * picture. Everything here is about that actually happening with REAL bytes —
 * not the permission shape, which `mcp-product-grants` and the lifecycle
 * harness already cover.
 *
 * What the network stub does and does not stand in for: it replaces only the
 * HTTP GET against the storage host, and it sizes each response from the
 * variant in the URL the product itself built. So the delivery path under test
 * is the shipped one — the same signed/derivative URL the web app uses — and
 * what stays unproved is the bucket's own availability, which only a live run
 * can show.
 */
import { convexTest } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { internal } from "../../convex/_generated/api";
import {
  INLINE_IMAGE_LIMIT,
  PER_IMAGE_BYTE_BUDGET,
  TOTAL_BYTE_BUDGET,
  classifyDeliveryFailure,
  explainSkip,
  moreActionableReason,
  smallerVariant,
  variantAttemptOrder,
} from "../../convex/lib/mcpEvidenceMedia";
import schema from "../../convex/schema";

type ModuleMap = Record<string, () => Promise<unknown>>;

function buildModuleMap(rootDir: string): ModuleMap {
  const modules: ModuleMap = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (/\.(?:ts|tsx|js)$/.test(entry)) {
        modules[path.relative(process.cwd(), fullPath).replace(/\\/g, "/")] = () =>
          import(pathToFileURL(fullPath).href);
      }
    }
  };
  walk(rootDir);
  return modules;
}

const modules = buildModuleMap(path.join(process.cwd(), "convex"));
const MARKER = "SYNTHETIC-MEDIA-DELIVERY";
const SUBJECT = "user_synthetic_media_owner";
const DELIVERY_BASE = "https://synthetic-delivery.test";
const BUCKET = "synthetic-media-bucket";

const ALL_VARIANTS = {
  thumb: "media-thumb.webp",
  card: "media-card.webp",
  detail: "media-detail.webp",
  full: "media-full.webp",
};

type PhotoSpec = {
  key: string;
  caption: string;
  derivativeRefs: Record<string, string>;
  derivativeStatus: "pending" | "ready" | "failed";
};

async function seed(photoSpecs: PhotoSpec[]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: SUBJECT,
      email: `${SUBJECT}@example.test`,
      name: `${MARKER} owner`,
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: `${MARKER} household`,
      createdByUserId: userId,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(userId, { defaultHouseholdId: householdId });
    await ctx.db.insert("householdMemberships", {
      householdId,
      userId,
      role: "owner",
      status: "active",
      apiAccessStatus: "enabled",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const moveId = await ctx.db.insert("moves", {
      householdId,
      title: `${MARKER} move`,
      type: "local",
      status: "planning",
      unitSystem: "imperial",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const itemId = await ctx.db.insert("items", {
      householdId,
      moveId,
      name: `${MARKER} sideboard`,
      normalizedName: "synthetic sideboard",
      quantity: 1,
      status: "active",
      condition: "good",
      disposition: "take",
      weightConfidence: "none",
      volumeConfidence: "none",
      fragility: "low",
      stackable: false,
      hazardousFlag: false,
      highValue: false,
      requiresPersonalTransport: false,
      planningDefaultKeys: [],
      needsReview: false,
      reviewFlags: [],
      aiTags: [],
      createdVia: "manual",
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    const photoIds: string[] = [];
    for (const [index, spec] of photoSpecs.entries()) {
      const photoId = await ctx.db.insert("itemPhotos", {
        householdId,
        moveId,
        itemId,
        documentationProfileTypes: [],
        originalStorageKey: `synthetic/${spec.key}.webp`,
        originalBucket: BUCKET,
        derivativeRefs: spec.derivativeRefs as any,
        cloudflareImageId: spec.key,
        derivativeStatus: spec.derivativeStatus,
        mediaKind: "image",
        mimeType: "image/webp",
        sizeBytes: 4096,
        caption: spec.caption,
        photoType: "other",
        privacyLevel: "private",
        visibilityScope: "private",
        source: "manualUpload",
        exifHandlingStatus: "stripped",
        confidence: "manual",
        verificationStatus: "verified",
        aiProcessed: false,
        uploadedByUserId: userId,
        // Ordered so `by_item_created` desc returns the specs in the order
        // they were written, which keeps the budget assertions readable.
        createdAt: now + (photoSpecs.length - index),
        updatedAt: now,
      });
      photoIds.push(photoId);
    }

    return { userId, householdId, moveId, itemId, photoIds };
  });
  return { t, ...ids };
}

/**
 * Stand in for the storage host. `sizes` maps a photo key to the byte length
 * that host would return per variant, so a test can make `full` oversized and
 * `card` deliverable on the same photo and watch the step-down happen.
 */
function stubDelivery(sizes: Record<string, Partial<Record<string, number>>>) {
  const requested: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const variant = parts[parts.length - 1];
    const key = parts[parts.length - 2];
    requested.push(`${key}:${variant}`);
    const length = sizes[key]?.[variant] ?? 64;
    return new Response(new Uint8Array(length), {
      headers: {
        "content-type": "image/webp",
        "content-length": String(length),
      },
    });
  }) as typeof fetch;
  return requested;
}

function readSummary(result: { __mcpContent: Array<Record<string, unknown>> }) {
  const text = result.__mcpContent.find((block) => block.type === "text");
  return JSON.parse(String((text as any).text));
}

function imageBlocks(result: { __mcpContent: Array<Record<string, unknown>> }) {
  return result.__mcpContent.filter((block) => block.type === "image");
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CLOUDFLARE_IMAGE_DELIVERY_URL = DELIVERY_BASE;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CLOUDFLARE_IMAGE_DELIVERY_URL;
  delete process.env.B2_ENDPOINT;
  delete process.env.B2_BUCKET_NAME;
  delete process.env.B2_APPLICATION_KEY_ID;
  delete process.env.B2_APPLICATION_KEY;
});

describe("private media reaches a connected AI as real bytes", () => {
  it("returns the photo inline, and never a storage location", async () => {
    const fixture = await seed([
      {
        key: "sideboard",
        caption: `${MARKER} sideboard condition`,
        derivativeRefs: ALL_VARIANTS,
        derivativeStatus: "ready",
      },
    ]);
    stubDelivery({ sideboard: { card: 40_000 } });

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      variant: "card",
    });

    const images = imageBlocks(result);
    expect(images).toHaveLength(1);
    expect(typeof (images[0] as any).data).toBe("string");
    expect((images[0] as any).mimeType).toBe("image/webp");

    const summary = readSummary(result);
    expect(summary.returned).toBe(1);
    expect(summary.skipped).toEqual([]);
    expect(summary.images[0].servedVariant).toBe("card");
    expect(summary.images[0].bytes).toBe(40_000);
    expect(summary.images[0].attachedTo).toEqual({
      kind: "item",
      id: String(fixture.itemId),
    });

    // The whole payload — text and image blocks — must not carry a way to
    // reach storage directly.
    const serialized = JSON.stringify(result.__mcpContent);
    expect(serialized).not.toContain(BUCKET);
    expect(serialized).not.toContain(DELIVERY_BASE);
  });

  it("sends a smaller picture rather than no picture when the full size is too big", async () => {
    const fixture = await seed([
      {
        key: "sideboard",
        caption: `${MARKER} label close-up`,
        derivativeRefs: ALL_VARIANTS,
        derivativeStatus: "ready",
      },
    ]);
    const requested = stubDelivery({
      sideboard: {
        full: PER_IMAGE_BYTE_BUDGET + 1,
        detail: PER_IMAGE_BYTE_BUDGET + 1,
        card: 30_000,
      },
    });

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      variant: "full",
    });

    const summary = readSummary(result);
    expect(imageBlocks(result)).toHaveLength(1);
    expect(summary.images[0].servedVariant).toBe("card");
    expect(summary.skipped).toEqual([]);
    expect(requested).toEqual([
      "sideboard:full",
      "sideboard:detail",
      "sideboard:card",
    ]);
  });

  it("stops at the batch ceiling and says so, instead of failing the whole call", async () => {
    const big = 1_400_000;
    const fixture = await seed(
      ["one", "two", "three"].map((key) => ({
        key,
        caption: `${MARKER} ${key}`,
        derivativeRefs: ALL_VARIANTS,
        derivativeStatus: "ready" as const,
      })),
    );
    stubDelivery({
      one: { card: big, thumb: big },
      two: { card: big, thumb: big },
      three: { card: big, thumb: big },
    });

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      limit: 3,
      variant: "card",
    });

    const summary = readSummary(result);
    // Two fit inside the 4 MB batch ceiling; the third does not.
    expect(imageBlocks(result)).toHaveLength(2);
    expect(summary.budget.bytesReturned).toBe(big * 2);
    expect(summary.budget.batchLimitBytes).toBe(TOTAL_BYTE_BUDGET);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0].reason).toBe("budget_exhausted");
    expect(summary.skipped[0].explanation).toMatch(/fewer photos|smaller/i);
    expect(summary.note).toMatch(/size limit/i);
  });

  it("says a photo is still processing rather than dropping it silently", async () => {
    const fixture = await seed([
      {
        key: "fresh-capture",
        caption: `${MARKER} just uploaded`,
        derivativeRefs: {},
        derivativeStatus: "pending",
      },
    ]);
    stubDelivery({});

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      variant: "card",
    });

    const summary = readSummary(result);
    expect(imageBlocks(result)).toHaveLength(0);
    expect(summary.returned).toBe(0);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0].reason).toBe("derivative_not_ready");
    expect(summary.skipped[0].explanation).toMatch(/again shortly/i);
    // The AI must be able to tell "still processing" from "no photo at all".
    expect(summary.note).not.toMatch(/No photos matched/i);
  });

  it("keeps a photo that cannot be delivered visible as a reason, with no storage detail", async () => {
    delete process.env.CLOUDFLARE_IMAGE_DELIVERY_URL;
    const fixture = await seed([
      {
        key: "unreachable",
        caption: `${MARKER} unreachable`,
        derivativeRefs: ALL_VARIANTS,
        derivativeStatus: "ready",
      },
    ]);
    stubDelivery({});

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      variant: "card",
    });

    const summary = readSummary(result);
    expect(imageBlocks(result)).toHaveLength(0);
    expect(summary.skipped[0].reason).toBe("delivery_unavailable");
    expect(JSON.stringify(summary)).not.toMatch(/B2|Backblaze|bucket|key/i);
  });

  it("never returns more images than the server ceiling, whatever the caller asks for", async () => {
    const fixture = await seed(
      Array.from({ length: INLINE_IMAGE_LIMIT + 3 }, (_, index) => ({
        key: `photo-${index}`,
        caption: `${MARKER} ${index}`,
        derivativeRefs: ALL_VARIANTS,
        derivativeStatus: "ready" as const,
      })),
    );
    stubDelivery({});

    const result = await fixture.t.action(internal.mcpToolsImages.getImages, {
      caller: { subject: SUBJECT },
      householdId: fixture.householdId,
      moveId: fixture.moveId,
      filter: { itemId: fixture.itemId },
      limit: 100,
      variant: "card",
    });

    expect(imageBlocks(result).length).toBeLessThanOrEqual(INLINE_IMAGE_LIMIT);
    expect(readSummary(result).budget.maxImagesPerCall).toBe(INLINE_IMAGE_LIMIT);
  });
});

describe("delivery budget rules", () => {
  it("walks the size ladder downward and stops at thumb", () => {
    expect(variantAttemptOrder("full")).toEqual([
      "full",
      "detail",
      "card",
      "thumb",
    ]);
    expect(variantAttemptOrder("card")).toEqual(["card", "thumb"]);
    expect(smallerVariant("thumb")).toBeNull();
  });

  it("reports the reason the AI can act on when several sizes fail", () => {
    expect(moreActionableReason("derivative_not_ready", "budget_exhausted")).toBe(
      "budget_exhausted",
    );
    expect(moreActionableReason("delivery_unavailable", "too_large")).toBe(
      "too_large",
    );
  });

  it("only retries a smaller size when a smaller size could exist", () => {
    expect(
      classifyDeliveryFailure(
        new Error('Photo variant "full" is not available yet (derivative pending).'),
      ),
    ).toEqual({ reason: "derivative_not_ready", retrySmaller: true });
    expect(
      classifyDeliveryFailure(
        new Error("Display derivatives are only available for image evidence."),
      ),
    ).toEqual({ reason: "not_an_image", retrySmaller: false });
    expect(
      classifyDeliveryFailure(new Error("Backblaze B2 is not configured.")),
    ).toEqual({ reason: "delivery_unavailable", retrySmaller: false });
  });

  it("explains every reason in plain language, with no storage vocabulary", () => {
    const reasons = [
      "derivative_not_ready",
      "too_large",
      "budget_exhausted",
      "delivery_unavailable",
      "not_an_image",
      "fetch_failed",
    ] as const;
    for (const reason of reasons) {
      const sentence = explainSkip(reason);
      expect(sentence.length).toBeGreaterThan(20);
      expect(sentence).not.toMatch(/B2|Backblaze|bucket|signed URL|Cloudflare/i);
    }
  });

  it("keeps the batch ceiling above the per-image ceiling", () => {
    expect(TOTAL_BYTE_BUDGET).toBeGreaterThan(PER_IMAGE_BYTE_BUDGET);
    expect(PER_IMAGE_BYTE_BUDGET * INLINE_IMAGE_LIMIT).toBeGreaterThan(
      TOTAL_BYTE_BUDGET,
    );
  });
});
