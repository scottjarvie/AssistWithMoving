"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ClipboardPenLine, Sparkles, X } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { itemDispositionOptions } from "@/lib/inventory-options";

type SuggestionStatus = "pending" | "approved" | "edited" | "rejected";

type ItemDraftEdit = {
  name: string;
  room: string;
  category: string;
  disposition: (typeof itemDispositionOptions)[number];
  quantity: string;
  description: string;
  suggestedBoxLabel: string;
};

type BoxDraftEdit = {
  code: string;
  label: string;
  room: string;
  description: string;
};

type DraftEdit = {
  itemDraft?: ItemDraftEdit;
  boxDraft?: BoxDraftEdit;
};

export function AiTextIntake({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const suggestions = useQuery(
    api.aiTextIntake.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 80 } : "skip"
  );
  const createFromText = useMutation(api.aiTextIntake.createFromText);
  const approveMany = useMutation(api.aiTextIntake.approveMany);
  const rejectMany = useMutation(api.aiTextIntake.rejectMany);
  const [sourceText, setSourceText] = useState(
    "Kitchen: two boxes of dishes, fragile glass vase, coffee maker\nBox K-1: plates, mugs, utensils (Kitchen)\nDonate: old lamp, small bookshelf\nPersonal: passport folder, laptop"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingSuggestions = useMemo(
    () => suggestions?.filter((suggestion) => suggestion.status === "pending") ?? [],
    [suggestions]
  );

  async function handleGenerate() {
    if (!householdId || !moveId || !sourceText.trim()) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await createFromText({
        householdId,
        moveId,
        sourceText,
      });
      setSelectedIds(new Set(result.suggestionIds.map((id) => String(id))));
      setMessage(`${result.suggestionIds.length} reviewable suggestions created.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not parse those notes yet."
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleApproveSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const approvals = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => {
        const edit = edits[suggestion._id];
        return {
          suggestionId: suggestion._id,
          itemDraft: edit?.itemDraft
            ? {
                name: edit.itemDraft.name,
                room: edit.itemDraft.room || undefined,
                category: edit.itemDraft.category || undefined,
                disposition: edit.itemDraft.disposition,
                quantity: parsePositiveNumber(edit.itemDraft.quantity),
                description: edit.itemDraft.description || undefined,
                suggestedBoxLabel: edit.itemDraft.suggestedBoxLabel || undefined,
                fragility: suggestion.itemDraft?.fragility,
                highValue: suggestion.itemDraft?.highValue,
                planningDefaultKeys: suggestion.itemDraft?.planningDefaultKeys,
              }
            : undefined,
          boxDraft: edit?.boxDraft
            ? {
                code: edit.boxDraft.code || undefined,
                label: edit.boxDraft.label,
                room: edit.boxDraft.room || undefined,
                description: edit.boxDraft.description || undefined,
              }
            : undefined,
        };
      });

    setWorking(true);
    setMessage(null);
    try {
      const result = await approveMany({ householdId, moveId, approvals });
      setSelectedIds(new Set());
      setMessage(
        `${result.createdItemIds.length} items and ${result.createdBoxIds.length} boxes approved.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve those suggestions yet."
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleRejectSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const suggestionIds = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => suggestion._id);
    setWorking(true);
    setMessage(null);
    try {
      await rejectMany({ householdId, moveId, suggestionIds });
      setSelectedIds(new Set());
      setMessage(`${suggestionIds.length} suggestions rejected.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reject those suggestions yet."
      );
    } finally {
      setWorking(false);
    }
  }

  function updateEdit(id: string, patch: DraftEdit) {
    setEdits((current) => ({
      ...current,
      [id]: {
        itemDraft: patch.itemDraft ?? current[id]?.itemDraft,
        boxDraft: patch.boxDraft ?? current[id]?.boxDraft,
      },
    }));
  }

  return (
    <Card id="ai-text-intake">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardPenLine className="size-4 text-primary" aria-hidden="true" />
              AI text intake
            </CardTitle>
            <CardDescription>
              Turn rough notes into pending item and box suggestions before
              approving trusted inventory.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {pendingSuggestions.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="Garage: two bikes, red toolbox, camping tent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!moveId || !sourceText.trim() || working}
              onClick={() => void handleGenerate()}
            >
              <Sparkles aria-hidden="true" />
              Generate suggestions
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedIds.size || working}
              onClick={() => void handleApproveSelected()}
            >
              <Check aria-hidden="true" />
              Approve selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedIds.size || working}
              onClick={() => void handleRejectSelected()}
            >
              <X aria-hidden="true" />
              Reject selected
            </Button>
          </div>
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {suggestions === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-5/6" />
          </div>
        ) : pendingSuggestions.length ? (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Use</TableHead>
                  <TableHead>Suggestion</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSuggestions.map((suggestion) => (
                  <TableRow key={suggestion._id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={selectedIds.has(suggestion._id)}
                        onChange={(event) => {
                          const next = new Set(selectedIds);
                          if (event.target.checked) next.add(suggestion._id);
                          else next.delete(suggestion._id);
                          setSelectedIds(next);
                        }}
                        aria-label={`Use ${suggestion.type} suggestion`}
                      />
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      {suggestion.itemDraft ? (
                        <ItemDraftFields
                          edit={
                            edits[suggestion._id]?.itemDraft ??
                            itemEditFromSuggestion(suggestion.itemDraft)
                          }
                          onChange={(itemDraft) =>
                            updateEdit(suggestion._id, { itemDraft })
                          }
                        />
                      ) : (
                        <BoxDraftFields
                          edit={
                            edits[suggestion._id]?.boxDraft ??
                            boxEditFromSuggestion(suggestion.boxDraft)
                          }
                          onChange={(boxDraft) =>
                            updateEdit(suggestion._id, { boxDraft })
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{suggestion.type}</Badge>
                        <Badge variant="secondary">{suggestion.confidence}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {suggestion.reasoning}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs leading-5 text-muted-foreground">
                      {suggestion.sourceLine}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending AI text suggestions.
          </div>
        )}

        <SuggestionStatusSummary suggestions={suggestions ?? []} />
      </CardContent>
    </Card>
  );
}

function ItemDraftFields({
  edit,
  onChange,
}: {
  edit: ItemDraftEdit | undefined;
  onChange: (edit: ItemDraftEdit) => void;
}) {
  if (!edit) return null;
  return (
    <div className="grid gap-2">
      <Input
        value={edit.name}
        onChange={(event) => onChange({ ...edit, name: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={edit.room}
          placeholder="Room"
          onChange={(event) => onChange({ ...edit, room: event.target.value })}
        />
        <Input
          value={edit.category}
          placeholder="Category"
          onChange={(event) =>
            onChange({ ...edit, category: event.target.value })
          }
        />
        <Input
          value={edit.quantity}
          inputMode="decimal"
          placeholder="Qty"
          onChange={(event) =>
            onChange({ ...edit, quantity: event.target.value })
          }
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={edit.disposition}
          onChange={(event) =>
            onChange({
              ...edit,
              disposition: event.target
                .value as (typeof itemDispositionOptions)[number],
            })
          }
        >
          {itemDispositionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Input
          value={edit.suggestedBoxLabel}
          placeholder="Box"
          onChange={(event) =>
            onChange({ ...edit, suggestedBoxLabel: event.target.value })
          }
        />
      </div>
      <Input
        value={edit.description}
        placeholder="Notes"
        onChange={(event) =>
          onChange({ ...edit, description: event.target.value })
        }
      />
    </div>
  );
}

function BoxDraftFields({
  edit,
  onChange,
}: {
  edit: BoxDraftEdit | undefined;
  onChange: (edit: BoxDraftEdit) => void;
}) {
  if (!edit) return null;
  return (
    <div className="grid gap-2">
      <Input
        value={edit.label}
        onChange={(event) => onChange({ ...edit, label: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={edit.code}
          placeholder="Code"
          onChange={(event) => onChange({ ...edit, code: event.target.value })}
        />
        <Input
          value={edit.room}
          placeholder="Room"
          onChange={(event) => onChange({ ...edit, room: event.target.value })}
        />
      </div>
      <Input
        value={edit.description}
        placeholder="Notes"
        onChange={(event) =>
          onChange({ ...edit, description: event.target.value })
        }
      />
    </div>
  );
}

function SuggestionStatusSummary({
  suggestions,
}: {
  suggestions: { status: SuggestionStatus }[];
}) {
  const counts = suggestions.reduce(
    (acc, suggestion) => ({
      ...acc,
      [suggestion.status]: acc[suggestion.status] + 1,
    }),
    { pending: 0, approved: 0, edited: 0, rejected: 0 }
  );
  return (
    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
      {Object.entries(counts).map(([status, count]) => (
        <div key={status} className="rounded-md border border-border px-3 py-2">
          <span className="font-medium text-foreground">{count}</span> {status}
        </div>
      ))}
    </div>
  );
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function itemEditFromSuggestion(
  itemDraft:
    | {
        name: string;
        room?: string;
        category?: string;
        disposition: (typeof itemDispositionOptions)[number];
        quantity: number;
        description?: string;
        suggestedBoxLabel?: string;
      }
    | undefined
) {
  if (!itemDraft) return undefined;
  return {
    name: itemDraft.name,
    room: itemDraft.room ?? "",
    category: itemDraft.category ?? "",
    disposition: itemDraft.disposition,
    quantity: String(itemDraft.quantity),
    description: itemDraft.description ?? "",
    suggestedBoxLabel: itemDraft.suggestedBoxLabel ?? "",
  };
}

function boxEditFromSuggestion(
  boxDraft:
    | {
        code?: string;
        label: string;
        room?: string;
        description?: string;
      }
    | undefined
) {
  if (!boxDraft) return undefined;
  return {
    code: boxDraft.code ?? "",
    label: boxDraft.label,
    room: boxDraft.room ?? "",
    description: boxDraft.description ?? "",
  };
}
