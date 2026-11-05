import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";

type Entry = { id: string; name: string; room: string };
const entries: Entry[] = [{ id: "synthetic-1", name: "[synthetic] Lamp", room: "Den" }, { id: "synthetic-2", name: "[synthetic] Box", room: "Garage" }, { id: "synthetic-3", name: "[synthetic] Desk", room: "Den" }];
const columns: ColumnDef<Entry, unknown>[] = [
  { accessorKey: "name", meta: { label: "Name", mobile: "primary" }, header: ({ column }) => <DataTableColumnHeader column={column} label="Name" /> },
  { accessorKey: "room", meta: { label: "Room", description: "The recorded room for this synthetic entry.", mobile: "primary", groupable: true }, header: ({ column }) => <DataTableColumnHeader column={column} label="Room" /> },
];
let fixtureKey = 0;
function Collection({ onOpen }: { onOpen?: (row: Entry) => void }) {
  const [query, setQuery] = useState("");
  return <><input aria-label="Search synthetic records" value={query} onChange={event => setQuery(event.target.value)} /><DataTable data={entries.filter(row => row.name.toLowerCase().includes(query.toLowerCase()))} columns={columns} getRowId={row => row.id} preferenceKey={`synthetic-${fixtureKey}`} ariaLabel="Synthetic records" pageSize={2} enableRowSelection onRowOpen={onOpen} getRowOpenLabel={row => `Open ${row.name}`} unfilteredCount={entries.length} onClearFilters={() => setQuery("")} batchActions={({ selectedRows }) => <button>Apply selected {selectedRows.length}</button>} /></>;
}

