import type { Metadata } from "next";
import {
  Bot,
  Boxes,
  Camera,
  FileStack,
  KeyRound,
  Truck,
} from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Assist With Moving features for inventory, boxes, photo evidence, load planning, documentation packets, AI review, and API access.",
};

const featureCards = [
  {
    title: "Inventory source of truth",
    copy: "Track rooms, owners, disposition, status, values, serial numbers, estimates, review flags, and evidence signals in one searchable workspace.",
    icon: Boxes,
  },
  {
    title: "Box and QR manifest",
    copy: "Create short box codes, add contents, print QR labels, and open a secure lookup route when a mystery box appears.",
    icon: Boxes,
  },
  {
    title: "Photo evidence vault",
    copy: "Attach item, room, condition, serial, receipt, damage, and box photos while keeping originals private and delivery scoped.",
    icon: Camera,
  },
  {
    title: "Capacity load planner",
    copy: "Assign boxes to trucks, trailers, storage, movers, donation, dump, or personal vehicles with capacity warnings visible.",
    icon: Truck,
  },
  {
    title: "Documentation packets",
    copy: "Export focused PCS, mover, employer, claim, load crew, donation, storage, and owner packets with recipient-safe fields.",
    icon: FileStack,
  },
  {
    title: "AI review, not AI autopilot",
    copy: "Let AI suggest estimates, categories, box contents, duplicates, and assignments while keeping human approval in the loop.",
    icon: Bot,
  },
  {
    title: "API and MCP access",
    copy: "Use scoped API keys and agent tools for imports, summaries, assignment suggestions, exports, and move automation.",
    icon: KeyRound,
  },
];

export default function FeaturesPage() {
  return (
    <PublicPageChrome
      eyebrow="Product features"
      title="Everything needed to turn a move into a usable record."
      description="Assist With Moving combines inventory, boxes, photos, load planning, privacy, packet exports, and AI-assisted review in one workspace."
    >
      <PublicBand>
        <FeatureGrid cards={featureCards} />
      </PublicBand>
      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Built for the actual mess of moving.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A move is not one list. It is a changing set of decisions about
              what stays, what leaves, what movers can touch, what needs proof,
              and what must be findable later.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Find unboxed items before load day.",
              "Keep personal transport and first-night items visible.",
              "Export mover-safe packets without private values.",
              "Track claim evidence while packing normally.",
            ].map((item) => (
              <div key={item} className="rounded-md border border-border p-3 text-sm">
                {item}
              </div>
            ))}
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
