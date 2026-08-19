// OAuth MCP gateway IMAGE tools — multi-image in both directions.
//   get_images: pull many photos at once (short-lived display URLs).
//   add_images: upload many base64 photos at once and attach each
//               to an item / box / space / room.
// Gateway tools have no ctx.auth, so we resolve permission from caller.subject
// via the bridge in a helper query, then reuse the existing photo pipeline
// (photos.getDisplayUrl / initUpload / finalizeUpload), which trust the
// household/move ids we pass after that check. Web-API only (fetch + atob), so
// these actions need no Node runtime.
import type { GenericActionCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  type EvidenceSkipReason,
  INLINE_IMAGE_LIMIT,
  PER_IMAGE_BYTE_BUDGET,
  TOTAL_BYTE_BUDGET,
  batchNote,
  classifyDeliveryFailure,
  explainSkip,
  moreActionableReason,
  variantAttemptOrder,
} from "./lib/mcpEvidenceMedia";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import {
  assertOAuthImageBytes,
  assertOAuthImageSource,
} from "./lib/mcpMediaIngress";
import { imageDimensions } from "./lib/mediaStorage";
import type { PhotoDerivativeDisplayVariant } from "./lib/photoDelivery";
import { canViewPhotoAssets } from "./lib/photoVisibility";

const imageFilterValidator = v.object({
  // Pull specific photos by id — e.g. the mediaPhotoIds on a queue capture that
  // isn't an item/box/room yet (the only way to view an unprocessed capture's
  // photos). Takes precedence over the other filters when present.
  photoIds: v.optional(v.array(v.id("itemPhotos"))),
  itemId: v.optional(v.id("items")),
  boxId: v.optional(v.id("boxes")),
  spaceId: v.optional(v.id("moveSpaces")),
  transportId: v.optional(v.id("transportResources")),
  transportZoneId: v.optional(v.id("transportZones")),
  room: v.optional(v.string()),
  all: v.optional(v.boolean()),
});

// Bridge-auth + collect the in-scope photo ids for a filter. Actions can't touch
// ctx.db, so the action calls this query first.
export const mcpResolvePhotosArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  filter: imageFilterValidator,
  limit: v.optional(v.number()),
};
export const mcpResolvePhotos = internalQuery({
  args: mcpResolvePhotosArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const limit = Math.min(args.limit ?? 50, 100);
    let rows;
    if (args.filter.photoIds && args.filter.photoIds.length > 0) {
      const fetched = await Promise.all(
        args.filter.photoIds.slice(0, 100).map((id) => ctx.db.get(id)),
      );
      // The shared post-filter below enforces householdId/moveId/not-archived,
      // so an id from another move can't leak its photo.
      rows = fetched.filter(
        (p): p is NonNullable<typeof p> => p !== null,
      );
    } else if (args.filter.itemId) {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_item_created", (q) => q.eq("itemId", args.filter.itemId))
        .order("desc")
        .take(limit);
    } else if (args.filter.boxId) {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_box_created", (q) => q.eq("boxId", args.filter.boxId))
        .order("desc")
        .take(limit);
    } else if (args.filter.spaceId) {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_space_created", (q) =>
          q.eq("spaceId", args.filter.spaceId),
        )
        .order("desc")
        .take(limit);
    } else if (args.filter.transportZoneId) {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_transport_zone_created", (q) =>
          q.eq("transportZoneId", args.filter.transportZoneId),
        )
        .order("desc")
        .take(limit);
    } else if (args.filter.transportId) {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_transport_resource_created", (q) =>
          q.eq("transportResourceId", args.filter.transportId),
        )
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .take(args.filter.room ? 500 : limit);
      if (args.filter.room) {
        rows = rows.filter((p) => p.room === args.filter.room).slice(0, limit);
      }
    }
    return rows
      .filter(
        (p) =>
          p.householdId === args.householdId &&
          // Scope to THIS move — an itemId/boxId/spaceId/transportId from another
          // move in the same household must not leak its photos across moves.
          p.moveId === args.moveId &&
          p.archivedAt === undefined &&
          canViewPhotoAssets(p, policy.visibility),
      )
      .map((p) => ({
        photoId: p._id,
        caption: p.caption ?? null,
        attachedTo: p.itemId
          ? { kind: "item" as const, id: String(p.itemId) }
          : p.boxId
            ? { kind: "box" as const, id: String(p.boxId) }
            : p.spaceId
              ? { kind: "space" as const, id: String(p.spaceId) }
              : p.transportResourceId
                ? { kind: "transport" as const, id: String(p.transportResourceId) }
                : p.transportZoneId
                  ? { kind: "transportZone" as const, id: String(p.transportZoneId) }
                  : p.room
                    ? { kind: "room" as const, id: p.room }
                    : { kind: "move" as const, id: String(args.moveId) },
      }));
  },
});

