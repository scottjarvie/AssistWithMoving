export type DuplicateCandidateItem = {
  _id: string;
  name: string;
  normalizedName?: string;
  room?: string;
  category?: string;
  status?: string;
  deletedAt?: number;
};

export type InventoryDuplicateGroup<TItem extends DuplicateCandidateItem> = {
  groupKey: string;
  itemIds: string[];
  items: TItem[];
  score: number;
  reasons: string[];
  matchLabel: string;
};

type PreparedItem<TItem extends DuplicateCandidateItem> = {
  item: TItem;
  id: string;
  name: string;
  normalized: string;
  compact: string;
  tokens: string[];
  significantTokens: string[];
  significantKey: string;
  room: string;
  category: string;
};

type PairMatch = {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
  groupKey: string;
};

const descriptorTokens = new Set([
  "black",
  "blue",
  "brown",
  "clear",
  "dark",
  "gold",
  "gray",
  "green",
  "grey",
  "large",
  "light",
  "medium",
  "misc",
  "miscellaneous",
  "new",
  "old",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "small",
  "spare",
  "white",
  "yellow",
]);

const locationTokens = new Set([
  "attic",
  "basement",
  "bath",
  "bathroom",
  "bedroom",
  "closet",
  "dining",
  "family",
  "garage",
  "guest",
  "hall",
  "kitchen",
  "laundry",
  "living",
  "office",
  "pantry",
  "storage",
]);

const fillerTokens = new Set([
  "and",
  "for",
  "from",
  "of",
  "the",
  "with",
]);

const compoundReplacements: Array<[RegExp, string]> = [
  [/\bbookcase\b/g, "book case"],
  [/\bbookshelf\b/g, "book shelf"],
  [/\bnightstand\b/g, "night stand"],
  [/\bsoundbar\b/g, "sound bar"],
  [/\btoolbox\b/g, "tool box"],
  [/\bworkbench\b/g, "work bench"],
];

export const duplicateReviewFlag = "possible duplicate";

export function findInventoryDuplicateGroups<TItem extends DuplicateCandidateItem>(
  items: TItem[],
  options: { limit?: number } = {}
): InventoryDuplicateGroup<TItem>[] {
  const activeItems = items
    .filter((item) => !item.deletedAt && item.status !== "archived")
    .map(prepareItem)
    .filter((item) => item.significantTokens.length > 0);
  const matches: PairMatch[] = [];

  for (let leftIndex = 0; leftIndex < activeItems.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < activeItems.length;
      rightIndex += 1
    ) {
      const match = matchPair(activeItems[leftIndex], activeItems[rightIndex]);
      if (match) matches.push(match);
    }
  }

  if (!matches.length) return [];

  const parent = new Map<string, string>();
  for (const item of activeItems) parent.set(item.id, item.id);

  for (const match of matches) {
    union(parent, match.leftId, match.rightId);
  }

  const itemsByRoot = new Map<string, PreparedItem<TItem>[]>();
  for (const item of activeItems) {
    const root = find(parent, item.id);
    const group = itemsByRoot.get(root) ?? [];
    group.push(item);
    itemsByRoot.set(root, group);
  }

  const matchesByPair = new Map<string, PairMatch>();
  for (const match of matches) {
    matchesByPair.set(pairKey(match.leftId, match.rightId), match);
  }

  const groups: InventoryDuplicateGroup<TItem>[] = [];
  for (const groupItems of itemsByRoot.values()) {
    if (groupItems.length < 2) continue;

    const groupMatches = collectGroupMatches(groupItems, matchesByPair);
    if (!groupMatches.length) continue;

    const reasons = Array.from(
      new Set(groupMatches.flatMap((match) => match.reasons))
    ).slice(0, 4);
    const score = Math.max(...groupMatches.map((match) => match.score));
    const sortedItems = [...groupItems].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const itemIds = sortedItems.map((entry) => entry.id).sort();
    const matchLabel = sharedMatchLabel(sortedItems);

    groups.push({
      groupKey: `${matchLabel}:${itemIds.join("|")}`,
      itemIds,
      items: sortedItems.map((entry) => entry.item),
      score,
      reasons,
      matchLabel,
    });
  }

  return groups
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta) return scoreDelta;
      const sizeDelta = b.items.length - a.items.length;
      if (sizeDelta) return sizeDelta;
      return a.matchLabel.localeCompare(b.matchLabel);
    })
    .slice(0, options.limit ?? 20);
}

export function itemIdsKey(itemIds: string[]) {
  return [...itemIds].sort().join("|");
}

export function addDuplicateReviewFlag(flags: string[] | undefined) {
  const next = normalizeFlags(flags);
  if (!next.some((flag) => sameFlag(flag, duplicateReviewFlag))) {
    next.push(duplicateReviewFlag);
  }
  return next;
}

export function removeDuplicateReviewFlag(flags: string[] | undefined) {
  return normalizeFlags(flags).filter((flag) => !sameFlag(flag, duplicateReviewFlag));
}

