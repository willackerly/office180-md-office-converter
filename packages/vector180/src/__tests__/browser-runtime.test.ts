// Tests: CONTRACT:C4-PPTV-SOURCE.2.0
// Tests: CONTRACT:C6-PPTV-RESOLVED.2.0

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { inspectVector180Conformance } from "../browser/runtime.js";
import { readMinimalDeck } from "./test-helpers.js";

const KITCHEN_SINK_URL = new URL(
  "../../test-fixtures/c6/kitchen-sink.vector180.svg",
  import.meta.url,
);
const INVALID_PROFILE_URL = new URL(
  "../../test-fixtures/c6/invalid-profile.vector180.svg",
  import.meta.url,
);

describe("shared browser conformance runtime", () => {
  it("normalizes the representative HTML deck to immutable C4/C6 JSON", async () => {
    const source = await readMinimalDeck();
    const result = await inspectVector180Conformance({
      kind: "text",
      text: source,
      name: "minimal-deck.vector180.html",
    });

    expect(result).toMatchObject({
      schema: "vector180-browser-conformance/0.1",
      scan: {
        kind: "html",
        source: {
          name: "minimal-deck.vector180.html",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
      },
      c4: {
        sourceKind: "html",
        slideOrder: ["cover", "architecture"],
      },
      c4Diagnostics: [],
      c6: {
        schema: "vector180-resolved-deck/0.1",
      },
      c6Diagnostics: [],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.c6)).toBe(true);
  });

  it("normalizes arbitrary-viewBox standalone diagram semantics without slide identity", async () => {
    const source = await readFile(KITCHEN_SINK_URL, "utf8");
    const result = await inspectVector180Conformance({
      kind: "bytes",
      bytes: new TextEncoder().encode(source),
      name: "kitchen-sink.vector180.svg",
    });

    expect(result).toMatchObject({
      scan: { kind: "svg" },
      c4: {
        sourceKind: "svg",
        id: "conformance",
        viewBox: [-20, 10, 960, 640],
      },
      c4Diagnostics: [],
      c6: {
        schema: "vector180-resolved-atom/0.1",
        canvas: { viewBox: [-20, 10, 960, 640] },
      },
      c6Diagnostics: [],
    });
    expect(JSON.stringify(result.c4)).not.toContain("slideId");
    expect(JSON.stringify(result.c6)).not.toContain("slideId");
  });

  it("retains stable invalid-profile diagnostics and no C6 model", async () => {
    const source = await readFile(INVALID_PROFILE_URL, "utf8");
    const result = await inspectVector180Conformance({
      kind: "text",
      text: source,
      name: "invalid-profile.vector180.svg",
    });

    expect(result.scan).toMatchObject({ kind: "svg" });
    expect(result.c4).not.toBeNull();
    expect(result.c6).toBeNull();
    expect(result.c6Diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "VECTOR180-PROFILE-STYLE",
        "VECTOR180-PROFILE-INVALID-BASE",
      ]),
    );
  });
});
