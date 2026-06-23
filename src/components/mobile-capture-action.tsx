"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  ClipboardList,
  Home,
  Inbox,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import {
  captureNavItem,
  primaryNavItems,
  type WorkspaceNavItem,
} from "@/lib/workspace-nav-items";
import { workspaceNavHref } from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

const mobileNavIcons = {
  home: Home,
  items: ClipboardList,
  boxes: Archive,
  queue: Inbox,
} as const;

export function MobileAppNav() {
  const pathname = usePathname();
  const workspace = useOptionalMoveWorkspace();
  const moveId = workspace?.moveId;
  const captureHref = mobileHref(pathname, moveId, captureNavItem);
  const captureActive = isActive(pathname, moveId, captureNavItem);

  // Split the four focus tabs around the center capture button.
  const leading = primaryNavItems.slice(0, 2);
  const trailing = primaryNavItems.slice(2);

  return (
    <nav
      aria-label="Mobile app navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)] shadow-[0_-10px_30px_rgba(0,0,0,0.22)] backdrop-blur xl:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {leading.map((item) => (
          <MobileAppNavLink
            key={item.key}
            item={item}
            href={mobileHref(pathname, moveId, item)}
            active={isActive(pathname, moveId, item)}
          />
        ))}

        <Link
          href={captureHref}
          className={cn(
            "mx-auto flex size-14 -translate-y-3 items-center justify-center rounded-full border border-primary/35 bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:translate-y-[-0.6rem] active:scale-95",
            captureActive && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
          )}
          aria-label="Add to queue"
          aria-current={captureActive ? "page" : undefined}
        >
          <Plus className="size-7" aria-hidden="true" />
        </Link>

        {trailing.map((item) => (
          <MobileAppNavLink
            key={item.key}
            item={item}
            href={mobileHref(pathname, moveId, item)}
            active={isActive(pathname, moveId, item)}
          />
        ))}
      </div>
    </nav>
  );
}

function MobileAppNavLink({
  item,
  href,
  active,
}: {
  item: WorkspaceNavItem;
  href: string;
  active: boolean;
}) {
  const Icon: LucideIcon =
    mobileNavIcons[item.key as keyof typeof mobileNavIcons] ?? ClipboardList;

  return (
    <Link
      href={href}
      className={cn(
        "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[0.68rem] font-medium leading-none text-muted-foreground transition-colors active:bg-muted",
        active && "bg-muted text-foreground"
      )}
      aria-label={item.label === "Home" ? "Dashboard" : item.label}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function mobileHref(
  pathname: string,
  moveId: string | null | undefined,
  item: WorkspaceNavItem
) {
  if (!moveId) {
    return workspaceNavHref(pathname, item.section, item.hash);
  }

  const basePath = `/app/moves/${moveId}`;
  if (!item.section) {
    return basePath;
  }
  const sectionPath = `${basePath}/${item.section}`;
  return item.hash ? `${sectionPath}#${item.hash}` : sectionPath;
}

// Highlight the active tab by its section path, ignoring the tab hash. Capture
// (+) and Queue both point at /capture; the + is a distinct FAB, so it is fine
// for both to read as active there.
function isActive(
  pathname: string,
  moveId: string | null | undefined,
  item: WorkspaceNavItem
) {
  if (!item.section) {
    return moveId
      ? pathname === `/app/moves/${moveId}`
      : pathname === "/app/dashboard";
  }
  return moveId ? pathname === `/app/moves/${moveId}/${item.section}` : false;
}
