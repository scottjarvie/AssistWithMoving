"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste, PackageCheck } from "lucide-react";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  parseBulkInventoryText,
  type BulkInventoryRow,
} from "@/lib/bulk-inventory";
import { parseOptionalNumber } from "@/lib/inventory-detail";
import { itemDispositionOptions } from "@/lib/inventory-options";

function updateRow(
  rows: BulkInventoryRow[],
  id: string,
  patch: Partial<BulkInventoryRow>
) {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

function BulkDraftCard({
  row,
  onChange,
}: {
  row: BulkInventoryRow;
  onChange: (patch: Partial<BulkInventoryRow>) => void;
}) {
  return (
    <div role="listitem" className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={row.selected}
            onChange={(event) => onChange({ selected: event.target.checked })}
            aria-label={`Use ${row.name}`}
          />
          Use draft
        </label>
        <Badge variant="outline">Qty {row.quantity || "1"}</Badge>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          Item
          <Input
            className="mt-1"
            value={row.name}
            onChange={(event) => onChange({ name: event.target.value })}
            aria-label={`Item name for ${row.name}`}
          />
        </label>
        <label className="block text-xs font-medium">
          Room
          <Input
            className="mt-1"
            value={row.room}
            onChange={(event) => onChange({ room: event.target.value })}
            aria-label={`Room for ${row.name}`}
          />
        </label>
        <label className="block text-xs font-medium">
          Category
          <Input
            className="mt-1"
            value={row.category}
            onChange={(event) => onChange({ category: event.target.value })}
            aria-label={`Category for ${row.name}`}
          />
        </label>
        <label className="block text-xs font-medium">
          Quantity
          <Input
            className="mt-1"
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            aria-label={`Quantity for ${row.name}`}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <label className="block text-xs font-medium">
          Disposition
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={row.disposition}
            onChange={(event) =>
              onChange({
                disposition: event.target
                  .value as BulkInventoryRow["disposition"],
              })
            }
            aria-label={`Disposition for ${row.name}`}
          >
            {itemDispositionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium">
          Notes
          <Input
            className="mt-1"
            value={row.description}
            onChange={(event) => onChange({ description: event.target.value })}
            aria-label={`Notes for ${row.name}`}
          />
        </label>
      </div>

      <p className="mt-3 line-clamp-2 break-words rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
        Source: {row.sourceLine}
      </p>
    </div>
  );
}

export function BulkInventoryIntake({
  householdId,
  moveId,
  onCreated,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  onCreated: (message: string) => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<BulkInventoryRow[]>([]);
  const [creating, setCreating] = useState(false);
  const createItem = useMutation(api.items.create);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.selected && row.name.trim()),
    [rows]
  );

  function handleParse() {
    setRows(parseBulkInventoryText(pasteText));
  }

  async function handleCreateSelected() {
    if (!householdId || !moveId || !selectedRows.length) {
      return;
    }

    setCreating(true);
    try {
      await Promise.all(
        selectedRows.map((row) => {
          const quantity = parseOptionalNumber(row.quantity);
          return createItem({
            householdId,
            moveId,
            name: row.name,
            room: row.room || undefined,
            category: row.category || undefined,
            disposition: row.disposition,
            quantity: quantity && quantity > 0 ? quantity : 1,
            description: row.description || undefined,
            status: "draft",
            createdVia: "bulkImport",
            needsReview: true,
            reviewFlags: ["bulkPasteReview"],
          });
        })
      );
      onCreated(`${selectedRows.length} draft items created from paste.`);
      setPasteText("");
      setRows([]);
    } catch {
      onCreated("Could not create the pasted draft items yet.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClipboardPaste className="size-4 text-primary" aria-hidden="true" />
          Bulk paste
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pasteText.trim()}
            onClick={handleParse}
          >
            Parse
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!moveId || !selectedRows.length || creating}
            onClick={() => void handleCreateSelected()}
          >
            <PackageCheck aria-hidden="true" />
            {creating ? "Creating" : "Create drafts"}
          </Button>
        </div>
      </div>

      <Textarea
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
        placeholder="Garage: two bikes, red toolbox, camping tent"
      />

      {rows.length ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-sm font-medium">Review parsed drafts</div>
            <Badge variant="secondary">{selectedRows.length} selected</Badge>
          </div>

          <div
            role="list"
            aria-label="Parsed inventory draft cards"
            className="grid gap-3 lg:hidden"
          >
            {rows.map((row) => (
              <BulkDraftCard
                key={row.id}
                row={row}
                onChange={(patch) => setRows(updateRow(rows, row.id, patch))}
              />
            ))}
          </div>

          <div className="hidden rounded-md border border-border lg:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Use</TableHead>
                  <TableHead className="w-[24%]">Item</TableHead>
                  <TableHead className="w-[13%]">Room</TableHead>
                  <TableHead className="w-[13%]">Category</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-36">Disposition</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={row.selected}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              selected: event.target.checked,
                            })
                          )
                        }
                        aria-label={`Use ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-0 whitespace-normal">
                      <Input
                        value={row.name}
                        aria-label={`Item name for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              name: event.target.value,
                            })
                          )
                        }
                      />
                      <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                        {row.sourceLine}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <Input
                        value={row.room}
                        aria-label={`Room for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              room: event.target.value,
                            })
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-0">
                      <Input
                        value={row.category}
                        aria-label={`Category for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              category: event.target.value,
                            })
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-16"
                        inputMode="decimal"
                        value={row.quantity}
                        aria-label={`Quantity for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              quantity: event.target.value,
                            })
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={row.disposition}
                        aria-label={`Disposition for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              disposition: event.target
                                .value as BulkInventoryRow["disposition"],
                            })
                          )
                        }
                      >
                        {itemDispositionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <Input
                        value={row.description}
                        aria-label={`Notes for ${row.name}`}
                        onChange={(event) =>
                          setRows(
                            updateRow(rows, row.id, {
                              description: event.target.value,
                            })
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
