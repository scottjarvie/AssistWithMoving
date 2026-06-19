import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { product } from "@/lib/product";

const publicNav = [
  { href: "/features", label: "Features" },
  { href: "/ai", label: "AI assistants" },
  { href: "/api", label: "API" },
  { href: "/mcp", label: "MCP" },
  { href: "/pcs-moving", label: "PCS moving" },
  { href: "/claims-inventory", label: "Claims inventory" },
  { href: "/privacy", label: "Privacy" },
] as const;

const footerNav = [...publicNav, { href: "/updates", label: "Updates" }] as const;

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
                <Link
                  href={primaryAction?.href ?? "/app/dashboard"}
                  prefetch={primaryAction ? undefined : false}
                >
                  {primaryAction?.label ?? "Open workspace preview"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={secondaryAction?.href ?? "/sign-up"}>
                  {secondaryAction?.label ?? "Create account"}
                </Link>
              </Button>
            </div>
          </div>
          {visual ?? <PublicProductVisual />}
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
        {publicNav.map((item) => (
          <Link
            key={item.href}
            className="text-sm text-muted-foreground hover:text-foreground"
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Button asChild size="sm">
        <Link href="/sign-in">
          Sign in
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
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

export function PublicProductVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Move record
          </p>
          <p className="mt-1 text-lg font-semibold">PCS mixed move</p>
        </div>
        <Badge>
          <ShieldCheck aria-hidden="true" />
          scoped packets
        </Badge>
      </div>
      <div className="grid gap-3 py-4 sm:grid-cols-3">
        {[
          ["428", "items"],
          ["72", "boxes"],
          ["1,186", "photos"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-md border border-border bg-background/65 p-3">
            <div className="font-mono text-2xl font-semibold">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[
          ["Military movers / HHG", "68%", "boxes, furniture, garage"],
          ["Personal vehicle", "42%", "documents, cameras, medication"],
          ["Storage unit", "31%", "seasonal bins, keepsakes"],
        ].map(([name, value, note]) => (
          <div key={name} className="rounded-md border border-border bg-background/65 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{name}</span>
              <span className="font-mono text-muted-foreground">{value}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: value }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        <span className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Lock className="size-4 text-primary" aria-hidden="true" />
          Privacy default
        </span>
        Values, serials, private notes, and sensitive photos stay hidden from
        helper and mover views unless an owner intentionally shares them.
      </div>
    </div>
  );
}
