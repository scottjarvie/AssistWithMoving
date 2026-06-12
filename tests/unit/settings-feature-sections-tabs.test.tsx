import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  featureFlags: {
    effective: "featureFlags.effective",
  },
  users: {
    current: "users.current",
  },
  households: {
    listMine: "households.listMine",
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.featureFlags.effective:
        return [
          {
            key: "billingGates",
            enabled: true,
            environment: "development",
          },
        ];
      case apiMock.users.current:
        return {
          email: "scott@example.com",
          name: "Scott",
          appRole: "member",
          status: "active",
        };
      case apiMock.households.listMine:
        return [
          {
            household: {
              _id: "household_123" as Id<"households">,
              name: "Jarvie household",
            },
            role: "owner",
          },
        ];
      default:
        return undefined;
    }
  },
}));

vi.mock("@/components/settings-posture-overview", () => ({
  SettingsPostureOverview: () => <div>Security posture surface</div>,
}));

vi.mock("@/components/household-member-manager", () => ({
  HouseholdMemberManager: () => <div>Household members surface</div>,
}));

vi.mock("@/components/api-key-manager", () => ({
  ApiKeyManager: () => <div>AI access surface</div>,
}));

vi.mock("@/components/account-privacy-controls", () => ({
  AccountPrivacyControls: () => <div>Privacy controls surface</div>,
}));

vi.mock("@/components/billing-readiness-panel", () => ({
  BillingReadinessPanel: () => <div>Billing readiness surface</div>,
}));

import { SettingsFeatureSections } from "@/components/settings-feature-sections";

describe("SettingsFeatureSections", () => {
  it("keeps settings jobs separated behind tabs", async () => {
    const user = userEvent.setup();

    render(<SettingsFeatureSections />);

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Household" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI access" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("Security posture surface")).toBeInTheDocument();
    expect(screen.queryByText("Household members surface")).not.toBeInTheDocument();
    expect(screen.queryByText("AI access surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Privacy controls surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing readiness surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Household" }));
    expect(screen.getByText("Household members surface")).toBeInTheDocument();
    expect(screen.queryByText("Security posture surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "AI access" }));
    expect(screen.getByText("AI access surface")).toBeInTheDocument();
    expect(screen.queryByText("Household members surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Privacy" }));
    expect(screen.getByText("Privacy controls surface")).toBeInTheDocument();
    expect(screen.queryByText("AI access surface")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Billing" }));
    expect(screen.getByText("Billing readiness surface")).toBeInTheDocument();
    expect(screen.queryByText("Privacy controls surface")).not.toBeInTheDocument();
  });
});
