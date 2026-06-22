import { redirect } from "next/navigation";

// The per-move Inventory surface was folded into the global Items page in the
// revamp. Redirect any deep link to the new home.
export default function InventoryRoute() {
  redirect("/app/items");
}
