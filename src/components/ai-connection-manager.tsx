"use client";

/**
 * The canonical `/settings/ai` screen: the person-facing half of the product
 * grant boundary enforced in `convex/lib/aiGrants.ts`.
 *
 * Every word describing what a connection may do is rendered from the server's
 * boundary description, never hardcoded here. If the boundary changes, this
 * screen changes with it, and a person can never be shown a promise the
 * enforcement path does not keep.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useAuth } from "@clerk/nextjs";
import {
  Activity,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ApiKeyManager } from "@/components/api-key-manager";
import { CopyTextButton } from "@/components/copy-text-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { describeMutationError } from "@/lib/mutation-error";

export const MCP_ENDPOINT = "https://movingmanifest.com/mcp";

/** The scope literals the mutation accepts, taken from the shipped contract. */
type ApproveArgs = FunctionArgs<typeof api.aiGrants.approve>;
type GrantScope = ApproveArgs["scopes"][number];

/**
 * The connection requirement, stated as a capability rather than a product
 * name. Naming Claude, ChatGPT, or Codex as "supported" needs a completed
 * lifecycle (MOV-0035); until then a name here would be a claim we cannot keep.
 */
const CLIENT_REQUIREMENT =
  "Any AI that speaks remote Streamable HTTP MCP with compatible OAuth can use this endpoint. We have not yet finished a full connect-to-revoke run with a named AI product, so nothing here is listed as supported.";

const expiryChoices = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
] as const;

type BoundaryScope = {
  scope: string;
  label: string;
  grants: string;
  doesNotImply: string;
  writes: boolean;
};

type GrantRow = {
  grantId: Id<"aiGrants">;
  label: string;
  status: "active" | "expired" | "revoked";
  scopes: string[];
  moveScope: "allMoves" | "selectedMoves";
  moveIds: string[];
  observedClientName: string | null;
  registrationMethodLabel: string | null;
  consentSnapshot: {
    scope: string;
    label: string;
    grants: string;
    doesNotImply: string;
  }[];
  approvedAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  lastToolName: string | null;
  useCount: number;
  revokedAt: number | null;
  revokedReason: string | null;
  note: string | null;
  version: number;
};

type GrantsResult = {
  boundaryVersion: string;
  scopes: BoundaryScope[];
  neverExposed: string[];
  neverPermitted: string[];
  grants: GrantRow[];
  activeCount: number;
  maxActive: number;
};

type ActivityRow = {
  grantId: Id<"aiGrants">;
  type: string;
  scope: string | null;
  toolName: string | null;
  clientLabel: string | null;
  message: string;
  outcome: "allowed" | "refused" | "recorded";
  createdAt: number;
};

type HouseholdEntry = {
  household: { _id: Id<"households">; name: string };
  role: string;
};

type MoveSummary = { moveId: Id<"moves">; title: string; status: string };

