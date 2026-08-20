/**
 * The grant boundary for the LEGACY persisted MCP gateway (`/mcp/legacy`,
 * reached publicly as `https://movingmanifest.com/mcp/connect`).
 *
 * Why this file exists
 * -------------------
 * The canonical stateless door (`convex/httpRoutes/mcp.ts`) has always read a
 * grant on every discovery and every call. The legacy gateway did not. Its
 * authorizer returned `{ allowed: true }` for *any* caller whose Clerk token
 * resolved to a subject, so a signed-in identity — any signed-in identity —
 * received all twenty-nine tools with no grant row, no scope check, no
 * revocation path, and nothing written to the person's activity list.
 *
 * The legacy door is the one people are actually connected through, so this is
 * the boundary that matters in practice. This module is the decision half of
 * closing it: pure functions, no database, so the policy can be tested
 * exhaustively without a Convex context. `convex/aiGrants.ts` owns the row
 * that feeds it and `convex/http.ts` wires it to the gateway.
 *
 * The rule this encodes is the same one `convex/lib/aiGrants.ts` states for
 * the canonical door: OAuth proves *who*, a grant decides *what*, and the
 * token's own scopes are never read.
 */
import {
  MOVING_SCOPES,
  findPermittingGrant,
  movingScopes,
  type GrantDecisionInput,
  type MovingScope,
} from "./aiGrants";

/**
 * The one identifier every unidentified opaque-token client would otherwise
 * share.
 *
 * Introspection at `/oauth/userinfo` does not always return a `client_id` or
 * `azp`. Producing a single shared literal for all such callers — and then
 * binding a grant to it — collapses every unidentified client on one account
 * into one grant row: client B inherits client A's authority, and revoking
 * either revokes both. So this value exists only to be *recognised and
 * refused*, never to be bound. Exported so `convex/http.ts` produces exactly
 * this string and `touchLegacyConnection` refuses exactly this string.
 */
export const UNIDENTIFIED_LEGACY_CLIENT = "legacy:unidentified-client";

/**
 * Every tool the legacy gateway registers (`convex/mcp.ts`), mapped to the one
 * scope that permits it.
 *
 * A tool that is absent from this map has no scope and is refused before its
 * arguments are read, so adding a tool to the gateway without deciding its
 * authority fails closed rather than open. `legacyGatewayCatalogIsComplete`
 * below turns that promise into a test rather than a hope.
 */
export const LEGACY_GATEWAY_TOOL_SCOPES: Readonly<
  Record<string, MovingScope>
> = {
  // --- Reading the move context the person already sees -------------------
  get_agent_context: "moving.context.read",
  list_moves: "moving.context.read",
  get_move_summary: "moving.context.read",
  list_move_spaces: "moving.context.read",
  list_items: "moving.context.read",
  list_boxes: "moving.context.read",
  get_move_overview: "moving.context.read",
  search_inventory: "moving.context.read",
  get_item: "moving.context.read",
  list_transport: "moving.context.read",
  // Reading the capture queue is a read of move context. Working it is not,
  // and lives under moving.queue.work below.
  list_queue: "moving.context.read",

  // --- Opening the private photos attached to that work -------------------
  // Returns image bytes the person's role may see. `moving.context.read` is
  // deliberately not enough: the scope copy in `aiGrants.ts` promises that
  // reading context "does not open your private photos or files".
  get_images: "moving.evidence.read",

  // --- Saving the work the person asked for -------------------------------
  setup_move: "moving.work.write",
  update_move: "moving.work.write",
  upsert_spaces: "moving.work.write",
  upsert_items: "moving.work.write",
  update_item: "moving.work.write",
  convert_item_to_box: "moving.work.write",
  pack_boxes: "moving.work.write",
  place_box: "moving.work.write",
  update_box: "moving.work.write",
  upsert_transport: "moving.work.write",
  capture_to_queue: "moving.work.write",
  // Uploading and filing photographs lands permanently on the person's record
  // and spends their stored bytes. Moving's scope vocabulary has no separate
  // media-write scope today, so these sit in the write scope rather than
  // inventing a sixth scope inside a security fix. Recorded as a follow-up:
  // the connector playbook would put both in a raised tier of their own.
  add_images: "moving.work.write",
  attach_photos: "moving.work.write",

  // --- Working the handoffs the person hands over -------------------------
  claim_queue: "moving.queue.work",
  submit_queue_result: "moving.queue.work",

  // --- Retiring records that turned out to be wrong -----------------------
  archive_item: "moving.archive",
};

