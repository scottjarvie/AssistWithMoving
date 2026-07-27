export const CODE_SEQUENCE_COLLISION_BUDGET = 2_000;

export class CodeSequenceExhaustedError extends Error {
  constructor() {
    super("Could not reserve unique codes within the collision budget.");
    this.name = "CodeSequenceExhaustedError";
  }
}

export function formatBoxCode(sequence: number) {
  return `B-${String(sequence).padStart(3, "0")}`;
}

export function legacySequenceSeed(codes: string[], pattern: RegExp) {
  let highest = 0;
  for (const code of codes) {
    const match = pattern.exec(code);
    const sequence = match ? Number(match[1]) : Number.NaN;
    if (Number.isSafeInteger(sequence) && sequence > highest) {
      highest = sequence;
    }
  }
  return highest + 1;
}

export async function nextCodes(args: {
  seq: number;
  count: number;
  format: (sequence: number) => string;
  isOccupied?: (code: string) => boolean | Promise<boolean>;
  maxAttempts?: number;
}) {
  if (!Number.isSafeInteger(args.seq) || args.seq < 1) {
    throw new RangeError("Code sequence must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(args.count) || args.count < 0) {
    throw new RangeError("Code reservation count must be a non-negative integer.");
  }

  const maxAttempts =
    args.maxAttempts ?? args.count + CODE_SEQUENCE_COLLISION_BUDGET;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < args.count) {
    throw new RangeError(
      "Code reservation attempt budget must cover the requested count.",
    );
  }

  const codes: string[] = [];
  let nextSeq = args.seq;
  let attempts = 0;
  while (codes.length < args.count) {
    if (attempts >= maxAttempts || !Number.isSafeInteger(nextSeq)) {
      throw new CodeSequenceExhaustedError();
    }
    const code = args.format(nextSeq);
    nextSeq += 1;
    attempts += 1;
    if (!(await args.isOccupied?.(code))) {
      codes.push(code);
    }
  }

  return { codes, nextSeq };
}
