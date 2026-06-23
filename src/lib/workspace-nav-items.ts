// The global shell now has exactly three top-level destinations. Per-move work
// (Capture/Inventory/Spaces/Sell/Boxes/Photos/Load Plan/Move Day/Packets/AI
// Review/Layout) moved into tabs inside the move detail surface and is no longer
// part of this global nav.
export type GlobalNavItem = {
  href: string;
  label: string;
  // Shorter label used in the cramped mobile bottom bar (falls back to label).
  shortLabel?: string;
  iconKey: "moves" | "movableUnits" | "items" | "queue";
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
    href: "/app/queue",
    label: "Queue",
    iconKey: "queue",
    match: "/app/queue",
  },
];
