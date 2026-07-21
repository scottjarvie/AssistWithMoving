import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { MobileCaptureAction } from "@/components/mobile-capture-action";
import { MoveSwitcher } from "@/components/move-switcher";
import { ShellSectionEyebrow } from "@/components/shell-section-eyebrow";
import { WorkspaceNav } from "@/components/workspace-nav";

// Consistent frame at every size: a sticky top bar (brand, section, move
// switcher, account) plus the same destinations — Moves, Units, Items, Spaces,
// Queue, Add — surfaced as a LEFT SIDEBAR on desktop (lg+) and a BOTTOM BAR on
// phone/tablet (< lg). The single MoveWorkspaceProvider lives one level up, in
// (product)/layout.tsx, so every region can read the move.
const SIDEBAR_WIDTH = "lg:w-56";

export function AppShell({
  children,
  workspaceEnabled = true,
}: {
  children: React.ReactNode;
  workspaceEnabled?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/88 backdrop-blur">
        <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Link
              href="/app"
              aria-label="MovingManifest home"
              className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <BrandMark compactOnMobile />
            </Link>
            <span className="hidden sm:inline-flex">
              <ShellSectionEyebrow />
            </span>
            {workspaceEnabled ? <MoveSwitcher /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {workspaceEnabled ? <AccountMenu /> : null}
          </div>
        </div>
      </header>

      {/* Desktop left sidebar — fixed below the header, hidden on phone/tablet. */}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-20 hidden flex-col border-r border-border bg-background px-3 py-4 lg:flex ${SIDEBAR_WIDTH}`}
      >
        <WorkspaceNav variant="sidebar" />
        <div className="mt-auto">
          {workspaceEnabled ? <MobileCaptureAction variant="sidebar" /> : null}
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        aria-label="Workspace content"
        className="overflow-x-clip pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-56"
      >
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* Mobile/tablet bottom bar — hidden on desktop (the sidebar takes over).
          Background spans full width; the 5 tabs + "+" add are centered to a
          comfortable width. WorkspaceNav supplies the <nav> landmark. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-stretch">
          <WorkspaceNav variant="mobile" />
          {workspaceEnabled ? <MobileCaptureAction /> : null}
        </div>
      </div>
    </div>
  );
}
