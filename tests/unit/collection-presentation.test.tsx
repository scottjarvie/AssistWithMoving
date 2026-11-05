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
  { accessorKey: "room", meta: { label: "Room", mobile: "primary" }, header: ({ column }) => <DataTableColumnHeader column={column} label="Room" /> },
];
let fixtureKey = 0;
function Collection({ onOpen }: { onOpen?: (row: Entry) => void }) {
  const [query, setQuery] = useState("");
  return <><input aria-label="Search synthetic records" value={query} onChange={event => setQuery(event.target.value)} /><DataTable data={entries.filter(row => row.name.toLowerCase().includes(query.toLowerCase()))} columns={columns} getRowId={row => row.id} preferenceKey={`synthetic-${fixtureKey}`} ariaLabel="Synthetic records" pageSize={2} enableRowSelection onRowOpen={onOpen} getRowOpenLabel={row => `Open ${row.name}`} unfilteredCount={entries.length} onClearFilters={() => setQuery("")} batchActions={({ selectedRows }) => <button>Apply selected {selectedRows.length}</button>} /></>;
}

describe("collection presentations share one record model", () => {
  beforeEach(() => { fixtureKey += 1; });

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
    await user.selectOptions(screen.getByLabelText("Group records by"), "room");
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
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Room" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Sort by Room" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(within(screen.getByRole("list")).queryByText("Room")).not.toBeInTheDocument();
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
