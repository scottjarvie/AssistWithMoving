export type RoughMovableUnitKind = "box" | "looseItem";

export type RoughMovableUnitRow = {
  id: string;
  selected: boolean;
  kind: RoughMovableUnitKind;
  name: string;
  code: string;
  room: string;
  quantity: string;
  estimatedWeightLb: string;
  estimatedVolumeCuFt: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  loadTarget: string;
  zoneTarget: string;
  requiresPersonalTransport: boolean;
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
  ["couple", 2],
  ["a couple", 2],
  ["a couple of", 2],
  ["few", 3],
  ["a few", 3],
  ["several", 4],
  ["dozen", 12],
  ["a dozen", 12],
]);

const writtenQuantityWords = new Map([
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
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
  ["hundred", 100],
  ["one hundred", 100],
]);

const boxWords =
  /\b(box|boxes|carton|cartons|tote|totes|bin|bins|crate|crates)\b/i;
const loosePrefix = /^(loose|item|large item|unit)\s*[:|-]\s*/i;
const boxPrefix = /^(box|carton|tote|bin|crate)(?![- ]?\d)\s*[:|-]\s*/i;
const kindHeaderPattern = /^(kind|type)$/i;
const nameHeaderPattern = /^(name|label|description)$/i;
const roomHeaderPattern = /^(room|space|origin|location)$/i;
const quantityHeaderPattern = /^(qty|quantity|count|units)$/i;
const codeHeaderPattern = /^(code|box code|boxcode|box #|box number|number)$/i;
const weightHeaderPattern =
  /^(weight|estimated weight|estimated weight lb|lb|lbs)$/i;
const volumeHeaderPattern =
  /^(volume|estimated volume|estimated volume cu ft|cu ft|cuft|cubic feet)$/i;
const dimensionsHeaderPattern = /^(dimensions|size|dims|lwh|l x w x h)$/i;
const loadHeaderPattern =
  /^(load|resource|transport|transport resource|truck|trailer|vehicle|storage|assigned resource)$/i;
const zoneHeaderPattern = /^(zone|load zone|section|area)$/i;
const personalTransportHeaderPattern =
  /^(personal|personal transport|owner carry|owner carried|owner-carried|with me|car|transport)$/i;
const personalTransportPatterns = [
  /\bpersonal transport\b/i,
  /\bowner[- ]?(?:carry|carried)\b/i,
  /\b(?:carry|take|keep)\s+(?:it\s+)?with me\b/i,
  /\b(?:goes|going|go)\s+(?:with me|in (?:my|the) car)\b/i,
  /\bin (?:my|the) car\b/i,
  /\bpersonal car\b/i,
  /\bnot for movers\b/i,
  /\b(?:do not|don't)\s+let movers touch\b/i,
];

function cleanEntry(value: string) {
  return value
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ");
}

function parsePositiveNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function numberWordOrValue(value: string | undefined) {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return numberWords.get(lower) ?? parsePositiveNumber(lower);
}

function writtenQuantityValue(value: string | undefined) {
  if (!value) return undefined;
  const normalized = cleanEntry(value.toLowerCase().replace(/-/g, " "));
  const direct = writtenQuantityWords.get(normalized);
  if (direct) return direct;

  const [tensWord, onesWord, ...extra] = normalized.split(" ");
  if (extra.length) return undefined;
  const tens = writtenQuantityWords.get(tensWord ?? "");
  const ones = writtenQuantityWords.get(onesWord ?? "");
  if (
    tens !== undefined &&
    tens >= 20 &&
    tens < 100 &&
    ones !== undefined &&
    ones > 0 &&
    ones < 10
  ) {
    return tens + ones;
  }

  return undefined;
}

function removeMatchedText(value: string, matched: string | undefined) {
  if (!matched) return value;
  return cleanEntry(value.replace(matched, " ").replace(/\s+[,;-]\s*$/, ""));
}

function parsePersonalTransport(value: string) {
  const match = personalTransportPatterns
    .map((pattern) => value.match(pattern)?.[0])
    .find(Boolean);
  return {
    requiresPersonalTransport: Boolean(match),
    text: match,
  };
}

function splitLoadAndZone(value: string) {
  const cleaned = cleanEntry(value);
  const slashMatch = cleaned.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slashMatch) {
    return {
      loadTarget: cleanEntry(slashMatch[1] ?? ""),
      zoneTarget: cleanEntry(slashMatch[2] ?? ""),
    };
  }

  const namedZoneMatch = cleaned.match(
    /^(.+?)\s+(?:zone|section|area)\s+(.+)$/i,
  );
  if (namedZoneMatch) {
    return {
      loadTarget: cleanEntry(namedZoneMatch[1] ?? ""),
      zoneTarget: cleanEntry(namedZoneMatch[2] ?? ""),
    };
  }

  return { loadTarget: cleaned, zoneTarget: "" };
}

function parseLoadTarget(value: string) {
  const patterns = [
    /\s*(?:->|=>|@)\s*([^,;]+)$/i,
    /\b(?:load|resource|transport|truck|trailer|vehicle|storage)\s*[:=]\s*([^,;]+)$/i,
    /\b(?:to|into|in|on)\s+((?:the\s+)?(?:moving\s+)?(?:truck|trailer|van|pod|container|storage|personal car|car|u-?haul)[^,;]*)$/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const rawTarget = cleanEntry(match?.[1] ?? "");
    if (rawTarget) {
      return {
        ...splitLoadAndZone(rawTarget),
        text: match?.[0],
      };
    }
  }

  return { loadTarget: "", zoneTarget: "", text: undefined };
}

function cleanParsedBoxCode(value: string | undefined) {
  return cleanEntry(value ?? "")
    .replace(/^#/, "")
    .replace(/[.:)]+$/, "");
}

function parseBoxCodePrefix(value: string) {
  const cleaned = cleanEntry(value);
  const codePatterns = [
    /^([A-Z]{1,8}[- ]?\d{1,8}[A-Z]?)\s*(?:[:\-–—]\s*|\s+)(.+)$/i,
    /^#(\d{1,8}[A-Z]?)\s*(?:[:\-–—]\s*|\s+)(.+)$/i,
    /^(?:box|carton|tote|bin|crate)\s+#?([A-Z]{0,4}[- ]?\d{1,8}[A-Z]?)\s*(?:[:\-–—]\s*|\s+)(.+)$/i,
  ];

  for (const pattern of codePatterns) {
    const match = cleaned.match(pattern);
    const code = cleanParsedBoxCode(match?.[1]);
    const rest = cleanEntry(match?.[2] ?? "");
    if (/^(?:about|around|roughly|approx(?:imately)?\.?)\s+\d/i.test(code)) {
      return { code: "", rest: cleaned };
    }
    if (code && rest) {
      return { code, rest };
    }
  }

  return { code: "", rest: cleaned };
}

function parseBoxCodeRangePrefix(value: string) {
  const cleaned = cleanEntry(value);
  const match = cleaned.match(
    /^(?:(?:box|boxes|carton|cartons|tote|totes|bin|bins|crate|crates)\s+(?:(?:numbered|numbers?|coded|codes?|labeled|labelled)\s+)?)?#?([A-Z]{1,8}[- ]?)?(\d{1,8})([A-Z]?)\s*(?:-|–|—|\bto\b|\bthrough\b)\s*#?([A-Z]{1,8}[- ]?)?(\d{1,8})([A-Z]?)\s*(?:[:\-–—]\s*|\s+)?(.*)$/i,
  );

  if (!match) {
    return undefined;
  }

  const startNumberText = match[2];
  const endNumberText = match[5];
  const start = Number(startNumberText);
  const end = Number(endNumberText);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start <= 0 ||
    end < start
  ) {
    return undefined;
  }

  const startSuffix = match[3] ?? "";
  const endSuffix = match[6] ?? "";
  if (startSuffix.toLowerCase() !== endSuffix.toLowerCase()) {
    return undefined;
  }

  const prefix = normalizeRangePrefix(match[1] ?? match[4] ?? "");
  const width =
    startNumberText.startsWith("0") || endNumberText.startsWith("0")
      ? Math.max(startNumberText.length, endNumberText.length)
      : 0;
  const count = Math.min(end - start + 1, 100);
  const codes = Array.from({ length: count }, (_, index) =>
    formatRangeCode({
      prefix,
      number: start + index,
      width,
      suffix: startSuffix.toUpperCase(),
    }),
  );

  return {
    codes,
    rest: cleanRangeRest(match[7] ?? ""),
  };
}

