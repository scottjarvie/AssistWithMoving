import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  shareLinks: {
    resolvePublicView: "shareLinks.resolvePublicView",
    updatePublicStatus: "shareLinks.updatePublicStatus",
    createPublicComment: "shareLinks.createPublicComment",
  },
}));

const shareData = vi.hoisted(() => ({
  view: null as unknown,
  resolvePublicView: vi.fn(),
  updatePublicStatus: vi.fn(),
  createPublicComment: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: (action: string) => {
    switch (action) {
      case apiMock.shareLinks.resolvePublicView:
        return shareData.resolvePublicView;
      case apiMock.shareLinks.updatePublicStatus:
        return shareData.updatePublicStatus;
      case apiMock.shareLinks.createPublicComment:
        return shareData.createPublicComment;
      default:
        return vi.fn();
    }
  },
}));

import { PublicShareViewer } from "@/components/public-share-viewer";

describe("PublicShareViewer", () => {
  beforeEach(() => {
    shareData.view = null;
    shareData.resolvePublicView.mockReset();
    shareData.updatePublicStatus.mockReset();
    shareData.createPublicComment.mockReset();
    shareData.resolvePublicView.mockImplementation(async () => shareData.view);
    shareData.updatePublicStatus.mockResolvedValue({
      changed: true,
      nextStatus: "loaded",
    });
    shareData.createPublicComment.mockResolvedValue({});
  });

  it("renders shared documentation packet records as mobile cards and desktop tables", async () => {
    shareData.view = documentationPacketView();

    render(<PublicShareViewer token="mmv_doc_token" />);

    const boxCards = await screen.findByRole("list", {
      name: "Documentation packet box cards",
    });
    expect(within(boxCards).getByText("B-12")).toBeInTheDocument();
    expect(within(boxCards).getByText("Kitchen -> Garage")).toBeInTheDocument();
    expect(within(boxCards).getByText("Warnings: overweight")).toBeInTheDocument();

    const itemCards = screen.getByRole("list", {
      name: "Documentation packet item cards",
    });
    expect(within(itemCards).getByText("Antique mirror")).toBeInTheDocument();
    expect(within(itemCards).getByText("Dining -> Storage")).toBeInTheDocument();
    expect(within(itemCards).getByText("Flags: fragile")).toBeInTheDocument();
    expect(
      within(itemCards).getByLabelText("Mobile status for Antique mirror")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("table", { name: "Documentation packet box table" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Documentation packet item table" })
    ).toBeInTheDocument();
  });

  it("renders shared sub-manifest records as mobile cards and desktop tables", async () => {
    shareData.view = subManifestView();

    render(<PublicShareViewer token="mmv_sub_token" />);

    const boxCards = await screen.findByRole("list", {
      name: "Sub-manifest box cards",
    });
    expect(within(boxCards).getByText("D-04")).toBeInTheDocument();
    expect(within(boxCards).getByText("Donation staging")).toBeInTheDocument();

    const itemCards = screen.getByRole("list", {
      name: "Sub-manifest item cards",
    });
    expect(within(itemCards).getByText("Kids bike")).toBeInTheDocument();
    expect(within(itemCards).getByText("D-04")).toBeInTheDocument();
    expect(
      within(itemCards).getByLabelText("Mobile status for Kids bike")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("table", { name: "Sub-manifest box table" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Sub-manifest item table" })
    ).toBeInTheDocument();
  });
});

const baseShareLink = {
  role: "viewer",
  allowedActions: ["view", "statusUpdate"],
  expiresAt: Date.UTC(2026, 6, 1),
  canDownload: false,
  canStatusUpdate: true,
  canComment: false,
  canUploadEvidence: false,
  canViewPlan: false,
};

function documentationPacketView() {
  return {
    status: "ready",
    kind: "documentationPacket",
    shareLink: baseShareLink,
    profile: {
      name: "Moving company packet",
      type: "movingCompany",
      disclaimer: "Recipient safe packet.",
    },
    packet: {
      packetKind: "movingCompany",
      profileType: "movingCompany",
      title: "Mover packet",
      generatedAt: Date.UTC(2026, 0, 1),
      recipientMode: "movingCompany",
      disclaimer: "Mover-safe fields only.",
      move: {
        title: "Test move",
        type: "local",
        origin: "Old house",
        destination: "New house",
        dateStart: "2026-07-01",
      },
      visibility: {
        ownerPrivateFieldsShown: false,
        valuesHidden: true,
        serialsHidden: true,
        privateNotesHidden: true,
        rawStorageHidden: true,
        disclosure: "Private fields are hidden.",
      },
      summary: {
        itemCount: 1,
        boxCount: 1,
        photoCount: 2,
        totalEstimatedWeightLb: 40,
        totalEstimatedVolumeCuFt: 8,
        metrics: [
          { label: "Items", value: 1 },
          { label: "Boxes", value: 1 },
        ],
      },
      sections: {
        boxes: [
          {
            boxId: "box_123",
            code: "B-12",
            label: "Fragile kitchen",
            room: "Kitchen",
            destinationRoom: "Garage",
            status: "sealed",
            assignedResource: "Truck",
            assignedZone: "Front",
            itemCount: 4,
            estimatedWeightLb: 42,
            warnings: ["overweight"],
          },
        ],
        items: [
          {
            itemId: "item_123",
            name: "Antique mirror",
            description: "Wrap before loading.",
            room: "Dining",
            destinationRoom: "Storage",
            category: "Decor",
            disposition: "mover",
            status: "packed",
            condition: "good",
            quantity: 1,
            estimatedWeightLb: 18,
            estimatedVolumeCuFt: 3,
            photoCount: 2,
            boxCodes: ["B-12"],
            flags: ["fragile"],
          },
        ],
      },
    },
  };
}

function subManifestView() {
  return {
    status: "ready",
    kind: "subManifest",
    shareLink: baseShareLink,
    profile: {
      name: "Donation pickup",
      type: "donationPickup",
      disclaimer: "Donation pickup packet.",
    },
    packet: {
      kind: "donation",
      mode: "recipient",
      generatedAt: Date.UTC(2026, 0, 1),
      title: "Donation pickup",
      disclaimer: "Only donation records are shown.",
      move: {
        title: "Test move",
        origin: "Old house",
        destination: "Donation center",
        dateStart: "2026-07-01",
      },
      visibility: {
        ownerPrivateFieldsShown: false,
        valuesHidden: true,
        serialsHidden: true,
        privateNotesHidden: true,
        rawStorageHidden: true,
      },
      summary: {
        itemCount: 1,
        quantity: 1,
        boxCount: 1,
        photoCount: 1,
        estimatedWeightLb: 20,
        estimatedVolumeCuFt: 5,
      },
      sections: {
        boxes: [
          {
            boxId: "box_donation",
            code: "D-04",
            label: "Donation staging",
            room: "Garage",
            status: "sealed",
            assignedResource: "Volunteer van",
            assignedZone: "Back",
          },
        ],
        items: [
          {
            itemId: "item_bike",
            name: "Kids bike",
            description: "Outgrown bike.",
            room: "Garage",
            category: "Sports",
            quantity: 1,
            disposition: "donate",
            status: "packed",
            condition: "good",
            photoCount: 1,
            estimatedWeightLb: 20,
            boxTrail: [{ code: "D-04", label: "Donation staging" }],
          },
        ],
      },
    },
  };
}