/**
 * Tools the legacy gateway registers that no scope may ever permit.
 *
 * `add_move_participant` invites a person by email and sets their role on a
 * move. `NEVER_PERMITTED` in `convex/lib/aiGrants.ts` — shipped product copy,
 * rendered to people on `/ai` and `/settings/ai` — already says a connected AI
 * may never "Invite, remove, or change the access of anyone in your
 * household." The tool contradicted a promise the site was already making.
 *
 * Refusing it here makes the code agree with the copy. It is not a silent
 * removal: the tool still exists, the refusal names the person as the actor
 * who can do it, and the change is called out in the pull request rather than
 * buried. Restoring it to an AI would need a scope and a product ruling, not a
 * patch.
 */
export const LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS: readonly string[] = [
  "add_move_participant",
];

/**
 * What signing in through OAuth grants on its own.
 *
 * Scott's ruling for the family: "yep sign in IS the approval... We can opt
 * into blocking if the user wants later." A person who signs in, sees Allow,
 * clicks it and stops has finished; waiting for a second approval leaves them
 * believing they granted something they did not.
 *
 * So a first authenticated call writes a real grant row carrying these scopes.
 * `moving.archive` is deliberately absent: archive is the destructive verb,
 * and the connector playbook keeps destructive authority out of what a
 * sign-in hands over. It stays one switch away on `/settings/ai`.
 */
export const LEGACY_AUTO_GRANT_SCOPES: readonly MovingScope[] = [
  "moving.context.read",
  "moving.evidence.read",
  "moving.work.write",
  "moving.queue.work",
];

/**
 * Scopes a sign-in never hands over. Written as its own list rather than
 * derived by subtracting the defaults, so the two cannot drift apart when a
 * sixth scope is added.
 */
export const LEGACY_RAISED_SCOPES: readonly MovingScope[] = ["moving.archive"];

export function legacyScopeForTool(toolName: string): MovingScope | null {
  return LEGACY_GATEWAY_TOOL_SCOPES[toolName] ?? null;
}

/**
 * Two rulings that are Scott's to make, isolated here so a decision is a
 * one-line flip rather than a rewrite. Both default to preserving the
 * capability the live connector offers today — neither silently removes one.
 */
export const LEGACY_PENDING_POLICY = {
  /**
   * Q8 — may a connected AI *add* to the person's Queue?
   *
   * `capture_to_queue` drops capture notes into the Queue. The family Queue law
   * is that the AI *answers* Queue items and never adds to them; a thing the AI
   * wants done belongs on the separate suggestions surface instead. Moving's
   * capture pipeline is the product, so removing this is a real workflow change
   * and waits on Scott's ruling. `"enqueueAllowed"` preserves today's
   * behaviour; `"queueLawStrict"` refuses the tool with a message that points
   * at suggestions.
   */
  captureToQueue: "enqueueAllowed" as "enqueueAllowed" | "queueLawStrict",

  /**
   * Q9 — which tier do photo writes belong to?
   *
   * `add_images` and `attach_photos` land permanently on the record and spend
   * the person's stored bytes, which the connector playbook puts in a raised
   * tier a sign-in does not hand over. Moving has no dedicated media-write
   * scope yet — that is a MOV-0040 gap — so:
   *
   * - `"standard"` (default) keeps both under `moving.work.write`, which a
   *   sign-in auto-grants; photo writes work out of the box, today's behaviour.
   * - `"raised"` makes both require a media-write permission a sign-in does not
   *   include. Until MOV-0040 adds that scope and a way to grant it, flipping
   *   to `"raised"` therefore turns AI photo writes *off* pending that work —
   *   which is a legitimate ruling ("make media opt-in"), not a bug.
   */
  mediaWriteTier: "standard" as "standard" | "raised",
} as const;

