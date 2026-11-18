import { AiAccessFaq } from "@/components/ai-access-faq";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ChevronDown, HelpCircle, ShieldCheck } from "lucide-react";

import { PublicBand, PublicPageChrome } from "@/components/public-page-chrome";
import { supportDesk, supportDeskUrl } from "@/lib/support";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Honest answers about Assist With Moving: what it is, accounts, privacy, the bring-your-own AI assistant model, military PCS use, exports, pricing, and affiliation.",
};

import { movingFaqs as faqs } from "@/components/landing/moving-faq";

export default function FaqPage() {
  return (
    <PublicPageChrome
      eyebrow="Questions and answers"
      title="Honest answers about Assist With Moving."
      description="If you are still deciding whether Assist With Moving fits your move, start here. These are plain answers about what it does, how your data stays private, and where it is in development."
      primaryAction={{ href: "/features", label: "See the features" }}
      secondaryAction={{ href: "/ai", label: "How AI assistants help" }}
    >
      <AiAccessFaq />
      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              The short version.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Assist With Moving is the structured record for your move, your
              data stays private by default, and you bring your own AI assistant
              if you want one. It is early — built openly at{" "}
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
                <summary className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-base font-medium text-foreground">
                  <HelpCircle
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="flex-1">{faq.question}</span>
                  <ChevronDown
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
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
            want to see how your assistant connects or how packets stay scoped
            to each recipient, those are the best next reads. If the answer is
            not written down anywhere, check the {supportDesk.name} for its
            current intake status before preparing a request. There is no
            support email address to write to instead.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={supportDeskUrl("home")}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              Support desk
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </a>
            <Link
              href="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              Features
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              Privacy
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
            <Link
              href="/ai"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
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
