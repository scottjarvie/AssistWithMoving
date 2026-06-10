import { MoveWorkspaceProvider } from "@/components/move-workspace-context";

// Every page under /app/moves/[moveId] shares one workspace context, so the
// household/move resolution queries run once per page instead of per panel.
export default async function MoveWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ moveId: string }>;
}) {
  const { moveId } = await params;
  return (
    <MoveWorkspaceProvider key={moveId} initialMoveId={moveId}>
      {children}
    </MoveWorkspaceProvider>
  );
}
