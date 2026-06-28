import { MoveSummaryPage } from "@/components/move-pages/move-summary-page";

// Opening a move lands on a results-first summary of how it's set up (route,
// distance, dates, transportation, household) — not the empty Configure forms
// (MOVE-307). Configure lives at /configure; the former overview hub still
// lives at /app/moves/[moveId]/overview.
export default function MoveWorkspaceSummaryRoute() {
  return <MoveSummaryPage />;
}
