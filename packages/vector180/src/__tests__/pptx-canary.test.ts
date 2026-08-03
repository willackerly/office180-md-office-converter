// Tests: CONTRACT:C7-PPTX-CANARY.2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import {
  resolveVector180Deck,
  type Vector180ResolvedDeck,
} from "../core/resolved.js";
import {
  compilePptxCanary,
  compilePptxCanaryWithLineage,
  compileVector180PptxCanary,
  createPptxCanaryGraph,
  PptxCanaryCompileError,
  validatePptxCanaryGraph,
  type PptxCanaryErrorCode,
  type PptxCanaryGraph,
} from "../node/pptx-canary.js";
import { readMinimalDeck } from "./test-helpers.js";

type MutableObject = Record<string, unknown> & {
  children?: MutableObject[];
  id?: string;
  kind?: string;
};

interface MutableSlide {
  id: string;
  order: number;
  objects: MutableObject[];
}

interface MutableDeck {
  slides: MutableSlide[];
}

interface RangeCase {
  readonly label: string;
  readonly mutate: (model: MutableDeck) => void;
}

interface RejectedRangeCase extends RangeCase {
  readonly code: PptxCanaryErrorCode;
}

const TEST_EMU_PER_UNIT = 7_620;
const TEST_HUNDREDTH_POINTS_PER_UNIT = 60;
const TEST_MIN_COORDINATE_EMU = -27_273_042_329_600;
const TEST_MAX_COORDINATE_EMU = 27_273_042_316_900;
const TEST_MAX_LINE_WIDTH_EMU = 20_116_800;
const TEST_MIN_FONT_HUNDREDTH_POINTS = 100;
const TEST_MAX_FONT_HUNDREDTH_POINTS = 400_000;
const TEST_MIN_SPACING_HUNDREDTH_POINTS = 1;
const TEST_MAX_SPACING_HUNDREDTH_POINTS = 158_400;
const TEST_MAX_TEXT_MARGIN_EMU = 51_206_400;

async function canaryModel(): Promise<Vector180ResolvedDeck> {
  const deck = await loadDeck({
    kind: "text",
    text: await readMinimalDeck(),
    name: "canary.vector180.html",
  });
  const resolved = resolveVector180Deck(deck);
  expect(resolved.diagnostics).toEqual([]);
  expect(resolved.model).toBeDefined();
  const model = structuredClone(resolved.model) as unknown as {
    slides: Array<{ objects: MutableObject[] }>;
  };
  visitMutable(model, (object) => {
    if (object.kind === "rect") {
      delete object["rx"];
      delete object["ry"];
    }
  });

  const policy = findMutable(model, "architecture.node.policy.panel");
  expect(policy).toBeDefined();
  if (policy !== undefined) {
    const x = requiredNumber(policy, "x");
    const y = requiredNumber(policy, "y");
    const width = requiredNumber(policy, "width");
    const height = requiredNumber(policy, "height");
    policy.kind = "ellipse";
    policy["sourceElement"] = "ellipse";
    policy["cx"] = x + width / 2;
    policy["cy"] = y + height / 2;
    policy["rx"] = width / 2;
    policy["ry"] = height / 2;
    delete policy["x"];
    delete policy["y"];
    delete policy["width"];
    delete policy["height"];
  }

  const translated = findMutable(model, "architecture.node.client");
  expect(translated).toBeDefined();
  if (translated !== undefined) translateGroup(translated, 10, 20);
  return model as unknown as Vector180ResolvedDeck;
}

function visitMutable(
  model: { slides: Array<{ objects: MutableObject[] }> },
  visitor: (object: MutableObject) => void,
): void {
  const visit = (objects: MutableObject[]): void => {
    for (const object of objects) {
      visitor(object);
      if (Array.isArray(object.children)) visit(object.children);
    }
  };
  for (const slide of model.slides) visit(slide.objects);
}

function findMutable(
  model: { slides: Array<{ objects: MutableObject[] }> },
  id: string,
): MutableObject | undefined {
  let found: MutableObject | undefined;
  visitMutable(model, (object) => {
    if (object.id === id) found = object;
  });
  return found;
}

function requiredNumber(object: MutableObject, key: string): number {
  const value = object[key];
  if (typeof value !== "number") throw new Error(`${key} is not numeric`);
  return value;
}

