export const releaseCategories = ["created", "fixed", "upgraded"] as const;
export const impactTiers = ["major", "meaningful", "supporting"] as const;

export type ReleaseCategory = (typeof releaseCategories)[number];
export type ImpactTier = (typeof impactTiers)[number];

export type ReleaseItem = {
  id: string;
  category: ReleaseCategory;
  impactTier: ImpactTier;
  impactRank: number;
  short: string;
  long: {
    what: string;
    why: string;
    where?: string;
  };
  sourceRefs: string[];
  audiences?: Array<"public" | "signed-in" | "admin" | "agent">;
};

export type ReleaseEntry = {
  version: string;
  releasedAt: string;
  timezone: string;
  title: string;
  summary: string;
  items: ReleaseItem[];
  backfillNote?: string;
};

export type PublicReleaseItem = Omit<ReleaseItem, "sourceRefs" | "audiences">;
export type PublicReleaseEntry = Omit<ReleaseEntry, "items"> & {
  items: PublicReleaseItem[];
};

const impactTierOrder: Record<ImpactTier, number> = {
  major: 0,
  meaningful: 1,
  supporting: 2,
};

export function getReleaseItems(
  entry: Pick<ReleaseEntry, "items"> | Pick<PublicReleaseEntry, "items">,
  category: ReleaseCategory,
) {
  return entry.items
    .filter((item) => item.category === category)
    .toSorted(
      (left, right) =>
        impactTierOrder[left.impactTier] -
          impactTierOrder[right.impactTier] ||
        left.impactRank - right.impactRank ||
        left.id.localeCompare(right.id),
    );
}

export function formatReleaseTimestamp(
  releasedAt: string,
  timezone = "America/Phoenix",
) {
  const date = new Date(releasedAt);
  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);

  return `${dateText}, ${timeText}`;
}
