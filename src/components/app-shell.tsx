import Link from "next/link";
import { Settings, ShieldCheck } from "lucide-react";

import { AuthControls } from "@/components/auth-controls";
import { BrandMark } from "@/components/brand-mark";
import { MobileAppNav } from "@/components/mobile-capture-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WorkspaceNav } from "@/components/workspace-nav";
import { product } from "@/lib/product";

export function AppShell({
  children,
  section,
}: {
  children: React.ReactNode;
  section: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-sidebar/75 px-4 py-5 backdrop-blur xl:block">
        <Link
          href="/"
          aria-label="MovingManifest home"
          className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <BrandMark />
        </Link>
        <WorkspaceNav />
        <Separator className="my-6" />
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Privacy default
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Helper and mover views hide values, serials, private notes, and
            sensitive photos unless an owner explicitly changes the packet.
          </p>
        </div>
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="min-w-0">
              <div className="xl:hidden">
                <Link href="/" aria-label="MovingManifest home">
                  <BrandMark />
                </Link>
              </div>
              <div className="hidden xl:block">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {section}
                </p>
                <h1 className="truncate text-lg font-semibold">
                  MovingManifest workspace
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {process.env.NODE_ENV === "development" ? (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  Local {product.localUrl.replace("http://", "")}
                </Badge>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">
                  <Settings aria-hidden="true" />
                  Settings
                </Link>
              </Button>
              <AuthControls />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Workspace content"
          className="pb-28 xl:pb-0"
        >
          {children}
        </main>
        <MobileAppNav />
      </div>
    </div>
  );
}
