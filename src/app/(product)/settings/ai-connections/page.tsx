import { redirect } from "next/navigation";

/**
 * `/settings/ai` is the canonical AI connection screen. This older path stays
 * alive so existing links, bookmarks, and published documentation keep working.
 */
export default function AiConnectionsPage() {
  redirect("/settings/ai");
}
