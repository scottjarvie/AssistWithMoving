export function workspaceBasePathFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "app" && segments[1] === "moves" && segments[2]) {
    return `/app/moves/${segments[2]}`;
  }
  return "/app/dashboard";
}

// Sections are real pages under the selected move. Outside a move workspace
// there is no section to open, so links fall back to the dashboard where the
// user creates or picks a move.
export function workspaceNavHref(pathname: string, section?: string) {
  const basePath = workspaceBasePathFromPathname(pathname);
  if (!section || basePath === "/app/dashboard") {
    return basePath;
  }
  return `${basePath}/${section}`;
}
