/**
 * Exact-font Node adapter for deterministic Vector180 text-fit preflight.
 *
 * This boundary performs file I/O once while constructing a measurer. The
 * returned measurer uses only the caller's explicit face map and cached font
 * bytes; it never discovers or substitutes a system font.
 *
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 */

import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { arch, platform } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { create as createFont, type Font } from "fontkit";

import type {
  Vector180MeasuredText,
  Vector180AtomTextMeasureRequest,
  Vector180DeckTextMeasureRequest,
  Vector180UnverifiedText,
} from "../core/text-fit.js";

export type FontkitFontWeight = 400 | 700;
export type FontkitFontStyle = "normal" | "italic";

export interface FontkitFontFace {
  readonly family: string;
  readonly weight: FontkitFontWeight;
  readonly style: FontkitFontStyle;
  readonly path: string;
  readonly postscriptName?: string;
}

export interface FontkitFontMap {
  readonly schema: "vector180-font-map/0.1";
  readonly faces: readonly FontkitFontFace[];
}

export type FontkitTextMeasureRequest =
  Vector180DeckTextMeasureRequest | Vector180AtomTextMeasureRequest;

export interface FontkitRequestedFace {
  readonly family: string;
  readonly weight: FontkitFontWeight;
  readonly style: FontkitFontStyle;
}

export interface FontkitLoadedFaceEvidence extends FontkitRequestedFace {
  readonly path: string;
  readonly sha256: string;
  readonly postscriptName: string;
  readonly fullName: string;
  readonly unitsPerEm: number;
}

export interface FontkitTextMeasurementEvidence {
  readonly method: "fontkit/2.0.4";
  readonly requestedFace: FontkitRequestedFace;
  readonly loadedFace: FontkitLoadedFaceEvidence | null;
}

export interface FontkitMeasuredText extends Vector180MeasuredText {
  readonly kind: "measured";
  readonly width: number;
  readonly method: "fontkit/2.0.4";
  readonly fontIdentity: string;
  readonly unsupportedShapingFeatures: readonly string[];
  readonly evidence: FontkitTextMeasurementEvidence;
}

export interface FontkitUnverifiedText extends Vector180UnverifiedText {
  readonly kind: "unverified";
  readonly method: "fontkit/2.0.4";
  readonly reason: "unmapped-face" | "missing-glyphs";
  readonly fontIdentity?: string;
  readonly missingCodepoints?: readonly number[];
  readonly unsupportedShapingFeatures: readonly string[];
  readonly evidence: FontkitTextMeasurementEvidence;
}

export type FontkitTextMeasurement =
  FontkitMeasuredText | FontkitUnverifiedText;

export interface FontkitTextMeasurer {
  (request: FontkitTextMeasureRequest): FontkitTextMeasurement;
  readonly faces: readonly FontkitLoadedFaceEvidence[];
  readonly defaultEnvironment?: Vector180DefaultFontEnvironmentEvidence;
}

export interface Vector180DefaultFontEnvironmentEvidence {
  readonly schema: "office180-vector180-default-font-map/0.1";
  readonly selection: "packaged-default";
  readonly mapSha256: string;
  readonly font: {
    readonly family: "ABeeZee";
    readonly weight: 400;
    readonly style: "normal";
    readonly postscriptName: "ABeeZee-Regular";
    readonly bytes: 46016;
    readonly sha256: "2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9";
  };
  readonly license: {
    readonly id: "OFL-1.1";
    readonly bytes: 4516;
    readonly sha256: "f0376d04eb58fb19e9f1690a99a1eb37380ad0246f7d503f2abd8e8a74ed12be";
  };
  readonly adapter: "fontkit/2.0.4";
  readonly runtime: {
    readonly nodeVersion: string;
    readonly platform: string;
    readonly architecture: string;
  };
}

export class Vector180DefaultFontIntegrityError extends Error {
  readonly code = "VECTOR180-FONT-MAP-DEFAULT-INTEGRITY";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "Vector180DefaultFontIntegrityError";
  }
}

interface LoadedFace {
  readonly font: Font;
  readonly evidence: FontkitLoadedFaceEvidence;
}

