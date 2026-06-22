"use client";

import { usePathname } from "next/navigation";

import { isGlobalNavActive } from "@/lib/workspace-nav";
import { globalNavItems } from "@/lib/workspace-nav-items";

// The small uppercase eyebrow in the top bar that names the current section.
// The move title itself is shown by the adjacent MoveSwitcher.
export function ShellSectionEyebrow() {
  const pathname = usePathname();
  const active = globalNavItems.find((item) =>
    isGlobalNavActive(pathname, item.match)
  );
  const label = active?.label ?? "Workspace";

  return (
    <p className="shrink-0 text-xs uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
  );
}
