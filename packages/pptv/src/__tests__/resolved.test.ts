import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import {
  resolvePptvDeck,
  type PptvResolvedObject,
  type PptvResolvedResult,
} from "../core/resolved.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

const DIRECT_SUBTITLE = `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 445 1350 80"
          data-pptv-line-step="41"
          x="125" y="490">Manifest first. Slides declarative. Theme last.</text>`;

async function resolveSource(
  mutate: (source: string) => string = (source) => source,
): Promise<PptvResolvedResult> {
  const source = mutate(await readMinimalDeck());
  const deck = await loadDeck({
    kind: "text",
    text: source,
    name: "resolved.pptv.html",
  });
  return resolvePptvDeck(deck);
}

function replaceRequired(
  source: string,
  before: string,
  after: string,
): string {
  expect(source).toContain(before);
  return source.replace(before, after);
}

function insertBeforeCoverTitle(source: string, markup: string): string {
  return replaceRequired(
    source,
    '    <text id="cover.title"',
    `${markup}\n    <text id="cover.title"`,
  );
}

function replaceSubtitle(source: string, replacement: string): string {
  return replaceRequired(source, DIRECT_SUBTITLE, replacement);
}

function findObject(
  objects: readonly PptvResolvedObject[],
  id: string,
): PptvResolvedObject | undefined {
  for (const object of objects) {
    if (object.id === id) return object;
    if (object.kind === "group") {
      const descendant = findObject(object.children, id);
      if (descendant !== undefined) return descendant;
    }
  }
  return undefined;
}

