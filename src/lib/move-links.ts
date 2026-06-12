export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}/${encodeURIComponent(section)}` : basePath;
}

export function moveBoxesPath(moveId?: string | null) {
  return moveId ? moveWorkspacePath(moveId, "boxes") : "/app/dashboard";
}

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
  "#claims-center": "packets",
  "#capture": "capture",
  "#capture-queue": "capture",
  "#disposition-pipelines": "inventory",
  "#documentation-packets": "packets",
  "#evidence-density": "photos",
  "#estimate-summary": "inventory",
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
    return `/app/dashboard${anchor}`;
  }

  const section = workspaceAnchorSections[anchor];
  if (!moveId || !(anchor in workspaceAnchorSections)) {
    return anchor;
  }

  return `${moveWorkspacePath(moveId, section ?? undefined)}${anchor}`;
}
