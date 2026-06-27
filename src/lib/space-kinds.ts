// The space "kinds" that are real physical places (rooms / yard / storage /
// custom). Excludes the transport-ghost kinds (transportResource / transportZone)
// so trucks and trailers never show up as an "Origination"/"Destination" space.
export const PHYSICAL_SPACE_KINDS = new Set<string>([
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "custom",
]);

// Distinct, sorted names of a move's physical spaces — the options for an
// origination/destination space picker.
export function physicalSpaceNames(
  spaces: ReadonlyArray<{ name: string; kind: string }> | undefined | null,
): string[] {
  if (!spaces) return [];
  const names = new Set<string>();
  for (const space of spaces) {
    if (PHYSICAL_SPACE_KINDS.has(space.kind) && space.name.trim()) {
      names.add(space.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
