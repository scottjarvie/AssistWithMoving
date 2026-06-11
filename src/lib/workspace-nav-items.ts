import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

export type WorkspaceNavItem = {
  section?: string;
  label: string;
  iconKey:
    | "dashboard"
    | "capture"
    | "inventory"
    | "boxes"
    | "photos"
    | "layout"
    | "loadPlan"
    | "moveDay"
    | "packets"
    | "aiReview";
};

const baseWorkspaceNavItems: WorkspaceNavItem[] = [
  { label: "Dashboard", iconKey: "dashboard" },
  { section: "capture", label: "Capture", iconKey: "capture" },
  { section: "inventory", label: "Inventory", iconKey: "inventory" },
  { section: "boxes", label: "Boxes", iconKey: "boxes" },
  { section: "photos", label: "Photos", iconKey: "photos" },
  { section: "load-plan", label: "Load Plan", iconKey: "loadPlan" },
  { section: "move-day", label: "Move Day", iconKey: "moveDay" },
  { section: "packets", label: "Packets", iconKey: "packets" },
  { section: "ai-review", label: "AI Review", iconKey: "aiReview" },
];

const layoutStudioNavItem: WorkspaceNavItem = {
  section: "plan",
  label: "Layout",
  iconKey: "layout",
};

export function workspaceNavItems(flags: EffectiveFeatureFlag[] | undefined) {
  if (!flagEnabled(flags, "layoutStudio", false)) {
    return baseWorkspaceNavItems;
  }

  return [
    ...baseWorkspaceNavItems.slice(0, 5),
    layoutStudioNavItem,
    ...baseWorkspaceNavItems.slice(5),
  ];
}
