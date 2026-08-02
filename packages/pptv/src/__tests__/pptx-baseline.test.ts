// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C6-PPTV-RESOLVED.1.1,
// CONTRACT:C7-PPTX-CANARY.1.1, CONTRACT:C9-PPTV-PPTX-BASELINE.1.0

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck, loadDiagram } from "../core/deck.js";
import { resolvePptvDeck, type PptvResolvedDeck } from "../core/resolved.js";
import type { PptvDeck, PptvDiagram } from "../core/types.js";
import {
  composePptvDiagramDeck,
  compilePptxBaseline,
  type PptvPlacement,
  type PptvPptxBaselineErrorCode,
} from "../node/pptx-baseline.js";
import { compilePptxCanary } from "../node/pptx-canary.js";
import { readMinimalDeck, runtimeSource } from "./test-helpers.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
  import.meta.url,
);
const RUNTIME_ARTIFACT_URL = new URL(
  "../../assets/pptv-browser-0.1.script.html",
  import.meta.url,
);
const IDENTITY_PLACEMENT: PptvPlacement = {
  slideId: "system-overview",
  x: 200,
  y: 50,
  width: 1200,
  height: 800,
  policy: "identity",
};
const UNIFORM_PLACEMENT: PptvPlacement = {
  slideId: "scaled-overview",
  x: 50,
  y: 60,
  width: 600,
  height: 400,
  policy: "uniform-scale-translate",
};

async function minimalDiagram(): Promise<PptvDiagram> {
  return loadDiagram({
    kind: "text",
    text: await readFile(MINIMAL_DIAGRAM_URL, "utf8"),
    name: "minimal-diagram.pptv.svg",
  });
}

async function minimalDeck(): Promise<PptvDeck> {
  return loadDeck({
    kind: "text",
    text: await readMinimalDeck(),
    name: "minimal-deck.pptv.html",
  });
}

