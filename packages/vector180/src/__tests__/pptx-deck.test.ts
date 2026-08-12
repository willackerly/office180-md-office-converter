// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C6-PPTV-RESOLVED.2.0,
// CONTRACT:C7-PPTX-CANARY.2.0, CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck } from "../core/deck.js";
import { sha256HexSync } from "../core/source.js";
import type { Vector180Deck, Vector180Node } from "../core/types.js";
import {
  compileVector180PptxDeck,
  type Vector180PptxDeckErrorCode,
} from "../node/pptx-deck.js";
import { readMinimalDeck, runtimeSource } from "./test-helpers.js";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SLIDE_ORDER = ["zeta", "alpha", "middle", "beta", "omega"] as const;

async function fiveSlideDeckSource(): Promise<string> {
  const runtime = runtimeSource(await readMinimalDeck());
  const manifest = {
    vector180: "0.1",
    title: "Five-slide mapped acceptance deck",
    runtime: "vector180-browser/0.1",
    theme: "local",
    slides: SLIDE_ORDER.map((id) =>
      id === "middle" ? { id, hidden: true } : id,
    ),
  };
  const templates = [...SLIDE_ORDER]
    .sort()
    .map(
      (id, index) => `<template data-vector180-slide="${id}">
  <svg id="${id}" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
    <image id="${id}.background" data-vector180-role="asset" data-vector180-export="raster"
      data-vector180-bounds="20 20 1 1" x="20" y="20" width="1" height="1"
      href="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}"/>
    <rect id="${id}.panel" data-vector180-role="shape" data-vector180-export="native"
      x="${100 + index * 10}" y="200" width="1200" height="400"
      fill="#f2f5f4" stroke="#6f5cff" stroke-width="4"/>
    <text id="${id}.title" data-vector180-role="text" data-vector180-export="native"
      data-vector180-frame="140 260 1120 120" data-vector180-line-step="64"
      x="140" y="340" fill="#17211e" stroke="none" stroke-width="1"
      font-family="ABeeZee" font-size="52" font-weight="400"
      font-style="normal" text-anchor="start">${id} mapped slide</text>
  </svg>
</template>`,
    )
    .join("\n\n");
  return `<!doctype html>
<html lang="en" data-vector180-version="0.1">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Five-slide mapped acceptance deck</title>
</head>
<body>
<script id="vector180-manifest" type="application/vnd.office180.vector180+json">
${JSON.stringify(manifest, null, 2)}
</script>
<main data-vector180-output></main>
${templates}
<script type="text/css" data-vector180-style="base">
</script>
<script type="text/css" data-vector180-theme="local">
:root {
}
</script>
${runtime}
</body>
</html>
`;
}

async function fiveSlideDeck(): Promise<Vector180Deck> {
  return loadDeck({
    kind: "text",
    text: await fiveSlideDeckSource(),
    name: "acceptance.vector180.html",
  });
}

