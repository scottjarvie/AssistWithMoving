import { itemDispositionOptions } from "@/lib/inventory-options";

export type BulkInventoryRow = {
  id: string;
  selected: boolean;
  name: string;
  room: string;
  category: string;
  disposition: (typeof itemDispositionOptions)[number];
  quantity: string;
  description: string;
  sourceLine: string;
};

const numberWords = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["a", 1],
  ["an", 1],
]);

const knownHeaders = new Map([
  ["item", "name"],
  ["items", "name"],
  ["name", "name"],
  ["room", "room"],
  ["current room", "room"],
  ["category", "category"],
  ["type", "category"],
  ["disposition", "disposition"],
  ["status", "disposition"],
  ["qty", "quantity"],
  ["quantity", "quantity"],
  ["count", "quantity"],
  ["notes", "description"],
  ["note", "description"],
  ["description", "description"],
]);

function cleanEntry(value: string) {
  return value
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ");
}

function normalizeDisposition(value: string) {
  const normalized = value.trim();
  return itemDispositionOptions.includes(
    normalized as (typeof itemDispositionOptions)[number]
  )
    ? (normalized as (typeof itemDispositionOptions)[number])
    : "undecided";
}

function parseQuantityPrefix(value: string) {
  const cleaned = cleanEntry(value);
  const match = cleaned.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(.+)$/i
  );
  if (!match) {
    return { quantity: "1", name: cleaned };
  }

  const rawQuantity = match[1].toLowerCase();
  const quantity = numberWords.get(rawQuantity) ?? Number(rawQuantity);
  return {
    quantity: Number.isFinite(quantity) ? String(quantity) : "1",
    name: match[2],
  };
}

function rowFromValues(
  id: number,
  values: Partial<Omit<BulkInventoryRow, "id" | "selected">> & {
    sourceLine: string;
  }
): BulkInventoryRow | null {
  const name = cleanEntry(values.name ?? "");
  if (!name) {
    return null;
  }

  return {
    id: `bulk-${id}`,
    selected: true,
    name,
    room: cleanEntry(values.room ?? ""),
    category: cleanEntry(values.category ?? ""),
    disposition: normalizeDisposition(values.disposition ?? ""),
    quantity: values.quantity?.trim() || "1",
    description: cleanEntry(values.description ?? ""),
    sourceLine: values.sourceLine,
  };
}

function parseDelimitedRows(lines: string[]) {
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : "|";
  if (!lines.some((line) => line.includes(delimiter))) {
    return [];
  }

  const splitRows = lines.map((line) =>
    line.split(delimiter).map((cell) => cleanEntry(cell))
  );
  const header = splitRows[0].map((cell) =>
    knownHeaders.get(cell.toLowerCase())
  );
  const hasHeader = header.some(Boolean);
  const rows = hasHeader ? splitRows.slice(1) : splitRows;

  return rows
    .map((cells, index) => {
      const sourceLine = lines[hasHeader ? index + 1 : index];
      if (hasHeader) {
        const values: Record<string, string> = {};
        cells.forEach((cell, cellIndex) => {
          const key = header[cellIndex];
          if (key) values[key] = cell;
        });
        return rowFromValues(index, { ...values, sourceLine });
      }

      return rowFromValues(index, {
        room: cells[0],
        name: cells[1],
        category: cells[2],
        quantity: cells[3],
        sourceLine,
      });
    })
    .filter((row): row is BulkInventoryRow => Boolean(row));
}

export function parseBulkInventoryText(text: string): BulkInventoryRow[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.some((line) => line.includes("\t") || line.includes("|"))) {
    return parseDelimitedRows(lines);
  }

  let id = 0;
  const rows: BulkInventoryRow[] = [];

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    const [possibleRoom, rest] =
      colonIndex >= 0
        ? [line.slice(0, colonIndex), line.slice(colonIndex + 1)]
        : ["", line];
    const room = rest ? cleanEntry(possibleRoom) : "";
    const entries = (rest || line)
      .split(/[,;]/)
      .map(cleanEntry)
      .filter(Boolean);

    for (const entry of entries) {
      const parsed = parseQuantityPrefix(entry);
      const row = rowFromValues(id, {
        name: parsed.name,
        room,
        quantity: parsed.quantity,
        sourceLine: line,
      });
      if (row) {
        rows.push(row);
        id += 1;
      }
    }
  }

  return rows;
}