function cleanRangeRest(value: string) {
  return cleanEntry(value).replace(/^(?:are|is|as)\s+/i, "");
}

function normalizeRangePrefix(value: string) {
  return cleanParsedBoxCode(value).replace(/\s+/g, "-").toUpperCase();
}

function formatRangeCode({
  prefix,
  number,
  width,
  suffix,
}: {
  prefix: string;
  number: number;
  width: number;
  suffix: string;
}) {
  const numberText = width
    ? String(number).padStart(width, "0")
    : String(number);
  return `${prefix}${numberText}${suffix}`;
}

function parseWeight(value: string) {
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/i);
  return {
    value: match?.[1] ?? "",
    text: match?.[0],
  };
}

function parseVolume(value: string) {
  const match = value.match(
    /\b(\d+(?:\.\d+)?)\s*(?:cu\s*ft|cuft|cubic\s*(?:ft|feet)|ft3|ft\^3)\b/i,
  );
  return {
    value: match?.[1] ?? "",
    text: match?.[0],
  };
}

function parseDimensions(value: string) {
  const match = value.match(
    /\b(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")?\b/i,
  );
  return {
    lengthIn: match?.[1] ?? "",
    widthIn: match?.[2] ?? "",
    heightIn: match?.[3] ?? "",
    text: match?.[0],
  };
}

function parseQuantityPrefix(value: string) {
  const cleaned = cleanEntry(
    value.replace(/^(?:about|around|roughly|approx(?:imately)?\.?|~)\s+/i, ""),
  );
  const roughMatch = cleaned.match(
    /^(half\s+a\s+dozen|half\s+dozen|a\s+couple\s+of|a\s+couple|couple\s+of|couple|a\s+few|few|several|a\s+dozen|dozen)\s+(.+)$/i,
  );
  if (roughMatch) {
    const rawQuantity = cleanEntry(roughMatch[1] ?? "")
      .replace(/^half\s+a?\s*dozen$/i, "six")
      .replace(/\s+of$/i, "");
    return {
      quantity: numberWordOrValue(rawQuantity) ?? 1,
      rest: roughMatch[2] ?? "",
    };
  }
  const writtenMatch = cleaned.match(
    /^([a-z]+(?:[- ][a-z]+)?)\s+(.+)$/i,
  );
  const writtenQuantity = writtenQuantityValue(writtenMatch?.[1]);
  if (writtenQuantity !== undefined) {
    return {
      quantity: writtenQuantity,
      rest: writtenMatch?.[2] ?? "",
    };
  }
  const match = cleaned.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(.+)$/i,
  );
  if (!match) {
    return { quantity: 1, rest: value };
  }
  return {
    quantity: numberWordOrValue(match[1]) ?? 1,
    rest: match[2],
  };
}

