/**
 * Explicit-byte, environment-labeled browser text measurement for C8.
 *
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 */

import {
  sha256Hex,
  type PptvDiagramTextMeasureRequest,
  type PptvTextMeasurement,
  type PptvTextMeasureRequest,
} from "../core/index.js";

export type PptvBrowserTextMeasureRequest =
  PptvTextMeasureRequest | PptvDiagramTextMeasureRequest;

export interface PptvBrowserGlyphCoverage {
  /** Identifies the exact tool/evidence that inspected the mapped bytes. */
  readonly method: string;
  /** Every codepoint for which coverage was checked. */
  readonly checkedCodepoints: readonly number[];
  /** Checked codepoints that the exact mapped face cannot render. */
  readonly missingCodepoints: readonly number[];
}

export interface PptvBrowserFontSource {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
  readonly bytes: Uint8Array;
  /**
   * Browser APIs cannot prove cmap coverage. Supplying precomputed evidence
   * lets this adapter fail closed before fallback can affect a measurement.
   */
  readonly coverage?: PptvBrowserGlyphCoverage;
}

export interface PptvBrowserEnvironmentEvidence {
  readonly userAgent: string;
  readonly engine: "chromium" | "firefox" | "webkit" | "unknown";
  readonly engineVersion: string;
  readonly platform: string;
  readonly devicePixelRatio: number;
}

export interface PptvBrowserLoadedFontEvidence {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
  readonly sha256: string;
  readonly alias: string;
  readonly byteLength: number;
  readonly coverageMethod?: string;
}

export interface PptvPreparedBrowserTextMeasurer {
  readonly environment: PptvBrowserEnvironmentEvidence;
  readonly fonts: readonly PptvBrowserLoadedFontEvidence[];
  readonly measure: (
    request: PptvBrowserTextMeasureRequest,
  ) => PptvTextMeasurement;
  readonly dispose: () => void;
}

export interface PreparePptvBrowserTextMeasurerOptions {
  /** Defaults to the current global document. Primarily useful for an iframe. */
  readonly document?: Document;
  /** Defaults to the current global FontFace constructor. */
  readonly FontFace?: typeof FontFace;
  /** Defaults to navigator.userAgent. */
  readonly userAgent?: string;
  /** Defaults to navigator.platform and makes host text-stack variance visible. */
  readonly platform?: string;
  /** Defaults to the current window devicePixelRatio. */
  readonly devicePixelRatio?: number;
}

