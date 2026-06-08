import { describe, expect, it } from "vitest";

import {
  publicPacketDisclosure,
  publicPacketKindForProfileType,
  publicPacketProfileTypes,
  publicPacketTitleForProfileType,
} from "../../convex/lib/publicPackets";

describe("public documentation packet helpers", () => {
  it("maps recipient-shareable profile types to public packet kinds", () => {
    expect(publicPacketProfileTypes).toEqual([
      "pcsMove",
      "movingCompany",
      "loadCrew",
      "employerRelocation",
      "insuranceClaim",
    ]);
    expect(publicPacketKindForProfileType("pcsMove")).toBe("pcs");
    expect(publicPacketKindForProfileType("movingCompany")).toBe("movingCompany");
    expect(publicPacketKindForProfileType("loadCrew")).toBe("loadCrew");
    expect(publicPacketKindForProfileType("employerRelocation")).toBe("employer");
    expect(publicPacketKindForProfileType("insuranceClaim")).toBe("claim");
    expect(publicPacketKindForProfileType("personalFullRecord")).toBe(null);
  });

  it("uses recipient-facing titles", () => {
    expect(publicPacketTitleForProfileType("pcsMove")).toBe(
      "PCS support packet"
    );
    expect(publicPacketTitleForProfileType("insuranceClaim")).toBe(
      "Insurance / claims packet"
    );
    expect(publicPacketTitleForProfileType("personalFullRecord")).toBe(
      "Documentation packet"
    );
  });

  it("keeps values and serial fields hidden except for claim evidence packets", () => {
    expect(publicPacketDisclosure("movingCompany")).toMatchObject({
      valuesHidden: true,
      serialsHidden: true,
    });
    expect(publicPacketDisclosure("pcsMove").reason).toContain(
      "owner-only values"
    );
    expect(publicPacketDisclosure("insuranceClaim")).toMatchObject({
      valuesHidden: false,
      serialsHidden: false,
    });
  });
});
