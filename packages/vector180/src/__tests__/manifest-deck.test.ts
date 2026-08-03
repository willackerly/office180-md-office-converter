// Tests: CONTRACT:C4-PPTV-SOURCE.2.0

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import { parseManifest, validateManifest } from "../core/manifest.js";
import { scanVector180Source } from "../core/scan.js";
import {
  extractText,
  getObject,
  getSlide,
  inventoryDeck,
  outlineDeck,
  outlineManifest,
  queryObjects,
} from "../ops/projections.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

const LEGACY_DECK_URL = new URL(
  "../../../../examples/minimal-deck.pptv.html",
  import.meta.url,
);

describe("Vector180 manifest and semantic deck", () => {
  it("uses manifest order even when templates have a different physical order", async () => {
    const source = await readMinimalDeck();
    const scan = await scanVector180Source({ kind: "text", text: source });
    const parsed = parseManifest(scan);

    expect(parsed.manifest).toBeDefined();
    expect(parsed.ranges?.fields.get("slides")).toBeDefined();
    expect(parsed.ranges?.slideEntries.get("cover")).toBeDefined();
    expect(validateManifest(parsed.manifest!, scan)).toEqual([]);

    const deck = await loadDeck({ kind: "text", text: source });
    expect(errorCodes(deck.diagnostics)).toEqual([]);
    expect(deck.slideOrder).toEqual(["cover", "architecture"]);
    expect([...deck.slides.keys()]).toEqual(["cover", "architecture"]);
    expect(deck.index.objects.size).toBe(12);
    expect(deck.baseStyle).toMatchObject({
      id: "base",
      cssText: expect.stringContaining(".slide-background"),
    });
    expect(deck.index.style?.id).toBe("base");
  });

  it("produces compact JSON-safe outline, inventory, text, and object views", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });

    const outline = outlineManifest(deck.manifest, deck.wireFamily);
    expect(outline).toEqual({
      schema: "vector180-deck-outline/0.1",
      wireFamily: "vector180",
      version: "0.1",
      title: "Minimal Vector180 deck",
      activeTheme: "light",
      slides: [
        { id: "cover", hidden: false },
        { id: "architecture", hidden: false },
      ],
    });
    expect(JSON.stringify(outline)).not.toContain("vector180-browser");
    expect(JSON.stringify(outline)).not.toContain("--vector180-");

    const inventory = inventoryDeck(deck);
    expect(inventory.slides[0]?.objects.map((object) => object.id)).toEqual([
      "cover.background",
      "cover.title",
      "cover.subtitle",
    ]);
    expect(extractText(deck).entries.map((entry) => entry.text)).toEqual([
      "Minimal Vector180 deck",
      "Manifest first. Slides declarative. Theme last.",
      "System architecture",
      "Client",
      "Policy service",
    ]);

    expect(getObject(deck, "architecture.node.policy.title")).toEqual({
      wireFamily: "vector180",
      id: "architecture.node.policy.title",
      role: "text",
      export: "native",
      element: "text",
      text: "Policy service",
      children: [],
    });
    expect(
      getObject(deck, "architecture.node.policy.title", "editing"),
    ).toMatchObject({
      classes: ["diagram-node__title"],
      attributes: { id: "architecture.node.policy.title", x: "1220", y: "465" },
      sourceRange: {
        charStart: expect.any(Number),
        byteStart: expect.any(Number),
      },
    });
  });

  it("carries the exact legacy family through every deck projection", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readFile(LEGACY_DECK_URL, "utf8"),
      name: "minimal-deck.pptv.html",
    });

    expect(deck.wireFamily).toBe("pptv-legacy");
    expect(outlineDeck(deck).wireFamily).toBe("pptv-legacy");
    expect(outlineManifest(deck.manifest, deck.wireFamily).wireFamily).toBe(
      "pptv-legacy",
    );
    expect(inventoryDeck(deck).wireFamily).toBe("pptv-legacy");
    expect(getSlide(deck, "cover")?.wireFamily).toBe("pptv-legacy");
    expect(getObject(deck, "cover.title")?.wireFamily).toBe("pptv-legacy");
    expect(
      queryObjects(deck, { role: "text" }).every(
        (object) => object.wireFamily === "pptv-legacy",
      ),
    ).toBe(true);
    expect(extractText(deck).wireFamily).toBe("pptv-legacy");
    expect(
      extractText(deck).entries.every(
        (entry) => entry.wireFamily === "pptv-legacy",
      ),
    ).toBe(true);
  });

  it("preserves group hierarchy and DOM order in projections and queries", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const slide = getSlide(deck, "architecture");

    expect(slide?.objects.map((object) => object.id)).toEqual([
      "architecture.background",
      "architecture.title",
      "architecture.edge.client-policy",
      "architecture.node.client",
      "architecture.node.policy",
    ]);
    expect(slide?.objects[3]?.children.map((object) => object.id)).toEqual([
      "architecture.node.client.panel",
      "architecture.node.client.title",
    ]);
    expect(
      queryObjects(deck, { descendantOf: "architecture.node.client" }).map(
        (object) => object.id,
      ),
    ).toEqual([
      "architecture.node.client.panel",
      "architecture.node.client.title",
    ]);
  });

  it("rejects duplicate object IDs rather than resolving first or last", async () => {
    const source = (await readMinimalDeck()).replace(
      'id="cover.subtitle"',
      'id="cover.title"',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain("VECTOR180-ID-DUPLICATE");
    expect(getObject(deck, "cover.title")).toBeUndefined();
    expect(
      queryObjects(deck, { ids: ["cover.title"] }).map((object) => object.id),
    ).toEqual([]);
  });

  it("allows complex children only inside an explicit opaque boundary", async () => {
    const source = await readMinimalDeck();
    const nativePath = source.replace(
      '    <text id="cover.title"',
      '    <path id="cover.path" data-vector180-role="shape" data-vector180-export="native" d="M0 0L1 1"></path>\n    <text id="cover.title"',
    );
    const opaquePath = source.replace(
      '    <text id="cover.title"',
      '    <g id="cover.art" data-vector180-role="asset" data-vector180-export="svg"><path d="M0 0L1 1"></path></g>\n    <text id="cover.title"',
    );

    expect(
      errorCodes(
        (await loadDeck({ kind: "text", text: nativePath })).diagnostics,
      ),
    ).toContain("VECTOR180-SVG-UNSUPPORTED-NATIVE");
    expect(
      errorCodes(
        (await loadDeck({ kind: "text", text: opaquePath })).diagnostics,
      ),
    ).not.toContain("VECTOR180-SVG-UNSUPPORTED-NATIVE");
  });

  it("requires one direct SVG root per slide template", async () => {
    const source = (await readMinimalDeck()).replace(
      "</svg>\n</template>",
      '</svg><svg id="competing" viewBox="0 0 1 1"></svg>\n</template>',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "VECTOR180-SVG-MISSING-ROOT",
    );
  });

  it("rejects unsupported elements at any depth inside native tspan text", async () => {
    const source = (await readMinimalDeck()).replace(
      ">Policy service</text>",
      "><tspan>Policy <tspan><a>service</a></tspan></tspan></text>",
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "VECTOR180-SVG-UNSUPPORTED-NATIVE",
    );
  });

  it("retains qualified SVG attributes without collapsing them", async () => {
    const source = (await readMinimalDeck())
      .replace(
        '<svg id="cover"',
        '<svg id="cover" xmlns:xlink="http://www.w3.org/1999/xlink"',
      )
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.links" data-vector180-role="asset" data-vector180-export="native" href="#primary" xlink:href="#fallback"></image>\n    <text id="cover.title"',
      );
    const deck = await loadDeck({ kind: "text", text: source });
    const projection = getObject(deck, "cover.links", "editing");

    expect(projection?.attributes).toMatchObject({
      href: "#primary",
      "xlink:href": "#fallback",
    });
  });

  it("reports missing references and unsupported external slide fields explicitly", async () => {
    const source = (await readMinimalDeck()).replace(
      '    "architecture"',
      '    {"id": "architecture", "src": "../outside.vector180.svg"}',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "VECTOR180-MANIFEST-UNSUPPORTED-EXTERNAL",
    );
  });

  it("reports duplicate manifest keys and missing declarations", async () => {
    const duplicateKeySource = (await readMinimalDeck()).replace(
      '  "title": "Minimal Vector180 deck",',
      '  "title": "First",\n  "title": "Second",',
    );
    const missingReferenceSource = (await readMinimalDeck()).replace(
      '    "architecture"',
      '    "undeclared"',
    );

    const duplicateScan = await scanVector180Source({
      kind: "text",
      text: duplicateKeySource,
    });
    const duplicateManifest = parseManifest(duplicateScan);
    const missingDeck = await loadDeck({
      kind: "text",
      text: missingReferenceSource,
    });

    expect(errorCodes(duplicateManifest.diagnostics)).toContain(
      "VECTOR180-MANIFEST-DUPLICATE-KEY",
    );
    expect(errorCodes(missingDeck.diagnostics)).toContain(
      "VECTOR180-MANIFEST-MISSING-REFERENCE",
    );
  });

  it("reports truncated standalone manifest JSON without throwing", async () => {
    const scan = await scanVector180Source({
      kind: "text",
      text: '{"vector180"',
      name: "truncated.vector180-manifest.json",
    });

    expect(() => parseManifest(scan)).not.toThrow();
    expect(errorCodes(parseManifest(scan).diagnostics)).toContain(
      "VECTOR180-MANIFEST-INVALID",
    );
  });
});
