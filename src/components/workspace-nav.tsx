"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import { navIcons } from "@/components/workspace-nav-icons";
import {
  captureNavItem,
  workspaceNavGroups,
  type WorkspaceNavItem,
} from "@/lib/workspace-nav-items";
import {
  workspaceBasePathFromPathname,
  workspaceNavHref,
} from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

export function WorkspaceNav() {
  const pathname = usePathname();
  const workspace = useOptionalMoveWorkspace();
  const groups = workspaceNavGroups(workspace?.featureFlags);
  const basePath = workspaceBasePathFromPathname(pathname);

  function handleDashboardHashNavigation(
    event: React.MouseEvent<HTMLAnchorElement>,
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

  function isActive(item: WorkspaceNavItem) {
    if (item.section === undefined) {
      return pathname === basePath;
    }
    const href = workspaceNavHref(pathname, item.section);
    return href !== basePath && pathname === href;
  }

  const captureHref = workspaceNavHref(pathname, captureNavItem.section);

  return (
    <nav aria-label="Primary" className="mt-6 space-y-4">
      <Link
        href={captureHref}
        onClick={(event) => handleDashboardHashNavigation(event, captureHref)}
        className="flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add to queue
      </Link>

      <div className="space-y-1.5">
        {groups.map(({ primary, children }) => (
          <div key={primary.key}>
            <NavLink
              item={primary}
              active={isActive(primary)}
              pathname={pathname}
              onDashboardHashNavigation={handleDashboardHashNavigation}
            />
            {children.length ? (
              <div className="ml-[1.05rem] mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                {children.map((child) => (
                  <NavLink
                    key={child.key}
                    item={child}
                    active={isActive(child)}
                    pathname={pathname}
                    variant="child"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
  pathname,
  variant = "primary",
  onDashboardHashNavigation,
}: {
  item: WorkspaceNavItem;
  active: boolean;
  pathname: string;
  variant?: "primary" | "child";
  onDashboardHashNavigation?: (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => void;
}) {
  const Icon = navIcons[item.iconKey];
  const href = workspaceNavHref(pathname, item.section, item.hash);
  const child = variant === "child";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        child
          ? "h-8 gap-2.5 px-3 text-[0.8rem] text-muted-foreground"
          : "h-9 gap-3 px-3 text-sm font-medium text-foreground/90",
        active &&
          "bg-sidebar-accent text-sidebar-accent-foreground hover:text-sidebar-accent-foreground"
      )}
      aria-current={active ? "page" : undefined}
      onClick={(event) => onDashboardHashNavigation?.(event, href)}
    >
      <Icon
        className={cn(child ? "size-3.5" : "size-4", "shrink-0")}
        aria-hidden="true"
      />
      {item.label}
    </Link>
  );
}
