// @vitest-environment node
import { convexTest } from "convex-test";
import { getFunctionName, type FunctionArgs } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { ActionCtx } from "../../convex/_generated/server";
import { getDisplayUrl, getThumbnailUrls } from "../../convex/photos";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const delivery = "https://thumbnail-proof.example.test";

async function seed(withRecordHistory = false) {
  vi.stubEnv("CLOUDFLARE_IMAGE_DELIVERY_URL", delivery);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ({ db }) => {
    const times = { createdAt: 1, updatedAt: 1 };
    const addUser = (subject: string) => db.insert("users", {
      clerkUserId: subject, email: `${subject}@example.test`, name: subject,
      appRole: "member", status: "active", ...times, lastSeenAt: 1,
    });
    const ownerId = await addUser("synthetic-owner");
    const viewerId = await addUser("synthetic-viewer");
    const householdId = await db.insert("households", {
      name: "Synthetic photo batch", createdByUserId: ownerId, ownerUserId: ownerId, ...times,
    });
    await db.insert("householdMemberships", {
      householdId, userId: ownerId, role: "owner", status: "active",
      apiAccessStatus: "enabled", createdByUserId: ownerId, ...times,
    });
    const move = {
      householdId, title: "Synthetic move", type: "local" as const, status: "planning" as const,
      unitSystem: "imperial" as const, createdByUserId: ownerId, ...times,
    };
    const moveId = await db.insert("moves", move);
    const otherMoveId = await db.insert("moves", move);
    await db.insert("moveParticipants", {
      householdId, moveId, userId: viewerId, role: "viewer", accessKind: "moveOnly",
      participantType: "helper", status: "active", agentAccessStatus: "disabled", ...times,
    });
    const addPhoto = (key: string, overrides: Partial<Doc<"itemPhotos">> = {}) => db.insert("itemPhotos", {
      householdId, moveId, documentationProfileTypes: [],
      originalStorageKey: "original.webp", originalBucket: "synthetic",
      derivativeRefs: { thumb: "thumb.webp", card: "card.webp" },
      cloudflareImageId: key, derivativeStatus: "ready", mediaKind: "image",
      mimeType: "image/webp", sizeBytes: 1, photoType: "other",
      privacyLevel: "normal", visibilityScope: "moveCollaborators",
      source: "manualUpload", exifHandlingStatus: "stripped", confidence: "manual",
      verificationStatus: "verified", aiProcessed: false, uploadedByUserId: ownerId,
      ...times, ...overrides,
    });
    const covers = await Promise.all(Array.from({ length: 10 }, (_, index) => addPhoto(`cover-${index}`)));
    const cardOnly = await addPhoto("card-only", { derivativeRefs: { card: "card.webp" } });
    const restricted = await addPhoto("restricted", { privacyLevel: "sensitive", visibilityScope: "private" });
    const pending = await addPhoto("pending", { derivativeRefs: {}, derivativeStatus: "pending" });
    const audio = await addPhoto("audio", { mediaKind: "audio", mimeType: "audio/mpeg" });
    const archived = await addPhoto("archived", { archivedAt: 2 });
    const foreign = await addPhoto("other-move", { moveId: otherMoveId });
    const box = { householdId, moveId, code: "B-001", status: "open" as const, createdByUserId: ownerId, ...times };
    const boxId = await db.insert("boxes", box);
    const foreignBox = await db.insert("boxes", { ...box, moveId: otherMoveId });
    const archivedBox = await db.insert("boxes", { ...box, archivedAt: 2 });
    const itemId = await db.insert("items", {
      householdId, moveId, name: "Synthetic item", normalizedName: "synthetic item",
      quantity: 1, status: "active", condition: "good", disposition: "take",
      weightConfidence: "none", volumeConfidence: "none", fragility: "low", stackable: false,
      hazardousFlag: false, highValue: false, requiresPersonalTransport: false,
      planningDefaultKeys: [], needsReview: false, reviewFlags: [], aiTags: [],
      createdVia: "manual", createdByUserId: ownerId, updatedByUserId: ownerId, ...times,
    });
    const oldest = await addPhoto("oldest", { boxId, itemId, createdAt: 10 });
    const older = await addPhoto("older", { boxId, itemId, createdAt: 10 });
    const hidden = await addPhoto("hidden", { boxId, itemId, createdAt: 11, visibilityScope: "private" });
    const archivedNewer = await addPhoto("archived-newer", { boxId, itemId, createdAt: 12, archivedAt: 13 });
    const wrongScope = await addPhoto("wrong-scope", { boxId, itemId, createdAt: 13, moveId: otherMoveId });
    const pendingBox = await db.insert("boxes", { ...box, code: "B-002" });
    await addPhoto("pending-box-older", { boxId: pendingBox, createdAt: 10 });
    const pendingCover = await addPhoto("pending-box-newest", {
      boxId: pendingBox, createdAt: 11, derivativeRefs: {}, derivativeStatus: "pending",
    });
    const emptyBoxes = withRecordHistory
      ? await Promise.all(Array.from({ length: 26 }, (_, i) => db.insert("boxes", { ...box, code: `EMPTY-${i}` })))
      : [];
    await addPhoto("archived-target", { boxId: archivedBox });
    await addPhoto("wrong-target", { boxId: foreignBox });
    if (withRecordHistory) {
      for (let index = 0; index < 251; index++) {
        await addPhoto(`unrelated-${index}`, { createdAt: 20 + index });
      }
    }
    return {
      householdId, moveId, covers, cardOnly, restricted, pending, audio, archived, foreign,
      boxId, itemId, foreignBox, archivedBox, oldest, older, hidden, archivedNewer, wrongScope,
      pendingBox, pendingCover, emptyBoxes,
    };
  });
  return {
    ...ids,
    owner: t.withIdentity({ subject: "synthetic-owner" }),
    viewer: t.withIdentity({ subject: "synthetic-viewer" }),
    outsider: t.withIdentity({ subject: "synthetic-outsider" }),
  };
}

