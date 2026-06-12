export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}/${encodeURIComponent(section)}` : basePath;
}

export function moveBoxesPath(moveId?: string | null) {
  return moveId ? moveWorkspacePath(moveId, "boxes") : "/app/dashboard";
}

const workspaceAnchorSections: Record<string, string> = {
  "#ai-review-queue": "ai-review",
  "#boxes": "boxes",
  "#capacity-posture": "load-plan",
  "#claims-center": "packets",
  "#disposition-pipelines": "inventory",
  "#documentation-packets": "packets",
  "#evidence-density": "photos",
  "#inventory": "inventory",
  "#load-plan": "load-plan",
  "#move-day": "move-day",
  "#photos": "photos",
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

  return moveWorkspacePath(moveId, section);
}
