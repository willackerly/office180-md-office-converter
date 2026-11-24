// Tests: CONTRACT:C7-PPTX-CANARY.2.1, CONTRACT:C9-PPTV-PPTX-BASELINE.2.1,
// CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.1, CONTRACT:C5-PPTV-PATCH.2.0,
// CONTRACT:C6-PPTV-RESOLVED.2.0, CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadAtom, loadDeck } from "../core/deck.js";
import {
  resolveVector180Atom,
  resolveVector180Deck,
  type Vector180ResolvedDeck,
  type Vector180ResolvedObject,
  type Vector180ResolvedText,
} from "../core/resolved.js";
import {
  preflightAtomTextFit,
  preflightDeckTextFit,
} from "../core/text-fit.js";
import type { Vector180Atom } from "../core/types.js";
import { createDefaultFontkitTextMeasurer } from "../node/fontkit-text-measurer.js";
import {
  compilePptxBaseline,
  Vector180PptxBaselineCompileError,
  type Vector180Placement,
  type Vector180PptxBaselineArtifact,
} from "../node/pptx-baseline.js";
import {
  compilePptxCanary,
  PptxCanaryCompileError,
  type PptxCanaryErrorCode,
} from "../node/pptx-canary.js";
import { inspectPptxForReconciliation } from "../node/pptx-inspect.js";
import { reconcilePptx } from "../node/reconcile.js";
import { applyPatch } from "../ops/patch.js";

const DECK_FIXTURE_URL = new URL(
  "../../test-fixtures/c7/multiline-text.vector180.html",
  import.meta.url,
);
const ATOM_FIXTURE_URL = new URL(
  "../../test-fixtures/c9/multiline-text.vector180.svg",
  import.meta.url,
);
const EVIDENCE_URL = new URL(
  "../../../../tests/fixtures/roundtrip-evidence/vector180/",
  import.meta.url,
);
const EMU_PER_UNIT = 7_620;
const SLIDE_PART = "ppt/slides/slide1.xml";
const IDENTITY: Vector180Placement = {
  slideId: "multiline",
  x: 0,
  y: 0,
  width: 1600,
  height: 900,
  policy: "identity",
};
const SCALED: Vector180Placement = {
  slideId: "multiline",
  x: 200,
  y: 0,
  width: 1200,
  height: 675,
  policy: "uniform-scale-translate",
};
const LIST_ID = "multiline.list";
const PARAGRAPH_ID = "multiline.paragraph";
const LIST_LINES = [
  "- Lines share one anchor and one style",
  "- Baselines advance by the declared line step",
  "",
  "- An empty hard line keeps its slot",
];
const PARAGRAPH_LINES = [
  "Every hard line stays exactly where it was authored,",
  "yet PowerPoint shows a single editable text box",
  "with one paragraph for each line.",
];

async function deckSource(): Promise<string> {
  return readFile(DECK_FIXTURE_URL, "utf8");
}

async function atomSource(): Promise<string> {
  return readFile(ATOM_FIXTURE_URL, "utf8");
}

async function resolveDeckText(text: string) {
  const deck = await loadDeck({
    kind: "text",
    text,
    name: "multiline-text.vector180.html",
  });
  return { deck, resolved: resolveVector180Deck(deck) };
}

async function deckModel(text?: string): Promise<Vector180ResolvedDeck> {
  const { deck, resolved } = await resolveDeckText(
    text ?? (await deckSource()),
  );
  expect(deck.diagnostics).toEqual([]);
  expect(resolved.diagnostics).toEqual([]);
  if (resolved.model === undefined) throw new Error("Fixture did not resolve");
  return resolved.model;
}

async function loadFixtureAtom(text?: string): Promise<Vector180Atom> {
  return loadAtom({
    kind: "text",
    text: text ?? (await atomSource()),
    name: "multiline-text.vector180.svg",
  });
}

async function atomFixture(placement: Vector180Placement = IDENTITY): Promise<{
  readonly atom: Vector180Atom;
  readonly artifact: Vector180PptxBaselineArtifact;
}> {
  const atom = await loadFixtureAtom();
  expect(atom.diagnostics).toEqual([]);
  return { atom, artifact: await compilePptxBaseline(atom, { placement }) };
}

async function slideXml(
  bytes: Uint8Array,
  partName = SLIDE_PART,
): Promise<string> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entry = zip.file(partName);
  if (entry === null) throw new Error(`Missing ${partName}`);
  return entry.async("string");
}

async function allSlideXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort();
  const parts = await Promise.all(
    names.map((name) => zip.file(name)!.async("string")),
  );
  return parts.join("\n");
}

/** The one `p:sp` that carries a stable name; throws unless exactly one exists. */
function textBox(xml: string, id: string): string {
  const marker = `name="src.${id}"`;
  const first = xml.indexOf(marker);
  if (first < 0) throw new Error(`Missing src.${id}`);
  if (xml.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`src.${id} is emitted more than once`);
  }
  const start = xml.lastIndexOf("<p:sp>", first);
  const end = xml.indexOf("</p:sp>", first);
  if (start < 0 || end < 0) throw new Error(`src.${id} is not one p:sp`);
  return xml.slice(start, end + "</p:sp>".length);
}

function paragraphs(box: string): string[] {
  return [...box.matchAll(/<a:p>[\s\S]*?<\/a:p>/gu)].map((match) => match[0]);
}