afterEach(() => vi.unstubAllEnvs());

it("returns thumbnail capabilities for the same ten photos served by the existing card action", async () => {
  const { owner, householdId, moveId, covers } = await seed();
  const started = Date.now();
  const cards = await Promise.all(covers.map((photoId) =>
    owner.action(api.photos.getDisplayUrl, { householdId, moveId, photoId, variant: "card" }),
  ));
  const thumbs = await owner.action(api.photos.getThumbnailUrls, { householdId, moveId, photoIds: covers });
  expect(cards.map(({ url }) => url)).toEqual(thumbs.map(({ url }) => url.replace(/\/thumb$/, "/card")));
  expect(thumbs.map(({ photoId }) => photoId)).toEqual(covers);
  for (const entry of thumbs) {
    expect(entry.url).toMatch(/\/thumb$/);
    expect(entry.expiresAt).toBeGreaterThanOrEqual(started + 300_000);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
  }
});

it("finds older item and box photos through their own indexes and preserves eligible gallery order", async () => {
  const {
    viewer, owner, outsider, householdId, moveId, boxId, itemId, foreignBox, archivedBox,
    oldest, older, hidden, archivedNewer, wrongScope, emptyBoxes, pendingBox, pendingCover,
  } = await seed(true);
  const scope = { householdId, moveId };
  const capped = await viewer.query(api.photos.listForMove, { ...scope, limit: 250 });
  expect(capped).toHaveLength(250);
  expect(capped.every((photo) => !photo.itemId && !photo.boxId)).toBe(true);

  const targetIds = [...Array(25).fill(boxId), itemId, foreignBox, archivedBox];
  const covers = await viewer.query(api.photos.listRecordCovers, { ...scope, targetIds });
  expect(covers.map(({ targetId, _id }) => [targetId, _id])).toEqual([[boxId, older], [itemId, older]]);
  for (const targetId of [boxId, itemId]) {
    expect(await viewer.query(api.photos.listRecordGallery, { ...scope, targetId })).toEqual([older, oldest]);
  }
  for (const targetId of [foreignBox, archivedBox]) {
    expect(await viewer.query(api.photos.listRecordGallery, { ...scope, targetId })).toEqual([]);
  }
  await expect(viewer.query(api.photos.listRecordGallery, { ...scope, targetId: older as never })).rejects.toThrow();
  await expect(outsider.query(api.photos.listRecordCovers, { ...scope, targetIds })).rejects.toThrow();
  await expect(viewer.query(api.photos.listRecordCovers, { ...scope, targetIds: emptyBoxes })).rejects.toThrow("Too many photo targets.");
  const pending = await viewer.query(api.photos.listRecordCovers, { ...scope, targetIds: [pendingBox] });
  expect(pending).toMatchObject([{ _id: pendingCover, derivativeRefs: {} }]);
  const signed = await viewer.action(api.photos.getThumbnailUrls, {
    ...scope, photoIds: [hidden, archivedNewer, wrongScope, older],
  });
  expect(signed.map(({ photoId }) => photoId)).toEqual([older]);
  expect(await owner.query(api.photos.listRecordGallery, { ...scope, targetId: boxId })).toEqual([hidden, older, oldest]);
});

