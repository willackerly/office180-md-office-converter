// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C6-PPTV-RESOLVED.1.1

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import { extractPptvDiagram } from "../core/extract.js";
import {
  resolvePptvDeck,
  resolvePptvDiagram,
  type PptvResolvedDiagramObject,
  type PptvResolvedObject,
} from "../core/resolved.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("deck-slide diagram extraction", () => {
  it("hydrates deck CSS/theme values into a standalone diagram atom", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
      name: "minimal-deck.pptv.html",
    });

    const first = await extractPptvDiagram(deck, "architecture");
    const second = await extractPptvDiagram(deck, "architecture");

    expect(first.diagnostics).toEqual([]);
    expect(first.sourceText).toBe(second.sourceText);
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.diagram).toBeDefined();
    expect(first.diagram?.sourceKind).toBe("svg");
    expect(first.diagram?.id).toBe("architecture");
    expect(first.provenance).toEqual({
      method: "pptv-slide-hydration/0.1",
      sourceDeckSha256: deck.source.sha256,
      sourceSlideId: "architecture",
      activeTheme: "light",
    });

    const source = first.sourceText!;
    expect(source).toMatch(/^<svg id="architecture"/u);
    expect(source).toContain('data-pptv-version="0.1"');
    expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(source).not.toContain("xmlns:xlink");
    expect(source).not.toContain("<template");
    expect(source).not.toContain("data-pptv-layout");
    expect(source).not.toMatch(/\bclass\s*=/u);
    expect(source).not.toContain("var(");
    expect(source).toContain(
      'style="fill:#17211e;stroke:none;stroke-width:1;opacity:1;',
    );
    expect(first.diagram?.index.objects.has("architecture.node.client")).toBe(
      true,
    );

    const deckModel = resolvePptvDeck(deck).model;
    const diagramModel = resolvePptvDiagram(first.diagram!).model;
    expect(deckModel).toBeDefined();
    expect(diagramModel).toBeDefined();
    const sourceSlide = deckModel?.slides.find(
      (slide) => slide.id === "architecture",
    );
    expect(normalizeDeckObjects(sourceSlide?.objects ?? [])).toEqual(
      normalizeDiagramObjects(diagramModel?.objects ?? []),
    );
  });

  it("fails without emitting partial source when the slide is absent", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });

    const result = await extractPptvDiagram(deck, "missing");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagram).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "PPTV-EXTRACT-SLIDE",
    ]);
  });

  it("declares the standard XLink namespace when opaque source retains a fragment reference", async () => {
    const source = insertBeforeCoverTitle(
      await readMinimalDeck(),
      `    <g id="cover.asset"
       data-pptv-role="asset" data-pptv-export="svg"
       data-pptv-bounds="200 200 100 100">
      <defs><path id="cover.asset.path" d="M0 0h100v100z"/></defs>
      <use xlink:href="#cover.asset.path"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolvePptvDeck(deck).model).toBeDefined();

    const result = await extractPptvDiagram(deck, "cover");

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceText).toContain(
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    expect(result.sourceText).toContain('xlink:href="#cover.asset.path"');
    expect(resolvePptvDiagram(result.diagram!).model).toBeDefined();
  });

  it("quotes concrete font families so declaration punctuation survives hydration", async () => {
    const source = (await readMinimalDeck()).replaceAll(
      "--pptv-font-major: Arial;",
      '--pptv-font-major: "Demo; Sans";',
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolvePptvDeck(deck).model).toBeDefined();

    const result = await extractPptvDiagram(deck, "cover");
    const resolved = resolvePptvDiagram(result.diagram!);

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceText).toContain("font-family:&quot;Demo; Sans&quot;");
    expect(JSON.stringify(resolved.model)).toContain(
      '"fontFamily":"Demo; Sans"',
    );
  });

  it("fails with no candidate bytes when opaque descendants retain deck-only class authority", async () => {
    const source = insertBeforeCoverTitle(
      await readMinimalDeck(),
      `    <g id="cover.asset"
       data-pptv-role="asset" data-pptv-export="svg"
       data-pptv-bounds="200 200 100 100">
      <rect class="deck-only-detail" x="0" y="0" width="100" height="100"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolvePptvDeck(deck).model).toBeDefined();

    const result = await extractPptvDiagram(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagram).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("PPTV-DIAGRAM-STYLE");
    expect(errorCodes(result.diagnostics)).toContain(
      "PPTV-EXTRACT-INVALID-CANDIDATE",
    );
  });

  it("fails with no candidate bytes when hydrated opaque SVG is not namespace-aware XML", async () => {
    const source = insertBeforeCoverTitle(
      await readMinimalDeck(),
      `    <g id="cover.asset"
       data-pptv-role="asset" data-pptv-export="svg"
       data-pptv-bounds="200 200 100 100">
      <rect demo:label="detail" x="0" y="0" width="100" height="100"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolvePptvDeck(deck).model).toBeDefined();

    const result = await extractPptvDiagram(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagram).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("PPTV-SCAN-SVG-XML");
    expect(errorCodes(result.diagnostics)).toContain(
      "PPTV-EXTRACT-INVALID-CANDIDATE",
    );
  });

  it("fails with no candidate bytes for a partial semantic deck snapshot", async () => {
    const deck = await loadDeck(
      { kind: "text", text: await readMinimalDeck() },
      { slides: ["cover"] },
    );
    expect(deck.materialization.complete).toBe(false);

    const result = await extractPptvDiagram(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagram).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toEqual([
      "PPTV-EXTRACT-INVALID-BASE",
    ]);
  });
});

function insertBeforeCoverTitle(source: string, markup: string): string {
  const marker = '    <text id="cover.title"';
  if (!source.includes(marker))
    throw new Error("Cover title marker is missing");
  return source.replace(marker, `${markup}\n${marker}`);
}

function normalizeDeckObjects(objects: readonly PptvResolvedObject[]): unknown {
  return JSON.parse(
    JSON.stringify(objects, (key, value: unknown) =>
      key === "slideId" || key === "styleProvenance" ? undefined : value,
    ),
  );
}

function normalizeDiagramObjects(
  objects: readonly PptvResolvedDiagramObject[],
): unknown {
  return JSON.parse(
    JSON.stringify(objects, (key, value: unknown) =>
      key === "diagramId" || key === "styleProvenance" ? undefined : value,
    ),
  );
}