interface LoadedFace {
  readonly face: FontFace;
  readonly evidence: PptvBrowserLoadedFontEvidence;
  readonly coverage?: {
    readonly method: string;
    readonly checked: ReadonlySet<number>;
    readonly missing: ReadonlySet<number>;
  };
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_FONT_FACES = 32;
const MAX_FONT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FONT_MAP_BYTES = 256 * 1024 * 1024;

/**
 * Load exact caller-supplied font bytes under SHA-derived private aliases,
 * await the browser font set, and return a synchronous C8 measurer.
 *
 * A measurement is verified only when precomputed coverage includes every
 * requested codepoint. Missing or unchecked coverage returns `unverified`;
 * the browser is never allowed to silently certify a fallback glyph.
 */
export async function preparePptvBrowserTextMeasurer(
  sources: readonly PptvBrowserFontSource[],
  options: PreparePptvBrowserTextMeasurerOptions = {},
): Promise<PptvPreparedBrowserTextMeasurer> {
  const hostDocument = options.document ?? globalThis.document;
  const FontFaceConstructor = options.FontFace ?? globalThis.FontFace;
  if (hostDocument === undefined || FontFaceConstructor === undefined) {
    throw new Error(
      "Browser text measurement requires Document, FontFace, and document.fonts.",
    );
  }
  if (hostDocument.fonts === undefined) {
    throw new Error("Browser text measurement requires document.fonts.");
  }

  const normalizedSources = validateSources(sources);
  const userAgent =
    options.userAgent ??
    (globalThis.navigator === undefined ? "" : globalThis.navigator.userAgent);
  const platform =
    options.platform ??
    (globalThis.navigator === undefined
      ? "unknown"
      : globalThis.navigator.platform);
  const devicePixelRatio =
    options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const environment = browserEnvironmentFromUserAgent(
    userAgent,
    platform,
    devicePixelRatio,
  );
  const loadedFaces = new Map<string, LoadedFace>();
  const addedFaces: FontFace[] = [];

  try {
    for (const [index, source] of normalizedSources.entries()) {
      const sha256 = await sha256Hex(source.bytes);
      const alias = browserFontAlias(
        sha256,
        source.weight,
        source.style,
        index,
      );
      const face = new FontFaceConstructor(alias, source.bytes.slice().buffer, {
        weight: String(source.weight),
        style: source.style,
      });
      await face.load();
      hostDocument.fonts.add(face);
      addedFaces.push(face);

      const coverage =
        source.coverage === undefined
          ? undefined
          : normalizeCoverage(source.coverage);
      const evidence: PptvBrowserLoadedFontEvidence = Object.freeze({
        family: source.family,
        weight: source.weight,
        style: source.style,
        sha256,
        alias,
        byteLength: source.bytes.byteLength,
        ...(coverage === undefined ? {} : { coverageMethod: coverage.method }),
      });
      loadedFaces.set(faceKey(source), {
        face,
        evidence,
        ...(coverage === undefined ? {} : { coverage }),
      });
    }
    await hostDocument.fonts.ready;
  } catch (error) {
    for (const face of addedFaces) hostDocument.fonts.delete(face);
    throw error;
  }

  const measurementSvg = createMeasurementSvg(hostDocument);
  let disposed = false;
  const fonts = Object.freeze(
    [...loadedFaces.values()].map(({ evidence }) => evidence),
  );

  const measure = (
    request: PptvBrowserTextMeasureRequest,
  ): PptvTextMeasurement => {
    validateRequest(request);
    if (disposed) {
      return unverified(
        "browser-svg-getComputedTextLength",
        "The browser text measurer has been disposed.",
      );
    }
    const loaded = loadedFaces.get(faceKey(request.font));
    if (loaded === undefined) {
      return unverified(
        browserMethod(environment),
        "No exact browser font bytes are mapped for the requested face.",
      );
    }

    const requestedCodepoints = codepoints(request.text);
    const coverage = loaded.coverage;
    if (requestedCodepoints.length > 0 && coverage === undefined) {
      return unverified(
        browserMethod(environment),
        "Exact glyph coverage evidence was not supplied for this font.",
        fontIdentity(loaded.evidence, environment),
      );
    }
    const unchecked = requestedCodepoints.filter(
      (codepoint) => coverage?.checked.has(codepoint) !== true,
    );
    if (unchecked.length > 0) {
      return unverified(
        browserMethod(environment),
        "Precomputed glyph coverage does not include every source codepoint.",
        fontIdentity(loaded.evidence, environment),
        unchecked,
      );
    }
    const missing = requestedCodepoints.filter(
      (codepoint) => coverage?.missing.has(codepoint) === true,
    );
    if (missing.length > 0) {
      return unverified(
        browserMethod(environment),
        "The exact mapped font is missing one or more source codepoints.",
        fontIdentity(loaded.evidence, environment),
        missing,
      );
    }

    const fontCheck = `${request.font.style} ${request.font.weight} ${request.font.size}px "${loaded.evidence.alias}"`;
    if (!hostDocument.fonts.check(fontCheck, request.text)) {
      return unverified(
        browserMethod(environment),
        "The exact SHA-derived browser font alias is not available for this line.",
        fontIdentity(loaded.evidence, environment),
      );
    }

    const text = hostDocument.createElementNS(SVG_NAMESPACE, "text");
    text.setAttribute("font-family", loaded.evidence.alias);
    text.setAttribute("font-size", String(request.font.size));
    text.setAttribute("font-weight", String(request.font.weight));
    text.setAttribute("font-style", request.font.style);
    // Fontkit applies the face's kerning data during layout. Make the browser
    // side explicit as well: WebKit's SVG `auto` behavior can otherwise omit
    // the same AV pair adjustment and produce a misleading calibration delta.
    text.setAttribute("font-kerning", "normal");
    text.style.fontKerning = "normal";
    text.style.fontFeatureSettings = '"kern" 1';
    text.textContent = request.text;
    measurementSvg.append(text);
    const width = text.getComputedTextLength();
    text.remove();
    if (!Number.isFinite(width) || width < 0) {
      return unverified(
        browserMethod(environment),
        "SVG getComputedTextLength() returned an invalid width.",
        fontIdentity(loaded.evidence, environment),
      );
    }
    return Object.freeze({
      kind: "measured",
      width,
      method: browserMethod(environment),
      fontIdentity: fontIdentity(loaded.evidence, environment),
      missingCodepoints: Object.freeze([]),
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    measurementSvg.remove();
    for (const face of addedFaces) hostDocument.fonts.delete(face);
  };

  return Object.freeze({
    environment,
    fonts,
    measure,
    dispose,
  });
}

export function browserEnvironmentFromUserAgent(
  userAgent: string,
  platform = "unknown",
  devicePixelRatio = 1,
): PptvBrowserEnvironmentEvidence {
  if (
    typeof platform !== "string" ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  ) {
    throw new Error(
      "Browser environment evidence requires a platform string and positive finite devicePixelRatio.",
    );
  }
  const chromium = /\b(?:Chrome|Chromium|HeadlessChrome)\/([\d.]+)/u.exec(
    userAgent,
  );
  const firefox = /\bFirefox\/([\d.]+)/u.exec(userAgent);
  const webkit =
    /\bAppleWebKit\/([\d.]+)/u.exec(userAgent) === null
      ? null
      : /\bVersion\/([\d.]+)/u.exec(userAgent);
  const engine =
    chromium !== null
      ? "chromium"
      : firefox !== null
        ? "firefox"
        : webkit !== null
          ? "webkit"
          : "unknown";
  const version = chromium?.[1] ?? firefox?.[1] ?? webkit?.[1] ?? "unknown";
  return Object.freeze({
    userAgent,
    engine,
    engineVersion: version,
    platform: platform.trim() || "unknown",
    devicePixelRatio,
  });
}

export function browserFontAlias(
  sha256: string,
  weight: 400 | 700,
  style: "normal" | "italic",
  index = 0,
): string {
  if (!/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new Error("Browser font aliases require a lowercase SHA-256 hex.");
  }
  if (weight !== 400 && weight !== 700) {
    throw new Error("Browser font aliases support only weight 400 or 700.");
  }
  if (style !== "normal" && style !== "italic") {
    throw new Error("Browser font aliases support only normal or italic.");
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Browser font alias index must be a non-negative integer.");
  }
  return `Pptv_${sha256.slice(0, 24)}_${weight}_${style}_${index}`;
}

function validateSources(
  sources: readonly PptvBrowserFontSource[],
): readonly PptvBrowserFontSource[] {
  if (!Array.isArray(sources)) {
    throw new Error("Browser font sources must be an array.");
  }
  if (sources.length > MAX_FONT_FACES) {
    throw new Error(
      `Browser font sources exceed the ${MAX_FONT_FACES}-face limit.`,
    );
  }
  let totalBytes = 0;
  const seen = new Set<string>();
  return Object.freeze(
    sources.map((source, index) => {
      if (
        typeof source !== "object" ||
        source === null ||
        typeof source.family !== "string" ||
        source.family.trim().length === 0 ||
        source.family.includes("\u0000")
      ) {
        throw new Error(`Browser font source ${index} has an invalid family.`);
      }
      if (source.weight !== 400 && source.weight !== 700) {
        throw new Error(`Browser font source ${index} has invalid weight.`);
      }
      if (source.style !== "normal" && source.style !== "italic") {
        throw new Error(`Browser font source ${index} has invalid style.`);
      }
      if (!(source.bytes instanceof Uint8Array)) {
        throw new Error(
          `Browser font source ${index} bytes must be Uint8Array.`,
        );
      }
      if (
        source.bytes.byteLength === 0 ||
        source.bytes.byteLength > MAX_FONT_FILE_BYTES
      ) {
        throw new Error(
          `Browser font source ${index} must contain 1..${MAX_FONT_FILE_BYTES} bytes.`,
        );
      }
      totalBytes += source.bytes.byteLength;
      if (totalBytes > MAX_FONT_MAP_BYTES) {
        throw new Error(
          `Browser font sources exceed the ${MAX_FONT_MAP_BYTES}-byte aggregate limit.`,
        );
      }
      const key = faceKey(source);
      if (seen.has(key)) {
        throw new Error(
          `Browser font sources contain duplicate face "${source.family}" ${source.weight} ${source.style}.`,
        );
      }
      seen.add(key);
      if (source.coverage !== undefined) normalizeCoverage(source.coverage);
      return Object.freeze({
        family: source.family,
        weight: source.weight,
        style: source.style,
        bytes: source.bytes.slice(),
        ...(source.coverage === undefined
          ? {}
          : {
              coverage: Object.freeze({
                method: source.coverage.method,
                checkedCodepoints: Object.freeze([
                  ...source.coverage.checkedCodepoints,
                ]),
                missingCodepoints: Object.freeze([
                  ...source.coverage.missingCodepoints,
                ]),
              }),
            }),
      });
    }),
  );
}

function normalizeCoverage(coverage: PptvBrowserGlyphCoverage): {
  readonly method: string;
  readonly checked: ReadonlySet<number>;
  readonly missing: ReadonlySet<number>;
} {
  if (
    typeof coverage.method !== "string" ||
    coverage.method.trim().length === 0
  ) {
    throw new Error("Browser glyph coverage requires a non-empty method.");
  }
  const checked = normalizedCodepointSet(coverage.checkedCodepoints, "checked");
  const missing = normalizedCodepointSet(coverage.missingCodepoints, "missing");
  for (const codepoint of missing) {
    if (!checked.has(codepoint)) {
      throw new Error(
        "Every missing browser glyph codepoint must also be checked.",
      );
    }
  }
  return Object.freeze({
    method: coverage.method.trim(),
    checked,
    missing,
  });
}

function normalizedCodepointSet(
  values: readonly number[],
  label: string,
): ReadonlySet<number> {
  if (!Array.isArray(values)) {
    throw new Error(`Browser glyph coverage ${label} values must be an array.`);
  }
  const normalized = new Set<number>();
  for (const value of values) {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff)
    ) {
      throw new Error(
        `Browser glyph coverage ${label} contains an invalid codepoint.`,
      );
    }
    normalized.add(value);
  }
  return normalized;
}

function validateRequest(request: PptvBrowserTextMeasureRequest): void {
  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.objectId !== "string" ||
    request.objectId.length === 0 ||
    !Number.isInteger(request.lineIndex) ||
    request.lineIndex < 0 ||
    typeof request.text !== "string" ||
    typeof request.font?.family !== "string" ||
    request.font.family.trim().length === 0 ||
    !Number.isFinite(request.font.size) ||
    request.font.size <= 0 ||
    (request.font.weight !== 400 && request.font.weight !== 700) ||
    (request.font.style !== "normal" && request.font.style !== "italic")
  ) {
    throw new Error("Browser text measurement request is invalid.");
  }
  const hasSlide =
    "slideId" in request &&
    typeof request.slideId === "string" &&
    request.slideId.length > 0;
  const hasDiagram =
    "diagramId" in request &&
    typeof request.diagramId === "string" &&
    request.diagramId.length > 0;
  if (hasSlide === hasDiagram) {
    throw new Error(
      "Browser text measurement requires exactly one slideId or diagramId.",
    );
  }
}

