"use client";
import { Component, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { siteDefaults } from "../../convex/lib/mediaStorage";
import { DEFAULT_PLAN_STORED_BYTES } from "../../convex/lib/usageLimits/core";

export class StorageFailSoft extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Storage is temporarily unavailable.</p> : this.props.children; }
}
export function StorageMeter({ householdId }: { householdId: Id<"households"> }) {
  const storage = useQuery(api.usageLimits.forHousehold, { householdId });
  return <section className="rounded border p-4 my-4"><h3>Storage</h3><p>{storage?.line ?? "Storage is still being counted."}</p>{storage?.ready && <progress className="h-1 w-full" aria-label="Storage used" value={Math.min(storage.usedBytes, storage.capBytes)} max={storage.capBytes || 1} />}</section>;
}
export function StorageAdmin() {
  const data = useQuery(api.usageLimits.adminOverview);
  const save = useMutation(api.usageLimits.adminSetLimits);
  const [message, setMessage] = useState("");
  if (!data) return <p>Loading storage settings…</p>;
  return <section className="rounded border p-4 space-y-4"><h3>Uploads and storage</h3><form className="grid gap-3 sm:grid-cols-2" onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await save({ ownerId: String(form.get("owner")) ? String(form.get("owner")) as Id<"users"> : undefined, enforcement: form.get("mode") as "off" | "warn" | "on", reason: String(form.get("reason")), limits: {
      planStoredBytes: { free: Number(form.get("free")), pro: Number(form.get("pro")) },
      maxFileBytes: { image: Number(form.get("image")), audio: Number(form.get("audio")), video: Number(form.get("video")) },
      ...(String(form.get("personal")) ? { storedBytesPerUser: Number(form.get("personal")) } : {}),
    } }); setMessage("Saved."); } catch { setMessage("Could not save storage settings."); }
  }}>
    <label>Mode<select name="mode" className="block min-h-11" defaultValue={data.settings?.enforcement ?? "off"}><option>off</option><option>warn</option><option>on</option></select></label>
    <label>Person ID (blank for site)<input name="owner" className="block border min-h-11 text-base" /></label>
    {(["free", "pro"] as const).map(plan => <label key={plan}>{plan} storage (bytes)<input type="number" min="0" step="1" name={plan} className="block border min-h-11 text-base" defaultValue={data.settings?.planStoredBytes?.[plan] ?? DEFAULT_PLAN_STORED_BYTES[plan]} required /></label>)}
    {(["image", "audio", "video"] as const).map(kind => <label key={kind}>{kind} file cap (bytes)<input name={kind} type="number" min="0" step="1" className="block border min-h-11 text-base" defaultValue={data.settings?.maxFileBytes?.[kind] ?? siteDefaults[kind]} required /></label>)}
    <label>Personal storage override (bytes)<input name="personal" type="number" min="0" className="block border min-h-11 text-base" /></label>
    <label>Reason<input name="reason" required className="block border min-h-11 text-base" /></label><button className="border min-h-11">Save limits</button><p role="status">{message}</p>
  </form>
  {data.people.map(person => <p key={person._id}>Account …{person.ownerId.slice(-8)}: {person.ready ? `${person.storedBytes} stored bytes; ${person.reservedBytes} reserved bytes` : "Counting…"}</p>)}
  <details><summary>History</summary>{data.audit.map(entry => <p key={entry._id}>{new Date(entry.at).toISOString()} · {entry.field} · {entry.before} → {entry.after} · {entry.reason}</p>)}</details></section>;
}
