import { redirect } from "next/navigation";

// Boxes became Movable Units in the revamp, surfaced globally rather than
// per-move. Redirect any deep link to the new home.
export default function BoxesRoute() {
  redirect("/app/movable-units");
}
