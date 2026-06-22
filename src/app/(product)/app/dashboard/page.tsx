import { redirect } from "next/navigation";

// The dashboard surface was replaced by the moves home at /app/moves. This
// redirect keeps older deep links (packets, marketing, settings) working while
// the remaining #anchor links are migrated in a later pass.
export default function DashboardRedirectPage() {
  redirect("/app/moves");
}
