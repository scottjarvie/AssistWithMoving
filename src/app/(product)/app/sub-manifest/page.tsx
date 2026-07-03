import type { Metadata } from "next";

import { PrintableSubManifest } from "@/components/printable-sub-manifest";
import type { SubManifestKind, SubManifestMode } from "@/lib/sub-manifest";

export const metadata: Metadata = {
  title: "Sub-manifest",
};

const subManifestKinds = new Set(["donation", "sellFree", "storage"]);

export default async function SubManifestPage({
  searchParams,
}: {
  searchParams: Promise<{
    householdId?: string;
    moveId?: string;
    kind?: SubManifestKind;
    mode?: SubManifestMode;
  }>;
}) {
  const params = await searchParams;
  const kind = subManifestKinds.has(params.kind ?? "")
    ? (params.kind as SubManifestKind)
    : "donation";

  return (
    <PrintableSubManifest
      householdId={params.householdId}
      moveId={params.moveId}
      kind={kind}
      mode={params.mode === "owner" ? "owner" : "recipient"}
    />
  );
}
