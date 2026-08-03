// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.3,
// CONTRACT:C6-PPTV-RESOLVED.1.1, CONTRACT:C9-PPTV-PPTX-BASELINE.1.0,
// CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDiagram } from "../core/deck.js";
import type { PptvDiagram } from "../core/types.js";
import {
  compilePptxBaseline,
  type PptvPlacement,
  type PptvPptxBaselineArtifact,
  type PptvPptxMap,
} from "../node/pptx-baseline.js";
import { inspectPptxForReconciliation } from "../node/pptx-inspect.js";
import { redactPrivateValues } from "../node/reconciliation-report.js";
import { reconcilePptx } from "../node/reconcile.js";
import { applyPatch } from "../ops/patch.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
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
const TITLE = "Standalone PPTV diagram";
const TITLE_ID = "system-overview.title";
const SLIDE_PART = "ppt/slides/slide1.xml";

interface BaselineFixture {
  readonly sourceText: string;
  readonly diagram: PptvDiagram;
  readonly artifact: PptvPptxBaselineArtifact;
}

async function baselineFixture(): Promise<BaselineFixture> {
  const sourceText = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
  const diagram = await loadDiagram({
    kind: "text",
    text: sourceText,
    name: "minimal-diagram.pptv.svg",
  });
  return {
    sourceText,
    diagram,
    artifact: await compilePptxBaseline(diagram, {
      placement: IDENTITY_PLACEMENT,
    }),
  };
}

