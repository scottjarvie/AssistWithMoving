import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
