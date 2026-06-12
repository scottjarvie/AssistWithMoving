export type PhotoReviewFilterKey =
  | "all"
  | "review"
  | "unassigned"
  | "claimEvidence"
  | "serialNumber"
  | "condition"
  | "roomOrBox"
  | "aiPending"
  | "sensitive"
  | "derivatives";

export type PhotoReviewFilterablePhoto = {
  itemId?: unknown;
  boxId?: unknown;
  room?: string;
  claimId?: string;
  documentationProfileTypes?: string[];
  photoType: string;
  privacyLevel: string;
  confidence?: string;
  verificationStatus: string;
  derivativeStatus?: string;
  derivativeError?: string;
  aiProcessed: boolean;
};

export const photoReviewFilters: {
  key: PhotoReviewFilterKey;
  label: string;
  emptyLabel: string;
  description: string;
}[] = [
  {
    key: "all",
    label: "All",
    emptyLabel: "photos",
    description: "Every photo tied to this move.",
  },
  {
    key: "review",
    label: "Review",
    emptyLabel: "photos needing review",
    description: "Photos that still need a human decision.",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    emptyLabel: "unassigned photos",
    description: "Photos without item, box, or room context.",
  },
  {
    key: "claimEvidence",
    label: "Claim / evidence",
    emptyLabel: "claim or evidence photos",
    description:
      "Photos likely needed for claims, PCS, employer, or evidence packets.",
  },
  {
    key: "serialNumber",
    label: "Serial",
    emptyLabel: "serial number photos",
    description: "Serial number and model plate photos.",
  },
  {
    key: "condition",
    label: "Condition",
    emptyLabel: "condition photos",
    description: "Condition and damage photos for verification.",
  },
  {
    key: "roomOrBox",
    label: "Room / box",
    emptyLabel: "room or box photos",
    description: "Room, box, and location coverage photos.",
  },
  {
    key: "aiPending",
    label: "AI not processed",
    emptyLabel: "AI-unprocessed photos",
    description: "Photos waiting for agent processing.",
  },
  {
    key: "sensitive",
    label: "Sensitive",
    emptyLabel: "sensitive photos",
    description: "Photos with restricted privacy settings.",
  },
  {
    key: "derivatives",
    label: "Quality issues",
    emptyLabel: "photos with quality or derivative issues",
    description:
      "Photos with missing web versions, low confidence, or processing issues.",
  },
];

export function filterPhotosForReview<
  TPhoto extends PhotoReviewFilterablePhoto,
>(photos: TPhoto[], filter: PhotoReviewFilterKey) {
  return photos.filter((photo) => photoMatchesReviewFilter(photo, filter));
}

export function photoMatchesReviewFilter(
  photo: PhotoReviewFilterablePhoto,
  filter: PhotoReviewFilterKey,
) {
  switch (filter) {
    case "all":
      return true;
    case "review":
      return photo.verificationStatus === "needsReview";
    case "unassigned":
      return !photo.itemId && !photo.boxId && !photo.room;
    case "claimEvidence":
      return (
        Boolean(photo.claimId) ||
        photo.documentationProfileTypes?.some((type) =>
          ["insuranceClaim", "pcsMove", "employerRelocation"].includes(type),
        ) === true ||
        ["damage", "receipt", "serialNumber", "condition"].includes(
          photo.photoType,
        ) ||
        ["claimOnly", "reportVisible"].includes(photo.privacyLevel)
      );
    case "serialNumber":
      return photo.photoType === "serialNumber";
    case "condition":
      return photo.photoType === "condition" || photo.photoType === "damage";
    case "roomOrBox":
      return (
        photo.photoType === "room" ||
        photo.photoType === "boxContents" ||
        photo.photoType === "boxLabel" ||
        Boolean(photo.room || photo.boxId)
      );
    case "aiPending":
      return !photo.aiProcessed;
    case "sensitive":
      return photo.privacyLevel !== "normal";
    case "derivatives":
      return (
        photo.derivativeStatus === "pending" ||
        photo.derivativeStatus === "failed" ||
        Boolean(photo.derivativeError) ||
        photo.verificationStatus === "rejected" ||
        photo.confidence === "low" ||
        photo.confidence === "none"
      );
  }
}
