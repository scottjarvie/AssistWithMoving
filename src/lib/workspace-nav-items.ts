// Top-level global destinations shown in both the desktop sidebar and the mobile
// bottom bar. Most per-move work (Capture/Inventory/Sell/Boxes/Photos/Load
// Plan/Move Day/Packets/AI Review/Layout) lives in tabs inside the move detail
// surface; these are the cross-move workspaces. The mobile bottom bar grid in
// workspace-nav.tsx is sized to this list — keep grid-cols in sync when adding
// or removing an item.
export type GlobalNavItem = {
  href: string;
  label: string;
  // Shorter label used in the cramped mobile bottom bar (falls back to label).
  shortLabel?: string;
  iconKey: "moves" | "movableUnits" | "items" | "spacesTransport" | "queue";
  // The active state matches any path that starts with this segment prefix.
  match: string;
};

export const globalNavItems: GlobalNavItem[] = [
  {
    href: "/app/moves",
    label: "Moves",
    iconKey: "moves",
    match: "/app/moves",
  },
  {
    href: "/app/movable-units",
    label: "Movable Units",
    shortLabel: "Units",
    iconKey: "movableUnits",
    match: "/app/movable-units",
  },
  {
    href: "/app/items",
    label: "Items",
    iconKey: "items",
    match: "/app/items",
  },
  {
    href: "/app/spaces-transport",
    label: "Spaces & Transport",
    shortLabel: "Spaces",
    iconKey: "spacesTransport",
    match: "/app/spaces-transport",
  },
  {
    href: "/app/queue",
    label: "Queue",
    iconKey: "queue",
    match: "/app/queue",
  },
];
