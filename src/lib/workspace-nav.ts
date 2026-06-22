// Active state for the global nav is computed from the top-level path segment.
// /app/moves and /app/moves/[moveId] both light up "Moves"; /app/movable-units*
// lights up "Movable Units"; /app/items* lights up "Items".
export function isGlobalNavActive(pathname: string, match: string) {
  return pathname === match || pathname.startsWith(`${match}/`);
}
