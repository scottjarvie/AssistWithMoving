// OAuth MCP gateway IMAGE tools — multi-image in both directions.
//   get_images: pull many photos at once (short-lived display URLs).
//   add_images: upload many base64 photos at once and attach each
//               to an item / box / space / room.
// Gateway tools have no ctx.auth, so we resolve permission from caller.subject
// via the bridge in a helper query, then reuse the existing photo pipeline
// (photos.getDisplayUrl / initUpload / finalizeUpload), which trust the
// household/move ids we pass after that check. Web-API only (fetch + atob), so
// these actions need no Node runtime.
import { ConvexError, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import { assertOAuthImageSource } from "./lib/mcpMediaIngress";
import { imageDimensions } from "./lib/mediaStorage";

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
export const mcpResolvePhotos = query({
  args: mcpResolvePhotosArgs,
  handler: async (ctx, args) => {
    await requireMoveForSubject(
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
          p.archivedAt === undefined,
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
// the agent couldn't fetch). Inline payloads are large, so cap the count and
// fold metadata into a leading text block. See MOVE-326.
const MAX_INLINE_IMAGES = 8;
export const getImages = action({
  args: getImagesArgs,
  handler: async (
    ctx,
    args,
  ): Promise<{
    __mcpContent: Array<Record<string, unknown>>;
  }> => {
    const variant = args.variant ?? "card";
    const cap = Math.min(args.limit ?? 6, MAX_INLINE_IMAGES);
    const photos = await ctx.runQuery(api.mcpToolsImages.mcpResolvePhotos, {
      caller: args.caller,
      householdId: args.householdId,
      moveId: args.moveId,
      filter: args.filter,
      limit: cap,
    });

    const imageBlocks: Array<Record<string, unknown>> = [];
    const summary: Array<{
      photoId: string;
      caption: string | null;
      attachedTo: { kind: string; id: string };
      viewable: boolean;
    }> = [];

    for (const p of photos) {
      let viewable = false;
      try {
        // Bridge-authed: ctx.auth is null in the gateway, so use the
        // subject-authorized delivery path; then fetch the bytes server-side.
        const result = await ctx.runAction(
          internal.photos.getDisplayUrlForSubject,
          {
            householdId: args.householdId,
            moveId: args.moveId,
            photoId: p.photoId as Id<"itemPhotos">,
            variant,
            subject: args.caller.subject,
          },
        );
        const res = await fetch(result.url);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          const mimeType =
            res.headers.get("content-type")?.split(";")[0]?.trim() ||
            result.mimeType ||
            "image/webp";
          imageBlocks.push({
            type: "image",
            data: bytesToBase64(bytes),
            mimeType,
          });
          viewable = true;
        }
      } catch {
        viewable = false;
      }
      summary.push({
        photoId: String(p.photoId),
        caption: p.caption,
        attachedTo: p.attachedTo,
        viewable,
      });
    }

    const text = {
      moveId: String(args.moveId),
      variant,
      returned: imageBlocks.length,
      note:
        imageBlocks.length === 0
          ? "No viewable photos for this filter."
          : "Photos are attached below as inline images.",
      images: summary,
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
export const mcpAssertMoveEditable = query({
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

export const addImages = action({
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
      api.mcpToolsImages.mcpAssertMoveEditable,
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
        const mimeType = image.mimeType ?? "image/jpeg";
        if (image.base64) {
          bytes = bytesFromBase64(image.base64);
        } else {
          throw new ConvexError("Provide base64 image data.");
        }

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
export const attachPhotos = mutation({
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
