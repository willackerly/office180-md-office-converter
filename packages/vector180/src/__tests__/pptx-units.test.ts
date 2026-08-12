// Tests: CONTRACT:C7-PPTX-CANARY.2.0, CONTRACT:C9-PPTV-PPTX-BASELINE.2.0

import { describe, expect, it } from "vitest";

import { scaleOoxmlInteger } from "../node/pptx-units.js";

describe("OOXML integer scaling", () => {
  it("accepts only one-ULP representation residue around exact unit values", () => {
    expect((16_000 / 60) * 60).toBe(16_000.000000000002);
    expect(scaleOoxmlInteger(16_000 / 60, 60)).toBe(16_000);

    expect((239 / 7_620) * 7_620).toBe(239.00000000000003);
    expect(scaleOoxmlInteger(239 / 7_620, 7_620)).toBe(239);
  });

  it("does not round genuinely fractional font or EMU mappings", () => {
    expect(scaleOoxmlInteger(96.01, 60)).toBeUndefined();
    expect(scaleOoxmlInteger(0.0001, 7_620)).toBeUndefined();
    expect(scaleOoxmlInteger(Number.POSITIVE_INFINITY, 60)).toBeUndefined();
  });
});
