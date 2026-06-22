import { redirect } from "next/navigation";

// Spaces was removed in the revamp: areas/rooms now live on the move's
// Start-location config tab. Redirect any deep link there, preserving the move.
export default async function SpacesRoute({
  params,
}: {
  params: Promise<{ moveId: string }>;
}) {
  const { moveId } = await params;
  redirect(`/app/moves/${encodeURIComponent(moveId)}#start`);
}
