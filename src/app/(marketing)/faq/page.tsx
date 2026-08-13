import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, HelpCircle, ShieldCheck } from "lucide-react";

import { PublicBand, PublicPageChrome } from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Honest answers about Assist With Moving: what it is, accounts, privacy, the bring-your-own AI assistant model, military PCS use, exports, pricing, and affiliation.",
};

// Each FAQ is a question + the honest answer body. Answers may include
// inline links (rendered as React nodes) so we keep `answer` as ReactNode.
type Faq = {
  question: string;
  answer: React.ReactNode;
};

const faqs: Faq[] = [
  {
    question: "What is Assist With Moving?",
    answer: (
      <>
        Assist With Moving is a structured system of record for a move. You catalog
        your inventory, pack and label boxes with their contents, attach photo
        evidence, plan how everything loads onto trucks, vehicles, storage, or
        movers, and export scoped documentation packets when someone needs a
        copy. The goal is one organized record of your move instead of a pile of
        spreadsheets, photos, and sticky notes.
      </>
    ),
  },
  {
    question: "Do I need an account?",
    answer: (
      <>
        Not to learn about it. The public pages — like this one — are readable
        without signing in. You only need an account once you want to save real
        move data: your inventory, boxes, photos, and packets live in your own
        private workspace.
      </>
    ),
  },
  {
    question: "Is my move data private?",
    answer: (
      <>
        Yes, by default. Your original photos and full records stay private to
        you. When you generate a packet for someone else, it is scoped to that
        recipient — values, serial numbers, private notes, and sensitive photos
        stay hidden unless you choose to share them. Different kinds of access
        (your signed-in sessions, API keys you create, and share links) are kept
        on separate paths, so handing someone one does not hand over the others.
      </>
    ),
  },
  {
    question: "How does the AI assistant part work?",
    answer: (
      <>
        You bring your own assistant — Claude, ChatGPT, Codex, or another tool
        you already use. Assist With Moving does not bundle its own AI. You connect
        your assistant either through hosted MCP OAuth or with a scoped API key
        you create yourself and can revoke at any time. The product is the
        structured place your assistant reads from and writes to. See the{" "}
        <Link href="/ai" className="text-primary underline-offset-4 hover:underline">
          AI assistants
        </Link>{" "}
        and{" "}
        <Link href="/mcp" className="text-primary underline-offset-4 hover:underline">
          MCP
        </Link>{" "}
        pages for the details.
      </>
    ),
  },
  {
    question: "Will the AI change my stuff automatically?",
    answer: (
      <>
        No. It is AI review, not AI autopilot. Your assistant can suggest
        inventory entries, categories, box contents, duplicates, and load
        assignments, but a human stays in the loop — you approve changes before
        they land. The product does not quietly rewrite your records on its own.
      </>
    ),
  },
  {
    question: "Can I use it for a military PCS?",
    answer: (
      <>
        Yes. Assist With Moving supports a mixed move with household goods (HHG),
        personally procured (PPM) portions, and personal-transport planning, and
        it can produce PCS-focused packets. Official fields are configurable
        rather than hardcoded to one policy. It is an organizing tool, not an
        official authority — always verify requirements with your transportation
        office.
      </>
    ),
  },
  {
    question: "What can I export?",
    answer: (
      <>
        Documentation packets, scoped to whoever receives them: a mover packet,
        an employer relocation packet, an insurance or claim packet, a PCS
        packet, a donation packet, a storage packet, or a full owner packet for
        yourself. Each one only shows the fields appropriate for that recipient.
      </>
    ),
  },
  {
    question: "How much does it cost?",
    answer: (
      <>
        Assist With Moving is in active development / early access, and pricing is
        not yet announced. We are not stating a price here because there is not a
        confirmed one to share yet.
      </>
    ),
  },
  {
    question:
      "Is Assist With Moving affiliated with the military, insurers, or moving companies?",
    answer: (
      <>
        No. Assist With Moving is an independent organizing tool. It is not an
        official authority and has no affiliation with the military, the
        Department of Defense, insurers, moving companies, or any government
        office. It does not decide whether a claim is paid, whether an insurer or
        office approves anything, or whether a move meets any policy — it just
        helps you keep your move organized and documented.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <PublicPageChrome
      eyebrow="Questions and answers"
      title="Honest answers about Assist With Moving."
      description="If you are still deciding whether Assist With Moving fits your move, start here. These are plain answers about what it does, how your data stays private, and where it is in development."
      primaryAction={{ href: "/features", label: "See the features" }}
      secondaryAction={{ href: "/ai", label: "How AI assistants help" }}
    >
      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">FAQ</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              The short version.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Assist With Moving is the structured record for your move, your data
              stays private by default, and you bring your own AI assistant if
              you want one. It is early — built openly at{" "}
              <span className="text-foreground">movingmanifest.com</span> — so a
              few answers below are honest about what is still in progress.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-md border border-border p-4 open:bg-muted/25"
              >
                <summary className="flex cursor-pointer items-start gap-3 text-base font-medium text-foreground">
                  <HelpCircle
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{faq.question}</span>
                </summary>
                <div className="mt-3 pl-8 text-sm leading-6 text-muted-foreground">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="rounded-md border border-primary/25 bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Still have a question?
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The feature, AI, and privacy pages go deeper than this list. If you
            want to see how your assistant connects or how packets stay scoped to
            each recipient, those are the best next reads.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              Features
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              Privacy
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
            <Link
              href="/ai"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              AI assistants
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}
