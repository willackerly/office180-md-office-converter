// Tests: CONTRACT:C5-PPTV-PATCH.1.3

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import { getObject } from "../ops/projections.js";
import {
  errorCodes,
  readMinimalDeck,
  runtimeSource,
  themeSource,
} from "./test-helpers.js";

describe("PPTV atomic preserve patches", () => {
  it("changes only direct text and escapes it safely", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "architecture.node.policy.title",
          oldText: "Policy service",
          value: "Policy & authorization",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.sourceText).toBe(
      source.replace(
        ">Policy service</text>",
        ">Policy &amp; authorization</text>",
      ),
    );
    expect(
      getObject(result.deck!, "architecture.node.policy.title")?.text,
    ).toBe("Policy & authorization");
    expect(runtimeSource(result.sourceText!)).toBe(runtimeSource(source));
    expect(themeSource(result.sourceText!, "dark")).toBe(
      themeSource(source, "dark"),
    );
  });

  it("switches the active theme without touching either theme or runtime block", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-active-theme", theme: "dark", oldTheme: "light" }],
    });

    expect(result.applied).toBe(true);
    expect(result.deck?.activeTheme).toBe("dark");
    expect(themeSource(result.sourceText!, "light")).toBe(
      themeSource(source, "light"),
    );
    expect(themeSource(result.sourceText!, "dark")).toBe(
      themeSource(source, "dark"),
    );
    expect(runtimeSource(result.sourceText!)).toBe(runtimeSource(source));
  });

  it("reorders object-form manifest entries as a metadata-preserving permutation", async () => {
    const source = (await readMinimalDeck()).replace(
      '    "cover",',
      '    {"id": "cover", "layout": "hero", "hidden": false},',
    );
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-slide-order",
          oldOrder: ["cover", "architecture"],
          order: ["architecture", "cover"],
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.deck?.slideOrder).toEqual(["architecture", "cover"]);
    expect(result.deck?.manifest.slides[1]).toEqual({
      id: "cover",
      layout: "hero",
      hidden: false,
    });
    expect(runtimeSource(result.sourceText!)).toBe(runtimeSource(source));
  });

  it("rejects stale, failed-precondition, and non-permutation transactions", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const stale = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: "0".repeat(64),
      ops: [{ op: "set-text", id: "cover.title", value: "Changed" }],
    });
    const precondition = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "cover.title",
          oldText: "Wrong",
          value: "Changed",
        },
      ],
    });
    const order = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-slide-order", order: ["cover", "cover"] }],
    });

    expect(errorCodes(stale.diagnostics)).toContain("PPTV-PATCH-STALE");
    expect(errorCodes(precondition.diagnostics)).toContain(
      "PPTV-PATCH-PRECONDITION",
    );
    expect(errorCodes(order.diagnostics)).toContain("PPTV-PATCH-SCHEMA");
    expect(stale.sourceText).toBeUndefined();
    expect(precondition.sourceText).toBeUndefined();
    expect(order.sourceText).toBeUndefined();
  });

  it("rejects operation identifiers outside the stable-ID grammar", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const diagnostics = await validatePatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-text", id: "../cover.title", value: "Changed" }],
    });

    expect(errorCodes(diagnostics)).toContain("PPTV-PATCH-SCHEMA");
  });

  it("aligns timestamp and unique-order checks with the published schema", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const diagnostics = await validatePatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      timestamp: "2026-02-30 12:00",
      ops: [{ op: "set-slide-order", order: ["cover", "cover"] }],
    });

    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === "PPTV-PATCH-SCHEMA",
      ),
    ).toHaveLength(2);
  });

  it("rejects an empty slide-order operation at the decoder boundary", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const diagnostics = await validatePatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-slide-order", order: [] }],
    });

    expect(errorCodes(diagnostics)).toContain("PPTV-PATCH-SCHEMA");
  });

  it("rejects a mixed valid/invalid transaction without returning partial edits", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        { op: "set-text", id: "cover.title", value: "Would be valid" },
        { op: "set-text", id: "missing.object", value: "Invalid" },
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.edits).toEqual([]);
    expect(result.affectedIds).toEqual([]);
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PATCH-TARGET");
  });

  it("detects intersecting operation ranges before editing", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const diagnostics = await validatePatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        { op: "set-text", id: "cover.title", value: "One" },
        { op: "set-text", id: "cover.title", value: "Two" },
      ],
    });

    expect(errorCodes(diagnostics)).toContain("PPTV-PATCH-OVERLAP");
  });

  it("preserves a leading BOM through a surgical patch", async () => {
    const source = `\uFEFF${await readMinimalDeck()}`;
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-text", id: "cover.title", value: "BOM survives" }],
    });

    expect(result.applied).toBe(true);
    expect(result.sourceText?.codePointAt(0)).toBe(0xfeff);
    expect(result.deck?.source.bytes.slice(0, 3)).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    );
  });

  it("rejects mixed tspan content until the rich-text contract exists", async () => {
    const source = (await readMinimalDeck()).replace(
      ">Policy service</text>",
      "><tspan>Policy</tspan> service</text>",
    );
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "architecture.node.policy.title",
          value: "No flattening",
        },
      ],
    });

    expect(result.applied).toBe(false);
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PATCH-UNSAFE-RANGE");
  });

  it("rejects set-text across an opaque text boundary", async () => {
    const source = (await readMinimalDeck()).replace(
      'id="cover.title" class="cover-title"\n          data-pptv-role="text" data-pptv-export="native"',
      'id="cover.title" class="cover-title"\n          data-pptv-role="text" data-pptv-export="svg"',
    );
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-text", id: "cover.title", value: "Not editable" }],
    });

    expect(result.applied).toBe(false);
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PATCH-UNSAFE-RANGE");
  });

  it("preserves direct text whitespace exactly across patch reload", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const value = "  spaced   title\u00a0 ";
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-text", id: "cover.title", value }],
    });

    expect(result.applied).toBe(true);
    expect(getObject(result.deck!, "cover.title")?.text).toBe(value);
    expect(result.sourceText).toContain(`>${value}</text>`);
  });

  it("can fill an empty direct-text element without rewriting its tag", async () => {
    const source = (await readMinimalDeck()).replace(
      ">Policy service</text>",
      "></text>",
    );
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "architecture.node.policy.title",
          oldText: "",
          value: "Restored",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.sourceText).toBe(
      source.replace("></text>", ">Restored</text>"),
    );
  });

  it("rejects two insertions at the same empty text range", async () => {
    const source = (await readMinimalDeck()).replace(
      ">Policy service</text>",
      "></text>",
    );
    const deck = await loadDeck({ kind: "text", text: source });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        { op: "set-text", id: "architecture.node.policy.title", value: "A" },
        { op: "set-text", id: "architecture.node.policy.title", value: "B" },
      ],
    });

    expect(result.applied).toBe(false);
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PATCH-OVERLAP");
  });

  it("reconstructs a trusted snapshot before resolving patch ranges", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const title = deck.index.objects.get("cover.title");
    const subtitle = deck.index.objects.get("cover.subtitle");
    expect(Object.isFrozen(title)).toBe(true);
    const forgedObjects = new Map(deck.index.objects);
    forgedObjects.set("cover.title", {
      ...title!,
      directTextRange: subtitle!.directTextRange!,
    });
    const forgedDeck = {
      ...deck,
      index: { ...deck.index, objects: forgedObjects },
    } as typeof deck;

    const result = await applyPatch(forgedDeck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [{ op: "set-text", id: "cover.title", value: "Trusted target" }],
    });

    expect(result.applied).toBe(true);
    expect(result.deck?.slides.get("cover")?.children[1]?.text).toBe(
      "Trusted target",
    );
    expect(result.deck?.slides.get("cover")?.children[2]?.text).toBe(
      "Manifest first. Slides declarative. Theme last.",
    );
  });
});
