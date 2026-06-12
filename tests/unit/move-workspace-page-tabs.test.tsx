import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: {
        _id: "move_123" as Id<"moves">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        title: "Test move",
        type: "local",
        status: "planning",
        origin: "Old home",
        destination: "New home",
        unitSystem: "imperial",
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      },
      selectHousehold: vi.fn(),
      households: [],
      moves: [],
      activeMoves: [],
      selectMove: vi.fn(),
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

vi.mock("@/components/move-workspace-header", () => ({
  MoveWorkspaceHeader: ({ title }: { title: string }) => (
    <header>{title}</header>
  ),
}));

vi.mock("@/lib/feature-flags", () => ({
  flagEnabled: () => true,
}));

vi.mock("@/components/move-questions-panel", () => ({
  MoveQuestionsPanel: () => <div>Decision questions surface</div>,
}));
vi.mock("@/components/packing-debt-dashboard", () => ({
  PackingDebtDashboard: () => <div>Readiness dashboard surface</div>,
}));
vi.mock("@/components/move-people-manager", () => ({
  MovePeopleManager: () => <div>People manager surface</div>,
}));
vi.mock("@/components/planning-defaults-panel", () => ({
  PlanningDefaultsPanel: () => <div>Planning defaults surface</div>,
}));
vi.mock("@/components/ingestion-capture-form", () => ({
  IngestionCaptureForm: () => <div>Capture form surface</div>,
}));
vi.mock("@/components/ingestion-queue-list", () => ({
  IngestionQueueList: () => <div>Ingestion queue surface</div>,
}));
vi.mock("@/components/photo-review-workspace", () => ({
  PhotoEvidenceGapsPanel: () => <div>Photo gaps surface</div>,
  PhotoReviewWorkspace: () => <div>Photo review surface</div>,
  PhotoRoomSweepPanel: () => <div>Photo upload surface</div>,
}));
vi.mock("@/components/evidence-density-panel", () => ({
  EvidenceDensityPanel: () => <div>Evidence coverage surface</div>,
}));
vi.mock("@/components/load-planner-board", () => ({
  LoadPlannerBoard: () => <div>Load board surface</div>,
}));
vi.mock("@/components/transport-resources-panel", () => ({
  TransportResourcesPanel: () => <div>Transport resources surface</div>,
}));
vi.mock("@/components/ai-planning-suggestions", () => ({
  AiPlanningSuggestions: () => <div>AI planning surface</div>,
}));
vi.mock("@/components/documentation-packet-builder", () => ({
  DocumentationPacketBuilder: () => <div>Packet builder surface</div>,
}));
vi.mock("@/components/claims-center-panel", () => ({
  ClaimsCenterPanel: () => <div>Claims center surface</div>,
}));
vi.mock("@/components/feature-unavailable", () => ({
  FeatureUnavailable: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/ai-review-queue", () => ({
  AiReviewQueue: () => <div>AI review queue surface</div>,
}));
vi.mock("@/components/ai-text-intake", () => ({
  AiTextIntake: () => <div>AI text intake surface</div>,
}));
vi.mock("@/components/ai-photo-intake", () => ({
  AiPhotoIntake: () => <div>AI photo intake surface</div>,
}));
vi.mock("@/components/ai-job-monitor", () => ({
  AiJobMonitor: () => <div>AI job monitor surface</div>,
}));

import { AiReviewWorkspacePage } from "@/components/move-pages/ai-review-page";
import { CaptureWorkspacePage } from "@/components/move-pages/capture-page";
import { LoadPlanWorkspacePage } from "@/components/move-pages/load-plan-page";
import { MoveOverviewPage } from "@/components/move-pages/overview-page";
import { PacketsWorkspacePage } from "@/components/move-pages/packets-page";
import { PhotosWorkspacePage } from "@/components/move-pages/photos-page";

describe("move workspace task tabs", () => {
  it("opens overview on decisions instead of stacking readiness, people, and defaults", () => {
    render(<MoveOverviewPage />);

    expect(screen.getByRole("tab", { name: "Decisions" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Readiness" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Defaults" })).toBeInTheDocument();
    expect(screen.getByText("Decision questions surface")).toBeInTheDocument();
    expect(
      screen.queryByText("Readiness dashboard surface")
    ).not.toBeInTheDocument();
  });

  it("opens capture on the intake form and keeps the queue behind its tab", () => {
    render(<CaptureWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Capture" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByText("Capture form surface")).toBeInTheDocument();
    expect(screen.queryByText("Ingestion queue surface")).not.toBeInTheDocument();
  });

  it("opens photos on review and keeps upload, gaps, and coverage behind tabs", () => {
    render(<PhotosWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Add photos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Gaps" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Coverage" })).toBeInTheDocument();
    expect(screen.getByText("Photo review surface")).toBeInTheDocument();
    expect(screen.queryByText("Photo upload surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo gaps surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence coverage surface")).not.toBeInTheDocument();
  });

  it("opens load plan on the board instead of stacking resources and AI suggestions", () => {
    render(<LoadPlanWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Board" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI suggestions" })).toBeInTheDocument();
    expect(screen.getByText("Load board surface")).toBeInTheDocument();
    expect(
      screen.queryByText("Transport resources surface")
    ).not.toBeInTheDocument();
  });

  it("opens packets on the builder and keeps claims separate", () => {
    render(<PacketsWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Builder" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Claims" })).toBeInTheDocument();
    expect(screen.getByText("Packet builder surface")).toBeInTheDocument();
    expect(screen.queryByText("Claims center surface")).not.toBeInTheDocument();
  });

  it("opens AI review on the approval queue before intake and job details", () => {
    render(<AiReviewWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Queue" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Text intake" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Photo intake" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByText("AI review queue surface")).toBeInTheDocument();
    expect(screen.queryByText("AI text intake surface")).not.toBeInTheDocument();
  });
});
