import type { Metadata } from "next";

import { ItemsPageContent } from "@/components/global-table-page";

export const metadata: Metadata = {
  title: "Items",
};

export default function ItemsPage() {
  return <ItemsPageContent />;
}
