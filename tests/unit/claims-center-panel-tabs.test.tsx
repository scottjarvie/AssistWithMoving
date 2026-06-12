import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  claimCenter: {
    summaryForMove: "claimCenter.summaryForMove",
  },
}));

const claimSummary = vi.hoisted(() => ({
  summary: {
    claimItemCount: 2,
    highSeverityCount: 1,
    damagedOrMissingCount: 1,
    warningCount: 2,
    averageEvidenceScore: 42,
    totalValueCents: 125000,
    totalReplacementValueCents: 200000,
  },
  topItems: [
    {
      itemId: "item-dresser",
      name: "Damaged antique dresser",
      room: "Bedroom",
      category: "Furniture",
      status: "damaged",
      condition: "damaged",
      severity: "high",
      evidenceScore: 42,
      relevanceReasons: [
        "Damaged",
        "High value",
        "Claim review flag",
      ],
      evidenceWarnings: [
        "Missing receipt photo",
        "High-value item missing serial/model",
      ],
      valueCents: 125000,
      replacementValueCents: 200000,
      photoCount: 1,
      updatedAt: 1,
    },
  ],
  timeline: [
    {
      eventId: "event-status",
      action: "item.updated",
      label: "Status changed",
      detail: "Status changed from loaded to damaged.",
      objectTable: "items",
      objectId: "item-dresser",
      itemId: "item-dresser",
      itemName: "Damaged antique dresser",
      createdAt: 1_700_000_000_000,
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.claimCenter.summaryForMove ? claimSummary : undefined,
}));

import { ClaimsCenterPanel } from "@/components/claims-center-panel";

function renderClaimsCenterPanel() {
  render(
    <ClaimsCenterPanel
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />
  );
}

describe("ClaimsCenterPanel task tabs", () => {
  it("opens on claim items and separates metrics, timeline, and packet actions", async () => {
    const user = userEvent.setup();

    renderClaimsCenterPanel();

    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("Top claim items")).toBeInTheDocument();
    expect(screen.getByText("Damaged antique dresser")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.queryByText("Claim items")).not.toBeInTheDocument();
    expect(screen.queryByText("Claim timeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Build or audit claim packets")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Metrics" }));
    expect(screen.getByText("Claim items")).toBeInTheDocument();
    expect(screen.getByText("Evidence score")).toBeInTheDocument();
    expect(screen.queryByText("Damaged antique dresser")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("Claim timeline")).toBeInTheDocument();
    expect(screen.getByText("Status changed")).toBeInTheDocument();
    expect(screen.queryByText("Claim items")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Packets" }));
    expect(screen.getByText("Build or audit claim packets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Claim packet" })).toHaveAttribute(
      "href",
      "/app/claim-packet?householdId=household_123&moveId=move_123&mode=submission"
    );
    expect(screen.queryByText("Status changed")).not.toBeInTheDocument();
  });
});
