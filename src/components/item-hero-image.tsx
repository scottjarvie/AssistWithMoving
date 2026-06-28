"use client";

// The hero image for the item detail modal (MOVE-357). A detail/single-object
// view gets a medium image at the top (desktop: the left rail; mobile: stacked
// on top), not the tiny list thumbnail. Shows the item's first/main photo,
// resolves its large display URL on demand, and opens the shared full-screen
// lightbox (with the item's other photos) on click. Falls back to a calm
// placeholder when the item has no photos yet.

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ImageIcon, ImageOff } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhotoLightbox } from "@/components/photo-lightbox";

const CONTAINER_CLASS =
  "relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted md:max-w-none";

export function ItemHeroImage({
  householdId,
  moveId,
  itemId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  itemId: Id<"items">;
}) {
  const photos = useQuery(
    api.photos.listForItem,
    householdId && moveId ? { householdId, moveId, itemId } : "skip",
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const photoIds = useMemo(
    () => (photos ?? []).map((photo) => photo._id),
    [photos],
  );
  const heroId = photoIds[0] ?? null;

  if (photos === undefined) {
    return (
      <div className={`${CONTAINER_CLASS} animate-pulse`} aria-hidden="true" />
    );
  }

  if (!heroId) {
    return (
      <div
        className={`${CONTAINER_CLASS} flex flex-col items-center justify-center gap-1.5 text-muted-foreground`}
      >
        <ImageIcon className="size-7" aria-hidden="true" />
        <p className="text-xs">No photo yet</p>
        <p className="px-4 text-center text-[0.68rem] leading-4">
          Add one from the Evidence tab.
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={`${CONTAINER_CLASS} cursor-zoom-in transition-opacity hover:opacity-95`}
        aria-label={`View item photo${photoIds.length > 1 ? `s (${photoIds.length})` : ""}`}
      >
        {/* keyed per photo so it mounts fresh — no stale-URL reset needed. */}
        <HeroImg
          key={heroId}
          householdId={householdId}
          moveId={moveId}
          photoId={heroId}
        />
        {photoIds.length > 1 ? (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            {photoIds.length}
          </span>
        ) : null}
      </button>
      <PhotoLightbox
        householdId={householdId}
        moveId={moveId}
        photoIds={photoIds}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        title="Item photos"
      />
    </>
  );
}

function HeroImg({
  householdId,
  moveId,
  photoId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoId: Id<"itemPhotos">;
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Keyed per photoId by the parent, so it mounts fresh per image — no
  // synchronous state reset needed (matches PhotoLightbox's LightboxImage).
  useEffect(() => {
    if (!householdId || !moveId) return;
    let cancelled = false;
    void getDisplayUrl({ householdId, moveId, photoId, variant: "detail" })
      .then((display) => {
        if (!cancelled) setUrl(display.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoId]);

  if (failed) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <ImageOff className="size-7" aria-hidden="true" />
        <p className="text-xs">Couldn&apos;t load the photo</p>
      </div>
    );
  }

  if (!url) {
    return <div className="size-full animate-pulse" aria-hidden="true" />;
  }

  return (
    // B2/edge delivery URLs are short-lived and provider-controlled, so Next
    // image optimization is intentionally bypassed.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-full object-cover" />
  );
}
