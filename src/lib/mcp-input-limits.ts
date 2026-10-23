/** Bound hosted JSON before mcp-handler parses it. Inline media can still use
 * the host's request allowance; larger originals use the existing source URL
 * upload flow. This limit does not apply to the local stdio transport. */
export const MAX_HOSTED_MCP_REQUEST_BYTES = 5 * 1024 * 1024;
export const MAX_HOSTED_MCP_INPUT_ELEMENTS = 65_536;

function tooLarge(): Response {
  return Response.json({ error: { code: "request_too_large", message: `MCP requests are limited to ${MAX_HOSTED_MCP_REQUEST_BYTES} bytes. Use a source URL for larger media.` } }, { status: 413 });
}

export async function boundHostedMcpRequest(request: Request): Promise<Request | Response> {
  if (request.method !== "POST" || !request.body) return request;
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_HOSTED_MCP_REQUEST_BYTES) {
    await request.body.cancel();
    return tooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HOSTED_MCP_REQUEST_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return Response.json({ error: { code: "invalid_request", message: "The MCP request body could not be read." } }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request, { headers, body: bytes.buffer });
}
