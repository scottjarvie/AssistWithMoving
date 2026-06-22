import { MoveOverviewPage } from "@/components/move-pages/overview-page";

// The former move hub: decisions, readiness, and planning defaults. The move
// root now lands on the configuration surface; this keeps the overview content
// reachable via a deep link.
export default function MoveWorkspaceOverviewRoute() {
  return <MoveOverviewPage />;
}
