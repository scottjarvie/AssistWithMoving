import type { Metadata } from "next";

import { PrintableBoxLabels } from "@/components/printable-box-labels";

export const metadata: Metadata = {
  title: "Box labels",
};

export default async function BoxLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    householdId?: string;
    moveId?: string;
    layout?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <PrintableBoxLabels
      householdId={params.householdId}
      moveId={params.moveId}
      layout={params.layout}
    />
  );
}
