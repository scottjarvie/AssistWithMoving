"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import policy from "../../shared/ai-connection-policy.json";
import { CopyTextButton } from "./copy-text-button";
import { ApiKeyManager } from "./api-key-manager";

const labels: Record<string, string> = {
  "moving.context.read": "Read move context", "moving.evidence.read": "Read private photos and files",
  "moving.work.write": "Save move work", "moving.queue.work": "Work Queue handoffs", "moving.archive": "Archive and restore",
  "moves/read": "Read moves", "moves/write": "Organise moves", "inventory/read": "Read inventory",
  "inventory/write": "Save inventory and archive", "queue/read": "Read Queue", "queue/write": "Work Queue",
  "plans/read": "Read plans", "plans/write": "Save plans", "photos/write": "Upload photos",
  "exports/read": "Read packets", "exports/create": "Prepare packets", "members/manage": "Read household members",
};
function endInput(value: number | null) { return value === null || !Number.isFinite(new Date(value).getTime()) ? "" : new Date(value - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function moment(value: number | null) { return value === null ? "Never" : new Date(value).toLocaleString(); }

export function buildManualQueueBrief(moveTitle: string | null) {
  return `Assist With Moving — manual Queue brief\nMove: ${moveTitle ?? "(name the move)"}\nYou are not connected. Work only from what I paste below.\nWhat I need: (one piece of work)\nWhat I already know: (notes and evidence)\nAsk the smallest necessary question. Return Summary, Result, Assumptions, Sources with links and dates, and Next step. I will save the result myself.`;
}

export function AiConnectionManager() {
  const result = useQuery(api.connectionSettings.list, {});
  const change = useMutation(api.connectionSettings.change);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply(id: string, kind: "oauth" | "key", version: number, action: "pause" | "resume" | "revoke" | "restore" | "full" | "limits", scopes?: string[], expiresAt?: number | null) {
    setBusy(true); setError("");
    try { await change({ ...(kind === "oauth" ? { grantId: id as Id<"aiGrants"> } : { apiKeyId: id as Id<"apiKeys"> }), expectedVersion: version, opId: crypto.randomUUID(), action, scopes, expiresAt }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not change this connection."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <p className="text-base leading-7">{policy.settings}</p>
    <p className="text-sm text-muted-foreground">Connect your AI to https://movingmanifest.com/mcp and sign in. Archive and restore are included. Invitations and new share links stay on the website.</p>
    {error && <p role="alert">{error}</p>}
    {!result ? <p>Loading your connections…</p> : result.connections.length === 0 ? <p>No AI has connected yet. New connections get full access with no end date.</p> : result.connections.map(connection => <section key={connection.id} className="space-y-3 rounded-lg border p-4">
      <h3 className="text-lg font-semibold">{connection.label}</h3>
      <p>{connection.status === "revoked" ? "Revoked" : connection.pausedAt !== null ? "Paused" : connection.expiresAt !== null && connection.expiresAt <= result.asOf ? "Expired" : "Active"} · {connection.kind === "oauth" ? "OAuth" : "API key"}</p>
      <p className="text-sm">Last used: {moment(connection.lastUsedAt)}</p>
      {connection.narrowedBy === "ai" && <p>Narrowed by your AI on {moment(connection.narrowedAt)}</p>}
      <fieldset disabled={busy}><legend className="font-medium">What it can do</legend>
        {connection.catalog.map(scope => <label key={scope} className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={(connection.scopes as string[]).includes(scope)} onChange={event => void apply(connection.id, connection.kind, connection.version, "limits", event.target.checked ? [...connection.scopes, scope] : connection.scopes.filter(value => value !== scope))} />{labels[scope] ?? scope}
        </label>)}
      </fieldset>
      <p>{connection.expiresAt === null ? "No end date" : `Ends ${moment(connection.expiresAt)}`}</p>
      <label className="block">End date <input type="datetime-local" disabled={busy} value={connection.expiresAt === null ? "" : endInput(connection.expiresAt)} onChange={event => { if (event.target.value) void apply(connection.id, connection.kind, connection.version, "limits", undefined, new Date(event.target.value).getTime()); }} /></label>
      <div className="flex flex-wrap gap-3">
        {connection.expiresAt !== null && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(connection.id, connection.kind, connection.version, "limits", undefined, null)}>Remove end date</button>}
        {connection.status === "revoked" ? <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(connection.id, connection.kind, connection.version, "restore")}>Restore previous access</button> : <>
          <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(connection.id, connection.kind, connection.version, connection.pausedAt === null ? "pause" : "resume")}>{connection.pausedAt === null ? "Pause" : "Resume"}</button>
          <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(connection.id, connection.kind, connection.version, "revoke")}>Revoke</button>
        </>}
        {connection.scopes.length < connection.catalog.length && <button className="min-h-11 rounded border px-3" disabled={busy} onClick={() => void apply(connection.id, connection.kind, connection.version, "full")}>Restore full powers</button>}
      </div>
      <ul className="space-y-2 text-sm">{result.history.filter(entry => entry.connectionId === connection.id).map(entry => <li key={entry._id}>{moment(entry.createdAt)} · {entry.actor === "person" ? "by you" : entry.actor === "ai" ? "by your AI" : "by the system"}: {entry.message}</li>)}</ul>
    </section>)}
    <details className="rounded border p-4"><summary>No connection? Copy a manual Queue brief</summary><pre className="whitespace-pre-wrap py-3">{buildManualQueueBrief(null)}</pre><CopyTextButton text={buildManualQueueBrief(null)} label="Copy manual Queue brief" /></details>
    <details className="rounded border p-4"><summary>API keys for tools that cannot sign in</summary><ApiKeyManager enabled mode="setup" /></details>
  </div>;
}
