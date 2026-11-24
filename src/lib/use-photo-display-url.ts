"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function usePhotoDisplayUrl(
  householdId: Id<"households"> | null,
  moveId: Id<"moves"> | null,
  photoId?: Id<"itemPhotos">,
) {
  const urls = usePhotoDisplayUrls(householdId, moveId, photoId ? [photoId] : []);
  return (photoId && urls[photoId]) || null;
}

export function usePhotoDisplayUrls(
  householdId: Id<"households"> | null,
  moveId: Id<"moves"> | null,
  photoIds: readonly Id<"itemPhotos">[],
) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const photoKey = photoIds.join("|");
  const visibleIds = useMemo(
    () => (photoKey ? (photoKey.split("|") as Id<"itemPhotos">[]) : []),
    [photoKey],
  );

  useEffect(() => {
    if (!householdId || !moveId || visibleIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      visibleIds.map(async (photoId) => {
        try {
          const display = await getDisplayUrl({ householdId, moveId, photoId, variant: "card" });
          return [photoId, display.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries.filter((entry) => entry !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, visibleIds]);

  return urls;
}
