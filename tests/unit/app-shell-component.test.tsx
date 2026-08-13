import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/account-menu", () => ({
  AccountMenu: () => <button type="button">Account menu</button>,
}));
vi.mock("@/components/mobile-capture-action", () => ({
  MobileCaptureAction: () => <button type="button">Add</button>,
}));
vi.mock("@/components/move-switcher", () => ({
  MoveSwitcher: () => (
    <button type="button">A deliberately long current move title</button>
  ),
}));
vi.mock("@/components/shell-section-eyebrow", () => ({
  ShellSectionEyebrow: () => <span>Moves</span>,
}));
vi.mock("@/components/workspace-nav", () => ({
  WorkspaceNav: ({ variant }: { variant: string }) => (
    <nav aria-label={`${variant} navigation`} />
  ),
}));

import { AppShell } from "@/components/app-shell";

describe("AppShell responsive workspace header", () => {
  it("reserves mobile width for the current move without losing the named home link", () => {
    render(<AppShell>Workspace content</AppShell>);

    const home = screen.getByRole("link", { name: "Assist With Moving home" });
    const wordmark = screen.getByText("Assist With Moving");
    const moveTrigger = screen.getByRole("button", {
      name: "A deliberately long current move title",
    });

    expect(home).toContainElement(wordmark);
    expect(wordmark).toHaveClass("hidden", "sm:inline");
    expect(moveTrigger.parentElement).toHaveClass("min-w-0", "flex-1");
  });
});
