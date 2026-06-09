import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductBackendUnavailable } from "../../src/app/(product)/layout";
import { hasPublicConvexUrl } from "@/lib/runtime-env";

describe("runtime env helpers", () => {
  it("treats blank Convex URLs as unconfigured", () => {
    expect(hasPublicConvexUrl({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      hasPublicConvexUrl({
        NEXT_PUBLIC_CONVEX_URL: "   ",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("detects configured public Convex URLs", () => {
    expect(
      hasPublicConvexUrl({
        NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});

describe("ProductBackendUnavailable", () => {
  it("renders the missing backend fallback without Convex hooks", () => {
    render(<ProductBackendUnavailable />);

    expect(
      screen.getByRole("heading", {
        name: "Workspace backend is not configured",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Backend env missing")).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_CONVEX_URL/)).toBeInTheDocument();
  });
});
