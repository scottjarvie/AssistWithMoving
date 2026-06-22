import { redirect } from "next/navigation";

// Sell was removed in the revamp: disposition (including "sell") is now a facet
// of the global Items surface. Redirect any deep link there.
export default function SellRoute() {
  redirect("/app/items");
}
