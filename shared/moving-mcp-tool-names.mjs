const prefix = "moving_";

// The transport publishes one name while the registry, scope checks and
// receipts continue to use the original name for both forms of a call.
export function listedMovingToolName(name) {
  return `${prefix}${name}`;
}

export function normalizeMovingToolCall(message) {
  const name = message?.params?.name;
  if (message?.method !== "tools/call" || typeof name !== "string" || !name.startsWith(prefix)) return message;
  return { ...message, params: { ...message.params, name: name.slice(prefix.length) } };
}

const uploadAliases = new Set(["upload_photo", "upload_image", "upload_photos", "upload_images"]);
export function listMovingToolNames(message, hideUploadAliases = false) {
  if (!Array.isArray(message?.result?.tools)) return message;
  return { ...message, result: { ...message.result, tools: message.result.tools
    .filter(tool => !hideUploadAliases || !uploadAliases.has(tool.name))
    .map(tool => ({ ...tool, name: listedMovingToolName(tool.name) })) } };
}

export function movingToolRequest(request, original, normalized) {
  if (original === normalized) return request;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  if (headers.get("mcp-name") === original.params.name) headers.set("mcp-name", normalized.params.name);
  return new Request(request, { headers, body: JSON.stringify(normalized) });
}

export async function movingToolListResponse(response, envelope, hideUploadAliases = false) {
  if (envelope?.method !== "tools/list" || !response.ok) return response;
  const contentType = response.headers.get("content-type") ?? "";
  const rename = data => JSON.stringify(listMovingToolNames(JSON.parse(data), hideUploadAliases));
  let body;
  if (contentType.includes("application/json")) {
    body = rename(await response.text());
  } else if (contentType.includes("text/event-stream")) {
    body = (await response.text()).replace(/^data: (\{.*\})$/gm, (_, data) => `data: ${rename(data)}`);
  } else {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, { status: response.status, headers });
}
