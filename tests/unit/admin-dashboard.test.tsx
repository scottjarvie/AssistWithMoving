import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const overviewMutation = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => overviewMutation,
  useQuery: () => [],
}));

vi.mock("@/components/feature-flag-controls", () => ({
  FeatureFlagControls: () => <div>Feature flag controls</div>,
}));

vi.mock("@/components/launch-readiness-panel", () => ({
  LaunchReadinessPanel: () => <div>Launch readiness</div>,
}));

vi.mock("@/components/operational-signals-panel", () => ({
  OperationalSignalsPanel: () => <div>Operational signals</div>,
}));

import { AdminDashboard } from "@/components/admin-dashboard";

describe("AdminDashboard", () => {
  beforeEach(() => {
    overviewMutation.mockReset();
  });

  it("shows a clean unauthorized state instead of the raw Convex server error", async () => {
    overviewMutation.mockRejectedValue(
      new Error("[CONVEX M(admin:overview)] [Request ID: 123] Server Error"),
    );

    render(<AdminDashboard />);

    expect(
      await screen.findByText(/You do not have MovingManifest admin access/),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Server Error Called by client/)).not.toBeInTheDocument();
    });
  });
});
