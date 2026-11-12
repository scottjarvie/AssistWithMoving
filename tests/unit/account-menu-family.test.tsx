import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignedInAccountSurface } from "@/components/account-menu";
vi.mock("next/navigation", () => ({ usePathname: () => "/app/moves" }));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
afterEach(cleanup);
const identity = {initial:"?", displayName:"A synthetic person", email:"person@example.invalid"};
describe("Moving account standard — 2026-11-12", () => {
  it("preserves destinations, first-link focus and backend role visibility", async () => {
    render(<SignedInAccountSurface {...identity} isAdmin={false} signOut={vi.fn()}/>);
    const trigger = screen.getByRole("button", {name:"Account menu"});
    fireEvent.keyDown(trigger, {key:"ArrowDown"});
    expect(await screen.findByRole("link", {name:"Connect your chosen AI"})).toHaveAttribute("href", "/settings/ai");
    expect(screen.getByRole("link", {name:"AI setup guide"})).toHaveAttribute("href", "/ai");
    expect(screen.getByRole("link", {name:"Settings"})).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", {name:"Admin"})).toBeNull();
    await waitFor(() => expect(screen.getByRole("link", {name:"Connect your chosen AI"})).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, {key:"End"});
    expect(screen.getByRole("button", {name:"Sign out"})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, {key:"Home"});
    expect(screen.getByRole("link", {name:"Connect your chosen AI"})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, {key:"Escape"});
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("locks duplicate sign-out and keeps failures retryable", async () => {
    let reject!: (error: Error) => void;
    const signOut = vi.fn(() => new Promise((_, fail) => {reject = fail;}));
    render(<SignedInAccountSurface {...identity} isAdmin signOut={signOut}/>);
    fireEvent.click(screen.getByRole("button", {name:"Account menu"}));
    expect(await screen.findByRole("link", {name:"Admin"})).toHaveAttribute("href", "/admin");
    const exit = screen.getByRole("button", {name:"Sign out"});
    fireEvent.click(exit); fireEvent.click(exit);
    expect(signOut).toHaveBeenCalledTimes(1);
    reject(new Error("synthetic"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
    fireEvent.click(screen.getByRole("button", {name:"Retry"}));
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
