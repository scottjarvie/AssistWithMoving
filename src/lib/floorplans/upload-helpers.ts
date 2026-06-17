import type { Id } from "../../../convex/_generated/dataModel";

export type PendingBlueprint = {
  id: string;
  contextNote: string;
  file: File;
  useForAi: boolean;
  width?: number;
  height?: number;
  dimensionsStatus: "pending" | "ready" | "failed";
};

export type UploadedBlueprint = {
  contextNote: string;
  photoId: Id<"itemPhotos">;
  fileName: string;
  useForAi: boolean;
  width?: number;
  height?: number;
};

export function normalizeFinalizeUploadResult(value: unknown): {
  photoId: Id<"itemPhotos">;
} {
  if (typeof value === "string") {
    return { photoId: value as Id<"itemPhotos"> };
  }
  if (value && typeof value === "object") {
    const result = value as { photoId?: string };
    if (result.photoId) {
      return { photoId: result.photoId as Id<"itemPhotos"> };
    }
  }
  throw new Error("Upload finalization did not return a photo id.");
}

export function normalizeCreateFloorPlanResult(value: unknown): {
  planId: Id<"floorPlans">;
} {
  if (typeof value === "string") {
    return { planId: value as Id<"floorPlans"> };
  }
  if (value && typeof value === "object") {
    const result = value as { planId?: string };
    if (result.planId) {
      return { planId: result.planId as Id<"floorPlans"> };
    }
  }
  throw new Error("Floorplan creation did not return a plan id.");
}

export function capturedAtFromFile(file: File) {
  return Number.isFinite(file.lastModified) && file.lastModified > 0
    ? file.lastModified
    : Date.now();
}

export function buildFloorplanAgentInstructions({
  batchInstructions,
  selectedForAi,
  uploaded,
}: {
  batchInstructions: string;
  selectedForAi: UploadedBlueprint[];
  uploaded: UploadedBlueprint[];
}) {
  const trimmedInstructions = batchInstructions.trim();
  const selectedLines = selectedForAi.map((entry, index) => {
    const dimensions =
      entry.width && entry.height
        ? `${entry.width}x${entry.height}`
        : "size unknown";
    const context = entry.contextNote || "No user context provided.";
    return `${index + 1}. ${entry.fileName} (${dimensions}) photoId=${entry.photoId}: ${context}`;
  });
  const excludedLines = uploaded
    .filter((entry) => !entry.useForAi)
    .map((entry) => `- ${entry.fileName}`);

  return [
    trimmedInstructions ||
      "Interpret these floorplan and blueprint images, record observations, relationships, measurements, assumptions, conflicts, and gap questions, then propose Layout Studio plan updates for review only when the graph supports it.",
    "",
    "AI review image set:",
    ...selectedLines,
    excludedLines.length
      ? [
          "",
          "Uploaded but not selected for this AI pass:",
          ...excludedLines,
          "Do not use unselected images for this pass unless the user explicitly selects them later.",
        ].join("\n")
      : "",
    "",
    "Use the per-image user context as high-confidence guidance, but still record provenance and uncertainty for extracted observations.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
