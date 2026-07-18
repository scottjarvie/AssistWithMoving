import { ConvexError } from "convex/values";

export function assertOAuthImageSource(input: { url?: string; base64?: string }) {
  if (input.url) {
    throw new ConvexError(
      "add_images refuses remote URLs because the OAuth gateway cannot safely verify DNS and redirect targets. Fetch the user-approved image in the client and pass base64 instead.",
    );
  }
  if (!input.base64) throw new ConvexError("Provide base64 image data.");
}
