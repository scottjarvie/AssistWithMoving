import type { Metadata } from "next";
import {
  Boxes,
  Bot,
  EyeOff,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { buildPhases, product } from "@/lib/product";
import { supportDesk, supportDeskUrl } from "@/lib/support";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Assist With Moving is, the principles behind it, and where the project stands. An independently built system of record for moves, designed around your own AI and private originals.",
};

const principleCards = [
  {
    title: "Your AI, not ours",
    copy: "Bring your own assistant — Claude, ChatGPT, or Codex — over scoped MCP and API keys. Assist With Moving is the structured record, not another locked-in chatbot. We don't bundle an AI model.",
    icon: Bot,
  },
  {
    title: "Review, not autopilot",
    copy: "AI can suggest estimates, categories, box contents, and assignments, but a human approves. The app never silently changes your data behind your back.",
    icon: ShieldCheck,
  },
  {
    title: "Private by default",
    copy: "Original photos and records stay private. Recipient packets are designed to hide values, serials, private notes, and sensitive photos unless you choose to share them.",
    icon: EyeOff,
  },
  {
    title: "Built for real moves",
    copy: "Household moves, military PCS with mixed HHG and PPM, insurance and claims evidence, employer relocation, storage, and donation — not a one-size checklist.",
    icon: Boxes,
  },
];

export default function AboutPage() {
  return (
    <PublicPageChrome
      eyebrow="About the project"
      title="A move generates chaos. Assist With Moving turns it into one record you can trust."
      description="Assist With Moving is a system of record for moves: inventory, box manifests, photo evidence, load plans, and scoped documentation packets. It exists so the details of a move are captured once and stay usable for everyone who needs them."
    >
      <PublicBand>
        <div className="mb-6 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-normal">
            What we believe
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            These principles shape how {product.name} is built — from how AI fits
            in to how your records are shared.
          </p>
        </div>
        <FeatureGrid cards={principleCards} />
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Where the project is
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {product.name} is in active development — we&apos;re building openly
              at {product.domain}. It is early, and we say so honestly rather than
              dressing it up.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The work is organized into focused phases, each one a real part of
              turning a move into a dependable record.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {buildPhases.map((phase) => (
              <div
                key={phase}
                className="rounded-md border border-border p-3 text-sm"
              >
                {phase}
              </div>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-normal">
              <HeartHandshake
                className="size-6 text-primary"
                aria-hidden="true"
              />
              Who&apos;s behind it
            </h2>
          </div>
          <div className="max-w-3xl space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              {product.name} is built by{" "}
              <span className="font-medium text-foreground">Scott Jarvie</span>, an
              Arizona/Utah&ndash;based app designer and artist. It is an
              independent product made by someone who has lived through the mess of
              moving and wanted a record they could actually trust afterward. The
              focus is the mission: an honest, private, AI-optional system of record
              for moves.
            </p>
            <p>
              It is an organizing tool, not an official authority — not affiliated
              with the military, any government agency, insurer, or moving company.
              It helps you prepare and document a move on your terms.
            </p>
            <p>
              To reach us, use the{" "}
              <a
                href={supportDeskUrl("home")}
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                {supportDesk.name}
              </a>
              . It is the single desk for every Assist With product, so it is
              also the way to reach Assist With Moving. Direct email contact is
              not available — there is no support mailbox, and none is planned.
            </p>
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
