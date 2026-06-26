"use client";

// Shared workspace context: resolves the signed-in user's households, the
// selected household, and the selected move exactly once per page, so each
// workspace page subscribes only to the data it actually renders.
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";
import { moveWorkspacePath } from "@/lib/move-links";

type HouseholdEntries = FunctionReturnType<typeof api.households.listMine>;
type MoveEntries = FunctionReturnType<typeof api.moves.listForHousehold>;

export type MoveWorkspaceValue = {
  householdId: Id<"households"> | null;
  selectHousehold: (householdId: Id<"households">) => void;
  households: HouseholdEntries | undefined;
  moves: MoveEntries | undefined;
  activeMoves: MoveEntries;
  moveId: Id<"moves"> | null;
  selectMove: (moveId: Id<"moves">) => void;
  selectedMove: MoveEntries[number] | undefined;
  featureFlags: EffectiveFeatureFlag[] | undefined;
  loadingIdentity: boolean;
  loadingHouseholds: boolean;
  loadingMoves: boolean;
  // True while the user's participant moves are still loading. The dashboard
  // must wait for this before deciding a user has "no access" — otherwise a
  // participant-only user (no household membership) flashes the setup card.
  loadingParticipantMoves: boolean;
  moveLinkMessage: string | null;
};

const MoveWorkspaceContext = createContext<MoveWorkspaceValue | null>(null);

// Read the move id out of an /app/moves/[moveId] route. The single provider
// mount lives above every product page, so it derives the active move from the
// URL instead of being remounted per route — remounting the provider on
// navigation was the original freeze bug.
function moveIdFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "app" && segments[1] === "moves" && segments[2]) {
    return decodeURIComponent(segments[2]);
  }
  return null;
}

