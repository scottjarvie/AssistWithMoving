import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  estimateConfidenceValidator,
  normalizeOptionalText,
  saleListingPlatformValidator,
  saleListingStatusValidator,
  saleResearchDepthValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const researchSourceValidator = v.object({
  title: v.optional(v.string()),
  url: v.optional(v.string()),
  summary: v.optional(v.string()),
  priceCents: v.optional(v.number()),
  checkedAt: v.optional(v.number()),
});

const saleListingPatchArgs = {
  status: v.optional(saleListingStatusValidator),
  platform: v.optional(saleListingPlatformValidator),
  platformLabel: v.optional(v.string()),
  listingTitle: v.optional(v.string()),
  listingDescription: v.optional(v.string()),
  category: v.optional(v.string()),
  condition: v.optional(v.string()),
  locationLabel: v.optional(v.string()),
  selectedPhotoIds: v.optional(v.array(v.id("itemPhotos"))),
  listingUrl: v.optional(v.string()),
  listedAt: v.optional(v.number()),
  lastRefreshedAt: v.optional(v.number()),
  suggestedPriceLowCents: v.optional(v.number()),
  suggestedPriceHighCents: v.optional(v.number()),
  officialPriceCents: v.optional(v.number()),
  clearOfficialPrice: v.optional(v.boolean()),
  currency: v.optional(v.string()),
  pricingConfidence: v.optional(estimateConfidenceValidator),
  priceDecisionSource: v.optional(v.string()),
  userOverrodePrice: v.optional(v.boolean()),
  researchDepth: v.optional(saleResearchDepthValidator),
  researchSourceCount: v.optional(v.number()),
  researchSources: v.optional(v.array(researchSourceValidator)),
  researchedAt: v.optional(v.number()),
  researchedByLabel: v.optional(v.string()),
  researchNotes: v.optional(v.string()),
  interestedCount: v.optional(v.number()),
  inquiryNotes: v.optional(v.string()),
  offerNotes: v.optional(v.string()),
  buyerNotes: v.optional(v.string()),
  pickupStatus: v.optional(v.string()),
  soldPriceCents: v.optional(v.number()),
  soldAt: v.optional(v.number()),
  needsMorePhotos: v.optional(v.boolean()),
};

