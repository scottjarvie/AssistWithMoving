import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: {isLoaded:true,isSignedIn:true},
  workspace: {loadingIdentity:false,loadingHouseholds:false,loadingMoves:false,loadingParticipantMoves:false},
}));
vi.mock("@clerk/nextjs", () => ({useUser: () => state.auth}));
vi.mock("@/components/move-workspace-context", () => ({useMoveWorkspace: () => state.workspace}));
vi.mock("@/components/family-row", () => ({FamilyRow: () => <nav aria-label="Assist With family"/>}));
import { MovesFamilyRow } from "@/components/moves-family-row";
afterEach(cleanup);
describe("Moves home family mount", () => {
  it("mounts only after authenticated workspace readiness", () => {
    render(<MovesFamilyRow/>);
    expect(screen.getByRole("navigation",{name:"Assist With family"})).toBeInTheDocument();
  });
  it.each(["loadingIdentity","loadingHouseholds","loadingMoves","loadingParticipantMoves"] as const)("stays absent while %s", key => {
    state.workspace[key] = true;
    try { render(<MovesFamilyRow/>); expect(screen.queryByRole("navigation")).toBeNull(); }
    finally { state.workspace[key] = false; }
  });
  it.each(["isLoaded","isSignedIn"] as const)("stays absent without %s", key => {
    state.auth[key] = false;
    try { render(<MovesFamilyRow/>); expect(screen.queryByRole("navigation")).toBeNull(); }
    finally { state.auth[key] = true; }
  });
});