function formatMoment(value: number | null | undefined) {
  if (typeof value !== "number") return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDay(value: number | null | undefined) {
  if (typeof value !== "number") return "No expiry recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function statusLabel(status: GrantRow["status"]) {
  if (status === "active") return "Active";
  if (status === "expired") return "Expired";
  return "Revoked";
}

/**
 * A real fallback, not an apology. Someone with no connection at all should be
 * able to paste this into any AI chat and get back something they can save.
 */
export function buildManualQueueBrief(moveTitle: string | null) {
  return [
    "Assist With Moving — manual Queue brief",
    "",
    `I keep my move in Assist With Moving (${MCP_ENDPOINT.replace("/mcp", "")}). You are not connected to it, so work only from what I paste below and hand the result back as text I can paste into the move myself.`,
    "",
    `Move: ${moveTitle ?? "(name the move)"}`,
    "What I need: (describe the one piece of work)",
    "What I already know: (paste the notes, measurements, photos-in-words, or numbers you should use)",
    "",
    "Please:",
    "1. Ask me the smallest question you need answered before you start. Do not guess at a fact I can confirm.",
    "2. Do the work in your own environment.",
    "3. Return one complete result under these headings:",
    "   Summary — two or three sentences.",
    "   Result — the actual decisions, estimates, plan, or list.",
    "   Assumptions — each one I should confirm or correct.",
    "   Sources — a link and the date for anything you looked up.",
    "   Next step — the single next thing I should do.",
    "",
    "Do not contact a mover, marketplace, employer, insurer, or government office. Do not book, buy, sign, pay, or message anyone on my behalf. I stay the authority: I review your result and save it into the move myself.",
  ].join("\n");
}

export function AiConnectionManager() {
  const { isLoaded, isSignedIn } = useAuth();
  const ready = isLoaded && isSignedIn;

  const grantsResult = useQuery(api.aiGrants.listMine, ready ? {} : "skip") as
    | GrantsResult
    | undefined;
  const activityResult = useQuery(
    api.aiGrants.listActivity,
    ready ? { limit: 20 } : "skip",
  ) as { activity: ActivityRow[] } | undefined;
  const households = useQuery(
    api.households.listMine,
    ready ? {} : "skip",
  ) as HouseholdEntry[] | undefined;

  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const householdId =
    selectedHouseholdId ?? households?.[0]?.household._id ?? null;

  const stats = useQuery(
    api.households.summaryStats,
    ready && householdId ? { householdId } : "skip",
  ) as { moves: MoveSummary[] } | undefined;

  const approveGrant = useMutation(api.aiGrants.approve);
  const revokeGrant = useMutation(api.aiGrants.revoke);

  const [label, setLabel] = useState("");
  const [moveScope, setMoveScope] = useState<"allMoves" | "selectedMoves">(
    "allMoves",
  );
  const [selectedMoveIds, setSelectedMoveIds] = useState<Id<"moves">[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number>(90);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(
    null,
  );

  const moves = useMemo(() => stats?.moves ?? [], [stats]);
  const moveTitleById = useMemo(
    () => new Map(moves.map((move) => [String(move.moveId), move.title])),
    [moves],
  );
  const boundaryScopes = grantsResult?.scopes ?? [];
  const chosenScopeInfos = boundaryScopes.filter((info) =>
    selectedScopes.includes(info.scope),
  );
  const grants = grantsResult?.grants ?? [];
  const activity = activityResult?.activity ?? [];
  const manualBrief = buildManualQueueBrief(moves[0]?.title ?? null);

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
    );
  }

  function toggleMove(moveId: Id<"moves">) {
    setSelectedMoveIds((current) =>
      current.includes(moveId)
        ? current.filter((entry) => entry !== moveId)
        : [...current, moveId],
    );
  }

  async function handleApprove() {
    if (!householdId) return;
    setBusy("approve");
    setMessage(null);
    try {
      await approveGrant({
        householdId,
        label: label.trim(),
        scopes: selectedScopes as GrantScope[],
        moveScope,
        moveIds: moveScope === "selectedMoves" ? selectedMoveIds : undefined,
        expiresInDays,
        note: note.trim() ? note.trim() : undefined,
      });
      setMessage(
        "Approved. Nothing is connected until an AI signs in with this grant — sign in from your AI using the endpoint above.",
      );
      setLabel("");
      setSelectedScopes([]);
      setSelectedMoveIds([]);
      setMoveScope("allMoves");
      setNote("");
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't approve that connection. Check the name and choices, then try again.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(grant: GrantRow) {
    setBusy(`revoke-${grant.grantId}`);
    setMessage(null);
    try {
      await revokeGrant({
        grantId: grant.grantId,
        expectedVersion: grant.version,
      });
      setConfirmingRevokeId(null);
      setMessage(
        `Revoked “${grant.label}”. The next call from that AI is refused; everything it already saved stays exactly where it is.`,
      );
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't revoke that connection. Reload the page and try again.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  const canApprove =
    Boolean(householdId) &&
    label.trim().length > 0 &&
    selectedScopes.length > 0 &&
    (moveScope === "allMoves" || selectedMoveIds.length > 0) &&
    busy !== "approve";

  if (!isLoaded) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        Checking your signed-in session.
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Sign in first. Your AI connections belong to your account, so this
          screen only opens for you.
        </p>
        <Button asChild size="touch" className="mt-3">
          <Link href="/sign-in?redirect_url=/settings/ai">
            Sign in to manage AI connections
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p
          role="status"
          className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm leading-6"
        >
          {message}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* 1. The endpoint, and an honest label for what it can do today.    */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="ai-endpoint-heading"
        className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground sm:flex">
            <PlugZap className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Partial</Badge>
              <h3 id="ai-endpoint-heading" className="text-lg font-semibold">
                Let the AI you already use work on your move
              </h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You point your AI at one address, sign in as yourself, and then
              approve a grant below that decides what it may actually do.
              Signing in only proves who you are. The grant decides the rest,
              and you can take it back at any time.
            </p>
            <div className="mt-4 flex flex-col gap-2 rounded-md border border-border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <code className="min-w-0 break-all text-xs sm:text-sm">
                {MCP_ENDPOINT}
              </code>
              <CopyTextButton
                text={MCP_ENDPOINT}
                label="Copy endpoint"
                ariaLabel="Copy the Assist With Moving AI endpoint"
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {CLIENT_REQUIREMENT}
            </p>
            {grantsResult ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Boundary version {grantsResult.boundaryVersion} ·{" "}
                {grantsResult.activeCount} of {grantsResult.maxActive} active
                connections used.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Approve a connection.                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="ai-approve-heading"
        className="rounded-lg border border-border bg-card p-4 sm:p-5"
      >
        <h3 id="ai-approve-heading" className="text-lg font-semibold">
          Approve a connection
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose the smallest authority that lets the work happen. You can
          approve a second, narrower connection later instead of widening this
          one.
        </p>

        {grantsResult === undefined ? (
          <Skeleton className="mt-4 h-64 w-full" />
        ) : (
          <div className="mt-4 space-y-5">
            {households && households.length > 1 ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="ai-grant-household"
                  className="text-sm font-medium"
                >
                  Household
                </label>
                <select
                  id="ai-grant-household"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={householdId ?? ""}
                  onChange={(event) =>
                    setSelectedHouseholdId(
                      event.target.value as Id<"households">,
                    )
                  }
                >
                  {households.map((entry) => (
                    <option
                      key={entry.household._id}
                      value={entry.household._id}
                    >
                      {entry.household.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="ai-grant-label" className="text-sm font-medium">
                Name this connection
              </label>
              <Input
                id="ai-grant-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="My AI on the laptop"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                A name you will recognise later, when you are deciding whether
                to keep it.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Which moves</legend>
              <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm leading-6">
                <input
                  type="radio"
                  name="ai-grant-move-scope"
                  className="mt-1.5 size-4 shrink-0 accent-primary"
                  checked={moveScope === "allMoves"}
                  onChange={() => setMoveScope("allMoves")}
                />
                <span>
                  <span className="font-medium">All my moves</span>
                  <span className="block text-muted-foreground">
                    Including moves you create later.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm leading-6">
                <input
                  type="radio"
                  name="ai-grant-move-scope"
                  className="mt-1.5 size-4 shrink-0 accent-primary"
                  checked={moveScope === "selectedMoves"}
                  onChange={() => setMoveScope("selectedMoves")}
                />
                <span>
                  <span className="font-medium">Only the moves I pick</span>
                  <span className="block text-muted-foreground">
                    Naming a different move later is refused, not allowed.
                  </span>
                </span>
              </label>
              {moveScope === "selectedMoves" ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  {moves.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active moves in this household yet.
                    </p>
                  ) : (
                    moves.map((move) => (
                      <label
                        key={String(move.moveId)}
                        className="flex items-center gap-3 text-sm leading-6"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          checked={selectedMoveIds.includes(move.moveId)}
                          onChange={() => toggleMove(move.moveId)}
                        />
                        <span className="min-w-0 break-words">
                          {move.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                What this AI may do
              </legend>
              {boundaryScopes.map((info) => (
                <label
                  key={info.scope}
                  className="flex items-start gap-3 rounded-md border border-border p-3 text-sm leading-6"
                >
                  <input
                    type="checkbox"
                    className="mt-1.5 size-4 shrink-0 accent-primary"
                    checked={selectedScopes.includes(info.scope)}
                    onChange={() => toggleScope(info.scope)}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{info.label}</span>
                      <Badge variant={info.writes ? "default" : "secondary"}>
                        {info.writes ? "Changes things" : "Read only"}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {info.grants}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Does not include:
                      </span>{" "}
                      {info.doesNotImply}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="ai-grant-expiry" className="text-sm font-medium">
                Expires after
              </label>
              <select
                id="ai-grant-expiry"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-[240px]"
                value={expiresInDays}
                onChange={(event) =>
                  setExpiresInDays(Number(event.target.value))
                }
              >
                {expiryChoices.map((choice) => (
                  <option key={choice.days} value={choice.days}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ai-grant-note" className="text-sm font-medium">
                Note to yourself (optional)
              </label>
              <Textarea
                id="ai-grant-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why you approved this, so future-you knows."
                rows={2}
              />
            </div>

            <div
              className="rounded-md border border-primary/30 bg-primary/5 p-3"
              aria-live="polite"
            >
              <h4 className="text-sm font-semibold">
                What you are about to approve
              </h4>
              {selectedScopes.length === 0 ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Nothing yet. Pick at least one thing above and this summary
                  will say exactly what it means.
                </p>
              ) : (
                <div className="mt-2 space-y-2 text-sm leading-6">
                  <p>
                    <span className="font-medium">
                      {label.trim() || "This connection"}
                    </span>{" "}
                    will be able to work on{" "}
                    {moveScope === "allMoves"
                      ? "all your moves"
                      : selectedMoveIds.length
                        ? selectedMoveIds
                            .map(
                              (id) =>
                                moveTitleById.get(String(id)) ?? "a move",
                            )
                            .join(", ")
                        : "no move yet — pick one"}
                    , for{" "}
                    {expiryChoices.find(
                      (choice) => choice.days === expiresInDays,
                    )?.label ?? `${expiresInDays} days`}
                    .
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {chosenScopeInfos.map((info) => (
                      <li key={info.scope}>
                        <span className="font-medium">{info.label}.</span>{" "}
                        <span className="text-muted-foreground">
                          {info.doesNotImply}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">
                    Nothing happens until an AI signs in as you using the
                    endpoint above. You can revoke this at any time and the next
                    call is refused.
                  </p>
                </div>
              )}
            </div>

            {households && households.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Create a household and a move first. There is nothing for an AI
                to work on yet.
              </p>
            ) : null}

            <Button
              type="button"
              size="touch"
              disabled={!canApprove}
              onClick={handleApprove}
            >
              {busy === "approve" ? "Approving…" : "Approve this connection"}
            </Button>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Existing connections.                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="ai-connections-heading"
        className="space-y-3"
      >
        <div>
          <h3 id="ai-connections-heading" className="text-lg font-semibold">
            Your AI connections
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            These are grants you approved for an AI signing in as you. They are
            not people in your household, not share links, and not API keys.
          </p>
        </div>
        {grantsResult === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : grants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            You have not approved an AI connection yet. Nothing outside this
            account can reach your moves.
          </p>
        ) : (
          <ul className="space-y-3">
            {grants.map((grant) => (
              <li
                key={String(grant.grantId)}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold break-words">
                    {grant.label}
                  </h4>
                  <Badge
                    variant={
                      grant.status === "active"
                        ? "default"
                        : grant.status === "expired"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {statusLabel(grant.status)}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Name the AI reported
                    </dt>
                    <dd className="break-words">
                      {grant.observedClientName ?? "Nothing has connected yet"}
                      <span className="block text-xs text-muted-foreground">
                        This is a label the client typed about itself. Assist
                        With Moving has not verified it.
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      How it registered
                    </dt>
                    <dd>{grant.registrationMethodLabel ?? "Not yet known"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Moves
                    </dt>
                    <dd className="break-words">
                      {grant.moveScope === "allMoves"
                        ? "All your moves"
                        : grant.moveIds
                            .map((id) => moveTitleById.get(String(id)) ?? "One selected move")
                            .join(", ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Approved
                    </dt>
                    <dd>{formatMoment(grant.approvedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Expires
                    </dt>
                    <dd>{formatDay(grant.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Last used
                    </dt>
                    <dd>
                      {formatMoment(grant.lastUsedAt)}
                      {grant.lastToolName ? ` · ${grant.lastToolName}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Times used
                    </dt>
                    <dd>{grant.useCount.toLocaleString()}</dd>
                  </div>
                  {grant.revokedAt ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Revoked
                      </dt>
                      <dd className="break-words">
                        {formatMoment(grant.revokedAt)}
                        {grant.revokedReason ? ` · ${grant.revokedReason}` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    What you approved
                  </p>
                  <ul className="mt-1 space-y-1 text-sm leading-6">
                    {(grant.consentSnapshot.length
                      ? grant.consentSnapshot
                      : boundaryScopes.filter((info) =>
                          grant.scopes.includes(info.scope),
                        )
                    ).map((entry) => (
                      <li key={entry.scope}>
                        <span className="font-medium">{entry.label}.</span>{" "}
                        <span className="text-muted-foreground">
                          {entry.doesNotImply}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {grant.note ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Your note: {grant.note}
                  </p>
                ) : null}

                {grant.status === "active" ? (
                  confirmingRevokeId === String(grant.grantId) ? (
                    <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-sm leading-6">
                        Revoke “{grant.label}”? The next call from this AI is
                        refused immediately. Everything it already saved, and
                        the record of what it did, stays readable.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="touch"
                          variant="destructive"
                          disabled={busy === `revoke-${grant.grantId}`}
                          onClick={() => void handleRevoke(grant)}
                        >
                          {busy === `revoke-${grant.grantId}`
                            ? "Revoking…"
                            : "Yes, revoke it"}
                        </Button>
                        <Button
                          type="button"
                          size="touch"
                          variant="outline"
                          onClick={() => setConfirmingRevokeId(null)}
                        >
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      className="mt-4"
                      onClick={() =>
                        setConfirmingRevokeId(String(grant.grantId))
                      }
                    >
                      Revoke this connection
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Recent activity, refusals included.                            */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="ai-activity-heading" className="space-y-3">
        <div>
          <h3
            id="ai-activity-heading"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Activity className="size-4 text-primary" aria-hidden="true" />
            Recent activity
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            What was used, and what was refused. A refusal is the boundary
            working — it means an AI asked for something you never approved.
          </p>
        </div>
        {activityResult === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : activity.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nothing to show yet. Approving, connecting, using, refusing, and
            revoking all appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {activity.map((row, index) => (
              <li
                key={`${String(row.grantId)}-${row.createdAt}-${index}`}
                className={
                  row.outcome === "refused"
                    ? "rounded-md border border-destructive/40 bg-destructive/5 p-3"
                    : "rounded-md border border-border p-3"
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      row.outcome === "refused" ? "destructive" : "secondary"
                    }
                  >
                    {row.outcome === "refused"
                      ? "Refused"
                      : row.outcome === "allowed"
                        ? "Allowed"
                        : "Recorded"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatMoment(row.createdAt)}
                  </span>
                  {row.clientLabel ? (
                    <span className="text-xs text-muted-foreground break-words">
                      {row.clientLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-6 break-words">
                  {row.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 5. The ceiling. No grant reaches past this.                       */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="ai-never-heading"
        className="rounded-lg border border-border bg-card p-4 sm:p-5"
      >
        <h3
          id="ai-never-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          What no connection can ever reach
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          These limits are not settings. There is no checkbox that turns them
          on, for any AI, on any connection.
        </p>
        {grantsResult === undefined ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold">Never shown</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                {grantsResult.neverExposed.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldX className="size-4" aria-hidden="true" />
                Never permitted
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                {grantsResult.neverPermitted.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 6. The manual fallback — a real brief, not a dead end.            */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-labelledby="ai-manual-heading"
        className="rounded-lg border border-border bg-card p-4 sm:p-5"
      >
        <h3 id="ai-manual-heading" className="text-lg font-semibold">
          No connection? Hand the work over by hand
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          If your AI cannot connect — or you would rather it did not — copy this
          brief into any AI chat. It gets the work done and hands you back one
          result you can save into the move yourself.
        </p>
        <div className="mt-4 space-y-3">
          <pre
            aria-label="Manual Queue brief"
            className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs leading-5"
          >
            {manualBrief}
          </pre>
          <CopyTextButton
            text={manualBrief}
            label="Copy the manual Queue brief"
            ariaLabel="Copy the manual Queue brief"
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 7. API keys — a different door, kept secondary and separate.      */}
      {/* ---------------------------------------------------------------- */}
      <details className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Separate: API keys for tools that cannot sign in
        </summary>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          An API key is a different door from the AI connections above. A key is
          a pasted secret with its own separate permissions; a connection above
          is an AI signing in as you under a grant you can revoke. Keys are also
          not household people and not share links. Create a key only for a
          local or non-OAuth tool you trust.
        </p>
        <div className="mt-4">
          <ApiKeyManager enabled={ready} mode="setup" />
        </div>
      </details>
    </div>
  );
}
