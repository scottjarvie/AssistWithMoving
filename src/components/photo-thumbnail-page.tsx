"use client";

import { useAuth } from "@clerk/nextjs";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { selectDerivativeRef } from "../../convex/lib/photoDelivery";
import { PhotoThumbnailPageUrls } from "@/lib/use-photo-display-url";

const cacheLimit = 100;
const expiryMarginMs = 10_000;
const emptyUrls: Record<string, string> = {};

type PhotoId = Id<"itemPhotos">;
type RecordId = Id<"items"> | Id<"boxes">;
const RecordCovers = createContext<ReadonlyMap<RecordId, PhotoId> | null>(null);

export function useRecordCover(targetId: RecordId) {
  return useContext(RecordCovers)?.get(targetId);
}

export function RecordPhotoPage({ householdId, moveId, targetIds, children }: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  targetIds: RecordId[];
  children: ReactNode;
}) {
  const ids = [...new Set(targetIds)].sort();
  const covers = useQuery(api.photos.listRecordCovers,
    householdId && moveId && ids.length ? { householdId, moveId, targetIds: ids } : "skip");
  const coverByTarget = useMemo(
    () => new Map(covers?.map(({ targetId, _id }) => [targetId, _id])),
    [covers],
  );

  return (
    <RecordCovers.Provider value={coverByTarget}>
      <PhotoThumbnailPage
        householdId={householdId}
        moveId={moveId}
        photoIds={covers?.map(({ _id }) => _id) ?? []}
        photos={covers}
      >
        {children}
      </PhotoThumbnailPage>
    </RecordCovers.Provider>
  );
}

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
    let cancelled = false;

    // Expiry limits cache reuse when the page or its covers change. Keep an
    // already displayed image in place and let the next page load reauthorize it.
    async function resolvePage() {
      if (cancelled) return;
      const now = Date.now();
      for (const [id, entry] of entries) {
        const revision = covers.get(id);
        if (entry.usableUntil <= now || (revision !== undefined && revision !== entry.revision)) {
          entries.delete(id);
        }
      }

      const urls: Record<string, string> = {};
      const missing: PhotoId[] = [];
      for (const id of covers.keys()) {
        const entry = entries.get(id);
        if (entry) {
          urls[id] = entry.url;
        } else {
          missing.push(id);
        }
      }
      setPage({ key: pageKey, urls });
      if (!missing.length || !householdId || !moveId) return;

      try {
        const results = await getThumbnailUrls({ householdId, moveId, photoIds: missing });
        if (cancelled) return;
        const resolvedUrls = { ...urls };
        for (const { photoId, url, expiresAt } of results) {
          const revision = covers.get(photoId);
          const usableUntil = expiresAt - expiryMarginMs;
          if (!revision || usableUntil <= Date.now()) continue;
          entries.set(photoId, { revision, url, usableUntil });
          resolvedUrls[photoId] = url;
        }
        while (entries.size > cacheLimit) {
          const oldest = entries.keys().next();
          if (oldest.done) break;
          entries.delete(oldest.value);
        }
        setPage({ key: pageKey, urls: resolvedUrls });
      } catch {
        // The cells retain their existing placeholders if signing fails.
      }
    }

    queueMicrotask(resolvePage);
    return () => {
      cancelled = true;
    };
  }, [getThumbnailUrls, householdId, moveId, pageKey]);

  return (
    <PhotoThumbnailPageUrls.Provider value={page?.key === pageKey ? page.urls : emptyUrls}>
      {children}
    </PhotoThumbnailPageUrls.Provider>
  );
}
