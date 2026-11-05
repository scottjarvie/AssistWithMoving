import { describe, expect, it } from "vitest";
import { parseQueueView, queueQueryState, queueViewMatches, type QueueViewSnapshot } from "@/lib/queue-collection";

describe("Queue collection views preserve the existing state and date contract", () => {
  const now = new Date(2026, 10, 5, 12).getTime();
  it("uses recorded completion dates, not recent edits, for Done this week", () => {
    expect(queueViewMatches({ state: "done", completedAt: new Date(2026, 10, 2, 0).getTime() }, "doneWeek", now)).toBe(true);
    expect(queueViewMatches({ state: "done", completedAt: new Date(2026, 10, 1, 23, 59).getTime() }, "doneWeek", now)).toBe(false);
    expect(queueViewMatches({ state: "done", completedAt: null }, "doneWeek", now)).toBe(false);
    expect(queueViewMatches({ state: "done", completedAt: now+1 }, "doneWeek", now)).toBe(false);
    expect(queueViewMatches({ state: "working", completedAt: now-1 }, "doneWeek", now)).toBe(false);
  });
  it("retains undated and older terminal outcomes in All Done and Everything", () => {
    for (const view of ["done", "all"] as const) expect(queueViewMatches({ state: "done", completedAt: null }, view, now)).toBe(true);
    expect(queueQueryState("all")).toBeUndefined();
    expect(queueQueryState("doneWeek")).toBe("done");
    expect(queueQueryState("needsYou")).toBe("needsYou");
  });
  const snapshot: QueueViewSnapshot = { view: "all", search: "[synthetic] handoff", facets: { source: [JSON.stringify("handoff")] }, sorting: [{ id: "updatedAt", desc: true }], columns: { owner: true }, presentation: { view: "list", density: "compact", groupBy: "state", groupDesc: false } };
  it("restores only valid browser-local view fields", () => {
    expect(parseQueueView(snapshot)).toEqual(snapshot);
    expect(parseQueueView({ ...snapshot, view: "invented-state" })).toBeNull();
    expect(parseQueueView({ ...snapshot, facets: { source: [JSON.stringify({ invented: true })] } })).toBeNull();
    expect(parseQueueView({ ...snapshot, sorting: [{ id: "hidden-backend-field", desc: true }] })).toBeNull();
    expect(parseQueueView({ ...snapshot, columns: { unknown: false } })).toBeNull();
    expect(parseQueueView({ ...snapshot, presentation: { ...snapshot.presentation, groupBy: "unknown" } })).toBeNull();
  });
});
