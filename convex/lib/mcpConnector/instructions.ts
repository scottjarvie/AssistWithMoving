import connectionPolicy from "../../../shared/ai-connection-policy.json";
import { buildInstructions } from "./contract";

const opening = "Assist With Moving is the system of record for a household move: inventory items, boxes, photos, rooms/spaces, transport resources, load plans, and exports.";
const oauthAuthority = "ACCESS. New AI connections get all entitled current and future scopes, all owned moves, and no end date unless earlier restricted, unreleased OAuth connections set a floor: every new connection starts with the limits of your most limited AI. Existing client ids keep their own limits.";
const keyAuthority = "API keys use the limits deliberately chosen by the person, with no forced end date. Keys and OAuth AIs never feed each other’s floor.";
const ownConnection = "When the person asks, narrow your own connection with moving_reduce_connection: remove powers, set or shorten an end date, pause or revoke. Use opId and expectedVersion. You can never widen, resume or restore it. Only the person can, at https://movingmanifest.com/settings/ai; signing in again changes nothing.";
const safety = "Archive and restore are allowed. Archive is the destructive default and it is reversible. Permanent deletion, including deleting your account, spending money and messaging are never available. Household invitations stay website-only. Your AI may publish or create share links: scrub secrets first; obvious secrets are refused, and contact details get one summary with counts. The person and AI can unpublish with any active grant.";
const publishing = "Send acknowledgeContactDetails with the email, phone and address counts exactly equal to what was found for the whole batch, including on the first call. Business contact details are expected; remove only the person’s own private details. Edits, additions, moves, duplicates and restores reachable by a share link also count as publishing and are checked before commit. A refused restore can use restorePrivately:true to revoke affected links.";
const queue = connectionPolicy.instructions.slice(connectionPolicy.instructions.indexOf("When the person asks you to add work"));
const canonicalGuidance = [
  "Call moving_get_move_brief first and use only returned move and record IDs.",
  "Only tools inside the current grant are listed. moving_describe_connection remains available when the connection is stopped.",
  "Search before creating duplicates; hydrate only the records needed for the work.",
  "Use moving_get_evidence_media for private photos rather than normal web fetch.",
  "Use moving_save_complete_result for a normal finished workflow and granular save tools for corrections.",
  "Record blocked, gated, failed, and not-relevant sources honestly.",
  "A Queue directive says what the person wants; it never widens this grant. If authority is missing, ask the smallest question with moving_ask_queue_question instead of assuming.",
];
const apiGuidance = [
  "Start every session with moving_get_api_context to confirm the key's scopes and any move restriction, then list or set up a move.",
  "Set up the move and its rooms, then batch items or add them from photos. Create and pack boxes, upload photos, suggest assignments and get the move summary.",
  "Prefer batch tools over repeated single calls. Most write tools accept dryRun for a safe preview and an idempotencyKey for retries.",
];

export type ConnectorState = { status: string; changedAt?: number | null; expiresAt?: number | null };

export function movingConnectorInstructions(door: "canonical" | "legacy" | "apiKey", state?: ConnectorState) {
  const key = door === "apiKey";
  const authority = [oauthAuthority, keyAuthority, ownConnection, safety].join(" ");
  const connectionNow = key
    ? "Call moving_get_api_context to inspect this connection's actual state, reason, end date and revision."
    : `This connection is ${state?.status ?? "limited"} (changed ${state?.changedAt ?? "date unavailable"}, end date ${state?.expiresAt ?? "none"}); call moving_describe_connection for its actual limits, reason and revision.`;
  const guidance = door === "canonical" ? canonicalGuidance : key ? apiGuidance : [];
  return buildInstructions({ opening, authority, connectionNow, sections: [...guidance, publishing, queue] });
}
