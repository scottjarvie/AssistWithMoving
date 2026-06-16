import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/floorplans/floorplans-page-shell", () => ({
  FloorplansPageShell: ({ mode }: { mode: string }) => (
    <main data-testid="floorplans-route-shell">
      <h1>Floorplans</h1>
      <span>{mode}</span>
    </main>
  ),
}));

import FloorPlanDraftRedirect from "../../src/app/(marketing)/floor-plan-draft/page";
import FloorplansPage from "../../src/app/(marketing)/floorplans/page";

describe("Floorplans routes", () => {
  it("renders /floorplans as the primary public interface", () => {
    render(<FloorplansPage />);

    expect(screen.getByRole("heading", { name: "Floorplans" })).toBeInTheDocument();
    expect(screen.getByTestId("floorplans-route-shell")).toHaveTextContent("public");
  });

  it("redirects the legacy floor-plan draft route", () => {
    FloorPlanDraftRedirect();

    expect(redirectMock).toHaveBeenCalledWith("/floorplans");
  });
});
