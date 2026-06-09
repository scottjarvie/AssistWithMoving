export function moveWorkspacePath(moveId: string, section?: string) {
  const basePath = `/app/moves/${encodeURIComponent(moveId)}`;
  return section ? `${basePath}#${encodeURIComponent(section)}` : basePath;
}

export function moveBoxesPath(moveId?: string | null) {
  return moveId ? moveWorkspacePath(moveId, "boxes") : "/app/dashboard#boxes";
}
