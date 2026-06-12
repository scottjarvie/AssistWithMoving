import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  documentationProfiles: {
    listForMove: "documentationProfiles.listForMove",
    create: "documentationProfiles.create",
    update: "documentationProfiles.update",
    archive: "documentationProfiles.archive",
  },
  shareLinks: {
    listForMove: "shareLinks.listForMove",
    listCommentsForMove: "shareLinks.listCommentsForMove",
    create: "shareLinks.create",
    revoke: "shareLinks.revoke",
  },
  exports: {
    listForMove: "exports.listForMove",
    getArtifact: "exports.getArtifact",
    createCsv: "exports.createCsv",
    createFloorPlanPrint: "exports.createFloorPlanPrint",
  },
}));

const profile = {
  _id: "profile_1" as Id<"documentationProfiles">,
  type: "movingCompany" as const,
  name: "Moving company",
  status: "active" as const,
  includedFields: ["moveSummary", "items", "boxes", "photos"] as const,
  imageRule: "thumbsOnly" as const,
  filters: {},
  allowedActions: ["view", "download", "statusUpdate"] as const,
  exportHistory: [],
};

const activeLink = {
  _id: "share_1" as Id<"shareLinks">,
  documentationProfileId: "profile_1" as Id<"documentationProfiles">,
  scope: "profile" as const,
  tokenPreview: "mmv_abc",
  label: "Moving company",
  role: "viewer",
  status: "active" as const,
  allowedActions: ["view"] as const,
  expiresAt: Date.now() + 1000,
  accessCount: 0,
};

const comment = {
  _id: "comment_1" as Id<"shareLinkComments">,
  shareLinkId: "share_1" as Id<"shareLinks">,
  documentationProfileId: "profile_1" as Id<"documentationProfiles">,
  profileName: "Moving company",
  tokenPreview: "mmv_abc",
  role: "viewer",
  authorLabel: "Mover",
  body: "Looks good.",
  createdAt: Date.UTC(2026, 0, 1),
};

const exportJob = {
  exportJobId: "export_1" as Id<"exportJobs">,
  type: "inventory" as const,
  format: "csv" as const,
  status: "completed" as const,
  filename: "movingmanifest-inventory.csv",
  rowCount: 12,
  createdAt: Date.UTC(2026, 0, 2),
};

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.documentationProfiles.listForMove:
        return [profile];
      case apiMock.shareLinks.listForMove:
        return [activeLink];
      case apiMock.shareLinks.listCommentsForMove:
        return [comment];
      case apiMock.exports.listForMove:
        return [exportJob];
      default:
        return undefined;
    }
  },
}));

import { DocumentationPacketBuilder } from "@/components/documentation-packet-builder";

function renderBuilder() {
  render(
    <DocumentationPacketBuilder
      householdId={"household_1" as Id<"households">}
      moveId={"move_1" as Id<"moves">}
      moveType="local"
      selectedProfileTypes={["movingCompany"]}
    />
  );
}

describe("DocumentationPacketBuilder task tabs", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_1/packets");
  });

  it("opens on profile configuration instead of stacking exports and shares", () => {
    renderBuilder();

    expect(screen.getByRole("tab", { name: "Configure" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Exports" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Share links" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Packet views" })).toBeInTheDocument();
    expect(screen.getByLabelText("Packet profile name")).toHaveValue(
      "Moving company"
    );
    expect(
      screen.queryByRole("button", { name: "Inventory CSV" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create link token" })
    ).not.toBeInTheDocument();
  });

  it("separates exports, share links, and packet views into their own tasks", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("tab", { name: "Exports" }));
    expect(
      screen.getByRole("button", { name: "Inventory CSV" })
    ).toBeInTheDocument();
    expect(screen.getByText(/movingmanifest-inventory\.csv/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Packet profile name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Share links" }));
    expect(
      screen.getByRole("button", { name: "Create link token" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Active links" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recipient comments" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Mover packet" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Packet views" }));
    expect(screen.getByRole("link", { name: "Mover packet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mover owner" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create link token" })
    ).not.toBeInTheDocument();
  });

  it("opens exports from the packet exports hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_1/packets#packet-exports",
    );

    renderBuilder();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Exports" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(screen.getByRole("button", { name: "Inventory CSV" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Packet profile name")).not.toBeInTheDocument();
  });

  it("opens share links from the packet share hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_1/packets#packet-share-links",
    );

    renderBuilder();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Share links" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(
      screen.getByRole("button", { name: "Create link token" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inventory CSV" })).not.toBeInTheDocument();
  });
});
