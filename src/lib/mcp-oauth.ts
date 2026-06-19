import { product } from "@/lib/product";

export const mcpOauthScopes = ["openid", "profile", "email"] as const;

export function siteOriginFromRequest(request: Request) {
  const requestOrigin = originFromRequest(request);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return requestOrigin;

  const configuredOrigin = configured.replace(/\/+$/, "");
  if (shouldUseRequestOrigin(requestOrigin, configuredOrigin)) {
    return requestOrigin;
  }
  return configuredOrigin;
}

export function mcpResourceUrl(request: Request) {
  return `${siteOriginFromRequest(request)}/api/mcp`;
}

export function mcpProtectedResourceMetadataUrl(request: Request) {
  return `${siteOriginFromRequest(
    request
  )}/.well-known/oauth-protected-resource/api/mcp`;
}

export function clerkOauthIssuer() {
  const issuer =
    process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() ??
    process.env.CLERK_FRONTEND_API_URL?.trim();
  return issuer ? issuer.replace(/\/+$/, "") : null;
}

export function mcpProtectedResourceMetadata(request: Request) {
  const issuer = clerkOauthIssuer();
  const resource = mcpResourceUrl(request);

  return {
    resource,
    authorization_servers: issuer ? [issuer] : [],
    scopes_supported: [...mcpOauthScopes],
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256"],
    resource_name: product.name,
    resource_documentation: `${siteOriginFromRequest(request)}/mcp`,
  };
}

export function mcpBearerChallenge(
  request: Request,
  options: {
    error?: string;
    errorDescription?: string;
    scope?: string;
  } = {}
) {
  const params = [
    ["realm", "MovingManifest MCP"],
    ["resource_metadata", mcpProtectedResourceMetadataUrl(request)],
    ["scope", options.scope ?? mcpOauthScopes.join(" ")],
    options.error ? ["error", options.error] : null,
    options.errorDescription
      ? ["error_description", options.errorDescription]
      : null,
  ].filter((entry): entry is [string, string] => Boolean(entry));

  return `Bearer ${params
    .map(([key, value]) => `${key}="${quoteHeaderValue(value)}"`)
    .join(", ")}`;
}

function quoteHeaderValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function originFromRequest(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.trim() ?? "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

function shouldUseRequestOrigin(requestOrigin: string, configuredOrigin: string) {
  try {
    const requestHost = new URL(requestOrigin).hostname;
    const configuredHost = new URL(configuredOrigin).hostname;
    if (requestHost === configuredHost) return false;
    if (requestHost.endsWith(".vercel.app")) return true;
    if (configuredHost === "localhost" && requestHost !== "localhost") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