// ---- get_images ------------------------------------------------------------
export const getImagesArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  filter: imageFilterValidator,
  limit: v.optional(v.number()),
  // Display resolution: thumb 200px, card 600px (default), detail 1200px,
  // full 2400px. Use detail/full when the agent needs to read fine print.
  variant: v.optional(
    v.union(
      v.literal("thumb"),
      v.literal("card"),
      v.literal("detail"),
      v.literal("full"),
    ),
  ),
};
// Encode bytes to base64 in the Convex runtime (chunked so a large buffer
// doesn't blow the argument spread). btoa is available in the default runtime.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// get_images returns photos as NATIVE inline MCP image blocks — the gateway is
// patched (patches/convex-mcp-gateway+0.4.0.patch) to ship a tool's
// `__mcpContent` array verbatim, so the model SEES the picture in the tool
// result. The server fetches the bytes itself, so it works even when the
// caller's sandbox can't reach the image host (the original failure: a B2 URL
// the agent couldn't fetch). No storage URL ever crosses the boundary.
//
// Delivery is BUDGETED and every omission carries a REASON (see
// lib/mcpEvidenceMedia.ts). Real photos are big: an unbounded batch of `full`
// derivatives can exceed the Convex result limit and fail the entire call, and
// a photo that silently vanishes leaves an AI unable to tell "no photo" from
// "still processing" from "you asked for too much". So an oversized photo steps
// down the size ladder before it is dropped, the batch stops at a total ceiling
// rather than bursting, and anything left out is listed with a sentence saying
// what to do next.

/** One photo's delivery outcome. Bytes, or a reason there are none. */
type DeliveryOutcome =
  | {
      ok: true;
      bytes: Uint8Array;
      mimeType: string;
      servedVariant: PhotoDerivativeDisplayVariant;
    }
  | { ok: false; reason: EvidenceSkipReason };

/**
 * Fetch one photo's bytes, stepping down the size ladder while it does not fit
 * the per-image ceiling or what is left of the batch budget. Returns the first
 * size that fits, or the reason the photo could not be delivered at any size.
 */
