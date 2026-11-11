"use client";
import { Component, useState, type ReactNode, type FormEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatBytes, type Enforcement } from "../../convex/lib/usageLimits/core";

export class StorageFailSoft extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Storage is temporarily unavailable.</p> : this.props.children; }
}
export function StorageMeter({ householdId }: { householdId: Id<"households"> }) {
  const storage = useQuery(api.usageLimits.forHousehold, { householdId });
  return <section className="rounded border p-4 my-4"><h3>Storage</h3><p>{storage?.line ?? "Storage is still being counted."}</p>{storage?.ready && typeof storage.usedBytes === "number" && typeof storage.capBytes === "number" && <progress className="h-1 w-full" aria-label="Storage used" value={Math.min(storage.usedBytes, storage.capBytes)} max={storage.capBytes || 1} />}</section>;
}

/** Empty = unchanged; a reset is always an explicit separate choice. */
export function StorageLimitsForm({ personal, onSave }: { personal: boolean; onSave: (data: { ownerId?: Id<"users">; limits: { storedBytesPerUser?: number | null; planStoredBytes?: Record<string, number> | null; maxFileBytes?: Record<string, number> | null }; enforcement?: Enforcement | null; reason: string }) => Promise<unknown> }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const limits: { storedBytesPerUser?: number | null; planStoredBytes?: Record<string, number> | null; maxFileBytes?: Record<string, number> | null } = {};
    try {
      for (const field of ["planStoredBytes", "maxFileBytes"] as const) {
        if (form.get(`clear-${field}`)) limits[field] = null;
        else if (String(form.get(field)).trim()) limits[field] = JSON.parse(String(form.get(field)));
      }
      if (form.get("clear-storedBytesPerUser")) limits.storedBytesPerUser = null;
      else if (String(form.get("storedBytesPerUser") ?? "").trim()) limits.storedBytesPerUser = Number(form.get("storedBytesPerUser"));
      const mode = String(form.get("mode"));
      await onSave({ ...(personal ? { ownerId: String(form.get("owner")) as Id<"users"> } : {}), limits, ...(mode ? { enforcement: mode === "inherit" ? null : mode as Enforcement } : {}), reason: String(form.get("reason")) });
      setMessage("Saved.");
    } catch { setMessage("Could not save storage settings."); }
  }
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} aria-label={personal ? "Personal storage limits" : "Site storage limits"}>
    {personal && <label>Person ID<input name="owner" required className="block border min-h-11 text-base" /></label>}
    <label>Mode<select name="mode" className="block min-h-11" defaultValue=""><option value="">Leave unchanged</option>{personal && <option value="inherit">Use site mode</option>}<option>off</option><option>warn</option><option>on</option></select></label>
    <label>Plan table changes (JSON, bytes)<input name="planStoredBytes" className="block border min-h-11 text-base" />{personal && <span><input aria-label="Use site plan table" name="clear-planStoredBytes" type="checkbox" />Use site plan table</span>}</label>
    <label>File cap changes (JSON, bytes)<input name="maxFileBytes" className="block border min-h-11 text-base" />{personal && <span><input aria-label="Use site file caps" name="clear-maxFileBytes" type="checkbox" />Use site file caps</span>}</label>
    {personal && <label>Personal storage cap (bytes)<input aria-label="Personal storage cap (bytes)" name="storedBytesPerUser" type="number" min="0" className="block border min-h-11 text-base" /><span><input aria-label="Use site allowance" name="clear-storedBytesPerUser" type="checkbox" />Use site allowance</span></label>}
    <label>Reason<input name="reason" required className="block border min-h-11 text-base" /></label><button className="border min-h-11">Save limits</button><p role="status">{message}</p>
  </form>;
}
export function StorageAdmin() {
  const data = useQuery(api.usageLimits.adminOverview);
  const save = useMutation(api.usageLimits.adminSetLimits);
  const deletionMode = useMutation(api.usageLimits.adminSetDeletionMode);
  const [deletionMessage, setDeletionMessage] = useState("");
  if (!data) return <p>Loading storage settings…</p>;
  return <section className="rounded border p-4 space-y-4"><h3>Uploads and storage</h3><p>Site mode: {data.settings?.enforcement ?? "off"}. Blank fields leave existing settings unchanged.</p>
    <form className="grid gap-3" aria-label="Storage deletion mode" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await deletionMode({ enabled: form.get("enabled") === "yes", reason: String(form.get("reason")) }); setDeletionMessage("Deletion mode saved."); } catch { setDeletionMessage("Could not save deletion mode."); } }}>
      <p>Deletion workers: {data.settings?.storageDeletionEnabled ? "enabled" : "dry run"}. Enabling allowance checks never enables object deletion.</p>
      <label>Deletion mode<select name="enabled" className="block min-h-11" defaultValue={data.settings?.storageDeletionEnabled ? "yes" : "no"}><option value="no">Dry run</option><option value="yes">Delete confirmed, unreferenced objects</option></select></label>
      <label>Reason for deletion mode<input name="reason" required className="block border min-h-11 text-base" /></label><button className="border min-h-11">Save deletion mode</button><p role="status">{deletionMessage}</p>
    </form>
    <p>Site allowances: {Object.entries(data.effectiveSite.planStoredBytes).map(([plan, cap]) => `${plan} ${formatBytes(cap)}`).join("; ")}. File limits: {Object.entries(data.effectiveSite.maxFileBytes).map(([kind, cap]) => `${kind} ${formatBytes(cap)}`).join("; ")}. Batch: {data.effectiveSite.mcpBatchMaxItems} files, {formatBytes(data.effectiveSite.mcpBatchMaxBytes)}.</p>
    <StorageLimitsForm personal={false} onSave={save} /><StorageLimitsForm personal onSave={save} />
    {data.people.map(person => <p key={person._id}>Account …{person.ownerId.slice(-8)}: {person.ready ? `${formatBytes(person.storedBytes)} stored; ${formatBytes(person.reservedBytes)} reserved` : "Counting…"}</p>)}
    <details><summary>Recent admission events</summary>{data.events.map(event => { const amount = (value: number) => event.limit.includes("Bytes") ? formatBytes(value) : String(value); return <p key={event._id}>{new Date(event.at).toISOString()} · Account …{event.ownerId.slice(-8)} · {event.mode} · {event.source}: {amount(event.used)} used; {amount(event.requested)} requested; {amount(event.remaining ?? Math.max(0, event.cap - event.used))} remaining.</p>; })}</details>
    <details><summary>History</summary>{data.audit.map(entry => <p key={entry._id}>{new Date(entry.at).toISOString()} · {entry.field} · {entry.before} → {entry.after} · {entry.reason}</p>)}</details>
  </section>;
}
