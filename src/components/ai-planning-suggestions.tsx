"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BrainCircuit, Check, RefreshCw, X } from "lucide-react";

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

type EstimateEdit = {
  category: string;
  estimatedWeightLb: string;
  estimatedVolumeCuFt: string;
  estimatedPackedVolumeCuFt: string;
};

type AssignmentEdit = {
  overrideReason: string;
};

type SuggestionEdit = {
  estimateDraft?: EstimateEdit;
  assignmentDraft?: AssignmentEdit;
};
type PlanningSuggestion = NonNullable<
  ReturnType<typeof useQuery<typeof api.aiPlanningSuggestions.listForMove>>
>[number];

export function AiPlanningSuggestions({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const suggestions = useQuery(
    api.aiPlanningSuggestions.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 120 } : "skip"
  );
  const createForMove = useMutation(api.aiPlanningSuggestions.createForMove);
  const approveMany = useMutation(api.aiPlanningSuggestions.approveMany);
  const rejectMany = useMutation(api.aiPlanningSuggestions.rejectMany);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, SuggestionEdit>>({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingSuggestions = useMemo(
    () => suggestions?.filter((suggestion) => suggestion.status === "pending") ?? [],
    [suggestions]
  );

  async function generateSuggestions() {
    if (!householdId || !moveId) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await createForMove({ householdId, moveId });
      setSelectedIds(new Set(result.suggestionIds.map((id) => String(id))));
      setMessage(`${result.suggestionIds.length} planning suggestions created.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not generate planning suggestions."
      );
    } finally {
      setWorking(false);
    }
  }

  async function approveSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const approvals = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => {
        const edit = edits[suggestion._id];
        return {
          suggestionId: suggestion._id,
          estimateDraft:
            suggestion.estimateDraft && edit?.estimateDraft
              ? {
                  ...suggestion.estimateDraft,
                  category: edit.estimateDraft.category || undefined,
                  estimatedWeightLb: parsePositiveNumber(
                    edit.estimateDraft.estimatedWeightLb
                  ),
                  estimatedWeightLowLb:
                    suggestion.estimateDraft.estimatedWeightLowLb,
                  estimatedWeightHighLb:
                    suggestion.estimateDraft.estimatedWeightHighLb,
                  estimatedVolumeCuFt: parsePositiveNumber(
                    edit.estimateDraft.estimatedVolumeCuFt
                  ),
                  estimatedPackedVolumeCuFt: parsePositiveNumber(
                    edit.estimateDraft.estimatedPackedVolumeCuFt
                  ),
                }
              : undefined,
          assignmentDraft:
            suggestion.assignmentDraft && edit?.assignmentDraft
              ? {
                  ...suggestion.assignmentDraft,
                  overrideReason:
                    edit.assignmentDraft.overrideReason || undefined,
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
        `${result.updatedItemIds.length} item estimates and ${result.updatedBoxIds.length} assignments updated.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve planning suggestions."
      );
    } finally {
      setWorking(false);
    }
  }

  async function rejectSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const suggestionIds = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => suggestion._id);
    setWorking(true);
    setMessage(null);
    try {
      await rejectMany({ householdId, moveId, suggestionIds });
      setSelectedIds(new Set());
      setMessage(`${suggestionIds.length} planning suggestions rejected.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reject planning suggestions."
      );
    } finally {
      setWorking(false);
    }
  }

  function updateEdit(id: string, patch: SuggestionEdit) {
    setEdits((current) => ({
      ...current,
      [id]: {
        estimateDraft: patch.estimateDraft ?? current[id]?.estimateDraft,
        assignmentDraft: patch.assignmentDraft ?? current[id]?.assignmentDraft,
      },
    }));
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function renderSuggestionEdit(suggestion: PlanningSuggestion) {
    return suggestion.estimateDraft ? (
      <EstimateEditFields
        edit={
          edits[suggestion._id]?.estimateDraft ??
          estimateEditFromSuggestion(suggestion.estimateDraft)
        }
        onChange={(estimateDraft) =>
          updateEdit(suggestion._id, { estimateDraft })
        }
      />
    ) : suggestion.assignmentDraft ? (
      <AssignmentEditFields
        edit={
          edits[suggestion._id]?.assignmentDraft ??
          assignmentEditFromSuggestion(suggestion.assignmentDraft.overrideReason)
        }
        warnings={suggestion.assignmentDraft.assignmentWarnings.length}
        onChange={(assignmentDraft) =>
          updateEdit(suggestion._id, { assignmentDraft })
        }
      />
    ) : null;
  }

  return (
    <Card id="ai-planning-suggestions">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
              AI estimate and assignment suggestions
            </CardTitle>
            <CardDescription>
              Review suggested estimates and load assignments before they update
              trusted item or box records.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {pendingSuggestions.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!moveId || working}
            onClick={() => void generateSuggestions()}
          >
            <RefreshCw aria-hidden="true" />
            Generate suggestions
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedIds.size || working}
            onClick={() => void approveSelected()}
          >
            <Check aria-hidden="true" />
            Approve selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedIds.size || working}
            onClick={() => void rejectSelected()}
          >
            <X aria-hidden="true" />
            Reject selected
          </Button>
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {suggestions === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : pendingSuggestions.length ? (
          <>
            <div
              role="list"
              aria-label="AI planning suggestion cards"
              className="grid gap-3 md:hidden"
            >
              {pendingSuggestions.map((suggestion) => (
                <PlanningSuggestionCard
                  key={suggestion._id}
                  suggestion={suggestion}
                  selected={selectedIds.has(suggestion._id)}
                  onSelectedChange={(checked) =>
                    toggleSelected(suggestion._id, checked)
                  }
                >
                  {renderSuggestionEdit(suggestion)}
                </PlanningSuggestionCard>
              ))}
            </div>

            <div className="hidden rounded-md border border-border md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Use</TableHead>
                    <TableHead className="w-[22%]">Suggestion</TableHead>
                    <TableHead className="w-[38%]">Edit</TableHead>
                    <TableHead>Reasoning</TableHead>
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
                          onChange={(event) =>
                            toggleSelected(suggestion._id, event.target.checked)
                          }
                          aria-label={`Use ${suggestion.type} suggestion`}
                        />
                      </TableCell>
                      <TableCell>
                        <PlanningSuggestionSummary suggestion={suggestion} />
                      </TableCell>
                      <TableCell>{renderSuggestionEdit(suggestion)}</TableCell>
                      <TableCell>
                        <PlanningSuggestionReasoning suggestion={suggestion} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending planning suggestions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlanningSuggestionCard({
  suggestion,
  selected,
  onSelectedChange,
  children,
}: {
  suggestion: PlanningSuggestion;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="size-3.5 accent-primary"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          aria-label={`Use ${suggestion.type} suggestion`}
        />
        Use suggestion
      </label>
      <div className="mt-3">
        <PlanningSuggestionSummary suggestion={suggestion} />
      </div>
      <div className="mt-3">{children}</div>
      <div className="mt-3">
        <PlanningSuggestionReasoning suggestion={suggestion} />
      </div>
    </div>
  );
}

function PlanningSuggestionSummary({
  suggestion,
}: {
  suggestion: PlanningSuggestion;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">{suggestion.type}</Badge>
        <Badge variant="secondary">{suggestion.confidence}</Badge>
      </div>
      <div className="mt-2 break-words text-xs text-muted-foreground">
        {suggestion.estimateDraft ? (
          <>
            {formatNumber(suggestion.estimateDraft.estimatedWeightLb)} lb /{" "}
            {formatNumber(suggestion.estimateDraft.estimatedVolumeCuFt)} cu ft
          </>
        ) : suggestion.assignmentDraft ? (
          <>
            Target resource{" "}
            {String(suggestion.assignmentDraft.assignedResourceId).slice(-6)}
          </>
        ) : null}
      </div>
    </div>
  );
}

function PlanningSuggestionReasoning({
  suggestion,
}: {
  suggestion: PlanningSuggestion;
}) {
  return (
    <div className="text-xs leading-5 text-muted-foreground">
      <p className="line-clamp-4 break-words">{suggestion.reasoning}</p>
      {suggestion.assumptions.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {suggestion.assumptions.map((assumption) => (
            <li key={assumption} className="break-words">
              {assumption}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EstimateEditFields({
  edit,
  onChange,
}: {
  edit: EstimateEdit;
  onChange: (edit: EstimateEdit) => void;
}) {
  return (
    <div className="grid gap-2">
      <Input
        value={edit.category}
        placeholder="Category"
        onChange={(event) => onChange({ ...edit, category: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={edit.estimatedWeightLb}
          inputMode="decimal"
          placeholder="Weight lb"
          onChange={(event) =>
            onChange({ ...edit, estimatedWeightLb: event.target.value })
          }
        />
        <Input
          value={edit.estimatedVolumeCuFt}
          inputMode="decimal"
          placeholder="Volume"
          onChange={(event) =>
            onChange({ ...edit, estimatedVolumeCuFt: event.target.value })
          }
        />
        <Input
          value={edit.estimatedPackedVolumeCuFt}
          inputMode="decimal"
          placeholder="Packed"
          onChange={(event) =>
            onChange({
              ...edit,
              estimatedPackedVolumeCuFt: event.target.value,
            })
          }
        />
      </div>
    </div>
  );
}

function AssignmentEditFields({
  edit,
  warnings,
  onChange,
}: {
  edit: AssignmentEdit;
  warnings: number;
  onChange: (edit: AssignmentEdit) => void;
}) {
  return (
    <div className="grid gap-2">
      <Textarea
        value={edit.overrideReason}
        placeholder={
          warnings ? "Override reason for warnings" : "Optional assignment note"
        }
        onChange={(event) =>
          onChange({ ...edit, overrideReason: event.target.value })
        }
      />
      {warnings ? (
        <p className="text-xs text-muted-foreground">
          This suggestion has validation warnings; keep or edit the review note.
        </p>
      ) : null}
    </div>
  );
}

function estimateEditFromSuggestion(
  draft: {
    category?: string;
    estimatedWeightLb?: number;
    estimatedVolumeCuFt?: number;
    estimatedPackedVolumeCuFt?: number;
  }
) {
  return {
    category: draft.category ?? "",
    estimatedWeightLb: formatNumber(draft.estimatedWeightLb),
    estimatedVolumeCuFt: formatNumber(draft.estimatedVolumeCuFt),
    estimatedPackedVolumeCuFt: formatNumber(draft.estimatedPackedVolumeCuFt),
  };
}

function assignmentEditFromSuggestion(overrideReason: string | undefined) {
  return { overrideReason: overrideReason ?? "" };
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}
