import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import AboutPage from "@/app/(marketing)/about/page";
import FaqPage from "@/app/(marketing)/faq/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
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
  afterEach(cleanup);

  it.each([
    ["About", AboutPage],
    ["FAQ", FaqPage],
    ["Privacy", PrivacyPage],
  ] as const)(
    "%s explains that closed intake cannot accept or save requests",
    (_name, Page) => {
      const { container } = render(<Page />);
      expect(container).toHaveTextContent(/current intake status/);
      expect(container).toHaveTextContent(
        /when intake is closed, the desk cannot accept or save (?:reports|requests)/i,
      );
    },
  );

  it("keeps the privacy request path conditional without removing account controls", () => {
    render(<PrivacyPage />);
    const heading = screen.getByRole("heading", {
      name: "Privacy questions and requests",
    });
    const paragraph = heading.nextElementSibling;
    expect(paragraph).toHaveTextContent(/check the current intake status/i);
    expect(paragraph).toHaveTextContent(
      /when intake is open, use it for a privacy question, data request/i,
    );
    expect(paragraph).toHaveTextContent(/direct email contact is not available/i);
    expect(paragraph).toHaveTextContent(
      /account-level export and deletion controls also live in your settings once you are signed in/i,
    );
    expect(paragraph?.querySelector("a")).toHaveAttribute(
      "href", supportDeskUrl("home"),
    );
  });

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
