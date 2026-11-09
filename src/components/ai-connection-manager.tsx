"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import policy from "../../shared/ai-connection-policy.json";
import { ApiKeyManager } from "./api-key-manager";
import { CopyTextButton } from "./copy-text-button";

const labels: Record<string, string> = {
  "moving.context.read": "Read move context", "moving.evidence.read": "Read private photos and files",
  "moving.work.write": "Save move work", "moving.queue.work": "Work Queue handoffs", "moving.archive": "Archive and restore",
  "moves/read": "Read moves", "moves/write": "Organise moves", "inventory/read": "Read inventory",
  "inventory/write": "Save inventory and archive", "queue/read": "Read Queue", "queue/write": "Work Queue",
  "plans/read": "Read plans", "plans/write": "Save plans", "photos/write": "Upload photos",
  "exports/read": "Read packets", "exports/create": "Prepare packets", "members/manage": "Read household members",
};
type Row = FunctionReturnType<typeof api.connectionSettings.list>["connections"][number];
function moment(value: number | null) { return value === null ? "Never" : Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : "Saved date is outside the supported range"; }
function dateInput(value: number | null) { return value === null || !Number.isFinite(new Date(value).getTime()) ? "" : new Date(value - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function buildManualQueueBrief(moveTitle: string | null) {
  return `Assist With Moving — manual Queue brief\nMove: ${moveTitle ?? "(name the move)"}\nYou are not connected. Work only from what I paste below.\nWhat I need: (one piece of work)\nWhat I already know: (notes and evidence)\nAsk the smallest necessary question. Return Summary, Result, Assumptions, Sources with links and dates, and Next step. I will save the result myself.`;
}
function ConnectionHistory({ id }: { id: Id<"aiAccessConnections"> }) {
  const [cursor, setCursor] = useState<string>();
  const data = useQuery(api.connectionSettings.history, { connectionId: id, ...(cursor ? { cursor } : {}) });
  return <div className="space-y-2 py-3 text-sm">
    {!data ? <p>Loading history…</p> : !data.history.length ? <p>No changes recorded yet.</p> : <ul className="space-y-2">{data.history.map(entry => <li key={entry._id}>{moment(entry.createdAt)} · {entry.actor === "person" ? "by you" : entry.actor === "ai" ? "by your AI" : "by the system"}: {entry.message}</li>)}</ul>}
    {data?.nextCursor && <button className="min-h-11 rounded border px-3" onClick={() => setCursor(data.nextCursor!)}>Older changes</button>}
    {cursor && <button className="min-h-11 rounded border px-3" onClick={() => setCursor(undefined)}>Recent changes</button>}
  </div>;
}
function ConnectionCard({ row }: { row: Row }) {
  const change = useMutation(api.connectionSettings.change);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  async function apply(action: "pause" | "resume" | "revoke" | "restore" | "full" | "limits" | "forget", scopes?: string[], expiresAt?: number | null, moveIds?: null) {
    setBusy(true); setError("");
    try { await change({ connectionId: row.id, expectedVersion: row.version, opId: crypto.randomUUID(), action, scopes, expiresAt, moveIds }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not change this connection."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border p-4">
    <h3 className="text-lg font-semibold">{row.label}</h3>
    <p>{row.retired ? "Retired key" : row.status.charAt(0).toUpperCase() + row.status.slice(1)} · {row.kind === "oauth" ? "OAuth" : "API key"}</p>
    <p className="text-sm">Last used: {moment(row.lastUsedAt)}</p>
    {row.narrowedBy === "ai" && <p>Narrowed by your AI on {moment(row.narrowedAt)}</p>}
    {row.inherited && <p>Started with the limits of your most limited AI</p>}
    {row.inherited && !row.retired && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("restore")}>Restore</button>}
    {row.status === "revoked" && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("forget")}>Forget</button>}
    {error && <p role="alert">{error}</p>}
    {row.isCurrent && !row.retired && <>
      <fieldset disabled={busy}><legend className="font-medium">What it can do</legend>
        {row.catalog.map(scope => <label key={scope} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={(row.scopes as string[]).includes(scope)} onChange={event => void apply("limits", event.target.checked ? [...row.scopes, scope] : row.scopes.filter(value => value !== scope))} />{labels[scope] ?? scope}</label>)}
      </fieldset>
      <p>{row.expiresAt === null ? "No end date" : `Ends ${moment(row.expiresAt)}`}</p>
      <label className="block">End date <input type="datetime-local" disabled={busy} value={dateInput(row.expiresAt)} onChange={event => { if (event.target.value) void apply("limits", undefined, new Date(event.target.value).getTime()); }} /></label>
      <div className="flex flex-wrap gap-3">
        {row.expiresAt !== null && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("limits", undefined, null)}>Remove end date</button>}
        {row.moveCount !== null && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("limits", undefined, undefined, null)}>Restore access to all my moves</button>}
        {row.status !== "revoked" && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(row.pausedAt === null ? "pause" : "resume")}>{row.pausedAt === null ? "Pause" : "Resume"}</button>}
        {row.status !== "revoked" && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("revoke")}>Revoke</button>}
        {(row.scopes.length < row.catalog.length || row.inherited) && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("full")}>Restore full powers</button>}
      </div>
    </>}
    {(!row.isCurrent || row.status === "revoked") && !row.retired && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply("restore")}>Restore previous access</button>}
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Connection history</summary>{historyOpen && <ConnectionHistory id={row.id} />}</details>
  </section>;
}
export function AiConnectionManager() {
  const [cursor, setCursor] = useState<string>();
  const [cursorGeneration, setCursorGeneration] = useState<number>();
  const [oldCursor, setOldCursor] = useState<string>();
  const [oldGeneration, setOldGeneration] = useState<number>();
  const [showOld, setShowOld] = useState(false);
  const [error, setError] = useState("");
  const data = useQuery(api.connectionSettings.list, cursor ? { cursor, cursorGeneration } : {});
  const old = useQuery(api.connectionSettings.list, showOld ? { superseded: true, ...(oldCursor ? { cursor: oldCursor, cursorGeneration: oldGeneration } : {}) } : "skip");
  const initialize = useMutation(api.connectionSettings.initialize);
  const needsInitialization = data?.initialized === false;
  useEffect(() => { if (needsInitialization) void initialize({}).catch(err => setError(err instanceof Error ? err.message : "Could not check earlier connections.")); }, [needsInitialization, initialize]);
  return <div className="space-y-6">
    <p className="text-base leading-7">{policy.settings}</p>
    <p className="text-sm text-muted-foreground">Connect your AI to https://movingmanifest.com/mcp and sign in. New AI sign-ins start with your most limited AI’s limits. Invitations stay on the website; your AI can create share links after checking for sensitive information.</p>
    {error && <p role="alert">{error}</p>}
    {!data?.ready ? <p>Checking earlier connection limits… Access stays stopped until the check is complete.</p> : <>
      {!data.connections.length ? <p>No AI has connected yet. New connections get full access with no end date; any earlier limits are retained.</p> : data.connections.map(row => <ConnectionCard key={row.id} row={row} />)}
      <div className="flex gap-3">{data.nextCursor && <button className="min-h-11 rounded border px-3" onClick={() => { setCursorGeneration(data.generation); setCursor(data.nextCursor!); }}>More connections</button>}{cursor && <button className="min-h-11 rounded border px-3" onClick={() => setCursor(undefined)}>Recent connections</button>}</div>
      <details onToggle={event => setShowOld(event.currentTarget.open)}><summary>Earlier registrations</summary>{showOld && <div className="space-y-3 py-3">{old?.connections.map(row => <ConnectionCard key={row.id} row={row} />)}{old?.nextCursor && <button className="min-h-11 rounded border px-3" onClick={() => { setOldGeneration(old.generation); setOldCursor(old.nextCursor!); }}>More earlier registrations</button>}{oldCursor && <button className="min-h-11 rounded border px-3" onClick={() => setOldCursor(undefined)}>Recent earlier registrations</button>}</div>}</details>
    </>}
    <details className="rounded border p-4"><summary>No connection? Copy a manual Queue brief</summary><pre className="whitespace-pre-wrap py-3">{buildManualQueueBrief(null)}</pre><CopyTextButton text={buildManualQueueBrief(null)} label="Copy manual Queue brief" /></details>
    <details className="rounded border p-4"><summary>API keys for tools that cannot sign in</summary><ApiKeyManager enabled={data?.ready ?? false} mode="setup" /></details>
  </div>;
}
