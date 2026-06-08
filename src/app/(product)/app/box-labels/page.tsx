import { PrintableBoxLabels } from "@/components/printable-box-labels";

export default async function BoxLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ householdId?: string; moveId?: string }>;
}) {
  const params = await searchParams;
  return (
    <PrintableBoxLabels
      householdId={params.householdId}
      moveId={params.moveId}
    />
  );
}