describe("collection presentations share one record model", () => {
  beforeEach(() => { fixtureKey += 1; Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200, writable: true }); });

  it("applies phone Options without losing search, selection, grouping or the query node", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true });
    render(<Collection />);
    const query = screen.getByLabelText("Search synthetic records");
    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    await user.type(query, "Lamp");
    await user.selectOptions(screen.getByLabelText("Group records by"), "room");
    await user.click(screen.getByRole("button", { name: "Collection options" }));
    const sheet = screen.getByRole("dialog", { name: "Collection options" });
    const phoneViews = within(sheet).getByRole("group", { name: "Phone record view" });
    expect(within(sheet).getByRole("checkbox", { name: "Name" })).toBeInTheDocument();
    expect(within(sheet).getByRole("checkbox", { name: /Room/ })).toBeInTheDocument();
    expect(within(sheet).getByText("The recorded room for this synthetic entry.")).toBeInTheDocument();
    await user.click(within(phoneViews).getByRole("button", { name: "Grid" }));
    await user.click(within(sheet).getByRole("button", { name: "Comfortable" }));
    await user.click(within(sheet).getByRole("checkbox", { name: /Room/ }));
    await user.click(within(sheet).getByRole("button", { name: "Show records" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search synthetic records")).toBe(query);
    expect(query).toHaveValue("Lamp");
    expect(screen.getByLabelText("Group records by")).toHaveValue("room");
    expect(screen.getByRole("checkbox", { name: "Select row" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Apply selected 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collection options" }));
    const reopened = screen.getByRole("dialog", { name: "Collection options" });
    expect(within(reopened).getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    expect(within(reopened).getByRole("button", { name: "Comfortable" })).toHaveAttribute("aria-pressed", "true");
    expect(within(reopened).getByRole("checkbox", { name: /Room/ })).not.toBeChecked();
  });

  it("starts with Table and preserves selection and search through List and Grid", async () => {
    const user = userEvent.setup();
    render(<Collection />);
    expect(screen.getByRole("table", { name: "Synthetic records" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    await user.type(screen.getByLabelText("Search synthetic records"), "Lamp");
    for (const view of ["List", "Grid"]) {
      await user.click(screen.getByRole("button", { name: view }));
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getAllByRole("list")).toHaveLength(1);
      expect(screen.getByRole("checkbox", { name: "Select row" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("button", { name: "Apply selected 1" })).toBeInTheDocument();
      expect(screen.getByLabelText("Search synthetic records")).toHaveValue("Lamp");
    }
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("[synthetic] Lamp")).toBeInTheDocument();
    expect(screen.getByText(/2 hidden by this view/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByLabelText("Search synthetic records")).toHaveValue("");
  });

  it("groups before pagination, reports real matching counts and reverses header sort", async () => {
    const user = userEvent.setup();
    render(<Collection />);
    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    await user.selectOptions(screen.getByLabelText("Group records by"), "room");
    expect(screen.getByRole("button", { name: "Sort by Name" })).toHaveAccessibleDescription(/Ascending; secondary sort, priority 2/);
    expect(screen.getByRole("button", { name: "Sort by Room" }).closest("th")).toHaveAttribute("aria-sort", "ascending");
    let rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Room: Den");
    expect(rows[1]).toHaveTextContent("2 matching");
    expect(within(screen.getByRole("table")).queryByText("[synthetic] Box")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sort by Room" }));
    rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Room: Garage");
    await user.click(screen.getByRole("button", { name: "Sort by Room" }));
    rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Room: Den");
    expect(rows[2]).toHaveTextContent("[synthetic] Desk");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(within(screen.getByRole("table")).getByText("[synthetic] Box")).toBeInTheDocument();
  });

  it("changes density without remounting the query and applies column choices in every generic view", async () => {
    const user = userEvent.setup();
    render(<Collection />);
    const query = screen.getByLabelText("Search synthetic records");
    fireEvent.click(screen.getByRole("button", { name: "Density: compact" }));
    expect(screen.getByRole("button", { name: "Density: comfortable" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search synthetic records")).toBe(query);
    fireEvent.click(screen.getByRole("button", { name: "Choose columns" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /Room/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Sort by Room" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(within(screen.getByRole("list")).queryByText("Room")).not.toBeInTheDocument();
  });

  it("keeps normalized complete groups contiguous across a page boundary in every presentation", () => {
    type MixedEntry = { id: string; name: string; room?: string | null };
    const mixed: MixedEntry[] = Array.from({ length: 12 }, (_, index) => ({ id: `mixed-${index}`, name: `Synthetic ${index}`, room: index < 8 ? ["Den", "den", " Den "][index % 3] : [undefined, "", null, " "][index - 8] }));
    const mixedColumns: ColumnDef<MixedEntry, unknown>[] = [
      { accessorKey: "name", meta: { label: "Name", mobile: "primary" }, header: "Name" },
      { accessorKey: "room", meta: { label: "Room", mobile: "primary", groupable: true }, header: "Room" },
    ];
    render(<DataTable data={mixed} columns={mixedColumns} getRowId={row => row.id} preferenceKey={`mixed-${fixtureKey}`} pageSize={5} />);
    fireEvent.change(screen.getByLabelText("Group records by"), { target: { value: "room" } });
    let headings = screen.getByRole("table").querySelectorAll('th[scope="rowgroup"]');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("8 matching");
    fireEvent.click(screen.getByRole("button", { name: "Group order: ascending" }));
    expect(screen.getByRole("table")).not.toHaveTextContent("Not recorded");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    headings = screen.getByRole("table").querySelectorAll('th[scope="rowgroup"]');
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent("8 matching");
    expect(headings[1]).toHaveTextContent("Not recorded");
    expect(headings[1]).toHaveTextContent("4 matching");
    expect(screen.getByRole("table").querySelectorAll("tbody")).toHaveLength(2);
    for (const view of ["List", "Grid"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
      expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("8 matching");
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
    }
  });

  it("chooses List once on a phone and retains that choice after resize and remount", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true });
    const first = render(<Collection />);
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("list");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440, writable: true });
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("list")).toBe(list);
    first.unmount();
    render(<Collection />);
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("keeps reverse column sorting and group direction available in phone List and Grid", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true });
    render(<Collection />);
    await user.selectOptions(screen.getByLabelText("Group records by"), "room");
    await user.click(screen.getByRole("button", { name: "Group order: ascending" }));
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Garage");
    await user.click(screen.getByRole("button", { name: "Sort records" }));
    await user.click(screen.getByRole("button", { name: "Name: not sorted" }));
    await user.click(screen.getByRole("button", { name: "Name: ascending" }));
    expect(screen.getByRole("button", { name: "Name: descending" })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Group order: descending" }));
    for (const view of ["List", "Grid"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("[synthetic] Lamp");
    }
  });

  it("does not open a record when a nested checkbox is activated", () => {
    const onOpen = vi.fn();
    render(<Collection onOpen={onOpen} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open [synthetic] Lamp" }));
    expect(onOpen).toHaveBeenCalledWith(entries[0]);
  });

  it("retains a browser-local presentation after remounting, including denied storage writes", () => {
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const first = render(<Collection />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    first.unmount();
    render(<Collection />);
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Search synthetic records"), { target: { value: "Desk" } });
    expect(screen.getByText("[synthetic] Desk")).toBeInTheDocument();
    denied.mockRestore();
  });
});
