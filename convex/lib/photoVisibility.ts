import type { Doc } from "../_generated/dataModel";

type PhotoVisibilityPolicy = {
  sensitivePhotos: boolean;
};

const hiddenDerivativeRefs = {};

export function canViewPhotoAssets(
  photo: Pick<Doc<"itemPhotos">, "privacyLevel">,
  visibility: PhotoVisibilityPolicy
) {
  return photo.privacyLevel === "normal" || visibility.sensitivePhotos;
}

export function redactPhotoForVisibility(
  photo: Doc<"itemPhotos">,
  visibility: PhotoVisibilityPolicy
) {
  const canViewAssets = canViewPhotoAssets(photo, visibility);

  return {
    ...photo,
    originalStorageKey: visibility.sensitivePhotos
      ? photo.originalStorageKey
      : undefined,
    originalBucket: visibility.sensitivePhotos ? photo.originalBucket : undefined,
    originalHash: visibility.sensitivePhotos ? photo.originalHash : undefined,
    cloudflareImageId: canViewAssets ? photo.cloudflareImageId : undefined,
    derivativeRefs: canViewAssets ? photo.derivativeRefs : hiddenDerivativeRefs,
    notes: visibility.sensitivePhotos ? photo.notes : undefined,
  };
}