function defaultListingForItem({
  householdId,
  moveId,
  item,
  userId,
  now,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  item: Doc<"items">;
  userId: Id<"users">;
  now: number;
}): Omit<Doc<"saleListings">, "_id" | "_creationTime"> {
  return {
    householdId,
    moveId,
    itemId: item._id,
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
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCurrency(value: string | undefined) {
  const normalized = normalizeOptionalText(value)?.toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normalizeSources(
  sources: Array<{
    title?: string;
    url?: string;
    summary?: string;
    priceCents?: number;
    checkedAt?: number;
  }> | undefined,
) {
  return (sources ?? []).slice(0, 25).map((source) => ({
    title: normalizeOptionalText(source.title),
    url: normalizeOptionalText(source.url),
    summary: normalizeOptionalText(source.summary),
    priceCents: source.priceCents,
    checkedAt: source.checkedAt,
  }));
}

export function assertPriceCents(value: number | undefined, label: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new ConvexError(
      `${label} must be a non-negative whole number of cents.`,
    );
  }
}

async function assertSelectedPhotos(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    itemId: Id<"items">;
    selectedPhotoIds?: Id<"itemPhotos">[];
  },
) {
  if (!args.selectedPhotoIds?.length) return;
  for (const photoId of args.selectedPhotoIds) {
    const photo = await ctx.db.get(photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.itemId !== args.itemId ||
      photo.archivedAt
    ) {
      throw new Error("Selected listing photo is not available for this item.");
    }
  }
}

function listingPatch(args: Record<string, unknown>): Partial<Doc<"saleListings">> {
  const patch: Partial<Doc<"saleListings">> = {};
  if (args.status !== undefined) {
    patch.status = args.status as Doc<"saleListings">["status"];
  }
  if (args.platform !== undefined) {
    patch.platform = args.platform as Doc<"saleListings">["platform"];
  }
  if (args.platformLabel !== undefined) {
    patch.platformLabel = normalizeOptionalText(args.platformLabel as string);
  }
  if (args.listingTitle !== undefined) {
    patch.listingTitle = normalizeOptionalText(args.listingTitle as string);
  }
  if (args.listingDescription !== undefined) {
    patch.listingDescription = normalizeOptionalText(
      args.listingDescription as string,
    );
  }
  if (args.category !== undefined) {
    patch.category = normalizeOptionalText(args.category as string);
  }
  if (args.condition !== undefined) {
    patch.condition = normalizeOptionalText(args.condition as string);
  }
  if (args.locationLabel !== undefined) {
    patch.locationLabel = normalizeOptionalText(args.locationLabel as string);
  }
  if (args.selectedPhotoIds !== undefined) {
    patch.selectedPhotoIds = args.selectedPhotoIds as Id<"itemPhotos">[];
  }
  if (args.listingUrl !== undefined) {
    patch.listingUrl = normalizeOptionalText(args.listingUrl as string);
  }
  if (args.listedAt !== undefined) patch.listedAt = args.listedAt as number;
  if (args.lastRefreshedAt !== undefined) {
    patch.lastRefreshedAt = args.lastRefreshedAt as number;
  }
  if (args.suggestedPriceLowCents !== undefined) {
    assertPriceCents(args.suggestedPriceLowCents as number, "Suggested low price");
    patch.suggestedPriceLowCents = args.suggestedPriceLowCents as number;
  }
  if (args.suggestedPriceHighCents !== undefined) {
    assertPriceCents(
      args.suggestedPriceHighCents as number,
      "Suggested high price",
    );
    patch.suggestedPriceHighCents = args.suggestedPriceHighCents as number;
  }
  if (args.officialPriceCents !== undefined) {
    assertPriceCents(args.officialPriceCents as number, "Official price");
    patch.officialPriceCents = args.officialPriceCents as number;
  }
  if (args.clearOfficialPrice) {
    patch.officialPriceCents = undefined;
  }
  if (args.currency !== undefined) {
    patch.currency = normalizeCurrency(args.currency as string);
  }
  if (args.pricingConfidence !== undefined) {
    patch.pricingConfidence =
      args.pricingConfidence as Doc<"saleListings">["pricingConfidence"];
  }
  if (args.priceDecisionSource !== undefined) {
    patch.priceDecisionSource = normalizeOptionalText(
      args.priceDecisionSource as string,
    );
  }
  if (args.userOverrodePrice !== undefined) {
    patch.userOverrodePrice = Boolean(args.userOverrodePrice);
  }
  if (args.researchDepth !== undefined) {
    patch.researchDepth = args.researchDepth as Doc<"saleListings">["researchDepth"];
  }
  if (args.researchSourceCount !== undefined) {
    patch.researchSourceCount = Math.max(
      0,
      Math.floor(args.researchSourceCount as number),
    );
  }
  if (args.researchSources !== undefined) {
    patch.researchSources = normalizeSources(
      args.researchSources as Doc<"saleListings">["researchSources"],
    );
    patch.researchSourceCount =
      patch.researchSourceCount ?? patch.researchSources.length;
  }
  if (args.researchedAt !== undefined) {
    patch.researchedAt = args.researchedAt as number;
  }
  if (args.researchedByLabel !== undefined) {
    patch.researchedByLabel = normalizeOptionalText(args.researchedByLabel as string);
  }
  if (args.researchNotes !== undefined) {
    patch.researchNotes = normalizeOptionalText(args.researchNotes as string);
  }
  if (args.interestedCount !== undefined) {
    patch.interestedCount = Math.max(0, Math.floor(args.interestedCount as number));
  }
  if (args.inquiryNotes !== undefined) {
    patch.inquiryNotes = normalizeOptionalText(args.inquiryNotes as string);
  }
  if (args.offerNotes !== undefined) {
    patch.offerNotes = normalizeOptionalText(args.offerNotes as string);
  }
  if (args.buyerNotes !== undefined) {
    patch.buyerNotes = normalizeOptionalText(args.buyerNotes as string);
  }
  if (args.pickupStatus !== undefined) {
    patch.pickupStatus = normalizeOptionalText(args.pickupStatus as string);
  }
  if (args.soldPriceCents !== undefined) {
    assertPriceCents(args.soldPriceCents as number, "Sold price");
    patch.soldPriceCents = args.soldPriceCents as number;
  }
  if (args.soldAt !== undefined) patch.soldAt = args.soldAt as number;
  if (args.needsMorePhotos !== undefined) {
    patch.needsMorePhotos = Boolean(args.needsMorePhotos);
  }
  return patch;
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    includeNonSellItems: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const [items, listings, photos] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("saleListings")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

    const listingByItemId = new Map(
      listings
        .filter((listing) => listing.householdId === args.householdId)
        .filter((listing) => !listing.archivedAt)
        .map((listing) => [String(listing.itemId), listing]),
    );
    const photosByItemId = new Map<string, Doc<"itemPhotos">[]>();
    for (const photo of photos) {
      if (
        photo.householdId !== args.householdId ||
        photo.archivedAt ||
        !photo.itemId
      ) {
        continue;
      }
      const key = String(photo.itemId);
      photosByItemId.set(key, [...(photosByItemId.get(key) ?? []), photo]);
    }

    return items
      .filter((item) => item.householdId === args.householdId)
      .filter((item) => !item.deletedAt)
      .filter((item) =>
        args.includeNonSellItems ? true : item.disposition === "sell",
      )
      .map((item) => {
        const listing = listingByItemId.get(String(item._id));
        const itemPhotos = photosByItemId.get(String(item._id)) ?? [];
        return {
          item,
          listing,
          photoCount: itemPhotos.length,
          selectedPhotoCount: listing?.selectedPhotoIds.length ?? 0,
          needsMorePhotos: listing?.needsMorePhotos ?? itemPhotos.length < 3,
          researchSourceCount: listing?.researchSourceCount ?? 0,
          researchDepth: listing?.researchDepth ?? "none",
          status: listing?.status ?? "needsPrep",
        };
      });
  },
});

