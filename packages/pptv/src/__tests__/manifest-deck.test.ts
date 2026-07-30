// Tests: CONTRACT:C4-PPTV-SOURCE.1.1

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import { parseManifest, validateManifest } from "../core/manifest.js";
import { scanPptvSource } from "../core/scan.js";
import {
  extractText,
  getObject,
  getSlide,
  inventoryDeck,
  outlineManifest,
  queryObjects,
} from "../ops/projections.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("PPTV manifest and semantic deck", () => {
  it("uses manifest order even when templates have a different physical order", async () => {
    const source = await readMinimalDeck();
    const scan = await scanPptvSource({ kind: "text", text: source });
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

    const outline = outlineManifest(deck.manifest);
    expect(outline).toEqual({
      schema: "pptv-outline/0.1",
      version: "0.1",
      title: "Minimal PPTV deck",
      activeTheme: "light",
      slides: [
        { id: "cover", hidden: false },
        { id: "architecture", hidden: false },
      ],
    });
    expect(JSON.stringify(outline)).not.toContain("pptv-browser");
    expect(JSON.stringify(outline)).not.toContain("--pptv-");

    const inventory = inventoryDeck(deck);
    expect(inventory.slides[0]?.objects.map((object) => object.id)).toEqual([
      "cover.background",
      "cover.title",
      "cover.subtitle",
    ]);
    expect(extractText(deck).entries.map((entry) => entry.text)).toEqual([
      "Minimal PPTV deck",
      "Manifest first. Slides declarative. Theme last.",
      "System architecture",
      "Client",
      "Policy service",
    ]);

    expect(getObject(deck, "architecture.node.policy.title")).toEqual({
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

    expect(errorCodes(deck.diagnostics)).toContain("PPTV-ID-DUPLICATE");
    expect(getObject(deck, "cover.title")).toBeUndefined();
    expect(
      queryObjects(deck, { ids: ["cover.title"] }).map((object) => object.id),
    ).toEqual([]);
  });

  it("allows complex children only inside an explicit opaque boundary", async () => {
    const source = await readMinimalDeck();
    const nativePath = source.replace(
      '    <text id="cover.title"',
      '    <path id="cover.path" data-pptv-role="shape" data-pptv-export="native" d="M0 0L1 1"></path>\n    <text id="cover.title"',
    );
    const opaquePath = source.replace(
      '    <text id="cover.title"',
      '    <g id="cover.art" data-pptv-role="asset" data-pptv-export="svg"><path d="M0 0L1 1"></path></g>\n    <text id="cover.title"',
    );

    expect(
      errorCodes(
        (await loadDeck({ kind: "text", text: nativePath })).diagnostics,
      ),
    ).toContain("PPTV-SVG-UNSUPPORTED-NATIVE");
    expect(
      errorCodes(
        (await loadDeck({ kind: "text", text: opaquePath })).diagnostics,
      ),
    ).not.toContain("PPTV-SVG-UNSUPPORTED-NATIVE");
  });

  it("requires one direct SVG root per slide template", async () => {
    const source = (await readMinimalDeck()).replace(
      "</svg>\n</template>",
      '</svg><svg id="competing" viewBox="0 0 1 1"></svg>\n</template>',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain("PPTV-SVG-MISSING-ROOT");
  });

  it("rejects unsupported elements at any depth inside native tspan text", async () => {
    const source = (await readMinimalDeck()).replace(
      ">Policy service</text>",
      "><tspan>Policy <tspan><a>service</a></tspan></tspan></text>",
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "PPTV-SVG-UNSUPPORTED-NATIVE",
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
        '    <image id="cover.links" data-pptv-role="asset" data-pptv-export="native" href="#primary" xlink:href="#fallback"></image>\n    <text id="cover.title"',
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
      '    {"id": "architecture", "src": "../outside.pptv.svg"}',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "PPTV-MANIFEST-UNSUPPORTED-EXTERNAL",
    );
  });

  it("reports duplicate manifest keys and missing declarations", async () => {
    const duplicateKeySource = (await readMinimalDeck()).replace(
      '  "title": "Minimal PPTV deck",',
      '  "title": "First",\n  "title": "Second",',
    );
    const missingReferenceSource = (await readMinimalDeck()).replace(
      '    "architecture"',
      '    "undeclared"',
    );

    const duplicateScan = await scanPptvSource({
      kind: "text",
      text: duplicateKeySource,
    });
    const duplicateManifest = parseManifest(duplicateScan);
    const missingDeck = await loadDeck({
      kind: "text",
      text: missingReferenceSource,
    });

    expect(errorCodes(duplicateManifest.diagnostics)).toContain(
      "PPTV-MANIFEST-DUPLICATE-KEY",
    );
    expect(errorCodes(missingDeck.diagnostics)).toContain(
      "PPTV-MANIFEST-MISSING-REFERENCE",
    );
  });

  it("reports truncated standalone manifest JSON without throwing", async () => {
    const scan = await scanPptvSource({
      kind: "text",
      text: '{"pptv"',
      name: "truncated.pptv-manifest.json",
    });

    expect(() => parseManifest(scan)).not.toThrow();
    expect(errorCodes(parseManifest(scan).diagnostics)).toContain(
      "PPTV-MANIFEST-INVALID",
    );
  });
});