function normalizeBoxName(value: string) {
  const cleaned = cleanEntry(value);
  if (!cleaned) return "Box";
  if (
    /^(box|boxes|carton|cartons|tote|totes|bin|bins|crate|crates)$/i.test(
      cleaned,
    )
  ) {
    return singularizeBoxLabel(cleaned);
  }
  return cleaned;
}

function singularizeBoxLabel(value: string) {
  return value
    .replace(/\bboxes\b/gi, "box")
    .replace(/\bcartons\b/gi, "carton")
    .replace(/\btotes\b/gi, "tote")
    .replace(/\bbins\b/gi, "bin")
    .replace(/\bcrates\b/gi, "crate");
}

function classifyKind(rawValue: string): RoughMovableUnitKind {
  if (parseBoxCodeRangePrefix(rawValue)) return "box";
  if (parseBoxCodePrefix(rawValue).code) return "box";
  if (boxPrefix.test(rawValue) || boxWords.test(rawValue)) return "box";
  return "looseItem";
}

function stripKindPrefix(kind: RoughMovableUnitKind, value: string) {
  if (kind === "box") {
    return cleanEntry(value.replace(boxPrefix, ""));
  }
  return cleanEntry(value.replace(loosePrefix, ""));
}

function rowFromEntry({
  id,
  entry,
  inheritedRoom,
  sourceLine,
}: {
  id: number;
  entry: string;
  inheritedRoom: string;
  sourceLine: string;
}) {
  const cleaned = cleanEntry(entry);
  if (!cleaned) return [];

  const explicitLoose = loosePrefix.test(cleaned);
  const dimensions = parseDimensions(cleaned);
  const withoutDimensions = removeMatchedText(cleaned, dimensions.text);
  const volume = parseVolume(withoutDimensions);
  const withoutVolume = removeMatchedText(withoutDimensions, volume.text);
  const weight = parseWeight(withoutVolume);
  const withoutMeasurements = removeMatchedText(withoutVolume, weight.text);
  const personalTransport = parsePersonalTransport(withoutMeasurements);
  const withoutPersonalTransport = removeMatchedText(
    withoutMeasurements,
    personalTransport.text,
  );
  const loadTarget = parseLoadTarget(withoutPersonalTransport);
  const withoutLoadTarget = removeMatchedText(
    withoutPersonalTransport,
    loadTarget.text,
  );
  const kind = explicitLoose ? "looseItem" : classifyKind(withoutLoadTarget);
  const strippedKind = stripKindPrefix(kind, withoutLoadTarget);
  const parsedRange =
    kind === "box" ? parseBoxCodeRangePrefix(strippedKind) : undefined;
  const parsedCode =
    kind === "box" && !parsedRange
      ? parseBoxCodePrefix(strippedKind)
      : { code: "", rest: strippedKind };
  const quantityParsed = parsedRange
    ? { quantity: parsedRange.codes.length, rest: parsedRange.rest || "Box" }
    : parseQuantityPrefix(parsedCode.rest);
  const quantity =
    kind === "box"
      ? Math.min(quantityParsed.quantity, 100)
      : quantityParsed.quantity;
  const baseName =
    kind === "box"
      ? normalizeBoxName(quantityParsed.rest)
      : cleanEntry(quantityParsed.rest);
  const name = baseName || (kind === "box" ? "Box" : "Loose item");

  return Array.from({ length: kind === "box" ? quantity : 1 }, (_, index) => ({
    id: `rough-unit-${id + index}`,
    selected: true,
    kind,
    name:
      kind === "box" && quantity > 1 && !parsedRange
        ? `${singularizeBoxLabel(name)} ${index + 1}`
        : name,
    code: parsedRange?.codes[index] ?? parsedCode.code,
    room: inheritedRoom,
    quantity: kind === "box" ? "1" : String(quantity),
    estimatedWeightLb: weight.value,
    estimatedVolumeCuFt: volume.value,
    lengthIn: dimensions.lengthIn,
    widthIn: dimensions.widthIn,
    heightIn: dimensions.heightIn,
    loadTarget: loadTarget.loadTarget,
    zoneTarget: loadTarget.zoneTarget,
    requiresPersonalTransport:
      kind === "looseItem" && personalTransport.requiresPersonalTransport,
    sourceLine,
  }));
}

