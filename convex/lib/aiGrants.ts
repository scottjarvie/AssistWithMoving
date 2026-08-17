/**
 * The Moving product grant boundary.
 *
 * OAuth proves *who* is calling. A grant, read fresh from this database on
 * every discovery and every call, decides *what* they may do. That split is
 * the whole point: a token cannot be un-issued, but a grant can be revoked and
 * the very next call refused.
 *
 * Nothing in this module trusts a token scope. Clerk currently issues
 * identity-only scopes (`openid profile email`), and even if it issued more,
 * the product ceiling below is what applies. A broader token never widens a
 * grant; an omitted scope always denies.
 */
import { ConvexError } from "convex/values";

/**
 * Bumped whenever the consent text, scope meanings, or ceiling lists change.
 * Stored on each grant so a person can later see exactly what they approved,
 * rather than today's rendering of it.
 */
export const GRANT_BOUNDARY_VERSION = "2026-08-16";

export const movingScopes = [
  "moving.context.read",
  "moving.evidence.read",
  "moving.work.write",
  "moving.queue.work",
  "moving.archive",
] as const;

export type MovingScope = (typeof movingScopes)[number];

export type MovingScopeInfo = {
  scope: MovingScope;
  /** Plain-language label a person reads before approving. */
  label: string;
  /** What approving this actually allows. */
  grants: string;
  /** The explicit boundary. Read scopes must never imply their write sibling. */
  doesNotImply: string;
  writes: boolean;
};

/**
 * The five canonical scopes, with their does-not-imply boundaries stated as
 * product copy rather than as a comment. `/settings/ai`, the consent snapshot,
 * `/ai`, and the plain-text AI guides all render from this one array.
 */
export const MOVING_SCOPES: readonly MovingScopeInfo[] = [
  {
    scope: "moving.context.read",
    label: "Read the move context you choose",
    grants:
      "Route, dates, rooms and places, belongings and boxes, decisions, estimates, saved plan results, source checks, and summaries of your Queue — for the moves you select.",
    doesNotImply:
      "It does not open your private photos or files, change anything, claim or complete Queue work, archive a record, export, or share.",
    writes: false,
  },
  {
    scope: "moving.evidence.read",
    label: "Open the private photos and files for that work",
    grants:
      "The private move evidence needed for the approved work, returned as protected content through Moving rather than a storage link.",
    doesNotImply:
      "It does not allow uploading, sharing, publishing, exporting, or reaching evidence outside the moves you selected. Reading context does not include this — it is a separate approval.",
    writes: false,
  },
  {
    scope: "moving.work.write",
    label: "Save the work you asked for",
    grants:
      "Saving move context, inventory, decisions, estimates, plan sections, source checks, and one complete reviewed result — replay-safe, so a retry corrects instead of duplicating.",
    doesNotImply:
      "It does not claim or complete Queue handoffs, archive or delete anything, manage people, export, share, or take any action outside Moving.",
    writes: true,
  },
  {
    scope: "moving.queue.work",
    label: "Work the Queue handoffs you hand over",
    grants:
      "Listing the work actually waiting for your AI, claiming and releasing it, asking you the smallest Needs you question, and marking it Done with its result attached.",
    doesNotImply:
      "It does not widen what your AI may read or write. A Queue instruction is what you want, never permission — the grant decides the data and the operations.",
    writes: true,
  },
  {
    scope: "moving.archive",
    label: "Retire records that turned out to be wrong",
    grants:
      "Reversible archive and restore for belongings, boxes, rooms and places, and planning records. You can put any of it back.",
    doesNotImply:
      "It does not permanently delete anything, delete your account, archive a whole move, export, or publish. Permanent deletion stays a signed-in action you take yourself.",
    writes: true,
  },
] as const;

export function scopeInfo(scope: MovingScope): MovingScopeInfo {
  const info = MOVING_SCOPES.find((entry) => entry.scope === scope);
  if (!info) throw new Error(`Unknown Moving scope ${scope}`);
  return info;
}

/**
 * The product ceiling. No grant, and no token however broad, reaches any of
 * this. These are enforced structurally — there is simply no tool for them —
 * and published so a person can read the limit rather than infer it.
 */
export const NEVER_EXPOSED = [
  "Another household's or another person's moves, belongings, evidence, or Queue, without exception.",
  "A storage link to a private photo or file. Evidence is returned through Moving or not at all.",
  "Evidence outside the moves you selected on this connection.",
  "Your account identity, sign-in details, API keys, or another connection's grant.",
  "Sensitive move details for a participant whose role does not already see them.",
] as const;

export const NEVER_PERMITTED = [
  "Permanently delete anything, or delete your account. Archive is the destructive default and it is reversible.",
  "Archive a whole move. That stays a signed-in action you take yourself.",
  "Publish, share, create a share link, or export your move.",
  "Invite, remove, or change the access of anyone in your household.",
  "Contact a mover, marketplace, employer, insurer, or government office; book, buy, sign, pay, or message on your behalf.",
  "Grant itself authority, widen its own grant, or inherit another connection's grant.",
  "Turn a Queue instruction into permission. Missing authority becomes the smallest Needs you question.",
] as const;

