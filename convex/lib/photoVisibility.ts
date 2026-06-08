import type { Doc } from "../_generated/dataModel";

type PhotoVisibilityPolicy = {
  sensitivePhotos: boolean;
};

const hiddenDerivativeRefs = {};

export function canViewPhotoAssets(
  photo: Pick<Doc<"itemPhotos">, "privacyLevel" | "visibilityScope">,
  visibility: PhotoVisibilityPolicy
) {
  if (photo.visibilityScope === "private") {
    return visibility.sensitivePhotos;
  }

  switch (photo.privacyLevel) {
    case "normal":
    case "moverVisible":
      return true;
    case "reportVisible":
      return photo.visibilityScope === "documentationScoped"
        ? false
        : visibility.sensitivePhotos;
    case "claimOnly":
    case "sensitive":
    case "hiddenFromGuests":
    case "private":
      return visibility.sensitivePhotos;
    default:
      return false;
  }
}

export function canDownloadOriginalPhoto(
  photo: Pick<Doc<"itemPhotos">, "visibilityScope">,
  visibility: PhotoVisibilityPolicy
) {
  return photo.visibilityScope !== "documentationScoped" && visibility.sensitivePhotos;
}

export function canUsePhotoDerivativeForAi(
  photo: Pick<
    Doc<"itemPhotos">,
    "privacyLevel" | "visibilityScope" | "derivativeRefs" | "derivativeStatus"
  >
) {
  if (photo.visibilityScope === "private") {
    return false;
  }
  if (
    photo.privacyLevel === "claimOnly" ||
    photo.privacyLevel === "sensitive" ||
    photo.privacyLevel === "hiddenFromGuests" ||
    photo.privacyLevel === "private"
  ) {
    return false;
  }
  if (photo.derivativeStatus && photo.derivativeStatus !== "ready") {
    return false;
  }
  return Boolean(photo.derivativeRefs.card ?? photo.derivativeRefs.detail);
}

export function redactPhotoForVisibility(
  photo: Doc<"itemPhotos">,
  visibility: PhotoVisibilityPolicy
) {
  const canViewAssets = canViewPhotoAssets(photo, visibility);
  const canViewOriginal = canDownloadOriginalPhoto(photo, visibility);

  return {
    ...photo,
    originalStorageKey: canViewOriginal ? photo.originalStorageKey : undefined,
    originalBucket: canViewOriginal ? photo.originalBucket : undefined,
    originalHash: canViewOriginal ? photo.originalHash : undefined,
    cloudflareImageId: canViewAssets ? photo.cloudflareImageId : undefined,
    derivativeRefs: canViewAssets ? photo.derivativeRefs : hiddenDerivativeRefs,
    notes: visibility.sensitivePhotos ? photo.notes : undefined,
  };
}
