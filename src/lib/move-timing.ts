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

/** e.g. "in 21 days", "today", "under way", "ended 3 days ago". */
export function describeMoveTiming(
  dateStart?: string,
  dateEnd?: string,
  today: Date = new Date(),
): string | undefined {
  const start = parseDay(dateStart);
  const end = parseDay(dateEnd);
  if (start && end && daysBetween(start, today) > 0 && daysBetween(today, end) >= 0) {
    return "under way";
  }
  if (start && daysBetween(today, start) >= 0) return relative(daysBetween(today, start));
  if (end) {
    const untilEnd = daysBetween(today, end);
    return untilEnd >= 0 ? relative(untilEnd) : `ended ${relative(untilEnd)}`;
  }
  if (start) return relative(daysBetween(today, start));
  return undefined;
}

/** One line for cards: "Nov 14, 2026 · in 21 days", or undefined with no dates. */
export function moveWhenLine(
  dateStart?: string,
  dateEnd?: string,
  today: Date = new Date(),
): string | undefined {
  const day = formatMoveDay(dateStart) ?? formatMoveDay(dateEnd);
  if (!day) return undefined;
  const timing = describeMoveTiming(dateStart, dateEnd, today);
  return timing ? `${day} · ${timing}` : day;
}
