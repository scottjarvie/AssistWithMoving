import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicBand, PublicPageChrome } from "@/components/public-page-chrome";
import About from "@/app/(marketing)/about/page";
import Ai from "@/app/(marketing)/ai/page";
import Claims from "@/app/(marketing)/claims-inventory/page";
import Faq from "@/app/(marketing)/faq/page";
import Features from "@/app/(marketing)/features/page";
import Mcp from "@/app/(marketing)/mcp/guide/page";
import Pcs from "@/app/(marketing)/pcs-moving/page";
import Privacy from "@/app/(marketing)/privacy/page";
import Terms from "@/app/(marketing)/terms/page";
import Api from "@/app/api/page";

describe("public field guide", () => {
  it.each([
    ["about", About, 3], ["ai", Ai, 7], ["claims", Claims, 2],
    ["faq", Faq, 2], ["features", Features, 2], ["mcp", Mcp, 7],
    ["pcs", Pcs, 2], ["privacy", Privacy, 2], ["terms", Terms, 2], ["api", Api, 3],
  ] as const)("gives every real %s band a descriptive, unique destination", (_route, Page, count) => {
    render(<Page />);
    const links = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole("link");
    expect(links).toHaveLength(count);
    expect(new Set(links.map(link => link.getAttribute("href"))).size).toBe(count);
    for (const link of links) {
      expect(link).not.toHaveTextContent(/Guide section \d|At a glance/);
      const section = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(section?.tagName).toBe("SECTION");
      expect(section?.closest("article")).not.toBeNull();
    }
  });
  it("links every reading section and retains nested content, actions and the workflow explanation", () => {
    render(<PublicPageChrome eyebrow="Synthetic guide" title="Synthetic reading page" description="Fictional reader fixture." primaryAction={{ href: "/synthetic-primary", label: "Primary destination" }} secondaryAction={{ href: "/synthetic-secondary", label: "Secondary destination" }}>
      <PublicBand><div><h2>Read <em>the evidence</em></h2><p>Synthetic evidence text.</p></div></PublicBand>
      <PublicBand><h2>Keep every action</h2><a href="/synthetic-detail">Synthetic detail</a></PublicBand>
    </PublicPageChrome>);
    const contents = screen.getByRole("navigation", { name: "On this page" });
    const links = within(contents).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Read the evidence", "Keep every action"]);
    for (const link of links) {
      const section = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(section?.tagName).toBe("SECTION");
      expect(section).toHaveTextContent(link.textContent!);
    }
    expect(screen.getByText("Synthetic evidence text.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Primary destination" })).toHaveAttribute("href", "/synthetic-primary");
    expect(screen.getByRole("link", { name: "Secondary destination" })).toHaveAttribute("href", "/synthetic-secondary");
    expect(screen.getByRole("link", { name: "Synthetic detail" })).toHaveAttribute("href", "/synthetic-detail");
    expect(screen.getByText("How Moving works").closest("details")).toHaveTextContent("Return to trusted results");
    expect(screen.getByRole("heading", { name: "Guide context" })).toBeVisible();
    const article = document.querySelector("article")!;
    expect(contents.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(article.compareDocumentPosition(screen.getByRole("complementary", { name: "Guide context" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
