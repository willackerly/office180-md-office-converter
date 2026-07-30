import { describe, expect, it, vi } from "vitest";

import { loadDeck } from "../core/deck.js";
import {
  preflightTextFit,
  textLineAvailableWidth,
  type PptvTextMeasurer,
  type PptvTextMeasurement,
} from "../core/text-fit.js";
import { resolvePptvDeck, type PptvResolvedDeck } from "../core/resolved.js";
import { readMinimalDeck } from "./test-helpers.js";

async function resolvedDeck(
  mutate: (source: string) => string = (source) => source,
): Promise<PptvResolvedDeck> {
  const deck = await loadDeck({
    kind: "text",
    text: mutate(await readMinimalDeck()),
  });
  const resolved = resolvePptvDeck(deck);
  expect(resolved.diagnostics).toEqual([]);
  if (resolved.model === undefined) throw new Error("Expected resolved deck");
  return resolved.model;
}

describe("C8 text-fit preflight", () => {
  it("computes start, middle, and end capacity from the actual line anchor", () => {
    const frame = { x: 100, y: 0, width: 500, height: 50 };

    expect(textLineAvailableWidth({ frame, anchor: "start" }, { x: 175 })).toBe(
      425,
    );
    expect(textLineAvailableWidth({ frame, anchor: "end" }, { x: 525 })).toBe(
      425,
    );
    expect(
      textLineAvailableWidth({ frame, anchor: "middle" }, { x: 250 }),
    ).toBe(300);
    expect(
      textLineAvailableWidth({ frame, anchor: "middle" }, { x: 350 }),
    ).toBe(500);
  });

  it("retains deck/object/line order and classifies verified measurements", async () => {
    const deck = await resolvedDeck();
    const widths = new Map<string, number>([
      ["cover.title", 100],
      ["cover.subtitle", 1_215],
      ["architecture.title", 1_401],
      ["architecture.node.client.title", 380],
    ]);
    const requests: string[] = [];
    const measurer: PptvTextMeasurer = (request) => {
      requests.push(request.objectId);
      if (request.objectId === "architecture.node.policy.title") {
        return {
          kind: "unverified",
          method: "fixture",
          reason: "face unavailable",
        };
      }
      return {
        kind: "measured",
        width: widths.get(request.objectId) ?? 0,
        method: "fixture",
        fontIdentity: "sha256:fixture",
      };
    };
    const before = JSON.stringify(deck);

    const result = preflightTextFit(deck, measurer);

    expect(requests).toEqual([
      "cover.title",
      "cover.subtitle",
      "architecture.title",
      "architecture.node.client.title",
      "architecture.node.policy.title",
    ]);
    expect(result.summary).toEqual({
      total: 5,
      clear: 1,
      nearLimit: 2,
      overflow: 1,
      unverified: 1,
    });
    expect(
      result.lines.map(({ objectId, status, availableWidth }) => [
        objectId,
        status,
        availableWidth,
      ]),
    ).toEqual([
      ["cover.title", "clear", 1360],
      ["cover.subtitle", "near-limit", 1350],
      ["architecture.title", "overflow", 1400],
      ["architecture.node.client.title", "near-limit", 380],
      ["architecture.node.policy.title", "unverified", 380],
    ]);
    expect(result.lines[2]).toMatchObject({
      measuredWidth: 1401,
      utilization: 1401 / 1400,
      overrun: 1,
      method: "fixture",
      fontIdentity: "sha256:fixture",
    });
    expect(JSON.stringify(deck)).toBe(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result.lines[0])).toBe(true);
    expect(Object.isFrozen(result.lines[0]?.font)).toBe(true);
  });

  it("uses local coordinates so ancestor group translation cannot change fit", async () => {
    const plain = await resolvedDeck();
    const translated = await resolvedDeck((source) =>
      source.replace(
        'id="architecture.node.client" class="diagram-node"\n       data-pptv-role',
        'id="architecture.node.client" class="diagram-node"\n       transform="translate(200 30)"\n       data-pptv-role',
      ),
    );
    const measure: PptvTextMeasurer = () => ({
      kind: "measured",
      width: 100,
      method: "fixture",
      fontIdentity: "fixture",
    });

    const plainLine = preflightTextFit(plain, measure).lines.find(
      ({ objectId }) => objectId === "architecture.node.client.title",
    );
    const translatedLine = preflightTextFit(translated, measure).lines.find(
      ({ objectId }) => objectId === "architecture.node.client.title",
    );

    expect(plainLine?.availableWidth).toBe(380);
    expect(translatedLine?.availableWidth).toBe(380);
    expect(translatedLine?.anchorX).toBe(plainLine?.anchorX);
  });

  it("reports exact capacity as near-limit and positive width at zero capacity as overflow", async () => {
    const deck = await resolvedDeck((source) =>
      source.replace('x="120" y="410">Minimal', 'x="1480" y="410">Minimal'),
    );
    const result = preflightTextFit(deck, (request) => ({
      kind: "measured",
      width: request.objectId === "cover.title" ? 10 : 0,
      method: "fixture",
      fontIdentity: "fixture",
    }));
    const zeroCapacity = result.lines.find(
      ({ objectId }) => objectId === "cover.title",
    );
    const zeroWidth = result.lines.find(
      ({ objectId }) => objectId === "cover.subtitle",
    );

    expect(zeroCapacity).toMatchObject({
      availableWidth: 0,
      status: "overflow",
      measuredWidth: 10,
      utilization: null,
      overrun: 10,
    });
    expect(zeroWidth).toMatchObject({
      status: "clear",
      measuredWidth: 0,
      utilization: 0,
      overrun: 0,
    });
  });

  it("supports a bounded custom near-limit threshold", async () => {
    const deck = await resolvedDeck();
    const measure: PptvTextMeasurer = () => ({
      kind: "measured",
      width: 700,
      method: "fixture",
      fontIdentity: "fixture",
    });

    expect(
      preflightTextFit(deck, measure, { nearLimit: 0.5 }).lines[0]?.status,
    ).toBe("near-limit");
    expect(() => preflightTextFit(deck, measure, { nearLimit: 0 })).toThrow(
      RangeError,
    );
    expect(() => preflightTextFit(deck, measure, { nearLimit: 1 })).toThrow(
      RangeError,
    );
    expect(() =>
      preflightTextFit(deck, measure, { nearLimit: Number.NaN }),
    ).toThrow(RangeError);
  });

  it("makes missing codepoints unverified and normalizes their evidence", async () => {
    const deck = await resolvedDeck();
    const result = preflightTextFit(deck, () => ({
      kind: "measured",
      width: 20,
      method: " exact-font ",
      fontIdentity: " face ",
      missingCodepoints: [0x1f680, 65, 0x1f680],
    }));

    expect(result.summary.unverified).toBe(result.summary.total);
    expect(result.lines[0]).toMatchObject({
      status: "unverified",
      method: "exact-font",
      fontIdentity: "face",
      missingCodepoints: [65, 0x1f680],
      reason: "The selected font does not cover every source codepoint.",
    });
  });

  it.each([
    {
      label: "non-finite width",
      measurement: {
        kind: "measured",
        width: Number.POSITIVE_INFINITY,
        method: "fixture",
        fontIdentity: "fixture",
      },
    },
    {
      label: "negative width",
      measurement: {
        kind: "measured",
        width: -1,
        method: "fixture",
        fontIdentity: "fixture",
      },
    },
    {
      label: "empty evidence",
      measurement: {
        kind: "measured",
        width: 1,
        method: "",
        fontIdentity: "",
      },
    },
    {
      label: "invalid codepoint",
      measurement: {
        kind: "measured",
        width: 1,
        method: "fixture",
        fontIdentity: "fixture",
        missingCodepoints: [0xd800],
      },
    },
    {
      label: "unknown kind",
      measurement: {
        kind: "guessed",
        width: 1,
        method: "fixture",
        fontIdentity: "fixture",
      },
    },
  ])(
    "turns an adversarial $label result into unverified",
    async ({ measurement }) => {
      const deck = await resolvedDeck();
      const result = preflightTextFit(
        deck,
        () => measurement as unknown as PptvTextMeasurement,
      );

      expect(result.summary.unverified).toBe(result.summary.total);
      expect(result.lines[0]).toMatchObject({
        status: "unverified",
        method: "invalid-measurer-result",
      });
    },
  );

  it("contains throwing measurers and result getters to each line", async () => {
    const deck = await resolvedDeck();
    const measurer = vi.fn(() => {
      throw new Error("font parser failed");
    });

    const result = preflightTextFit(deck, measurer);

    expect(measurer).toHaveBeenCalledTimes(5);
    expect(result.summary).toMatchObject({ total: 5, unverified: 5 });
    expect(result.lines[0]).toMatchObject({
      status: "unverified",
      method: "measurer-error",
      reason: "font parser failed",
    });

    const hostileResult = new Proxy({} as PptvTextMeasurement, {
      get() {
        throw new Error("hostile result getter");
      },
    });
    const hostileMeasurer = vi.fn(() => hostileResult);
    const hostile = preflightTextFit(deck, hostileMeasurer);

    expect(hostileMeasurer).toHaveBeenCalledTimes(5);
    expect(hostile.summary).toMatchObject({ total: 5, unverified: 5 });
    expect(hostile.lines[0]).toMatchObject({
      status: "unverified",
      method: "measurer-error",
      reason: "hostile result getter",
    });
  });
});
