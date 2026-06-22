"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  PackageCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { globalNavItems, type GlobalNavItem } from "@/lib/workspace-nav-items";
import { isGlobalNavActive } from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const navIcons = {
  moves: Truck,
  movableUnits: PackageCheck,
  items: ClipboardList,
} satisfies Record<GlobalNavItem["iconKey"], LucideIcon>;

export function WorkspaceNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const mobile = variant === "mobile";

  return (
    <nav
      aria-label="Primary"
      className={cn(mobile ? "grid grow grid-cols-3" : "space-y-1")}
    >
      {globalNavItems.map((item) => {
        const Icon = navIcons[item.iconKey];
        const active = isGlobalNavActive(pathname, item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center text-sm transition-colors",
              mobile
                ? "h-14 flex-col justify-center gap-1 text-xs text-muted-foreground"
                : "h-9 gap-3 rounded-md px-3 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active &&
                (mobile
                  ? "text-foreground"
                  : "bg-sidebar-accent text-sidebar-accent-foreground")
            )}
          >
            <Icon
              className={cn(mobile ? "size-5" : "size-4")}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
