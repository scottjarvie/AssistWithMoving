import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a data-next-link="true" href={href} {...props}>
      {children}
    </a>
  ),
}));

import AiAssistantPage from "@/app/(marketing)/ai/page";

describe("AI assistant document navigation", () => {
  it("keeps static and route-handler destinations out of App Router navigation", () => {
    render(<AiAssistantPage />);

    for (const name of [
      "AI-readable guide",
      "Full AI guide",
      "OpenAPI contract",
    ]) {
      for (const link of screen.getAllByRole("link", { name })) {
        expect(link).not.toHaveAttribute("data-next-link");
      }
    }

    for (const link of screen.getAllByRole("link", { name: /Start AI setup/ })) {
      expect(link).toHaveAttribute("data-next-link", "true");
      expect(link).toHaveClass("inline-flex");
      expect(link.className).toContain("focus-visible:");
    }
    for (const link of screen.getAllByRole("link", { name: "AI-readable guide" })) {
      expect(link).toHaveClass("inline-flex");
      expect(link.className).toContain("focus-visible:");
    }
    expect(screen.getByRole("link", { name: "REST API overview" })).toHaveAttribute(
      "data-next-link",
      "true",
    );
    expect(screen.getByRole("link", { name: "MCP overview" })).toHaveAttribute(
      "href",
      "/mcp/guide",
    );
    expect(screen.getByRole("link", { name: "MCP overview" })).toHaveAttribute(
      "data-next-link",
      "true",
    );
  });
});
