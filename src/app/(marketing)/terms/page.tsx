import type { Metadata } from "next";
import { ClipboardList, FileWarning, ShieldAlert, UserCheck } from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "MovingManifest terms overview for beta use, documentation packets, AI suggestions, and user-controlled move records.",
};

const termsCards = [
  {
    title: "User-controlled records",
    copy: "The workspace helps owners and collaborators organize inventory, boxes, photos, load plans, and packets. Users remain responsible for their records.",
    icon: UserCheck,
  },
  {
    title: "Documentation aid",
    copy: "Packets organize available information. They do not guarantee acceptance by movers, employers, insurers, or government offices.",
    icon: ClipboardList,
  },
  {
    title: "AI needs review",
    copy: "AI suggestions can be useful, but they are estimates and drafts. Human review is required before relying on them.",
    icon: ShieldAlert,
  },
  {
    title: "Launch-stage terms",
    copy: "This page is product-facing terms scaffolding and should be replaced or reviewed before broad commercial launch.",
    icon: FileWarning,
  },
];

export default function TermsPage() {
  return (
    <PublicPageChrome
      eyebrow="Terms overview"
      title="Use MovingManifest as an organizing system, not an official authority."
      description="MovingManifest helps structure move data, evidence, exports, and AI-assisted planning. It does not replace official guidance, legal advice, mover requirements, employer policy, or insurance decisions."
    >
      <PublicBand>
        <FeatureGrid cards={termsCards} />
      </PublicBand>
      <PublicBand>
        <div className="max-w-4xl space-y-5 text-sm leading-7 text-muted-foreground">
          <h2 className="text-2xl font-semibold tracking-normal text-foreground">
            Practical terms for launch
          </h2>
          <p>
            Users should verify PCS entitlements, transportation-office
            requirements, mover restrictions, employer reimbursement rules, and
            insurance or claims requirements with the relevant official source.
          </p>
          <p>
            Users should review AI-created items, estimates, assignments,
            duplicate detections, photo suggestions, and documentation packets
            before acting on them or sharing them externally.
          </p>
          <p>
            MovingManifest may provide exports and share links for convenience.
            The owner is responsible for choosing what to share and with whom.
          </p>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
