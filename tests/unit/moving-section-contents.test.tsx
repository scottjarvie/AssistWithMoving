import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { Tabs, TabsContent } from "@/components/ui/tabs";

function Sections() {
  const [value, setValue] = useState("start");
  return <Tabs value={value} onValueChange={setValue}>
    <MoveWorkspaceTabList activeValue={value} tabs={[{ value: "start", label: "Start location", count: 2 }, { value: "transport", label: "Transportation", count: 3 }, { value: "people", label: "Participants", count: 0 }]} />
    <TabsContent value="start">Origin rooms</TabsContent><TabsContent value="transport">Transport resources</TabsContent><TabsContent value="people">People with access</TabsContent>
  </Tabs>;
}

describe("section contents fallback", () => {
  it("requests a controlled change and respects the owner's refusal", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs value="first" onValueChange={onValueChange} activationMode="manual"><MoveWorkspaceTabList tabs={[{ value: "first", label: "First" }, { value: "second", label: "Second" }]} /><TabsContent value="first">First panel</TabsContent><TabsContent value="second">Second panel</TabsContent></Tabs>);
    await user.click(screen.getByRole("button", { name: "All 2 sections" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Second" }));
    expect(onValueChange).toHaveBeenCalledWith("second");
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("First panel");
    await user.click(screen.getByRole("button", { name: "All 2 sections" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "First" })).toHaveAttribute("aria-pressed", "true");
  });
  it("isolates nested selections and reports the uncontrolled selected section", async () => {
    const user = userEvent.setup();
    render(<Tabs defaultValue="outer-first"><MoveWorkspaceTabList ariaLabel="Outer sections" tabs={[{ value: "outer-first", label: "Outer first" }, { value: "outer-second", label: "Outer second" }]} /><TabsContent value="outer-first"><Tabs defaultValue="inner-first" activationMode="manual"><MoveWorkspaceTabList ariaLabel="Inner sections" tabs={[{ value: "inner-first", label: "Inner first", description: "Inner first explanation" }, { value: "inner-second", label: "Inner second", description: "Inner second explanation" }, { value: "inner-third", label: "Inner third" }]} /><TabsContent value="inner-first">First inner panel</TabsContent><TabsContent value="inner-second">Second inner panel</TabsContent></Tabs></TabsContent><TabsContent value="outer-second">Second outer panel</TabsContent></Tabs>);
    await user.click(screen.getByRole("button", { name: "All 3 sections" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Inner second" }));
    expect(screen.getByRole("tab", { name: "Outer first" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Inner second" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Inner second explanation")).toBeVisible();
    expect(screen.queryByText("Inner first explanation")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All 3 sections" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Inner second" })).toHaveAttribute("aria-pressed", "true");
  });
  it("selects an uncontrolled destination explicitly even with manual tab activation", async () => {
    const user = userEvent.setup();
    render(<Tabs defaultValue="first" activationMode="manual"><MoveWorkspaceTabList tabs={[{ value: "first", label: "First" }, { value: "second", label: "Second" }]} /><TabsContent value="first">First panel</TabsContent><TabsContent value="second">Second panel</TabsContent></Tabs>);
    await user.click(screen.getByRole("button", { name: "All 2 sections" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Second" }));
    await waitFor(() => expect(screen.getByRole("tabpanel")).toHaveTextContent("Second panel"));
    expect(screen.getByRole("tab", { name: "Second" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
  });
  it("keeps section meaning exact and the explanatory prose outside sticky chrome", () => {
    render(<Tabs defaultValue="details"><MoveWorkspaceTabList sticky="below-operations" activeValue="details" tabs={[
      { value: "details", label: "Details", description: "Actual move facts" },
      { value: "claims", label: "Claims" }, { value: "upload", label: "Add photos" },
    ]} /></Tabs>);
    expect(screen.getByRole("tab", { name: "Details" }).querySelector('[data-symbol="settings"]')).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Claims" }).querySelector('[data-symbol="source"]')).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Add photos" }).querySelector('[data-symbol="camera"]')).not.toBeNull();
    expect(document.querySelector('[data-symbol="ai"]')).toBeNull();
    expect(screen.getByText("Actual move facts").closest("[data-moving-sections]")).toBeNull();
  });
  it("opens any section without scrolling the tab strip and creates no duplicate tab IDs", async () => {
    const user = userEvent.setup();
    render(<Sections />);
    await user.click(screen.getByRole("button", { name: "All 3 sections" }));
    const contents = screen.getByRole("dialog");
    await user.click(within(contents).getByRole("button", { name: "Transportation: 3" }));
    await waitFor(() => expect(screen.getByRole("tabpanel")).toHaveTextContent("Transport resources"));
    expect(screen.getByRole("tab", { name: "Transportation: 3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