function expectBaselineError(
  promise: Promise<unknown>,
  code: PptvPptxBaselineErrorCode,
): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: "PptvPptxBaselineCompileError",
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
  const directory = await mkdtemp(join(tmpdir(), "pptv-baseline-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("C9 standalone atom PPTX baseline", () => {
  it("preserves the exact C7 canary when package lineage options are omitted", async () => {
    const resolved = resolvePptvDeck(await minimalDeck());
    expect(resolved.model).toBeDefined();
    const model = structuredClone(resolved.model) as PptvResolvedDeck;
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
    expect(artifact.bytes).toHaveLength(26_412);
    expect(createHash("sha256").update(artifact.bytes).digest("hex")).toBe(
      "8709452fe68f909ca4c469486e6e4c3e7bbde25dff114fdc79587cc75b8e8c96",
    );
  });

  it("emits deterministic native objects and a complete hash-bound map", async () => {
    const diagram = await minimalDiagram();
    const first = await compilePptxBaseline(diagram, {
      placement: IDENTITY_PLACEMENT,
    });
    const second = await compilePptxBaseline(diagram, {
      placement: IDENTITY_PLACEMENT,
    });

    expect(first.pptxBytes).toEqual(second.pptxBytes);
    expect(first.mapText).toBe(second.mapText);
    expect(first.pptxSha256).toBe(
      "a6ff1d71329f865f699258848bb14742b604748d5902645c8f27d38c33772ff8",
    );
    expect(first.mapSha256).toBe(
      "abfce850f0a0cf8fa8da435825ae051e3a774236c83e914e76a05e9ec43129f1",
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
      schema: "pptv-pptx-map/0.1",
      source: {
        kind: "diagram",
        id: "system-overview",
        sha256: diagram.source.sha256,
        profile: "0.1",
      },
      composition: {
        placement: IDENTITY_PLACEMENT,
        scale: 1,
        translateX: 300,
        translateY: 100,
        composedDeckSha256:
          "8a4434ba1c6d0d9f02fc9d5bd5c1e5ff742f1f318571db070d8ecfc14f752360",
      },
      compiler: "office180-pptv-pptx-baseline/0.1",
      sourceResolvedSchema: "pptv-resolved-diagram/0.1",
      resolvedSchema: "pptv-resolved/0.1",
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
      lines: [{ text: "Standalone PPTV diagram", x: -40, y: 58 }],
    });
    expect(title.emitted.drawingMl).toMatchObject({
      body: {
        wrap: "none",
        autofit: "none",
      },
      run: {
        text: "Standalone PPTV diagram",
        fontFamily: "Arial",
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
    expect(
      slideXml.match(/<p:cNvPr id="[1-9]\d*" name="src\.[^"]+"\/>/gu),
    ).toHaveLength(objects.length);
    expect(slideXml).toContain('<a:bodyPr wrap="none"');
    expect(slideXml).toContain("<a:noAutofit/>");
    expect(customXml).toContain("office180-pptv-pptx-baseline/0.1");
    expect(customXml).toContain("pptv-pptx-map/0.1");
    expect(customXml).toContain(
      `name="pptv.atomSha256"><vt:lpwstr>${diagram.source.sha256}</vt:lpwstr>`,
    );
    expect(customXml).toContain(
      `name="pptv.sourceSha256"><vt:lpwstr>${first.map.composition.composedDeckSha256}</vt:lpwstr>`,
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

  it("composes deterministic identity and uniform decks that independently reload and resolve", async () => {
    const diagram = await minimalDiagram();
    const [identity, identityAgain, uniform] = await Promise.all([
      composePptvDiagramDeck(diagram, IDENTITY_PLACEMENT),
      composePptvDiagramDeck(diagram, IDENTITY_PLACEMENT),
      composePptvDiagramDeck(diagram, UNIFORM_PLACEMENT),
    ]);

    expect(identity.sourceText).toBe(identityAgain.sourceText);
    expect(identity.sourceSha256).toBe(identityAgain.sourceSha256);
    expect(identity.sourceSha256).toBe(
      "8a4434ba1c6d0d9f02fc9d5bd5c1e5ff742f1f318571db070d8ecfc14f752360",
    );
    expect(identity.diagnostics).toEqual([]);
    expect(identity.scale).toBe(1);
    expect(identity.translateX).toBe(300);
    expect(identity.translateY).toBe(100);
    expect(identity.sourceText).toContain('"office180.c9Composition": {');
    expect(identity.sourceText).toContain(
      `"sha256": "${diagram.source.sha256}"`,
    );
    expect(identity.sourceText).toContain(
      '<script data-pptv-runtime="pptv-browser/0.1">',
    );
    expect(runtimeSource(identity.sourceText)).toBe(
      (await readFile(RUNTIME_ARTIFACT_URL, "utf8")).trimEnd(),
    );

    const identityDeck = await loadDeck({
      kind: "text",
      text: identity.sourceText,
      name: "identity.pptv.html",
    });
    expect(identityDeck.manifest.extensions).toMatchObject({
      "office180.c9Composition": {
        schema: "pptv-c9-composition/0.1",
        source: {
          id: diagram.id,
          kind: "diagram",
          sha256: diagram.source.sha256,
        },
        placement: IDENTITY_PLACEMENT,
        transform: { scale: 1, translateX: 300, translateY: 100 },
      },
    });
    const identityResolved = resolvePptvDeck(identityDeck);
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
      lines: [{ text: "Standalone PPTV diagram", x: 80, y: 114 }],
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
     data-pptv-role="group"
     data-pptv-export="native"
     transform="translate(20 0)">
    <g id="system-overview.client.inner"
       data-pptv-role="group"
       data-pptv-export="native"
       transform="translate(5 7)">
      <ellipse id="system-overview.client.panel"
               data-pptv-role="shape"
               data-pptv-export="native"
               cx="150"
               cy="330"
               rx="170"
               ry="90"
               fill="#e4f2ec"
               stroke="#24735d"
               stroke-width="3"/>
      <text id="system-overview.client.label"
            data-pptv-role="text"
            data-pptv-export="native"
            data-pptv-frame="20 285 260 60"
            data-pptv-line-step="34"
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
    const diagram = await loadDiagram({
      kind: "text",
      text: withEllipse,
      name: "ellipse-nested.pptv.svg",
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
      import { loadDiagram } from "./packages/pptv/src/core/deck.ts";
      import { compilePptxBaseline } from "./packages/pptv/src/node/pptx-baseline.ts";
      const source = await readFile("examples/minimal-diagram.pptv.svg", "utf8");
      const diagram = await loadDiagram({ kind: "text", text: source });
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
    const diagram = await minimalDiagram();
    await expectBaselineError(
      compilePptxBaseline(diagram),
      "PPTV-BASELINE-PLACEMENT-REQUIRED",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: {
          ...UNIFORM_PLACEMENT,
          width: 601,
          policy: "uniform-scale-translate",
        },
      }),
      "PPTV-BASELINE-ASPECT",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: { ...IDENTITY_PLACEMENT, width: 1000 },
      }),
      "PPTV-BASELINE-PLACEMENT",
    );
    await expectBaselineError(
      compilePptxBaseline(diagram, {
        placement: { ...IDENTITY_PLACEMENT, x: 500 },
      }),
      "PPTV-BASELINE-PLACEMENT",
    );
    await expectBaselineError(
      compilePptxBaseline(await minimalDeck()),
      "PPTV-BASELINE-UNSUPPORTED",
    );

    const source = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
    const rounded = await loadDiagram({
      kind: "text",
      text: source.replace(
        'id="system-overview.background"',
        'id="system-overview.background" rx="12"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(rounded, { placement: IDENTITY_PLACEMENT }),
      "PPTV-BASELINE-UNSUPPORTED",
    );

    const flattened = await loadDiagram({
      kind: "text",
      text: source.replace(
        'id="system-overview.background"\n        data-pptv-role="shape"\n        data-pptv-export="native"',
        'id="system-overview.background"\n        data-pptv-role="shape"\n        data-pptv-export="svg"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(flattened, { placement: IDENTITY_PLACEMENT }),
      "PPTV-BASELINE-UNSUPPORTED",
    );

    const transformed = await loadDiagram({
      kind: "text",
      text: source.replace(
        'transform="translate(20 0)"',
        'transform="translate(20 0) rotate(5)"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(transformed, { placement: IDENTITY_PLACEMENT }),
      "PPTV-BASELINE-UNSUPPORTED",
    );

    const invalid = await loadDiagram({
      kind: "text",
      text: source.replace(
        'id="system-overview.title"',
        'id="system-overview.background"',
      ),
    });
    await expectBaselineError(
      compilePptxBaseline(invalid, { placement: IDENTITY_PLACEMENT }),
      "PPTV-BASELINE-INVALID-SOURCE",
    );
  });

  it("publishes the PPTX and map together and rolls back either-side conflicts", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.pptv.svg");
      const outputPath = join(directory, "atom.pptx");
      const mapPath = join(directory, "atom.pptv.map.json");
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
          placement: PptvPlacement;
          scale: number;
          composedDeckSha256: string;
        };
        pptx: { sha256: string };
      };

      expect(exitCode).toBe(0);
      expect(summary).toMatchObject({
        schema: "pptv-pptx-baseline-result/0.1",
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
        schema: "pptv-pptx-map/0.1",
        composition: {
          placement: UNIFORM_PLACEMENT,
          scale: 0.5,
        },
        pptx: { sha256: summary.pptxSha256 },
      });
      expect(capture.stderr).toEqual([]);
    });

    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.pptv.svg");
      const outputPath = join(directory, "atom.pptx");
      const mapPath = join(directory, "atom.pptv.map.json");
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
      expect(capture.stderr.join("")).toContain("PPTV-BASELINE-EXISTS");
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(mapPath, "utf8")).toBe("keep me");
    });
  });

  it("publishes composed decks without overwrite or partial source mutation", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "atom.pptv.svg");
      const outputPath = join(directory, "deck.pptv.html");
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
        schema: "pptv-compose-result/0.1",
        output: outputPath,
        placement: UNIFORM_PLACEMENT,
        transform: { scale: 0.5, translateX: 100, translateY: 85 },
      });
      const composedText = await readFile(outputPath, "utf8");
      const composedDeck = await loadDeck({
        kind: "text",
        text: composedText,
        name: "deck.pptv.html",
      });
      expect(resolvePptvDeck(composedDeck).model).toBeDefined();
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
      expect(conflict.stderr.join("")).toContain("PPTV-BASELINE-EXISTS");
      expect(await readFile(outputPath, "utf8")).toBe(composedText);
      expect(await readFile(sourcePath, "utf8")).toBe(sourceText);

      const refusedPath = join(directory, "refused.pptv.html");
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
      expect(refused.stderr.join("")).toContain("PPTV-BASELINE-ASPECT");
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
          "atom.pptv.svg",
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
      const sourcePath = join(directory, "atom.pptv.svg");
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