export function MoveWorkspaceProvider({
  initialMoveId,
  children,
}: {
  initialMoveId?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const currentUser = useQuery(api.users.current);
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  // Durable invite-claim (MOVE-352): pulls the server-attested verified email
  // from Clerk and claims pending invites when the JWT carries no email and the
  // webhook is unconfigured. Graceful no-op without CLERK_SECRET_KEY.
  const syncEmailAndClaim = useAction(api.clerkIdentity.syncEmailAndClaim);
  const households = useQuery(api.households.listMine, currentUser ? {} : "skip");
  // Moves the user reaches as a participant (esp. move-only outsiders with no
  // household membership, who never show up in listMine / listForHousehold).
  const participantMoves = useQuery(
    api.moveParticipants.listMyMoves,
    currentUser ? {} : "skip",
  );
  const featureFlagEnvironment =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA === "true"
      ? "development"
      : undefined;
  const featureFlags = useQuery(api.featureFlags.effective, {
    environment: featureFlagEnvironment,
  }) as
    | EffectiveFeatureFlag[]
    | undefined;

  // The active move id derived from the current /app/moves/[moveId] route.
  // This is what keeps the single hoisted provider in sync with navigation
  // without remounting it.
  const routeMoveId = moveIdFromPathname(pathname) ?? initialMoveId ?? null;

  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  // Tracks an explicit user choice (move switcher, "select move", create move).
  // The route move id below takes over whenever the URL points at a move.
  const [selectedMoveId, setSelectedMoveId] = useState<Id<"moves"> | null>(
    initialMoveId ? (initialMoveId as Id<"moves">) : null
  );

  // Sync the Convex user record with the Clerk identity once per load. This also
  // drives the server-side invite-claim + membership self-heal, so an invited
  // person picks up their access. It must run even for users who ALREADY have a
  // Convex record (not just on first creation) — otherwise a half-claimed
  // invitee (active participant but missing membership) never gets repaired.
  const didSyncIdentity = useRef(false);
  useEffect(() => {
    if (!user || didSyncIdentity.current) {
      return;
    }
    didSyncIdentity.current = true;

    void upsertCurrentUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? user.username ?? undefined,
      imageUrl: user.imageUrl,
    });
  }, [upsertCurrentUser, user]);

  // Durable invite-claim fallback (MOVE-352). Fires ONLY when Convex still has
  // no trusted email for this user — i.e. the Clerk JWT carried no `email` claim
  // and the webhook hasn't populated it. It then pulls the server-attested email
  // from the Clerk Backend API and claims any pending invites. Gated on the
  // missing email so it costs at most ONE Clerk API call per user (ever, until
  // their email is captured) — no per-load tax at scale; once any path populates
  // users.email this short-circuits forever. Whole thing no-ops without
  // CLERK_SECRET_KEY, so the preferred zero-cost path is to put `email` in the
  // Clerk "convex" JWT template instead and never reach here.
  const didSyncEmail = useRef(false);
  useEffect(() => {
    if (didSyncEmail.current) return;
    if (!currentUser || currentUser.email) return;
    didSyncEmail.current = true;
    void syncEmailAndClaim({}).catch(() => {
      // Best-effort; the JWT/webhook claim paths still apply.
    });
  }, [currentUser, syncEmailAndClaim]);

  // A deep-linked move determines its own household — never assume the
  // user's first household owns it.
  const linkedMove = useQuery(
    api.moves.getForLink,
    routeMoveId ? { moveId: routeMoveId } : "skip"
  );
  const resolvingLink = Boolean(routeMoveId) && linkedMove === undefined;

  const firstHousehold = households?.[0]?.household;
  const firstParticipantHouseholdId = participantMoves?.[0]?.householdId ?? null;
  const householdId =
    selectedHouseholdId ??
    linkedMove?.householdId ??
    (resolvingLink
      ? null
      : firstHousehold?._id ?? firstParticipantHouseholdId ?? null);

  // listForHousehold requires household membership — calling it for a household
  // the user only participates in (move-only) would throw. So only call it for
  // member households; move-only moves come from participantMoves instead.
  const memberHouseholdIds = useMemo(
    () => new Set((households ?? []).map((entry) => entry.household._id)),
    [households]
  );
  const isMemberHousehold = householdId
    ? memberHouseholdIds.has(householdId)
    : false;
  const householdMoves = useQuery(
    api.moves.listForHousehold,
    householdId && isMemberHousehold ? { householdId } : "skip"
  );

  const householdMovesLoading =
    Boolean(householdId) && isMemberHousehold && householdMoves === undefined;
  const participantMovesLoading =
    Boolean(currentUser) && participantMoves === undefined;

  // Merge member-household moves with the user's participant moves for the
  // resolved household (deduped). undefined while the relevant sources load so
  // the loading affordances still work.
  const moves = useMemo<MoveEntries | undefined>(() => {
    if (householdMovesLoading || participantMovesLoading) return undefined;
    const byId = new Map<Id<"moves">, MoveEntries[number]>();
    for (const move of householdMoves ?? []) byId.set(move._id, move);
    for (const move of participantMoves ?? []) {
      if (move.householdId === householdId) byId.set(move._id, move);
    }
    return Array.from(byId.values());
  }, [
    householdMoves,
    participantMoves,
    householdId,
    householdMovesLoading,
    participantMovesLoading,
  ]);

  const activeMoves = useMemo(
    () => moves?.filter((move) => move.status !== "archived") ?? [],
    [moves]
  );

  const firstMove = activeMoves[0];
  const isAccessible = (candidate: Id<"moves"> | null) =>
    candidate ? activeMoves.some((move) => move._id === candidate) : false;

  // Resolution order: the move the URL points at wins (deep links and the
  // sidebar nav drive the URL), then an explicit user selection made off-route,
  // then the first accessible move. This keeps the single provider in sync with
  // navigation without ever remounting it.
  const routeMoveIdTyped = routeMoveId as Id<"moves"> | null;
  const moveId =
    (isAccessible(routeMoveIdTyped) ? routeMoveIdTyped : null) ??
    (isAccessible(selectedMoveId) ? selectedMoveId : null) ??
    firstMove?._id ??
    null;
  const selectedMove = activeMoves.find((move) => move._id === moveId);

  // A move id came from the URL but the signed-in user cannot access it.
  const routeMoveIsBroken =
    !resolvingLink &&
    Boolean(routeMoveIdTyped) &&
    Boolean(moves) &&
    !isAccessible(routeMoveIdTyped);
  const moveLinkMessage = routeMoveIsBroken
    ? "That move link is not available in this household."
    : null;

  // If a deep link points at a move this user cannot access, fall back to
  // the first accessible move instead of rendering a broken workspace.
  useEffect(() => {
    if (routeMoveIsBroken && pathname.startsWith("/app/moves/") && firstMove?._id) {
      router.replace(moveWorkspacePath(firstMove._id));
    }
  }, [firstMove?._id, pathname, router, routeMoveIsBroken]);

  const value = useMemo<MoveWorkspaceValue>(
    () => ({
      householdId,
      selectHousehold: setSelectedHouseholdId,
      households,
      moves,
      activeMoves,
      moveId,
      selectMove: setSelectedMoveId,
      selectedMove,
      featureFlags,
      loadingIdentity: currentUser === undefined,
      loadingHouseholds: Boolean(currentUser) && households === undefined,
      loadingMoves:
        resolvingLink ||
        participantMovesLoading ||
        (Boolean(householdId) && moves === undefined),
      loadingParticipantMoves: participantMovesLoading,
      moveLinkMessage,
    }),
    [
      householdId,
      households,
      moves,
      activeMoves,
      moveId,
      selectedMove,
      featureFlags,
      currentUser,
      moveLinkMessage,
      resolvingLink,
      participantMovesLoading,
    ]
  );

  return (
    <MoveWorkspaceContext.Provider value={value}>
      {children}
    </MoveWorkspaceContext.Provider>
  );
}

export function useMoveWorkspace(): MoveWorkspaceValue {
  const value = useContext(MoveWorkspaceContext);
  if (!value) {
    throw new Error(
      "useMoveWorkspace must be used inside a MoveWorkspaceProvider"
    );
  }
  return value;
}

export function useOptionalMoveWorkspace(): MoveWorkspaceValue | null {
  return useContext(MoveWorkspaceContext);
}
