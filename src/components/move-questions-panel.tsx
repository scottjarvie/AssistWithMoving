"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, CircleHelp, ListChecks, ShieldQuestion } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type MoveQuestionsPanelProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type MoveQuestionSeverity = "critical" | "warning" | "info";
type MoveQuestionCategory =
  | "setup"
  | "pcs"
  | "resources"
  | "inventory"
  | "evidence"
  | "load"
  | "packets";

type MoveQuestionPrompt = {
  key: string;
  category: MoveQuestionCategory;
  severity: MoveQuestionSeverity;
  title: string;
  question: string;
  detail: string;
  count: number;
  anchor: string;
  actionLabel: string;
};

type MoveQuestionsSummary = {
  prompts: MoveQuestionPrompt[];
  topPrompts: MoveQuestionPrompt[];
  counts: {
    totalPrompts: number;
    openPrompts: number;
    critical: number;
    warning: number;
    info: number;
    totalOpenItems: number;
  };
  categories: Partial<Record<MoveQuestionCategory, number>>;
};

const severityClasses: Record<MoveQuestionSeverity, string> = {
  critical:
    "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
  warning:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
};

const categoryLabels: Record<MoveQuestionCategory, string> = {
  setup: "Setup",
  pcs: "PCS",
  resources: "Resources",
  inventory: "Inventory",
  evidence: "Evidence",
  load: "Load",
  packets: "Packets",
};

const questionTasks = [
  { value: "priority", label: "Priority" },
  { value: "areas", label: "Areas" },
  { value: "shortcuts", label: "Shortcuts" },
] as const;

export function MoveQuestionsPanel({
  householdId,
  moveId,
}: MoveQuestionsPanelProps) {
  const summary = useQuery(
    api.moveQuestions.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  ) as MoveQuestionsSummary | undefined;

  return (
    <Card id="move-questions">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CircleHelp className="size-4 text-primary" aria-hidden="true" />
              Questions to resolve
            </CardTitle>
            <CardDescription>
              Missing details that affect move planning, documentation packets,
              evidence quality, and load readiness.
            </CardDescription>
          </div>
          {summary ? (
            <Badge variant={summary.counts.openPrompts ? "secondary" : "outline"}>
              {summary.counts.openPrompts
                ? `${summary.counts.totalOpenItems} open items`
                : "clear"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary === undefined ? (
          <LoadingState />
        ) : summary.counts.openPrompts === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <ListChecks
              className="mt-0.5 size-4 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <div className="font-medium text-foreground">
                No unresolved questions detected.
              </div>
              <p className="mt-1 text-muted-foreground">
                Core move, inventory, evidence, load, and packet fields have
                enough detail for the current records.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="priority" className="gap-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max" aria-label="Question review tasks">
                {questionTasks.map((task) => (
                  <TabsTrigger key={task.value} value={task.value}>
                    {task.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="priority" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <QuestionMetric
                  label="Critical"
                  value={summary.counts.critical}
                  severity="critical"
                />
                <QuestionMetric
                  label="Warning"
                  value={summary.counts.warning}
                  severity="warning"
                />
                <QuestionMetric
                  label="Info"
                  value={summary.counts.info}
                  severity="info"
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {summary.topPrompts.map((prompt) => (
                  <QuestionPromptCard key={prompt.key} prompt={prompt} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="areas" className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(categoryLabels).map(([category, label]) => (
                  <div
                    key={category}
                    className="rounded-md border border-border p-3"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-mono text-xl font-semibold">
                      {summary.categories[category as MoveQuestionCategory] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">Go fix the source</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Jump to the workspace area that owns the missing detail, then
                  return here to confirm the prompt count drops.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="#transport-resources">Resources</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#inventory">Inventory</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#photos">Photos</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#load-plan">Load planner</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="#documentation-packets">Packets</Link>
                  </Button>
                </div>
              </div>

              {summary.counts.critical ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <ShieldQuestion
                    className="mt-0.5 size-4 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="text-muted-foreground">
                    Template- and claim-related prompts use user-entered fields
                    and should be verified against current official guidance
                    before documents are relied on.
                  </p>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionPromptCard({ prompt }: { prompt: MoveQuestionPrompt }) {
  return (
    <Link
      href={prompt.anchor}
      className={cn(
        "rounded-md border p-3 transition-colors hover:bg-muted/70",
        severityClasses[prompt.severity]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{prompt.title}</span>
            <Badge variant="outline">{categoryLabels[prompt.category]}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-foreground">
            {prompt.question}
          </p>
          <p className="mt-1 text-xs leading-5 opacity-80">{prompt.detail}</p>
        </div>
        <span className="font-mono text-2xl font-semibold leading-none">
          {prompt.count}
        </span>
      </div>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-44 rounded-md" />
    </div>
  );
}

function QuestionMetric({
  label,
  value,
  severity,
}: {
  label: string;
  value: number;
  severity: MoveQuestionSeverity;
}) {
  return (
    <div className={cn("rounded-md border p-3", value && severityClasses[severity])}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {value ? (
          <AlertTriangle className="size-3.5" aria-hidden="true" />
        ) : null}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none">
        {value}
      </div>
    </div>
  );
}