function splitSimpleEntries(line: string) {
  const colonIndex = line.indexOf(":");
  const possiblePrefix =
    colonIndex >= 0 ? cleanEntry(line.slice(0, colonIndex)) : "";
  const prefixIsKind =
    /^(box|loose|item|large item|unit|carton|tote|bin|crate)$/i.test(
      possiblePrefix,
    );
  const prefixIsCode = Boolean(
    parseBoxCodePrefix(line).code || parseBoxCodeRangePrefix(line),
  );
  const inheritedRoom =
    colonIndex >= 0 && !prefixIsKind && !prefixIsCode ? possiblePrefix : "";
  const rest =
    colonIndex >= 0 && !prefixIsKind && !prefixIsCode
      ? line.slice(colonIndex + 1)
      : line;
  return {
    inheritedRoom,
    entries: splitRoughEntryList(rest),
  };
}

function splitRoughEntryList(value: string) {
  return value
    .split(/[,;]/)
    .flatMap(splitConjunctionEntries)
    .map(cleanEntry)
    .filter(Boolean);
}

function splitConjunctionEntries(value: string) {
  const pieces = value.split(/\s+\band\s+/i).map(cleanEntry).filter(Boolean);
  if (pieces.length <= 1) return [value];

  const entries = [pieces[0] ?? ""];
  for (const piece of pieces.slice(1)) {
    if (startsNewMovableUnitEntry(piece)) {
      entries.push(piece);
      continue;
    }
    entries[entries.length - 1] = cleanEntry(
      `${entries[entries.length - 1]} and ${piece}`,
    );
  }

  return entries;
}