async function deliverOnePhoto(
  ctx: GenericActionCtx<DataModel>,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    photoId: Id<"itemPhotos">;
    subject: string;
  },
  requestedVariant: PhotoDerivativeDisplayVariant,
  remainingBudgetBytes: number,
): Promise<DeliveryOutcome> {
  let failure: EvidenceSkipReason | null = null;
  const note = (reason: EvidenceSkipReason) => {
    failure = failure ? moreActionableReason(failure, reason) : reason;
  };

  for (const variant of variantAttemptOrder(requestedVariant)) {
    let url: string;
    let declaredMimeType: string;
    try {
      // Bridge-authed: ctx.auth is null in the gateway, so use the
      // subject-authorized delivery path; then fetch the bytes server-side.
      const result = await ctx.runAction(
        internal.photos.getDisplayUrlForSubject,
        {
          householdId: args.householdId,
          moveId: args.moveId,
          photoId: args.photoId,
          variant,
          subject: args.subject,
        },
      );
      url = result.url;
      declaredMimeType = result.mimeType;
    } catch (error) {
      const classified = classifyDeliveryFailure(error);
      note(classified.reason);
      if (!classified.retrySmaller) {
        return { ok: false, reason: classified.reason };
      }
      continue;
    }

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      note("fetch_failed");
      continue;
    }
    if (!response.ok) {
      note("fetch_failed");
      continue;
    }

    // Trust a declared length enough to skip downloading something we already
    // know we would throw away.
    const declaredLength = Number(response.headers.get("content-length"));
    const ceiling = Math.min(PER_IMAGE_BYTE_BUDGET, remainingBudgetBytes);
    if (Number.isFinite(declaredLength) && declaredLength > ceiling) {
      note(
        declaredLength > PER_IMAGE_BYTE_BUDGET ? "too_large" : "budget_exhausted",
      );
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > PER_IMAGE_BYTE_BUDGET) {
      note("too_large");
      continue;
    }
    if (bytes.byteLength > remainingBudgetBytes) {
      note("budget_exhausted");
      continue;
    }

    return {
      ok: true,
      bytes,
      mimeType:
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        declaredMimeType ||
        "image/webp",
      servedVariant: variant,
    };
  }

  return { ok: false, reason: failure ?? "delivery_unavailable" };
}

export const getImages = internalAction({
  args: getImagesArgs,
  handler: async (
    ctx,
    args,
  ): Promise<{
    __mcpContent: Array<Record<string, unknown>>;
  }> => {
    const variant = args.variant ?? "card";
    const cap = Math.min(args.limit ?? 6, INLINE_IMAGE_LIMIT);
    const photos = await ctx.runQuery(internal.mcpToolsImages.mcpResolvePhotos, {
      caller: args.caller,
      householdId: args.householdId,
      moveId: args.moveId,
      filter: args.filter,
      limit: cap,
    });

    const imageBlocks: Array<Record<string, unknown>> = [];
    const delivered: Array<{
      photoId: string;
      caption: string | null;
      attachedTo: { kind: string; id: string };
      servedVariant: PhotoDerivativeDisplayVariant;
      bytes: number;
    }> = [];
    const skipped: Array<{
      photoId: string;
      caption: string | null;
      attachedTo: { kind: string; id: string };
      reason: EvidenceSkipReason;
      explanation: string;
    }> = [];

    let spentBytes = 0;
    let budgetExhausted = false;

    for (const p of photos) {
      const remaining = TOTAL_BYTE_BUDGET - spentBytes;
      // Nothing useful is left to spend: stop fetching rather than burning
      // round trips on photos that cannot fit.
      const outcome: DeliveryOutcome =
        remaining <= 0
          ? { ok: false, reason: "budget_exhausted" }
          : await deliverOnePhoto(
              ctx,
              {
                householdId: args.householdId,
                moveId: args.moveId,
                photoId: p.photoId as Id<"itemPhotos">,
                subject: args.caller.subject,
              },
              variant,
              remaining,
            );

      if (outcome.ok) {
        spentBytes += outcome.bytes.byteLength;
        imageBlocks.push({
          type: "image",
          data: bytesToBase64(outcome.bytes),
          mimeType: outcome.mimeType,
        });
        delivered.push({
          photoId: String(p.photoId),
          caption: p.caption,
          attachedTo: p.attachedTo,
          servedVariant: outcome.servedVariant,
          bytes: outcome.bytes.byteLength,
        });
        continue;
      }

      if (outcome.reason === "budget_exhausted") budgetExhausted = true;
      skipped.push({
        photoId: String(p.photoId),
        caption: p.caption,
        attachedTo: p.attachedTo,
        reason: outcome.reason,
        explanation: explainSkip(outcome.reason),
      });
    }

    const text = {
      moveId: String(args.moveId),
      requestedVariant: variant,
      returned: imageBlocks.length,
      skippedCount: skipped.length,
      budget: {
        bytesReturned: spentBytes,
        batchLimitBytes: TOTAL_BYTE_BUDGET,
        perImageLimitBytes: PER_IMAGE_BYTE_BUDGET,
        maxImagesPerCall: INLINE_IMAGE_LIMIT,
      },
      note: batchNote({
        returned: imageBlocks.length,
        skipped: skipped.length,
        budgetExhausted,
      }),
      images: delivered,
      skipped,
    };

    return {
      __mcpContent: [
        { type: "text", text: JSON.stringify(text, null, 2) },
        ...imageBlocks,
      ],
    };
  },
});

