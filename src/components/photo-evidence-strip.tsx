"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ImageOff, Images } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type PhotoEvidenceStripProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  itemId?: Id<"items">;
  boxId?: Id<"boxes">;
  omitFirstPhoto?: boolean;
  label?: string;
  emptyLabel?: string;
};

type DisplayUrlState = Record<
  string,
  {
    url: string;
    servedVariant: string;
    derivativeStatus?: string;
  }
>;

export function PhotoEvidenceStrip({
  householdId,
  moveId,
  itemId,
  boxId,
  omitFirstPhoto = false,
  label = "Photos",
  emptyLabel = "No photo evidence yet.",
}: PhotoEvidenceStripProps) {
  const itemPhotos = useQuery(
    api.photos.listForItem,
    householdId && moveId && itemId
      ? { householdId, moveId, itemId }
      : "skip"
  );
  const boxPhotos = useQuery(
    api.photos.listForBox,
    householdId && moveId && boxId ? { householdId, moveId, boxId } : "skip"
  );
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const queriedPhotos = itemId ? itemPhotos : boxPhotos;
  const photos = useMemo(() => {
    if (queriedPhotos === undefined) {
      return undefined;
    }

    return omitFirstPhoto && itemId ? queriedPhotos.slice(1) : queriedPhotos;
  }, [itemId, omitFirstPhoto, queriedPhotos]);
  const [displayUrls, setDisplayUrls] = useState<DisplayUrlState>({});
  const visiblePhotos = useMemo(() => (photos ?? []).slice(0, 6), [photos]);
  const photoKey = visiblePhotos.map((photo) => photo._id).join("|");

  useEffect(() => {
    if (!householdId || !moveId || visiblePhotos.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      visiblePhotos.map(async (photo) => {
        try {
          const display = await getDisplayUrl({
            householdId,
            moveId,
            photoId: photo._id,
            variant: "card",
          });
          return [
            photo._id,
            {
              url: display.url,
              servedVariant: display.servedVariant,
              derivativeStatus: display.derivativeStatus,
            },
          ] as const;
        } catch {
          return [photo._id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setDisplayUrls(
        entries.reduce<DisplayUrlState>((acc, [photoId, display]) => {
          if (display) {
            acc[photoId] = display;
          }
          return acc;
        }, {})
      );
    });

    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoKey, visiblePhotos]);

  if (!itemId && !boxId) {
    return null;
  }

  if (photos === undefined) {
    return (
      <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
        Loading photos.
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Images className="size-4 text-primary" aria-hidden="true" />
          {label}
          <span className="text-muted-foreground">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </span>
        </span>
        {photos.length > visiblePhotos.length ? (
          <span>showing {visiblePhotos.length}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {visiblePhotos.map((photo) => {
          const display = displayUrls[photo._id];
          return (
            <div
              key={photo._id}
              className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
              title={photo.caption ?? photo.photoType}
            >
              {display ? (
                // Vercel Image Optimization is intentionally bypassed; B2/edge
                // delivery URLs are short-lived and provider-controlled.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={display.url}
                  alt={photo.caption ?? `${photo.photoType} photo`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-4" aria-hidden="true" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