function createMeasurementSvg(hostDocument: Document): SVGSVGElement {
  const root = hostDocument.body ?? hostDocument.documentElement;
  if (root === null) {
    throw new Error("Browser text measurement requires a document root.");
  }
  const svg = hostDocument.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");
  svg.style.position = "fixed";
  svg.style.left = "-100000px";
  svg.style.top = "-100000px";
  svg.style.overflow = "visible";
  svg.style.opacity = "0";
  svg.style.pointerEvents = "none";
  root.append(svg);
  return svg;
}

function browserMethod(environment: PptvBrowserEnvironmentEvidence): string {
  return `browser-svg-getComputedTextLength/${environment.engine}@${environment.engineVersion}`;
}

function fontIdentity(
  font: PptvBrowserLoadedFontEvidence,
  environment: PptvBrowserEnvironmentEvidence,
): string {
  return [
    `sha256=${font.sha256}`,
    `alias=${font.alias}`,
    `family=${encodeURIComponent(font.family)}`,
    `weight=${font.weight}`,
    `style=${font.style}`,
    `engine=${environment.engine}@${environment.engineVersion}`,
    `platform=${encodeURIComponent(environment.platform)}`,
    `dpr=${environment.devicePixelRatio}`,
    `userAgent=${encodeURIComponent(environment.userAgent)}`,
  ].join(";");
}

function unverified(
  method: string,
  reason: string,
  fontIdentityValue?: string,
  missingCodepoints: readonly number[] = [],
): PptvTextMeasurement {
  return Object.freeze({
    kind: "unverified",
    method,
    reason,
    ...(fontIdentityValue === undefined
      ? {}
      : { fontIdentity: fontIdentityValue }),
    missingCodepoints: Object.freeze([...new Set(missingCodepoints)].sort()),
  });
}

function codepoints(text: string): readonly number[] {
  const values = new Set<number>();
  for (const character of text) {
    const codepoint = character.codePointAt(0);
    if (codepoint !== undefined) values.add(codepoint);
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}

function faceKey(face: {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
}): string {
  return `${face.family.trim().toLowerCase()}\u0000${face.weight}\u0000${face.style}`;
}