export const ensureForMove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const [items, listings, photos] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_disposition", (q) =>
          q.eq("moveId", args.moveId).eq("disposition", "sell"),
        )
        .collect(),
      ctx.db
        .query("saleListings")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);
    const existingItemIds = new Set(
      listings
        .filter((listing) => listing.householdId === args.householdId)
        .filter((listing) => !listing.archivedAt)
        .map((listing) => String(listing.itemId)),
    );
    const photoCountByItem = new Map<string, number>();
    for (const photo of photos) {
      if (
        photo.householdId !== args.householdId ||
        photo.archivedAt ||
        !photo.itemId
      ) {
        continue;
      }
      photoCountByItem.set(
        String(photo.itemId),
        (photoCountByItem.get(String(photo.itemId)) ?? 0) + 1,
      );
    }

    const now = Date.now();
    const createdIds: Id<"saleListings">[] = [];
    for (const item of items) {
      if (
        item.householdId !== args.householdId ||
        item.deletedAt ||
        existingItemIds.has(String(item._id))
      ) {
        continue;
      }
      const listing = defaultListingForItem({
        householdId: args.householdId,
        moveId: args.moveId,
        item,
        userId: actor.userId,
        now,
      });
      createdIds.push(
        await ctx.db.insert("saleListings", {
          ...listing,
          needsMorePhotos: (photoCountByItem.get(String(item._id)) ?? 0) < 3,
        }),
      );
    }

    if (createdIds.length) {
      await recordAuditEvent(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        actorType: "user",
        actorUserId: actor.userId,
        category: "inventory",
        action: "sale_listings.ensured",
        objectTable: "saleListings",
        metadata: { createdCount: createdIds.length },
      });
    }
    return createdIds;
  },
});

export const upsertForItem = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    ...saleListingPatchArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt
    ) {
      throw new Error("Item not found.");
    }
    await assertSelectedPhotos(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      itemId: args.itemId,
      selectedPhotoIds: args.selectedPhotoIds,
    });

    const existing = (
      await ctx.db
        .query("saleListings")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .collect()
    ).find((listing) => !listing.archivedAt);
    const now = Date.now();
    const patch = listingPatch(args);
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        updatedByUserId: actor.userId,
        updatedAt: now,
      });
      return existing._id;
    }

    const listingId = await ctx.db.insert("saleListings", {
      ...defaultListingForItem({
        householdId: args.householdId,
        moveId: args.moveId,
        item,
        userId: actor.userId,
        now,
      }),
      ...patch,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.itemId, {
      disposition: "sell",
      updatedByUserId: actor.userId,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "sale_listing.upserted",
      objectTable: "saleListings",
      objectId: listingId,
      metadata: { itemId: args.itemId },
    });
    return listingId;
  },
});

// Lightweight read of a single item's active sale listing (price + status), for
// the inline asking-price control in the item detail. Null when there's none yet.
export const getForItem = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const listing = (
      await ctx.db
        .query("saleListings")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .collect()
    ).find((entry) => !entry.archivedAt);
    if (!listing) return null;
    if (
      listing.householdId !== args.householdId ||
      listing.moveId !== args.moveId
    ) {
      return null;
    }
    return {
      officialPriceCents: listing.officialPriceCents ?? null,
      soldPriceCents: listing.soldPriceCents ?? null,
      status: listing.status,
    };
  },
});

// Mark a sell item SOLD: record the sale on its listing (status sold + soldAt +
// soldPriceCents, defaulting to the asking price) and ARCHIVE the item — once
// it's sold we don't own it anymore, so it leaves the active inventory.
export const markSold = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    soldPriceCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt
    ) {
      throw new Error("Item not found.");
    }
    const now = Date.now();
    const existing = (
      await ctx.db
        .query("saleListings")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .collect()
    ).find((listing) => !listing.archivedAt);
    // The asking price is the default sale amount unless an actual amount is given.
    const soldPriceCents =
      args.soldPriceCents ?? existing?.officialPriceCents ?? undefined;
    assertPriceCents(soldPriceCents, "Sold price");

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "sold",
        soldAt: now,
        ...(soldPriceCents !== undefined ? { soldPriceCents } : {}),
        updatedByUserId: actor.userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("saleListings", {
        ...defaultListingForItem({
          householdId: args.householdId,
          moveId: args.moveId,
          item,
          userId: actor.userId,
          now,
        }),
        status: "sold",
        soldAt: now,
        ...(soldPriceCents !== undefined
          ? { officialPriceCents: soldPriceCents, soldPriceCents }
          : {}),
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.itemId, {
      disposition: "sell",
      status: "archived",
      deletedAt: now,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "item.sold",
      objectTable: "items",
      objectId: args.itemId,
      metadata: { soldPriceCents: soldPriceCents ?? null },
    });
    return { soldPriceCents: soldPriceCents ?? null };
  },
});