/** The two tools Q9 governs. */
const MEDIA_WRITE_TOOLS = new Set(["add_images", "attach_photos"]);

/**
 * A scope name that is deliberately **not** in the Moving vocabulary, so no
 * grant can carry it and every media write is refused while Q9 is `"raised"`.
 * MOV-0040 replaces this sentinel with a real `moving.media.write` scope and a
 * toggle; until then `"raised"` means "off", honestly.
 */
const MEDIA_RAISED_SENTINEL_SCOPE = "moving.media.write";

/**
 * The scope a tool requires *right now*, after applying the pending-policy
 * overrides. Distinct from `legacyScopeForTool`, which reports the tool's
 * catalogued scope irrespective of the Q9 setting.
 */
export function effectiveLegacyScopeForTool(toolName: string): string | null {
  if (
    MEDIA_WRITE_TOOLS.has(toolName) &&
    LEGACY_PENDING_POLICY.mediaWriteTier === "raised"
  ) {
    return MEDIA_RAISED_SENTINEL_SCOPE;
  }
  return legacyScopeForTool(toolName);
}

/**
 * A plain-language summary of what a scope set lets an AI do, for the activity
 * line a person reads. "Approved 4 operations" tells them a number; this tells
 * them the capability. Derived from the same scope copy `/settings/ai` renders.
 */
