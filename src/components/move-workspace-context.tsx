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
  useState,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
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
  moveLinkMessage: string | null;
};

const MoveWorkspaceContext = createContext<MoveWorkspaceValue | null>(null);

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
  const households = useQuery(api.households.listMine, currentUser ? {} : "skip");
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

  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const [selectedMoveId, setSelectedMoveId] = useState<Id<"moves"> | null>(
    initialMoveId ? (initialMoveId as Id<"moves">) : null
  );

  // Keep the Convex user record in sync with the Clerk identity.
  useEffect(() => {
    if (currentUser || !user) {
      return;
    }

    void upsertCurrentUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? user.username ?? undefined,
      imageUrl: user.imageUrl,
    });
  }, [currentUser, upsertCurrentUser, user]);

  // A deep-linked move determines its own household — never assume the
  // user's first household owns it.
  const linkedMove = useQuery(
    api.moves.getForLink,
    initialMoveId ? { moveId: initialMoveId } : "skip"
  );
  const resolvingLink = Boolean(initialMoveId) && linkedMove === undefined;

  const firstHousehold = households?.[0]?.household;
  const householdId =
    selectedHouseholdId ??
    linkedMove?.householdId ??
    (resolvingLink ? null : firstHousehold?._id ?? null);
  const moves = useQuery(
    api.moves.listForHousehold,
    householdId ? { householdId } : "skip"
  );

  const activeMoves = useMemo(
    () => moves?.filter((move) => move.status !== "archived") ?? [],
    [moves]
  );

  const firstMove = activeMoves[0];
  const selectedMoveIsAccessible = selectedMoveId
    ? activeMoves.some((move) => move._id === selectedMoveId)
    : false;
  const moveId = selectedMoveIsAccessible
    ? selectedMoveId
    : firstMove?._id ?? null;
  const selectedMove = activeMoves.find((move) => move._id === moveId);
  const moveLinkMessage =
    !resolvingLink && selectedMoveId && moves && !selectedMoveIsAccessible
      ? "That move link is not available in this household."
      : null;

  // If a deep link points at a move this user cannot access, fall back to
  // the first accessible move instead of rendering a broken workspace.
  useEffect(() => {
    if (resolvingLink) {
      return;
    }
    if (selectedMoveId && moves && !selectedMoveIsAccessible) {
      if (pathname.startsWith("/app/moves/") && firstMove?._id) {
        router.replace(moveWorkspacePath(firstMove._id));
      }
    }
  }, [
    firstMove?._id,
    moves,
    pathname,
    resolvingLink,
    router,
    selectedMoveId,
    selectedMoveIsAccessible,
  ]);

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
        resolvingLink || (Boolean(householdId) && moves === undefined),
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
