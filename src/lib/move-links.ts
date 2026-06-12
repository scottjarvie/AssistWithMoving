export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}/${encodeURIComponent(section)}` : basePath;
}

export function moveBoxesPath(moveId?: string | null) {
  return moveId ? moveWorkspacePath(moveId, "boxes") : "/app/dashboard";
}

const workspaceAnchorSections: Record<string, string | null> = {
  "#ai-photo-intake": "ai-review",
  "#ai-planning-suggestions": "load-plan",
  "#ai-review-queue": "ai-review",
  "#ai-text-intake": "ai-review",
  "#add-box": "boxes",
  "#box-contents": "boxes",
  "#box-details": "boxes",
  "#box-labels": "boxes",
  "#box-load": "boxes",
  "#box-photos": "boxes",
  "#boxes": "boxes",
  "#capacity-posture": "load-plan",
  "#claims-center": "packets",
  "#disposition-pipelines": "inventory",
  "#documentation-packets": "packets",
  "#evidence-density": "photos",
  "#estimate-summary": "inventory",
  "#inventory": "inventory",
  "#inventory-duplicate-review": "inventory",
  "#load-plan": "load-plan",
  "#move-day": "move-day",
  "#move-contacts": null,
  "#move-questions": null,
  "#packing-debt": null,
  "#photos": "photos",
  "#planning-defaults": null,
  "#planned-items": "inventory",
  "#room-walk": "inventory",
  "#transport-resources": "load-plan",
};

export function moveWorkspaceAnchorPath(
  moveId: string | null | undefined,
  anchor: string
) {
  if (anchor === "#active-moves") {
    return "/app/dashboard#active-moves";
  }

  const section = workspaceAnchorSections[anchor];
  if (!moveId || !(anchor in workspaceAnchorSections)) {
    return anchor;
  }

  return `${moveWorkspacePath(moveId, section ?? undefined)}${anchor}`;
}
