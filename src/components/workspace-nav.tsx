"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BadgeDollarSign,
  Bot,
  Camera,
  ClipboardList,
  DoorOpen,
  FileStack,
  Images,
  LayoutDashboard,
  Map,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import {
  workspaceNavItems,
  type WorkspaceNavItem,
} from "@/lib/workspace-nav-items";
import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const navIcons = {
  dashboard: LayoutDashboard,
  capture: Camera,
  inventory: ClipboardList,
  spaces: DoorOpen,
  sell: BadgeDollarSign,
  boxes: Archive,
  photos: Images,
  layout: Map,
  loadPlan: Truck,
  moveDay: ClipboardList,
  packets: FileStack,
  aiReview: Bot,
} satisfies Record<WorkspaceNavItem["iconKey"], LucideIcon>;

export function WorkspaceNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const workspace = useOptionalMoveWorkspace();
  const mobile = variant === "mobile";
  const navItems = workspaceNavItems(workspace?.featureFlags);

  function handleDashboardHashNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    href: string
  ) {
    if (pathname !== "/app/dashboard") {
      return;
    }

    const navigatingToSetup = href === "/app/dashboard#create-move";
    const clearingSetupHash =
      href === "/app/dashboard" && window.location.hash.length > 0;

    if (!navigatingToSetup && !clearingSetupHash) {
      return;
    }

    event.preventDefault();
    const oldURL = window.location.href;
    window.history.pushState(null, "", href);
    const hashChangeEvent =
      typeof HashChangeEvent === "function"
        ? new HashChangeEvent("hashchange", {
            oldURL,
            newURL: window.location.href,
          })
        : new Event("hashchange");
    window.dispatchEvent(hashChangeEvent);
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        mobile
          ? "flex w-full max-w-full gap-1 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:px-6"
          : "mt-8 space-y-1"
      )}
    >
      {navItems.map((item) => {
        const Icon = navIcons[item.iconKey];
        const href = workspaceNavHref(pathname, item.section);
        const basePath = workspaceBasePathFromPathname(pathname);
        const active =
          item.section === undefined
            ? pathname === basePath
            : href !== basePath && pathname === href;
        return (
          <Link
            key={item.label}
            href={href}
            className={cn(
              "flex items-center text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              mobile
                ? "h-10 shrink-0 gap-2 rounded-md border border-transparent px-3"
                : "h-9 gap-3 rounded-md px-3",
              active && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
            aria-current={active ? "page" : undefined}
            onClick={(event) => handleDashboardHashNavigation(event, href)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
