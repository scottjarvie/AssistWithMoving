import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  launchReadinessBlockers,
  launchReadinessOptionalChecks,
  launchReadinessSummary,
  type LaunchReadinessBlocker,
  type LaunchReadinessOptionalCheck,
} from "@/lib/launch-readiness";

export function LaunchReadinessPanel() {
  const summary = launchReadinessSummary();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
          Launch readiness
        </CardTitle>
        <CardDescription>
          Read-only blockers that must clear before public launch hardening.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile
            label="Open blockers"
            value={String(summary.blockerCount)}
            detail="External setup and final hardening"
          />
          <SummaryTile
            label="Next blocker"
            value={summary.nextIssue ?? "None"}
            detail="Resolve in this order"
          />
          <SummaryTile
            label="Final hardening"
            value={summary.finalIssue ?? "None"}
            detail="After identity, storage, and routing settle"
          />
          <SummaryTile
            label="Optional checks"
            value={String(summary.optionalCheckCount)}
            detail="Visible posture, not launch blockers"
          />
        </div>
        <ol className="space-y-3">
          {launchReadinessBlockers.map((blocker, index) => (
            <LaunchBlockerRow
              key={blocker.issue}
              blocker={blocker}
              index={index}
            />
          ))}
        </ol>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Optional readiness</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Non-blocking product posture that should stay visible while
              external services are phased in.
            </p>
          </div>
          {launchReadinessOptionalChecks.map((check) => (
            <OptionalReadinessRow key={check.issue} check={check} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function LaunchBlockerRow({
  blocker,
  index,
}: {
  blocker: LaunchReadinessBlocker;
  index: number;
}) {
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{index + 1}</Badge>
            <Badge variant="secondary">{blocker.issue}</Badge>
            <Badge variant="ghost">{ownerLabel(blocker.owner)}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug">{blocker.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {blocker.why}
          </p>
        </div>
        <ExternalLink
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <ClipboardCheck className="size-3.5" aria-hidden="true" />
            Owner action
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {blocker.ownerAction}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Verify
          </p>
          <ul className="mt-1 space-y-1">
            {blocker.verify.map((command) => (
              <li key={command} className="text-xs leading-5 text-muted-foreground">
                <code className="break-words rounded bg-background px-1 py-0.5">
                  {command}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

function OptionalReadinessRow({
  check,
}: {
  check: LaunchReadinessOptionalCheck;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{check.issue}</Badge>
        <Badge variant="ghost">{ownerLabel(check.owner)}</Badge>
        <Badge variant="outline">Optional</Badge>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug">{check.title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {check.currentPosture}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {check.why}
      </p>
      <div className="mt-3 rounded-md bg-muted/50 p-3">
        <p className="flex items-center gap-2 text-xs font-medium">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Verify
        </p>
        <ul className="mt-1 space-y-1">
          {check.verify.map((command) => (
            <li key={command} className="text-xs leading-5 text-muted-foreground">
              <code className="break-words rounded bg-background px-1 py-0.5">
                {command}
              </code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ownerLabel(owner: LaunchReadinessBlocker["owner"]) {
  switch (owner) {
    case "auth":
      return "Auth";
    case "operations":
      return "Operations";
    case "auth-sync":
      return "Auth sync";
    case "storage":
      return "Storage";
    case "deployment":
      return "Deployment";
    case "security":
      return "Security";
    case "routing":
      return "Routing";
  }
}
