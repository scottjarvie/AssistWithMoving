"use client";

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

  return (
    <nav
      aria-label="Primary"
      className={cn(
        mobile
          ? "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
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
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
