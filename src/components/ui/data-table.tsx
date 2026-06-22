"use client"

import * as React from "react"
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// ColumnMeta + visual conventions
// ---------------------------------------------------------------------------

/**
 * Per-column visual contract shared across every data-dense surface.
 *
 * `mobile` drives the responsive card: `primary` columns surface in the card
 * header/body, `expansion` columns are tucked into a "more" grid, and `hidden`
 * columns are dropped on small screens entirely. `headClassName`/`cellClassName`
 * let a column tune widths without callers reaching into table internals.
 */
export type ColumnMeta = {
  label: string
  mobile: "primary" | "expansion" | "hidden"
  headClassName?: string
  cellClassName?: string
  description?: string
  align?: "start" | "end"
  editable?: boolean
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label: string
    mobile: "primary" | "expansion" | "hidden"
    headClassName?: string
    cellClassName?: string
    description?: string
    align?: "start" | "end"
    editable?: boolean
  }
}

// Density / spacing constants so every table renders identically dense rows.
export const DATA_TABLE_DENSITY = {
  cell: "p-2 align-top",
  head: "h-10 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
  defaultColumn: "min-w-28",
} as const

// ---------------------------------------------------------------------------
// Helpers: empty state + skeleton
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-center",
        className
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function DataTableSkeleton({
  rows = 5,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-10 w-full", index === rows - 1 && "w-4/5")}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
}: {
  column: Column<TData, TValue>
  label: string
}) {
  if (!column.getCanSort()) {
    return <span>{label}</span>
  }

  const sorted = column.getIsSorted()
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown

  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1 rounded-md px-1 text-left text-xs font-medium uppercase tracking-wide hover:bg-muted"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Batch action contract
// ---------------------------------------------------------------------------

/**
 * Generic batch-action contract. Callers describe their actions as a tagged
 * union (`TAction`) and receive the selected rows; the shape is intentionally
 * promise-returning so a future server-side batch mutation is a drop-in for
 * today's client-side fan-out.
 */
export type OnBatchAction<TData, TAction> = (input: {
  action: TAction
  rows: TData[]
  clearSelection: () => void
}) => void | Promise<void>

type BatchActionsRenderProp<TData> = (input: {
  selectedRows: TData[]
  clearSelection: () => void
}) => React.ReactNode

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowId: (row: TData) => string
  sorting?: SortingState
  onSortingChange?: React.Dispatch<React.SetStateAction<SortingState>>
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: React.Dispatch<
    React.SetStateAction<ColumnFiltersState>
  >
  columnVisibility?: VisibilityState
  onColumnVisibilityChange?: React.Dispatch<
    React.SetStateAction<VisibilityState>
  >
  rowSelection?: RowSelectionState
  onRowSelectionChange?: React.Dispatch<
    React.SetStateAction<RowSelectionState>
  >
  enableRowSelection?: boolean
  pageSize?: number
  loading?: boolean
  renderMobileCard?: (input: {
    row: TData
    selected: boolean
    onSelectedChange: (checked: boolean) => void
    table: TanstackTable<TData>
  }) => React.ReactNode
  onRowOpen?: (row: TData) => void
  /** Optional accessible label for an openable row; defaults to "Open row details". */
  getRowOpenLabel?: (row: TData) => string
  toolbar?: React.ReactNode
  batchActions?: React.ReactNode | BatchActionsRenderProp<TData>
  emptyState?: React.ReactNode
  ariaLabel?: string
  /** Minimum width for the desktop table to keep dense columns readable. */
  minWidthClassName?: string
}

const SELECT_COLUMN_ID = "__select__"

// When a whole row is clickable (onRowOpen), a click or keypress that
// originated on a nested control — the select checkbox, an inline select, an
// action button, a link, or a text input — must NOT also trigger the row-open.
// We bail whenever the event target sits inside one of these interactive
// elements, so a single guard covers every table without callers touching each
// control.
const ROW_OPEN_IGNORE_SELECTOR =
  'button, a, input, select, textarea, label, [role="checkbox"], [role="menuitem"], [data-row-open-ignore]'

function isRowOpenIgnoredTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(ROW_OPEN_IGNORE_SELECTOR) !== null
  )
}

function useControllableState<S>(
  controlled: S | undefined,
  onChange: React.Dispatch<React.SetStateAction<S>> | undefined,
  fallback: S
): [S, React.Dispatch<React.SetStateAction<S>>] {
  const [internal, setInternal] = React.useState<S>(fallback)
  const value = controlled !== undefined ? controlled : internal
  const setValue = React.useCallback<
    React.Dispatch<React.SetStateAction<S>>
  >(
    (next) => {
      if (onChange) {
        onChange(next)
      } else {
        setInternal(next)
      }
    },
    [onChange]
  )
  return [value, setValue]
}

export function DataTable<TData>({
  data,
  columns,
  getRowId,
  sorting: sortingProp,
  onSortingChange,
  columnFilters: columnFiltersProp,
  onColumnFiltersChange,
  columnVisibility: columnVisibilityProp,
  onColumnVisibilityChange,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  enableRowSelection = false,
  pageSize = 10,
  loading = false,
  renderMobileCard,
  onRowOpen,
  getRowOpenLabel,
  toolbar,
  batchActions,
  emptyState,
  ariaLabel,
  minWidthClassName = "min-w-[980px]",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useControllableState<SortingState>(
    sortingProp,
    onSortingChange,
    []
  )
  const [columnFilters, setColumnFilters] =
    useControllableState<ColumnFiltersState>(
      columnFiltersProp,
      onColumnFiltersChange,
      []
    )
  const [columnVisibility, setColumnVisibility] =
    useControllableState<VisibilityState>(
      columnVisibilityProp,
      onColumnVisibilityChange,
      {}
    )
  const [rowSelection, setRowSelection] = useControllableState<RowSelectionState>(
    rowSelectionProp,
    onRowSelectionChange,
    {}
  )

  const resolvedColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableRowSelection) {
      return columns
    }
    const selectColumn: ColumnDef<TData, unknown> = {
      id: SELECT_COLUMN_ID,
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Select", mobile: "hidden", headClassName: "w-10" },
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          aria-label="Select all rows on this page"
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(value === true)
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          aria-label="Select row"
          onCheckedChange={(value) => row.toggleSelected(value === true)}
        />
      ),
    }
    return [selectColumn, ...columns]
  }, [columns, enableRowSelection])

  // TanStack Table intentionally returns mutable table helpers; this is the
  // supported API shape and is isolated to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: resolvedColumns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const clearSelection = React.useCallback(() => {
    setRowSelection({})
  }, [setRowSelection])

  const selectAllFiltered = React.useCallback(() => {
    const next: RowSelectionState = {}
    for (const row of table.getFilteredRowModel().rows) {
      if (row.getCanSelect()) {
        next[row.id] = true
      }
    }
    setRowSelection(next)
  }, [setRowSelection, table])

  const pageRows = table.getRowModel().rows
  const selectedRowModel = table.getSelectedRowModel().rows
  const selectedRows = selectedRowModel.map((row) => row.original)
  const selectedRowCount = selectedRows.length
  const filteredRowCount = table.getFilteredRowModel().rows.length

  if (loading) {
    return <DataTableSkeleton rows={pageSize > 6 ? 6 : pageSize} />
  }

  const hasRows = pageRows.length > 0

  return (
    <div className="space-y-2">
      {toolbar}

      {enableRowSelection && batchActions ? (
        <BatchActionToolbar
          selectedRowCount={selectedRowCount}
          filteredRowCount={filteredRowCount}
          onSelectAllFiltered={selectAllFiltered}
          onClearSelection={clearSelection}
        >
          {typeof batchActions === "function"
            ? batchActions({ selectedRows, clearSelection })
            : batchActions}
        </BatchActionToolbar>
      ) : null}

      {hasRows ? (
        <>
          {renderMobileCard ? (
            <div role="list" className="grid gap-3 md:hidden">
              {pageRows.map((row) => (
                <React.Fragment key={row.id}>
                  {renderMobileCard({
                    row: row.original,
                    selected: row.getIsSelected(),
                    onSelectedChange: (checked) => row.toggleSelected(checked),
                    table,
                  })}
                </React.Fragment>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              "overflow-x-auto rounded-md border border-border",
              renderMobileCard ? "hidden md:block" : "block"
            )}
          >
            <Table aria-label={ariaLabel} className={cn(minWidthClassName)}>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            DATA_TABLE_DENSITY.head,
                            meta?.headClassName ??
                              DATA_TABLE_DENSITY.defaultColumn,
                            meta?.align === "end" && "text-right"
                          )}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const openable = Boolean(onRowOpen)
                  return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    role={openable ? "button" : undefined}
                    tabIndex={openable ? 0 : undefined}
                    aria-label={
                      openable
                        ? getRowOpenLabel?.(row.original) ?? "Open row details"
                        : undefined
                    }
                    className={
                      openable
                        ? "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        : undefined
                    }
                    onClick={
                      openable
                        ? (event) => {
                            if (isRowOpenIgnoredTarget(event.target)) return
                            onRowOpen?.(row.original)
                          }
                        : undefined
                    }
                    onKeyDown={
                      openable
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return
                            if (isRowOpenIgnoredTarget(event.target)) return
                            event.preventDefault()
                            onRowOpen?.(row.original)
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            DATA_TABLE_DENSITY.cell,
                            meta?.cellClassName,
                            meta?.align === "end" && "text-right"
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        emptyState ?? (
          <EmptyState title="Nothing here yet" description="No rows to show." />
        )
      )}

      <DataTablePagination table={table} />
    </div>
  )
}

function DataTablePagination<TData>({
  table,
}: {
  table: TanstackTable<TData>
}) {
  const pageCount = Math.max(table.getPageCount(), 1)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        Page {table.getState().pagination.pageIndex + 1} of {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          <ChevronLeft aria-hidden="true" />
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Batch action toolbar (visible only when rows are selected)
// ---------------------------------------------------------------------------

export function BatchActionToolbar({
  selectedRowCount,
  filteredRowCount,
  onSelectAllFiltered,
  onClearSelection,
  children,
}: {
  selectedRowCount: number
  filteredRowCount: number
  onSelectAllFiltered: () => void
  onClearSelection: () => void
  children?: React.ReactNode
}) {
  if (selectedRowCount <= 0) {
    return null
  }

  const canSelectAllFiltered =
    filteredRowCount > 0 && selectedRowCount < filteredRowCount

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
      <Badge>{selectedRowCount} selected</Badge>
      {canSelectAllFiltered ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSelectAllFiltered}
        >
          Select all {filteredRowCount} filtered
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onClearSelection}
      >
        Clear
      </Button>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline editable cells
// ---------------------------------------------------------------------------

export function InlineSelectCell<TValue extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  size = "sm",
  className,
  disabled,
  renderLabel,
}: {
  value: TValue
  options: readonly TValue[]
  onValueChange: (value: TValue) => void
  ariaLabel: string
  size?: "sm" | "default"
  className?: string
  disabled?: boolean
  renderLabel?: (value: TValue) => React.ReactNode
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as TValue)}
    >
      <SelectTrigger
        size={size}
        aria-label={ariaLabel}
        className={cn("w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {renderLabel ? renderLabel(option) : option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function InlineCheckboxCell({
  checked,
  onCheckedChange,
  ariaLabel,
  label,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  ariaLabel: string
  label?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Checkbox
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {label}
    </label>
  )
}

export function InlineTextCell({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  className,
  disabled,
  type = "text",
}: {
  value: string
  onCommit: (value: string) => void
  ariaLabel: string
  placeholder?: string
  className?: string
  disabled?: boolean
  type?: React.HTMLInputTypeAttribute
}) {
  const [draft, setDraft] = React.useState(value)
  // Sync to the latest committed value during render (no effect needed):
  // when the upstream value changes, reset the draft to match.
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  const commit = () => {
    if (draft !== value) {
      onCommit(draft)
    }
  }

  return (
    <Input
      type={type}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cn("h-7 text-xs", className)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export type { Row, TanstackTable }
