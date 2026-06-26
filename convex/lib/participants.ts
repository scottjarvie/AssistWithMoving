// Pure helpers for move participants (the access-granting "add a person to my
// move" surface). Kept free of ctx/db so the security-relevant decisions — the
// type→authority presets and the no-privilege-escalation ceiling — are
// exhaustively unit-testable. The Convex functions live in
// convex/moveParticipants.ts.
import type { HouseholdRole } from "./roles";
import { householdRoleAtLeast } from "./roles";
import { normalizeCollaboratorEmail } from "./householdMembers";

export type MoveParticipantType =
  | "householdMember"
  | "helper"
  | "mover"
  | "company"
  | "contact";

export type MoveParticipantAccessKind = "householdBacked" | "moveOnly";

export type ParticipantTypePreset = {
  type: MoveParticipantType;
  label: string;
  description: string;
  // The role this type defaults to when added. null = no access (contact).
  defaultRole: HouseholdRole | null;
  // householdBacked = also a household member (family). moveOnly = walled to
  // this one move (outsiders). null = no access record at all (pure contact).
  accessKind: MoveParticipantAccessKind | null;
};

// The preset authority bundles surfaced in the UI (requirement 6). "contact" is
// address-book only and carries NO access — those rows stay in movePeople.
export const PARTICIPANT_TYPE_PRESETS: Record<
  MoveParticipantType,
  ParticipantTypePreset
> = {
  householdMember: {
    type: "householdMember",
    label: "Household member",
    description:
      "Family or housemates. Full access to the whole household, can add and change anything.",
    defaultRole: "editor",
    accessKind: "householdBacked",
  },
  helper: {
    type: "helper",
    label: "Move helper",
    description:
      "A friend helping with this move only. Can add and pack items on this move; can't see your other moves or item values.",
    defaultRole: "packer",
    accessKind: "moveOnly",
  },
  mover: {
    type: "mover",
    label: "Moving company crew",
    description:
      "A mover working this move only. Can view and update this move; item values and serial numbers stay hidden.",
    defaultRole: "viewer",
    accessKind: "moveOnly",
  },
  company: {
    type: "company",
    label: "Moving company",
    description:
      "A moving company account for this move only. Same wall as a crew member, can be raised to edit.",
    defaultRole: "viewer",
    accessKind: "moveOnly",
  },
  contact: {
    type: "contact",
    label: "Contact (no access)",
    description: "Just an address-book entry — no access to the move.",
    defaultRole: null,
    accessKind: null,
  },
};

export const ACCESS_GRANTING_PARTICIPANT_TYPES: MoveParticipantType[] = (
  Object.keys(PARTICIPANT_TYPE_PRESETS) as MoveParticipantType[]
).filter((type) => PARTICIPANT_TYPE_PRESETS[type].defaultRole !== null);

export function isAccessGrantingType(type: MoveParticipantType): boolean {
  return PARTICIPANT_TYPE_PRESETS[type].defaultRole !== null;
}

/**
 * The no-privilege-escalation ceiling: an actor may only grant a role up to
 * their OWN effective role on the move. Prevents an editor from minting an admin
 * participant (or an agent acting as an editor from escalating).
 */
export function canGrantRole(
  actorRole: HouseholdRole,
  targetRole: HouseholdRole
): boolean {
  return householdRoleAtLeast(actorRole, targetRole);
}

/**
 * Resolve the access kind + role for a participant being added, applying the
 * type preset and any explicit overrides, then validating against the actor's
 * ceiling. Returns either a resolved grant or a reason string for refusal.
 */
export function resolveParticipantGrant(input: {
  type: MoveParticipantType;
  requestedRole?: HouseholdRole;
  requestedAccessKind?: MoveParticipantAccessKind;
  actorRole: HouseholdRole;
}):
  | {
      ok: true;
      role: HouseholdRole;
      accessKind: MoveParticipantAccessKind;
    }
  | { ok: false; reason: string } {
  const preset = PARTICIPANT_TYPE_PRESETS[input.type];
  if (!preset.defaultRole || !preset.accessKind) {
    return {
      ok: false,
      reason:
        "Contacts have no access — add them as a contact instead of a participant.",
    };
  }
  const role = input.requestedRole ?? preset.defaultRole;
  const accessKind = input.requestedAccessKind ?? preset.accessKind;

  if (!canGrantRole(input.actorRole, role)) {
    return {
      ok: false,
      reason:
        "You can't grant access higher than your own. Ask an owner or admin.",
    };
  }
  return { ok: true, role, accessKind };
}

export { normalizeCollaboratorEmail };
