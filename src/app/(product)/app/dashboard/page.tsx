import { MoveDashboard } from "@/components/move-dashboard";
import { MoveWorkspaceProvider } from "@/components/move-workspace-context";

export default function DashboardPage() {
  return (
    <MoveWorkspaceProvider>
      <MoveDashboard />
    </MoveWorkspaceProvider>
  );
}
