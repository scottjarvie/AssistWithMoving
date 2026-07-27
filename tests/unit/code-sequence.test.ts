import { describe, expect, it, vi } from "vitest";

import {
  CodeSequenceExhaustedError,
  formatBoxCode,
  legacySequenceSeed,
  nextCodes,
} from "../../convex/lib/codeSequence";
import { formatItemCode } from "../../convex/lib/moveFields";

describe("code sequence reservations", () => {
  it("returns monotonic codes and the next sequence", async () => {
    await expect(
      nextCodes({ seq: 7, count: 3, format: formatItemCode }),
    ).resolves.toEqual({
      codes: ["item-0007", "item-0008", "item-0009"],
      nextSeq: 10,
    });
  });

  it("reserves a whole batch in one helper call", async () => {
    const format = vi.fn(formatBoxCode);

    const reservation = await nextCodes({ seq: 12, count: 4, format });

    expect(reservation).toEqual({
      codes: ["B-012", "B-013", "B-014", "B-015"],
      nextSeq: 16,
    });
    expect(format).toHaveBeenCalledTimes(4);
  });

  it("skips occupied codes and advances beyond collisions", async () => {
    const occupied = new Set(["item-0003", "item-0005"]);

    await expect(
      nextCodes({
        seq: 3,
        count: 3,
        format: formatItemCode,
        isOccupied: async (code) => occupied.has(code),
      }),
    ).resolves.toEqual({
      codes: ["item-0004", "item-0006", "item-0007"],
      nextSeq: 8,
    });
  });

  it("preserves the existing item and box formats", async () => {
    await expect(
      nextCodes({ seq: 1, count: 2, format: formatItemCode }),
    ).resolves.toEqual({
      codes: ["item-0001", "item-0002"],
      nextSeq: 3,
    });
    await expect(
      nextCodes({ seq: 1, count: 2, format: formatBoxCode }),
    ).resolves.toEqual({
      codes: ["B-001", "B-002"],
      nextSeq: 3,
    });
  });

  it("seeds after the highest exact legacy code despite gaps", () => {
    expect(
      legacySequenceSeed(
        ["item-0001", "item-0009", "item-0004"],
        /^item-(\d+)$/,
      ),
    ).toBe(10);
    expect(legacySequenceSeed(["B-001", "B-008", "B-003"], /^B-(\d+)$/)).toBe(
      9,
    );
  });

  it("ignores manual and nonconforming legacy codes", () => {
    expect(
      legacySequenceSeed(
        ["ITEM-9999", "item-manual", "item-0012-extra", "item-0006"],
        /^item-(\d+)$/,
      ),
    ).toBe(7);
    expect(
      legacySequenceSeed(["T-999", "B-manual", "B-010-extra", "B-004"], /^B-(\d+)$/),
    ).toBe(5);
  });

  it("starts an empty legacy sequence at one", () => {
    expect(legacySequenceSeed([], /^item-(\d+)$/)).toBe(1);
  });

  it("does no occupancy work for a zero-count reservation", async () => {
    const isOccupied = vi.fn(async () => false);

    await expect(
      nextCodes({
        seq: 42,
        count: 0,
        format: formatItemCode,
        isOccupied,
      }),
    ).resolves.toEqual({ codes: [], nextSeq: 42 });
    expect(isOccupied).not.toHaveBeenCalled();
  });

  it("rejects invalid sequence and count inputs", async () => {
    await expect(
      nextCodes({ seq: 0, count: 1, format: formatItemCode }),
    ).rejects.toThrow(RangeError);
    await expect(
      nextCodes({ seq: 1, count: -1, format: formatItemCode }),
    ).rejects.toThrow(RangeError);
    await expect(
      nextCodes({ seq: 1, count: 1.5, format: formatItemCode }),
    ).rejects.toThrow(RangeError);
  });

  it("fails deterministically when the collision budget is exhausted", async () => {
    await expect(
      nextCodes({
        seq: 1,
        count: 2,
        format: formatBoxCode,
        isOccupied: async () => true,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(CodeSequenceExhaustedError);
  });
});
