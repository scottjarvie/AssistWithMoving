export type McpEndpointRoutingInput = {
  pathname: string;
  method: string;
  accept?: string | null;
  authorization?: string | null;
  contentType?: string | null;
  mcpProtocolVersion?: string | null;
  mcpSessionId?: string | null;
  nextRouterPrefetch?: string | null;
  nextRouterStateTree?: string | null;
  rsc?: string | null;
  search?: string | null;
};

export function shouldRouteMcpSetupRequestToEndpoint({
  pathname,
  method,
  accept,
  authorization,
  contentType,
  mcpProtocolVersion,
  mcpSessionId,
  nextRouterPrefetch,
  nextRouterStateTree,
  rsc,
  search,
}: McpEndpointRoutingInput) {
  if (!isMcpSetupPath(pathname)) return false;

  const normalizedMethod = method.toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) return true;

  if (authorization?.trim()) return true;
  if (mcpProtocolVersion?.trim() || mcpSessionId?.trim()) return true;

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (
    normalizedContentType.includes("application/json") ||
    normalizedContentType.includes("json-rpc")
  ) {
    return true;
  }

  const normalizedAccept = accept?.toLowerCase().trim() ?? "";
  if (
    isNextPageRequest({
      accept: normalizedAccept,
      nextRouterPrefetch,
      nextRouterStateTree,
      rsc,
      search,
    })
  ) {
    return false;
  }

  if (
    normalizedAccept.includes("application/json") ||
    normalizedAccept.includes("text/event-stream") ||
    normalizedAccept.includes("application/vnd.mcp")
  ) {
    return true;
  }

  if (!normalizedAccept || normalizedAccept === "*/*") return false;

  return !normalizedAccept.includes("text/html");
}

function isMcpSetupPath(pathname: string) {
  return pathname.replace(/\/+$/, "") === "/mcp";
}

function isNextPageRequest({
  accept,
  nextRouterPrefetch,
  nextRouterStateTree,
  rsc,
  search,
}: {
  accept: string;
  nextRouterPrefetch?: string | null;
  nextRouterStateTree?: string | null;
  rsc?: string | null;
  search?: string | null;
}) {
  if (accept.includes("text/html") || accept.includes("text/x-component")) {
    return true;
  }
  if (nextRouterPrefetch?.trim() || nextRouterStateTree?.trim()) {
    return true;
  }
  if (rsc?.trim()) {
    return true;
  }

  const params = new URLSearchParams((search ?? "").replace(/^\?/, ""));
  return params.has("_rsc") || params.has("rsc");
}