function paragraphText(paragraph: string): string | undefined {
  const match = /<a:t(?: xml:space="preserve")?>([^<]*)<\/a:t>/u.exec(
    paragraph,
  );
  return match?.[1];
}

function offset(box: string): { readonly x: number; readonly y: number } {
  const match = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u.exec(box);
  if (match === null) throw new Error("Missing a:off");
  return { x: Number(match[1]), y: Number(match[2]) };
}

function dedent(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n");
}

function findText(
  model: Vector180ResolvedDeck,
  id: string,
): Vector180ResolvedText {
  let found: Vector180ResolvedText | undefined;
  const visit = (objects: readonly Vector180ResolvedObject[]): void => {
    for (const object of objects) {
      if (object.id === id && object.kind === "text") found = object;
      if (object.kind === "group") visit(object.children);
    }
  };
  for (const slide of model.slides) visit(slide.objects);
  if (found === undefined) throw new Error(`Missing resolved text ${id}`);
  return found;
}

type MutableLine = { text: string; x: number; y: number };

function mutableLines(
  model: Vector180ResolvedDeck,
  id: string,
): { readonly model: Vector180ResolvedDeck; readonly lines: MutableLine[] } {
  const clone = structuredClone(model);
  return {
    model: clone,
    lines: findText(clone, id).lines as unknown as MutableLine[],
  };
}

