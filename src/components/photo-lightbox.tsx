"use client";

// A centered full-image viewer (MOVE-346). Click a thumbnail anywhere to open
// it; scroll through a unit/item/box's other photos with the arrows or ←/→
// keys; dismiss by clicking the dark area outside the image, the X button, or
// Esc. Resolves each photo's large (detail) URL on demand via getDisplayUrl.

import { useCallback, useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useAction } from "convex/react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function PhotoLightbox({
  householdId,
  moveId,
  photoIds,
  open,
  onOpenChange,
  initialIndex = 0,
  title = "Photos",
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoIds: readonly Id<"itemPhotos">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIndex?: number;
  title?: string;
}) {
  const count = photoIds.length;
  const [index, setIndex] = useState(initialIndex);

  // Snap to the requested photo whenever the viewer opens (adjust-during-render
  // pattern — React's documented alternative to a setState-in-effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, count - 1)));
    }
  }

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  // ←/→ to navigate (Esc/overlay handled by the Dialog primitive + below).
  useEffect(() => {
    if (!open || count <= 1) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, go]);

  const currentPhotoId = photoIds[index];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Full-screen stage; a click on the backdrop (not the image/controls)
          // closes it, matching click-outside-to-dismiss.
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          {currentPhotoId ? (
            // key per photo so each image mounts fresh (no stale URL flash).
            <LightboxImage
              key={currentPhotoId}
              householdId={householdId}
              moveId={moveId}
              photoId={currentPhotoId}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/80">
              <ImageOff className="size-8" aria-hidden />
              <p className="text-sm">No photo to show.</p>
            </div>
          )}

          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => go(-1)}
                className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => go(1)}
                className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                {index + 1} / {count}
              </div>
            </>
          ) : null}

          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <X className="size-6" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LightboxImage({
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

  // This component is keyed per photoId by the parent, so it mounts fresh for
  // each image — no synchronous state reset needed here.
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
      <div className="flex flex-col items-center gap-2 text-white/80">
        <ImageOff className="size-8" aria-hidden />
        <p className="text-sm">Couldn&apos;t load that photo.</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="size-12 animate-pulse rounded-md bg-white/20" aria-label="Loading photo" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="max-h-[90vh] max-w-[92vw] rounded-md object-contain"
    />
  );
}
