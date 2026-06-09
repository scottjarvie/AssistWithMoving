export function workspaceBasePathFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "app" && segments[1] === "moves" && segments[2]) {
    return `/app/moves/${segments[2]}`;
  }
  return "/app/dashboard";
}

export function workspaceNavHref(pathname: string, section?: string) {
  const basePath = workspaceBasePathFromPathname(pathname);
  return section ? `${basePath}#${section}` : basePath;
}
