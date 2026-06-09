import type { Metadata } from "next";
import { Camera, ClipboardCheck, FileWarning, ShieldCheck } from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";

export const metadata: Metadata = {
  title: "Claims Inventory",
  description:
    "MovingManifest claim-ready inventory support for photos, serial numbers, values, condition notes, and evidence packet exports.",
};

const claimCards = [
  {
    title: "Evidence while packing",
    copy: "Attach photos, condition notes, receipt markers, serial numbers, and value fields as part of normal inventory work.",
    icon: Camera,
  },
  {
    title: "Evidence completeness",
    copy: "Find high-value, personal, sensitive, damaged, missing, or claim-relevant items that still need photos or details.",
    icon: ClipboardCheck,
  },
  {
    title: "Claim packet export",
    copy: "Generate a focused packet with item details, evidence metadata, values, condition, status, and clear disclaimers.",
    icon: FileWarning,
  },
  {
    title: "Private originals",
    copy: "Original photo storage is private by default. Recipient packets can be scoped so private notes and sensitive assets stay hidden.",
    icon: ShieldCheck,
  },
];

export default function ClaimsInventoryPage() {
  return (
    <PublicPageChrome
      eyebrow="Claims and evidence"
      title="A claim-ready record built as a side effect of being organized."
      description="MovingManifest helps you preserve item details, photos, condition notes, values, serial numbers, and packet exports without turning the move into a separate paperwork project."
    >
      <PublicBand>
        <FeatureGrid cards={claimCards} />
      </PublicBand>
      <PublicBand>
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Evidence organization, not claim approval.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              MovingManifest can organize records and exports. It does not
              decide whether an insurer, mover, transportation office, or claims
              process will accept or approve anything.
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">Claim packet can include</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                "Damage and missing status",
                "Condition and receipt photos",
                "Serial and model numbers",
                "Declared and replacement values",
                "Box trail and load context",
                "Evidence warnings and score",
              ].map((item) => (
                <div key={item} className="rounded-md bg-muted/45 px-3 py-2 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
