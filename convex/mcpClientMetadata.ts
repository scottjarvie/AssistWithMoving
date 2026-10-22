"use node";

import { ConvexError, v } from "convex/values";

import { downloadPublicHttpsMedia } from "../mcp-server/media-ingress.mjs";
import { internalAction } from "./_generated/server";
import { MAX_METADATA_BYTES, normalizeClientIdUrl } from "./lib/mcpClientIdentity";

export const METADATA_TIMEOUT_MS = 5_000;

/** Node-only: the default Convex fetch cannot pin a validated DNS destination. */
export async function fetchClientMetadata(
  clientId: string,
  options: Pick<
    NonNullable<Parameters<typeof downloadPublicHttpsMedia>[1]>,
    "lookupFn" | "requestFn" | "timeoutMs"
  > = {},
): Promise<string> {
  normalizeClientIdUrl(clientId);
  const result = await downloadPublicHttpsMedia(clientId, {
    ...options,
    maxBytes: MAX_METADATA_BYTES,
    timeoutMs: options.timeoutMs ?? METADATA_TIMEOUT_MS,
    maxRedirects: 0,
    accept: "application/json",
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(result.bytes);
}

export const fetchDocument = internalAction({
  args: { clientId: v.string() },
  returns: v.string(),
  handler: async (_ctx, { clientId }) => {
    try {
      return await fetchClientMetadata(clientId);
    } catch {
      // Do not expose DNS, socket or internal-network details to the caller.
      throw new ConvexError("That Client ID Metadata Document could not be retrieved safely.");
    }
  },
});
