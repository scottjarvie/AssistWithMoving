import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayPreferenceManager, DisplayPreferencePanel } from "@/components/display-preferences";
import { DISPLAY_PREFERENCES_KEY, parseDisplayPreferences } from "@/lib/display-preferences";

describe("Moving display preferences", () => {
  let matches = false;
  const listeners = new Set<() => void>();
  beforeEach(() => {
    matches = false;
    listeners.clear();
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", () => ({ get matches() { return matches; }, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }));
    window.dispatchEvent(new StorageEvent("storage", { key: DISPLAY_PREFERENCES_KEY, newValue: null }));
  });
  afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove("dark"); delete document.documentElement.dataset.navigation; });

  it("validates corrupt or future preference values without adopting arbitrary attributes", () => {
    expect(parseDisplayPreferences("broken")).toEqual({ appearance: "system", navigation: "side" });
    expect(parseDisplayPreferences('{"appearance":"unknown","navigation":"elsewhere"}')).toEqual({ appearance: "system", navigation: "side" });
    expect(parseDisplayPreferences('{"appearance":"dark","navigation":"top"}')).toEqual({ appearance: "dark", navigation: "top" });
  });

  it("changes independent appearance/navigation preferences without remounting an unfinished input", async () => {
    render(<><DisplayPreferenceManager /><DisplayPreferencePanel includeNavigation /><textarea aria-label="Unfinished Queue draft" defaultValue="Keep the lamp upright" /></>);
    const draft = screen.getByRole("textbox", { name: "Unfinished Queue draft" });
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    fireEvent.click(screen.getByRole("radio", { name: "Top" }));
    await waitFor(() => expect(document.documentElement.dataset.navigation).toBe("top"));
    expect(screen.getByRole("textbox", { name: "Unfinished Queue draft" })).toBe(draft);
    expect(draft).toHaveValue("Keep the lamp upright");
    expect(parseDisplayPreferences(window.localStorage.getItem(DISPLAY_PREFERENCES_KEY))).toEqual({ appearance: "dark", navigation: "top" });
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    expect(document.documentElement.dataset.navigation).toBe("top");
  });

  it("tracks device changes only in System mode, including a browser-tab preference update", async () => {
    render(<><DisplayPreferenceManager /><DisplayPreferencePanel /></>);
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    matches = true;
    listeners.forEach(listener => listener());
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    listeners.forEach(listener => listener());
    expect(document.documentElement).not.toHaveClass("dark");
    fireEvent(window, new StorageEvent("storage", { key: DISPLAY_PREFERENCES_KEY, newValue: '{"appearance":"dark","navigation":"side"}' }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("keeps controls working when browser storage refuses writes", async () => {
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    render(<><DisplayPreferenceManager /><DisplayPreferencePanel /></>);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    denied.mockRestore();
  });
});
