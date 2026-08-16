import type { Metadata } from "next";
import { EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { supportDesk, supportDeskUrl } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Assist With Moving privacy overview for household inventory, photo evidence, scoped sharing, API keys, and private originals.",
};

const privacyCards = [
  {
    title: "Private originals",
    copy: "Original photo files are intended to stay private and require authorized, audited access rather than public bucket URLs.",
    icon: Lock,
  },
  {
    title: "Scoped sharing",
    copy: "Helper, mover, employer, and documentation views are designed to hide private values, serials, notes, and sensitive photos by default.",
    icon: EyeOff,
  },
  {
    title: "Permissioned API keys",
    copy: "External tools and agents use scoped API keys. Keys should be limited to the moves and actions they actually need.",
    icon: KeyRound,
  },
  {
    title: "Owner control",
    copy: "Owners can manage households, collaborators, documentation links, exports, photo privacy, and account privacy controls.",
    icon: ShieldCheck,
  },
];

export default function PrivacyPage() {
  return (
    <PublicPageChrome
      eyebrow="Privacy overview"
      title="Moving records can be sensitive. The product treats them that way."
      description="A move inventory can contain addresses, dates, room layouts, valuables, documents, serial numbers, and family photos. Assist With Moving is designed around scoped access and private originals."
    >
      <PublicBand>
        <FeatureGrid cards={privacyCards} />
      </PublicBand>
      <PublicBand>
        <div className="max-w-4xl space-y-5 text-sm leading-7 text-muted-foreground">
          <h2 className="text-2xl font-semibold tracking-normal text-foreground">
            Privacy posture
          </h2>
          <p>
            Assist With Moving stores move records in an authenticated workspace and
            uses object-level authorization in backend functions. Human sessions,
            API keys, and share links are separate access paths with separate
            permissions.
          </p>
          <p>
            Public and recipient-facing views are designed to omit raw storage
            paths, private notes, sensitive photos, values, and serial numbers
            unless the selected packet mode or owner permissions allow them.
          </p>
          <p>
            This page is a product privacy overview for launch readiness. Formal
            legal policy text should be reviewed before broad commercial launch.
          </p>
          <h2 className="text-2xl font-semibold tracking-normal text-foreground">
            Privacy questions and requests
          </h2>
          <p>
            Send a privacy question, data request, or concern about your move
            records to the{" "}
            <a
              href={supportDeskUrl("home")}
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              {supportDesk.name}
            </a>
            , the single desk shared by every Assist With product. Direct email
            contact is not available: Assist With Moving publishes no privacy,
            support, or contact address, because it does not operate a mailbox.
            Account-level export and deletion controls also live in your
            settings once you are signed in.
          </p>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
