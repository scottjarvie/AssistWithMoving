"use client";

import { useUser } from "@clerk/nextjs";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { FamilyRow } from "@/components/family-row";

export function MovesFamilyRow() {
  const { isLoaded, isSignedIn } = useUser();
  const workspace = useMoveWorkspace();
  if (!isLoaded || !isSignedIn || workspace.loadingIdentity || workspace.loadingHouseholds || workspace.loadingMoves || workspace.loadingParticipantMoves) return null;
  return <FamilyRow />;
}
