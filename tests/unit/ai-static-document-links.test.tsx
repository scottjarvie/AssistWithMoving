import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

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

/**
 * Every route the App Router actually serves, read from the filesystem rather
 * than listed by hand — so a link to a page that was only planned (such as the
 * `/settings/ai` grant screen the MCP metadata advertises) fails here instead
 * of shipping as a 404.
 */
function appRoutes() {
  const appDir = resolve(process.cwd(), "src/app");
  const exact = new Set<string>();
  const dynamicParents = new Set<string>();

  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (/^\(.*\)$/.test(entry.name)) {
          walk(join(dir, entry.name), route);
          continue;
        }
        if (entry.name.startsWith("[")) {
          // A dynamic or catch-all segment serves everything beneath its parent.
          dynamicParents.add(route === "" ? "/" : route);
          walk(join(dir, entry.name), `${route}/${entry.name}`);
          continue;
        }
        walk(join(dir, entry.name), `${route}/${entry.name}`);
        continue;
      }
      if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        exact.add(route === "" ? "/" : route);
      }
    }
  };

  walk(appDir, "");
  return { exact, dynamicParents };
}

/** Dynamic segments and catch-alls make a literal href match impossible. */
function isServedRoute(
  href: string,
  routes: { exact: Set<string>; dynamicParents: Set<string> },
) {
  const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (routes.exact.has(path)) return true;
  return [...routes.dynamicParents].some(
    (parent) => path === parent || path.startsWith(`${parent}/`),
  );
}

describe("AI assistant document navigation", () => {
  it("keeps static and route-handler destinations out of App Router navigation", () => {
    render(<AiAssistantPage />);

    for (const name of [
      "AI-readable guide",
      "Full AI guide",
      "Short agent guide",
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
    // The canonical grant screen, not the older redirecting path.
    expect(screen.getByRole("link", { name: "AI connections" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
  });

  it("links only to destinations that exist", () => {
    render(<AiAssistantPage />);
    const routes = appRoutes();

    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("http") || href.startsWith("#")) continue;

      if (link.hasAttribute("data-next-link")) {
        expect(isServedRoute(href, routes), `unserved route: ${href}`).toBe(
          true,
        );
      } else {
        // Plain anchors are for static files and route handlers only.
        expect(href, `unexpected plain anchor: ${href}`).toMatch(
          /\.(txt|json)$/,
        );
      }
    }
  });
});
