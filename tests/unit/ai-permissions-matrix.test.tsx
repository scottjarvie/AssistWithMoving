import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { AiPermissionsMatrix } from "@/components/ai-permissions-matrix";
import type { GrantRow } from "@/components/ai-connection-manager";

const abilities = [{ scope: "synthetic.read", label: "Read synthetic records", grants: "Read the selected synthetic records.", doesNotImply: "No changes.", writes: false }, { scope: "synthetic.write", label: "Change synthetic records", grants: "Save a synthetic result.", doesNotImply: "No access changes.", writes: true }];
function grant(status: GrantRow["status"]): GrantRow {
  return { grantId: `synthetic-${status}` as Id<"aiGrants">, label: `Synthetic ${status} connection`, status, scopes: ["synthetic.read"], moveScope: "selectedMoves", moveIds: ["synthetic-move"], consentSnapshot: [], approvedAt: 1, expiresAt: 2, lastUsedAt: null, lastToolName: null, useCount: 0, observedClientName: null, registrationMethodLabel: null, revokedAt: null, revokedReason: null, note: null, version: 1 };
}
describe("AI permissions matrix", () => {
  it("distinguishes current authority from expired/revoked approvals and unapproved abilities", () => {
    const onReview = vi.fn(), onRevoke = vi.fn();
    render(<AiPermissionsMatrix abilities={abilities} grants={[grant("active"), grant("expired"), grant("revoked")]} recentRefusals={new Set(["synthetic-active"])} onReview={onReview} onRevoke={onRevoke} onOpenActivity={vi.fn()} detailsPrefix="synthetic-details" reviewingId={null} />);
    const active = screen.getByRole("row", { name: /Synthetic active connection/ });
    expect(within(active).getByText("Approved")).toBeInTheDocument();
    expect(within(active).getByText("Not approved")).toBeInTheDocument();
    expect(within(active).getByText(/Recent refused request/)).toBeInTheDocument();
    for (const status of ["expired", "revoked"]) {
      const row = screen.getByRole("row", { name: new RegExp(`Synthetic ${status} connection`) });
      expect(within(row).getByText("Previously approved")).toBeInTheDocument();
      expect(within(row).queryByText("Approved")).not.toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /^Revoke/ })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Review Synthetic active connection" }));
    expect(onReview).toHaveBeenCalledWith("synthetic-active");
    expect(onRevoke).not.toHaveBeenCalled();
  });
});
