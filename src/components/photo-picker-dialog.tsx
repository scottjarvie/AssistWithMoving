"use client";

// "Choose from existing photos" (MOVE-354 #3). Item/box photo controls today
// only UPLOAD new photos; this lets you reuse a photo already in the move —
// the manual safety net for the rare orphan capture, and a way to file one
// photo onto a unit without re-uploading. Lists the move's photos (defaulting
// to the unattached ones), and attaching just points the photo's itemId/boxId
// at the target via the existing photos.updateEvidence mutation.

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ImageOff, Loader2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MovePhoto = FunctionReturnType<typeof api.photos.listForMove>[number];

export type PhotoPickerTarget =
  | { kind: "item"; itemId: Id<"items"> }
  | { kind: "box"; boxId: Id<"boxes"> };

function attachmentLabel(photo: MovePhoto): string | null {
  if (photo.itemId) return "Item";
  if (photo.boxId) return "Box";
  if (photo.spaceId) return "Space";
  if (photo.transportResourceId) return "Transport";
  if (photo.room) return "Room";
  return null;
}

export function PhotoPickerDialog({
  householdId,
  moveId,
  target,
  targetLabel,
  open,
  onOpenChange,
  onAttached,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  target: PhotoPickerTarget;
  targetLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttached?: () => void;
}) {
  // Only fetch the move's photo wall while the picker is actually open.
  const photos = useQuery(
    api.photos.listForMove,
    householdId && moveId && open
      ? { householdId, moveId, limit: 250 }
      : "skip",
  );
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const updateEvidence = useMutation(api.photos.updateEvidence);

  const [unattachedOnly, setUnattachedOnly] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return (photos ?? []).filter((photo) => {
      // Never offer a photo that's already on this exact target.
      const alreadyHere =
        target.kind === "item"
          ? photo.itemId === target.itemId
          : photo.boxId === target.boxId;
      if (alreadyHere) return false;
      if (unattachedOnly) return !photo.itemId && !photo.boxId && !photo.room;
      return true;
    });
  }, [photos, unattachedOnly, target]);

  const idKey = visible.map((photo) => photo._id).join("|");
  useEffect(() => {
    if (!householdId || !moveId || !idKey) {
      return;
    }
    const ids = idKey.split("|") as Id<"itemPhotos">[];
    let cancelled = false;
    void Promise.all(
      ids.map(async (photoId) => {
        try {
          const display = await getDisplayUrl({
            householdId,
            moveId,
            photoId,
            variant: "card",
          });
          return [photoId, display.url] as const;
        } catch {
          return [photoId, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setUrls((prev) => {
        const next = { ...prev };
        for (const [photoId, url] of entries) {
          if (url) next[photoId] = url;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, idKey]);

  async function attach(photoId: Id<"itemPhotos">) {
    if (!householdId || !moveId) return;
    setAttachingId(photoId);
    setError(null);
    try {
      await updateEvidence({
        householdId,
        moveId,
        photoId,
        ...(target.kind === "item"
          ? { itemId: target.itemId }
          : { boxId: target.boxId }),
      });
      onAttached?.();
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not attach that photo.",
      );
      setAttachingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="pr-12">
          <DialogTitle>Choose an existing photo</DialogTitle>
          <DialogDescription>
            Reuse a photo already in this move
            {targetLabel ? ` for ${targetLabel}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={unattachedOnly}
              onChange={(event) => setUnattachedOnly(event.target.checked)}
            />
            Unattached only
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {photos === undefined ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square animate-pulse rounded-md border border-border bg-muted"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
              {unattachedOnly
                ? "No unattached photos — every photo is already filed. Switch off “Unattached only” to reuse any photo in the move."
                : "No other photos in this move yet."}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visible.map((photo) => {
                const url = urls[photo._id];
                const label = attachmentLabel(photo);
                const busy = attachingId === photo._id;
                return (
                  <button
                    key={photo._id}
                    type="button"
                    disabled={attachingId !== null}
                    onClick={() => void attach(photo._id)}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-opacity hover:opacity-90 disabled:opacity-60"
                    aria-label="Attach this photo"
                  >
                    {url ? (
                      // B2/edge delivery URLs are short-lived and provider-
                      // controlled, so Next image optimization is bypassed.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-5" aria-hidden="true" />
                      </div>
                    )}
                    {label ? (
                      <Badge
                        variant="secondary"
                        className="absolute left-1 top-1 px-1 py-0 text-[0.6rem]"
                      >
                        {label}
                      </Badge>
                    ) : null}
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {busy ? (
                        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                      ) : (
                        <>
                          <Check className="size-4" aria-hidden="true" />
                          Attach
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
