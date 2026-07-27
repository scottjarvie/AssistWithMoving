import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ColumnDef } from "@tanstack/react-table";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/ui/data-table";

type TestRow = {
  id: string;
  name: string;
};

const rows: TestRow[] = [
  { id: "row_1", name: "Packing blankets" },
  { id: "row_2", name: "Hand truck" },
];

const columns: ColumnDef<TestRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
    meta: { label: "Name", mobile: "primary" },
  },
];

let desktopViewport = true;
const mediaQueryListeners = new Set<() => void>();

function setDesktopViewport(matches: boolean) {
  desktopViewport = matches;
  for (const listener of mediaQueryListeners) listener();
}

function ResponsiveDataTable() {
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      ariaLabel="Moving equipment"
      enableRowSelection
      toolbar={<input aria-label="Search moving equipment" />}
      renderMobileCard={({ row, selected, onSelectedChange }) => (
        <div role="listitem">
          <span>{row.name}</span>
          <input
            type="checkbox"
            aria-label={`Select ${row.name}`}
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
        </div>
      )}
    />
  );
}

describe("DataTable responsive rendering", () => {
  beforeEach(() => {
    mediaQueryListeners.clear();
    setDesktopViewport(true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return query === "(min-width: 768px)" ? desktopViewport : false;
        },
        media: query,
        onchange: null,
        addEventListener: vi.fn(
          (_event: string, listener: () => void) =>
            mediaQueryListeners.add(listener),
        ),
        removeEventListener: vi.fn(
          (_event: string, listener: () => void) =>
            mediaQueryListeners.delete(listener),
        ),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  it("mounts the desktop table without mobile cards", () => {
    render(<ResponsiveDataTable />);

    expect(
      screen.getByRole("table", { name: "Moving equipment" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("mounts mobile cards without the desktop table", () => {
    setDesktopViewport(false);

    render(<ResponsiveDataTable />);

    const mobileCards = screen.getByRole("list");
    expect(within(mobileCards).getByText("Packing blankets")).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Moving equipment" }),
    ).not.toBeInTheDocument();
  });

  it("replaces the mounted tree while preserving shared focus and selection state", () => {
    render(<ResponsiveDataTable />);

    fireEvent.click(screen.getAllByLabelText("Select row")[0]);
    const search = screen.getByLabelText("Search moving equipment");
    search.focus();

    act(() => setDesktopViewport(false));

    expect(search).toHaveFocus();
    expect(
      screen.queryByRole("table", { name: "Moving equipment" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select Packing blankets")).toBeChecked();

    act(() => setDesktopViewport(true));

    expect(screen.getAllByLabelText("Select row")[0]).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  it("server-renders a status skeleton without the responsive interaction trees", () => {
    const serverHtml = renderToString(<ResponsiveDataTable />);

    expect(serverHtml).toContain('role="status"');
    expect(serverHtml).toContain('aria-label="Loading Moving equipment"');
    expect(serverHtml).not.toContain("<table");
    expect(serverHtml).not.toContain('role="list"');
  });
});
