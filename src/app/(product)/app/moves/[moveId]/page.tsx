import { MoveDashboard } from "@/components/move-dashboard";

export default async function MoveWorkspacePage({
  params,
}: {
  params: Promise<{ moveId: string }>;
}) {
  const { moveId } = await params;
  return <MoveDashboard key={moveId} initialMoveId={moveId} />;
}
