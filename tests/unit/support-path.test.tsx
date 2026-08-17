import { readFileSync } from "node:fs";
import path from "node:path";

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

import { PublicFooter } from "@/components/public-page-chrome";
import { supportDesk, supportDeskUrl } from "@/lib/support";

const repoRoot = path.resolve(__dirname, "../..");

const publicCopySources = [
  "src/components/public-page-chrome.tsx",
  "src/app/(marketing)/faq/page.tsx",
  "src/app/(marketing)/about/page.tsx",
  "src/app/(marketing)/privacy/page.tsx",
  "src/app/(marketing)/terms/page.tsx",
  "src/app/(marketing)/ai/page.tsx",
  "src/app/(marketing)/mcp/guide/page.tsx",
  "public/llms.txt",
  "public/llms-full.txt",
  "public/ai.txt",
];

describe("support path", () => {
  it("builds a desk link the central desk can attribute to Assist With Moving", () => {
    const url = new URL(supportDeskUrl("home"));

    expect(`${url.origin}${url.pathname}`).toBe(supportDesk.baseUrl);
    expect(url.searchParams.get("source")).toBe("assist-with-moving");
    expect(url.searchParams.get("v")).toBe("1");
    expect(url.searchParams.get("page")).toBe("home");
    // Omitting the page still names the product.
    expect(new URL(supportDeskUrl()).searchParams.get("page")).toBeNull();
  });

  it("puts the support desk on every public page through the shared footer", () => {
    render(<PublicFooter />);

    const links = screen.getAllByRole("link", {
      name: new RegExp(`Support|${supportDesk.name}`),
    });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", supportDeskUrl("home"));
      // The desk is another site, so it must not route through App Router.
      expect(link).not.toHaveAttribute("data-next-link");
    }
    expect(
      screen.getByText(/no support email address/i),
    ).toBeInTheDocument();
  });

  it("publishes no contact mailbox anywhere in public copy", () => {
    for (const relativePath of publicCopySources) {
      const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
      expect(
        source,
        `${relativePath} must not publish a mailto: link`,
      ).not.toMatch(/mailto:/i);
      expect(
        source,
        `${relativePath} must not publish a contact address`,
      ).not.toMatch(
        /(support|contact|privacy|hello|help|info)@[a-z0-9.-]+\.[a-z]{2,}/i,
      );
    }
  });
});