async function expectCanaryRefusal(
  model: Vector180ResolvedDeck,
  code: PptxCanaryErrorCode,
  message: RegExp,
): Promise<void> {
  let failure: unknown;
  try {
    await compilePptxCanary(model);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(PptxCanaryCompileError);
  expect((failure as PptxCanaryCompileError).code).toBe(code);
  expect((failure as PptxCanaryCompileError).message).toMatch(message);
}

async function expectBaselineRefusal(
  atom: Vector180Atom,
  placement: Vector180Placement,
  message: RegExp,
): Promise<void> {
  let failure: unknown;
  try {
    await compilePptxBaseline(atom, { placement });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Vector180PptxBaselineCompileError);
  expect((failure as Vector180PptxBaselineCompileError).code).toBe(
    "VECTOR180-BASELINE-UNSUPPORTED",
  );
  expect((failure as Vector180PptxBaselineCompileError).message).toMatch(
    message,
  );
}

async function rewriteObject(
  bytes: Uint8Array,
  id: string,
  rewrite: (block: string) => string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const before = await zip.file(SLIDE_PART)!.async("string");
  const block = textBox(before, id);
  const replacement = rewrite(block);
  if (replacement === block) {
    throw new Error(`Test rewrite did not change src.${id}`);
  }
  zip.file(SLIDE_PART, before.replace(block, replacement), {
    date: new Date("1980-01-01T00:00:00.000Z"),
    createFolders: false,
  });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}

function codes(result: {
  readonly diagnostics: readonly { readonly code: string }[];
}): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function messages(result: {
  readonly diagnostics: readonly { readonly message: string }[];
}): string {
  return result.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  const directory = await mkdtemp(join(tmpdir(), "vector180-multiline-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("multi-line hard-line sources (C4/C6/C8 unchanged)", () => {
  it("validates and resolves every authored hard line without reflow", async () => {
    const model = await deckModel();
    const list = findText(model, "copy.list");
    expect(list.lines).toEqual([
      { text: "- Lines share one anchor and one style", x: 100, y: 470 },
      { text: "- Baselines advance by the declared line step", x: 100, y: 518 },
      { text: "", x: 100, y: 566 },
      { text: "- An empty hard line keeps its slot", x: 100, y: 614 },
    ]);
    expect(list.lineStep).toBe(48);
    expect(list.wrap).toBe("none");
    expect(list.autofit).toBe("none");
    expect(findText(model, "anchors.card.copy").lines[2]?.text).toBe(
      "  and boundary spaces stay exact. ",
    );

    const atom = await loadFixtureAtom();
    expect(atom.diagnostics).toEqual([]);
    const resolvedAtom = resolveVector180Atom(atom);
    expect(resolvedAtom.diagnostics).toEqual([]);
    expect(resolvedAtom.model).toBeDefined();
  });

  it("measures each hard line separately with the exact bundled font", async () => {
    const measurer = await createDefaultFontkitTextMeasurer();
    const deck = preflightDeckTextFit(await deckModel(), measurer);
    expect(deck.summary).toEqual({
      total: 15,
      clear: 15,
      nearLimit: 0,
      overflow: 0,
      unverified: 0,
    });
    const listLines = deck.lines.filter(
      (line) => line.objectId === "copy.list",
    );
    expect(listLines.map((line) => [line.lineIndex, line.text])).toEqual(
      LIST_LINES.map((text, index) => [index, text]),
    );
    const widths = listLines.map((line) => line.measuredWidth);
    expect(widths[2]).toBe(0);
    expect(new Set(widths).size).toBe(4);
    expect(listLines.every((line) => line.availableWidth === 1400)).toBe(true);

    const resolvedAtom = resolveVector180Atom(await loadFixtureAtom());
    if (resolvedAtom.model === undefined) throw new Error("Atom unresolved");
    const atom = preflightAtomTextFit(resolvedAtom.model, measurer);
    expect(atom.summary.total).toBe(10);
    expect(atom.summary.clear).toBe(10);
    expect(
      atom.lines
        .filter((line) => line.objectId === "multiline.centered")
        .map((line) => [line.lineIndex, line.anchor, line.availableWidth]),
    ).toEqual([
      [0, "middle", 1200],
      [1, "middle", 1200],
    ]);
  });
});

describe("C7 2.1 one text box per multi-line text object", () => {
  it("emits one p:sp with one exact paragraph per hard line", async () => {
    const model = await deckModel();
    const artifact = await compilePptxCanary(model);
    const xml = await allSlideXml(artifact.bytes);

    // Six text objects carry fifteen hard lines; six text boxes are emitted.
    expect(xml.match(/<p:cNvSpPr txBox="1"\/>/gu)).toHaveLength(6);
    expect(xml.match(/<a:p>/gu)).toHaveLength(15);
    expect(xml).not.toContain("<a:br");

    const list = textBox(xml, "copy.list");
    expect(list).toContain(
      '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr>',
    );
    expect(list).not.toMatch(/normAutofit|spAutoFit/u);
    const listParagraphs = paragraphs(list);
    expect(listParagraphs).toHaveLength(4);
    expect(listParagraphs.map(paragraphText)).toEqual([
      LIST_LINES[0],
      LIST_LINES[1],
      undefined,
      LIST_LINES[3],
    ]);
    for (const paragraph of listParagraphs) {
      expect(paragraph).toContain(
        '<a:pPr algn="l" marL="0" marR="0" indent="0">',
      );
      // 48 units × 60 hundredth-points: the declared line step, exactly.
      expect(paragraph).toContain('<a:lnSpc><a:spcPts val="2880"/></a:lnSpc>');
      expect(paragraph).toContain('<a:spcBef><a:spcPts val="0"/></a:spcBef>');
      expect(paragraph).toContain('<a:spcAft><a:spcPts val="0"/></a:spcAft>');
      expect(paragraph).toContain("<a:buNone/>");
      expect(paragraph.match(/<a:endParaRPr /gu)).toHaveLength(1);
      expect(paragraph).toContain('sz="1920"');
    }
    // The empty hard line is a run-less paragraph that keeps its style marker.
    expect(listParagraphs[2]).not.toContain("<a:r>");
    expect(listParagraphs[2]).toContain('<a:latin typeface="ABeeZee"/>');
    expect(listParagraphs[0]?.match(/<a:r>/gu)).toHaveLength(1);

    expect(
      paragraphs(textBox(xml, "copy.paragraph")).map(paragraphText),
    ).toEqual(PARAGRAPH_LINES);
    expect(paragraphs(textBox(xml, "copy.title"))).toHaveLength(1);
  });

  it("encodes the shared anchor of centered, end-anchored, and grouped lines", async () => {
    const xml = await allSlideXml(
      (await compilePptxCanary(await deckModel())).bytes,
    );
    const centered = paragraphs(textBox(xml, "anchors.centered"));
    expect(centered).toHaveLength(2);
    for (const paragraph of centered) {
      expect(paragraph).toContain(
        '<a:pPr algn="ctr" marL="0" marR="0" indent="0">',
      );
    }
    const right = paragraphs(textBox(xml, "anchors.right"));
    expect(right).toHaveLength(2);
    for (const paragraph of right) {
      expect(paragraph).toContain(
        '<a:pPr algn="r" marL="0" marR="0" indent="0">',
      );
    }
    const grouped = textBox(xml, "anchors.card.copy");
    expect(xml.indexOf('name="src.anchors.card"')).toBeLessThan(
      xml.indexOf('name="src.anchors.card.copy"'),
    );
    const groupedParagraphs = paragraphs(grouped);
    expect(groupedParagraphs).toHaveLength(3);
    expect(groupedParagraphs[2]).toContain(
      '<a:t xml:space="preserve">  and boundary spaces stay exact. </a:t>',
    );
  });

  it("matches the same lines compiled as stacked one-line boxes paragraph for paragraph", async () => {
    const source = await deckSource();
    const multi = findText(await deckModel(), "copy.paragraph");
    const stackedObjects = multi.lines
      .map(
        (line, index) =>
          `<text id="copy.paragraph.l${index + 1}" class="body-copy" data-vector180-role="text" data-vector180-export="native"
      data-vector180-frame="${multi.frame.x} ${multi.frame.y + index * multi.lineStep} ${multi.frame.width} ${multi.lineStep}" data-vector180-line-step="${multi.lineStep}"
      x="${line.x}" y="${line.y}">${line.text}</text>`,
      )
      .join("\n    ");
    const start = source.indexOf('<text id="copy.paragraph"');
    const end = source.indexOf("</text>", start) + "</text>".length;
    const stackedSource =
      source.slice(0, start) + stackedObjects + source.slice(end);

    const multiXml = await allSlideXml(
      (await compilePptxCanary(await deckModel())).bytes,
    );
    const stackedXml = await allSlideXml(
      (await compilePptxCanary(await deckModel(stackedSource))).bytes,
    );
    const box = textBox(multiXml, "copy.paragraph");
    const boxParagraphs = paragraphs(box);
    const lineStepEmu = multi.lineStep * EMU_PER_UNIT;
    for (const [index] of multi.lines.entries()) {
      const single = textBox(stackedXml, `copy.paragraph.l${index + 1}`);
      // Identical paragraph bytes: alignment, margins, exact spacing, run.
      expect(dedent(paragraphs(single)[0]!)).toBe(
        dedent(boxParagraphs[index]!),
      );
      // Paragraph k of the one box occupies the band of one-line box k.
      expect(offset(single)).toEqual({
        x: offset(box).x,
        y: offset(box).y + index * lineStepEmu,
      });
      expect(single).toContain(
        '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr>',
      );
    }
    expect(stackedXml.match(/<p:cNvSpPr txBox="1"\/>/gu)).toHaveLength(8);
  });

  it("is byte-identical across compilations, processes, and time zones", async () => {
    const first = await compilePptxCanary(await deckModel());
    const second = await compilePptxCanary(await deckModel());
    expect(sha256(second.bytes)).toBe(sha256(first.bytes));
    expect(first.sha256).toBe(sha256(first.bytes));

    const repositoryRoot = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const script = `
      import { readFile } from "node:fs/promises";
      import { loadDeck } from "./packages/vector180/src/core/deck.ts";
      import { resolveVector180Deck } from "./packages/vector180/src/core/resolved.ts";
      import { compilePptxCanary } from "./packages/vector180/src/node/pptx-canary.ts";
      const source = await readFile("packages/vector180/test-fixtures/c7/multiline-text.vector180.html", "utf8");
      const deck = await loadDeck({ kind: "text", text: source, name: "multiline-text.vector180.html" });
      const artifact = await compilePptxCanary(resolveVector180Deck(deck));
      process.stdout.write(artifact.sha256);
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
    const tokyo = run("Asia/Tokyo");
    expect(utc.stderr).toBe("");
    expect(tokyo.stderr).toBe("");
    expect(utc.stdout).toBe(first.sha256);
    expect(tokyo.stdout).toBe(first.sha256);
  });

  it("refuses hard lines that do not share one anchor x", async () => {
    const source = (await deckSource()).replace(
      '<tspan x="100" y="308">',
      '<tspan x="140" y="308">',
    );
    // C6 still resolves per-line x; only the one-text-box mapping refuses it.
    const model = await deckModel(source);
    expect(findText(model, "copy.paragraph").lines[1]?.x).toBe(140);
    await expectCanaryRefusal(
      model,
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
      /Text "copy\.paragraph" hard line 2 anchors at x=140 but hard line 1 anchors at x=100; one native text box requires one shared anchor x/u,
    );
  });

  it("refuses irregular baselines, absent lines, and out-of-frame lines in a resolved model", async () => {
    const base = await deckModel();

    const irregular = mutableLines(base, "copy.paragraph");
    irregular.lines[2]!.y = 357;
    await expectCanaryRefusal(
      irregular.model,
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
      /hard lines 2 and 3 have baselines y=308 and y=357, which are not exactly one declared line step \(48\) apart/u,
    );

    const reversed = mutableLines(base, "copy.paragraph");
    reversed.lines.reverse();
    await expectCanaryRefusal(
      reversed.model,
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
      /not exactly one declared line step/u,
    );

    const fractional = mutableLines(base, "copy.paragraph");
    fractional.lines[1]!.y = 308.00001;
    await expectCanaryRefusal(
      fractional.model,
      "VECTOR180-PPTX-NON-INTEGRAL-EMU",
      /copy\.paragraph\.line\[2\]\.y/u,
    );

    const none = mutableLines(base, "copy.paragraph");
    none.lines.length = 0;
    await expectCanaryRefusal(
      none.model,
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
      /has no hard line/u,
    );

    const outside = mutableLines(base, "copy.paragraph");
    outside.lines.push({ text: "Fourth", x: 100, y: 404 });
    await expectCanaryRefusal(
      outside.model,
      "VECTOR180-PPTX-INVALID-MODEL",
      /Text line lies outside frame for "copy\.paragraph"/u,
    );
  });

  it("refuses a wrong source line step before compilation and writes nothing", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "bad-step.vector180.html");
      const output = join(directory, "bad-step.pptx");
      await writeFile(
        sourcePath,
        (await deckSource()).replace(
          '<tspan x="100" y="356">',
          '<tspan x="100" y="357">',
        ),
      );
      const capture = captureEnvironment();
      const status = await runCli(
        ["pptx-canary", sourcePath, "--output", output, "--format", "json"],
        capture.environment,
      );
      expect(status).not.toBe(0);
      expect(capture.stdout.join("") + capture.stderr.join("")).toContain(
        "VECTOR180-PROFILE-TEXT-LINES",
      );
      expect(await readdir(directory)).toEqual(["bad-step.vector180.html"]);
    });
  });

  it("compiles the fixture through the pptx-canary CLI and refuses mixed anchors there", async () => {
    await withTempDirectory(async (directory) => {
      const output = join(directory, "deck.pptx");
      const capture = captureEnvironment();
      expect(
        await runCli(
          [
            "pptx-canary",
            fileURLToPath(DECK_FIXTURE_URL),
            "--output",
            output,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      const written = new Uint8Array(await readFile(output));
      expect(sha256(written)).toBe(
        (await compilePptxCanary(await deckModel())).sha256,
      );

      const mixedPath = join(directory, "mixed.vector180.html");
      const mixedOutput = join(directory, "mixed.pptx");
      await writeFile(
        mixedPath,
        (await deckSource()).replace(
          '<tspan x="100" y="308">',
          '<tspan x="140" y="308">',
        ),
      );
      const refused = captureEnvironment();
      expect(
        await runCli(
          [
            "pptx-canary",
            mixedPath,
            "--output",
            mixedOutput,
            "--format",
            "json",
          ],
          refused.environment,
        ),
      ).toBe(1);
      const report = refused.stdout.join("") + refused.stderr.join("");
      expect(report).toContain("VECTOR180-PPTX-UNSUPPORTED-OBJECT");
      expect(report).toContain("one shared anchor x");
      expect((await readdir(directory)).sort()).toEqual([
        "deck.pptx",
        "mixed.vector180.html",
      ]);
    });
  });
});

describe("C9 2.1 multi-line atom composition, map, and package", () => {
  it("compiles an atom to one text box per text object and maps every paragraph", async () => {
    const { artifact } = await atomFixture();
    const xml = await slideXml(artifact.pptxBytes);
    expect(xml.match(/<p:cNvSpPr txBox="1"\/>/gu)).toHaveLength(4);
    expect(paragraphs(textBox(xml, LIST_ID)).map(paragraphText)).toEqual([
      LIST_LINES[0],
      LIST_LINES[1],
      undefined,
      LIST_LINES[3],
    ]);
    expect(paragraphs(textBox(xml, PARAGRAPH_ID)).map(paragraphText)).toEqual(
      PARAGRAPH_LINES,
    );

    // The generated composition keeps N direct tspans, never N text objects.
    expect(artifact.composedDeckSource).toContain(
      '<tspan x="100" y="566"></tspan>',
    );
    expect(
      artifact.composedDeckSource?.match(/<text id="multiline\./gu),
    ).toHaveLength(4);

    const objects = artifact.map.slides[0]!.objects;
    expect(objects.map((object) => object.id)).toEqual([
      "multiline.background",
      "multiline.title",
      PARAGRAPH_ID,
      LIST_ID,
      "multiline.centered",
    ]);
    const list = objects.find((object) => object.id === LIST_ID)!;
    expect(list.emitted.element).toBe("p:sp");
    expect(list.composed.geometry["lines"]).toEqual(
      LIST_LINES.map((text, index) => ({ text, x: 100, y: 470 + index * 48 })),
    );
    const drawing = list.emitted.drawingMl as {
      paragraph?: unknown;
      run?: unknown;
      paragraphs?: Array<{
        paragraph: Record<string, unknown>;
        run: { text: string } | null;
        endParagraphMarker?: Record<string, unknown>;
      }>;
    };
    expect(drawing.paragraph).toBeUndefined();
    expect(drawing.run).toBeUndefined();
    expect(drawing.paragraphs?.map((entry) => entry.run?.text ?? null)).toEqual(
      [LIST_LINES[0], LIST_LINES[1], null, LIST_LINES[3]],
    );
    expect(drawing.paragraphs?.[2]?.endParagraphMarker).toMatchObject({
      fontFamily: "ABeeZee",
      fontSizeHundredthPoints: 1920,
    });
    for (const entry of drawing.paragraphs ?? []) {
      expect(entry.paragraph).toEqual({
        alignment: "left",
        marginLeftEmu: 0,
        marginRightEmu: 0,
        indentEmu: 0,
        lineSpacingHundredthPoints: 2880,
        spacingBeforeHundredthPoints: 0,
        spacingAfterHundredthPoints: 0,
        bullets: "none",
      });
    }
    // A one-line object keeps the C9 2.0 snapshot shape.
    const title = objects.find((object) => object.id === "multiline.title")!;
    expect(title.emitted.drawingMl).toHaveProperty("paragraph");
    expect(title.emitted.drawingMl).toHaveProperty("run");
    expect(title.emitted.drawingMl).not.toHaveProperty("paragraphs");
  });

  it("places hard lines exactly under uniform scale and stays deterministic", async () => {
    const { atom, artifact } = await atomFixture(SCALED);
    expect(artifact.composedDeckSource).toContain(
      'data-vector180-frame="275 322.5 1050 150" data-vector180-line-step="36"',
    );
    for (const y of ["352.5", "388.5", "424.5", "460.5"]) {
      expect(artifact.composedDeckSource).toContain(`<tspan x="275" y="${y}">`);
    }
    const list = paragraphs(
      textBox(await slideXml(artifact.pptxBytes), LIST_ID),
    );
    expect(list).toHaveLength(4);
    for (const paragraph of list) {
      expect(paragraph).toContain('<a:lnSpc><a:spcPts val="2160"/></a:lnSpc>');
    }
    const again = await compilePptxBaseline(atom, { placement: SCALED });
    expect(again.pptxSha256).toBe(artifact.pptxSha256);
    expect(again.mapText).toBe(artifact.mapText);
    expect(again.composedDeckSource).toBe(artifact.composedDeckSource);
  });

  it("refuses mixed anchors and placements that cannot keep the line step exact", async () => {
    const mixed = await loadFixtureAtom(
      (await atomSource()).replace(
        '<tspan x="100" y="308">',
        '<tspan x="140" y="308">',
      ),
    );
    expect(mixed.diagnostics).toEqual([]);
    await expectBaselineRefusal(
      mixed,
      IDENTITY,
      /Text "multiline\.paragraph" hard line 2 anchors at x=140 but hard line 1 anchors at x=100; one native text box requires one shared anchor x/u,
    );

    // 0.7 × 308 is not an exact decimal multiple; nothing is rounded.
    await expectBaselineRefusal(
      await loadFixtureAtom(),
      { ...SCALED, x: 0, width: 1120, height: 630 },
      /Text "multiline\.paragraph" hard lines 1 and 2 do not stay exactly one line step apart at placement scale 0\.7/u,
    );
  });

  it("keeps one-line output byte-identical to the checked C9 2.0 evidence chain", async () => {
    const source = await readFile(
      new URL("supported-original.vector180.svg", EVIDENCE_URL),
      "utf8",
    );
    const atom = await loadAtom({
      kind: "text",
      text: source,
      name: "supported-original.vector180.svg",
    });
    const artifact = await compilePptxBaseline(atom, {
      placement: {
        slideId: "supported-roundtrip",
        x: 200,
        y: 0,
        width: 1200,
        height: 900,
        policy: "uniform-scale-translate",
      },
    });
    const pptx = await readFile(
      new URL("supported-baseline.pptx", EVIDENCE_URL),
    );
    expect(artifact.pptxSha256).toBe(sha256(new Uint8Array(pptx)));
    expect(artifact.mapText).toBe(
      await readFile(
        new URL("supported-baseline.vector180.map.json", EVIDENCE_URL),
        "utf8",
      ),
    );
    expect(artifact.composedDeckSource).toBe(
      await readFile(
        new URL("supported-composed.vector180.html", EVIDENCE_URL),
        "utf8",
      ),
    );
  });

  it("compiles the atom fixture through the compile CLI", async () => {
    await withTempDirectory(async (directory) => {
      const output = join(directory, "atom.pptx");
      const map = join(directory, "atom.vector180.map.json");
      const capture = captureEnvironment();
      expect(
        await runCli(
          [
            "compile",
            fileURLToPath(ATOM_FIXTURE_URL),
            "--placement",
            "0,0,1600,900",
            "--policy",
            "identity",
            "--output",
            output,
            "--map",
            map,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      const summary = JSON.parse(capture.stdout.join("")) as {
        objectCount: number;
        pptxSha256: string;
      };
      expect(summary.objectCount).toBe(5);
      expect(sha256(new Uint8Array(await readFile(output)))).toBe(
        summary.pptxSha256,
      );
    });
  });
});

describe("C10 2.1 multi-line inspection and reconciliation boundary", () => {
  it("inspects ordered hard-line strings and reconciles the baseline as unchanged", async () => {
    const { atom, artifact } = await atomFixture();
    const inspected = await inspectPptxForReconciliation(
      artifact.pptxBytes,
      artifact.map,
    );
    expect(inspected.diagnostics).toEqual([]);
    const objects = inspected.inspection!.slides[0]!.objects;
    const list = objects.find((object) => object.id === LIST_ID)!;
    expect(list.textLines).toEqual(LIST_LINES);
    expect(list.text).toBeUndefined();
    expect(list.textNodeCount).toBe(3);
    expect(list.geometry).toMatchObject({
      kind: "text",
      offXEmu: 100 * EMU_PER_UNIT,
      offYEmu: 430 * EMU_PER_UNIT,
      anchorXEmu: 100 * EMU_PER_UNIT,
    });
    const centered = objects.find(
      (object) => object.id === "multiline.centered",
    )!;
    expect(centered.textLines).toHaveLength(2);
    expect(centered.geometry).toMatchObject({ anchorXEmu: 800 * EMU_PER_UNIT });
    expect(centered.style?.textAnchor).toBe("middle");
    const title = objects.find((object) => object.id === "multiline.title")!;
    expect(title.text).toBe("One text box per text object");
    expect(title.textLines).toBeUndefined();

    const result = await reconcilePptx(atom, artifact.map, artifact.pptxBytes);
    expect(result.status).toBe("unchanged");
    expect(result.diagnostics).toEqual([]);
    expect(result.patch).toBeUndefined();

    const scaled = await atomFixture(SCALED);
    expect(
      (
        await reconcilePptx(
          scaled.atom,
          scaled.artifact.map,
          scaled.artifact.pptxBytes,
        )
      ).status,
    ).toBe("unchanged");
  });

  it("refuses an edited hard line with a specific finding and no patch", async () => {
    const { atom, artifact } = await atomFixture();
    const edited = await rewriteObject(artifact.pptxBytes, LIST_ID, (block) =>
      block.replace(LIST_LINES[1]!, "- Edited in PowerPoint"),
    );
    const result = await reconcilePptx(atom, artifact.map, edited);
    expect(result.status).toBe("review-required");
    expect(codes(result)).toEqual(["VECTOR180-RECONCILE-UNSUPPORTED"]);
    expect(messages(result)).toMatch(
      /Object "src\.multiline\.list" is a multi-line hard-line text box whose line text changed; C5 has no multi-line text operation/u,
    );
    expect(result.patch).toBeUndefined();
    expect(result.changes).toMatchObject([
      { kind: "unsupported", field: "text", objectId: LIST_ID },
    ]);
  });

  it("refuses a moved or resized multi-line frame instead of emitting set-text-frame", async () => {
    const { atom, artifact } = await atomFixture();
    const edited = await rewriteObject(
      artifact.pptxBytes,
      PARAGRAPH_ID,
      (block) =>
        block.replace(
          /<a:off x="(\d+)" y="(\d+)"\/>/u,
          (_match, x: string, y: string) =>
            `<a:off x="${Number(x) + EMU_PER_UNIT * 10}" y="${Number(y) + EMU_PER_UNIT * 10}"/>`,
        ),
    );
    const result = await reconcilePptx(atom, artifact.map, edited);
    expect(result.status).toBe("review-required");
    expect(codes(result)).toEqual(["VECTOR180-RECONCILE-UNSUPPORTED"]);
    expect(messages(result)).toMatch(
      /multi-line hard-line text box whose frame or anchor changed; C5 set-text-frame accepts exactly one direct hard line/u,
    );
    expect(result.patch).toBeUndefined();
  });

  it("refuses added, removed, merged, split, and divergent paragraphs", async () => {
    const { atom, artifact } = await atomFixture();
    const firstParagraph = (block: string): string => paragraphs(block)[0]!;
    const cases: Array<{
      readonly name: string;
      readonly id: string;
      readonly message: RegExp;
      rewrite(block: string): string;
    }> = [
      {
        name: "added paragraph",
        id: PARAGRAPH_ID,
        message: /has 4 paragraphs where the baseline maps 3 hard lines/u,
        rewrite: (block) =>
          block.replace(
            firstParagraph(block),
            firstParagraph(block) + firstParagraph(block),
          ),
      },
      {
        name: "removed paragraph",
        id: PARAGRAPH_ID,
        message: /has 2 paragraphs where the baseline maps 3 hard lines/u,
        rewrite: (block) => block.replace(firstParagraph(block), ""),
      },
      {
        name: "soft line break",
        id: PARAGRAPH_ID,
        message: /hard-line paragraph 1 contains a line break or field/u,
        rewrite: (block) => block.replace("</a:r>", "</a:r><a:br/>"),
      },
      {
        name: "second run",
        id: PARAGRAPH_ID,
        message: /hard-line paragraph 1 has more than one run/u,
        rewrite: (block) =>
          block.replace("</a:r>", "</a:r><a:r><a:t>more</a:t></a:r>"),
      },
      {
        name: "one paragraph indented",
        id: PARAGRAPH_ID,
        message:
          /hard-line paragraph 2 does not share the anchor and style of hard-line paragraph 1/u,
        rewrite: (block) => {
          const second = paragraphs(block)[1]!;
          return block.replace(
            second,
            second.replace('marL="0"', `marL="${EMU_PER_UNIT * 40}"`),
          );
        },
      },
      {
        name: "one paragraph restyled",
        id: PARAGRAPH_ID,
        message:
          /hard-line paragraph 3 does not share the anchor and style of hard-line paragraph 1/u,
        rewrite: (block) => {
          const third = paragraphs(block)[2]!;
          return block.replace(third, third.replaceAll('b="0"', 'b="1"'));
        },
      },
      {
        name: "empty line without its style marker",
        id: LIST_ID,
        message:
          /hard-line paragraph 3 is empty and has no end-paragraph style marker/u,
        rewrite: (block) => {
          const third = paragraphs(block)[2]!;
          return block.replace(
            third,
            third.replace(/<a:endParaRPr [\s\S]*<\/a:endParaRPr>/u, ""),
          );
        },
      },
      {
        name: "text typed into the empty line",
        id: LIST_ID,
        message: /changed geometry, style, grouping, run structure/u,
        rewrite: (block) => {
          const third = paragraphs(block)[2]!;
          const run = /<a:r>[\s\S]*?<\/a:r>/u.exec(paragraphs(block)[0]!)![0];
          return block.replace(
            third,
            third.replace("</a:pPr>", `</a:pPr>${run}`),
          );
        },
      },
    ];
    for (const testCase of cases) {
      const edited = await rewriteObject(
        artifact.pptxBytes,
        testCase.id,
        testCase.rewrite,
      );
      const result = await reconcilePptx(atom, artifact.map, edited);
      expect(result.status, testCase.name).toBe("review-required");
      expect(codes(result), testCase.name).toContain(
        "VECTOR180-RECONCILE-UNSUPPORTED",
      );
      expect(messages(result), testCase.name).toMatch(testCase.message);
      expect(result.patch, testCase.name).toBeUndefined();
    }
  });

  it("recovers one uniform style change as set-native-style and proves the recompile", async () => {
    const { atom, artifact } = await atomFixture();
    const edited = await rewriteObject(
      artifact.pptxBytes,
      PARAGRAPH_ID,
      (block) => block.replaceAll('val="17211E"', 'val="A1B2C3"'),
    );
    const result = await reconcilePptx(atom, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toMatchObject([
      { op: "set-native-style", id: PARAGRAPH_ID, style: { fill: "#a1b2c3" } },
    ]);
    const applied = await applyPatch(atom, result.patch);
    expect(applied.applied).toBe(true);
    // The hard lines are untouched; only the object-level attribute moved.
    for (const line of PARAGRAPH_LINES) {
      expect(applied.sourceText).toContain(`>${line}</tspan>`);
    }
    const recovered = await loadFixtureAtom(applied.sourceText);
    const regenerated = await compilePptxBaseline(recovered, {
      placement: IDENTITY,
    });
    expect(
      (await reconcilePptx(recovered, regenerated.map, regenerated.pptxBytes))
        .status,
    ).toBe("unchanged");
    expect(textBox(await slideXml(regenerated.pptxBytes), PARAGRAPH_ID)).toBe(
      textBox(await slideXml(edited), PARAGRAPH_ID),
    );
  });

  it("keeps deletion and painter order object-level for multi-line text boxes", async () => {
    const { atom, artifact } = await atomFixture();
    const rewriteSlide = async (
      rewrite: (xml: string) => string,
    ): Promise<Uint8Array> => {
      const zip = await JSZip.loadAsync(artifact.pptxBytes, {
        checkCRC32: true,
      });
      const before = await zip.file(SLIDE_PART)!.async("string");
      const after = rewrite(before);
      expect(after).not.toBe(before);
      zip.file(SLIDE_PART, after, {
        date: new Date("1980-01-01T00:00:00.000Z"),
        createFolders: false,
      });
      return zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        platform: "DOS",
      });
    };

    const deleted = await reconcilePptx(
      atom,
      artifact.map,
      await rewriteSlide((xml) => xml.replace(textBox(xml, LIST_ID), "")),
    );
    expect(deleted.status).toBe("patchable");
    expect(deleted.patch?.ops).toEqual([
      { op: "delete-object", id: LIST_ID, oldParentId: null, oldOrder: 3 },
    ]);
    const afterDelete = await applyPatch(atom, deleted.patch);
    expect(afterDelete.applied).toBe(true);
    expect(afterDelete.atom?.index.objects.has(LIST_ID)).toBe(false);
    expect(afterDelete.sourceText).not.toContain(LIST_LINES[0]);

    const swapped = await reconcilePptx(
      atom,
      artifact.map,
      await rewriteSlide((xml) => {
        const paragraph = textBox(xml, PARAGRAPH_ID);
        const list = textBox(xml, LIST_ID);
        return xml
          .replace(paragraph, "<swap-paragraph/>")
          .replace(list, paragraph)
          .replace("<swap-paragraph/>", list);
      }),
    );
    expect(swapped.status).toBe("patchable");
    expect(swapped.patch?.ops).toMatchObject([
      {
        op: "set-child-order",
        order: [
          "multiline.background",
          "multiline.title",
          LIST_ID,
          PARAGRAPH_ID,
          "multiline.centered",
        ],
      },
    ]);
    const afterSwap = await applyPatch(atom, swapped.patch);
    expect(afterSwap.applied).toBe(true);
    expect(afterSwap.atom?.children.map((object) => object.id)).toEqual([
      "multiline.background",
      "multiline.title",
      LIST_ID,
      PARAGRAPH_ID,
      "multiline.centered",
    ]);
  });

  it("records omitted end-paragraph markers of non-empty lines as the existing normalization", async () => {
    const { artifact } = await atomFixture();
    const edited = await rewriteObject(
      artifact.pptxBytes,
      PARAGRAPH_ID,
      (block) =>
        block.replace(/\s*<a:endParaRPr [\s\S]*?<\/a:endParaRPr>/gu, ""),
    );
    const inspected = await inspectPptxForReconciliation(edited, artifact.map);
    expect(inspected.diagnostics).toEqual([]);
    const paragraph = inspected.inspection!.slides[0]!.objects.find(
      (object) => object.id === PARAGRAPH_ID,
    )!;
    expect(paragraph.textLines).toEqual(PARAGRAPH_LINES);
    expect(paragraph.normalizations).toMatchObject([
      {
        ruleId: "vector180-c10/end-paragraph-style-marker-omitted/1",
        objectId: PARAGRAPH_ID,
        occurrenceCount: 3,
      },
    ]);
  });
});

describe("C5 2.0 keeps multi-line text out of the typed patch surface", () => {
  it("refuses set-text and set-text-frame on a multi-line object without touching source", async () => {
    const atom = await loadFixtureAtom();
    const setText = await applyPatch(atom, {
      schema: "vector180-patch/0.1",
      baseSha256: atom.source.sha256,
      ops: [
        {
          op: "set-text",
          id: PARAGRAPH_ID,
          oldText: findNodeText(atom, PARAGRAPH_ID) ?? "",
          value: "One line",
        },
      ],
    });
    expect(setText.applied).toBe(false);
    expect(codes(setText)).toEqual(["VECTOR180-PATCH-UNSAFE-RANGE"]);
    expect(setText.sourceText).toBeUndefined();

    const setFrame = await applyPatch(atom, {
      schema: "vector180-patch/0.1",
      baseSha256: atom.source.sha256,
      ops: [
        {
          op: "set-text-frame",
          id: PARAGRAPH_ID,
          oldFrame: { x: 100, y: 220, width: 1400, height: 150 },
          frame: { x: 110, y: 230, width: 1400, height: 150 },
          oldLineAnchor: { x: 100, y: 260 },
          lineAnchor: { x: 110, y: 270 },
        },
      ],
    });
    expect(setFrame.applied).toBe(false);
    expect(codes(setFrame)).toEqual(["VECTOR180-PATCH-UNSAFE-RANGE"]);
    expect(messages(setFrame)).toMatch(/exactly one direct hard line/u);
  });
});

function findNodeText(atom: Vector180Atom, id: string): string | undefined {
  const visit = (
    nodes: readonly Vector180Atom["children"][number][],
  ): string | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node.text;
      const nested = visit(node.children);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  return visit(atom.children);
}