export function describeLegacyCapabilities(
  scopes: readonly MovingScope[],
): string {
  const phrases: Record<MovingScope, string> = {
    "moving.context.read": "read the move context you choose",
    "moving.evidence.read": "open the private photos and files for that work",
    "moving.work.write": "save the work you ask for",
    "moving.queue.work": "work the Queue handoffs you hand it",
    "moving.archive": "reversibly archive records that turned out wrong",
  };
  const ordered = MOVING_SCOPES.map((info) => info.scope).filter((scope) =>
    scopes.includes(scope),
  );
  const parts = ordered.map((scope) => phrases[scope]);
  if (parts.length === 0) return "do nothing yet";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export type LegacyGateDecision = {
  allowed: boolean;
  /** The scope that permitted the call, for the activity receipt. */
  scope?: MovingScope;
  /** Short machine code for the refusal, recorded on the activity list. */
  refusalCode?: string;
  /**
   * What to tell the caller. Every refusal names the actor who can lift it,
   * and an expired or revoked grant says reconnect rather than cannot — a
   * client told "cannot" reports a working feature as broken.
   */
  reason?: string;
};

const GRANT_MANAGER_URL = "https://movingmanifest.com/settings/ai";

/**
 * Why the caller currently holds no usable grant, when they hold none.
 *
 * Each names the *real* condition. The two that used to lie are gone: the
 * connection-limit case no longer masquerades as `"revoked"` (telling a person
 * they revoked something they did not), and a lookup that could not run no
 * longer masquerades as `"noProfile"` (blaming the person's account for an
 * outage).
 */
export type LegacyGrantBlock =
  | "noIdentity"
  | "noProfile"
  | "unidentifiedClient"
  | "lookupFailed"
  | "connectionLimit"
  | "revoked"
  | "expired"
  | "noHousehold";

const BLOCK_REFUSALS: Record<
  LegacyGrantBlock,
  { refusalCode: string; reason: string }
> = {
  noIdentity: {
    refusalCode: "AUTH_REQUIRED",
    reason: "Sign in with your Assist With Moving account to use these tools.",
  },
  noProfile: {
    refusalCode: "MOVING_IDENTITY_NOT_FOUND",
    reason:
      "No active Assist With Moving profile is linked to this sign-in. Open Assist With Moving once while signed in, then reconnect your AI.",
  },
  unidentifiedClient: {
    refusalCode: "CLIENT_UNIDENTIFIED",
    reason:
      "Your AI client did not identify itself, so Assist With Moving will not auto-connect it; an unnamed client cannot be revoked on its own later. Approve this connection yourself at " +
      GRANT_MANAGER_URL +
      ", then reconnect.",
  },
  lookupFailed: {
    refusalCode: "GRANT_LOOKUP_UNAVAILABLE",
    reason:
      "Assist With Moving could not check this connection's permissions just now. This is temporary; try again shortly.",
  },
  connectionLimit: {
    refusalCode: "TOO_MANY_CONNECTIONS",
    reason:
      "This account already has the maximum number of AI connections, so a new one was not created. Revoke one you no longer use at " +
      GRANT_MANAGER_URL +
      ", then reconnect.",
  },
  noHousehold: {
    refusalCode: "NO_WORKSPACE",
    reason:
      "This account has no household or move yet, so there is nothing to connect an AI to. Create a household in Assist With Moving, or ask the move owner to add you, then reconnect.",
  },
  revoked: {
    refusalCode: "GRANT_REVOKED",
    reason: `This connection was revoked in Assist With Moving. Ask the person to approve it again at ${GRANT_MANAGER_URL}, then reconnect.`,
  },
  expired: {
    refusalCode: "GRANT_EXPIRED",
    reason: `This connection's approval has expired. Ask the person to approve it again at ${GRANT_MANAGER_URL}, then reconnect.`,
  },
};

/**
 * Decide one tool call or one `tools/list` entry.
 *
 * Pure on purpose. The grant rows the person currently holds — or the reason
 * there is no usable grant — are resolved once per request by the caller and
 * handed in. The decision then mirrors the canonical door exactly:
 *
 * - **`tools/list` is a question.** A tool is listable when *some* active grant
 *   carries its scope, so the AI sees what it could use.
 * - **`tools/call` is an act.** Authority is decided by `findPermittingGrant`,
 *   the same routine the canonical door uses: one grant must permit the scope
 *   *and* the specific move on its own. Scopes are never summed across grants,
 *   and a `selectedMoves` grant cannot be walked onto a move it does not name.
 *   This is the fix for the legacy door having previously checked a flat union
 *   of scopes with no move in sight.
 */
export function decideLegacyGatewayAccess(input: {
  toolName: string;
  grants: readonly GrantDecisionInput[];
  moveId?: string;
  mode: "call" | "list";
  block?: LegacyGrantBlock;
  now?: number;
}): LegacyGateDecision {
  const { toolName, grants, moveId, mode, block } = input;
  const now = input.now ?? Date.now();

  // The product ceiling is checked before anything else, so no grant state and
  // no future scope can talk its way past it.
  if (LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS.includes(toolName)) {
    return {
      allowed: false,
      refusalCode: "NEVER_PERMITTED",
      reason:
        "Assist With Moving never lets a connected AI invite someone or change anyone's access to a move. The person does that themselves while signed in.",
    };
  }

  // Q8: the Queue law, when Scott rules the strict way.
  if (
    toolName === "capture_to_queue" &&
    LEGACY_PENDING_POLICY.captureToQueue === "queueLawStrict"
  ) {
    return {
      allowed: false,
      refusalCode: "QUEUE_LAW",
      reason:
        "Assist With Moving's Queue is work the person hands to their AI to finish; the AI does not add to it. Offer this as a suggestion the person can accept instead.",
    };
  }

  const scope = effectiveLegacyScopeForTool(toolName);
  if (!scope) {
    return {
      allowed: false,
      refusalCode: "GRANT_SCOPE_MISSING",
      reason:
        "That operation is not part of this Assist With Moving connection. Call get_agent_context and use only the tools this connection lists.",
    };
  }

  if (block) {
    const refusal = BLOCK_REFUSALS[block];
    return { allowed: false, refusalCode: refusal.refusalCode, reason: refusal.reason };
  }

  // Q9: a media write while the raised tier is selected requires a scope no
  // grant carries. Say so honestly rather than naming a scope nobody has heard
  // of.
  if (scope === MEDIA_RAISED_SENTINEL_SCOPE) {
    const permitting = findPermittingGrant(
      grants,
      scope as MovingScope,
      moveId,
      now,
    );
    if (permitting) return { allowed: true };
    return {
      allowed: false,
      refusalCode: "MEDIA_WRITE_NOT_ENABLED",
      reason: `Uploading or attaching photos is a raised permission a sign-in does not include. Enable it for this connection at ${GRANT_MANAGER_URL}, then reconnect.`,
    };
  }

  const movingScope = scope as MovingScope;

  // Listing is a question: show a tool if any active grant carries its scope,
  // so the AI can discover what it could ask the person to widen.
  if (mode === "list") {
    const listable = grants.some(
      (grant) =>
        grant.status === "active" &&
        (grant.expiresAt === undefined || grant.expiresAt > now) &&
        grant.scopes.includes(movingScope),
    );
    return listable
      ? { allowed: true, scope: movingScope }
      : {
          allowed: false,
          scope: movingScope,
          refusalCode: "GRANT_SCOPE_MISSING",
          reason: `This connection was not approved for ${movingScope}. The person can add it at ${GRANT_MANAGER_URL}, then you reconnect.`,
        };
  }

  // Calling is an act: one grant must permit the scope and the move by itself.
  const permitting = findPermittingGrant(grants, movingScope, moveId, now);
  if (permitting) return { allowed: true, scope: movingScope };

  // Distinguish "you were never approved for this" from "not for that move",
  // because the person fixes them differently.
  const holdsScopeSomewhere = grants.some((grant) =>
    grant.scopes.includes(movingScope),
  );
  if (holdsScopeSomewhere) {
    return {
      allowed: false,
      scope: movingScope,
      refusalCode: "GRANT_MOVE_MISSING",
      reason: `This connection was not approved for that move. The person can add it at ${GRANT_MANAGER_URL}, then you reconnect.`,
    };
  }
  return {
    allowed: false,
    scope: movingScope,
    refusalCode: "GRANT_SCOPE_MISSING",
    reason: `This connection was not approved for ${movingScope}. The person can add it at ${GRANT_MANAGER_URL}, then you reconnect.`,
  };
}

/**
 * Every legacy tool has a decision recorded for it — a scope, or an explicit
 * refusal. Exported so the test asserts it against the live registration list
 * in `convex/mcp.ts` and fails when a tool is added without one.
 */
export function legacyGatewayCatalogIsComplete(
  registeredToolNames: readonly string[],
): { complete: boolean; undecided: string[]; unknown: string[] } {
  const decided = new Set([
    ...Object.keys(LEGACY_GATEWAY_TOOL_SCOPES),
    ...LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS,
  ]);
  const registered = new Set(registeredToolNames);
  const undecided = registeredToolNames.filter((name) => !decided.has(name));
  // A decision for a tool nobody registers is dead policy, and usually means a
  // rename landed on one side only.
  const unknown = [...decided].filter((name) => !registered.has(name));
  return {
    complete: undecided.length === 0 && unknown.length === 0,
    undecided: undecided.sort(),
    unknown: unknown.sort(),
  };
}

/** Guard against a typo putting an unknown scope string into the map. */
export function legacyScopeVocabularyIsValid(): boolean {
  return Object.values(LEGACY_GATEWAY_TOOL_SCOPES).every((scope) =>
    movingScopes.includes(scope),
  );
}
