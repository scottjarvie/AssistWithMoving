"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Bot,
  Camera,
  ClipboardList,
  FileStack,
  Images,
  LayoutDashboard,
  Truck,
  type LucideIcon,
} from "lucide-react";

import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const navItems: {
  section?: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { section: "capture", label: "Capture", icon: Camera },
  { section: "inventory", label: "Inventory", icon: ClipboardList },
  { section: "boxes", label: "Boxes", icon: Archive },
  { section: "photos", label: "Photos", icon: Images },
  { section: "load-plan", label: "Load Plan", icon: Truck },
  { section: "move-day", label: "Move Day", icon: ClipboardList },
  { section: "packets", label: "Packets", icon: FileStack },
  { section: "ai-review", label: "AI Review", icon: Bot },
];

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
      className={cn(
        mobile
          ? "-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
          : "mt-8 space-y-1"
      )}
    >
      {navItems.map((item) => {
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
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
