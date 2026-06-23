// OAuth MCP gateway IMAGE tools — multi-image in both directions.
//   get_images: pull many photos at once (short-lived display URLs).
//   add_images: upload many photos at once (from URL or base64) and attach each
//               to an item / box / space / room.
// Gateway tools have no ctx.auth, so we resolve permission from caller.subject
// via the bridge in a helper query, then reuse the existing photo pipeline
// (photos.getDisplayUrl / initUpload / finalizeUpload), which trust the
// household/move ids we pass after that check. Web-API only (fetch + atob), so
// these actions need no Node runtime.
import { v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, query } from "./_generated/server";
import { requireMoveForSubject } from "./lib/mcpIdentity";

const imageFilterValidator = v.object({
  itemId: v.optional(v.id("items")),
  boxId: v.optional(v.id("boxes")),
  spaceId: v.optional(v.id("moveSpaces")),
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
    if (args.filter.itemId) {
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
        (p) => p.householdId === args.householdId && p.archivedAt === undefined,
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
};
export const getImages = action({
  args: getImagesArgs,
  handler: async (
    ctx,
    args,
  ): Promise<{
    images: Array<{
      photoId: string;
      displayUrl: string | null;
      caption: string | null;
      attachedTo: { kind: string; id: string };
    }>;
  }> => {
    const photos = await ctx.runQuery(api.mcpToolsImages.mcpResolvePhotos, {
      caller: args.caller,
      householdId: args.householdId,
      moveId: args.moveId,
      filter: args.filter,
      limit: args.limit,
    });
    const images = await Promise.all(
      photos.map(async (p) => {
        let displayUrl: string | null = null;
        try {
          const result = await ctx.runAction(api.photos.getDisplayUrl, {
            householdId: args.householdId,
            moveId: args.moveId,
            photoId: p.photoId as Id<"itemPhotos">,
            variant: "card",
          });
          displayUrl = result.url;
        } catch {
          displayUrl = null;
        }
        return {
          photoId: String(p.photoId),
          displayUrl,
          caption: p.caption,
          attachedTo: p.attachedTo,
        };
      }),
    );
    return { images };
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
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    return { ok: true };
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
    await ctx.runQuery(api.mcpToolsImages.mcpAssertMoveEditable, {
      caller: args.caller,
      householdId: args.householdId,
      moveId: args.moveId,
    });

    const results: Array<{ photoId: string | null; ok: boolean; error?: string }> =
      [];

    for (const image of args.images) {
      try {
        let bytes: Uint8Array;
        let mimeType = image.mimeType ?? "image/jpeg";
        if (image.url) {
          const res = await fetch(image.url);
          if (!res.ok) throw new Error(`fetch failed (${res.status})`);
          mimeType = image.mimeType ?? res.headers.get("content-type") ?? mimeType;
          bytes = new Uint8Array(await res.arrayBuffer());
        } else if (image.base64) {
          bytes = bytesFromBase64(image.base64);
        } else {
          throw new Error("Provide url or base64.");
        }

        const init = await ctx.runAction(api.photos.initUpload, {
          householdId: args.householdId,
          moveId: args.moveId,
          itemId: image.attachTo?.itemId,
          boxId: image.attachTo?.boxId,
          spaceId: image.attachTo?.spaceId,
          room: image.attachTo?.room,
          mimeType,
          sizeBytes: bytes.byteLength,
        });

        const put = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: init.headers,
          body: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
        });
        if (!put.ok) throw new Error(`upload PUT failed (${put.status})`);

        const finalized = await ctx.runAction(api.photos.finalizeUpload, {
          householdId: args.householdId,
          moveId: args.moveId,
          uploadSessionId: init.uploadSessionId as Id<"photoUploadSessions">,
          caption: image.caption,
          source: "mcp",
        });
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
