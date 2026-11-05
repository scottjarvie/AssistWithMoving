import type { Metadata } from "next";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";

export const metadata: Metadata = {
  title: "PCS Moving",
  description:
    "Assist With Moving PCS support for mixed HHG, PPM, partial PPM, personal transport, weight allowance tracking, and documentation packets.",
};

const pcsCards = [
  {
    title: "Mixed shipment planning",
    copy: "Plan personal vehicles, trailers, storage, HHG movers, PPM loads, donations, dump runs, and unassigned boxes together.",
    icon: "truck" as const,
  },
  {
    title: "Configurable PCS fields",
    copy: "Track branch, rank or pay grade, shipment type, weight allowance, and transportation-office notes without hardcoding policy assumptions.",
    icon: "check" as const,
  },
  {
    title: "PCS packet exports",
    copy: "Produce PCS-focused packets with load summaries, personal transport lists, evidence checklists, and verification language.",
    icon: "note" as const,
  },
  {
    title: "Verification reminders",
    copy: "The app helps organize records, but it does not replace official guidance from a transportation office, insurer, mover, or legal advisor.",
    icon: "warning" as const,
  },
];

export default function PcsMovingPage() {
  return (
    <PublicPageChrome
      eyebrow="Military PCS mode"
      title="PCS move planning without pretending policy is static."
      description="Assist With Moving treats PCS as a first-class workflow: configurable official fields, personal-transport lists, HHG/PPM planning, and careful documentation language."
    >
      <PublicBand label="PCS moving tools" id="guide-pcs-moving-pcs-moving-tools">
        <FeatureGrid cards={pcsCards} />
      </PublicBand>
      <PublicBand label="PCS workflows" id="guide-pcs-moving-pcs-workflows">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            ["Do not let movers touch", "Documents, medication, cameras, drives, jewelry, and irreplaceable records can stay visible as owner-carry work."],
            ["Allowance awareness", "Move-level weight allowance tracking stays separate from resource-level vehicle or shipment capacity."],
            ["Evidence habits", "High-value and claim-relevant items surface photo, serial, receipt, and condition gaps before the move is over."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-md border border-border p-4">
              <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </div>
          ))}
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