const MAX_FONT_FACES = 32;
const MAX_FONT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FONT_MAP_BYTES = 256 * 1024 * 1024;
const DEFAULT_FONT_MAP_SHA256 =
  "dc012dc7e13d15138e46147fd37724acffc1e0d2afb3e7554d6af821f479ae36";
const DEFAULT_FONT_SHA256 =
  "2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9";
const DEFAULT_LICENSE_SHA256 =
  "f0376d04eb58fb19e9f1690a99a1eb37380ad0246f7d503f2abd8e8a74ed12be";
const DEFAULT_FONT_BYTES = 46_016;
const DEFAULT_LICENSE_BYTES = 4_516;

/**
 * Load, verify, and cache every explicitly mapped face.
 *
 * Construction fails for invalid or ambiguous maps, unreadable/unsupported
 * files, unselected font collections, or metadata that does not match the
 * declared face. A missing face at measurement time is instead returned as
 * `unverified`, so preflight can report every affected line without falling
 * back.
 */
export async function createFontkitTextMeasurer(
  fontMap: readonly FontkitFontFace[],
): Promise<FontkitTextMeasurer> {
  return await createFontkitTextMeasurerInternal(fontMap);
}

/**
 * Load the immutable package-owned ABeeZee Regular environment.
 *
 * Every resource is addressed relative to this installed module, then checked
 * against a pinned byte length and digest before Fontkit verifies face
 * identity. No current-working-directory or system-font lookup participates.
 */
