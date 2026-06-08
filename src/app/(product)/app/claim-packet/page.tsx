import { PrintableClaimPacket } from "@/components/printable-claim-packet";

export default async function ClaimPacketPage({
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
    <PrintableClaimPacket
      householdId={params.householdId}
      moveId={params.moveId}
      mode={params.mode === "owner" ? "owner" : "submission"}
    />
  );
}
