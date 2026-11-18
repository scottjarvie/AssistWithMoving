import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BRAND_MARK_SRC, BrandMark } from "@/components/brand-mark";
import { buildPhases, product } from "@/lib/product";

describe("product constants", () => {
  it("uses Assist With Moving naming and local port defaults", () => {
    expect(product.name).toBe("Assist With Moving");
    expect(product.technicalName).toBe("AssistWithMoving");
    expect(product.domain).toBe("movingmanifest.com");
    expect(product.entryDomain).toBe("assistwithmoving.com");
    expect(product.localUrl).toBe("http://localhost:3827");
  });

  it("tracks the full build program phases", () => {
    expect(buildPhases).toHaveLength(11);
    expect(buildPhases).toContain("Documentation packets");
    expect(buildPhases).toContain("Launch hardening");
  });
});

describe("BrandMark", () => {
  it("renders the product name", () => {
    render(<BrandMark />);
    expect(screen.getByText("Assist With Moving")).toBeInTheDocument();
  });

  it("shows the app-icon mark as a decorative image beside the name", () => {
    const { container } = render(<BrandMark />);
    const mark = container.querySelector("img");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("src")).toBe(BRAND_MARK_SRC);
    expect(mark?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".lucide-route")).toBeNull();
  });
});
