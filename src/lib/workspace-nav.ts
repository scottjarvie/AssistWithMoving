export function workspaceBasePathFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "app" && segments[1] === "moves" && segments[2]) {
    return `/app/moves/${segments[2]}`;
  }
  return "/app/dashboard";
}

const dashboardMoveSetupPath = "/app/dashboard#create-move";

// Sections are real pages under the selected move. Outside a move workspace
// there is no section to open yet, so section links land on the dashboard setup
// task instead of looking like a no-op.
export function workspaceNavHref(pathname: string, section?: string) {
  const basePath = workspaceBasePathFromPathname(pathname);
  if (!section) {
    return basePath;
  }
  if (basePath === "/app/dashboard") {
    return dashboardMoveSetupPath;
  }
  return `${basePath}/${section}`;
}