// ---- add_images ------------------------------------------------------------
const imageInputValidator = v.object({
  url: v.optional(v.string()),
  base64: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  caption: v.optional(v.string()),
  attachTo: v.optional(
    v.object({
      itemId: v.optional(v.id("items")),
      boxId: v.optional(v.id("boxes")),
      spaceId: v.optional(v.id("moveSpaces")),
      transportResourceId: v.optional(v.id("transportResources")),
      transportZoneId: v.optional(v.id("transportZones")),
      room: v.optional(v.string()),
    }),
  ),
});
export const addImagesArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  images: v.array(imageInputValidator),
};

// Permission gate for the upload action (actions can't read ctx.db).
export const mcpAssertMoveEditableArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
};
export const mcpAssertMoveEditable = internalQuery({
  args: mcpAssertMoveEditableArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    return { ok: true, userId: policy.actor.userId };
  },
});

function bytesFromBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export const addImages = internalAction({
  args: addImagesArgs,
  handler: async (
    ctx,
    args,
  ): Promise<{
    results: Array<{
      photoId: string | null;
      ok: boolean;
      error?: string;
    }>;
  }> => {
    const { userId } = await ctx.runQuery(
      internal.mcpToolsImages.mcpAssertMoveEditable,
      {
        caller: args.caller,
        householdId: args.householdId,
        moveId: args.moveId,
      },
    );
    // Bridge-authed: ctx.auth is null in the gateway, so the upload pipeline
    // can't run its ctx.auth permission check. We already authorized via the
    // subject bridge above, so pass the resolved user as the API actor to the
    // internal-only *ForActor entry points (these skip the ctx.auth check).
    const apiActor = { apiKeyId: "mcp-oauth", createdByUserId: userId };

    const results: Array<{ photoId: string | null; ok: boolean; error?: string }> =
      [];

    for (const image of args.images) {
      try {
        assertOAuthImageSource(image);
        let bytes: Uint8Array;
        if (image.base64) {
          bytes = bytesFromBase64(image.base64);
        } else {
          throw new ConvexError("Provide base64 image data.");
        }
        const mimeType = assertOAuthImageBytes(bytes, image.mimeType);

        // completeUploadSession requires positive width/height for images, but
        // the gateway has no Sharp/Node runtime. Read the dimensions from the
        // raw bytes (same pure parser the REST upload path uses) before init.
        // Normalize the mime type first ("image/JPEG", "image/png; charset=..")
        // so the parser's exact switch still matches.
        const dims = imageDimensions(
          bytes,
          mimeType.toLowerCase().split(";")[0].trim(),
        );
        if (!dims) {
          results.push({
            photoId: null,
            ok: false,
            error: "Could not read image dimensions.",
          });
          continue;
        }

        const init = await ctx.runAction(internal.photos.initUploadForActor, {
          householdId: args.householdId,
          moveId: args.moveId,
          itemId: image.attachTo?.itemId,
          boxId: image.attachTo?.boxId,
          spaceId: image.attachTo?.spaceId,
          transportResourceId: image.attachTo?.transportResourceId,
          transportZoneId: image.attachTo?.transportZoneId,
          room: image.attachTo?.room,
          mimeType,
          sizeBytes: bytes.byteLength,
          apiActor,
        });

        const put = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: init.headers,
          body: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
        });
        if (!put.ok) throw new ConvexError(`upload PUT failed (${put.status})`);

        const finalized = await ctx.runAction(
          internal.photos.finalizeUploadForActor,
          {
            householdId: args.householdId,
            moveId: args.moveId,
            uploadSessionId: init.uploadSessionId as Id<"photoUploadSessions">,
            width: dims.width,
            height: dims.height,
            caption: image.caption,
            source: "mcp",
            apiActor,
          },
        );
        results.push({ photoId: String(finalized.photoId), ok: true });
      } catch (error) {
        results.push({
          photoId: null,
          ok: false,
          error: error instanceof Error ? error.message : "upload failed",
        });
      }
    }

    return { results };
  },
});