function startsNewMovableUnitEntry(value: string) {
  const cleaned = cleanEntry(value);
  if (!cleaned) return false;
  if (loosePrefix.test(cleaned) || boxPrefix.test(cleaned)) return true;
  if (parseBoxCodePrefix(cleaned).code || parseBoxCodeRangePrefix(cleaned)) {
    return true;
  }

  const withoutApprox = cleanEntry(
    cleaned.replace(/^(?:about|around|roughly|approx(?:imately)?\.?|~)\s+/i, ""),
  );
  if (
    /^(half\s+a\s+dozen|half\s+dozen|a\s+couple\s+of|a\s+couple|couple\s+of|couple|a\s+few|few|several|a\s+dozen|dozen)\b/i.test(
      withoutApprox,
    )
  ) {
    return true;
  }

  const words = withoutApprox.split(" ");
  const firstWord = words[0];
  const firstTwoWords = words.slice(0, 2).join(" ");
  return Boolean(
    parsePositiveNumber(firstWord) ||
      numberWords.has(firstWord?.toLowerCase() ?? "") ||
      writtenQuantityValue(firstWord) ||
      writtenQuantityValue(firstTwoWords),
  );
}

function delimitedNameWithQuantity({
  kind,
  codeCell,
  nameCell,
  quantityCell,
}: {
  kind: RoughMovableUnitKind;
  codeCell: string;
  nameCell: string;
  quantityCell: string;
}) {
  const quantityText = cleanEntry(quantityCell);
  if (!quantityText) return nameCell;
  if (kind === "box" && cleanParsedBoxCode(codeCell)) return nameCell;

  const quantity = standaloneDelimitedQuantity(quantityText);
  if (quantity === undefined || quantity <= 1) return nameCell;

  const nameQuantity = parseQuantityPrefix(nameCell);
  if (nameQuantity.quantity > 1 && nameQuantity.rest !== nameCell) {
    return nameCell;
  }

  return cleanEntry(`${quantityText} ${nameCell}`);
}

function standaloneDelimitedQuantity(value: string) {
  return parseQuantityPrefix(`${value} units`).quantity;
}

