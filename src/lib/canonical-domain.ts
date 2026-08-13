export const authenticatedCompatibilityHost = "movingmanifest.com";

const entryHosts = new Set([
  "assistwithmoving.com",
  "www.assistwithmoving.com",
]);

export function getCompatibilityRedirectUrl(
  requestUrl: string,
  requestHost?: string | null,
) {
  const url = new URL(requestUrl);
  const headerHostname = requestHost?.split(":", 1)[0]?.toLowerCase();
  const requestedHostname =
    headerHostname && entryHosts.has(headerHostname)
      ? headerHostname
      : url.hostname.toLowerCase();

  if (!entryHosts.has(requestedHostname)) {
    return null;
  }

  url.protocol = "https:";
  url.hostname = authenticatedCompatibilityHost;
  url.port = "";
  return url;
}
