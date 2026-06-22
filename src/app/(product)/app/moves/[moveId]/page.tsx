import { MoveConfigurePage } from "@/components/move-pages/configure-page";

// Opening a move lands on its configuration surface: where it starts/ends, how
// it travels, its details, and who shares it. The former overview hub still
// lives at /app/moves/[moveId]/overview.
export default function MoveWorkspaceConfigureRoute() {
  return <MoveConfigurePage />;
}
