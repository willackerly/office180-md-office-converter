// Tests: CONTRACT:C4-PPTV-SOURCE.1.1
// Tests: CONTRACT:C6-PPTV-RESOLVED.1.1

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  diagramIsValid,
  loadDeck,
  loadDiagram,
  loadPptvDocument,
  PptvLoadError,
} from "../core/deck.js";
import {
  resolvePptvDiagram,
  type PptvResolvedDiagramObject,
} from "../core/resolved.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
  import.meta.url,
);

async function readMinimalDiagram(): Promise<string> {
  return readFile(MINIMAL_DIAGRAM_URL, "utf8");
}

function findObject(
  objects: readonly PptvResolvedDiagramObject[],
  id: string,
): PptvResolvedDiagramObject | undefined {
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
    expect(error).toBeInstanceOf(PptvLoadError);
    return errorCodes((error as PptvLoadError).diagnostics);
  }
  throw new Error("Expected PPTV load to reject");
}

describe("standalone PPTV diagram core", () => {
  it("loads a first-class diagram without synthesizing deck control planes", async () => {
    const source = await readMinimalDiagram();
    const diagram = await loadDiagram({
      kind: "text",
      text: source,
      name: "renamed.pptv.svg",
    });

    expect(errorCodes(diagram.diagnostics)).toEqual([]);
    expect(diagramIsValid(diagram)).toBe(true);
    expect(diagram).toMatchObject({
      sourceKind: "svg",
      version: "0.1",
      id: "system-overview",
      viewBox: [-100, -50, 1200, 800],
    });
    expect("manifest" in diagram).toBe(false);
    expect("slides" in diagram).toBe(false);
    expect("themes" in diagram).toBe(false);
    expect("activeTheme" in diagram).toBe(false);
    expect(diagram.index.root.objectIds).toEqual([
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
      [...diagram.index.objects.values()].every(
        (object) =>
          object.diagramId === "system-overview" && !("slideId" in object),
      ),
    ).toBe(true);
    expect(Object.isFrozen(diagram)).toBe(true);
    expect(Object.isFrozen(diagram.children)).toBe(true);
    expect(() =>
      (diagram.index.root.attributeRanges as Map<string, unknown>).set(
        "id",
        {},
      ),
    ).toThrow();
    expect(diagram.source.text).toBe(source);
  });

  it("dispatches a browser-safe document union while loadDeck stays HTML-only", async () => {
    const diagram = await loadPptvDocument({
      kind: "bytes",
      bytes: new TextEncoder().encode(await readMinimalDiagram()),
    });
    const deck = await loadPptvDocument({
      kind: "text",
      text: await readMinimalDeck(),
    });

    expect(diagram.sourceKind).toBe("svg");
    expect(deck.sourceKind).toBe("html");
    if (diagram.sourceKind === "svg") {
      expect(diagram.id).toBe("system-overview");
    }
    if (deck.sourceKind === "html") {
      expect(deck.slideOrder).toEqual(["cover", "architecture"]);
    }

    const codes = await rejectedCodes(
      loadDeck({
        kind: "text",
        text: await readMinimalDiagram(),
      }),
    );
    expect(codes).toContain("PPTV-DOCUMENT-KIND");
  });

  it("indexes each deck template and exact root SVG subtree independently", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const cover = deck.index.slides.get("cover");
    const viewBoxRange = cover?.attributeRanges.get("viewBox");

    expect(source.slice(cover?.range.charStart, cover?.range.charEnd)).toMatch(
      /^<template data-pptv-slide="cover">/u,
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
    const diagram = await loadDiagram({
      kind: "text",
      text: await readMinimalDiagram(),
    });
    const result = resolvePptvDiagram(diagram);

    expect(result.diagnostics).toEqual([]);
    expect(result.model).toMatchObject({
      schema: "pptv-resolved-diagram/0.1",
      sourceSha256: diagram.source.sha256,
      id: "system-overview",
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
      diagramId: "system-overview",
      frame: { x: -40, y: 10, width: 1080, height: 70 },
      lines: [{ text: "Standalone PPTV diagram", x: -40, y: 58 }],
      wrap: "none",
      autofit: "none",
      style: {
        fill: "#17211e",
        fontFamily: "Arial",
        fontSize: 36,
        fontWeight: 700,
      },
    });
    expect(
      findObject(result.model?.objects ?? [], "system-overview.client.panel"),
    ).toMatchObject({
      diagramId: "system-overview",
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
    const source = await readMinimalDiagram();
    const cases: Array<[string, string, string]> = [
      [
        "id",
        source.replace(' id="system-overview"', ""),
        "PPTV-DIAGRAM-ROOT-ID",
      ],
      [
        "version",
        source.replace('data-pptv-version="0.1"', 'data-pptv-version="1"'),
        "PPTV-DIAGRAM-ROOT-VERSION",
      ],
      [
        "namespace",
        source.replace('     xmlns="http://www.w3.org/2000/svg"', ""),
        "PPTV-DIAGRAM-ROOT-NAMESPACE",
      ],
      [
        "viewBox",
        source.replace(
          'viewBox="-100 -50 1200 800"',
          'viewBox="-100 -50 Infinity 800"',
        ),
        "PPTV-SVG-VIEWBOX",
      ],
    ];

    for (const [name, invalid, code] of cases) {
      const codes = await rejectedCodes(
        loadDiagram({
          kind: "text",
          text: invalid,
          name: `${name}-would-be-identity.pptv.svg`,
        }),
      );
      expect(codes, name).toContain(code);
    }
  });

  it("rejects class and style-element authority but accepts local inline style", async () => {
    const source = await readMinimalDiagram();
    const withClass = source.replace(
      'fill="#f7f9fc"',
      'class="background" fill="#f7f9fc"',
    );
    const withStyleElement = source.replace(
      "  <title>Minimal PPTV diagram</title>",
      "  <style>rect { fill: red; }</style>\n  <title>Minimal PPTV diagram</title>",
    );
    const withVar = source.replace(
      'fill="#f7f9fc"',
      'style="--surface: #f7f9fc; fill: var(--surface)"',
    );

    const classDiagram = await loadDiagram({
      kind: "text",
      text: withClass,
    });
    const styleDiagram = await loadDiagram({
      kind: "text",
      text: withStyleElement,
    });
    const varDiagram = await loadDiagram({
      kind: "text",
      text: withVar,
    });
    const validDiagram = await loadDiagram({
      kind: "text",
      text: source,
    });

    expect(errorCodes(classDiagram.diagnostics)).toContain(
      "PPTV-DIAGRAM-STYLE",
    );
    expect(errorCodes(styleDiagram.diagnostics)).toContain(
      "PPTV-DIAGRAM-STYLE",
    );
    expect(errorCodes(varDiagram.diagnostics)).toContain("PPTV-DIAGRAM-STYLE");
    expect(errorCodes(resolvePptvDiagram(classDiagram).diagnostics)).toContain(
      "PPTV-PROFILE-DIAGRAM-STYLE",
    );
    expect(diagramIsValid(classDiagram)).toBe(false);
    expect(diagramIsValid(styleDiagram)).toBe(false);
    expect(diagramIsValid(varDiagram)).toBe(false);
    expect(errorCodes(validDiagram.diagnostics)).toEqual([]);
  });

  it("fails resolution when native text lacks explicit font authority", async () => {
    const source = (await readMinimalDiagram()).replace(
      " font-family: Arial;",
      "",
    );
    const diagram = await loadDiagram({ kind: "text", text: source });
    const result = resolvePptvDiagram(diagram);

    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PROFILE-FONT");
  });
});
