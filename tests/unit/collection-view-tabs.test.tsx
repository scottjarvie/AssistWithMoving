import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollectionViewTabs } from "@/components/collection-view-tabs";

type Snapshot = { query: string };
function parse(value: unknown): Snapshot | null {
  return value && typeof value === "object" && "query" in value && typeof value.query === "string" ? { query: value.query } : null;
}
function Harness({ storageKey }: { storageKey: string }) {
  const [snapshot, setSnapshot] = useState({ query: "" });
  return <><label>Fixture query<input value={snapshot.query} onChange={event => setSnapshot({ query: event.target.value })} /></label><CollectionViewTabs storageKey={storageKey} builtIns={[{ id: "built-in:all", label: "All", snapshot: { query: "" } }]} snapshot={snapshot} onApply={setSnapshot} parseSnapshot={parse} /></>;
}
function saveView(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Save as view" }));
  fireEvent.change(screen.getByLabelText("View name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
}
describe("real collection saved views", () => {
  it("updates, renames and deletes a saved view with confirmation and retained focus", async () => {
    const storageKey = "synthetic-view-management";
    window.localStorage.removeItem(storageKey);
    render(<Harness storageKey={storageKey} />);
    fireEvent.change(screen.getByLabelText("Fixture query"), { target: { value: "synthetic first" } });
    saveView("Synthetic saved view");
    fireEvent.change(screen.getByLabelText("Fixture query"), { target: { value: "synthetic updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Update view" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save as view" })).toHaveFocus());
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)[0].snapshot.query).toBe("synthetic updated");
    fireEvent.click(screen.getByRole("button", { name: "Rename view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Synthetic renamed view" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Rename this view" })).getByRole("button", { name: "Rename view" }));
    expect(screen.getByRole("button", { name: "Synthetic renamed view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Fixture query")).toHaveValue("synthetic updated");
    fireEvent.click(screen.getByRole("button", { name: "Delete view" }));
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete this view" }));
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual([]);
    expect(screen.queryByRole("button", { name: "Synthetic renamed view" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save as view" })).toHaveFocus());
  });

  it("preserves a real session view after remount when persistent writes are refused", () => {
    const storageKey = "synthetic-view-denied-storage";
    window.localStorage.removeItem(storageKey);
    const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("synthetic storage refusal"); });
    try {
      const first = render(<Harness storageKey={storageKey} />);
      fireEvent.change(screen.getByLabelText("Fixture query"), { target: { value: "synthetic session query" } });
      saveView("Synthetic session view");
      expect(screen.getByRole("status")).toHaveTextContent(/for this session; browser storage is unavailable/);
      first.unmount();
      render(<Harness storageKey={storageKey} />);
      fireEvent.click(screen.getByRole("button", { name: "Synthetic session view" }));
      expect(screen.getByLabelText("Fixture query")).toHaveValue("synthetic session query");
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    } finally { refused.mockRestore(); }
  });
});
