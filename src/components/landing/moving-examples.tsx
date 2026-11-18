import { CopyTextButton } from "@/components/copy-text-button";

export const movingExamples = [
  {
    title: "Find the carton before opening five others",
    prompt: "Where are the kettle and mugs? Find their carton, destination room and saved packing status. What is still unboxed for the kitchen?",
    records: ["Carton K-07 · kitchen → kitchen · packed", "Kettle + four mugs · assigned to K-07", "Toaster · kitchen · not boxed"],
    close: "Easy with current records. A saved status tells you what was recorded, not whether someone has since moved the carton.",
  },
  {
    title: "Compare the load before making a plan",
    prompt: "Compare my two load options against the saved carton and furniture dimensions and weights. Flag missing measurements and uncertain estimates before suggesting assignments.",
    records: ["Carton K-07 · 18 × 14 × 12 in · estimated 16 lb", "Desk · 48 × 24 × 30 in · weight missing", "Pickup · saved bed 78 × 60 × 20 in · saved payload 900 lb", "Trailer · saved interior 96 × 60 × 48 in · saved payload 1,200 lb"],
    close: "Challenging: missing weights, door clearance and tie-down space need checking. Saved capacities and estimates do not prove fit, safe loading or an actual shipment weight.",
  },
] as const;

export function MovingExamples() {
  return <section id="moving-examples" aria-labelledby="moving-examples-title" className="py-10">
    <h2 id="moving-examples-title" className="text-2xl font-semibold">Try a question from your own move</h2>
    <p className="mt-3 text-sm text-muted-foreground">Illustrative records, not a live move. Use the website or ask your connected AI within its allowed access. Save useful results deliberately.</p>
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      {movingExamples.map((example, i) => <article key={example.title} className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
        <svg viewBox="0 0 200 100" className="mb-4 h-24 w-48 max-w-full text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {i === 0 ? <path d="m14 32 35-18 38 18-35 20ZM14 32l2 46 36 15 35-17V32M52 52v41M102 20h78v60h-78zM112 35h56m-56 12h36m-36 16 8 8 13-15" /> : <path d="M10 30h110v48H10ZM120 45h30l22 22v11h-52M29 78a10 10 0 1 0 1 0m109 0a10 10 0 1 0 1 0M24 15h78m-78-5v10m78-10v10M26 44h24v24H26Zm34 0h38v24H60Z" />}
        </svg>
        <h3 className="text-xl font-semibold">{example.title}</h3>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ask your AI</p>
        <blockquote className="mt-2 border-l-2 border-primary pl-3 text-base leading-7">{example.prompt}</blockquote>
        <CopyTextButton text={example.prompt} label="Copy example" ariaLabel={`Copy example: ${example.title}`} className="mt-3 min-h-11" />
        <p className="mt-5 text-sm font-semibold">Available context · sample records</p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">{example.records.map(record => <li key={record}>{record}</li>)}</ul>
        <p className="mt-5 border-t border-border pt-4 text-sm leading-7">{example.close}</p>
        {i === 1 && <p className="mt-3 text-sm leading-7"><strong>Next level:</strong> “Help me prepare a mover packet for the selected load. Include destination rooms and handling notes; exclude values, serials, private notes and sensitive photos. Let me review the recipient scope before sharing.”</p>}
      </article>)}
    </div>
  </section>;
}
