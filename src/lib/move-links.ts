export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}/${encodeURIComponent(section)}` : basePath;
}

export function moveBoxesPath(moveId?: string | null) {
  return moveId ? moveWorkspacePath(moveId, "boxes") : "/app/dashboard";
}

const workspaceAnchorSections: Record<string, string> = {
  "#ai-photo-intake": "ai-review",
  "#ai-planning-suggestions": "load-plan",
  "#ai-review-queue": "ai-review",
  "#ai-text-intake": "ai-review",
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
  "#photos": "photos",
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
  if (!moveId || !section) {
    return anchor;
  }

  return `${moveWorkspacePath(moveId, section)}${anchor}`;
}
