// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C6-PPTV-RESOLVED.2.0,
// CONTRACT:C7-PPTX-CANARY.2.0, CONTRACT:C9-PPTV-PPTX-BASELINE.2.0

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck, loadAtom } from "../core/deck.js";
import {
  resolveVector180Deck,
  type Vector180ResolvedDeck,
} from "../core/resolved.js";
import type { Vector180Deck, Vector180Atom } from "../core/types.js";
import {
  composeVector180AtomDeck,
  compilePptxBaseline,
  type Vector180Placement,
  type Vector180PptxBaselineErrorCode,
} from "../node/pptx-baseline.js";
import { compilePptxCanary } from "../node/pptx-canary.js";
import { readMinimalDeck, runtimeSource } from "./test-helpers.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const RUNTIME_ARTIFACT_URL = new URL(
  "../../assets/vector180-browser-0.1.script.html",
  import.meta.url,
);
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const IDENTITY_PLACEMENT: Vector180Placement = {
  slideId: "system-overview",
  x: 200,
  y: 50,
  width: 1200,
  height: 800,
  policy: "identity",
};
const UNIFORM_PLACEMENT: Vector180Placement = {
  slideId: "scaled-overview",
  x: 50,
  y: 60,
  width: 600,
  height: 400,
  policy: "uniform-scale-translate",
};

async function minimalAtom(): Promise<Vector180Atom> {
  return loadAtom({
    kind: "text",
    text: await readFile(MINIMAL_DIAGRAM_URL, "utf8"),
    name: "minimal-diagram.vector180.svg",
  });
}

async function minimalDeck(): Promise<Vector180Deck> {
  return loadDeck({
    kind: "text",
    text: await readMinimalDeck(),
    name: "minimal-deck.vector180.html",
  });
}

async function rasterAtom(): Promise<Vector180Atom> {
  return loadAtom({
    kind: "text",
    name: "raster-picture.vector180.svg",
    text: `<svg id="raster-picture" data-vector180-version="0.1"
  viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg">
  <image id="raster-picture.background"
    data-vector180-role="asset"
    data-vector180-export="raster"
    data-vector180-bounds="0 0 1 1"
    x="0" y="0" width="1" height="1"
    href="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}"/>
</svg>
`,
  });
}

function expectBaselineError(
  promise: Promise<unknown>,
  code: Vector180PptxBaselineErrorCode,
): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: "Vector180PptxBaselineCompileError",
    code,
  });
}

