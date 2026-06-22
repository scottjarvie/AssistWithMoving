import { redirect } from "next/navigation";

// /app is the bare product entry point; the home surface is the moves list.
export default function AppIndexPage() {
  redirect("/app/moves");
}