describe("C6 resolved PPTV model", () => {
  it("resolves the conforming fixture to immutable JSON-safe canvas and objects", async () => {
    const source = await readMinimalDeck();
    const deck = await loadDeck({ kind: "text", text: source });
    const result = resolvePptvDeck(deck);

    expect(result.diagnostics).toEqual([]);
    expect(result.model).toMatchObject({
      schema: "pptv-resolved/0.1",
      sourceSha256: deck.source.sha256,
      activeTheme: "light",
      canvas: {
        viewBox: [0, 0, 1600, 900],
        widthEmu: 12_192_000,
        heightEmu: 6_858_000,
        emuPerUnit: 7_620,
      },
    });
    expect(result.model?.slides.map((slide) => slide.id)).toEqual([
      "cover",
      "architecture",
    ]);
    expect(result.model?.slides[0]?.objects.map((object) => object.id)).toEqual(
      ["cover.background", "cover.title", "cover.subtitle"],
    );

    const title = findObject(
      result.model?.slides[0]?.objects ?? [],
      "cover.title",
    );
    expect(title).toMatchObject({
      kind: "text",
      order: 1,
      localBounds: { x: 120, y: 280, width: 1360, height: 160 },
      worldBounds: { x: 120, y: 280, width: 1360, height: 160 },
      worldOffset: { x: 0, y: 0 },
      frame: { x: 120, y: 280, width: 1360, height: 160 },
      lineStep: 116,
      anchor: "start",
      lines: [{ text: "Minimal PPTV deck", x: 120, y: 410 }],
      wrap: "none",
      autofit: "none",
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
      style: {
        fill: "#17211e",
        fontFamily: "Arial",
        fontSize: 96,
        fontWeight: 700,
      },
      styleProvenance: {
        fill: expect.objectContaining({
          origin: "base-rule",
          token: "--pptv-text-primary",
        }),
      },
    });

    expect(JSON.parse(JSON.stringify(result.model))).toEqual(result.model);
    expect(Object.isFrozen(result.model)).toBe(true);
    expect(Object.isFrozen(result.model?.slides)).toBe(true);
    expect(Object.isFrozen(title)).toBe(true);
    expect(Object.isFrozen(title?.style)).toBe(true);
    expect(() =>
      Object.assign(result.model?.canvas ?? {}, { widthEmu: 1 }),
    ).toThrow();
    expect(deck.source.text).toBe(source);
  });

  it("normalizes primitives, nested translations, unions, order, and opaque assets", async () => {
    const markup = `    <g id="cover.translated"
       data-pptv-role="group" data-pptv-export="native"
       transform="translate(100, 40)">
      <circle id="cover.translated.circle"
              data-pptv-role="shape" data-pptv-export="native"
              cx="20" cy="30" r="10"/>
      <ellipse id="cover.translated.ellipse"
               data-pptv-role="shape" data-pptv-export="native"
               cx="50" cy="30" rx="5" ry="15"/>
      <g id="cover.translated.inner"
         data-pptv-role="group" data-pptv-export="native"
         transform="translate(-5 10)">
        <rect id="cover.translated.inner.rect"
              data-pptv-role="shape" data-pptv-export="native"
              x="0" y="0" width="10" height="20" rx="2"/>
      </g>
      <g id="cover.translated.art"
         data-pptv-role="asset" data-pptv-export="svg"
         data-pptv-bounds="-20 0 10 10">
        <path d="M0 0 L10 10"/>
      </g>
      <path id="cover.translated.ignored"
            data-pptv-role="shape" data-pptv-export="ignore"
            d="M0 0 L100 100"/>
    </g>`;
    const result = await resolveSource((source) =>
      insertBeforeCoverTitle(source, markup),
    );

    expect(result.diagnostics).toEqual([]);
    const cover = result.model?.slides[0];
    expect(cover?.objects.map(({ id, order }) => [id, order])).toEqual([
      ["cover.background", 0],
      ["cover.translated", 1],
      ["cover.title", 2],
      ["cover.subtitle", 3],
    ]);

    const outer = findObject(cover?.objects ?? [], "cover.translated");
    expect(outer).toMatchObject({
      kind: "group",
      parentId: null,
      translateX: 100,
      translateY: 40,
      worldOffset: { x: 100, y: 40 },
      localBounds: { x: -20, y: 0, width: 75, height: 45 },
      worldBounds: { x: 80, y: 40, width: 75, height: 45 },
    });
    expect(
      outer?.kind === "group"
        ? outer.children.map(({ id, order }) => [id, order])
        : [],
    ).toEqual([
      ["cover.translated.circle", 0],
      ["cover.translated.ellipse", 1],
      ["cover.translated.inner", 2],
      ["cover.translated.art", 3],
    ]);

    expect(
      findObject(cover?.objects ?? [], "cover.translated.circle"),
    ).toMatchObject({
      kind: "ellipse",
      sourceElement: "circle",
      cx: 20,
      cy: 30,
      rx: 10,
      ry: 10,
      localBounds: { x: 10, y: 20, width: 20, height: 20 },
      worldBounds: { x: 110, y: 60, width: 20, height: 20 },
    });
    expect(
      findObject(cover?.objects ?? [], "cover.translated.ellipse"),
    ).toMatchObject({
      kind: "ellipse",
      sourceElement: "ellipse",
      localBounds: { x: 45, y: 15, width: 10, height: 30 },
      worldBounds: { x: 145, y: 55, width: 10, height: 30 },
    });
    expect(
      findObject(cover?.objects ?? [], "cover.translated.inner"),
    ).toMatchObject({
      kind: "group",
      translateX: -5,
      translateY: 10,
      worldOffset: { x: 95, y: 50 },
      localBounds: { x: 0, y: 0, width: 10, height: 20 },
      worldBounds: { x: 95, y: 50, width: 10, height: 20 },
    });
    expect(
      findObject(cover?.objects ?? [], "cover.translated.inner.rect"),
    ).toMatchObject({
      kind: "rect",
      rx: 2,
      parentId: "cover.translated.inner",
      worldOffset: { x: 95, y: 50 },
      worldBounds: { x: 95, y: 50, width: 10, height: 20 },
    });
    expect(
      findObject(cover?.objects ?? [], "cover.translated.art"),
    ).toMatchObject({
      kind: "svg-asset",
      localBounds: { x: -20, y: 0, width: 10, height: 10 },
      worldBounds: { x: 80, y: 40, width: 10, height: 10 },
    });
    expect(
      findObject(cover?.objects ?? [], "cover.translated.ignored"),
    ).toBeUndefined();
  });

  it("resolves direct and explicit multiline hard text without reflow", async () => {
    const multiline = `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 445 1350 80"
          data-pptv-line-step="41">
      <tspan x="125" y="470">First hard line</tspan>
      <tspan x="125" y="511">Second hard line</tspan>
    </text>`;
    const result = await resolveSource((source) =>
      replaceSubtitle(source, multiline),
    );

    expect(result.diagnostics).toEqual([]);
    expect(
      findObject(result.model?.slides[0]?.objects ?? [], "cover.subtitle"),
    ).toMatchObject({
      kind: "text",
      frame: { x: 125, y: 445, width: 1350, height: 80 },
      lineStep: 41,
      anchor: "start",
      lines: [
        { text: "First hard line", x: 125, y: 470 },
        { text: "Second hard line", x: 125, y: 511 },
      ],
      wrap: "none",
      autofit: "none",
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
    });
  });

  it("compares authored decimal baseline steps exactly", async () => {
    const result = await resolveSource((source) =>
      replaceSubtitle(
        source,
        `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 0 1350 1"
          data-pptv-line-step=".2">
      <tspan x="125" y=".1">First</tspan>
      <tspan x="125" y=".3">Second</tspan>
    </text>`,
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(
      findObject(result.model?.slides[0]?.objects ?? [], "cover.subtitle"),
    ).toMatchObject({
      kind: "text",
      lineStep: 0.2,
      lines: [
        { text: "First", x: 125, y: 0.1 },
        { text: "Second", x: 125, y: 0.3 },
      ],
    });
  });

  it("bounds exact-decimal baseline work for pathological lexemes", async () => {
    const paddedStep = `${"0".repeat(600)}.2`;
    const result = await resolveSource((source) =>
      replaceSubtitle(
        source,
        `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 0 1350 1"
          data-pptv-line-step="${paddedStep}">
      <tspan x="125" y=".1">First</tspan>
      <tspan x="125" y=".3">Second</tspan>
    </text>`,
      ),
    );

    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PROFILE-TEXT-LINES");
  });

  it("normalizes negative zero before producing JSON-safe geometry", async () => {
    const result = await resolveSource((source) =>
      replaceRequired(
        replaceRequired(
          source,
          'x="0" y="0" width="1600" height="900"/>',
          'x="-0" y="0" width="1600" height="900"/>',
        ),
        'data-pptv-frame="120 280 1360 160"\n          data-pptv-line-step="116"\n          x="120" y="410"',
        'data-pptv-frame="-0 280 1360 160"\n          data-pptv-line-step="116"\n          x="-0" y="410"',
      ),
    );

    expect(result.diagnostics).toEqual([]);
    const background = findObject(
      result.model?.slides[1]?.objects ?? [],
      "architecture.background",
    );
    const title = findObject(
      result.model?.slides[0]?.objects ?? [],
      "cover.title",
    );
    expect(background).toMatchObject({
      kind: "rect",
      x: 0,
      localBounds: { x: 0 },
      worldBounds: { x: 0 },
    });
    expect(title).toMatchObject({
      kind: "text",
      frame: { x: 0 },
      lines: [{ x: 0 }],
    });
    expect(
      background?.kind === "rect" ? Object.is(background.x, -0) : true,
    ).toBe(false);
    expect(title?.kind === "text" ? Object.is(title.frame.x, -0) : true).toBe(
      false,
    );
    expect(JSON.parse(JSON.stringify(result.model))).toEqual(result.model);
  });

  it.each(["inline-size", "shape-inside", "line-height"])(
    "fails closed for the unsupported text layout attribute %s",
    async (attribute) => {
      const result = await resolveSource((source) =>
        replaceRequired(
          source,
          'x="125" y="490"',
          `x="125" y="490" ${attribute}="100"`,
        ),
      );

      expect(result.model).toBeUndefined();
      expect(errorCodes(result.diagnostics)).toContain(
        "PPTV-PROFILE-CSS-PROPERTY",
      );
    },
  );

  it.each([
    {
      name: "a non-canonical canvas",
      code: "PPTV-PROFILE-VIEWBOX",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'viewBox="0 0 1600 900"',
          'viewBox="0 0 800 450"',
        ),
    },
    {
      name: "presentation styling on the slide root",
      code: "PPTV-PROFILE-VIEWBOX",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'viewBox="0 0 1600 900"',
          'viewBox="0 0 1600 900" style="fill:#ffffff"',
        ),
    },
    {
      name: "a unit-bearing primitive number",
      code: "PPTV-PROFILE-NUMBER",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'x="0" y="0" width="1600" height="900"',
          'x="0" y="0" width="100%" height="900"',
        ),
    },
    {
      name: "a non-positive optional radius",
      code: "PPTV-PROFILE-NUMBER",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'x="190" y="320" width="380" height="260"',
          'x="190" y="320" width="380" height="260" rx="0" ry="24"',
        ),
    },
    {
      name: "a zero-length line",
      code: "PPTV-PROFILE-GEOMETRY",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'x1="570" y1="450" x2="1030" y2="450"',
          'x1="570" y1="450" x2="570" y2="450"',
        ),
    },
    {
      name: "a missing connector target",
      code: "PPTV-PROFILE-GEOMETRY",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'data-pptv-to="architecture.node.policy"',
          'data-pptv-to="architecture.node.missing"',
        ),
    },
    {
      name: "a C4-supported polyline",
      code: "PPTV-PROFILE-OBJECT-KIND",
      mutate: (source: string) =>
        replaceRequired(
          source,
          '<line id="architecture.edge.client-policy"',
          '<polyline id="architecture.edge.client-policy"',
        ),
    },
    {
      name: "an empty native group",
      code: "PPTV-PROFILE-GEOMETRY",
      mutate: (source: string) =>
        insertBeforeCoverTitle(
          source,
          `    <g id="cover.empty"
       data-pptv-role="group" data-pptv-export="native"></g>`,
        ),
    },
  ])("fails atomically for $name", async ({ code, mutate }) => {
    const result = await resolveSource(mutate);
    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain(code);
  });

  it.each([
    {
      name: "group rotation",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'data-pptv-role="group" data-pptv-export="native">',
          'data-pptv-role="group" data-pptv-export="native" transform="rotate(5)">',
        ),
    },
    {
      name: "a primitive transform",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'x="0" y="0" width="1600" height="900"/>',
          'x="0" y="0" width="1600" height="900" transform="translate(1 2)"/>',
        ),
    },
    {
      name: "a transform list",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'data-pptv-role="group" data-pptv-export="native">',
          'data-pptv-role="group" data-pptv-export="native" transform="translate(1 2) scale(2)">',
        ),
    },
  ])("rejects $name", async ({ mutate }) => {
    const result = await resolveSource(mutate);
    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain("PPTV-PROFILE-TRANSFORM");
  });

  it.each([
    {
      name: "a missing frame",
      code: "PPTV-PROFILE-TEXT-FRAME",
      mutate: (source: string) =>
        replaceRequired(
          source,
          '          data-pptv-frame="125 445 1350 80"\n',
          "",
        ),
    },
    {
      name: "a unit-bearing line step",
      code: "PPTV-PROFILE-TEXT-FRAME",
      mutate: (source: string) =>
        replaceRequired(
          source,
          'data-pptv-line-step="41"',
          'data-pptv-line-step="41px"',
        ),
    },
    {
      name: "a decoded direct newline",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceRequired(
          source,
          "Manifest first. Slides declarative. Theme last.",
          "First&#10;Second",
        ),
    },
    {
      name: "a baseline outside the frame",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceRequired(source, 'x="125" y="490"', 'x="125" y="600"'),
    },
    {
      name: "forbidden line positioning",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceRequired(source, 'x="125" y="490"', 'x="125" y="490" dx="1"'),
    },
    {
      name: "a wrong multiline baseline delta",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceSubtitle(
          source,
          `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 445 1350 80"
          data-pptv-line-step="41">
      <tspan x="125" y="470">First</tspan>
      <tspan x="125" y="510">Second</tspan>
    </text>`,
        ),
    },
    {
      name: "nested tspans",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceSubtitle(
          source,
          `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 445 1350 80"
          data-pptv-line-step="41">
      <tspan x="125" y="470"><tspan>Nested</tspan></tspan>
    </text>`,
        ),
    },
    {
      name: "ambient multiline text",
      code: "PPTV-PROFILE-TEXT-LINES",
      mutate: (source: string) =>
        replaceSubtitle(
          source,
          `    <text id="cover.subtitle" class="cover-subtitle"
          data-pptv-role="text" data-pptv-export="native"
          data-pptv-frame="125 445 1350 80"
          data-pptv-line-step="41">
      ambient
      <tspan x="125" y="470">Line</tspan>
    </text>`,
        ),
    },
  ])("rejects $name", async ({ code, mutate }) => {
    const result = await resolveSource(mutate);
    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain(code);
  });

  it.each([
    {
      name: "missing SVG bounds",
      code: "PPTV-PROFILE-ASSET-BOUNDS",
      markup: `    <g id="cover.art"
       data-pptv-role="asset" data-pptv-export="svg"><path d="M0 0"/></g>`,
    },
    {
      name: "malformed SVG bounds",
      code: "PPTV-PROFILE-ASSET-BOUNDS",
      markup: `    <g id="cover.art"
       data-pptv-role="asset" data-pptv-export="svg"
       data-pptv-bounds="0,0,10,10"><path d="M0 0"/></g>`,
    },
    {
      name: "a transformed SVG boundary",
      code: "PPTV-PROFILE-TRANSFORM",
      markup: `    <g id="cover.art"
       data-pptv-role="asset" data-pptv-export="svg"
       data-pptv-bounds="0 0 10 10" transform="translate(1 2)"></g>`,
    },
    {
      name: "a raster requiring a resource fetch",
      code: "PPTV-PROFILE-RESOURCE",
      markup: `    <image id="cover.photo"
       data-pptv-role="asset" data-pptv-export="raster"
       data-pptv-bounds="0 0 10 10" href="#photo"/>`,
    },
  ])("fails atomically for $name", async ({ code, markup }) => {
    const result = await resolveSource((source) =>
      insertBeforeCoverTitle(source, markup),
    );
    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toContain(code);
  });

  it("retains invalid C4 diagnostics and rejects partial materialization", async () => {
    const duplicate = await resolveSource((source) =>
      replaceRequired(source, 'id="cover.subtitle"', 'id="cover.title"'),
    );
    expect(duplicate.model).toBeUndefined();
    expect(errorCodes(duplicate.diagnostics)).toEqual(
      expect.arrayContaining([
        "PPTV-ID-DUPLICATE",
        "PPTV-PROFILE-INVALID-BASE",
      ]),
    );

    const partialDeck = await loadDeck(
      { kind: "text", text: await readMinimalDeck() },
      { slides: ["cover"] },
    );
    const partial = resolvePptvDeck(partialDeck);
    expect(partial.model).toBeUndefined();
    expect(errorCodes(partial.diagnostics)).toContain(
      "PPTV-PROFILE-INVALID-BASE",
    );
  });

  it("traverses the complete deck before withholding a failed model", async () => {
    const result = await resolveSource((source) =>
      replaceRequired(
        replaceRequired(
          source,
          'viewBox="0 0 1600 900"',
          'viewBox="0 0 800 450"',
        ),
        'data-pptv-line-step="41"',
        'data-pptv-line-step="bad"',
      ),
    );

    expect(result.model).toBeUndefined();
    expect(errorCodes(result.diagnostics)).toEqual(
      expect.arrayContaining([
        "PPTV-PROFILE-VIEWBOX",
        "PPTV-PROFILE-TEXT-FRAME",
      ]),
    );
  });
});
