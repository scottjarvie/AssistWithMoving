"use client";

import { useAuth } from "@clerk/nextjs";
import { useAction, useConvexAuth } from "convex/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { selectDerivativeRef } from "../../convex/lib/photoDelivery";
import { PhotoThumbnailPageUrls } from "@/lib/use-photo-display-url";

const cacheLimit = 100;
const expiryMarginMs = 10_000;
const emptyUrls: Record<string, string> = {};

type PhotoId = Id<"itemPhotos">;
type Cover = [photoId: PhotoId, derivative: string, updatedAt: number];
type PageProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoIds: (PhotoId | undefined)[];
  photos?: readonly Pick<Doc<"itemPhotos">, "_id" | "updatedAt" | "derivativeRefs">[];
  children: ReactNode;
};

export function PhotoThumbnailPage({ householdId, moveId, photoIds, photos, children }: PageProps) {
  const { sessionId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const photoById = useMemo(() => new Map(photos?.map((photo) => [photo._id, photo])), [photos]);
  const covers: Cover[] = [];
  for (const id of new Set(photoIds)) {
    const photo = id && photoById.get(id);
    if (!photo) continue;
    // Redacted and not-yet-generated derivatives have no usable rendition.
    // Include the selected derivative and revision so an old capability is
    // dropped from the displayed page when its photo changes.
    const selected = selectDerivativeRef(photo.derivativeRefs, "thumb");
    if (selected) covers.push([photo._id, selected.ref, photo.updatedAt]);
  }
  const scope = isAuthenticated && sessionId && householdId && moveId
    ? { householdId, moveId, key: JSON.stringify([sessionId, householdId, moveId]) }
    : null;

  return (
    <ScopedThumbnailPage
      key={scope?.key}
      householdId={scope?.householdId}
      moveId={scope?.moveId}
      pageKey={JSON.stringify(covers.sort(([a], [b]) => a.localeCompare(b)))}
    >
      {children}
    </ScopedThumbnailPage>
  );
}

function ScopedThumbnailPage({ householdId, moveId, pageKey, children }: {
  householdId?: Id<"households">;
  moveId?: Id<"moves">;
  pageKey: string;
  children: ReactNode;
}) {
  const getThumbnailUrls = useAction(api.photos.getThumbnailUrls);
  const cache = useRef(new Map<PhotoId, { revision: string; url: string; usableUntil: number }>());
  const [page, setPage] = useState<{ key: string; urls: Record<string, string> }>();

  useEffect(() => {
    if (!householdId || !moveId) return;
    const covers = new Map((JSON.parse(pageKey) as Cover[]).map(
      ([id, ref, updatedAt]) => [id, JSON.stringify([ref, updatedAt])],
    ));
    const entries = cache.current;
    const attempted = new Set<PhotoId>();
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    function syncPage() {
      if (cancelled) return;
      clearTimeout(expiryTimer);
      const now = Date.now();
      let nextExpiry = Infinity;
      for (const [id, entry] of entries) {
        const revision = covers.get(id);
        if (revision && revision !== entry.revision) {
          entries.delete(id);
        } else if (entry.usableUntil <= now) {
          entries.delete(id);
          attempted.delete(id);
        } else {
          nextExpiry = Math.min(nextExpiry, entry.usableUntil);
        }
      }
      if (Number.isFinite(nextExpiry)) expiryTimer = setTimeout(resolvePage, nextExpiry - now);

      const urls: Record<string, string> = {};
      const missing: PhotoId[] = [];
      for (const [id, revision] of covers) {
        const entry = entries.get(id);
        if (entry?.revision === revision) {
          urls[id] = entry.url;
        } else if (!attempted.has(id)) {
          attempted.add(id);
          missing.push(id);
        }
      }
      setPage({ key: pageKey, urls });
      return missing;
    }

    function resolvePage() {
      const missing = syncPage();
      if (!missing?.length || !householdId || !moveId) return;
      void getThumbnailUrls({ householdId, moveId, photoIds: missing }).then((results) => {
        if (cancelled) return;
        for (const { photoId, url, expiresAt } of results) {
          const revision = covers.get(photoId);
          const usableUntil = expiresAt - expiryMarginMs;
          if (!revision || usableUntil <= Date.now()) continue;
          entries.delete(photoId);
          entries.set(photoId, { revision, url, usableUntil });
        }
        while (entries.size > cacheLimit) {
          const oldest = entries.keys().next();
          if (oldest.done) break;
          entries.delete(oldest.value);
        }
        resolvePage();
      }).catch(() => {
        // The cells retain their existing placeholders if signing fails.
      });
    }

    queueMicrotask(resolvePage);
    return () => {
      cancelled = true;
      clearTimeout(expiryTimer);
    };
  }, [getThumbnailUrls, householdId, moveId, pageKey]);

  return (
    <PhotoThumbnailPageUrls.Provider value={page?.key === pageKey ? page.urls : emptyUrls}>
      {children}
    </PhotoThumbnailPageUrls.Provider>
  );
}
