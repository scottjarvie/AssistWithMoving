import type { Metadata } from "next";

import { MovableUnitsPageContent } from "@/components/global-table-page";

export const metadata: Metadata = {
  title: "Movable units",
};

export default function MovableUnitsPage() {
  return <MovableUnitsPageContent />;
}
