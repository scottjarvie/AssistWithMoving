"use client";

import { cn } from "@/lib/utils";

// Pick an origination / destination SPACE by name. Lists the move's physical
// spaces; any legacy free-text value that doesn't match a space is preserved as
// a selectable option so nothing is lost. Stores the space NAME — origination and
// destination are display/grouping references; the structured location is the
// separate "Present location" picker (a space OR a transport).
export function SpaceSelect({
  value,
  onChange,
  spaceNames,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  spaceNames: string[];
  ariaLabel: string;
  className?: string;
}) {
  const options =
    value && !spaceNames.includes(value) ? [value, ...spaceNames] : spaceNames;
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:h-8",
        className,
      )}
    >
      <option value="">Not set</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
