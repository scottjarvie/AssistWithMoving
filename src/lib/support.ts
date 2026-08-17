// Support for Assist With Moving runs through one place: the central Assist
// With Life support desk. No Assist With site runs a mailbox, and none is
// planned, so there is no support, contact, or privacy email address to
// publish anywhere in this product. Public copy should say that plainly rather
// than leaving people hunting for an address that does not exist.
//
// The desk validates a registered source key, a contract version, and a small
// page-key allowlist (`assist-with-moving` and the keys below are registered
// there). Sending that context lets the desk label an incoming report with the
// product and area it came from without ever receiving a raw path or record id.
export const supportDesk = {
  name: "Assist With Life support desk",
  baseUrl: "https://assistwithlife.com/support",
  sourceId: "assist-with-moving",
  contextVersion: 1,
} as const;

/** Coarse areas the desk recognizes for Assist With Moving. */
export type SupportPageKey =
  | "home"
  | "inventory"
  | "boxes"
  | "layout-studio"
  | "transport"
  | "costs";

/**
 * Build the support desk link for a public page. Omitting `page` still sends
 * the product so the desk knows the report came from Assist With Moving.
 */
export function supportDeskUrl(page?: SupportPageKey) {
  const params = new URLSearchParams({
    v: String(supportDesk.contextVersion),
    source: supportDesk.sourceId,
  });
  if (page) params.set("page", page);
  return `${supportDesk.baseUrl}?${params.toString()}`;
}
