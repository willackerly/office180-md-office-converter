// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C6-PPTV-RESOLVED.2.0

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import {
  extractVector180Atom,
  VECTOR180_ATOM_DISCOVERY_COMMENT,
} from "../core/extract.js";
import {
  resolveVector180Deck,
  resolveVector180Atom,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedObject,
} from "../core/resolved.js";
import { sha256Hex } from "../core/source.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("deck-slide atom extraction", () => {
  it("hydrates deck CSS/theme values into a standalone atom", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
      name: "minimal-deck.vector180.html",
    });

    const first = await extractVector180Atom(deck, "architecture");
    const second = await extractVector180Atom(deck, "architecture");

    expect(first.diagnostics).toEqual([]);
    expect(first.sourceText).toBe(second.sourceText);
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.atom).toBeDefined();
    expect(first.atom?.sourceKind).toBe("svg");
    expect(first.atom?.id).toBe("architecture");
    const sourceSlide = deck.index.slides.get("architecture")!;
    const sourceObjectSha256 = await sha256Hex(
      deck.source.bytes.slice(
        sourceSlide.svgRange.byteStart,
        sourceSlide.svgRange.byteEnd,
      ),
    );
    expect(first.provenance).toEqual({
      method: "vector180-slide-hydration/0.1",
      sourceWireFamily: "vector180",
      sourceSha256: deck.source.sha256,
      sourceObjectId: "architecture",
      sourceObjectSha256,
      activeThemeId: "light",
    });
    expect(first.atom?.metadata).toEqual({ hydration: first.provenance });
    expect(first.atom?.metadataSha256).toMatch(/^[a-f0-9]{64}$/u);

    const source = first.sourceText!;
    expect(
      source.startsWith(
        `${VECTOR180_ATOM_DISCOVERY_COMMENT}\n<svg id="architecture"`,
      ),
    ).toBe(true);
    expect(source.split(VECTOR180_ATOM_DISCOVERY_COMMENT)).toHaveLength(2);
    expect(source).toContain('data-vector180-version="0.1"');
    expect(source).toContain(
      'data-vector180-metadata="vector180-atom-metadata/0.1"',
    );
    expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(source).not.toContain("xmlns:xlink");
    expect(source).not.toContain("<template");
    expect(source).not.toContain("data-vector180-layout");
    expect(source).not.toMatch(/\bclass\s*=/u);
    expect(source).not.toContain("var(");
    expect(source).toContain(
      'style="fill:#17211e;stroke:none;stroke-width:1;opacity:1;',
    );
    expect(first.atom?.index.objects.has("architecture.node.client")).toBe(
      true,
    );

    const deckModel = resolveVector180Deck(deck).model;
    const atomModel = resolveVector180Atom(first.atom!).model;
    expect(deckModel).toBeDefined();
    expect(atomModel).toBeDefined();
    expect(atomModel?.metadata?.value).toEqual({
      hydration: first.provenance,
    });
    expect(atomModel?.sourceWireFamily).toBe("vector180");
    const resolvedSourceSlide = deckModel?.slides.find(
      (slide) => slide.id === "architecture",
    );
    expect(normalizeDeckObjects(resolvedSourceSlide?.objects ?? [])).toEqual(
      normalizeAtomObjects(atomModel?.objects ?? []),
    );

    const rootOffset = source.indexOf("<svg");
    const rootOpenTag = source.slice(
      rootOffset,
      source.indexOf(">", rootOffset) + 1,
    );
    expect(rootOpenTag).not.toMatch(/\n[ \t]+\n/u);
    expect(rootOpenTag).not.toContain("data-vector180-layout");
  });

  it("fails without emitting partial source when the slide is absent", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });

    const result = await extractVector180Atom(deck, "missing");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.atom).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "VECTOR180-EXTRACT-SLIDE",
    ]);
  });

  it("declares the standard XLink namespace when opaque source retains a fragment reference", async () => {
    const source = insertBeforeCoverTitle(
      await readMinimalDeck(),
      `    <g id="cover.asset"
       data-vector180-role="asset" data-vector180-export="svg"
       data-vector180-bounds="200 200 100 100">
      <defs><path id="cover.asset.path" d="M0 0h100v100z"/></defs>
      <use xlink:href="#cover.asset.path"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolveVector180Deck(deck).model).toBeDefined();

    const result = await extractVector180Atom(deck, "cover");

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceText).toContain(
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    expect(result.sourceText).toContain('xlink:href="#cover.asset.path"');
    expect(resolveVector180Atom(result.atom!).model).toBeDefined();
  });

  it("quotes concrete font families so declaration punctuation survives hydration", async () => {
    const source = (await readMinimalDeck()).replaceAll(
      "--vector180-font-major: ABeeZee;",
      '--vector180-font-major: "Demo; Sans";',
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolveVector180Deck(deck).model).toBeDefined();

    const result = await extractVector180Atom(deck, "cover");
    const resolved = resolveVector180Atom(result.atom!);

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
       data-vector180-role="asset" data-vector180-export="svg"
       data-vector180-bounds="200 200 100 100">
      <rect class="deck-only-detail" x="0" y="0" width="100" height="100"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolveVector180Deck(deck).model).toBeDefined();

    const result = await extractVector180Atom(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.atom).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("VECTOR180-ATOM-STYLE");
    expect(errorCodes(result.diagnostics)).toContain(
      "VECTOR180-EXTRACT-INVALID-CANDIDATE",
    );
  });

  it("fails with no candidate bytes when hydrated opaque SVG is not namespace-aware XML", async () => {
    const source = insertBeforeCoverTitle(
      await readMinimalDeck(),
      `    <g id="cover.asset"
       data-vector180-role="asset" data-vector180-export="svg"
       data-vector180-bounds="200 200 100 100">
      <rect demo:label="detail" x="0" y="0" width="100" height="100"/>
    </g>`,
    );
    const deck = await loadDeck({ kind: "text", text: source });
    expect(deck.diagnostics).toEqual([]);
    expect(resolveVector180Deck(deck).model).toBeDefined();

    const result = await extractVector180Atom(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.atom).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("VECTOR180-SCAN-SVG-XML");
    expect(errorCodes(result.diagnostics)).toContain(
      "VECTOR180-EXTRACT-INVALID-CANDIDATE",
    );
  });

  it("fails with no candidate bytes for a partial semantic deck snapshot", async () => {
    const deck = await loadDeck(
      { kind: "text", text: await readMinimalDeck() },
      { slides: ["cover"] },
    );
    expect(deck.materialization.complete).toBe(false);

    const result = await extractVector180Atom(deck, "cover");

    expect(result.sourceText).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.atom).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toEqual([
      "VECTOR180-EXTRACT-INVALID-BASE",
    ]);
  });
});

function insertBeforeCoverTitle(source: string, markup: string): string {
  const marker = '    <text id="cover.title"';
  if (!source.includes(marker))
    throw new Error("Cover title marker is missing");
  return source.replace(marker, `${markup}\n${marker}`);
}

function normalizeDeckObjects(
  objects: readonly Vector180ResolvedObject[],
): unknown {
  return JSON.parse(
    JSON.stringify(objects, (key, value: unknown) =>
      key === "slideId" || key === "styleProvenance" ? undefined : value,
    ),
  );
}

function normalizeAtomObjects(
  objects: readonly Vector180ResolvedAtomObject[],
): unknown {
  return JSON.parse(
    JSON.stringify(objects, (key, value: unknown) =>
      key === "atomId" || key === "styleProvenance" ? undefined : value,
    ),
  );
}