/**
 * Tool → required scope. A tool absent from this catalog has no scope and is
 * refused before its arguments are looked at, so adding a tool without
 * deciding its authority fails closed rather than open.
 */
export const MOVING_TOOL_SCOPES: Readonly<Record<string, MovingScope>> = {
  get_move_brief: "moving.context.read",
  search_move_records: "moving.context.read",
  get_move_records: "moving.context.read",
  get_evidence_media: "moving.evidence.read",
  save_move_context: "moving.work.write",
  save_inventory: "moving.work.write",
  save_planning_record: "moving.work.write",
  save_complete_result: "moving.work.write",
  list_queue_work: "moving.queue.work",
  claim_queue_work: "moving.queue.work",
  release_queue_work: "moving.queue.work",
  ask_queue_question: "moving.queue.work",
  complete_queue_work: "moving.queue.work",
  archive_move_records: "moving.archive",
};

export function scopeForTool(toolName: string): MovingScope | null {
  return MOVING_TOOL_SCOPES[toolName] ?? null;
}

/**
 * Error language for the grant boundary. Every message must be answerable by
 * the person without naming another owner, another record, or whether one
 * exists — a refusal that leaks is still a leak.
 */
export const GRANT_ERRORS = {
  noGrant: {
    code: "GRANT_REQUIRED",
    message:
      "No active Assist With Moving grant covers this connection yet. Signing in proved who you are; it did not decide what your AI may do.",
    recovery:
      "Open Assist With Moving, go to Settings → AI connections, and approve a grant for the moves and operations you want.",
  },
  revoked: {
    code: "GRANT_REVOKED",
    message: "That grant was revoked in Assist With Moving.",
    recovery:
      "Ask the person who owns this move to approve a new grant, then reconnect.",
  },
  expired: {
    code: "GRANT_EXPIRED",
    message: "That grant has expired.",
    recovery:
      "Approve a new grant in Settings → AI connections, then reconnect.",
  },
  outOfScope: {
    code: "GRANT_SCOPE_MISSING",
    message: "This grant does not include the operation you asked for.",
    recovery:
      "Ask for the smallest additional authority in Settings → AI connections, or do the part the grant already covers.",
  },
  outOfMoveScope: {
    code: "GRANT_MOVE_MISSING",
    message: "This grant does not cover that move.",
    recovery:
      "Use a move this connection was approved for, or add it in Settings → AI connections.",
  },
  unknownTool: {
    code: "GRANT_SCOPE_MISSING",
    message: "That operation is not part of this Assist With Moving connection.",
    recovery: "Call get_move_brief and use only the tools this connection lists.",
  },
} as const;

export type GrantErrorKey = keyof typeof GRANT_ERRORS;

/** Same marker the stateless transport already decodes into {code,message,recovery}. */
const MCP_ERROR_MARKER = "MCP_MOVING_ERROR:";

export function grantError(key: GrantErrorKey): never {
  throw new ConvexError(`${MCP_ERROR_MARKER}${JSON.stringify(GRANT_ERRORS[key])}`);
}

/** The shape the enforcement path needs. Deliberately narrower than the row. */
export type GrantDecisionInput = {
  scopes: readonly string[];
  moveScope: "allMoves" | "selectedMoves";
  moveIds: readonly string[];
  status: "active" | "revoked";
  expiresAt?: number;
};

/**
 * Find the grant that permits an operation on its own.
 *
 * A person may hold several grants — a narrow one for a client they trust
 * less, a wider one for a client they trust more. Scopes are never summed
 * across grants: two half-permissions do not make a whole one. A grant limited
 * to selected moves cannot be walked sideways by naming a different move, and
 * naming no move at all is refused rather than read as "any".
 */
export function findPermittingGrant<T extends GrantDecisionInput>(
  grants: readonly T[],
  scope: MovingScope,
  moveId: string | undefined,
  now: number,
): T | null {
  for (const grant of grants) {
    if (grant.status !== "active") continue;
    if (grant.expiresAt !== undefined && grant.expiresAt <= now) continue;
    if (!grant.scopes.includes(scope)) continue;
    if (grant.moveScope === "selectedMoves") {
      if (!moveId || !grant.moveIds.includes(moveId)) continue;
    }
    return grant;
  }
  return null;
}

/**
 * The consent snapshot stored on a grant at approval time. Rendering today's
 * copy for a grant approved months ago would quietly rewrite what the person
 * agreed to, so the text is frozen into the row instead.
 */
export type ConsentSnapshotEntry = {
  scope: string;
  label: string;
  grants: string;
  doesNotImply: string;
};

export function buildConsentSnapshot(
  scopes: readonly MovingScope[],
): ConsentSnapshotEntry[] {
  return MOVING_SCOPES.filter((info) => scopes.includes(info.scope)).map(
    (info) => ({
      scope: info.scope,
      label: info.label,
      grants: info.grants,
      doesNotImply: info.doesNotImply,
    }),
  );
}

/** One description of the boundary, shared by product UI and agent-facing docs. */
export function describeGrantBoundary() {
  return {
    boundaryVersion: GRANT_BOUNDARY_VERSION,
    scopes: MOVING_SCOPES.map((info) => ({ ...info })),
    neverExposed: [...NEVER_EXPOSED],
    neverPermitted: [...NEVER_PERMITTED],
  };
}