function requiredRecord(
  object: MutableObject,
  key: string,
): Record<string, unknown> {
  const value = object[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${key} is not a record`);
  }
  return value as Record<string, unknown>;
}

function requiredMutable(model: MutableDeck, id: string): MutableObject {
  const object = findMutable(model, id);
  if (object === undefined) throw new Error(`Missing mutable object "${id}"`);
  return object;
}

function translateGroup(group: MutableObject, dx: number, dy: number): void {
  group["translateX"] = requiredNumber(group, "translateX") + dx;
  group["translateY"] = requiredNumber(group, "translateY") + dy;
  offsetWorld(group, dx, dy);
}

function offsetWorld(object: MutableObject, dx: number, dy: number): void {
  const worldOffset = object["worldOffset"] as
    { x: number; y: number } | undefined;
  const worldBounds = object["worldBounds"] as
    { x: number; y: number } | undefined;
  if (worldOffset === undefined || worldBounds === undefined) {
    throw new Error("Resolved object lacks world geometry");
  }
  worldOffset.x += dx;
  worldOffset.y += dy;
  worldBounds.x += dx;
  worldBounds.y += dy;
  for (const child of object.children ?? []) offsetWorld(child, dx, dy);
}

function setLineEndpoints(
  line: MutableObject,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  line["x1"] = x1;
  line["y1"] = y1;
  line["x2"] = x2;
  line["y2"] = y2;
  const bounds = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
  line["localBounds"] = { ...bounds };
  line["worldBounds"] = { ...bounds };
  line["worldOffset"] = { x: 0, y: 0 };
}

function rebuildWorldGeometry(
  object: MutableObject,
  parentWorldOffset: { x: number; y: number },
): void {
  const localBounds = requiredRecord(object, "localBounds");
  if (object.kind !== "group") {
    object["worldOffset"] = { ...parentWorldOffset };
    object["worldBounds"] = {
      x: requiredNumericField(localBounds, "x") + parentWorldOffset.x,
      y: requiredNumericField(localBounds, "y") + parentWorldOffset.y,
      width: requiredNumericField(localBounds, "width"),
      height: requiredNumericField(localBounds, "height"),
    };
    return;
  }

  const worldOffset = {
    x: parentWorldOffset.x + requiredNumber(object, "translateX"),
    y: parentWorldOffset.y + requiredNumber(object, "translateY"),
  };
  object["worldOffset"] = worldOffset;
  const children = object.children ?? [];
  if (children.length === 0) throw new Error("Cannot rebuild an empty group");
  for (const child of children) rebuildWorldGeometry(child, worldOffset);

  const childBounds = children.map((child) =>
    requiredRecord(child, "worldBounds"),
  );
  const minX = Math.min(
    ...childBounds.map((bounds) => requiredNumericField(bounds, "x")),
  );
  const minY = Math.min(
    ...childBounds.map((bounds) => requiredNumericField(bounds, "y")),
  );
  const maxX = Math.max(
    ...childBounds.map(
      (bounds) =>
        requiredNumericField(bounds, "x") +
        requiredNumericField(bounds, "width"),
    ),
  );
  const maxY = Math.max(
    ...childBounds.map(
      (bounds) =>
        requiredNumericField(bounds, "y") +
        requiredNumericField(bounds, "height"),
    ),
  );
  object["worldBounds"] = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
  object["localBounds"] = {
    x: minX - worldOffset.x,
    y: minY - worldOffset.y,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function requiredNumericField(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number") throw new Error(`${key} is not numeric`);
  return value;
}

function objectTransformXml(xml: string, id: string): string {
  const objectStart = xml.indexOf(`name="src.${id}"`);
  if (objectStart < 0) throw new Error(`Missing emitted object "${id}"`);
  const transformStart = xml.indexOf("<a:xfrm", objectStart);
  const transformEnd = xml.indexOf("</a:xfrm>", transformStart);
  if (transformStart < 0 || transformEnd < 0) {
    throw new Error(`Missing transform for emitted object "${id}"`);
  }
  return xml
    .slice(transformStart, transformEnd + "</a:xfrm>".length)
    .replace(/>\s+</gu, "><");
}

function expectCanaryCode(
  action: () => unknown,
  code: PptxCanaryErrorCode,
): void {
  try {
    action();
    throw new Error("Expected canary failure");
  } catch (error) {
    expect(error).toBeInstanceOf(PptxCanaryCompileError);
    expect(error).toMatchObject({ code });
  }
}

async function expectAsyncCanaryCode(
  action: Promise<unknown>,
  code: PptxCanaryErrorCode,
): Promise<void> {
  await expect(action).rejects.toMatchObject({
    name: "PptxCanaryCompileError",
    code,
  });
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

interface LocalHeader {
  readonly offset: number;
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly time: number;
  readonly date: number;
  readonly extraLength: number;
}

function localHeaders(bytes: Uint8Array): readonly LocalHeader[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const headers: LocalHeader[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    expect(signature).toBe(0x04034b50);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const time = view.getUint16(offset + 10, true);
    const date = view.getUint16(offset + 12, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    headers.push({
      offset,
      name,
      flags,
      method,
      time,
      date,
      extraLength,
    });
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return headers;
}

interface CentralEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly versionNeeded: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly extraLength: number;
  readonly commentLength: number;
  readonly diskStart: number;
  readonly localHeaderOffset: number;
}

interface CentralDirectory {
  readonly entries: readonly CentralEntry[];
  readonly diskNumber: number;
  readonly centralDisk: number;
  readonly diskEntries: number;
  readonly totalEntries: number;
  readonly centralSize: number;
  readonly centralOffset: number;
  readonly commentLength: number;
  readonly eocdOffset: number;
}

function centralDirectory(bytes: Uint8Array): CentralDirectory {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let eocdOffset = -1;
  const minimumOffset = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Missing ZIP end-of-central-directory");

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  const entries: CentralEntry[] = [];
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const versionNeeded = view.getUint16(offset + 6, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.push({
      name,
      flags,
      method,
      versionNeeded,
      compressedSize,
      uncompressedSize,
      extraLength,
      commentLength: entryCommentLength,
      diskStart,
      localHeaderOffset,
    });
    offset = nameStart + nameLength + extraLength + entryCommentLength;
  }

  expect(offset).toBe(centralOffset + centralSize);
  expect(offset).toBe(eocdOffset);
  expect(eocdOffset + 22 + commentLength).toBe(bytes.byteLength);
  return {
    entries,
    diskNumber,
    centralDisk,
    diskEntries,
    totalEntries,
    centralSize,
    centralOffset,
    commentLength,
    eocdOffset,
  };
}

function containsRecordSignature(
  bytes: Uint8Array,
  signature: number,
): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset++) {
    if (view.getUint32(offset, true) === signature) return true;
  }
  return false;
}

function setBackgroundX(model: MutableDeck, value: number): void {
  const background = requiredMutable(model, "cover.background");
  background["x"] = value;
  requiredRecord(background, "localBounds")["x"] = value;
  requiredRecord(background, "worldBounds")["x"] = value;
}

function setBackgroundWidth(model: MutableDeck, value: number): void {
  const background = requiredMutable(model, "cover.background");
  background["width"] = value;
  requiredRecord(background, "localBounds")["width"] = value;
  requiredRecord(background, "worldBounds")["width"] = value;
}

function setBackgroundStrokeWidth(model: MutableDeck, value: number): void {
  requiredRecord(requiredMutable(model, "cover.background"), "style")[
    "strokeWidth"
  ] = value;
}

function setTitleFontSize(model: MutableDeck, value: number): void {
  requiredRecord(requiredMutable(model, "cover.title"), "style")["fontSize"] =
    value;
}

function setTitleLineStep(model: MutableDeck, value: number): void {
  requiredMutable(model, "cover.title")["lineStep"] = value;
}

function setTitleStartMargin(
  model: MutableDeck,
  relativeX: number,
  frameWidth: number,
): void {
  const title = requiredMutable(model, "cover.title");
  const frame = requiredRecord(title, "frame");
  frame["x"] = 0;
  frame["width"] = frameWidth;
  const localBounds = requiredRecord(title, "localBounds");
  localBounds["x"] = 0;
  localBounds["width"] = frameWidth;
  const worldBounds = requiredRecord(title, "worldBounds");
  worldBounds["x"] = 0;
  worldBounds["width"] = frameWidth;
  const lines = title["lines"];
  if (!Array.isArray(lines) || lines.length !== 1) {
    throw new Error("Expected one mutable title line");
  }
  (lines[0] as Record<string, unknown>)["x"] = relativeX;
}

function setSlideId(slide: MutableSlide, id: string): void {
  slide.id = id;
  const update = (objects: MutableObject[]): void => {
    for (const object of objects) {
      object["slideId"] = id;
      update(object.children ?? []);
    }
  };
  update(slide.objects);
}

describe("C7 deterministic PPTX compiler canary", () => {
  it("builds a sorted STORE-only two-slide package with a complete strict graph", async () => {
    const model = await canaryModel();
    const first = await compileVector180PptxCanary(model);
    const second = await compilePptxCanary(model);
    const partNames = first.parts.map((part) => part.name);
    expect(first.bytes).toEqual(second.bytes);
    expect(Object.keys(first)).toEqual([
      "schema",
      "compiler",
      "sourceSha256",
      "bytes",
      "sha256",
      "parts",
    ]);
    expect(first.schema).toBe("vector180-pptx-canary/0.1");
    expect(first.compiler).toBe("office180-vector180-pptx-canary/0.1");
    expect(first.sourceSha256).toBe(model.sourceSha256);
    expect(first.sha256).toBe(
      createHash("sha256").update(first.bytes).digest("hex"),
    );
    expect(second).toEqual(first);
    expect(partNames).toEqual([...partNames].sort());
    expect(partNames).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/app.xml",
      "docProps/core.xml",
      "docProps/custom.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/presProps.xml",
      "ppt/presentation.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slides/_rels/slide1.xml.rels",
      "ppt/slides/_rels/slide2.xml.rels",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/theme/theme1.xml",
    ]);

    const headers = localHeaders(first.bytes);
    expect(headers.map((header) => header.name)).toEqual(partNames);
    expect(headers.every((header) => header.method === 0)).toBe(true);
    expect(headers.every((header) => (header.flags & 0x0008) === 0)).toBe(true);
    expect(headers.every((header) => header.time === 0)).toBe(true);
    expect(headers.every((header) => header.date === 0x2821)).toBe(true);
    expect(headers.every((header) => !header.name.endsWith("/"))).toBe(true);

    const zip = await JSZip.loadAsync(first.bytes, { checkCRC32: true });
    expect(Object.values(zip.files).every((entry) => !entry.dir)).toBe(true);
    for (const part of first.parts) {
      expect(await zip.file(part.name)?.async("uint8array")).toEqual(
        part.bytes,
      );
    }
    const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
    expect(contentTypes).toContain('PartName="/ppt/presProps.xml"');
    expect(contentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.custom-properties+xml",
    );
    const rootRels = await zip.file("_rels/.rels")?.async("string");
    expect(rootRels).toContain("ppt/presentation.xml");
    expect(rootRels).toContain("docProps/core.xml");
    expect(rootRels).toContain("docProps/app.xml");
    expect(rootRels).toContain("docProps/custom.xml");
    const presentationRels = await zip
      .file("ppt/_rels/presentation.xml.rels")
      ?.async("string");
    expect(presentationRels).toContain('Target="presProps.xml"');
    expect(presentationRels).toContain('Target="theme/theme1.xml"');
    expect(presentationRels).toContain(
      'Target="slideMasters/slideMaster1.xml"',
    );
    const core = await zip.file("docProps/core.xml")?.async("string");
    expect(core).toContain("2000-01-01T00:00:00Z");
    const custom = await zip.file("docProps/custom.xml")?.async("string");
    expect(custom).toContain(model.sourceSha256);
    expect(custom).toContain("office180-vector180-pptx-canary/0.1");
    expect(custom).not.toMatch(/pptv/iu);
    expect(
      [...(custom?.matchAll(/<property\b[^>]*\bname="([^"]+)"/gu) ?? [])].map(
        (match) => match[1],
      ),
    ).toEqual([
      "vector180.compiler",
      "vector180.resolvedSchema",
      "vector180.activeTheme",
      "vector180.sourceSha256",
    ]);
  });

  it("writes a canonical raw central directory without ZIP extensions", async () => {
    const artifact = await compilePptxCanary(await canaryModel());
    const partNames = artifact.parts.map((part) => part.name);
    const local = localHeaders(artifact.bytes);
    const central = centralDirectory(artifact.bytes);

    expect(central.entries.map((entry) => entry.name)).toEqual(partNames);
    expect(central.entries.map((entry) => entry.name)).toEqual(
      [...central.entries.map((entry) => entry.name)].sort(),
    );
    expect(central.diskNumber).toBe(0);
    expect(central.centralDisk).toBe(0);
    expect(central.diskEntries).toBe(artifact.parts.length);
    expect(central.totalEntries).toBe(artifact.parts.length);
    expect(central.commentLength).toBe(0);
    expect(central.centralSize).not.toBe(0xffffffff);
    expect(central.centralOffset).not.toBe(0xffffffff);
    expect(central.eocdOffset).toBe(
      central.centralOffset + central.centralSize,
    );

    expect(local.map((entry) => entry.name)).toEqual(partNames);
    expect(local.every((entry) => entry.extraLength === 0)).toBe(true);
    expect(central.entries.every((entry) => entry.extraLength === 0)).toBe(
      true,
    );
    expect(central.entries.every((entry) => entry.commentLength === 0)).toBe(
      true,
    );
    expect(central.entries.every((entry) => entry.diskStart === 0)).toBe(true);
    expect(central.entries.every((entry) => entry.method === 0)).toBe(true);
    expect(
      central.entries.every(
        (entry) =>
          entry.versionNeeded < 45 &&
          entry.compressedSize !== 0xffffffff &&
          entry.uncompressedSize !== 0xffffffff &&
          entry.localHeaderOffset !== 0xffffffff,
      ),
    ).toBe(true);
    expect(central.entries.every((entry) => (entry.flags & 0x0008) === 0)).toBe(
      true,
    );
    expect(central.entries.map((entry) => entry.localHeaderOffset)).toEqual(
      local.map((entry) => entry.offset),
    );
    expect(containsRecordSignature(artifact.bytes, 0x06064b50)).toBe(false);
    expect(containsRecordSignature(artifact.bytes, 0x07064b50)).toBe(false);
    expect(containsRecordSignature(artifact.bytes, 0x08074b50)).toBe(false);
  });

  it("retains manifest order, painter order, stable names, native groups, and exact text intent", async () => {
    const model = await canaryModel();
    const artifact = await compilePptxCanary(model);
    const zip = await JSZip.loadAsync(artifact.bytes);
    const presentation = await zip
      .file("ppt/presentation.xml")
      ?.async("string");
    expect(presentation).toContain(
      '<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>',
    );
    expect(presentation?.indexOf('r:id="rId2"')).toBeLessThan(
      presentation?.indexOf('r:id="rId1"') ?? -1,
    );

    const architecture = await zip
      .file("ppt/slides/slide1.xml")
      ?.async("string");
    const cover = await zip.file("ppt/slides/slide2.xml")?.async("string");
    expect(architecture).toContain('name="src.architecture.node.client"');
    expect(architecture).toContain("<p:grpSp>");
    expect(architecture).toContain('<a:off x="1524000" y="2590800"/>');
    expect(architecture).toContain('<a:prstGeom prst="ellipse">');
    expect(architecture).toContain("<p:cxnSp>");
    expect(architecture).not.toContain(" descr=");
    expect(
      architecture?.indexOf("src.architecture.edge.client-policy"),
    ).toBeLessThan(architecture?.indexOf("src.architecture.node.client") ?? -1);
    expect(cover).toContain('name="src.cover.title"');
    expect(cover).toContain('<a:off x="914400" y="2133600"/>');
    expect(cover).toContain('<a:ext cx="10363200" cy="1219200"/>');
    expect(cover).toContain(
      '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr>',
    );
    expect(cover).toContain("<a:t>Minimal Vector180 deck</a:t>");
    expect(cover).not.toContain("xml:space=");
    expect(cover).not.toContain(" descr=");
    expect(cover).toContain(
      '<a:endParaRPr lang="en-US" sz="5760" b="0" i="0" dirty="0">',
    );
    expect(cover).toMatch(
      /<a:endParaRPr[^>]*>[\s\S]*?<a:latin typeface="ABeeZee"\/>[\s\S]*?<a:ea typeface="ABeeZee"\/>[\s\S]*?<a:cs typeface="ABeeZee"\/>[\s\S]*?<\/a:endParaRPr>/u,
    );
    expect(cover).not.toContain("<a:normAutofit");
    expect(cover).not.toContain("<a:spAutoFit");
  });

  it("marks boundary whitespace for exact DrawingML text preservation", async () => {
    const model = (await canaryModel()) as unknown as MutableDeck;
    const title = requiredMutable(model, "cover.title");
    const lines = title["lines"];
    expect(Array.isArray(lines)).toBe(true);
    if (!Array.isArray(lines) || lines.length !== 1) {
      throw new Error("Expected one mutable title line");
    }
    (lines[0] as Record<string, unknown>)["text"] = " Boundary text ";

    const artifact = await compilePptxCanary(
      model as unknown as Vector180ResolvedDeck,
    );
    const zip = await JSZip.loadAsync(artifact.bytes);
    const cover = await zip.file("ppt/slides/slide2.xml")?.async("string");
    expect(cover).toContain('<a:t xml:space="preserve"> Boundary text </a:t>');
  });

  it("maps all four connector endpoint quadrants to exact flips and bounds", async () => {
    const base = await canaryModel();
    const quadrants = [
      {
        name: "forward",
        points: [10, 20, 30, 40] as const,
        transform:
          '<a:xfrm><a:off x="76200" y="152400"/><a:ext cx="152400" cy="152400"/></a:xfrm>',
      },
      {
        name: "horizontal flip",
        points: [30, 20, 10, 40] as const,
        transform:
          '<a:xfrm flipH="1"><a:off x="76200" y="152400"/><a:ext cx="152400" cy="152400"/></a:xfrm>',
      },
      {
        name: "vertical flip",
        points: [10, 40, 30, 20] as const,
        transform:
          '<a:xfrm flipV="1"><a:off x="76200" y="152400"/><a:ext cx="152400" cy="152400"/></a:xfrm>',
      },
      {
        name: "horizontal and vertical flip",
        points: [30, 40, 10, 20] as const,
        transform:
          '<a:xfrm flipH="1" flipV="1"><a:off x="76200" y="152400"/><a:ext cx="152400" cy="152400"/></a:xfrm>',
      },
    ] as const;

    for (const quadrant of quadrants) {
      const model = structuredClone(base) as unknown as MutableDeck;
      const line = requiredMutable(model, "architecture.edge.client-policy");
      const [x1, y1, x2, y2] = quadrant.points;
      setLineEndpoints(line, x1, y1, x2, y2);
      const artifact = await compilePptxCanary(
        model as unknown as Vector180ResolvedDeck,
      );
      const zip = await JSZip.loadAsync(artifact.bytes);
      const slide = await zip.file("ppt/slides/slide1.xml")?.async("string");
      if (slide === undefined) {
        throw new Error(`Missing connector slide for ${quadrant.name}`);
      }
      expect(objectTransformXml(slide, "architecture.edge.client-policy")).toBe(
        quadrant.transform,
      );
    }
  });

  it("maps nested group translations to exact off, ext, chOff, and chExt", async () => {
    const model = structuredClone(
      await canaryModel(),
    ) as unknown as MutableDeck;
    const outer = requiredMutable(model, "architecture.node.client");
    const panel = requiredMutable(model, "architecture.node.client.panel");
    const title = requiredMutable(model, "architecture.node.client.title");
    const nested = structuredClone(outer);
    nested.id = "architecture.node.client.inner";
    nested["parentId"] = outer.id;
    nested["order"] = 0;
    nested["translateX"] = -5;
    nested["translateY"] = 7;
    nested.children = [panel];
    panel["parentId"] = nested.id;
    panel["order"] = 0;
    title["order"] = 1;
    outer.children = [nested, title];
    const architecture = model.slides.find(
      (slide) => slide.id === "architecture",
    );
    if (architecture === undefined) throw new Error("Missing architecture");
    for (const object of architecture.objects) {
      rebuildWorldGeometry(object, { x: 0, y: 0 });
    }

    const artifact = await compilePptxCanary(
      model as unknown as Vector180ResolvedDeck,
    );
    const zip = await JSZip.loadAsync(artifact.bytes);
    const slide = await zip.file("ppt/slides/slide1.xml")?.async("string");
    if (slide === undefined) throw new Error("Missing architecture slide");
    expect(objectTransformXml(slide, "architecture.node.client")).toBe(
      '<a:xfrm><a:off x="1485900" y="2644140"/><a:ext cx="2933700" cy="1981200"/><a:chOff x="1409700" y="2491740"/><a:chExt cx="2933700" cy="1981200"/></a:xfrm>',
    );
    expect(objectTransformXml(slide, "architecture.node.client.inner")).toBe(
      '<a:xfrm><a:off x="1409700" y="2491740"/><a:ext cx="2895600" cy="1981200"/><a:chOff x="1447800" y="2438400"/><a:chExt cx="2895600" cy="1981200"/></a:xfrm>',
    );
  });

  it("is byte-identical in separate Node processes and timezones", async () => {
    const repositoryRoot = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const script = `
      import { createHash } from "node:crypto";
      import { readFile } from "node:fs/promises";
      import { loadDeck } from "./packages/vector180/src/core/deck.ts";
      import { resolveVector180Deck } from "./packages/vector180/src/core/resolved.ts";
      import { compilePptxCanary } from "./packages/vector180/src/node/pptx-canary.ts";
      const source = await readFile("examples/minimal-deck.vector180.html", "utf8");
      const deck = await loadDeck({ kind: "text", text: source });
      const resolved = resolveVector180Deck(deck);
      const model = structuredClone(resolved.model);
      const visit = (objects) => objects.forEach((object) => {
        if (object.kind === "rect") { delete object.rx; delete object.ry; }
        if (object.kind === "group") visit(object.children);
      });
      model.slides.forEach((slide) => visit(slide.objects));
      const artifact = await compilePptxCanary(model);
      process.stdout.write(createHash("sha256").update(artifact.bytes).digest("hex"));
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
    expect(utc.stderr).toBe("");
    expect(pacific.stderr).toBe("");
    expect(utc.status).toBe(0);
    expect(pacific.status).toBe(0);
    expect(utc.stdout).toMatch(/^[0-9a-f]{64}$/u);
    expect(pacific.stdout).toBe(utc.stdout);
  });

  const minimumCoordinateUnit = Math.ceil(
    TEST_MIN_COORDINATE_EMU / TEST_EMU_PER_UNIT,
  );
  const maximumCoordinateUnit = Math.floor(
    TEST_MAX_COORDINATE_EMU / TEST_EMU_PER_UNIT,
  );
  const maximumLineWidthUnit = TEST_MAX_LINE_WIDTH_EMU / TEST_EMU_PER_UNIT;
  const maximumTextMarginUnit = TEST_MAX_TEXT_MARGIN_EMU / TEST_EMU_PER_UNIT;

  it("accepts every representable DrawingML numeric boundary", async () => {
    const acceptedRanges: readonly RangeCase[] = [
      {
        label: "minimum coordinate",
        mutate: (model) => setBackgroundX(model, minimumCoordinateUnit),
      },
      {
        label: "maximum coordinate",
        mutate: (model) => setBackgroundX(model, maximumCoordinateUnit),
      },
      {
        label: "one-EMU positive extent",
        mutate: (model) => setBackgroundWidth(model, 1 / TEST_EMU_PER_UNIT),
      },
      {
        label: "maximum representable extent",
        mutate: (model) => setBackgroundWidth(model, maximumCoordinateUnit),
      },
      {
        label: "zero line width",
        mutate: (model) => setBackgroundStrokeWidth(model, 0),
      },
      {
        label: "maximum line width",
        mutate: (model) =>
          setBackgroundStrokeWidth(model, maximumLineWidthUnit),
      },
      {
        label: "minimum font size",
        mutate: (model) =>
          setTitleFontSize(
            model,
            TEST_MIN_FONT_HUNDREDTH_POINTS / TEST_HUNDREDTH_POINTS_PER_UNIT,
          ),
      },
      {
        label: "maximum font size",
        mutate: (model) =>
          setTitleFontSize(
            model,
            TEST_MAX_FONT_HUNDREDTH_POINTS / TEST_HUNDREDTH_POINTS_PER_UNIT,
          ),
      },
      {
        label: "minimum point spacing",
        mutate: (model) =>
          setTitleLineStep(
            model,
            TEST_MIN_SPACING_HUNDREDTH_POINTS / TEST_HUNDREDTH_POINTS_PER_UNIT,
          ),
      },
      {
        label: "maximum point spacing",
        mutate: (model) =>
          setTitleLineStep(
            model,
            TEST_MAX_SPACING_HUNDREDTH_POINTS / TEST_HUNDREDTH_POINTS_PER_UNIT,
          ),
      },
      {
        label: "maximum paragraph margin",
        mutate: (model) =>
          setTitleStartMargin(
            model,
            maximumTextMarginUnit,
            maximumTextMarginUnit + 1,
          ),
      },
    ];
    const base = await canaryModel();
    for (const range of acceptedRanges) {
      const model = structuredClone(base) as unknown as MutableDeck;
      range.mutate(model);
      const artifact = await compilePptxCanary(
        model as unknown as Vector180ResolvedDeck,
      );
      if (artifact.bytes.byteLength === 0) {
        throw new Error(`${range.label} emitted an empty package`);
      }
    }
  });

  const rejectedRanges: readonly RejectedRangeCase[] = [
    {
      label: "the adjacent representable coordinate below the minimum",
      mutate: (model) => setBackgroundX(model, minimumCoordinateUnit - 1),
      code: "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    },
    {
      label: "the adjacent representable coordinate above the maximum",
      mutate: (model) => setBackgroundX(model, maximumCoordinateUnit + 1),
      code: "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    },
    {
      label: "zero as a required positive extent",
      mutate: (model) => setBackgroundWidth(model, 0),
      code: "VECTOR180-PPTX-INVALID-MODEL",
    },
    {
      label: "the adjacent representable extent above the maximum",
      mutate: (model) => setBackgroundWidth(model, maximumCoordinateUnit + 1),
      code: "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    },
    {
      label: "the adjacent line width below zero",
      mutate: (model) =>
        setBackgroundStrokeWidth(model, -1 / TEST_EMU_PER_UNIT),
      code: "VECTOR180-PPTX-INVALID-MODEL",
    },
    {
      label: "the adjacent representable line width above the maximum",
      mutate: (model) =>
        setBackgroundStrokeWidth(model, maximumLineWidthUnit + 1),
      code: "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    },
    {
      label: "one hundredth-point below the minimum font size",
      mutate: (model) =>
        setTitleFontSize(
          model,
          (TEST_MIN_FONT_HUNDREDTH_POINTS - 1) / TEST_HUNDREDTH_POINTS_PER_UNIT,
        ),
      code: "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    },
    {
      label: "one hundredth-point above the maximum font size",
      mutate: (model) =>
        setTitleFontSize(
          model,
          (TEST_MAX_FONT_HUNDREDTH_POINTS + 1) / TEST_HUNDREDTH_POINTS_PER_UNIT,
        ),
      code: "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    },
    {
      label: "zero point spacing",
      mutate: (model) => setTitleLineStep(model, 0),
      code: "VECTOR180-PPTX-INVALID-MODEL",
    },
    {
      label: "one hundredth-point above maximum point spacing",
      mutate: (model) =>
        setTitleLineStep(
          model,
          (TEST_MAX_SPACING_HUNDREDTH_POINTS + 1) /
            TEST_HUNDREDTH_POINTS_PER_UNIT,
        ),
      code: "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    },
    {
      label: "the adjacent representable paragraph margin above maximum",
      mutate: (model) =>
        setTitleStartMargin(
          model,
          maximumTextMarginUnit + 1,
          maximumTextMarginUnit + 2,
        ),
      code: "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    },
  ];

  it.each(rejectedRanges)("rejects $label", async ({ mutate, code }) => {
    const model = structuredClone(
      await canaryModel(),
    ) as unknown as MutableDeck;
    mutate(model);
    await expectAsyncCanaryCode(
      compilePptxCanary(model as unknown as Vector180ResolvedDeck),
      code,
    );
  });

  it("fails closed when resolved source is not exactly the Vector180 wire family", async () => {
    const legacyFamily = structuredClone(await canaryModel()) as unknown as {
      sourceWireFamily: string;
    };
    legacyFamily.sourceWireFamily = "pptv-legacy";
    await expectAsyncCanaryCode(
      compilePptxCanary(legacyFamily as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-FAMILY",
    );

    const missingFamily = structuredClone(await canaryModel()) as unknown as {
      sourceWireFamily?: string;
    };
    delete missingFamily.sourceWireFamily;
    await expectAsyncCanaryCode(
      compilePptxCanary(missingFamily as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-FAMILY",
    );

    await expectAsyncCanaryCode(
      compilePptxCanary({
        model: legacyFamily as unknown as Vector180ResolvedDeck,
        diagnostics: [
          {
            code: "VECTOR180-TEST-DIAGNOSTIC",
            severity: "error",
            message: "Forged result must not obscure legacy family.",
          },
        ],
      }),
      "VECTOR180-PPTX-FAMILY",
    );
  });

  it("rejects legacy PPTV package lineage before emitting bytes", async () => {
    const model = await canaryModel();
    await expectAsyncCanaryCode(
      compilePptxCanaryWithLineage(model, {
        compiler: "office180-pptv-pptx-canary/0.1",
      }),
      "VECTOR180-PPTX-FAMILY",
    );
    await expectAsyncCanaryCode(
      compilePptxCanaryWithLineage(model, {
        customProperties: {
          "pptv.sourceSha256": model.sourceSha256,
        },
      }),
      "VECTOR180-PPTX-FAMILY",
    );
  });

  it("fails closed on unresolved, asset, rounded, multiline, opacity, and fractional mappings", async () => {
    await expectAsyncCanaryCode(
      compilePptxCanary({ diagnostics: [] }),
      "VECTOR180-PPTX-UNRESOLVED",
    );

    const asset = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const background = findMutable(asset, "cover.background");
    expect(background).toBeDefined();
    if (background !== undefined) background.kind = "svg-asset";
    await expectAsyncCanaryCode(
      compilePptxCanary(asset as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
    );

    const rounded = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const roundedPanel = findMutable(rounded, "architecture.node.client.panel");
    expect(roundedPanel).toBeDefined();
    if (roundedPanel !== undefined) roundedPanel["rx"] = 24;
    await expectAsyncCanaryCode(
      compilePptxCanary(rounded as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    );

    const multiline = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const title = findMutable(multiline, "cover.title");
    expect(title).toBeDefined();
    if (title !== undefined) {
      const lines = title["lines"] as Array<Record<string, unknown>>;
      lines.push({ text: "Second", x: 120, y: 430 });
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(multiline as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
    );

    const translucent = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const translucentObject = findMutable(translucent, "cover.background");
    expect(translucentObject).toBeDefined();
    if (translucentObject !== undefined) {
      (translucentObject["style"] as Record<string, unknown>)["opacity"] = 0.5;
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(translucent as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
    );

    const fractional = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const fractionalObject = findMutable(fractional, "cover.background");
    expect(fractionalObject).toBeDefined();
    if (fractionalObject !== undefined) {
      fractionalObject["x"] = 0.0001;
      (fractionalObject["localBounds"] as Record<string, unknown>)["x"] =
        0.0001;
      (fractionalObject["worldBounds"] as Record<string, unknown>)["x"] =
        0.0001;
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(fractional as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-NON-INTEGRAL-EMU",
    );

    const fractionalFont = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const fontObject = findMutable(fractionalFont, "cover.title");
    expect(fontObject).toBeDefined();
    if (fontObject !== undefined) {
      (fontObject["style"] as Record<string, unknown>)["fontSize"] = 96.01;
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(fractionalFont as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    );
  });

  it("rejects deterministic numeric slide-ID collisions", async () => {
    const model = structuredClone(
      await canaryModel(),
    ) as unknown as MutableDeck;
    const first = model.slides[0];
    const second = model.slides[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected two canary slides");
    }
    setSlideId(first, "o.43178.1btma2a");
    setSlideId(second, "o.44647.k6t0dk");
    await expectAsyncCanaryCode(
      compilePptxCanary(model as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-ID-COLLISION",
    );
  });

  it("rejects forged geometry and malformed OPC graphs", async () => {
    const forged = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const group = findMutable(forged, "architecture.node.client");
    expect(group).toBeDefined();
    if (group !== undefined) {
      const localBounds = group["localBounds"] as { width: number };
      const worldBounds = group["worldBounds"] as { width: number };
      localBounds.width += 1;
      worldBounds.width += 1;
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(forged as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-INVALID-MODEL",
    );

    const colliding = structuredClone(await canaryModel()) as unknown as {
      slides: Array<{ objects: MutableObject[] }>;
    };
    const coverObjects = colliding.slides[0]?.objects;
    expect(coverObjects).toBeDefined();
    if (coverObjects !== undefined) {
      const first = coverObjects[0];
      const second = coverObjects[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (first !== undefined && second !== undefined) {
        first.id = "o.43178.1btma2a";
        second.id = "o.44647.k6t0dk";
      }
    }
    await expectAsyncCanaryCode(
      compilePptxCanary(colliding as unknown as Vector180ResolvedDeck),
      "VECTOR180-PPTX-ID-COLLISION",
    );

    const graph = createPptxCanaryGraph(await canaryModel());
    const firstPart = graph.parts[0];
    expect(firstPart).toBeDefined();
    if (firstPart === undefined) return;
    expectCanaryCode(
      () =>
        validatePptxCanaryGraph({
          ...graph,
          parts: [...graph.parts, firstPart],
        }),
      "VECTOR180-PPTX-OPC-GRAPH",
    );
    expectCanaryCode(
      () =>
        validatePptxCanaryGraph({
          ...graph,
          parts: [
            { ...firstPart, name: "../escape.xml" },
            ...graph.parts.slice(1),
          ],
        }),
      "VECTOR180-PPTX-OPC-GRAPH",
    );
    expectCanaryCode(
      () =>
        validatePptxCanaryGraph({
          ...graph,
          parts: [
            { ...firstPart, contentType: "application/xml" },
            ...graph.parts.slice(1),
          ],
        }),
      "VECTOR180-PPTX-OPC-GRAPH",
    );
    const firstRelationship = graph.relationships[0];
    expect(firstRelationship).toBeDefined();
    if (firstRelationship === undefined) return;
    const dangling: PptxCanaryGraph = {
      ...graph,
      relationships: [
        { ...firstRelationship, target: "missing.xml" },
        ...graph.relationships.slice(1),
      ],
    };
    expectCanaryCode(
      () => validatePptxCanaryGraph(dangling),
      "VECTOR180-PPTX-OPC-GRAPH",
    );
  });
});
