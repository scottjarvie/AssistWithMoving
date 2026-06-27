import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { MobileCaptureAction } from "@/components/mobile-capture-action";
import { MoveSwitcher } from "@/components/move-switcher";
import { ShellSectionEyebrow } from "@/components/shell-section-eyebrow";
import { WorkspaceNav } from "@/components/workspace-nav";

// Single consistent frame at every screen size: a sticky top bar (brand,
// section, move switcher, account) and ONE bottom nav bar carrying the same
// destinations — Moves, Units, Items, Spaces, Queue, and Add — on phone, tablet,
// and desktop alike. On large screens the bar's content is centered to a sensible
// width so it doesn't stretch edge to edge. The single MoveWorkspaceProvider
// lives one level up, in (product)/layout.tsx, so every region can read the move.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/app"
              aria-label="MovingManifest home"
              className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <BrandMark />
            </Link>
            <span className="hidden sm:inline-flex">
              <ShellSectionEyebrow />
            </span>
            <MoveSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        aria-label="Workspace content"
        className="mx-auto max-w-5xl pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
      >
        {children}
      </main>

      {/* The one and only nav bar — pinned to the bottom at every size. The bar
          background spans full width; its content (5 tabs + the "+" add) is
          centered to a comfortable width so it never stretches across a wide
          monitor. WorkspaceNav supplies the <nav> landmark. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-stretch">
          <WorkspaceNav variant="mobile" />
          <MobileCaptureAction />
        </div>
      </div>
    </div>
  );
}
