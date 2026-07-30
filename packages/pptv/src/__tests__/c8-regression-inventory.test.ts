// Tests: CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const INVENTORY_URL = new URL(
  "../../test-fixtures/c8/tdflite-text-fit-inventory.json",
  import.meta.url,
);

describe("private worked-deck C8 inventory lock", () => {
  it("retains a content- and font-hash-bound summary without private bytes", async () => {
    const inventory = JSON.parse(
      await readFile(INVENTORY_URL, "utf8"),
    ) as Inventory;

    expect(inventory.schema).toBe("pptv-private-text-fit-inventory/0.1");
    expect(inventory.source.visibility).toBe("private");
    expect(inventory.source.vendored).toBe(false);
    expect(inventory.source.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(inventory.source.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(inventory.measurement.adapter).toBe("fontkit/2.0.4");
    expect(inventory.measurement.nearLimit).toBe(0.95);
    expect(
      Object.values(inventory.measurement.summary).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(inventory.measurement.hardLines);
    expect(inventory.measurement.summary).toEqual({
      clear: 122,
      nearLimit: 10,
      overflow: 21,
      unverified: 0,
    });
    expect(inventory.measurement.fontFaces).toHaveLength(4);
    expect(
      new Set(
        inventory.measurement.fontFaces.map(
          ({ family, weight, style }) => `${family}/${weight}/${style}`,
        ),
      ).size,
    ).toBe(4);
    for (const face of inventory.measurement.fontFaces) {
      expect(face.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(inventory.browserObservation).toMatchObject({
      status: "informational-unverified-substitution",
      overflow: 18,
      selectedFontIdentityCaptured: false,
    });
    expect(inventory.reproduction).toEqual({
      requiresPrivateSource: true,
      requiresSeparatelyLicensedFontBytes: true,
      sourceAndFontBytesMustNotBeVendored: true,
    });
  });
});

interface Inventory {
  schema: string;
  source: {
    visibility: string;
    commit: string;
    sha256: string;
    vendored: boolean;
  };
  measurement: {
    adapter: string;
    nearLimit: number;
    hardLines: number;
    summary: Record<"clear" | "nearLimit" | "overflow" | "unverified", number>;
    fontFaces: Array<{
      family: string;
      weight: number;
      style: string;
      sha256: string;
    }>;
  };
  browserObservation: {
    status: string;
    overflow: number;
    selectedFontIdentityCaptured: boolean;
  };
  reproduction: {
    requiresPrivateSource: boolean;
    requiresSeparatelyLicensedFontBytes: boolean;
    sourceAndFontBytesMustNotBeVendored: boolean;
  };
}
