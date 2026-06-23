import {
  flagEnabled,
  type EffectiveFeatureFlag,
  type FeatureFlagKey,
} from "@/lib/feature-flags";

// Icon keys map to lucide icons inside the nav components, so the data layer
// stays free of React imports.
export type WorkspaceNavIconKey =
  | "home"
  | "items"
  | "capture"
  | "boxes"
  | "queue"
  | "spaces"
  | "sell"
  | "photos"
  | "layout"
  | "loadPlan"
  | "moveDay"
  | "packets"
  | "aiReview";

// The focus destinations that lead the menu on both mobile and desktop.
export type WorkspacePrimaryKey = "home" | "items" | "boxes" | "queue";

export type WorkspaceNavItem = {
  key: string;
  // undefined section => the move home (overview) / dashboard fallback.
  section?: string;
  // Optional tab hash opened within the section (e.g. the queue tab of capture).
  hash?: string;
  label: string;
  iconKey: WorkspaceNavIconKey;
};

type SecondaryNavItem = WorkspaceNavItem & {
  parent: WorkspacePrimaryKey;
  flag?: FeatureFlagKey;
};

// Four focus destinations. These are the bottom-bar tabs on mobile and the
// prominent top group of the desktop sidebar.
export const primaryNavItems: WorkspaceNavItem[] = [
  { key: "home", label: "Home", iconKey: "home" },
  { key: "items", section: "inventory", label: "Items", iconKey: "items" },
  { key: "boxes", section: "boxes", label: "Boxes", iconKey: "boxes" },
  {
    key: "queue",
    section: "capture",
    hash: "ingestion-queue",
    label: "Queue",
    iconKey: "queue",
  },
];

// The capture/add action — the center FAB on mobile, a lead button on desktop.
export const captureNavItem: WorkspaceNavItem = {
  key: "capture",
  section: "capture",
  label: "Add",
  iconKey: "capture",
};

// Secondary destinations are "inside the move": each nests under one focus
// destination. Desktop shows them grouped/indented beneath their parent; mobile
// reaches them from inside the parent page (sub-nav), keeping the bottom bar to
// the four focus tabs.
const secondaryNavItems: SecondaryNavItem[] = [
  { key: "spaces", section: "spaces", label: "Spaces", iconKey: "spaces", parent: "items" },
  { key: "photos", section: "photos", label: "Photos", iconKey: "photos", parent: "items" },
  { key: "sell", section: "sell", label: "Sell", iconKey: "sell", parent: "items" },
  {
    key: "floorplans",
    section: "floorplans",
    label: "Floorplans",
    iconKey: "layout",
    parent: "boxes",
    flag: "layoutStudio",
  },
  { key: "loadPlan", section: "load-plan", label: "Load Plan", iconKey: "loadPlan", parent: "boxes" },
  { key: "moveDay", section: "move-day", label: "Move Day", iconKey: "moveDay", parent: "boxes" },
  { key: "aiReview", section: "ai-review", label: "AI Review", iconKey: "aiReview", parent: "queue" },
  { key: "packets", section: "packets", label: "Packets", iconKey: "packets", parent: "home" },
];

export type WorkspaceNavGroup = {
  primary: WorkspaceNavItem;
  children: WorkspaceNavItem[];
};

// Group secondary items under their focus parent for the desktop sidebar,
// dropping any whose feature flag is off.
export function workspaceNavGroups(
  flags: EffectiveFeatureFlag[] | undefined
): WorkspaceNavGroup[] {
  const visibleSecondary = secondaryNavItems.filter(
    (item) => !item.flag || flagEnabled(flags, item.flag, false)
  );
  return primaryNavItems.map((primary) => ({
    primary,
    children: visibleSecondary.filter((item) => item.parent === primary.key),
  }));
}

// The child destinations nested under one focus destination — used by the
// in-page sub-nav so the focus pages expose what now lives "inside" them.
export function workspaceNavChildren(
  parent: WorkspacePrimaryKey,
  flags: EffectiveFeatureFlag[] | undefined
): WorkspaceNavItem[] {
  return secondaryNavItems.filter(
    (item) =>
      item.parent === parent && (!item.flag || flagEnabled(flags, item.flag, false))
  );
}
