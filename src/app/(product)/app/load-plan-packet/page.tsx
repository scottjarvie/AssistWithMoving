import { PrintableLoadPlanPacket } from "@/components/printable-load-plan-packet";

export default async function LoadPlanPacketPage({
  searchParams,
}: {
  searchParams: Promise<{
    householdId?: string;
    moveId?: string;
    mode?: "crew" | "owner";
  }>;
}) {
  const params = await searchParams;
  return (
    <PrintableLoadPlanPacket
      householdId={params.householdId}
      moveId={params.moveId}
      mode={params.mode === "owner" ? "owner" : "crew"}
    />
  );
}
