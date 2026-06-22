// The MoveWorkspaceProvider is mounted ONCE in (product)/layout.tsx, above the
// app shell, and derives the active move from the URL. This layout no longer
// mounts its own provider — doing so per-route remounted the Clerk/Convex/move
// context on navigation, which was the original freeze bug.
export default function MoveWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
