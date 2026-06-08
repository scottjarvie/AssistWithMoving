export type AiReviewKind = "text" | "photo" | "planning";

export type AiReviewEntry = {
  id: string;
  kind: AiReviewKind;
  type: string;
  confidence?: string;
  title: string;
  detail: string;
  reasoning: string;
  href: string;
  duplicateCount?: number;
};

export function summarizeAiReviewQueue(entries: AiReviewEntry[]) {
  return entries.reduce(
    (summary, entry) => {
      summary.total += 1;
      summary.byKind[entry.kind] += 1;
      if (entry.confidence === "low") summary.lowConfidence += 1;
      if ((entry.duplicateCount ?? 0) > 0) summary.duplicateCandidates += 1;
      return summary;
    },
    {
      total: 0,
      lowConfidence: 0,
      duplicateCandidates: 0,
      byKind: {
        text: 0,
        photo: 0,
        planning: 0,
      },
    }
  );
}

export function sortAiReviewEntries(entries: AiReviewEntry[]) {
  const kindOrder: Record<AiReviewKind, number> = {
    photo: 0,
    planning: 1,
    text: 2,
  };
  return [...entries].sort((a, b) => {
    const duplicateDelta = (b.duplicateCount ?? 0) - (a.duplicateCount ?? 0);
    if (duplicateDelta) return duplicateDelta;
    const confidenceDelta = confidenceRank(a.confidence) - confidenceRank(b.confidence);
    if (confidenceDelta) return confidenceDelta;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });
}

function confidenceRank(confidence: string | undefined) {
  switch (confidence) {
    case "low":
      return 0;
    case "medium":
      return 1;
    case "high":
      return 2;
    default:
      return 3;
  }
}
