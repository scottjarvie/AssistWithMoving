import { PrintablePcsPacket } from "@/components/printable-pcs-packet";

export default async function PcsPacketPage({
  searchParams,
}: {
  searchParams: Promise<{
    householdId?: string;
    moveId?: string;
    mode?: "submission" | "owner";
  }>;
}) {
  const params = await searchParams;
  return (
    <PrintablePcsPacket
      householdId={params.householdId}
      moveId={params.moveId}
      mode={params.mode === "owner" ? "owner" : "submission"}
    />
  );
}