it("reduces the authorization-query count for ten covers from ten to one", async () => {
  const { owner, householdId, moveId, covers } = await seed();
  // The Convex registration stores the original handler for testing in _handler.
  // Execute it inside convex-test with its real auth and queries, counting calls
  // made by each action. No provider network requests are made by this fixture.
  const queryNames = await owner.action(async (ctx) => {
    const names: string[] = [];
    const countedCtx: ActionCtx = {
      ...ctx,
      runQuery: (ref, args) => {
        names.push(getFunctionName(ref));
        return ctx.runQuery(ref, args);
      },
    };
    const single = getDisplayUrl as unknown as {
      _handler: (ctx: ActionCtx, args: FunctionArgs<typeof api.photos.getDisplayUrl>) => Promise<unknown>;
    };
    const batch = getThumbnailUrls as unknown as {
      _handler: (ctx: ActionCtx, args: FunctionArgs<typeof api.photos.getThumbnailUrls>) => Promise<unknown>;
    };
    for (const photoId of covers) {
      await single._handler(countedCtx, { householdId, moveId, photoId, variant: "card" });
    }
    await batch._handler(countedCtx, { householdId, moveId, photoIds: covers });
    return names;
  });
  expect(queryNames).toEqual([
    ...Array(10).fill("photos:getPhotoForDelivery"),
    "photos:getPhotosForThumbnailDelivery",
  ]);
});

it("applies owner and viewer visibility per photo, retains fallback, and rejects oversized requests", async () => {
  const { owner, viewer, outsider, householdId, moveId, covers, cardOnly, restricted, pending, audio, archived, foreign } = await seed();
  const args = {
    householdId, moveId, photoIds: [restricted, covers[0], archived, foreign, pending, cardOnly, covers[0], audio],
  };
  const ownerResult = await owner.action(api.photos.getThumbnailUrls, args);
  const viewerResult = await viewer.action(api.photos.getThumbnailUrls, args);
  expect(ownerResult.map(({ photoId }) => photoId)).toEqual([restricted, covers[0], cardOnly]);
  expect(viewerResult.map(({ photoId }) => photoId)).toEqual([covers[0], cardOnly]);
  expect(viewerResult[1].url).toBe(`${delivery}/card-only/card`);
  await expect(viewer.action(api.photos.getDisplayUrl, {
    householdId, moveId, photoId: restricted, variant: "thumb",
  })).rejects.toThrow("Photo not found.");
  await expect(outsider.action(api.photos.getThumbnailUrls, args)).rejects.toThrow();
  await expect(owner.action(api.photos.getThumbnailUrls, {
    ...args, photoIds: Array(26).fill(covers[0]),
  })).rejects.toThrow("Too many thumbnails requested.");
});
