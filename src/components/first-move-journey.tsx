import Link from "next/link";
import { Check, ClipboardList, MapPinned, Sparkles } from "lucide-react";

import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

type JourneyStepProps = {
  number: number;
  title: string;
  body: string;
  complete?: boolean;
  action: { href: string; label: string };
  icon: typeof MapPinned;
};

function JourneyStep({
  number,
  title,
  body,
  complete = false,
  action,
  icon: Icon,
}: JourneyStepProps) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-background/75 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          {complete ? (
            <Check className="size-5" aria-label="Complete" />
          ) : (
            <Icon className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Step {number}
          </p>
          <h2 className="mt-1 font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button
        asChild
        variant={complete ? "ghost" : "outline"}
        size="touch"
        className="mt-4 w-full sm:w-auto"
      >
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </article>
  );
}

export function FirstMoveJourney({
  moveId,
  hasRoute,
}: {
  moveId: Id<"moves">;
  hasRoute: boolean;
}) {
  return (
    <section
      aria-labelledby="first-move-journey-title"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary),transparent_93%),color-mix(in_oklch,var(--accent),transparent_96%))] p-4 sm:p-5"
    >
      <div
        className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full border-[34px] border-primary/[0.035]"
        aria-hidden="true"
      />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          First useful loop
        </p>
        <h2
          id="first-move-journey-title"
          className="mt-1 text-xl font-semibold"
        >
          Start small. The move can grow later.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Keep just enough context to return without rebuilding the plan. A Queue
          handoff waits durably for your chosen AI, and any saved decisions,
          estimates, plans, or source checks remain visible in this move.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <JourneyStep
            number={1}
            title={hasRoute ? "Route noted" : "Name the route"}
            body={
              hasRoute
                ? "The move already has an origin or destination. Add dates or detail only when useful."
                : "Add an origin, destination, or area when you know it. Exact addresses are not required."
            }
            complete={hasRoute}
            action={{
              href: `/app/moves/${moveId}/configure#start`,
              label: hasRoute ? "Review route" : "Add route",
            }}
            icon={MapPinned}
          />
          <JourneyStep
            number={2}
            title="Leave a Queue handoff"
            body="Write what you want in your own words. Saving it does not start an AI or expand its access."
            action={{
              href: `/app/moves/${moveId}/queue`,
              label: "Open this move’s Queue",
            }}
            icon={ClipboardList}
          />
          <JourneyStep
            number={3}
            title="Return to saved work"
            body="AI-saved decisions, estimates, plans, and checked sources stay reviewable outside the chat."
            action={{
              href: `/app/moves/${moveId}/overview#planning-results`,
              label: "See saved move work",
            }}
            icon={Sparkles}
          />
        </div>
      </div>
    </section>
  );
}
