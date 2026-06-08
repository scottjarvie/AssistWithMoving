import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Camera,
  FileText,
  Lock,
  Map,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { product } from "@/lib/product";

const packets = [
  "PCS / HHG / PPM",
  "Moving company",
  "Employer relocation",
  "Insurance claim",
  "Donation pickup",
  "Storage manifest",
];

const signalCards = [
  { label: "Items tracked", value: "428", icon: Boxes },
  { label: "Box labels", value: "72", icon: PackageCheck },
  { label: "Photo evidence", value: "1,186", icon: Camera },
  { label: "Load resources", value: "6", icon: Truck },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <BrandMark />
        <nav aria-label="Public navigation" className="hidden items-center gap-6 md:flex">
          <a className="text-sm text-muted-foreground hover:text-foreground" href="#packets">
            Packets
          </a>
          <a className="text-sm text-muted-foreground hover:text-foreground" href="#privacy">
            Privacy
          </a>
          <Link
            className="text-sm text-muted-foreground hover:text-foreground"
            href="/app/dashboard"
            prefetch={false}
          >
            Preview
          </Link>
        </nav>
        <Button asChild size="sm">
          <Link href="/sign-in">
            Sign in
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-84px)] w-full max-w-7xl items-center gap-10 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="mb-5">
            MovingManifest is building at {product.domain}
          </Badge>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            The manifest for everything that moves.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Inventory every item, box every room, attach photo evidence, plan
            every load, and export the right documentation packet for movers,
            employers, insurance, storage, donations, or a military PCS.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/app/dashboard" prefetch={false}>
                Open workspace preview
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-up">Create account</Link>
            </Button>
          </div>
        </div>

        <div
          className="relative lg:min-h-[700px]"
          aria-label="MovingManifest product preview"
        >
          <div className="rounded-lg border border-border bg-card shadow-2xl shadow-black/30 lg:absolute lg:inset-x-0 lg:top-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  PCS mixed move
                </p>
                <h2 className="text-lg font-semibold">Jarvie household</h2>
              </div>
              <Badge>
                <ShieldCheck aria-hidden="true" />
                private originals
              </Badge>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              {signalCards.map((card) => (
                <div key={card.label} className="rounded-md border border-border bg-background/65 p-3">
                  <card.icon className="mb-4 size-4 text-primary" aria-hidden="true" />
                  <div className="font-mono text-2xl font-semibold">{card.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{card.label}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-md border border-border bg-background/65">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Map className="size-4 text-primary" aria-hidden="true" />
                    Load plan
                  </div>
                  <span className="text-xs text-muted-foreground">capacity safe</span>
                </div>
                <div className="space-y-3 p-4">
                  {[
                    ["Truck", "68%", "HHG boxes, furniture"],
                    ["Personal car", "42%", "documents, medication, cameras"],
                    ["Storage", "31%", "seasonal bins, keepsakes"],
                  ].map(([name, value, note]) => (
                    <div key={name}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span>{name}</span>
                        <span className="font-mono text-muted-foreground">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: value }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/65" id="packets">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                  <FileText className="size-4 text-accent" aria-hidden="true" />
                  Documentation packets
                </div>
                <div className="grid gap-2 p-4">
                  {packets.map((packet) => (
                    <div
                      key={packet}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span>{packet}</span>
                      <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid gap-3 p-4 md:grid-cols-3" id="privacy">
              {[
                ["Owner archive", "Full record with private values and originals."],
                ["Mover view", "Load instructions without private household data."],
                ["Claims packet", "Focused evidence with timestamps and redaction."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-md bg-muted/45 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Lock className="size-4 text-primary" aria-hidden="true" />
                    {title}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
