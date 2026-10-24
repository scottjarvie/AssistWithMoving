// Plain-language timing for a move's saved dates ("Nov 14, 2026 · in 21 days").
// Date-only strings are parsed as local midnight to avoid the UTC off-by-one.

function parseDay(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatMoveDay(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = parseDay(value);
  return parsed
    ? parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : value;
}

function daysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function relative(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export type MoveWhen = {
  /** "upcoming" (start today or later), "underWay" (between dates), "past". */
  phase: "upcoming" | "underWay" | "past";
  /** The date the wording is about: the start while upcoming, the end once past. */
  day: string;
  /** "in 21 days", "today", "3 days ago"; undefined while under way or unparseable. */
  relative?: string;
};

/** Which date to talk about and how far away it is; undefined with no dates. */
export function describeMoveWhen(
  dateStart?: string,
  dateEnd?: string,
  today: Date = new Date(),
): MoveWhen | undefined {
  const start = parseDay(dateStart);
  const end = parseDay(dateEnd);
  if (start && daysBetween(today, start) >= 0) {
    return { phase: "upcoming", day: formatMoveDay(dateStart)!, relative: relative(daysBetween(today, start)) };
  }
  if (end && daysBetween(today, end) >= 0) {
    return start
      ? { phase: "underWay", day: formatMoveDay(dateEnd)! }
      : { phase: "upcoming", day: formatMoveDay(dateEnd)!, relative: relative(daysBetween(today, end)) };
  }
  if (end) return { phase: "past", day: formatMoveDay(dateEnd)!, relative: relative(daysBetween(today, end)) };
  if (start) return { phase: "past", day: formatMoveDay(dateStart)!, relative: relative(daysBetween(today, start)) };
  const raw = dateStart ?? dateEnd;
  return raw ? { phase: "upcoming", day: raw } : undefined;
}

/** One line for cards: "Nov 14, 2026 · in 21 days", "Under way until Nov 15, 2026", "Moved Oct 21, 2026 · 3 days ago". */
export function moveWhenLine(
  dateStart?: string,
  dateEnd?: string,
  today: Date = new Date(),
): string | undefined {
  const when = describeMoveWhen(dateStart, dateEnd, today);
  if (!when) return undefined;
  if (when.phase === "underWay") return `Under way until ${when.day}`;
  const day = when.phase === "past" ? `Moved ${when.day}` : when.day;
  return when.relative ? `${day} · ${when.relative}` : day;
}
