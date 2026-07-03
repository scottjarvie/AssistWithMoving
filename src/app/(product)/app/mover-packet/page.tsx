import type { Metadata } from "next";

import { PrintableMoverPacket } from "@/components/printable-mover-packet";

export const metadata: Metadata = {
  title: "Mover packet",
};

export default async function MoverPacketPage({
  searchParams,
}: {
  searchParams: Promise<{
    householdId?: string;
    moveId?: string;
    mode?: "movingCompany" | "loadCrew" | "owner";
  }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "loadCrew" || params.mode === "owner"
      ? params.mode
      : "movingCompany";

  return (
    <PrintableMoverPacket
      householdId={params.householdId}
      moveId={params.moveId}
      mode={mode}
    />
  );
}
