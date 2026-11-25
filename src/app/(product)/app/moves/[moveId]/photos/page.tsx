import { redirect } from "next/navigation";
import { moveItemsPath } from "@/lib/move-links";

// Photos was removed in the revamp: photos now attach to items/units, surfaced
// on the global Items page. Redirect any deep link there.
export default async function PhotosRoute({ params }: { params: Promise<{ moveId: string }> }) {
  redirect(moveItemsPath((await params).moveId));
}
