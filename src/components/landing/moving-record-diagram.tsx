import { MovingDrawing } from "./moving-drawings";

export function MovingRecordDiagram() {
  return <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
    <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
      {["Places & rooms", "Items", "Cartons", "Loads", "Evidence", "Packets"].map((label, i) => <div key={label} className="min-w-0">
        <div className="mx-auto max-w-28"><MovingDrawing kind={i} /></div>
        <span className="text-sm font-medium">{label}</span>
      </div>)}
    </div>
    <svg viewBox="0 0 600 48" className="mx-auto mt-3 h-10 w-full text-primary" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M60 2q0 18 80 18h160M540 2q0 18-80 18H300M300 2v38m-8-9 8 9 8-9" strokeLinecap="round" /></svg>
    <p className="text-center font-semibold">Your move record · Assist With Moving</p>
    <p className="text-center text-sm text-muted-foreground">Save context, decisions and finished results. Return when the plan changes.</p>
  </div>;
}
