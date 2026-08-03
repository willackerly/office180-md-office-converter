// Tests: CONTRACT:C4-PPTV-SOURCE.2.0
// Tests: CONTRACT:C6-PPTV-RESOLVED.2.0

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  atomIsValid,
  loadDeck,
  loadAtom,
  loadVector180Document,
  Vector180LoadError,
} from "../core/deck.js";
import {
  resolveVector180Atom,
  type Vector180ResolvedAtomObject,
} from "../core/resolved.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

const MINIMAL_ATOM_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);

async function readMinimalAtom(): Promise<string> {
  return readFile(MINIMAL_ATOM_URL, "utf8");
}

function findObject(
  objects: readonly Vector180ResolvedAtomObject[],
  id: string,
): Vector180ResolvedAtomObject | undefined {
  for (const object of objects) {
    if (object.id === id) return object;
    if (object.kind === "group") {
      const descendant = findObject(object.children, id);
      if (descendant !== undefined) return descendant;
    }
  }
  return undefined;
}

async function rejectedCodes(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Vector180LoadError);
    return errorCodes((error as Vector180LoadError).diagnostics);
  }
  throw new Error("Expected Vector180 load to reject");
}

describe("standalone Vector180 atom core", () => {
  it("loads a first-class atom without synthesizing deck control planes", async () => {
    const source = await readMinimalAtom();
    const atom = await loadAtom({
      kind: "text",
      text: source,
      name: "renamed.vector180.svg",
    });

    expect(errorCodes(atom.diagnostics)).toEqual([]);
    expect(atomIsValid(atom)).toBe(true);
    expect(atom).toMatchObject({
      sourceKind: "svg",
      wireFamily: "vector180",
      version: "0.1",
      id: "system-overview",
      viewBox: [-100, -50, 1200, 800],
    });
    expect("manifest" in atom).toBe(false);
    expect("slides" in atom).toBe(false);
    expect("themes" in atom).toBe(false);
    expect("activeTheme" in atom).toBe(false);
    expect(atom.index.root.objectIds).toEqual([
      "system-overview.background",
      "system-overview.title",
      "system-overview.flow",
      "system-overview.client",
      "system-overview.client.panel",
      "system-overview.client.label",
      "system-overview.service",
      "system-overview.service.panel",
      "system-overview.service.label",
    ]);
    expect(
      [...atom.index.objects.values()].every(
        (object) =>
          object.atomId === "system-overview" && !("slideId" in object),
      ),
    ).toBe(true);
    expect(Object.isFrozen(atom)).toBe(true);
    expect(Object.isFrozen(atom.children)).toBe(true);
    expect(() =>
      (atom.index.root.attributeRanges as Map<string, unknown>).set("id", {}),
    ).toThrow();
    expect(atom.source.text).toBe(source);
  });

  it("dispatches a browser-safe document union while loadDeck stays HTML-only", async () => {
    const atom = await loadVector180Document({
      kind: "bytes",
      bytes: new TextEncoder().encode(await readMinimalAtom()),
    });
    const deck = await loadVector180Document({
      kind: "text",
      text: await readMinimalDeck(),
    });

    expect(atom.sourceKind).toBe("svg");
    expect(deck.sourceKind).toBe("html");
    if (atom.sourceKind === "svg") {
      expect(atom.id).toBe("system-overview");
    }
    if (deck.sourceKind === "html") {
      expect(deck.slideOrder).toEqual(["cover", "architecture"]);
    }

    const codes = await rejectedCodes(
      loadDeck({
        kind: "text",
        text: await readMinimalAtom(),
      }),
    );
    expect(codes).toContain("VECTOR180-DOCUMENT-KIND");
  });

  it("indexes each deck template and exact root SVG subtree independently", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const cover = deck.index.slides.get("cover");
    const viewBoxRange = cover?.attributeRanges.get("viewBox");

    expect(source.slice(cover?.range.charStart, cover?.range.charEnd)).toMatch(
      /^<template data-vector180-slide="cover">/u,
    );
    expect(
      source.slice(cover?.svgRange.charStart, cover?.svgRange.charEnd),
    ).toMatch(/^<svg id="cover"/u);
    expect(source.slice(viewBoxRange?.charStart, viewBoxRange?.charEnd)).toBe(
      'viewBox="0 0 1600 900"',
    );
    expect(cover?.openTagRange.charStart).toBe(cover?.svgRange.charStart);
  });

  it("resolves arbitrary-origin geometry and exact hard text without slide identity", async () => {
    const atom = await loadAtom({
      kind: "text",
      text: await readMinimalAtom(),
    });
    const result = resolveVector180Atom(atom);

    expect(result.diagnostics).toEqual([]);
    expect(result.model).toMatchObject({
      schema: "vector180-resolved-atom/0.1",
      sourceWireFamily: "vector180",
      sourceSha256: atom.source.sha256,
      atomId: "system-overview",
      metadata: {
        value: {
          styleFamily: {
            id: "office180.minimal",
            version: "1.0",
          },
        },
        metadataSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      stylePaletteSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      canvas: { viewBox: [-100, -50, 1200, 800] },
    });
    expect(result.model?.objects.map((object) => object.id)).toEqual([
      "system-overview.background",
      "system-overview.title",
      "system-overview.flow",
      "system-overview.client",
      "system-overview.service",
    ]);

    const title = findObject(
      result.model?.objects ?? [],
      "system-overview.title",
    );
    expect(title).toMatchObject({
      kind: "text",
      atomId: "system-overview",
      frame: { x: -40, y: 10, width: 1080, height: 70 },
      lines: [{ text: "Standalone Vector180 diagram", x: -40, y: 58 }],
      wrap: "none",
      autofit: "none",
      style: {
        fill: "#17211e",
        fontFamily: "ABeeZee",
        fontSize: 36,
        fontWeight: 400,
      },
    });
    expect(
      findObject(result.model?.objects ?? [], "system-overview.client.panel"),
    ).toMatchObject({
      atomId: "system-overview",
      worldBounds: { x: 0, y: 240, width: 340, height: 180 },
    });
    expect(JSON.stringify(result.model)).not.toContain("slideId");
    expect(JSON.stringify(result.model)).not.toContain("activeTheme");
    expect(JSON.stringify(result.model)).not.toContain("Emu");
    expect(JSON.stringify(result.model)).not.toContain("emuPerUnit");
    expect(Object.isFrozen(result.model)).toBe(true);
    expect(Object.isFrozen(result.model?.objects)).toBe(true);
  });

  it("requires explicit root identity, version, namespace, and finite viewBox", async () => {
    const source = await readMinimalAtom();
    const cases: Array<[string, string, string]> = [
      [
        "id",
        source.replace(' id="system-overview"', ""),
        "VECTOR180-ATOM-ROOT",
      ],
      [
        "version",
        source.replace(
          'data-vector180-version="0.1"',
          'data-vector180-version="1"',
        ),
        "VECTOR180-ATOM-ROOT",
      ],
      [
        "namespace",
        source.replace('     xmlns="http://www.w3.org/2000/svg"', ""),
        "VECTOR180-ATOM-ROOT",
      ],
      [
        "viewBox",
        source.replace(
          'viewBox="-100 -50 1200 800"',
          'viewBox="-100 -50 Infinity 800"',
        ),
        "VECTOR180-SVG-VIEWBOX",
      ],
    ];

    for (const [name, invalid, code] of cases) {
      const codes = await rejectedCodes(
        loadAtom({
          kind: "text",
          text: invalid,
          name: `${name}-would-be-identity.vector180.svg`,
        }),
      );
      expect(codes, name).toContain(code);
    }
  });

  it("rejects class and style-element authority but accepts local inline style", async () => {
    const source = await readMinimalAtom();
    const withClass = source.replace(
      'fill="#f7f9fc"',
      'class="background" fill="#f7f9fc"',
    );
    const withStyleElement = source.replace(
      "  <title>Minimal Vector180 diagram</title>",
      "  <style>rect { fill: red; }</style>\n  <title>Minimal Vector180 diagram</title>",
    );
    const withVar = source.replace(
      'fill="#f7f9fc"',
      'style="--surface: #f7f9fc; fill: var(--surface)"',
    );

    const classAtom = await loadAtom({
      kind: "text",
      text: withClass,
    });
    const styleAtom = await loadAtom({
      kind: "text",
      text: withStyleElement,
    });
    const varAtom = await loadAtom({
      kind: "text",
      text: withVar,
    });
    const validAtom = await loadAtom({
      kind: "text",
      text: source,
    });

    expect(errorCodes(classAtom.diagnostics)).toContain("VECTOR180-ATOM-STYLE");
    expect(errorCodes(styleAtom.diagnostics)).toContain("VECTOR180-ATOM-STYLE");
    expect(errorCodes(varAtom.diagnostics)).toContain("VECTOR180-ATOM-STYLE");
    expect(errorCodes(resolveVector180Atom(classAtom).diagnostics)).toContain(
      "VECTOR180-PROFILE-STYLE",
    );
    expect(atomIsValid(classAtom)).toBe(false);
    expect(atomIsValid(styleAtom)).toBe(false);
    expect(atomIsValid(varAtom)).toBe(false);
    expect(errorCodes(validAtom.diagnostics)).toEqual([]);
  });

  it("fails resolution when native text lacks explicit font authority", async () => {
    const source = (await readMinimalAtom()).replace(
      " font-family: ABeeZee;",
      "",
    );
    const atom = await loadAtom({ kind: "text", text: source });
    const result = resolveVector180Atom(atom);

    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("VECTOR180-PROFILE-FONT");
  });
});
