import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordRoomReceipt } from "../lib/roomHistory";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  normalizeOptionalText,
  normalizeSortOrder,
} from "../lib/moveFields";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import {
  safeItem,
  safeMoveSpace,
  safeSaleListing,
} from "../lib/rest/safe";
import { auditApiWrite } from "../lib/rest/audit";
import {
  optionalNumber,
  asString,
  optionalString,
  requiredBodyString,
  parseMoveSpaceKind,
  parseMoveSpaceStatus,
  parseCapacity,
  parseStringArray,
} from "../lib/rest/parse";
import { saleListingPatchFromBody } from "../lib/rest/patch";

export async function routeMoveSpaces(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  spaceIdSegment?: string
) {
  if (args.method === "GET" && !spaceIdSegment) {
    const spaces = await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        spaces
          .filter((space) => space.householdId === auth.householdId)
          .filter((space) => space.status !== "archived")
          .map((space) => safeMoveSpace(space, auth.visibility.privateNotes)),
        args.query,
      ),
    );
  }

  if (args.method === "POST" && !spaceIdSegment) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const name = requiredBodyString(body.name, "name is required.");
    const kind = parseMoveSpaceKind(body.kind) ?? "custom";
    const spaceId = await ctx.db.insert("moveSpaces", {
      householdId: auth.householdId,
      moveId,
      kind,
      name,
      aliases: parseStringArray(body.aliases) ?? [],
      notes: normalizeOptionalText(asString(body.notes)),
      floorLevel: normalizeOptionalText(asString(body.floorLevel)),
      sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
      status: "active",
      transportResourceId: optionalString(body.transportResourceId) as
        | Id<"transportResources">
        | undefined,
      transportZoneId: optionalString(body.transportZoneId) as
        | Id<"transportZones">
        | undefined,
      linkedPlanEntityId: optionalString(body.linkedPlanEntityId) as
        | Id<"planEntities">
        | undefined,
      capacity: parseCapacity(body.capacity) ?? {},
      createdByUserId: auth.createdByUserId,
      createdByApiKeyId: auth.apiKeyId,
      updatedByApiKeyId: auth.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await recordRoomReceipt(ctx, { lane: "rest", userId: auth.createdByUserId, keyId: auth.apiKeyId }, spaceId, null, {
      action: "space.api_created",
      metadata: { name, kind },
    });
    const created = await ctx.db.get(spaceId);
    return restOk({ data: created ? safeMoveSpace(created, auth.visibility.privateNotes) : { spaceId } }, 201);
  }

  if ((args.method === "PATCH" || args.method === "PUT") && spaceIdSegment) {
    const spaceId = spaceIdSegment as Id<"moveSpaces">;
    const space = await ctx.db.get(spaceId);
    if (!space || space.householdId !== auth.householdId || space.moveId !== moveId) {
      return restError({ status: 404, code: "not_found", message: "Space not found." });
    }
    const body = bodyObject(args.body);
    const patch: Partial<Doc<"moveSpaces">> = {
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: Date.now(),
    };
    if (body.kind !== undefined) patch.kind = parseMoveSpaceKind(body.kind) ?? space.kind;
    if (body.name !== undefined) patch.name = requiredBodyString(body.name, "name cannot be empty.");
    if (body.aliases !== undefined) patch.aliases = parseStringArray(body.aliases) ?? [];
    if (body.notes !== undefined) patch.notes = normalizeOptionalText(asString(body.notes));
    if (body.floorLevel !== undefined) {
      patch.floorLevel = normalizeOptionalText(asString(body.floorLevel));
    }
    if (body.sortOrder !== undefined) patch.sortOrder = normalizeSortOrder(optionalNumber(body.sortOrder));
    if (body.status !== undefined) {
      patch.status = parseMoveSpaceStatus(body.status) ?? space.status;
      patch.archivedAt = patch.status === "archived" ? Date.now() : undefined;
    }
    if (body.capacity !== undefined) patch.capacity = parseCapacity(body.capacity) ?? {};
    await ctx.db.patch(spaceId, patch);
    await recordRoomReceipt(ctx, { lane: "rest", userId: auth.createdByUserId, keyId: auth.apiKeyId }, spaceId, space, {
      action: "space.api_updated",
      metadata: { changedKeys: Object.keys(patch) },
    });
    const updated = await ctx.db.get(spaceId);
    return restOk({ data: updated ? safeMoveSpace(updated, auth.visibility.privateNotes) : { spaceId } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Space route not found.",
  });
}

export async function routeSaleListings(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  listingIdSegment?: string
) {
  if (args.method === "GET" && !listingIdSegment) {
    const [listings, items, photos] = await Promise.all([
      ctx.db
        .query("saleListings")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_disposition", (q) =>
          q.eq("moveId", moveId).eq("disposition", "sell"),
        )
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
        .collect(),
    ]);
    const listingByItemId = new Map(
      listings
        .filter((listing) => listing.householdId === auth.householdId)
        .filter((listing) => !listing.archivedAt)
        .map((listing) => [String(listing.itemId), listing]),
    );
    const photoCounts = new Map<string, number>();
    for (const photo of photos) {
      if (photo.householdId !== auth.householdId || photo.archivedAt || !photo.itemId) {
        continue;
      }
      photoCounts.set(
        String(photo.itemId),
        (photoCounts.get(String(photo.itemId)) ?? 0) + 1,
      );
    }
    return restOk(
      paginate(
        items
          .filter((item) => item.householdId === auth.householdId && !item.deletedAt)
          .map((item) => ({
            item: safeItem(item, auth.visibility),
            photoCount: photoCounts.get(String(item._id)) ?? 0,
            listing: listingByItemId.get(String(item._id))
              ? safeSaleListing(listingByItemId.get(String(item._id))!)
              : undefined,
          })),
        args.query,
      ),
    );
  }

  if (args.method === "POST" && !listingIdSegment) {
    const body = bodyObject(args.body);
    const itemId = requiredBodyString(body.itemId, "itemId is required.") as Id<"items">;
    const item = await ctx.db.get(itemId);
    if (!item || item.householdId !== auth.householdId || item.moveId !== moveId || item.deletedAt) {
      return restError({ status: 404, code: "not_found", message: "Item not found." });
    }
    const existing = (
      await ctx.db
        .query("saleListings")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect()
    ).find((listing) => !listing.archivedAt);
    const patch = saleListingPatchFromBody(body, auth);
    const now = Date.now();
    let listingId: Id<"saleListings">;
    if (existing) {
      listingId = existing._id;
      await ctx.db.patch(listingId, {
        ...patch,
        updatedByApiKeyId: auth.apiKeyId,
        updatedAt: now,
      });
    } else {
      listingId = await ctx.db.insert("saleListings", {
        householdId: auth.householdId,
        moveId,
        itemId,
        status: "needsPrep",
        platform: "facebookMarketplace",
        listingTitle: item.name,
        listingDescription: item.description,
        category: item.category,
        condition: item.condition === "unknown" ? undefined : item.condition,
        locationLabel: item.room,
        selectedPhotoIds: [],
        currency: "USD",
        pricingConfidence: "none",
        userOverrodePrice: false,
        researchDepth: "none",
        researchSourceCount: 0,
        researchSources: [],
        interestedCount: 0,
        needsMorePhotos: true,
        createdByApiKeyId: auth.apiKeyId,
        updatedByApiKeyId: auth.apiKeyId,
        createdAt: now,
        updatedAt: now,
        ...patch,
      });
      if (item.disposition !== "sell") {
        await ctx.db.patch(itemId, {
          disposition: "sell",
          updatedByUserId: item.updatedByUserId,
          updatedAt: now,
        });
      }
    }
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      existing ? "sale_listing.api_updated" : "sale_listing.api_created",
      "saleListings",
      listingId,
      { itemId },
    );
    const listing = await ctx.db.get(listingId);
    return restOk({ data: listing ? safeSaleListing(listing) : { listingId } }, existing ? 200 : 201);
  }

  if ((args.method === "PATCH" || args.method === "PUT") && listingIdSegment) {
    const listingId = listingIdSegment as Id<"saleListings">;
    const listing = await ctx.db.get(listingId);
    if (!listing || listing.householdId !== auth.householdId || listing.moveId !== moveId || listing.archivedAt) {
      return restError({
        status: 404,
        code: "not_found",
        message: "Sale listing not found.",
      });
    }
    const patch = saleListingPatchFromBody(bodyObject(args.body), auth);
    await ctx.db.patch(listingId, {
      ...patch,
      updatedByApiKeyId: auth.apiKeyId,
      updatedAt: Date.now(),
    });
    await auditApiWrite(ctx, auth, moveId, "sale_listing.api_updated", "saleListings", listingId, {
      changedKeys: Object.keys(patch),
    });
    const updated = await ctx.db.get(listingId);
    return restOk({ data: updated ? safeSaleListing(updated) : { listingId } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Sale listing route not found.",
  });
}