export async function createDefaultFontkitTextMeasurer(): Promise<FontkitTextMeasurer> {
  try {
    const mapUrl = new URL(
      "../../assets/fonts/default-font-map.json",
      import.meta.url,
    );
    const fontUrl = new URL(
      "../../assets/fonts/ABeeZee-Regular.ttf",
      import.meta.url,
    );
    const licenseUrl = new URL("../../assets/fonts/OFL.txt", import.meta.url);
    const [mapBytes, fontBytes, licenseBytes] = await Promise.all([
      readFile(mapUrl),
      readFile(fontUrl),
      readFile(licenseUrl),
    ]);
    assertDefaultResource(
      "font map",
      mapBytes,
      undefined,
      DEFAULT_FONT_MAP_SHA256,
    );
    assertDefaultResource(
      "font",
      fontBytes,
      DEFAULT_FONT_BYTES,
      DEFAULT_FONT_SHA256,
    );
    assertDefaultResource(
      "license",
      licenseBytes,
      DEFAULT_LICENSE_BYTES,
      DEFAULT_LICENSE_SHA256,
    );

    const map = parseFontMap(
      JSON.parse(mapBytes.toString("utf8")) as unknown,
      fileURLToPath(new URL("../../assets/fonts/", import.meta.url)),
    );
    const defaultEnvironment = freezeDefaultEnvironmentEvidence({
      schema: "office180-vector180-default-font-map/0.1",
      selection: "packaged-default",
      mapSha256: DEFAULT_FONT_MAP_SHA256,
      font: {
        family: "ABeeZee",
        weight: 400,
        style: "normal",
        postscriptName: "ABeeZee-Regular",
        bytes: DEFAULT_FONT_BYTES,
        sha256: DEFAULT_FONT_SHA256,
      },
      license: {
        id: "OFL-1.1",
        bytes: DEFAULT_LICENSE_BYTES,
        sha256: DEFAULT_LICENSE_SHA256,
      },
      adapter: "fontkit/2.0.4",
      runtime: {
        nodeVersion: process.version,
        platform: platform(),
        architecture: arch(),
      },
    });
    return await createFontkitTextMeasurerInternal(
      map.faces,
      defaultEnvironment,
    );
  } catch (error) {
    if (error instanceof Vector180DefaultFontIntegrityError) throw error;
    throw new Vector180DefaultFontIntegrityError(
      `Packaged default font environment failed integrity verification: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

async function createFontkitTextMeasurerInternal(
  fontMap: readonly FontkitFontFace[],
  defaultEnvironment?: Vector180DefaultFontEnvironmentEvidence,
): Promise<FontkitTextMeasurer> {
  const entries = freezeAndValidateFontMap(fontMap);
  await preflightFontFileBudget(entries);
  const bytesByPath = new Map<string, Buffer>();
  const fontBySelection = new Map<string, Font>();
  const loadedByFace = new Map<string, LoadedFace>();
  const loadedFaces: FontkitLoadedFaceEvidence[] = [];
  let totalFontBytes = 0;

  for (const entry of entries) {
    const absolutePath = resolve(entry.path);
    let bytes = bytesByPath.get(absolutePath);
    if (bytes === undefined) {
      bytes = await readBoundedFontFile(
        absolutePath,
        MAX_FONT_MAP_BYTES - totalFontBytes,
      );
      totalFontBytes += bytes.length;
      if (totalFontBytes > MAX_FONT_MAP_BYTES) {
        throw new Error(
          `Font map exceeds the ${MAX_FONT_MAP_BYTES}-byte aggregate font limit.`,
        );
      }
      bytesByPath.set(absolutePath, bytes);
    }
    const selectionKey = `${absolutePath}\u0000${entry.postscriptName ?? ""}`;
    let font = fontBySelection.get(selectionKey);
    if (font === undefined) {
      font = openFont(bytes, absolutePath, entry.postscriptName);
      fontBySelection.set(selectionKey, font);
    }
    verifyLoadedFace(entry, font, absolutePath);
    const evidence = freezeLoadedFaceEvidence({
      family: entry.family,
      weight: entry.weight,
      style: entry.style,
      path: absolutePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      postscriptName: font.postscriptName,
      fullName: font.fullName,
      unitsPerEm: font.unitsPerEm,
    });
    loadedByFace.set(faceKey(entry), { font, evidence });
    loadedFaces.push(evidence);
  }

  const faces = Object.freeze(loadedFaces);
  const measure = ((
    request: FontkitTextMeasureRequest,
  ): FontkitTextMeasurement => {
    validateMeasureRequest(request);
    const requestedFace = freezeRequestedFace({
      family: request.font.family,
      weight: request.font.weight,
      style: request.font.style,
    });
    const loaded = loadedByFace.get(faceKey(requestedFace));
    if (loaded === undefined) {
      return freezeUnmappedFaceMeasurement(requestedFace);
    }

    const missingCodepoints = findMissingCodepoints(loaded.font, request.text);
    const fontIdentity = createFontIdentity(loaded.evidence);
    if (missingCodepoints.length > 0) {
      return freezeUnverifiedMeasurement({
        kind: "unverified",
        method: "fontkit/2.0.4",
        reason: "missing-glyphs",
        fontIdentity,
        missingCodepoints,
        unsupportedShapingFeatures: Object.freeze([]),
        evidence: freezeMeasurementEvidence(requestedFace, loaded.evidence),
      });
    }
    const run = loaded.font.layout(request.text);
    const advance = run.positions.reduce((sum, position) => {
      if (!Number.isFinite(position.xAdvance)) {
        throw new Error(
          `Font "${loaded.evidence.postscriptName}" produced a non-finite xAdvance.`,
        );
      }
      return sum + position.xAdvance;
    }, 0);
    const width = (advance * request.font.size) / loaded.font.unitsPerEm;
    if (!Number.isFinite(width) || width < 0) {
      throw new Error(
        `Font "${loaded.evidence.postscriptName}" produced an invalid measured width.`,
      );
    }

    return freezeMeasuredText({
      kind: "measured",
      width,
      method: "fontkit/2.0.4",
      fontIdentity,
      unsupportedShapingFeatures: Object.freeze([]),
      evidence: freezeMeasurementEvidence(requestedFace, loaded.evidence),
    });
  }) as FontkitTextMeasurer;
  Object.defineProperty(measure, "faces", {
    configurable: false,
    enumerable: true,
    value: faces,
    writable: false,
  });
  if (defaultEnvironment !== undefined) {
    Object.defineProperty(measure, "defaultEnvironment", {
      configurable: false,
      enumerable: true,
      value: defaultEnvironment,
      writable: false,
    });
  }
  return Object.freeze(measure) as FontkitTextMeasurer;
}

function assertDefaultResource(
  label: string,
  bytes: Uint8Array,
  expectedLength: number | undefined,
  expectedSha256: string,
): void {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    (expectedLength !== undefined && bytes.byteLength !== expectedLength) ||
    sha256 !== expectedSha256
  ) {
    throw new Vector180DefaultFontIntegrityError(
      `Packaged default ${label} bytes do not match the pinned identity.`,
    );
  }
}

function freezeDefaultEnvironmentEvidence(
  evidence: Vector180DefaultFontEnvironmentEvidence,
): Vector180DefaultFontEnvironmentEvidence {
  return Object.freeze({
    ...evidence,
    font: Object.freeze({ ...evidence.font }),
    license: Object.freeze({ ...evidence.license }),
    runtime: Object.freeze({ ...evidence.runtime }),
  });
}

/**
 * Parse the strict JSON-safe CLI font-map shape without touching the
 * filesystem. Relative face paths are resolved against `baseDirectory`.
 */
export function parseFontMap(
  input: unknown,
  baseDirectory: string,
): FontkitFontMap {
  if (typeof baseDirectory !== "string" || baseDirectory.trim().length === 0) {
    throw new Error("Font map base directory must be a non-empty path.");
  }
  const root = requireRecord(input, "Font map");
  rejectUnknownKeys(root, new Set(["schema", "faces"]), "Font map");
  if (root["schema"] !== "vector180-font-map/0.1") {
    throw new Error('Font map schema must be "vector180-font-map/0.1".');
  }
  if (!Array.isArray(root["faces"])) {
    throw new Error("Font map faces must be an array.");
  }

  const faces = root["faces"].map((value, index) => {
    const label = `Font map face ${index}`;
    const face = requireRecord(value, label);
    rejectUnknownKeys(
      face,
      new Set(["family", "weight", "style", "path", "postscriptName"]),
      label,
    );
    const family = requireNonEmptyString(face["family"], `${label} family`);
    const path = requireNonEmptyString(face["path"], `${label} path`);
    const weight = face["weight"];
    if (weight !== 400 && weight !== 700) {
      throw new Error(`${label} weight must be 400 or 700.`);
    }
    const style = face["style"];
    if (style !== "normal" && style !== "italic") {
      throw new Error(`${label} style must be "normal" or "italic".`);
    }
    const postscriptNameValue = face["postscriptName"];
    const postscriptName =
      postscriptNameValue === undefined
        ? undefined
        : requireNonEmptyString(postscriptNameValue, `${label} postscriptName`);
    return Object.freeze({
      family,
      weight,
      style,
      path: resolve(baseDirectory, path),
      ...(postscriptName === undefined ? {} : { postscriptName }),
    });
  });
  const validated = freezeAndValidateFontMap(faces);
  return Object.freeze({
    schema: "vector180-font-map/0.1",
    faces: validated,
  });
}

function openFont(
  bytes: Buffer,
  absolutePath: string,
  postscriptName: string | undefined,
): Font {
  const parsed = createFont(bytes);
  if (parsed === null || parsed === undefined) {
    throw new Error(`Fontkit could not open mapped font "${absolutePath}".`);
  }
  if ("fonts" in parsed) {
    if (postscriptName === undefined) {
      throw new Error(
        `Font collection requires an explicit PostScript face: "${absolutePath}".`,
      );
    }
    const selected = parsed.getFont(postscriptName);
    if (selected === null || selected === undefined) {
      throw new Error(
        `Font collection "${absolutePath}" does not contain PostScript face "${postscriptName}".`,
      );
    }
    return selected;
  }
  return parsed;
}

function freezeAndValidateFontMap(
  fontMap: readonly FontkitFontFace[],
): readonly FontkitFontFace[] {
  if (!Array.isArray(fontMap)) {
    throw new Error("Font map faces must be an array.");
  }
  if (fontMap.length > MAX_FONT_FACES) {
    throw new Error(
      `Font map exceeds the ${MAX_FONT_FACES}-face capability limit.`,
    );
  }
  const entries: FontkitFontFace[] = [];
  const seen = new Set<string>();
  for (const [index, face] of fontMap.entries()) {
    if (face.family.trim().length === 0) {
      throw new Error(`Font map entry ${index} has an empty family.`);
    }
    if (face.family.includes("\u0000")) {
      throw new Error(`Font map entry ${index} family contains a NUL.`);
    }
    if (face.path.trim().length === 0) {
      throw new Error(`Font map entry ${index} has an empty path.`);
    }
    if (face.path.includes("\u0000")) {
      throw new Error(`Font map entry ${index} path contains a NUL.`);
    }
    if (face.weight !== 400 && face.weight !== 700) {
      throw new Error(`Font map entry ${index} has an unsupported weight.`);
    }
    if (face.style !== "normal" && face.style !== "italic") {
      throw new Error(`Font map entry ${index} has an unsupported style.`);
    }
    if (
      face.postscriptName !== undefined &&
      (face.postscriptName.trim().length === 0 ||
        face.postscriptName.includes("\u0000"))
    ) {
      throw new Error(
        `Font map entry ${index} has an invalid PostScript name.`,
      );
    }
    const copied = Object.freeze({
      family: face.family,
      weight: face.weight,
      style: face.style,
      path: face.path,
      ...(face.postscriptName === undefined
        ? {}
        : { postscriptName: face.postscriptName }),
    });
    const key = faceKey(copied);
    if (seen.has(key)) {
      throw new Error(
        `Font map contains duplicate face ${formatRequestedFace(copied)}.`,
      );
    }
    seen.add(key);
    entries.push(copied);
  }
  return Object.freeze(entries);
}

async function preflightFontFileBudget(
  entries: readonly FontkitFontFace[],
): Promise<void> {
  const uniquePaths = new Set(entries.map(({ path }) => resolve(path)));
  let totalFontBytes = 0;
  for (const absolutePath of uniquePaths) {
    const metadata = await stat(absolutePath);
    validateFontFileMetadata(absolutePath, metadata);
    totalFontBytes += metadata.size;
    if (totalFontBytes > MAX_FONT_MAP_BYTES) {
      throw new Error(
        `Font map exceeds the ${MAX_FONT_MAP_BYTES}-byte aggregate font limit.`,
      );
    }
  }
}

function validateFontFileMetadata(
  absolutePath: string,
  metadata: { readonly size: number; isFile(): boolean },
): void {
  if (!metadata.isFile()) {
    throw new Error(`Mapped font is not a regular file: "${absolutePath}".`);
  }
  if (
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < 0 ||
    metadata.size > MAX_FONT_FILE_BYTES
  ) {
    throw new Error(
      `Mapped font "${absolutePath}" exceeds the ${MAX_FONT_FILE_BYTES}-byte file limit.`,
    );
  }
}

async function readBoundedFontFile(
  absolutePath: string,
  remainingMapBytes: number,
): Promise<Buffer> {
  const handle = await open(absolutePath, "r");
  try {
    const before = await handle.stat();
    validateFontFileMetadata(absolutePath, before);
    if (before.size > remainingMapBytes) {
      throw new Error(
        `Font map exceeds the ${MAX_FONT_MAP_BYTES}-byte aggregate font limit.`,
      );
    }

    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (offset !== before.size || after.size !== before.size) {
      throw new Error(`Mapped font changed while reading: "${absolutePath}".`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function verifyLoadedFace(
  requested: FontkitFontFace,
  font: Font,
  absolutePath: string,
): void {
  if (normalizeFamily(requested.family) !== normalizeFamily(font.familyName)) {
    throw new Error(
      `Mapped font "${absolutePath}" reports family "${font.familyName}", not "${requested.family}".`,
    );
  }
  const actualWeight = font["OS/2"].usWeightClass;
  if (actualWeight !== requested.weight) {
    throw new Error(
      `Mapped font "${absolutePath}" reports weight ${actualWeight}, not ${requested.weight}.`,
    );
  }
  const selection = font["OS/2"].fsSelection;
  const actualStyle: FontkitFontStyle =
    selection.italic || selection.oblique || font.italicAngle !== 0
      ? "italic"
      : "normal";
  if (actualStyle !== requested.style) {
    throw new Error(
      `Mapped font "${absolutePath}" reports style "${actualStyle}", not "${requested.style}".`,
    );
  }
  if (
    !Number.isFinite(font.unitsPerEm) ||
    !Number.isSafeInteger(font.unitsPerEm) ||
    font.unitsPerEm <= 0
  ) {
    throw new Error(
      `Mapped font "${absolutePath}" has invalid unitsPerEm ${font.unitsPerEm}.`,
    );
  }
  if (
    font.postscriptName.trim().length === 0 ||
    font.fullName.trim().length === 0
  ) {
    throw new Error(
      `Mapped font "${absolutePath}" lacks stable name metadata.`,
    );
  }
  if (
    requested.postscriptName !== undefined &&
    font.postscriptName !== requested.postscriptName
  ) {
    throw new Error(
      `Mapped font "${absolutePath}" reports PostScript name "${font.postscriptName}", not "${requested.postscriptName}".`,
    );
  }
}

function validateMeasureRequest(request: FontkitTextMeasureRequest): void {
  const hasSlideId = "slideId" in request;
  const hasAtomId = "atomId" in request;
  if (hasSlideId === hasAtomId) {
    throw new Error(
      "Text measurement requires exactly one slide or diagram identity.",
    );
  }
  const scopeId = hasSlideId ? request.slideId : request.atomId;
  if (scopeId.trim().length === 0) {
    throw new Error("Text measurement requires a non-empty artifact identity.");
  }
  if (request.font.family.trim().length === 0) {
    throw new Error("Text measurement requires a non-empty font family.");
  }
  if (!Number.isFinite(request.font.size) || request.font.size <= 0) {
    throw new Error("Text measurement requires a positive finite font size.");
  }
  if (request.font.weight !== 400 && request.font.weight !== 700) {
    throw new Error("Text measurement received an unsupported font weight.");
  }
  if (request.font.style !== "normal" && request.font.style !== "italic") {
    throw new Error("Text measurement received an unsupported font style.");
  }
}

function findMissingCodepoints(font: Font, text: string): readonly number[] {
  const missing: number[] = [];
  const seen = new Set<number>();
  for (const scalar of text) {
    const codepoint = scalar.codePointAt(0);
    if (
      codepoint !== undefined &&
      !seen.has(codepoint) &&
      !font.hasGlyphForCodePoint(codepoint)
    ) {
      seen.add(codepoint);
      missing.push(codepoint);
    }
  }
  return Object.freeze(missing);
}

function faceKey(face: FontkitRequestedFace): string {
  return `${normalizeFamily(face.family)}\u0000${face.weight}\u0000${face.style}`;
}

function normalizeFamily(family: string): string {
  return family.trim().toLowerCase();
}

function formatRequestedFace(face: FontkitRequestedFace): string {
  return `"${face.family}" ${face.weight} ${face.style}`;
}

function freezeRequestedFace(face: FontkitRequestedFace): FontkitRequestedFace {
  return Object.freeze({ ...face });
}

function freezeLoadedFaceEvidence(
  evidence: FontkitLoadedFaceEvidence,
): FontkitLoadedFaceEvidence {
  return Object.freeze({ ...evidence });
}

function freezeMeasurementEvidence(
  requestedFace: FontkitRequestedFace,
  loadedFace: FontkitLoadedFaceEvidence | null,
): FontkitTextMeasurementEvidence {
  return Object.freeze({
    method: "fontkit/2.0.4",
    requestedFace,
    loadedFace,
  });
}

function freezeUnmappedFaceMeasurement(
  requestedFace: FontkitRequestedFace,
): FontkitUnverifiedText {
  return Object.freeze({
    kind: "unverified",
    method: "fontkit/2.0.4",
    reason: "unmapped-face",
    unsupportedShapingFeatures: Object.freeze([]),
    evidence: freezeMeasurementEvidence(requestedFace, null),
  });
}

function freezeMeasuredText(
  measurement: FontkitMeasuredText,
): FontkitMeasuredText {
  return Object.freeze({ ...measurement });
}

function freezeUnverifiedMeasurement(
  measurement: FontkitUnverifiedText,
): FontkitUnverifiedText {
  return Object.freeze({ ...measurement });
}

function createFontIdentity(evidence: FontkitLoadedFaceEvidence): string {
  return `${evidence.sha256}#${evidence.postscriptName}`;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unknown key "${key}".`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.includes("\u0000")) {
    throw new Error(`${label} cannot contain a NUL character.`);
  }
  return value;
}
