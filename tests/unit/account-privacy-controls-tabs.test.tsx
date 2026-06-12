import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  accountPrivacy: {
    status: "accountPrivacy.status",
    getAccountExportArtifact: "accountPrivacy.getAccountExportArtifact",
    createAccountExport: "accountPrivacy.createAccountExport",
    requestAccountDeletion: "accountPrivacy.requestAccountDeletion",
    cancelAccountDeletion: "accountPrivacy.cancelAccountDeletion",
    completeAccountDeletion: "accountPrivacy.completeAccountDeletion",
  },
}));

const privacyData = vi.hoisted(() => ({
  mutation: vi.fn(),
  status: {
    exports: [
      {
        exportJobId: "export_1" as Id<"accountExportJobs">,
        status: "completed",
        filename: "account-export.json",
        sizeBytes: 1200,
        summary: { moves: 1, items: 3 },
        createdAt: 1,
        completedAt: 2,
        expiresAt: 9999999999999,
      },
    ],
    pendingDeletion: null,
    deletionConfirmation: "DELETE MY ACCOUNT",
    retentionPolicy: {
      account: "Anonymized after deletion.",
      exports: "Exports expire automatically.",
    },
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => privacyData.mutation,
  useQuery: (query: string) =>
    query === apiMock.accountPrivacy.status ? privacyData.status : undefined,
}));

import { AccountPrivacyControls } from "@/components/account-privacy-controls";

describe("AccountPrivacyControls task tabs", () => {
  it("opens on exports and keeps retention and deletion work behind tabs", async () => {
    const user = userEvent.setup();

    render(<AccountPrivacyControls enabled />);

    expect(screen.getByRole("tab", { name: "Export" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getAllByText("account-export.json")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Create export" }),
    ).toBeInTheDocument();
    const exportCards = screen.getByRole("list", {
      name: "Account export cards",
    });
    expect(within(exportCards).getByText("account-export.json")).toBeInTheDocument();
    expect(within(exportCards).getByText("Moves: 1")).toBeInTheDocument();
    expect(within(exportCards).getByText("Items: 3")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Account export table" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Exports expire automatically."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No pending request")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request deletion" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Retention" }));

    expect(screen.getByRole("tab", { name: "Retention" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Exports expire automatically.")).toBeInTheDocument();
    expect(screen.getByText("Anonymized after deletion.")).toBeInTheDocument();
    expect(screen.queryByText("account-export.json")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Account export cards" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No pending request")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Delete account" }));

    expect(screen.getByRole("tab", { name: "Delete account" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("No pending request")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request deletion" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("account-export.json")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Exports expire automatically."),
    ).not.toBeInTheDocument();
  });
});