function captureEnvironment(): {
  environment: CliEnvironment;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    environment: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

async function withTempDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "vector180-baseline-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("C9 standalone atom PPTX baseline", () => {
  it("emits the deterministic C7 canary when package lineage options are omitted", async () => {
    const resolved = resolveVector180Deck(await minimalDeck());
    expect(resolved.model).toBeDefined();
    const model = structuredClone(resolved.model) as Vector180ResolvedDeck;
    const removeAbsentRoundedGeometry = (
      objects: Array<Record<string, unknown>>,
    ): void => {
      for (const object of objects) {
        if (object["kind"] === "rect") {
          delete object["rx"];
          delete object["ry"];
        }
        if (object["kind"] === "group") {
          removeAbsentRoundedGeometry(
            object["children"] as Array<Record<string, unknown>>,
          );
        }
      }
    };
    for (const slide of model.slides) {
      removeAbsentRoundedGeometry(
        slide.objects as unknown as Array<Record<string, unknown>>,
      );
    }

    const artifact = await compilePptxCanary(model);
    expect(artifact.bytes).toHaveLength(26_571);
    expect(createHash("sha256").update(artifact.bytes).digest("hex")).toBe(
      "4a6640e61e232e5fc89e73b99158ef16b5e5fe12304afa8253849a49491df245",
    );
  });

  it("emits deterministic native objects and a complete hash-bound map", async () => {
    const diagram = await minimalAtom();
    const first = await compilePptxBaseline(diagram, {
      placement: IDENTITY_PLACEMENT,
    });
    const second = await compilePptxBaseline(diagram, {
      placement: IDENTITY_PLACEMENT,
    });

    expect(first.pptxBytes).toEqual(second.pptxBytes);
    expect(first.mapText).toBe(second.mapText);
    expect(first.pptxSha256).toBe(
      "3c9a3f860ee17cfc49d0aa7588808bf60fff30e34a0c95985e25624853528f3f",
    );
    expect(first.mapSha256).toBe(
      "c5d1a033145df0c16e4c48cd3d7a77855dd15c5740ae7fca0bd219347051b2df",
    );
    expect(first.pptxSha256).toBe(
      createHash("sha256").update(first.pptxBytes).digest("hex"),
    );
    expect(first.mapSha256).toBe(
      createHash("sha256").update(first.mapText).digest("hex"),
    );
    expect(first.diagnostics).toEqual([]);
    expect(Object.isFrozen(first.map)).toBe(true);

    expect(first.map).toMatchObject({
      schema: "vector180-pptx-map/0.1",
      source: {
        family: "vector180",
        kind: "atom",
        id: "system-overview",
        sha256: diagram.source.sha256,
        profile: "0.1",
        metadataSha256:
          "0798eaeb2b3c60dd18e9dac5f9c34d6720228a4b67564ac7044527f855b244fe",
      },
      composition: {
        placement: IDENTITY_PLACEMENT,
        scale: 1,
        translateX: 300,
        translateY: 100,
        composedDeckSha256:
          "43b58dd79de663a399c2caaee0f275ea345d9e8f451e5851c113607a47241f23",
      },
      compiler: "office180-vector180-pptx-baseline/0.1",
      sourceResolvedSchema: "vector180-resolved-atom/0.1",
      resolvedSchema: "vector180-resolved-deck/0.1",
      pptx: {
        sha256: first.pptxSha256,
        byteLength: first.pptxBytes.byteLength,
      },
    });
    expect(first.map.pptx.partNames).toHaveLength(15);
    expect(first.map.slides[0]).toMatchObject({
      id: "system-overview",
      order: 0,
      partName: "ppt/slides/slide1.xml",
      presentationRelationshipId: "rId1",
    });

    const objects = first.map.slides[0]!.objects;
    expect(objects.map((object) => object.id)).toEqual([
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
      objects.every((object) => object.capability.classification === "native"),
    ).toBe(true);
    expect(
      objects.every(
        (object) => object.emitted.cNvPrName === `src.${object.id}`,
      ),
    ).toBe(true);
    expect(
      new Set(objects.map((object) => object.emitted.cNvPrNumericId)).size,
    ).toBe(objects.length);

    const background = objects.find(
      (object) => object.id === "system-overview.background",
    )!;
    expect(background.resolved.geometry).toMatchObject({ x: -100, y: -50 });
    expect(background.composed.geometry).toMatchObject({ x: 200, y: 50 });
    expect(background.emitted.drawingMl).toMatchObject({
      presetGeometry: "rect",
      transform: {
        offXEmu: 1_524_000,
        offYEmu: 381_000,
        extCxEmu: 9_144_000,
        extCyEmu: 6_096_000,
      },
      fill: { kind: "solid", srgbColor: "F7F9FC" },
      line: { widthEmu: 7_620, paint: { kind: "none" } },
    });

    const flow = objects.find(
      (object) => object.id === "system-overview.flow",
    )!;
    expect(flow).toMatchObject({
      kind: "line",
      resolved: {
        geometry: { x1: 340, y1: 330, x2: 660, y2: 330 },
      },
      composed: {
        geometry: { x1: 640, y1: 430, x2: 960, y2: 430 },
      },
      emitted: {
        element: "p:cxnSp",
        drawingMl: {
          presetGeometry: "line",
          transform: {
            offXEmu: 4_876_800,
            offYEmu: 3_276_600,
            extCxEmu: 2_438_400,
            extCyEmu: 0,
            flipH: false,
            flipV: false,
          },
          line: {
            widthEmu: 30_480,
            paint: { kind: "solid", srgbColor: "576B64" },
          },
        },
      },
    });

    const client = objects.find(
      (object) => object.id === "system-overview.client",
    )!;
    expect(client.source).toMatchObject({
      element: "g",
      parentId: null,
      order: 3,
    });
    expect(client.resolved.geometry).toMatchObject({
      translateX: 20,
      translateY: 0,
    });
    expect(client.composed.geometry).toMatchObject({
      translateX: 320,
      translateY: 100,
    });
    expect(client.emitted.drawingMl).toMatchObject({
      transform: {
        offXEmu: 2_286_000,
        offYEmu: 2_590_800,
        extCxEmu: 2_590_800,
        extCyEmu: 1_371_600,
        childOffXEmu: -152_400,
        childOffYEmu: 1_828_800,
      },
    });

    const title = objects.find(
      (object) => object.id === "system-overview.title",
    )!;
    expect(title.resolved.geometry).toMatchObject({
      lines: [{ text: "Standalone Vector180 diagram", x: -40, y: 58 }],
    });
    expect(title.emitted.drawingMl).toMatchObject({
      body: {
        wrap: "none",
        autofit: "none",
        marginsEmu: {
          left: 0,
          top: 91_440,
          right: 0,
          bottom: 0,
        },
      },
      run: {
        text: "Standalone Vector180 diagram",
        fontFamily: "ABeeZee",
        fontSizeHundredthPoints: 2160,
      },
    });

    const zip = await JSZip.loadAsync(first.pptxBytes, { checkCRC32: true });
    const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    const customXml = await zip.file("docProps/custom.xml")!.async("string");
    const presentationXml = await zip
      .file("ppt/presentation.xml")!
      .async("string");
    const presentationRels = await zip
      .file("ppt/_rels/presentation.xml.rels")!
      .async("string");
    expect(slideXml).toContain(
      '<a:bodyPr wrap="none" lIns="0" tIns="91440" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr>',
    );
    expect(
      slideXml.match(/<p:cNvPr id="[1-9]\d*" name="src\.[^"]+"\/>/gu),
    ).toHaveLength(objects.length);
    expect(slideXml).toContain('<a:bodyPr wrap="none"');
    expect(slideXml).toContain("<a:noAutofit/>");
    expect(customXml).toContain("office180-vector180-pptx-baseline/0.1");
    expect(customXml).toContain("vector180-pptx-map/0.1");
    expect(customXml).toContain(
      `name="vector180.atomSha256"><vt:lpwstr>${diagram.source.sha256}</vt:lpwstr>`,
    );
    expect(customXml).toContain(
      `name="vector180.sourceSha256"><vt:lpwstr>${first.map.composition.composedDeckSha256}</vt:lpwstr>`,
    );
    expect(presentationXml).toContain(
      `id="${first.map.slides[0]!.presentationNumericId}" r:id="rId1"`,
    );
    expect(presentationRels).toContain(
      'Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"',
    );
    expect(first.composedDeckSource).toBeDefined();
    expect(first.composedDeckSha256).toBe(
      first.map.composition.composedDeckSha256,
    );
  });

  it("refuses forged derived atom state that still claims the exact source hash", async () => {
    const diagram = await minimalAtom();
    const background = diagram.children[0]!;
    const forgedBackground = {
      ...background,
      attributes: { ...background.attributes, x: "201" },
    };
    const forged: Vector180Atom = {
      ...diagram,
      children: [forgedBackground, ...diagram.children.slice(1)],
    };

    await expectBaselineError(
      composeVector180AtomDeck(forged, IDENTITY_PLACEMENT),
      "VECTOR180-BASELINE-IDENTITY",
    );
    await expectBaselineError(
      compilePptxBaseline(forged, { placement: IDENTITY_PLACEMENT }),
      "VECTOR180-BASELINE-IDENTITY",
    );
  });

  it("packages one exact static PNG as an atomic mapped PowerPoint picture", async () => {
    const diagram = await rasterAtom();
    const placement: Vector180Placement = {
      slideId: "raster-picture-slide",
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      policy: "uniform-scale-translate",
    };
    const first = await compilePptxBaseline(diagram, { placement });
    const second = await compilePptxBaseline(diagram, { placement });
    expect(first.pptxBytes).toEqual(second.pptxBytes);
    expect(first.mapText).toBe(second.mapText);
    expect(first.mapText).not.toContain("data:image/png");
    expect(first.mapText).not.toContain(ONE_PIXEL_PNG_BASE64);

    const object = first.map.slides[0]!.objects[0]!;
    expect(object).toMatchObject({
      id: "raster-picture.background",
      kind: "raster-asset",
      source: {
        element: "image",
        role: "asset",
        exportMode: "raster",
        resource: {
          mediaType: "image/png",
          byteLength: 68,
          widthPixels: 1,
          heightPixels: 1,
        },
      },
      composed: {
        localBounds: { x: 100, y: 100, width: 400, height: 400 },
      },
      emitted: {
        element: "p:pic",
        drawingMl: {
          transform: {
            offXEmu: 762_000,
            offYEmu: 762_000,
            extCxEmu: 3_048_000,
            extCyEmu: 3_048_000,
          },
          picture: {
            relationshipId: "rId2",
            mediaType: "image/png",
            byteLength: 68,
            widthPixels: 1,
            heightPixels: 1,
            stretch: "fillRect",
            lockAspect: true,
          },
        },
      },
      capability: {
        classification: "atomic-raster",
        exportMode: "raster",
        compilerCapability: "c9-static-png-picture/0.1",
      },
    });
    expect(object.source.attributes).not.toHaveProperty("href");
    const digest = object.source.resource!.sha256;
    expect(object.emitted.drawingMl).toMatchObject({
      picture: {
        sha256: digest,
        partName: `ppt/media/${digest}.png`,
      },
    });
    expect(first.map.pptx.partNames).toContain(`ppt/media/${digest}.png`);

    const zip = await JSZip.loadAsync(first.pptxBytes, { checkCRC32: true });
    const [slideXml, slideRels, media] = await Promise.all([
      zip.file("ppt/slides/slide1.xml")!.async("string"),
      zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string"),
      zip.file(`ppt/media/${digest}.png`)!.async("uint8array"),
    ]);
    expect(slideXml).toContain("<p:pic>");
    expect(slideXml).toContain(
      '<p:cNvPr id="' +
        object.emitted.cNvPrNumericId +
        '" name="src.raster-picture.background"/>',
    );
    expect(slideXml).toContain('<a:blip r:embed="rId2"/>');
    expect(slideXml).toContain("<a:stretch><a:fillRect/></a:stretch>");
    expect(slideRels).toContain(
      `Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${digest}.png"`,
    );
    expect(media).toEqual(
      Uint8Array.from(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64")),
    );
  });

  it("composes deterministic identity and uniform decks that independently reload and resolve", async () => {
    const diagram = await minimalAtom();
    const [identity, identityAgain, uniform] = await Promise.all([
      composeVector180AtomDeck(diagram, IDENTITY_PLACEMENT),
      composeVector180AtomDeck(diagram, IDENTITY_PLACEMENT),
      composeVector180AtomDeck(diagram, UNIFORM_PLACEMENT),
    ]);

    expect(identity.sourceText).toBe(identityAgain.sourceText);
    expect(identity.sourceSha256).toBe(identityAgain.sourceSha256);
    expect(identity.sourceSha256).toBe(
      "43b58dd79de663a399c2caaee0f275ea345d9e8f451e5851c113607a47241f23",
    );
    expect(identity.diagnostics).toEqual([]);
    expect(identity.scale).toBe(1);
    expect(identity.translateX).toBe(300);
    expect(identity.translateY).toBe(100);
    expect(identity.sourceText).toContain(
      '"office180.vector180Composition": {',
    );
    expect(identity.sourceText).toContain(
      `"sha256": "${diagram.source.sha256}"`,
    );
    expect(identity.sourceText).toContain(
      '<script data-vector180-runtime="vector180-browser/0.1">',
    );
    expect(runtimeSource(identity.sourceText)).toBe(
      (await readFile(RUNTIME_ARTIFACT_URL, "utf8")).trimEnd(),
    );

    const identityDeck = await loadDeck({
      kind: "text",
      text: identity.sourceText,
      name: "identity.vector180.html",
    });
    expect(identityDeck.manifest.extensions).toMatchObject({
      "office180.vector180Composition": {
        schema: "vector180-composition/0.1",
        source: {
          id: diagram.id,
          kind: "atom",
          sha256: diagram.source.sha256,
        },
        placement: IDENTITY_PLACEMENT,
        transform: { scale: 1, translateX: 300, translateY: 100 },
      },
    });
    const identityResolved = resolveVector180Deck(identityDeck);
    expect(identityResolved.model).toBeDefined();
    expect(
      identityResolved.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === "error" || diagnostic.severity === "fatal",
      ),
    ).toEqual([]);
    expect(
      identityResolved.model?.slides[0]?.objects.map((object) => object.id),
    ).toEqual([
      "system-overview.background",
      "system-overview.title",
      "system-overview.flow",
      "system-overview.client",
      "system-overview.service",
    ]);

    expect(uniform).toMatchObject({
      scale: 0.5,
      translateX: 100,
      translateY: 85,
      placement: UNIFORM_PLACEMENT,
      diagnostics: [],
    });
    const scaledObjects = uniform.resolved.slides[0]!.objects;
    expect(scaledObjects[0]).toMatchObject({
      id: "system-overview.background",
      kind: "rect",
      x: 50,
      y: 60,
      width: 600,
      height: 400,
      style: { strokeWidth: 0.5 },
    });
    expect(scaledObjects[1]).toMatchObject({
      id: "system-overview.title",
      kind: "text",
      frame: { x: 80, y: 90, width: 540, height: 35 },
      lineStep: 22,
      lines: [{ text: "Standalone Vector180 diagram", x: 80, y: 114 }],
      style: { fontSize: 18, strokeWidth: 0.5 },
    });
    expect(scaledObjects[2]).toMatchObject({
      id: "system-overview.flow",
      kind: "line",
      x1: 270,
      y1: 250,
      x2: 430,
      y2: 250,
      style: { strokeWidth: 2 },
    });
    expect(scaledObjects[3]).toMatchObject({
      id: "system-overview.client",
      kind: "group",
      translateX: 110,
      translateY: 85,
    });

    const baseline = await compilePptxBaseline(diagram, {
      placement: UNIFORM_PLACEMENT,
    });
    expect(baseline.map.composition).toMatchObject({
      scale: 0.5,
      translateX: 100,
      translateY: 85,
      composedDeckSha256: uniform.sourceSha256,
    });
    expect(
      baseline.map.slides[0]!.objects.every(
        (object) => object.composition.scale === 0.5,
      ),
    ).toBe(true);
  });

  it("retains ellipse and nested translated-group semantics", async () => {
    const source = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
    const withEllipse = source.replace(
      /  <g id="system-overview\.client"[\s\S]*?  <\/g>/u,
      `  <g id="system-overview.client"
     data-vector180-role="group"
     data-vector180-export="native"
     transform="translate(20 0)">
    <g id="system-overview.client.inner"
       data-vector180-role="group"
       data-vector180-export="native"
       transform="translate(5 7)">
      <ellipse id="system-overview.client.panel"
               data-vector180-role="shape"
               data-vector180-export="native"
               cx="150"
               cy="330"
               rx="170"
               ry="90"
               fill="#e4f2ec"
               stroke="#24735d"
               stroke-width="3"/>
      <text id="system-overview.client.label"
            data-vector180-role="text"
            data-vector180-export="native"
            data-vector180-frame="20 285 260 60"
            data-vector180-line-step="34"
            x="20"
            y="326"
            fill="#17211e"
            font-family="Arial"
            font-size="28"
            font-weight="700">Client</text>
    </g>
  </g>`,
    );
    expect(withEllipse).not.toBe(source);
    const diagram = await loadAtom({
      kind: "text",
      text: withEllipse,
      name: "ellipse-nested.vector180.svg",
    });
    expect(diagram.diagnostics).toEqual([]);

    const artifact = await compilePptxBaseline(diagram, {
      placement: {
        ...IDENTITY_PLACEMENT,
        slideId: "diagram-slide",
      },
    });
    const objects = artifact.map.slides[0]!.objects;
    const inner = objects.find(
      (object) => object.id === "system-overview.client.inner",
    )!;
    const ellipse = objects.find(
      (object) => object.id === "system-overview.client.panel",
    )!;

    expect(artifact.map.source.id).toBe("system-overview");
    expect(artifact.map.slides[0]!.id).toBe("diagram-slide");
    expect(inner).toMatchObject({
      kind: "group",
      parentId: "system-overview.client",
      resolved: {
        geometry: { translateX: 5, translateY: 7 },
        worldOffset: { x: 25, y: 7 },
      },
      composed: {
        geometry: { translateX: 5, translateY: 7 },
        worldOffset: { x: 325, y: 107 },
      },
    });
    expect(ellipse).toMatchObject({
      kind: "ellipse",
      parentId: "system-overview.client.inner",
      resolved: {
        geometry: {
          sourceElement: "ellipse",
          cx: 150,
          cy: 330,
          rx: 170,
          ry: 90,
        },
      },
      composed: {
        geometry: {
          cx: 150,
          cy: 330,
        },
        worldOffset: { x: 325, y: 107 },
      },
      emitted: {
        element: "p:sp",
        drawingMl: {
          presetGeometry: "ellipse",
          transform: {
            offXEmu: -152_400,
            offYEmu: 1_828_800,
            extCxEmu: 2_590_800,
            extCyEmu: 1_371_600,
          },
        },
      },
    });

    const scaled = await compilePptxBaseline(diagram, {
      placement: UNIFORM_PLACEMENT,
    });
    const scaledInner = scaled.map.slides[0]!.objects.find(
      (object) => object.id === "system-overview.client.inner",
    )!;
    const scaledEllipse = scaled.map.slides[0]!.objects.find(
      (object) => object.id === "system-overview.client.panel",
    )!;
    expect(scaledInner).toMatchObject({
      composed: {
        geometry: { translateX: 2.5, translateY: 3.5 },
        worldOffset: { x: 112.5, y: 88.5 },
      },
      composition: { scale: 0.5, translateX: 100, translateY: 85 },
    });
    expect(scaledEllipse).toMatchObject({
      composed: {
        geometry: { cx: 75, cy: 165, rx: 85, ry: 45 },
        worldOffset: { x: 112.5, y: 88.5 },
      },
      emitted: {
        drawingMl: {
          transform: {
            offXEmu: -76_200,
            offYEmu: 914_400,
            extCxEmu: 1_295_400,
            extCyEmu: 685_800,
          },
        },
      },
    });
  });

  it("is byte-identical in separate processes and time zones", () => {
    const repositoryRoot = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const script = `
      import { readFile } from "node:fs/promises";
      import { loadAtom } from "./packages/vector180/src/core/deck.ts";
      import { compilePptxBaseline } from "./packages/vector180/src/node/pptx-baseline.ts";
      const source = await readFile("examples/minimal-diagram.vector180.svg", "utf8");
      const diagram = await loadAtom({ kind: "text", text: source });
      const artifact = await compilePptxBaseline(diagram, {
        placement: {
          slideId: "system-overview",
          x: 200,
          y: 50,
          width: 1200,
          height: 800,
          policy: "identity",
        },
      });
      process.stdout.write(artifact.pptxSha256 + ":" + artifact.mapSha256);
    `;
    const run = (timezone: string) =>
      spawnSync(
        process.execPath,
        ["--import=tsx", "--input-type=module", "--eval", script],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: { ...process.env, TZ: timezone },
        },
      );
    const utc = run("UTC");
    const pacific = run("America/Los_Angeles");

    expect(utc.status).toBe(0);
    expect(pacific.status).toBe(0);
    expect(utc.stderr).toBe("");
    expect(pacific.stderr).toBe("");
    expect(utc.stdout).toMatch(/^[0-9a-f]{64}:[0-9a-f]{64}$/u);
    expect(pacific.stdout).toBe(utc.stdout);
  });

  it("refuses aspect mismatch and every boundary outside the standalone native slice", async () => {
    const diagram = await minimalAtom();
    await expectBaselineError(
      compilePptxBaseline(diagram),
      "VECTOR180-BASELINE-PLACEMENT-REQUIRED",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: {
          ...UNIFORM_PLACEMENT,
          width: 601,
          policy: "uniform-scale-translate",
        },
      }),
      "VECTOR180-BASELINE-ASPECT",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: { ...IDENTITY_PLACEMENT, width: 1000 },
      }),
      "VECTOR180-BASELINE-PLACEMENT",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: { ...IDENTITY_PLACEMENT, x: 500 },
      }),
      "VECTOR180-BASELINE-PLACEMENT",
    );
    await expectBaselineError(
      compilePptxBaseline(await minimalDeck()),
      "VECTOR180-BASELINE-UNSUPPORTED",
    );

    const source = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
    const rounded = await loadAtom({
      kind: "text",
      text: source.replace(
        'id="system-overview.background"',
        'id="system-overview.background" rx="12"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(rounded, { placement: IDENTITY_PLACEMENT }),
      "VECTOR180-BASELINE-UNSUPPORTED",
    );

    const flattened = await loadAtom({
      kind: "text",
      text: source.replace(
        'id="system-overview.background"\n        data-vector180-role="shape"\n        data-vector180-export="native"',
        'id="system-overview.background"\n        data-vector180-role="shape"\n        data-vector180-export="svg"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(flattened, { placement: IDENTITY_PLACEMENT }),
      "VECTOR180-BASELINE-UNSUPPORTED",
    );

    const transformed = await loadAtom({
      kind: "text",
      text: source.replace(
        'transform="translate(20 0)"',
        'transform="translate(20 0) rotate(5)"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(transformed, { placement: IDENTITY_PLACEMENT }),
      "VECTOR180-BASELINE-UNSUPPORTED",
    );

    const invalid = await loadAtom({
      kind: "text",
      text: source.replace(
        'id="system-overview.title"',
        'id="system-overview.background"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(invalid, { placement: IDENTITY_PLACEMENT }),
      "VECTOR180-BASELINE-INVALID-SOURCE",
    );
  });

  it("publishes the PPTX and map together and rolls back either-side conflicts", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.vector180.svg");
      const outputPath = join(directory, "atom.pptx");
      const mapPath = join(directory, "atom.vector180.map.json");
      await writeFile(sourcePath, await readFile(MINIMAL_DIAGRAM_URL, "utf8"));
      const capture = captureEnvironment();

      const exitCode = await runCli(
        [
          "compile",
          sourcePath,
          "--placement",
          "50,60,600,400",
          "--slide-id",
          "scaled-overview",
          "--policy",
          "uniform-scale-translate",
          "--output",
          outputPath,
          "--map",
          mapPath,
          "--format",
          "json",
        ],
        capture.environment,
      );
      const summary = JSON.parse(capture.stdout.join("")) as {
        schema: string;
        atomSha256: string;
        composedDeckSha256: string;
        pptxSha256: string;
        mapSha256: string;
        objectCount: number;
      };
      const pptx = await readFile(outputPath);
      const mapText = await readFile(mapPath, "utf8");
      const map = JSON.parse(mapText) as {
        schema: string;
        source: { sha256: string };
        composition: {
          placement: Vector180Placement;
          scale: number;
          composedDeckSha256: string;
        };
        pptx: { sha256: string };
      };

      expect(exitCode).toBe(0);
      expect(summary).toMatchObject({
        schema: "vector180-pptx-baseline-result/0.1",
        atomSha256: map.source.sha256,
        composedDeckSha256: map.composition.composedDeckSha256,
        objectCount: 9,
      });
      expect(summary).not.toHaveProperty("sourceSha256");
      expect(summary.pptxSha256).toBe(
        createHash("sha256").update(pptx).digest("hex"),
      );
      expect(summary.mapSha256).toBe(
        createHash("sha256").update(mapText).digest("hex"),
      );
      expect(map).toMatchObject({
        schema: "vector180-pptx-map/0.1",
        composition: {
          placement: UNIFORM_PLACEMENT,
          scale: 0.5,
        },
        pptx: { sha256: summary.pptxSha256 },
      });
      expect(capture.stderr).toEqual([]);
    });

    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.vector180.svg");
      const outputPath = join(directory, "atom.pptx");
      const mapPath = join(directory, "atom.vector180.map.json");
      await writeFile(sourcePath, await readFile(MINIMAL_DIAGRAM_URL, "utf8"));
      await writeFile(mapPath, "keep me");
      const capture = captureEnvironment();

      const exitCode = await runCli(
        [
          "compile",
          sourcePath,
          "--placement",
          "200,50,1200,800",
          "--output",
          outputPath,
          "--map",
          mapPath,
        ],
        capture.environment,
      );

      expect(exitCode).toBe(1);
      expect(capture.stderr.join("")).toContain("VECTOR180-BASELINE-EXISTS");
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(mapPath, "utf8")).toBe("keep me");
    });
  });

  it("publishes composed decks without overwrite or partial source mutation", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.vector180.svg");
      const outputPath = join(directory, "deck.vector180.html");
      const sourceText = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
      await writeFile(sourcePath, sourceText);
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "compose",
            sourcePath,
            "--placement",
            "50,60,600,400",
            "--slide-id",
            "scaled-overview",
            "--policy",
            "uniform-scale-translate",
            "--output",
            outputPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "vector180-compose-result/0.1",
        output: outputPath,
        placement: UNIFORM_PLACEMENT,
        transform: { scale: 0.5, translateX: 100, translateY: 85 },
      });
      const composedText = await readFile(outputPath, "utf8");
      const composedDeck = await loadDeck({
        kind: "text",
        text: composedText,
        name: "deck.vector180.html",
      });
      expect(resolveVector180Deck(composedDeck).model).toBeDefined();
      expect(await readFile(sourcePath, "utf8")).toBe(sourceText);

      const conflict = captureEnvironment();
      expect(
        await runCli(
          [
            "compose",
            sourcePath,
            "--placement",
            "200,50,1200,800",
            "--output",
            outputPath,
          ],
          conflict.environment,
        ),
      ).toBe(1);
      expect(conflict.stderr.join("")).toContain("VECTOR180-BASELINE-EXISTS");
      expect(await readFile(outputPath, "utf8")).toBe(composedText);
      expect(await readFile(sourcePath, "utf8")).toBe(sourceText);

      const refusedPath = join(directory, "refused.vector180.html");
      const refused = captureEnvironment();
      expect(
        await runCli(
          [
            "compose",
            sourcePath,
            "--placement",
            "50,60,601,400",
            "--policy",
            "uniform-scale-translate",
            "--output",
            refusedPath,
          ],
          refused.environment,
        ),
      ).toBe(1);
      expect(refused.stderr.join("")).toContain("VECTOR180-BASELINE-ASPECT");
      await expect(readFile(refusedPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(sourcePath, "utf8")).toBe(sourceText);
    });
  });

  it("treats missing destinations and malformed placement as invocation errors", async () => {
    const missing = captureEnvironment();
    expect(
      await runCli(
        [
          "compile",
          "atom.vector180.svg",
          "--placement",
          "0,0,1600,900",
          "--output",
          "atom.pptx",
        ],
        missing.environment,
      ),
    ).toBe(2);
    expect(missing.stderr.join("")).toContain(
      "requires explicit --placement X,Y,W,H, --output PATH, and --map PATH",
    );

    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.vector180.svg");
      await writeFile(sourcePath, await readFile(MINIMAL_DIAGRAM_URL, "utf8"));
      const missingPlacement = captureEnvironment();
      expect(
        await runCli(
          [
            "compile",
            sourcePath,
            "--output",
            join(directory, "missing-placement.pptx"),
            "--map",
            join(directory, "missing-placement.json"),
          ],
          missingPlacement.environment,
        ),
      ).toBe(2);
      expect(missingPlacement.stderr.join("")).toContain(
        "requires explicit --placement X,Y,W,H",
      );

      const malformed = captureEnvironment();
      expect(
        await runCli(
          [
            "compile",
            sourcePath,
            "--placement",
            "0,0,1600",
            "--output",
            join(directory, "atom.pptx"),
            "--map",
            join(directory, "atom.json"),
          ],
          malformed.environment,
        ),
      ).toBe(2);
      expect(malformed.stderr.join("")).toContain(
        "--placement requires exactly four",
      );
    });
  });
});