async function rewritePart(
  bytes: Uint8Array,
  partName: string,
  rewrite: (text: string) => string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entry = zip.file(partName);
  if (entry === null) throw new Error(`Missing test part ${partName}`);
  const before = await entry.async("string");
  const after = rewrite(before);
  if (after === before)
    throw new Error(`Test rewrite did not change ${partName}`);
  zip.file(partName, after, {
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

async function rewritePackage(
  bytes: Uint8Array,
  rewrite: (zip: JSZip) => Promise<void> | void,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  await rewrite(zip);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}

async function replaceZipText(
  zip: JSZip,
  partName: string,
  rewrite: (text: string) => string,
): Promise<void> {
  const entry = zip.file(partName);
  if (entry === null) throw new Error(`Missing test part ${partName}`);
  const before = await entry.async("string");
  const after = rewrite(before);
  if (after === before) {
    throw new Error(`Test rewrite did not change ${partName}`);
  }
  zip.file(partName, after, {
    date: new Date("1980-01-01T00:00:00.000Z"),
    createFolders: false,
  });
}

async function nativeSaveEnvelope(
  bytes: Uint8Array,
  map: PptvPptxMap,
): Promise<Uint8Array> {
  return rewritePackage(bytes, async (zip) => {
    await replaceZipText(zip, "ppt/presentation.xml", (xml) =>
      xml.replace(' type="screen16x9"', ""),
    );
    await replaceZipText(zip, SLIDE_PART, (xml) => {
      const title = mappedObjectBlock(xml, map, TITLE_ID);
      const withoutEndMarker = title.text.replace(
        /[ \t]*<a:endParaRPr\b[\s\S]*?<\/a:endParaRPr>\s*/u,
        "\n",
      );
      if (withoutEndMarker === title.text) {
        throw new Error("Test title lacks an end-paragraph marker");
      }
      return (
        xml.slice(0, title.start) +
        withoutEndMarker +
        xml.slice(title.end)
      ).replace(
        "<p:grpSpPr/>",
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
      );
    });
    await replaceZipText(zip, "ppt/theme/theme1.xml", (xml) =>
      xml.replace(
        "</a:theme>",
        "<a:objectDefaults/><a:extraClrSchemeLst/></a:theme>",
      ),
    );
    await replaceZipText(
      zip,
      "ppt/presProps.xml",
      () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"
  xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main">
  <p:extLst>
    <p:ext uri="{E76CE94A-603C-4142-B9EB-6D1370010A27}"><p14:discardImageEditData val="0"/></p:ext>
    <p:ext uri="{D31A062A-798A-4329-ABDD-BBA856620510}"><p14:defaultImageDpi val="220"/></p:ext>
    <p:ext uri="{FD5EFAAD-0ECE-453E-9831-46B23BE46B34}"><p15:chartTrackingRefBased val="0"/></p:ext>
  </p:extLst>
</p:presentationPr>`,
    );
    await replaceZipText(zip, "[Content_Types].xml", (xml) =>
      xml.replace(
        "</Types>",
        '  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>\n  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>\n</Types>',
      ),
    );
    await replaceZipText(zip, "ppt/_rels/presentation.xml.rels", (xml) =>
      xml.replace(
        "</Relationships>",
        '  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>\n  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>\n</Relationships>',
      ),
    );
    zip.file(
      "ppt/tableStyles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>',
      { createFolders: false },
    );
    zip.file(
      "ppt/viewProps.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15987"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="1"><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>',
      { createFolders: false },
    );
  });
}

async function recompress(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  for (const directory of [
    "_rels",
    "docProps",
    "ppt",
    "ppt/_rels",
    "ppt/slideLayouts",
    "ppt/slideLayouts/_rels",
    "ppt/slideMasters",
    "ppt/slideMasters/_rels",
    "ppt/slides",
    "ppt/slides/_rels",
    "ppt/theme",
  ]) {
    zip.folder(directory);
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}

async function editTitle(
  bytes: Uint8Array,
  replacement: string,
  extraAttributes = "",
): Promise<Uint8Array> {
  return rewritePart(bytes, SLIDE_PART, (xml) =>
    xml.replace(
      `<a:t>${TITLE}</a:t>`,
      `<a:t${extraAttributes}>${replacement}</a:t>`,
    ),
  );
}

function mappedObjectBlock(
  xml: string,
  map: PptvPptxMap,
  id: string,
): { readonly start: number; readonly end: number; readonly text: string } {
  const object = map.slides[0]?.objects.find(
    (candidate) => candidate.id === id,
  );
  if (object === undefined) throw new Error(`Missing mapped test object ${id}`);
  const tag = object.emitted.element;
  const marker = `name="src.${id}"`;
  const markerIndex = xml.indexOf(marker);
  const start = xml.lastIndexOf(`<${tag}>`, markerIndex);
  const close = `</${tag}>`;
  const closeIndex = xml.indexOf(close, markerIndex);
  if (markerIndex < 0 || start < 0 || closeIndex < 0) {
    throw new Error(`Missing emitted test block src.${id}`);
  }
  const end = closeIndex + close.length;
  return { start, end, text: xml.slice(start, end) };
}

async function rewriteMappedObject(
  bytes: Uint8Array,
  map: PptvPptxMap,
  id: string,
  rewrite: (block: string) => string,
): Promise<Uint8Array> {
  return rewritePart(bytes, SLIDE_PART, (xml) => {
    const block = mappedObjectBlock(xml, map, id);
    const replacement = rewrite(block.text);
    if (replacement === block.text) {
      throw new Error(`Mapped test rewrite did not change src.${id}`);
    }
    return xml.slice(0, block.start) + replacement + xml.slice(block.end);
  });
}

async function removeMappedObjects(
  bytes: Uint8Array,
  map: PptvPptxMap,
  ids: readonly string[],
): Promise<Uint8Array> {
  return rewritePart(bytes, SLIDE_PART, (xml) => {
    const ranges = ids
      .map((id) => mappedObjectBlock(xml, map, id))
      .sort((left, right) => right.start - left.start);
    let result = xml;
    for (const range of ranges) {
      result = result.slice(0, range.start) + result.slice(range.end);
    }
    return result;
  });
}

async function swapMappedObjects(
  bytes: Uint8Array,
  map: PptvPptxMap,
  leftId: string,
  rightId: string,
): Promise<Uint8Array> {
  return rewritePart(bytes, SLIDE_PART, (xml) => {
    const left = mappedObjectBlock(xml, map, leftId);
    const right = mappedObjectBlock(xml, map, rightId);
    const first = left.start < right.start ? left : right;
    const second = left.start < right.start ? right : left;
    return (
      xml.slice(0, first.start) +
      second.text +
      xml.slice(first.end, second.start) +
      first.text +
      xml.slice(second.end)
    );
  });
}

const TYPED_PLACEMENT: PptvPlacement = {
  slideId: "typed-slide",
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  policy: "identity",
};

function typedDiagramSource(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-pptv-version="0.1"
  id="typed-diagram" viewBox="0 0 800 600">
  <rect id="typed.rect" data-pptv-role="shape" data-pptv-export="native"
    x="50" y="60" width="160" height="90"
    fill="#112233" stroke="#445566" stroke-width="2"/>
  <ellipse id="typed.ellipse" data-pptv-role="shape" data-pptv-export="native"
    cx="330" cy="110" rx="60" ry="35"
    fill="#abcdef" stroke="#334455" stroke-width="2"/>
  <line id="typed.connector" data-pptv-role="connector" data-pptv-export="native"
    data-pptv-from="typed.rect" data-pptv-to="typed.ellipse"
    x1="210" y1="105" x2="270" y2="110"
    fill="none" stroke="#556677" stroke-width="3"/>
  <text id="typed.text" data-pptv-role="text" data-pptv-export="native"
    data-pptv-frame="80 210 300 70" data-pptv-line-step="32"
    x="90" y="252" fill="#17211e" stroke="none" stroke-width="1"
    font-family="Arial" font-size="26" font-weight="400"
    font-style="normal" text-anchor="start">Typed text</text>
  <g id="typed.group" data-pptv-role="group" data-pptv-export="native"
    transform="translate(15 20)">
    <rect id="typed.group.box" data-pptv-role="shape" data-pptv-export="native"
      x="430" y="330" width="180" height="100"
      fill="#eeeeee" stroke="#222222" stroke-width="2"/>
    <text id="typed.group.label" data-pptv-role="text" data-pptv-export="native"
      data-pptv-frame="450 350 140 50" data-pptv-line-step="24"
      x="450" y="382" fill="#111111" font-family="Arial"
      font-size="20">Group</text>
  </g>
</svg>`;
}

async function typedFixture(
  placement: PptvPlacement = TYPED_PLACEMENT,
): Promise<BaselineFixture> {
  const sourceText = typedDiagramSource();
  const diagram = await loadDiagram({
    kind: "text",
    text: sourceText,
    name: "typed-diagram.pptv.svg",
  });
  return {
    sourceText,
    diagram,
    artifact: await compilePptxBaseline(diagram, { placement }),
  };
}

function appendCentralDirectoryAlias(
  bytes: Uint8Array,
  sourceName: string,
  aliasName: string,
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  const minimumOffset = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (
    let offset = bytes.byteLength - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.byteLength
    ) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Missing test ZIP end-of-central-directory record");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (centralOffset + centralSize !== eocdOffset) {
    throw new Error("Test ZIP central-directory bounds are inconsistent");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const aliasBytes = new TextEncoder().encode(aliasName);
  let offset = centralOffset;
  let aliasEntry: Uint8Array | undefined;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Malformed test ZIP central-directory entry");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const suffixStart = nameStart + nameLength;
    const nextOffset = suffixStart + extraLength + commentLength;
    const name = decoder.decode(bytes.subarray(nameStart, suffixStart));
    if (name === sourceName) {
      aliasEntry = new Uint8Array(
        46 + aliasBytes.byteLength + extraLength + commentLength,
      );
      aliasEntry.set(bytes.subarray(offset, nameStart), 0);
      new DataView(aliasEntry.buffer).setUint16(
        28,
        aliasBytes.byteLength,
        true,
      );
      aliasEntry.set(aliasBytes, 46);
      aliasEntry.set(
        bytes.subarray(suffixStart, nextOffset),
        46 + aliasBytes.byteLength,
      );
    }
    offset = nextOffset;
  }
  if (aliasEntry === undefined || offset !== eocdOffset) {
    throw new Error(`Missing test ZIP entry "${sourceName}"`);
  }

  const result = new Uint8Array(bytes.byteLength + aliasEntry.byteLength);
  result.set(bytes.subarray(0, eocdOffset), 0);
  result.set(aliasEntry, eocdOffset);
  result.set(bytes.subarray(eocdOffset), eocdOffset + aliasEntry.byteLength);
  const resultView = new DataView(result.buffer);
  const resultEocdOffset = eocdOffset + aliasEntry.byteLength;
  resultView.setUint16(resultEocdOffset + 8, entryCount + 1, true);
  resultView.setUint16(resultEocdOffset + 10, entryCount + 1, true);
  resultView.setUint32(
    resultEocdOffset + 12,
    centralSize + aliasEntry.byteLength,
    true,
  );
  return result;
}

function codes(result: {
  readonly diagnostics: readonly { readonly code: string }[];
}): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
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
  const directory = await mkdtemp(join(tmpdir(), "pptv-reconcile-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("C10 bounded PPTX reconciliation", () => {
  it("returns unchanged for the exact baseline and native-style recompression/directory entries", async () => {
    const { diagram, artifact } = await baselineFixture();

    const exact = await reconcilePptx(
      diagram,
      artifact.map,
      artifact.pptxBytes,
    );
    expect(exact).toMatchObject({
      schema: "pptv-pptx-reconciliation/0.2",
      status: "unchanged",
      sourceSha256: diagram.source.sha256,
      baselineMapSha256: artifact.mapSha256,
      editedPptxSha256: artifact.pptxSha256,
      changes: [],
      summary: {
        highestDisposition: "auto-fixable",
        findingCounts: {
          autoFixable: 0,
          reviewRequired: 0,
          refused: 0,
        },
      },
      findings: [],
      candidateOperations: [],
      diagnostics: [],
    });
    expect(exact.patch).toBeUndefined();

    const recompressed = await recompress(artifact.pptxBytes);
    expect(sha256(recompressed)).not.toBe(artifact.pptxSha256);
    const normalized = await reconcilePptx(diagram, artifact.map, recompressed);
    expect(normalized.status).toBe("unchanged");
    expect(normalized.changes).toEqual([]);
    expect(normalized.patch).toBeUndefined();
    expect(normalized.editedPptxSha256).toBe(sha256(recompressed));
  });

  it("proves the exact native-save envelope and emits a deterministic agent-grade report", async () => {
    const { diagram, artifact } = await baselineFixture();
    const native = await nativeSaveEnvelope(artifact.pptxBytes, artifact.map);
    const inspection = await inspectPptxForReconciliation(native, artifact.map);
    expect(inspection.diagnostics).toEqual([]);
    expect(inspection.inspection).toBeDefined();

    const first = await reconcilePptx(diagram, artifact.map, native);
    const second = await reconcilePptx(diagram, artifact.map, native);

    expect(first.status).toBe("unchanged");
    expect(first.changes).toEqual([]);
    expect(first.patch).toBeUndefined();
    expect(first.findings).toEqual(second.findings);
    expect(first.candidateOperations).toEqual(second.candidateOperations);
    expect(first.summary.occurrenceCounts.normalizations).toBeGreaterThan(8);
    const rules = new Set(
      first.findings
        .map((finding) => finding.normalizationRule?.id)
        .filter((id): id is string => id !== undefined),
    );
    expect([...rules]).toEqual(
      expect.arrayContaining([
        "pptv-c10/content-type-set/1",
        "pptv-c10/relationship-graph/1",
        "pptv-c10/view-properties-inert/1",
        "pptv-c10/table-styles-inert/1",
        "pptv-c10/slide-size-preset-omitted/1",
        "pptv-c10/root-zero-group-transform/1",
        "pptv-c10/theme-empty-defaults/1",
        "pptv-c10/presentation-property-defaults/1",
        "pptv-c10/end-paragraph-style-marker-omitted/1",
      ]),
    );
  });

  it("authenticates an exact native baseline before comparing a later edit against it", async () => {
    const { diagram, artifact } = await baselineFixture();
    const native = await nativeSaveEnvelope(artifact.pptxBytes, artifact.map);
    const edited = await editTitle(native, "Edited after native save");

    const result = await reconcilePptx(diagram, artifact.map, edited, {
      nativeBaselinePptxBytes: native,
    });
    expect(result).toMatchObject({
      status: "patchable",
      nativeBaselinePptxSha256: sha256(native),
      changes: [
        {
          kind: "text",
          objectId: TITLE_ID,
          oldText: TITLE,
          newText: "Edited after native save",
        },
      ],
      patch: {
        ops: [{ op: "set-text", value: "Edited after native save" }],
      },
    });
    expect(result.summary.occurrenceCounts.normalizations).toBeGreaterThan(8);

    const unauthenticated = await reconcilePptx(diagram, artifact.map, edited, {
      nativeBaselinePptxBytes: edited,
    });
    expect(unauthenticated).toMatchObject({
      status: "refused",
      diagnostics: [{ code: "PPTV-RECONCILE-INVALID-BASELINE" }],
    });
    expect(unauthenticated.patch).toBeUndefined();
  });

  it("keeps near-match normalization candidates fail-closed", async () => {
    const { diagram, artifact } = await baselineFixture();
    const nonzeroRootTransform = await rewritePart(
      artifact.pptxBytes,
      SLIDE_PART,
      (xml) =>
        xml.replace(
          "<p:grpSpPr/>",
          '<p:grpSpPr><a:xfrm><a:off x="1" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
        ),
    );
    const transform = await reconcilePptx(
      diagram,
      artifact.map,
      nonzeroRootTransform,
    );
    expect(transform.status).toBe("review-required");
    expect(codes(transform)).toContain("PPTV-RECONCILE-UNSUPPORTED");
    expect(
      transform.findings.some(
        (finding) =>
          finding.normalizationRule?.id ===
          "pptv-c10/root-zero-group-transform/1",
      ),
    ).toBe(false);

    const conflictingEndMarker = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      TITLE_ID,
      (block) =>
        block.replace(
          /(<a:endParaRPr\b[^>]*\sb=")1(")/u,
          (_match, prefix: string, suffix: string) => `${prefix}0${suffix}`,
        ),
    );
    const marker = await reconcilePptx(
      diagram,
      artifact.map,
      conflictingEndMarker,
    );
    expect(marker.status).toBe("review-required");
    expect(codes(marker)).toContain("PPTV-RECONCILE-UNSUPPORTED");
    expect(marker.patch).toBeUndefined();

    const exactEnvelope = await nativeSaveEnvelope(
      artifact.pptxBytes,
      artifact.map,
    );
    const populatedTableStyles = await rewritePart(
      exactEnvelope,
      "ppt/tableStyles.xml",
      (xml) =>
        xml.replace(
          '}"/>',
          '}"><a:tblStyle styleId="{00000000-0000-0000-0000-000000000000}" styleName="Unsafe"/></a:tblStyleLst>',
        ),
    );
    const tableStyles = await reconcilePptx(
      diagram,
      artifact.map,
      populatedTableStyles,
    );
    expect(tableStyles.status).toBe("review-required");
    expect(codes(tableStyles)).toContain("PPTV-RECONCILE-UNSUPPORTED");
    expect(
      tableStyles.findings.some(
        (finding) =>
          finding.normalizationRule?.id === "pptv-c10/table-styles-inert/1",
      ),
    ).toBe(false);
  });

  it("redacts private producer metadata without changing safe evidence", async () => {
    expect(
      redactPrivateValues({
        lastModifiedBy: "private@example.test",
        creator: "Private Author",
        nested: {
          company: "Private Company",
          version: "16.99",
        },
      }),
    ).toEqual({
      lastModifiedBy: "[redacted]",
      creator: "[redacted]",
      nested: {
        company: "[redacted]",
        version: "16.99",
      },
    });

    const privateValue = "private-author@example.test";
    const { diagram, artifact } = await baselineFixture();
    const privateMetadata = await rewritePart(
      artifact.pptxBytes,
      "docProps/core.xml",
      (xml) => xml.replaceAll("office180", privateValue),
    );
    const report = await reconcilePptx(diagram, artifact.map, privateMetadata);
    expect(report.status).toBe("unchanged");
    expect(JSON.stringify(report)).not.toContain(privateValue);
    expect(
      report.findings.some(
        (finding) =>
          finding.normalizationRule?.id === "pptv-c10/generated-metadata/1",
      ),
    ).toBe(true);
  });

  it("turns one direct single-line a:t edit into one minimal C5 set-text operation", async () => {
    const { diagram, artifact } = await baselineFixture();
    const edited = await editTitle(artifact.pptxBytes, "Edited title");

    const result = await reconcilePptx(diagram, artifact.map, edited);

    expect(result.status).toBe("patchable");
    expect(result.diagnostics).toEqual([]);
    expect(result.changes).toEqual([
      {
        kind: "text",
        objectId: TITLE_ID,
        field: "text",
        oldText: TITLE,
        newText: "Edited title",
        patchable: true,
      },
    ]);
    expect(result.patch).toEqual({
      schema: "pptv-patch/0.2",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: TITLE_ID,
          oldText: TITLE,
          value: "Edited title",
        },
      ],
    });
    expect(Object.isFrozen(result.patch)).toBe(true);

    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(applied.sourceText).toBeDefined();
    expect(applied.sourceText).toBe(
      diagram.source.text.replace(TITLE, "Edited title"),
    );
    const regenerated = await compilePptxBaseline(applied.diagram!, {
      placement: IDENTITY_PLACEMENT,
    });
    const regeneratedTitle = regenerated.map.slides[0]!.objects.find(
      (object) => object.id === TITLE_ID,
    );
    expect(regeneratedTitle?.emitted.drawingMl).toMatchObject({
      run: { text: "Edited title" },
    });
  });

  it("authenticates, applies, and regenerates text-only edits through a canonical uniform map", async () => {
    const { diagram } = await baselineFixture();
    const uniform = await compilePptxBaseline(diagram, {
      placement: UNIFORM_PLACEMENT,
    });
    expect(
      await reconcilePptx(diagram, uniform.map, uniform.pptxBytes),
    ).toMatchObject({
      status: "unchanged",
      changes: [],
      diagnostics: [],
    });
    const edited = await editTitle(uniform.pptxBytes, "Uniform title");

    const result = await reconcilePptx(diagram, uniform.map, edited);
    expect(result).toMatchObject({
      status: "patchable",
      changes: [
        {
          kind: "text",
          objectId: TITLE_ID,
          oldText: TITLE,
          newText: "Uniform title",
        },
      ],
      diagnostics: [],
    });
    expect(result.patch).toMatchObject({
      schema: "pptv-patch/0.2",
      ops: [{ op: "set-text", id: TITLE_ID, value: "Uniform title" }],
    });

    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    const regenerated = await compilePptxBaseline(applied.diagram!, {
      placement: UNIFORM_PLACEMENT,
    });
    expect(regenerated.map.composition).toMatchObject({
      placement: UNIFORM_PLACEMENT,
      scale: 0.5,
      translateX: 100,
      translateY: 85,
    });
    expect(
      regenerated.map.slides[0]!.objects.find(
        (object) => object.id === TITLE_ID,
      )?.emitted.drawingMl,
    ).toMatchObject({ run: { text: "Uniform title" } });

    const nonCanonical = structuredClone(uniform.map) as PptvPptxMap & {
      composition: { translateX: number };
    };
    nonCanonical.composition.translateX += 1;
    expect(
      await reconcilePptx(diagram, nonCanonical, uniform.pptxBytes),
    ).toMatchObject({
      status: "refused",
      diagnostics: [{ code: "PPTV-RECONCILE-INVALID-BASELINE" }],
    });
  });

  it("treats cNvPr renumbering as incidental and direct boundary whitespace as text", async () => {
    const { diagram, artifact } = await baselineFixture();
    const titleNumericId = artifact.map.slides[0]!.objects.find(
      (object) => object.id === TITLE_ID,
    )!.emitted.cNvPrNumericId;
    const renumbered = await rewritePart(
      artifact.pptxBytes,
      SLIDE_PART,
      (xml) =>
        xml.replace(
          `id="${titleNumericId}" name="src.${TITLE_ID}"`,
          `id="98765" name="src.${TITLE_ID}"`,
        ),
    );
    const renumberInspection = await inspectPptxForReconciliation(
      renumbered,
      artifact.map,
    );
    expect(renumberInspection.inspection).toBeDefined();
    expect(
      await reconcilePptx(diagram, artifact.map, renumbered),
    ).toMatchObject({
      status: "unchanged",
      changes: [],
      diagnostics: [],
    });

    const whitespace = await editTitle(
      artifact.pptxBytes,
      ` ${TITLE} `,
      ' xml:space="preserve"',
    );
    const result = await reconcilePptx(diagram, artifact.map, whitespace);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toEqual([
      {
        op: "set-text",
        id: TITLE_ID,
        oldText: TITLE,
        value: ` ${TITLE} `,
      },
    ]);
  });

  it("refuses stale source, tampered map, lineage, invalid packages, and unstable identities", async () => {
    const { sourceText, diagram, artifact } = await baselineFixture();
    const stale = await loadDiagram({
      kind: "text",
      text: `${sourceText}\n`,
      name: "stale.pptv.svg",
    });
    expect(
      await reconcilePptx(stale, artifact.map, artifact.pptxBytes),
    ).toMatchObject({
      status: "refused",
      diagnostics: [{ code: "PPTV-RECONCILE-STALE-SOURCE" }],
    });

    const tamperedMap = structuredClone(artifact.map) as {
      pptx: { sha256: string };
    } & PptvPptxMap;
    tamperedMap.pptx.sha256 = "0".repeat(64);
    expect(
      await reconcilePptx(diagram, tamperedMap, artifact.pptxBytes),
    ).toMatchObject({
      status: "refused",
      diagnostics: [{ code: "PPTV-RECONCILE-INVALID-BASELINE" }],
    });

    const lineage = await rewritePart(
      artifact.pptxBytes,
      "docProps/custom.xml",
      (xml) => xml.replace(diagram.source.sha256, "f".repeat(64)),
    );
    const lineageResult = await reconcilePptx(diagram, artifact.map, lineage);
    expect(lineageResult.status).toBe("refused");
    expect(codes(lineageResult)).toContain("PPTV-RECONCILE-LINEAGE");
    expect(lineageResult.patch).toBeUndefined();

    const invalid = await reconcilePptx(
      diagram,
      artifact.map,
      new TextEncoder().encode("not a pptx"),
    );
    expect(invalid.status).toBe("refused");
    expect(codes(invalid)).toContain("PPTV-RECONCILE-INVALID-PPTX");

    const unsafeRelationship = await rewritePart(
      artifact.pptxBytes,
      "ppt/_rels/presentation.xml.rels",
      (xml) =>
        xml.replace(
          'Target="slides/slide1.xml"',
          'Target="../../../outside.xml"',
        ),
    );
    const unsafe = await reconcilePptx(
      diagram,
      artifact.map,
      unsafeRelationship,
    );
    expect(unsafe.status).toBe("refused");
    expect(codes(unsafe)).toContain("PPTV-RECONCILE-INVALID-PPTX");

    const missingIdentity = await rewritePart(
      artifact.pptxBytes,
      SLIDE_PART,
      (xml) => xml.replace(`name="src.${TITLE_ID}"`, 'name="PowerPoint title"'),
    );
    const missing = await reconcilePptx(diagram, artifact.map, missingIdentity);
    expect(missing.status).toBe("refused");
    expect(codes(missing)).toContain("PPTV-RECONCILE-MISSING-ID");
    expect(missing.patch).toBeUndefined();

    const duplicateIdentity = await rewritePart(
      artifact.pptxBytes,
      SLIDE_PART,
      (xml) =>
        xml.replace(
          'name="src.system-overview.client.label"',
          `name="src.${TITLE_ID}"`,
        ),
    );
    const duplicate = await reconcilePptx(
      diagram,
      artifact.map,
      duplicateIdentity,
    );
    expect(duplicate.status).toBe("refused");
    expect(codes(duplicate)).toContain("PPTV-RECONCILE-DUPLICATE-ID");
    expect(duplicate.patch).toBeUndefined();
    expect(
      duplicate.changes.some(
        (change) => change.kind === "deletion" && change.objectId === TITLE_ID,
      ),
    ).toBe(false);
    expect(
      duplicate.candidateOperations.some(
        (candidate) =>
          candidate.operation.op === "delete-object" &&
          candidate.operation.id === TITLE_ID,
      ),
    ).toBe(false);
    const duplicateFinding = duplicate.findings.find(
      (finding) => finding.code === "PPTV-RECONCILE-DUPLICATE-ID",
    );
    expect(duplicateFinding).toMatchObject({
      disposition: "refused",
      occurrenceCount: 2,
      scope: { kind: "object", objectId: TITLE_ID },
      evidence: [
        {
          kind: "identity-occurrence",
          edited: {
            occurrenceCount: 2,
            numericIdsAreAuthority: false,
          },
        },
      ],
    });
    expect(
      (
        duplicateFinding?.evidence[0]?.edited as
          { occurrences?: readonly unknown[] } | undefined
      )?.occurrences,
    ).toHaveLength(2);
  });

  it("refuses colliding and centrally aliased raw ZIP entry names", async () => {
    const { artifact } = await baselineFixture();
    const cases = [
      {
        aliasName: SLIDE_PART,
        message:
          /central directory contains duplicate, case-colliding, or path-equivalent/u,
      },
      {
        aliasName: "ppt/slides/./slide1.xml",
        message:
          /central directory contains duplicate, case-colliding, or path-equivalent/u,
      },
      {
        aliasName: "ppt/slides/Slide1.xml",
        message:
          /central directory contains duplicate, case-colliding, or path-equivalent/u,
      },
      {
        aliasName: "ppt/slides/slide2.xml",
        message: /central-directory and local-header entry names do not match/u,
      },
    ];
    for (const { aliasName, message } of cases) {
      const aliased = appendCentralDirectoryAlias(
        artifact.pptxBytes,
        SLIDE_PART,
        aliasName,
      );
      const inspection = await inspectPptxForReconciliation(
        aliased,
        artifact.map,
      );
      expect(inspection.inspection, aliasName).toBeUndefined();
      expect(codes(inspection), aliasName).toEqual([
        "PPTV-RECONCILE-INVALID-PPTX",
      ]);
      expect(inspection.diagnostics[0]?.message, aliasName).toMatch(message);
    }
  });

  it("reports unsupported run, line, and package changes without a patch", async () => {
    const { diagram, artifact } = await baselineFixture();
    const cases: Array<{
      name: string;
      edit(): Promise<Uint8Array>;
    }> = [
      {
        name: "multiple runs",
        edit: () =>
          rewritePart(artifact.pptxBytes, SLIDE_PART, (xml) =>
            xml.replace(
              new RegExp(`(<a:t>${TITLE}</a:t>\\s*</a:r>)`, "u"),
              "$1<a:r><a:t>second</a:t></a:r>",
            ),
          ),
      },
      {
        name: "multiline text",
        edit: () => editTitle(artifact.pptxBytes, "first&#10;second"),
      },
      {
        name: "new package part",
        edit: async () => {
          const zip = await JSZip.loadAsync(artifact.pptxBytes, {
            checkCRC32: true,
          });
          zip.file(
            "ppt/notesSlides/notesSlide1.xml",
            '<?xml version="1.0" encoding="UTF-8"?><notes/>',
            { createFolders: false },
          );
          return zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            platform: "DOS",
          });
        },
      },
    ];

    for (const testCase of cases) {
      let edited: Uint8Array;
      try {
        edited = await testCase.edit();
      } catch (error) {
        throw new Error(
          `${testCase.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const result = await reconcilePptx(diagram, artifact.map, edited);
      expect(result.status, `${testCase.name} should require review`).toBe(
        "review-required",
      );
      expect(codes(result), `${testCase.name} should be explicit`).toContain(
        "PPTV-RECONCILE-UNSUPPORTED",
      );
      expect(result.patch).toBeUndefined();
    }
  });

  it("round-trips exact rect and ellipse geometry through typed C5 operations", async () => {
    const { diagram, artifact } = await typedFixture();
    const rectEdited = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      "typed.rect",
      (block) =>
        block
          .replace(
            /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u,
            (_match, x: string, y: string) =>
              `<a:off x="${Number(x) + 7620}" y="${Number(y) + 7620}"/>`,
          )
          .replace(
            /<a:ext cx="(\d+)" cy="(\d+)"\/>/u,
            (_match, cx: string, cy: string) =>
              `<a:ext cx="${Number(cx) + 7620}" cy="${Number(cy)}"/>`,
          ),
    );
    const edited = await rewriteMappedObject(
      rectEdited,
      artifact.map,
      "typed.ellipse",
      (block) =>
        block
          .replace(
            /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u,
            (_match, x: string, y: string) =>
              `<a:off x="${Number(x) + 7620}" y="${Number(y)}"/>`,
          )
          .replace(
            /<a:ext cx="(\d+)" cy="(\d+)"\/>/u,
            (_match, cx: string, cy: string) =>
              `<a:ext cx="${Number(cx) + 15240}" cy="${Number(cy) + 15240}"/>`,
          ),
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.diagnostics).toEqual([]);
    expect(result.patch).toMatchObject({
      schema: "pptv-patch/0.2",
      ops: [
        {
          op: "set-object-geometry",
          id: "typed.rect",
          geometry: {
            kind: "rect",
            x: 51,
            y: 61,
            width: 161,
            height: 90,
          },
        },
        {
          op: "set-object-geometry",
          id: "typed.ellipse",
          geometry: {
            kind: "ellipse",
            cx: 332,
            cy: 111,
            rx: 61,
            ry: 36,
          },
        },
      ],
    });
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    const regenerated = await compilePptxBaseline(applied.diagram!, {
      placement: TYPED_PLACEMENT,
    });
    expect(
      regenerated.map.slides[0]!.objects.find(
        (object) => object.id === "typed.ellipse",
      )?.resolved.geometry,
    ).toMatchObject({ cx: 332, cy: 111, rx: 61, ry: 36 });
  });

  it("inverts uniform placement exactly for connector endpoint edits", async () => {
    const uniformPlacement: PptvPlacement = {
      slideId: "typed-uniform",
      x: 100,
      y: 50,
      width: 400,
      height: 300,
      policy: "uniform-scale-translate",
    };
    const { diagram, artifact } = await typedFixture(uniformPlacement);
    const edited = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      "typed.connector",
      (block) =>
        block.replace(
          /<a:ext cx="(\d+)" cy="(\d+)"\/>/u,
          (_match, cx: string, cy: string) =>
            `<a:ext cx="${Number(cx) + 7620}" cy="${Number(cy)}"/>`,
        ),
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toEqual([
      {
        op: "set-connector-endpoints",
        id: "typed.connector",
        oldEndpoints: { x1: 210, y1: 105, x2: 270, y2: 110 },
        endpoints: { x1: 210, y1: 105, x2: 272, y2: 110 },
      },
    ]);
    expect((await applyPatch(diagram, result.patch)).applied).toBe(true);
  });

  it("round-trips explicit group translation and direct text frame/anchor shifts", async () => {
    const { diagram, artifact } = await typedFixture();
    const movedGroup = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      "typed.group",
      (block) =>
        block.replace(
          /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u,
          (_match, x: string, y: string) =>
            `<a:off x="${Number(x) + 7620}" y="${Number(y) + 15240}"/>`,
        ),
    );
    const edited = await rewriteMappedObject(
      movedGroup,
      artifact.map,
      "typed.text",
      (block) =>
        block
          .replace(
            /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u,
            (_match, x: string, y: string) =>
              `<a:off x="${Number(x) + 7620}" y="${Number(y) + 7620}"/>`,
          )
          .replace(
            /<a:ext cx="(\d+)" cy="(\d+)"\/>/u,
            (_match, cx: string, cy: string) =>
              `<a:ext cx="${Number(cx) + 7620}" cy="${Number(cy) + 7620}"/>`,
          ),
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toMatchObject([
      {
        op: "set-text-frame",
        id: "typed.text",
        frame: { x: 81, y: 211, width: 301, height: 71 },
        lineAnchor: { x: 91, y: 253 },
      },
      {
        op: "set-group-translation",
        id: "typed.group",
        translation: { x: 16, y: 22 },
      },
    ]);
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(
      await compilePptxBaseline(applied.diagram!, {
        placement: TYPED_PLACEMENT,
      }),
    ).toBeDefined();
  });

  it("round-trips direct concrete native style without a generic attribute path", async () => {
    const { diagram, artifact } = await typedFixture();
    const edited = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      "typed.rect",
      (block) =>
        block
          .replace('val="112233"', 'val="A1B2C3"')
          .replace('<a:ln w="15240">', '<a:ln w="22860">'),
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toMatchObject([
      {
        op: "set-native-style",
        id: "typed.rect",
        style: { fill: "#a1b2c3", strokeWidth: 3 },
      },
    ]);
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(applied.sourceText).toContain('fill="#a1b2c3"');
    expect(applied.sourceText).toContain('stroke-width="3"');
  });

  it("round-trips pure within-parent painter order", async () => {
    const { diagram, artifact } = await typedFixture();
    const edited = await swapMappedObjects(
      artifact.pptxBytes,
      artifact.map,
      "typed.rect",
      "typed.ellipse",
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toEqual([
      {
        op: "set-child-order",
        parentId: "typed-diagram",
        oldOrder: [
          "typed.rect",
          "typed.ellipse",
          "typed.connector",
          "typed.text",
          "typed.group",
        ],
        order: [
          "typed.ellipse",
          "typed.rect",
          "typed.connector",
          "typed.text",
          "typed.group",
        ],
      },
    ]);
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(applied.diagram?.children.map((object) => object.id)).toEqual([
      "typed.ellipse",
      "typed.rect",
      "typed.connector",
      "typed.text",
      "typed.group",
    ]);
  });

  it("round-trips pure painter order within a mapped group", async () => {
    const { diagram, artifact } = await typedFixture();
    const edited = await swapMappedObjects(
      artifact.pptxBytes,
      artifact.map,
      "typed.group.box",
      "typed.group.label",
    );

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toEqual([
      {
        op: "set-child-order",
        parentId: "typed.group",
        oldOrder: ["typed.group.box", "typed.group.label"],
        order: ["typed.group.label", "typed.group.box"],
      },
    ]);
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(
      applied.diagram?.children
        .find((object) => object.id === "typed.group")
        ?.children.map((object) => object.id),
    ).toEqual(["typed.group.label", "typed.group.box"]);
  });

  it("round-trips safe subtree deletion with same-transaction connector accounting", async () => {
    const { diagram, artifact } = await typedFixture();
    const edited = await removeMappedObjects(artifact.pptxBytes, artifact.map, [
      "typed.connector",
      "typed.ellipse",
    ]);

    const result = await reconcilePptx(diagram, artifact.map, edited);
    expect(result.status).toBe("patchable");
    expect(result.patch?.ops).toEqual([
      {
        op: "delete-object",
        id: "typed.ellipse",
        oldParentId: null,
        oldOrder: 1,
      },
      {
        op: "delete-object",
        id: "typed.connector",
        oldParentId: null,
        oldOrder: 2,
      },
    ]);
    const applied = await applyPatch(diagram, result.patch);
    expect(applied.applied).toBe(true);
    expect(applied.diagram?.index.objects.has("typed.ellipse")).toBe(false);
    expect(applied.diagram?.index.objects.has("typed.connector")).toBe(false);
  });

  it("keeps group scaling, reparenting, implicit transforms, and inline styles fail-closed", async () => {
    const { diagram, artifact } = await typedFixture();
    const scaledGroup = await rewriteMappedObject(
      artifact.pptxBytes,
      artifact.map,
      "typed.group",
      (block) =>
        block.replace(
          /<a:ext cx="(\d+)" cy="(\d+)"\/>/u,
          (_match, cx: string, cy: string) =>
            `<a:ext cx="${Number(cx) + 7620}" cy="${Number(cy)}"/>`,
        ),
    );
    const scaled = await reconcilePptx(diagram, artifact.map, scaledGroup);
    expect(scaled.status).toBe("review-required");
    expect(codes(scaled)).toContain("PPTV-RECONCILE-UNSUPPORTED");
    expect(scaled.patch).toBeUndefined();

    const reparented = await rewritePart(
      artifact.pptxBytes,
      SLIDE_PART,
      (xml) => {
        const child = mappedObjectBlock(xml, artifact.map, "typed.rect");
        const group = mappedObjectBlock(xml, artifact.map, "typed.group");
        const withoutChild = xml.slice(0, child.start) + xml.slice(child.end);
        const adjustedGroupEnd =
          group.end - (child.start < group.start ? child.end - child.start : 0);
        const closing = withoutChild.lastIndexOf(
          "</p:grpSp>",
          adjustedGroupEnd,
        );
        return (
          withoutChild.slice(0, closing) +
          child.text +
          withoutChild.slice(closing)
        );
      },
    );
    const reparent = await reconcilePptx(diagram, artifact.map, reparented);
    expect(reparent.status).toBe("review-required");
    expect(codes(reparent)).toContain("PPTV-RECONCILE-AMBIGUOUS");
    expect(reparent.patch).toBeUndefined();

    const minimal = await baselineFixture();
    const implicitGroup = await rewriteMappedObject(
      minimal.artifact.pptxBytes,
      minimal.artifact.map,
      "system-overview.service",
      (block) =>
        block.replace(
          /<a:off x="(-?\d+)" y="(-?\d+)"\/>/u,
          (_match, x: string, y: string) =>
            `<a:off x="${Number(x) + 7620}" y="${Number(y)}"/>`,
        ),
    );
    const implicit = await reconcilePptx(
      minimal.diagram,
      minimal.artifact.map,
      implicitGroup,
    );
    expect(implicit.status).toBe("review-required");
    expect(implicit.patch).toBeUndefined();

    const inlineStyle = await rewriteMappedObject(
      minimal.artifact.pptxBytes,
      minimal.artifact.map,
      TITLE_ID,
      (block) => block.replaceAll('val="17211E"', 'val="AABBCC"'),
    );
    const inline = await reconcilePptx(
      minimal.diagram,
      minimal.artifact.map,
      inlineStyle,
    );
    expect(inline.status).toBe("review-required");
    expect(inline.patch).toBeUndefined();
  });

  it("publishes explicit CLI outputs atomically and leaves every input immutable", async () => {
    await withTempDirectory(async (directory) => {
      const { sourceText, artifact } = await baselineFixture();
      const edited = await editTitle(artifact.pptxBytes, "CLI title");
      const sourcePath = join(directory, "atom.pptv.svg");
      const baselinePath = join(directory, "atom.pptv.map.json");
      const editedPath = join(directory, "edited.pptx");
      const reportPath = join(directory, "report.json");
      const patchPath = join(directory, "patch.json");
      await Promise.all([
        writeFile(sourcePath, sourceText),
        writeFile(baselinePath, artifact.mapText),
        writeFile(editedPath, edited),
      ]);
      const sourceBefore = await readFile(sourcePath);
      const mapBefore = await readFile(baselinePath);
      const editedBefore = await readFile(editedPath);
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "reconcile",
            editedPath,
            "--source",
            sourcePath,
            "--baseline",
            baselinePath,
            "--patch",
            patchPath,
            "--report",
            reportPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "pptv-reconcile-result/0.1",
        status: "patchable",
        report: reportPath,
        patch: patchPath,
      });
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
        status: "patchable",
      });
      expect(JSON.parse(await readFile(patchPath, "utf8"))).toMatchObject({
        schema: "pptv-patch/0.2",
        ops: [{ op: "set-text", value: "CLI title" }],
      });
      expect(await readFile(sourcePath)).toEqual(sourceBefore);
      expect(await readFile(baselinePath)).toEqual(mapBefore);
      expect(await readFile(editedPath)).toEqual(editedBefore);

      const rollbackReport = join(directory, "rollback-report.json");
      const existingPatch = join(directory, "existing-patch.json");
      await writeFile(existingPatch, "keep me");
      const failed = captureEnvironment();
      expect(
        await runCli(
          [
            "reconcile",
            editedPath,
            "--source",
            sourcePath,
            "--baseline",
            baselinePath,
            "--patch",
            existingPatch,
            "--report",
            rollbackReport,
          ],
          failed.environment,
        ),
      ).toBe(1);
      expect(failed.stderr.join("")).toContain("PPTV-RECONCILE-EXISTS");
      expect(await readFile(existingPatch, "utf8")).toBe("keep me");
      expect(await readdir(directory)).not.toContain("rollback-report.json");
      expect(await readFile(sourcePath)).toEqual(sourceBefore);
      expect(await readFile(baselinePath)).toEqual(mapBefore);
      expect(await readFile(editedPath)).toEqual(editedBefore);
    });
  });
});
