import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Boxes,
  Camera,
  FileText,
  Lock,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PublicMobileNav } from "@/components/public-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { product } from "@/lib/product";

// Primary, informational-leaning links shown inline on desktop.
const publicNavPrimary = [
  { href: "/features", label: "Features" },
  { href: "/ai", label: "AI assistants" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const;

// Secondary links: surfaced in the footer and the mobile "more" group.
const publicNavSecondary = [
  { href: "/api", label: "API" },
  { href: "/mcp", label: "MCP" },
  { href: "/pcs-moving", label: "PCS moving" },
  { href: "/claims-inventory", label: "Claims inventory" },
  { href: "/privacy", label: "Privacy" },
  { href: "/updates", label: "Updates" },
] as const;

const footerNav = [...publicNavPrimary, ...publicNavSecondary] as const;

export type PublicFeatureCard = {
  title: string;
  copy: string;
  icon: LucideIcon;
};

export function PublicPageChrome({
  eyebrow,
  title,
  description,
  children,
  primaryAction,
  secondaryAction,
  visual,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  primaryAction?: {
    href: string;
    label: string;
  };
  secondaryAction?: {
    href: string;
    label: string;
  };
  visual?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.7fr)] lg:px-8 lg:py-16">
          <div>
            <Badge variant="secondary" className="mb-5">
              {eyebrow}
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {description}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={primaryAction?.href ?? "/sign-up"}>
                  {primaryAction?.label ?? "Create account"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={secondaryAction?.href ?? "/ai"}>
                  {secondaryAction?.label ?? "Use with your AI assistant"}
                </Link>
              </Button>
            </div>
          </div>
          {visual ?? <HowItWorksPanel />}
        </div>
      </section>
      {children}
      <PublicFooter />
    </main>
  );
}

export function PublicHeader() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
      <BrandMark />
      <nav aria-label="Public navigation" className="hidden items-center gap-4 lg:flex">
        {publicNavPrimary.map((item) => (
          <Link
            key={item.href}
            className="text-sm text-muted-foreground hover:text-foreground"
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" className="hidden lg:inline-flex">
          <Link href="/sign-in">
            Sign in
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <div className="lg:hidden">
          <PublicMobileNav primary={publicNavPrimary} secondary={publicNavSecondary} />
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p>{product.name} organizes move records, evidence, and documentation packets.</p>
        <div className="flex flex-wrap gap-4">
          {footerNav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function FeatureGrid({ cards }: { cards: PublicFeatureCard[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="rounded-md border border-border p-4">
          <card.icon className="mb-5 size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-normal">{card.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {card.copy}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PublicBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}

// Honest "how it works" explainer — a labeled workflow diagram, not a
// screenshot of live data. No counts, metrics, or progress bars.
const howItWorksSteps: {
  icon: LucideIcon;
  label: string;
  copy: string;
}[] = [
  {
    icon: Boxes,
    label: "Inventory every room",
    copy: "Catalog items, owners, condition, and values in one place.",
  },
  {
    icon: PackageCheck,
    label: "Box and label",
    copy: "Pack boxes, list contents, and print QR labels you can scan later.",
  },
  {
    icon: Camera,
    label: "Photo evidence",
    copy: "Attach condition, serial, and receipt photos. Originals stay private.",
  },
  {
    icon: Truck,
    label: "Plan the load",
    copy: "Assign boxes to trucks, vehicles, storage, or movers.",
  },
  {
    icon: FileText,
    label: "Export packets",
    copy: "Generate mover, employer, insurance, or PCS packets, scoped to each recipient.",
  },
];

export function HowItWorksPanel() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            How it works
          </p>
          <p className="mt-1 text-lg font-semibold">A move becomes a usable record</p>
        </div>
        <Badge>
          <ShieldCheck aria-hidden="true" />
          scoped packets
        </Badge>
      </div>
      <ol className="space-y-3 py-4">
        {howItWorksSteps.map((step) => (
          <li
            key={step.label}
            className="flex items-start gap-3 rounded-md border border-border bg-background/65 p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <step.icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-semibold">{step.label}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {step.copy}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-md bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        <span className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Lock className="size-4 text-primary" aria-hidden="true" />
          Privacy default
        </span>
        Values, serials, private notes, and sensitive photos stay hidden from
        helper and mover views unless you share them.
      </div>
    </div>
  );
}
