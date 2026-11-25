import { redirect } from "next/navigation";
import { moveItemsPath } from "@/lib/move-links";

// The per-move Inventory surface was folded into the global Items page in the
// revamp. Redirect any deep link to the new home.
export default async function InventoryRoute({ params }: { params: Promise<{ moveId: string }> }) {
  redirect(moveItemsPath((await params).moveId));
}
