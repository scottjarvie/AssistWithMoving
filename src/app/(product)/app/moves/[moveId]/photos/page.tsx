import { redirect } from "next/navigation";

// Photos was removed in the revamp: photos now attach to items/units, surfaced
// on the global Items page. Redirect any deep link there.
export default function PhotosRoute() {
  redirect("/app/items");
}
