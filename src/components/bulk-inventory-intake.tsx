"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste, PackageCheck } from "lucide-react";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
        <div className="mt-3 rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Use</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Disposition</TableHead>
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
                  <TableCell>
                    <Input
                      value={row.name}
                      onChange={(event) =>
                        setRows(
                          updateRow(rows, row.id, { name: event.target.value })
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.room}
                      onChange={(event) =>
                        setRows(
                          updateRow(rows, row.id, { room: event.target.value })
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.category}
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
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={row.disposition}
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
                  <TableCell>
                    <Input
                      value={row.description}
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
      ) : null}
    </div>
  );
}
