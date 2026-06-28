import { MoveConfigurePage } from "@/components/move-pages/configure-page";

// The move's configuration surface — where it starts/ends, how it travels, its
// details (dates/distance), and who shares it. Moved off the move index (now a
// results summary, MOVE-307) to its own route; the summary's gears deep-link
// here via hash tabs (e.g. /configure#details).
export default function MoveWorkspaceConfigureRoute() {
  return <MoveConfigurePage />;
}
