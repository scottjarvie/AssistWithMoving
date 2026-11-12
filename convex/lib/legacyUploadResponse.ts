import { aiRefusal, type UploadRefusal } from "./usageLimits/refusal";

/** Decode successful gateway data, never an exception's message. The persisted
 * gateway otherwise serializes a native tool error inside a successful result. */
export async function legacyUploadResponse(response: Response): Promise<Response> {
  if (!response.ok) return response;
  const decorate = (line: string) => {
    const envelope = JSON.parse(line);
    const result = envelope.result;
    if (result?.isError === false && result.content?.[0]?.type === "text") {
      const data = JSON.parse(result.content[0].text);
      if (data?.isError === true && ["AUDIO_TOO_LONG", "INVALID_AUDIO_CONTAINER", "AUDIO_HAS_VIDEO", "USAGE_LIMIT_REACHED", "FILE_TOO_LARGE", "REQUEST_TOO_LARGE", "OPERATION_ID_REQUIRED", "OPERATION_CONFLICT"].includes(data.structuredContent?.code)) envelope.result = aiRefusal(data.structuredContent as UploadRefusal);
    }
    return JSON.stringify(envelope);
  };
  const text = await response.text();
  const body = response.headers.get("content-type")?.includes("text/event-stream") ? text.replace(/^data: (.+)$/gm, (_, data) => `data: ${decorate(data)}`) : decorate(text);
  return new Response(body, { status: response.status, headers: response.headers });
}