function parseDelimitedRows(lines: string[]) {
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : "|";
  if (!lines.some((line) => line.includes(delimiter))) return [];

  const headerCells = lines[0].split(delimiter).map(cleanEntry);
  const hasHeader = headerCells.some((cell) =>
    [
      kindHeaderPattern,
      nameHeaderPattern,
      roomHeaderPattern,
      codeHeaderPattern,
      quantityHeaderPattern,
      weightHeaderPattern,
      volumeHeaderPattern,
      dimensionsHeaderPattern,
    ].some((pattern) => pattern.test(cell)),
  );
  const headerIndex = (patterns: RegExp[]) =>
    hasHeader
      ? headerCells.findIndex((cell) =>
          patterns.some((pattern) => pattern.test(cell)),
        )
      : -1;
  const indexes = {
    kind: headerIndex([kindHeaderPattern]),
    code: headerIndex([codeHeaderPattern]),
    name: headerIndex([nameHeaderPattern]),
    room: headerIndex([roomHeaderPattern]),
    quantity: headerIndex([quantityHeaderPattern]),
    weight: headerIndex([weightHeaderPattern]),
    volume: headerIndex([volumeHeaderPattern]),
    dimensions: headerIndex([dimensionsHeaderPattern]),
    personalTransport: headerIndex([personalTransportHeaderPattern]),
    load: headerIndex([loadHeaderPattern]),
    zone: headerIndex([zoneHeaderPattern]),
  };
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .flatMap((line, index) => {
      const cells = line.split(delimiter).map(cleanEntry);
      const cellAt = (cellIndex: number, fallbackIndex: number) =>
        cells[cellIndex >= 0 ? cellIndex : fallbackIndex] ?? "";
      const kindCell = cellAt(indexes.kind, 0);
      const codeCell = cellAt(indexes.code, -1);
      const nameCell = cellAt(indexes.name, 1);
      const roomCell = cellAt(indexes.room, 2);
      const quantityCell = cellAt(indexes.quantity, -1);
      const weightCell = cellAt(indexes.weight, 3);
      const volumeCell = cellAt(indexes.volume, -1);
      const dimensionsCell = cellAt(indexes.dimensions, 4);
      const personalTransportCell =
        indexes.personalTransport >= 0
          ? cellAt(indexes.personalTransport, -1)
          : "";
      const loadCell = indexes.load >= 0 ? cellAt(indexes.load, -1) : "";
      const zoneCell = indexes.zone >= 0 ? cellAt(indexes.zone, -1) : "";
      const kind: RoughMovableUnitKind = /box/i.test(kindCell)
        ? "box"
        : "looseItem";
      const nameWithQuantity = delimitedNameWithQuantity({
        kind,
        codeCell,
        nameCell,
        quantityCell,
      });
      const combined = [
        kind === "box" ? "box:" : "item:",
        nameWithQuantity,
        weightCell,
        volumeCell,
        dimensionsCell,
        personalTransportCell,
      ]
        .filter(Boolean)
        .join(" ");
      return rowFromEntry({
        id: index,
        entry: combined,
        inheritedRoom: roomCell ?? "",
        sourceLine: line,
      }).map((row) => ({
        ...row,
        kind,
        code: kind === "box" ? cleanParsedBoxCode(codeCell) || row.code : "",
        loadTarget: loadCell || row.loadTarget,
        zoneTarget: zoneCell || row.zoneTarget,
      }));
    })
    .filter((row) => row.name);
}

export function parseRoughMovableUnitText(text: string): RoughMovableUnitRow[] {
  const lines = text.split(/\r?\n/).map(cleanEntry).filter(Boolean);

  if (!lines.length) return [];
  if (lines.some((line) => line.includes("\t") || line.includes("|"))) {
    return parseDelimitedRows(lines).slice(0, 100);
  }

  let nextId = 0;
  const rows: RoughMovableUnitRow[] = [];
  for (const line of lines) {
    const { inheritedRoom, entries } = splitSimpleEntries(line);
    for (const entry of entries) {
      const parsedRows = rowFromEntry({
        id: nextId,
        entry,
        inheritedRoom,
        sourceLine: line,
      });
      rows.push(...parsedRows);
      nextId += parsedRows.length;
    }
  }

  return rows.slice(0, 100);
}
