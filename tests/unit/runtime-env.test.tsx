import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import ProductLayout, {
  ProductBackendUnavailable,
} from "../../src/app/(product)/layout";
import { hasPublicConvexUrl } from "@/lib/runtime-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("renders through the product shell without mounting backend consumers", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");

    expect(() =>
      render(
        <ProductLayout>
          <p>Configured workspace child</p>
        </ProductLayout>,
      ),
    ).not.toThrow();

    expect(
      screen.getByRole("heading", {
        name: "Workspace backend is not configured",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Configured workspace child"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });
});
