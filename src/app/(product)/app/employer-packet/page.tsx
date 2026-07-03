import type { Metadata } from "next";

import { PrintableEmployerPacket } from "@/components/printable-employer-packet";

export const metadata: Metadata = {
  title: "Employer packet",
};

export default async function EmployerPacketPage({
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
    <PrintableEmployerPacket
      householdId={params.householdId}
      moveId={params.moveId}
      mode={params.mode === "owner" ? "owner" : "submission"}
    />
  );
}
