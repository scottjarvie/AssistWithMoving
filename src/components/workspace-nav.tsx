"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Bot,
  ClipboardList,
  FileStack,
  Images,
  LayoutDashboard,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { workspaceNavHref } from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const navItems: {
  section?: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { section: "inventory", label: "Inventory", icon: ClipboardList },
  { section: "boxes", label: "Boxes", icon: Archive },
  { section: "photos", label: "Photos", icon: Images },
  { section: "load-plan", label: "Load Plan", icon: Truck },
  { section: "move-day", label: "Move Day", icon: ClipboardList },
  { section: "documents", label: "Packets", icon: FileStack },
  { section: "ai", label: "AI Review", icon: Bot },
];

export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="mt-8 space-y-1">
      {navItems.map((item) => {
        const href = workspaceNavHref(pathname, item.section);
        const active =
          item.section === undefined &&
          (pathname === "/app/dashboard" || pathname.startsWith("/app/moves/"));
        return (
          <Link
            key={item.label}
            href={href}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