function expectDeckError(
  promise: Promise<unknown>,
  code: Vector180PptxDeckErrorCode,
): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: "Vector180PptxDeckCompileError",
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
  const directory = await mkdtemp(join(tmpdir(), "vector180-deck-pptx-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("mapped multi-slide Vector180 deck compilation", () => {
  it("publishes a strict descriptor-only map schema", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../../../schemas/vector180-pptx-deck-map-0.1.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      $id: string;
      properties: { schema: { const: string } };
      $defs: {
        source: { properties: { kind: { const: string } } };
        sourceObject: {
          properties: {
            attributes: { propertyNames: { not: { pattern: string } } };
          };
        };
      };
    };
    expect(schema.$id).toBe(
      "https://office180.dev/schemas/vector180-pptx-deck-map-0.1.schema.json",
    );
    expect(schema.properties.schema.const).toBe("vector180-pptx-deck-map/0.1");
    expect(schema.$defs.source.properties.kind.const).toBe("deck");
    const forbiddenAttribute = new RegExp(
      schema.$defs.sourceObject.properties.attributes.propertyNames.not.pattern,
      "u",
    );
    expect(forbiddenAttribute.test("xlink:href")).toBe(true);

    const artifact = await compileVector180PptxDeck(await fiveSlideDeck());
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );
    expect(
      validate(artifact.map),
      JSON.stringify(validate.errors, null, 2),
    ).toBe(true);
  });

  it("emits a deterministic five-slide editable PPTX and descriptor-only map", async () => {
    const deck = await fiveSlideDeck();
    expect(deck.diagnostics).toEqual([]);
    const first = await compileVector180PptxDeck(deck);
    const second = await compileVector180PptxDeck(deck);

    expect(first.pptxBytes).toEqual(second.pptxBytes);
    expect(first.mapText).toBe(second.mapText);
    expect(first.pptxSha256).toBe(sha256HexSync(first.pptxBytes));
    expect(first.mapSha256).toBe(
      sha256HexSync(new TextEncoder().encode(first.mapText)),
    );
    expect(first.map).toMatchObject({
      schema: "vector180-pptx-deck-map/0.1",
      compiler: "office180-vector180-pptx-deck/0.1",
      sourceResolvedSchema: "vector180-resolved-deck/0.1",
      source: {
        family: "vector180",
        kind: "deck",
        sha256: deck.source.sha256,
        byteLength: deck.source.byteLength,
        profile: "0.1",
        activeTheme: "local",
        slideOrder: SLIDE_ORDER,
      },
      pptx: {
        sha256: first.pptxSha256,
        byteLength: first.pptxBytes.byteLength,
      },
    });
    expect(first.map.slides.map((slide) => slide.id)).toEqual(SLIDE_ORDER);
    expect(
      first.map.slides.map((slide) => [
        slide.id,
        slide.partName,
        slide.presentationRelationshipId,
      ]),
    ).toEqual([
      ["zeta", "ppt/slides/slide5.xml", "rId5"],
      ["alpha", "ppt/slides/slide1.xml", "rId1"],
      ["middle", "ppt/slides/slide3.xml", "rId3"],
      ["beta", "ppt/slides/slide2.xml", "rId2"],
      ["omega", "ppt/slides/slide4.xml", "rId4"],
    ]);
    expect(first.map.slides[2]).toMatchObject({ hidden: true });
    expect(first.map.slides.every((slide) => slide.objects.length === 3)).toBe(
      true,
    );
    expect(first.mapText).not.toContain("data:image/png");
    expect(first.mapText).not.toContain(ONE_PIXEL_PNG_BASE64);

    const pictureObjects = first.map.slides.map((slide) => slide.objects[0]!);
    const digests = new Set(
      pictureObjects.map((object) => object.source.resource!.sha256),
    );
    expect(digests.size).toBe(1);
    expect(
      pictureObjects.every(
        (object) =>
          object.emitted.element === "p:pic" &&
          object.emitted.imageRelationship?.relationshipId === "rId2" &&
          object.capability.compilerCapability ===
            "deck-static-png-picture/0.1" &&
          !Object.hasOwn(object.source.attributes, "href"),
      ),
    ).toBe(true);

    const digest = pictureObjects[0]!.source.resource!.sha256;
    expect(first.map.pptx.relationships).toContainEqual({
      source: "ppt/slides/slide5.xml",
      id: "rId2",
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      target: `../media/${digest}.png`,
    });
    const zip = await JSZip.loadAsync(first.pptxBytes, { checkCRC32: true });
    expect(
      Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/")),
    ).toEqual([`ppt/media/${digest}.png`]);
    const presentationXml = await zip
      .file("ppt/presentation.xml")!
      .async("string");
    expect(
      [
        ...presentationXml.matchAll(
          /<p:sldId id="[1-9]\d*" r:id="(rId[1-9]\d*)"\/>/gu,
        ),
      ].map((match) => match[1]),
    ).toEqual(["rId5", "rId1", "rId3", "rId2", "rId4"]);
    expect(await zip.file("ppt/slides/slide3.xml")!.async("string")).toContain(
      'show="0"',
    );
  });

  it("allocates multiple same-slide pictures contiguously while deduplicating media", async () => {
    const secondPicture = `<image id="zeta.foreground" data-vector180-role="asset" data-vector180-export="raster"
      data-vector180-bounds="40 40 1 1" x="40" y="40" width="1" height="1"
      href="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}"/>`;
    const source = (await fiveSlideDeckSource()).replace(
      '    <rect id="zeta.panel"',
      `    ${secondPicture}\n    <rect id="zeta.panel"`,
    );
    const deck = await loadDeck({
      kind: "text",
      text: source,
      name: "two-pictures.vector180.html",
    });
    const artifact = await compileVector180PptxDeck(deck);
    const slide = artifact.map.slides.find(({ id }) => id === "zeta")!;
    const pictures = slide.objects.filter(
      (object) => object.kind === "raster-asset",
    );
    expect(
      pictures.map(
        (object) => object.emitted.imageRelationship?.relationshipId,
      ),
    ).toEqual(["rId2", "rId3"]);
    expect(
      new Set(
        pictures.map((object) => object.emitted.imageRelationship?.partName),
      ).size,
    ).toBe(1);

    const zip = await JSZip.loadAsync(artifact.pptxBytes, { checkCRC32: true });
    expect(
      Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/")),
    ).toHaveLength(1);
    expect(
      await zip.file("ppt/slides/_rels/slide5.xml.rels")!.async("string"),
    ).toContain('Id="rId3"');
  });

  it("is byte-identical with an identical map across processes and time zones", () => {
    const repositoryRoot = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const script = `
      import { readFile } from "node:fs/promises";
      import { loadDeck } from "./packages/vector180/src/core/deck.ts";
      import { compileVector180PptxDeck } from "./packages/vector180/src/node/pptx-deck.ts";
      const source = await readFile("examples/minimal-deck.vector180.html", "utf8");
      const deck = await loadDeck({ kind: "text", text: source });
      const artifact = await compileVector180PptxDeck(deck);
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

  it("authenticates retained PNG bytes and refuses partial or unsupported decks", async () => {
    const deck = await fiveSlideDeck();
    const zeta = deck.slides.get("zeta")!;
    const sourceImage = zeta.children[0]!;
    const image: Vector180Node = {
      ...sourceImage,
      attributes: {
        ...sourceImage.attributes,
        href: sourceImage.attributes["href"]!.replace(/II=$/u, "IJ="),
      },
    };
    const tamperedSlides = new Map(deck.slides);
    tamperedSlides.set("zeta", {
      ...zeta,
      children: [image, ...zeta.children.slice(1)],
    });
    const tampered: Vector180Deck = { ...deck, slides: tamperedSlides };
    await expectDeckError(
      compileVector180PptxDeck(tampered),
      "VECTOR180-DECK-PPTX-IDENTITY",
    );

    const partial = await loadDeck(
      {
        kind: "text",
        text: await fiveSlideDeckSource(),
        name: "partial.vector180.html",
      },
      { slides: ["zeta"] },
    );
    await expectDeckError(
      compileVector180PptxDeck(partial),
      "VECTOR180-DECK-PPTX-INVALID-SOURCE",
    );

    const rounded = await loadDeck({
      kind: "text",
      name: "rounded.vector180.html",
      text: (await fiveSlideDeckSource()).replace(
        'id="zeta.panel" data-vector180-role="shape"',
        'id="zeta.panel" rx="16" data-vector180-role="shape"',
      ),
    });
    await expectDeckError(
      compileVector180PptxDeck(rounded),
      "VECTOR180-DECK-PPTX-UNSUPPORTED",
    );
  });

  it("refuses a forged derived snapshot that still claims the exact source hash", async () => {
    const deck = await fiveSlideDeck();
    const zeta = deck.slides.get("zeta")!;
    const sourcePanel = zeta.children[1]!;
    const forgedPanel: Vector180Node = {
      ...sourcePanel,
      attributes: { ...sourcePanel.attributes, x: "141" },
    };
    const forgedSlides = new Map(deck.slides);
    forgedSlides.set("zeta", {
      ...zeta,
      children: [zeta.children[0]!, forgedPanel, ...zeta.children.slice(2)],
    });
    const forged: Vector180Deck = { ...deck, slides: forgedSlides };

    await expectDeckError(
      compileVector180PptxDeck(forged),
      "VECTOR180-DECK-PPTX-IDENTITY",
    );
  });

  it("publishes the PPTX and map atomically through compile-deck and refuses overwrite", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "acceptance.vector180.html");
      const outputPath = join(directory, "acceptance.pptx");
      const mapPath = join(directory, "acceptance.vector180.deck.map.json");
      await writeFile(sourcePath, await fiveSlideDeckSource(), "utf8");

      const first = captureEnvironment();
      expect(
        await runCli(
          [
            "compile-deck",
            sourcePath,
            "--output",
            outputPath,
            "--map",
            mapPath,
            "--format",
            "json",
          ],
          first.environment,
        ),
      ).toBe(0);
      expect(first.stderr).toEqual([]);
      expect(JSON.parse(first.stdout.join(""))).toMatchObject({
        schema: "vector180-pptx-deck-result/0.1",
        output: outputPath,
        map: mapPath,
        slideCount: 5,
        objectCount: 15,
      });
      const [pptxBefore, mapBefore] = await Promise.all([
        readFile(outputPath),
        readFile(mapPath, "utf8"),
      ]);

      const second = captureEnvironment();
      expect(
        await runCli(
          [
            "compile-deck",
            sourcePath,
            "--output",
            outputPath,
            "--map",
            mapPath,
            "--format",
            "json",
          ],
          second.environment,
        ),
      ).toBe(1);
      expect(second.stderr).toEqual([]);
      expect(second.stdout.join("")).toContain("VECTOR180-DECK-PPTX-EXISTS");
      await expect(readFile(outputPath)).resolves.toEqual(pptxBefore);
      await expect(readFile(mapPath, "utf8")).resolves.toBe(mapBefore);
    });
  });

  it("returns stable C13 codes for wrong-kind and destination failures", async () => {
    await withTempDirectory(async (directory) => {
      const deckPath = join(directory, "acceptance.vector180.html");
      const atomPath = join(directory, "atom.vector180.svg");
      const samePath = join(directory, "same.pptx");
      await Promise.all([
        writeFile(deckPath, await fiveSlideDeckSource(), "utf8"),
        writeFile(
          atomPath,
          await readFile(
            new URL(
              "../../../../examples/minimal-diagram.vector180.svg",
              import.meta.url,
            ),
            "utf8",
          ),
          "utf8",
        ),
      ]);

      const collision = captureEnvironment();
      expect(
        await runCli(
          [
            "compile-deck",
            deckPath,
            "--output",
            samePath,
            "--map",
            samePath,
            "--format",
            "json",
          ],
          collision.environment,
        ),
      ).toBe(1);
      expect(collision.stdout.join("")).toContain("VECTOR180-DECK-PPTX-EXISTS");

      const wrongKind = captureEnvironment();
      expect(
        await runCli(
          [
            "compile-deck",
            atomPath,
            "--output",
            join(directory, "atom.pptx"),
            "--map",
            join(directory, "atom.map.json"),
            "--format",
            "json",
          ],
          wrongKind.environment,
        ),
      ).toBe(1);
      expect(wrongKind.stdout.join("")).toContain(
        "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      );

      const publication = captureEnvironment();
      expect(
        await runCli(
          [
            "compile-deck",
            deckPath,
            "--output",
            join(directory, "missing", "deck.pptx"),
            "--map",
            join(directory, "missing", "deck.map.json"),
            "--format",
            "json",
          ],
          publication.environment,
        ),
      ).toBe(1);
      expect(publication.stdout.join("")).toContain(
        "VECTOR180-DECK-PPTX-PUBLISH",
      );
    });
  });

  it("advertises the bounded compile-deck interface and its no-reconcile boundary", async () => {
    const capture = captureEnvironment();
    expect(await runCli(["compile-deck", "--help"], capture.environment)).toBe(
      0,
    );
    expect(capture.stderr).toEqual([]);
    expect(capture.stdout.join("")).toContain(
      "vector180 compile-deck <deck.vector180.html> --output PATH --map PATH",
    );
    expect(capture.stdout.join("")).toContain(
      "This export map is not accepted by reconcile.",
    );
  });

  it("keeps the portable deck and shared package kernels free of Node builtins", async () => {
    const [deckCompiler, packageCompiler] = await Promise.all([
      readFile(new URL("../node/pptx-deck.ts", import.meta.url), "utf8"),
      readFile(new URL("../node/pptx-canary.ts", import.meta.url), "utf8"),
    ]);
    expect(deckCompiler).not.toMatch(/from ["']node:/u);
    expect(packageCompiler).not.toMatch(/from ["']node:/u);
  });
});
