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
import { readMinimalDeck } from "./test-helpers.js";

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
});

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
