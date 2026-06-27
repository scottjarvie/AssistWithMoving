import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import {
  AddToQueueButton,
  AddToQueueSidebarSecondaryActions,
} from "@/components/add-to-queue-button";
import { BrandMark } from "@/components/brand-mark";
import { MobileCaptureAction } from "@/components/mobile-capture-action";
import { MoveSwitcher } from "@/components/move-switcher";
import { ShellSectionEyebrow } from "@/components/shell-section-eyebrow";
import { Separator } from "@/components/ui/separator";
import { WorkspaceNav } from "@/components/workspace-nav";

// Three-region product frame: a fixed sidebar (xl+), a sticky top bar, and the
// main content area. On mobile the sidebar collapses to a bottom tab bar plus a
// floating capture action. The single MoveWorkspaceProvider lives one level up,
// in (product)/layout.tsx, so every region here can read the active move.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-sidebar/75 px-4 py-5 backdrop-blur xl:flex">
        <Link
          href="/app"
          aria-label="MovingManifest home"
          className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <BrandMark />
        </Link>

        <div className="mt-8">
          <WorkspaceNav />
        </div>

        <div className="mt-6 space-y-2">
          <AddToQueueButton variant="sidebar" />
          <AddToQueueSidebarSecondaryActions />
        </div>

        <Separator className="my-6" />

        <div className="mt-auto rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Privacy default
          </div>
          <p className="mt-1 text-[0.7rem] leading-4 text-muted-foreground">
            Helper and mover views hide values, serials, and private notes unless
            an owner changes the packet.
          </p>
        </div>
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="xl:hidden">
                <Link href="/app" aria-label="MovingManifest home">
                  <BrandMark />
                </Link>
              </div>
              <div className="hidden min-w-0 items-center gap-3 xl:flex">
                <ShellSectionEyebrow />
                <MoveSwitcher />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AccountMenu />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Workspace content"
          className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] xl:pb-0"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom bar: the 5 global nav tabs + a compact "+" add button,
          pinned to the very bottom (hidden on xl+). The "+" is a real cell, not
          a floating FAB. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur xl:hidden">
        <WorkspaceNav variant="mobile" />
        <MobileCaptureAction />
      </div>
    </div>
  );
}