export function hasDuplicateReviewFlag(flags: string[] | undefined) {
  return normalizeFlags(flags).some((flag) => sameFlag(flag, duplicateReviewFlag));
}

function prepareItem<TItem extends DuplicateCandidateItem>(
  item: TItem
): PreparedItem<TItem> {
  const normalized = normalizeText(item.normalizedName ?? item.name);
  const tokens = tokenizeName(normalized);
  const significantTokens = significantNameTokens(tokens);
  return {
    item,
    id: String(item._id),
    name: item.name,
    normalized,
    compact: normalized.replace(/\s+/g, ""),
    tokens,
    significantTokens,
    significantKey: stableTokenKey(significantTokens),
    room: normalizeText(item.room ?? ""),
    category: normalizeText(item.category ?? ""),
  };
}

function matchPair<TItem extends DuplicateCandidateItem>(
  left: PreparedItem<TItem>,
  right: PreparedItem<TItem>
): PairMatch | null {
  const reasons: string[] = [];
  let score = 0;

  if (left.normalized === right.normalized) {
    reasons.push("Exact normalized item name");
    score = Math.max(score, 100);
  }

  if (left.compact === right.compact && left.normalized !== right.normalized) {
    reasons.push("Same name after spacing is normalized");
    score = Math.max(score, 94);
  }

  const sharedTokens = intersection(left.significantTokens, right.significantTokens);
  const unionTokens = unionTokensFor(left.significantTokens, right.significantTokens);
  const jaccard = sharedTokens.length / Math.max(unionTokens.length, 1);
  const sameRoom = Boolean(left.room && left.room === right.room);
  const sameCategory = Boolean(left.category && left.category === right.category);

  if (
    left.significantKey &&
    left.significantKey === right.significantKey &&
    (left.significantTokens.length >= 2 || sameRoom || sameCategory)
  ) {
    reasons.push("Same core item terms after ignoring color/location words");
    score = Math.max(score, 90);
  }

  if (sharedTokens.length >= 2 && jaccard >= 0.67) {
    reasons.push("Strong overlap in core item terms");
    score = Math.max(score, sameRoom || sameCategory ? 86 : 78);
  }

  if (sharedTokens.length >= 1 && sameRoom && sameCategory) {
    reasons.push("Same room and category with matching item terms");
    score = Math.max(score, 72);
  }

  if (sameRoom) {
    reasons.push("Same room");
    score += 2;
  }
  if (sameCategory) {
    reasons.push("Same category");
    score += 3;
  }

  if (score < 72) return null;

  return {
    leftId: left.id,
    rightId: right.id,
    score: Math.min(score, 100),
    reasons,
    groupKey: stableTokenKey(sharedTokens) || left.significantKey || left.compact,
  };
}

function normalizeText(value: string) {
  let normalized = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  for (const [pattern, replacement] of compoundReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.trim().replace(/\s+/g, " ");
}

function tokenizeName(value: string) {
  return value
    .split(" ")
    .map((token) => singularize(token.trim()))
    .filter(Boolean)
    .filter((token) => !fillerTokens.has(token));
}

function significantNameTokens(tokens: string[]) {
  return tokens.filter(
    (token) => !descriptorTokens.has(token) && !locationTokens.has(token)
  );
}

function singularize(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function stableTokenKey(tokens: string[]) {
  return Array.from(new Set(tokens)).sort().join(" ");
}

function sharedMatchLabel<TItem extends DuplicateCandidateItem>(
  items: PreparedItem<TItem>[]
) {
  const shared = items
    .slice(1)
    .reduce(
      (tokens, item) => intersection(tokens, item.significantTokens),
      items[0]?.significantTokens ?? []
    );
  return stableTokenKey(shared) || items[0]?.significantKey || "duplicate";
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return Array.from(new Set(left.filter((token) => rightSet.has(token))));
}

function unionTokensFor(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right]));
}

function normalizeFlags(flags: string[] | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawFlag of flags ?? []) {
    const flag = rawFlag.trim();
    if (!flag) continue;
    const key = flag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(sameFlag(flag, duplicateReviewFlag) ? duplicateReviewFlag : flag);
  }
  return normalized;
}

function sameFlag(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function find(parent: Map<string, string>, id: string): string {
  const current = parent.get(id) ?? id;
  if (current === id) return current;
  const root = find(parent, current);
  parent.set(id, root);
  return root;
}

function union(parent: Map<string, string>, left: string, right: string) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
}

function pairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join("|");
}

function collectGroupMatches<TItem extends DuplicateCandidateItem>(
  items: PreparedItem<TItem>[],
  matchesByPair: Map<string, PairMatch>
) {
  const matches: PairMatch[] = [];
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const match = matchesByPair.get(pairKey(items[leftIndex].id, items[rightIndex].id));
      if (match) matches.push(match);
    }
  }
  return matches;
}