// ---- attach_photos ---------------------------------------------------------
// Re-attach EXISTING photos (by id) to an item / box / room / transport. Lets an
// agent file a queued capture's already-uploaded photos onto the room or
// transport its queue entry targets. Mirrors photos.updateEvidence's
// target-setting over the subject bridge.
const photoTargetValidator = v.object({
  itemId: v.optional(v.id("items")),
  boxId: v.optional(v.id("boxes")),
  spaceId: v.optional(v.id("moveSpaces")),
  transportResourceId: v.optional(v.id("transportResources")),
  transportZoneId: v.optional(v.id("transportZones")),
  room: v.optional(v.string()),
});
export const attachPhotosArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  photoIds: v.array(v.id("itemPhotos")),
  attachTo: photoTargetValidator,
};
export const attachPhotos = internalMutation({
  args: attachPhotosArgs,
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );

    // Validate any provided target belongs to this move AND isn't
    // archived/deleted (no cross-tenant refs, no re-filing onto dead targets).
    // Mirrors photos.assertPhotoTargets' per-type guards.
    const t = args.attachTo;
    if (t.itemId) {
      const item = await ctx.db.get(t.itemId);
      if (!item || item.moveId !== args.moveId || item.deletedAt) {
        throw new ConvexError("Target item is not part of this move.");
      }
    }
    if (t.boxId) {
      const box = await ctx.db.get(t.boxId);
      if (!box || box.moveId !== args.moveId || box.archivedAt) {
        throw new ConvexError("Target box is not part of this move.");
      }
    }
    if (t.spaceId) {
      const space = await ctx.db.get(t.spaceId);
      if (
        !space ||
        space.moveId !== args.moveId ||
        space.status === "archived"
      ) {
        throw new ConvexError("Target room is not part of this move.");
      }
    }
    if (t.transportResourceId) {
      const resource = await ctx.db.get(t.transportResourceId);
      if (
        !resource ||
        resource.moveId !== args.moveId ||
        resource.archivedAt
      ) {
        throw new ConvexError("Target transport is not part of this move.");
      }
    }
    if (t.transportZoneId) {
      const zone = await ctx.db.get(t.transportZoneId);
      if (!zone || zone.moveId !== args.moveId || zone.archivedAt) {
        throw new ConvexError("Target transport zone is not part of this move.");
      }
    }

    const now = Date.now();
    const results: Array<{ photoId: string; ok: boolean; error?: string }> = [];
    for (const photoId of args.photoIds) {
      const photo = await ctx.db.get(photoId);
      if (
        !photo ||
        photo.householdId !== args.householdId ||
        photo.moveId !== args.moveId ||
        photo.archivedAt
      ) {
        results.push({
          photoId: String(photoId),
          ok: false,
          error: "Photo not found in this move.",
        });
        continue;
      }
      const patch: Partial<Doc<"itemPhotos">> = { updatedAt: now };
      if (t.itemId !== undefined) patch.itemId = t.itemId;
      if (t.boxId !== undefined) patch.boxId = t.boxId;
      if (t.spaceId !== undefined) patch.spaceId = t.spaceId;
      if (t.transportResourceId !== undefined) {
        patch.transportResourceId = t.transportResourceId;
      }
      if (t.transportZoneId !== undefined) {
        patch.transportZoneId = t.transportZoneId;
      }
      if (t.room !== undefined) patch.room = t.room.trim() || undefined;
      await ctx.db.patch(photoId, patch);
      results.push({ photoId: String(photoId), ok: true });
    }
    return { results };
  },
});
