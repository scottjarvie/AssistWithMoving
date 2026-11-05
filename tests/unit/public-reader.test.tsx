import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicBand, PublicPageChrome } from "@/components/public-page-chrome";

describe("public field guide", () => {
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
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeVisible();
  });
});
