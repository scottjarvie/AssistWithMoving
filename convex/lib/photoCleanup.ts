export const defaultPhotoUploadCleanupGraceMs = 24 * 60 * 60 * 1000;

export type StorageObjectRef = {
  bucket: string;
  storageKey: string;
};

export type UploadSessionForCleanup = {
  status: "authorized" | "completed" | "cancelled" | "failed";
  expiresAt: number;
  cleanupCompletedAt?: number;
  originalBucket: string;
  originalStorageKey: string;
  derivativeUploads?: Array<{
    bucket: string;
    storageKey: string;
  }>;
};

export type PhotoForCleanup = {
  originalBucket: string;
  originalStorageKey: string;
  derivativeRefs: {
    thumb?: string;
    card?: string;
    detail?: string;
    full?: string;
  };
};

export function shouldCleanupExpiredUploadSession(
  session: Pick<
    UploadSessionForCleanup,
    "status" | "expiresAt" | "cleanupCompletedAt"
  >,
  now: number,
  graceMs = defaultPhotoUploadCleanupGraceMs
) {
  return (
    session.status !== "completed" &&
    session.cleanupCompletedAt === undefined &&
    session.expiresAt + graceMs <= now
  );
}

export function storageRefKey(ref: StorageObjectRef) {
  return `${ref.bucket}\0${ref.storageKey}`;
}

export function uploadSessionStorageRefs(session: UploadSessionForCleanup) {
  return dedupeStorageRefs([
    {
      bucket: session.originalBucket,
      storageKey: session.originalStorageKey,
    },
    ...(session.derivativeUploads ?? []).map((derivative) => ({
      bucket: derivative.bucket,
      storageKey: derivative.storageKey,
    })),
  ]);
}

export function photoStorageRefs(photo: PhotoForCleanup) {
  return dedupeStorageRefs([
    {
      bucket: photo.originalBucket,
      storageKey: photo.originalStorageKey,
    },
    ...Object.values(photo.derivativeRefs).map((storageKey) => ({
      bucket: photo.originalBucket,
      storageKey,
    })),
  ]);
}

export function unreferencedUploadSessionStorageRefs(
  session: UploadSessionForCleanup,
  photos: PhotoForCleanup[]
) {
  const referenced = new Set(
    photos.flatMap(photoStorageRefs).map((ref) => storageRefKey(ref))
  );
  return uploadSessionStorageRefs(session).filter(
    (ref) => !referenced.has(storageRefKey(ref))
  );
}

function dedupeStorageRefs(refs: Array<StorageObjectRef | undefined>) {
  const seen = new Set<string>();
  return refs.filter((ref): ref is StorageObjectRef => {
    if (!ref?.bucket || !ref.storageKey) {
      return false;
    }
    const key = storageRefKey(ref);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
