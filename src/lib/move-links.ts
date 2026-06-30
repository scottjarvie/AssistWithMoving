export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}/${encodeURIComponent(section)}` : basePath;
}

// Where to navigate when the user switches the active move while keeping the
// page they're on. Shared by both switchers (the top-bar MoveSwitcher and the
// per-move MoveWorkspaceHeader) so they can't drift apart:
//  - On a per-move route (/app/moves/<id>/<section>), swap the move id segment
//    and keep the section.
//  - On a global surface (/app/items, /app/movable-units, …) there is no move id
//    in the URL — selecting the move in workspace context is enough and the page
//    re-renders in place, so return null (no navigation).
const PER_MOVE_SEGMENT = /\/app\/moves\/[^/]+/;
export function buildMoveSwitchTarget(
  pathname: string,
  moveId: string,
): string | null {
  if (PER_MOVE_SEGMENT.test(pathname)) {
    return pathname.replace(
      PER_MOVE_SEGMENT,
      `/app/moves/${encodeURIComponent(moveId)}`,
    );
  }
  return null;
}

// The revamp removed Spaces / Sell / Photos and the per-move Boxes / Inventory
// surfaces from the nav. The orphaned routes now just redirect, so anything that
// used to point a person at one of those sections should aim straight at the new
// home instead of bouncing through a redirect. `resolve(moveId)` lets the Spaces
// entry keep the move id (areas now live on the Start-location config tab) while
// the rest resolve to the global Items / Movable Units surfaces.
const removedSectionDestinations: Record<
  string,
  (moveId: string) => string
> = {
  spaces: (moveId) => `${moveWorkspacePath(moveId, "configure")}#start`,
  boxes: () => "/app/movable-units",
  inventory: () => "/app/items",
  photos: () => "/app/items",
  sell: () => "/app/items",
};

export function moveBoxesPath(moveId?: string | null) {
  // Boxes are now Movable Units. Keep accepting the (now ignored) move id so
  // every existing caller — `moveBoxesPath(moveId)` — still type checks and
  // lands on the new home without each one having to be rewritten. The resolver
  // ignores the id; we pass it through purely to keep this param referenced.
  return removedSectionDestinations.boxes(moveId ?? "");
}

// Former dashboard task anchors. The dashboard surface is gone (now the moves
// home), so any link aimed at one of these just lands on the moves home.
const dashboardAnchors = new Set([
  "#active-moves",
  "#ai-connection",
  "#create-move",
  "#create-move-basics",
  "#create-move-packets",
  "#create-move-pcs",
  "#household-setup",
]);

const workspaceAnchorSections: Record<string, string | null> = {
  "#ai-photo-intake": "ai-review",
  "#ai-planning-suggestions": "load-plan",
  "#ai-review-queue": "ai-review",
  "#ai-text-intake": "ai-review",
  "#add-box": "boxes",
  "#add-inventory": "inventory",
  "#add-photos": "photos",
  "#add-space": "spaces",
  "#add-transport-resource": "load-plan",
  "#box-contents": "boxes",
  "#box-details": "boxes",
  "#box-labels": "boxes",
  "#box-load": "boxes",
  "#box-photos": "boxes",
  "#boxes": "boxes",
  "#bulk-inventory": "inventory",
  "#bulk-paste": "inventory",
  "#capacity-posture": "load-plan",
  "#claim-items": "packets",
  "#claim-metrics": "packets",
  "#claim-packets": "packets",
  "#claim-timeline": "packets",
  "#claims-center": "packets",
  "#capture": "capture",
  "#capture-queue": "capture",
  "#disposition-pipelines": "inventory",
  "#documentation-packets": "packets",
  "#evidence-density": "photos",
  "#estimate-assumptions": "inventory",
  "#estimate-capacity": "inventory",
  "#estimate-summary": "inventory",
  "#estimate-warnings": "inventory",
  "#ingestion-queue": "capture",
  "#inventory": "inventory",
  "#inventory-duplicate-review": "inventory",
  "#inventory-records": "inventory",
  "#layout-blueprint": "plan",
  "#layout-inspect": "plan",
  "#layout-place": "plan",
  "#layout-review": "plan",
  "#layout-studio": "plan",
  "#load-plan": "load-plan",
  "#move-day": "move-day",
  "#move-day-checklist": "move-day",
  "#move-day-exceptions": "move-day",
  "#move-day-offline": "move-day",
  "#move-day-progress": "move-day",
  "#move-contacts": null,
  "#move-questions": null,
  "#packing-debt": null,
  "#packet-configure": "packets",
  "#packet-exports": "packets",
  "#packet-share-links": "packets",
  "#packet-views": "packets",
  "#photo-gaps": "photos",
  "#photo-review": "photos",
  "#photos": "photos",
  "#planning-defaults": null,
  "#planned-items": "inventory",
  "#room-walk": "inventory",
  "#sale-listing": "sell",
  "#sale-pipeline": "sell",
  "#sale-pricing": "sell",
  "#sale-status": "sell",
  "#spaces": "spaces",
  "#transport-resources": "load-plan",
  "#transport-resource-presets": "load-plan",
};

export function moveWorkspaceAnchorPath(
  moveId: string | null | undefined,
  anchor: string
) {
  if (dashboardAnchors.has(anchor)) {
    return "/app/moves";
  }

  const section = workspaceAnchorSections[anchor];
  if (!moveId || !(anchor in workspaceAnchorSections)) {
    return anchor;
  }

  // Anchors that used to land on a removed section (Spaces / Sell / Photos /
  // Boxes / Inventory) go straight to that section's new home. The section-level
  // anchor no longer exists on the new surfaces, so we drop it rather than
  // bouncing through a redirect that would strip it anyway. Spaces is the one
  // exception: its destination is the per-move Start-location config tab.
  if (section && section in removedSectionDestinations) {
    return removedSectionDestinations[section](moveId);
  }

  return `${moveWorkspacePath(moveId, section ?? undefined)}${anchor}`;
}
