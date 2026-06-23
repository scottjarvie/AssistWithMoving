"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import { navIcons } from "@/components/workspace-nav-icons";
import {
  workspaceNavChildren,
  type WorkspacePrimaryKey,
} from "@/lib/workspace-nav-items";
import { workspaceNavHref } from "@/lib/workspace-nav";
import { cn } from "@/lib/utils";

// Mobile-only quick links to the screens that now live "inside" a focus page.
// The desktop sidebar already nests these under their parent, so this is hidden
// at xl and up to avoid duplicating the navigation.
export function WorkspaceSubNav({ parent }: { parent: WorkspacePrimaryKey }) {
  const pathname = usePathname();
  const workspace = useOptionalMoveWorkspace();
  const children = workspaceNavChildren(parent, workspace?.featureFlags);

  if (!children.length) {
    return null;
  }

  return (
    <div
      className="-mt-1 flex gap-1.5 overflow-x-auto pb-0.5 xl:hidden"
      aria-label="Related views"
    >
      {children.map((child) => {
        const Icon = navIcons[child.iconKey];
        const href = workspaceNavHref(pathname, child.section, child.hash);
        const active = pathname === workspaceNavHref(pathname, child.section);
        return (
          <Link
            key={child.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors active:bg-muted",
              active && "border-primary/40 bg-primary/10 text-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {child.label}
          </Link>
        );
      })}
    </div>
  );
}
