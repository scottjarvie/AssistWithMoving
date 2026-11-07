"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Entry = { household: { _id: Id<"households">; name: string }; role: string };

/** Keep only the current page and its selected household, never the full list. */
export function useMemberHouseholdChoices(enabled: boolean) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [held, setHeld] = useState<Entry | null>(null);
  const page = useQuery(api.aiGrants.listHouseholdChoices, enabled ? (cursor ? { cursor } : {}) : "skip") as { households: Entry[]; nextCursor: string | null } | undefined;
  const households = page ? [...page.households] : undefined;
  if (households && held && !households.some(row => row.household._id === held.household._id)) households.push(held);
  function navigate(next: string | undefined, selected: Id<"households"> | null) {
    setHeld(households?.find(row => row.household._id === selected) ?? null);
    setCursor(next);
  }
  return { households, cursor, nextCursor: page?.nextCursor, next: (selected: Id<"households"> | null) => navigate(page?.nextCursor ?? undefined, selected), first: (selected: Id<"households"> | null) => navigate(undefined, selected) };
}
