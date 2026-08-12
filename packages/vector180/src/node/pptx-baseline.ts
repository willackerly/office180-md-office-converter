/**
 * Strict standalone Vector180 atom to editable PPTX baseline compiler.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import JSZip from "jszip";

import { loadAtom, loadDeck, Vector180LoadError } from "../core/deck.js";
import { parseVector180InlinePngDataUri } from "../core/inline-png.js";
import { STABLE_ID_PATTERN } from "../core/manifest.js";
import {
  resolveVector180Deck,
  resolveVector180Atom,
  type Vector180Bounds,
  type Vector180Point,
  type Vector180ResolvedDeck,
  type Vector180ResolvedAtom,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedObject,
  type Vector180ResolvedStyle,
} from "../core/resolved.js";
import type {
  Diagnostic,
  Vector180Deck,
  Vector180Atom,
  Vector180Node,
  Vector180InlinePngResourceDescriptor,
  SourceRange,
} from "../core/types.js";
import {
  compilePptxCanaryWithLineage,
  PptxCanaryCompileError,
  type PptxCanaryRasterResource,
} from "./pptx-canary.js";
import { scaleOoxmlInteger } from "./pptx-units.js";

const COMPILER = "office180-vector180-pptx-baseline/0.1" as const;
const MAP_SCHEMA = "vector180-pptx-map/0.1" as const;
const SLIDE_WIDTH = 1600;
const SLIDE_HEIGHT = 900;
const EMU_PER_UNIT = 7_620;
const HUNDREDTH_POINTS_PER_UNIT = 60;
const MAX_TEXT_INSET_EMU = 51_206_400;
const MAX_SIGNED_INT_31 = 0x7fffffff;
const RUNTIME_URL = new URL(
  "../../assets/vector180-browser-0.1.script.html",
  import.meta.url,
);
const COMPOSITION_EXTENSION = "office180.vector180Composition";
const COMPOSITION_SCHEMA = "vector180-composition/0.1";
const UNSUPPORTED_DIAGNOSTIC_CODES = new Set([
  "VECTOR180-ATOM-STYLE",
  "VECTOR180-SECURITY-URL",
  "VECTOR180-SVG-UNSUPPORTED-NATIVE",
  "VECTOR180-PROFILE-ASSET-BOUNDS",
  "VECTOR180-PROFILE-CSS-PROPERTY",
  "VECTOR180-PROFILE-STYLE",
  "VECTOR180-PROFILE-FONT",
  "VECTOR180-PROFILE-OBJECT-KIND",
  "VECTOR180-PROFILE-RESOURCE",
  "VECTOR180-PROFILE-TEXT-LINES",
  "VECTOR180-PROFILE-TRANSFORM",
]);

export type Vector180PptxBaselineErrorCode =
  | "VECTOR180-BASELINE-INVALID-SOURCE"
  | "VECTOR180-BASELINE-FAMILY"
  | "VECTOR180-BASELINE-PLACEMENT-REQUIRED"
  | "VECTOR180-BASELINE-PLACEMENT"
  | "VECTOR180-BASELINE-ASPECT"
  | "VECTOR180-BASELINE-UNSUPPORTED"
  | "VECTOR180-BASELINE-IDENTITY"
  | "VECTOR180-BASELINE-MAP"
  | "VECTOR180-BASELINE-OPC"
  | "VECTOR180-BASELINE-EXISTS";

export class Vector180PptxBaselineCompileError extends Error {
  readonly code: Vector180PptxBaselineErrorCode;

  constructor(code: Vector180PptxBaselineErrorCode, message: string) {
    super(message);
    this.name = "Vector180PptxBaselineCompileError";
    this.code = code;
  }
}

export interface Vector180Placement {
  readonly slideId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: "identity" | "uniform-scale-translate";
}

export interface Vector180PptxMapObjectSnapshot {
  readonly kind: Vector180ResolvedAtomObject["kind"];
  readonly localBounds: Vector180Bounds;
  readonly worldBounds: Vector180Bounds;
  readonly worldOffset: Vector180Point;
  readonly style: Readonly<Record<string, string | number>>;
  readonly geometry: Readonly<Record<string, unknown>>;
}

export interface Vector180PptxMapObject {
  readonly id: string;
  readonly kind: Vector180ResolvedAtomObject["kind"];
  readonly parentId: string | null;
  readonly order: number;
  readonly source: {
    readonly element: string;
    readonly role: Vector180Node["role"];
    readonly exportMode: "native" | "raster";
    readonly parentId: string | null;
    readonly order: number;
    readonly attributes: Readonly<Record<string, string>>;
    readonly text?: string;
    readonly resource?: Vector180InlinePngResourceDescriptor;
    readonly sourceRange: SourceRange;
  };
  readonly resolved: Vector180PptxMapObjectSnapshot;
  readonly composed: Vector180PptxMapObjectSnapshot;
  readonly composition: {
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
  };
  readonly emitted: {
    readonly partName: string;
    readonly element: "p:sp" | "p:cxnSp" | "p:grpSp" | "p:pic";
    readonly cNvPrName: string;
    readonly cNvPrNumericId: number;
    readonly drawingMl: Readonly<Record<string, unknown>>;
  };
  readonly capability: {
    readonly classification: "native" | "atomic-raster";
    readonly exportMode: "native" | "raster";
    readonly compilerCapability:
      "c9-native-primitive/0.1" | "c9-static-png-picture/0.1";
  };
}

export interface Vector180PptxMapSlide {
  readonly id: string;
  readonly order: number;
  readonly partName: string;
  readonly presentationRelationshipId: string;
  readonly presentationNumericId: number;
  readonly objects: readonly Vector180PptxMapObject[];
}

export interface Vector180PptxMap {
  readonly schema: typeof MAP_SCHEMA;
  readonly source: {
    readonly family: "vector180";
    readonly kind: "atom";
    readonly id: string;
    readonly sha256: string;
    readonly profile: "0.1";
    readonly metadataSha256?: string;
  };
  readonly composition: {
    readonly placement: Vector180Placement;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
    readonly composedDeckSha256: string;
  };
  readonly compiler: typeof COMPILER;
  /** Records the standalone C6 projection before one-slide composition. */
  readonly sourceResolvedSchema: "vector180-resolved-atom/0.1";
  readonly resolvedSchema: "vector180-resolved-deck/0.1";
  readonly pptx: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly partNames: readonly string[];
  };
  readonly slides: readonly Vector180PptxMapSlide[];
}

export interface Vector180PptxBaselineArtifact {
  readonly pptxBytes: Uint8Array;
  readonly pptxSha256: string;
  readonly map: Vector180PptxMap;
  /** Canonical UTF-8 sidecar serialization, including one trailing newline. */
  readonly mapText: string;
  readonly mapSha256: string;
  readonly composedDeckSource?: string;
  readonly composedDeckSha256?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180PptxBaselineOptions {
  readonly placement?: Vector180Placement;
}

export interface Vector180AtomCompositionArtifact {
  /** Deterministic, self-contained C4 deck source with one trailing newline. */
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly sourceResolved: Vector180ResolvedAtom;
  readonly resolved: Vector180ResolvedDeck;
  readonly placement: Vector180Placement;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Compose one supported standalone atom into a deterministic one-slide deck.
 * Scale is baked into concrete geometry and style values; no SVG scale
 * transform or synthetic wrapper object becomes a competing identity.
 */
export async function composeVector180AtomDeck(
  source: Vector180Atom,
  placementInput: Vector180Placement,
): Promise<Vector180AtomCompositionArtifact> {
  if (source.wireFamily !== "vector180") {
    baselineFail(
      "VECTOR180-BASELINE-FAMILY",
      "Composition requires one canonical Vector180 atom; migrate legacy PPTV source first.",
    );
  }
  if (source.sourceKind !== "svg") {
    baselineFail(
      "VECTOR180-BASELINE-UNSUPPORTED",
      "Composition accepts one standalone .vector180.svg atom only.",
    );
  }
  const trustedSource = await authenticateSourceAtom(source);
  return composeAuthenticatedVector180AtomDeck(trustedSource, placementInput);
}

async function composeAuthenticatedVector180AtomDeck(
  source: Vector180Atom,
  placementInput: Vector180Placement,
): Promise<Vector180AtomCompositionArtifact> {
  const transform = validatePlacement(source, placementInput);
  validateSourceCapability(source);
  const sourceResolution = resolveVector180Atom(source);
  if (
    sourceResolution.model === undefined ||
    sourceResolution.diagnostics.some(isErrorDiagnostic)
  ) {
    const errors = sourceResolution.diagnostics.filter(isErrorDiagnostic);
    const codes = errors.map((diagnostic) => diagnostic.code).join(", ");
    baselineFail(
      errors.some(isUnsupportedDiagnostic)
        ? "VECTOR180-BASELINE-UNSUPPORTED"
        : "VECTOR180-BASELINE-INVALID-SOURCE",
      `Standalone diagram did not produce a complete C6 model${codes.length === 0 ? "" : ` (${codes})`}.`,
    );
  }
  validateResolvedCapability(sourceResolution.model);

  const runtime = await readFile(RUNTIME_URL, "utf8");
  const sourceText = renderComposedDeck(
    source,
    sourceResolution.model,
    transform,
    runtime,
  );
  const deck = await loadDeck({
    kind: "text",
    text: sourceText,
    name: `${placementInput.slideId}.vector180.html`,
  });
  const resolved = resolveVector180Deck(deck);
  if (
    resolved.model === undefined ||
    resolved.diagnostics.some(isErrorDiagnostic)
  ) {
    const errors = resolved.diagnostics.filter(isErrorDiagnostic);
    baselineFail(
      "VECTOR180-BASELINE-INVALID-SOURCE",
      `Generated composition did not independently reload and resolve${errors.length === 0 ? "" : ` (${errors.map((diagnostic) => diagnostic.code).join(", ")})`}.`,
    );
  }
  validateComposedInventory(sourceResolution.model, resolved.model, transform);

  return Object.freeze({
    sourceText,
    sourceSha256: deck.source.sha256,
    sourceResolved: sourceResolution.model,
    resolved: resolved.model,
    placement: transform.placement,
    scale: transform.scale,
    translateX: transform.translateX,
    translateY: transform.translateY,
    // C4 preserves opaque manifest extensions with a warning; this exact
    // generated extension is owned and validated by the C9 composition path.
    diagnostics: Object.freeze(
      [...sourceResolution.diagnostics, ...resolved.diagnostics].filter(
        (diagnostic) =>
          diagnostic.code !== "VECTOR180-MANIFEST-UNSUPPORTED-EXTENSION",
      ),
    ),
  });
}

/**
 * Bounded C9 baseline: one standalone diagram, one explicit identity or
 * uniform-scale-and-translate placement, and native C7 primitives only.
 */
export async function compilePptxBaseline(
  source: Vector180Deck | Vector180Atom,
  options: Vector180PptxBaselineOptions = {},
): Promise<Vector180PptxBaselineArtifact> {
  if (source.sourceKind !== "svg") {
    baselineFail(
      "VECTOR180-BASELINE-UNSUPPORTED",
      "The bounded C9 baseline accepts a standalone .vector180.svg atom only; use pptx-canary for the current deck canary.",
    );
  }
  if (options.placement === undefined) {
    baselineFail(
      "VECTOR180-BASELINE-PLACEMENT-REQUIRED",
      "A standalone diagram requires an explicit target placement.",
    );
  }
  if (source.wireFamily !== "vector180") {
    baselineFail(
      "VECTOR180-BASELINE-FAMILY",
      "Compilation requires one canonical Vector180 atom; migrate legacy PPTV source first.",
    );
  }

  const trustedSource = await authenticateSourceAtom(source);
  const composition = await composeAuthenticatedVector180AtomDeck(
    trustedSource,
    options.placement,
  );
  const {
    placement,
    scale,
    translateX,
    translateY,
    sourceResolved,
    resolved: composed,
  } = composition;
  const rasterResources = collectRasterPackageResources(
    trustedSource,
    composed,
    placement.slideId,
  );
  const packageOptions = {
    compiler: COMPILER,
    coreTitle: `Vector180 baseline: ${trustedSource.id}`,
    customProperties: {
      "vector180.mapSchema": MAP_SCHEMA,
      "vector180.placement": canonicalPlacement(placement),
      "vector180.atomSha256": trustedSource.source.sha256,
      "vector180.sourceId": trustedSource.id,
      "vector180.sourceKind": "atom",
      "vector180.sourceResolvedSchema": sourceResolved.schema,
    },
    rasterResources,
  } as const;

  let canary;
  try {
    canary = await compilePptxCanaryWithLineage(composed, packageOptions);
  } catch (error) {
    if (error instanceof PptxCanaryCompileError) {
      rethrowCanaryError(error);
    }
    throw error;
  }

  const pptxSha256 = canary.sha256;
  const objectMap = buildObjectMap(
    trustedSource,
    sourceResolved,
    composed.slides[0]!.objects,
    scale,
    translateX,
    translateY,
  );
  const map: Vector180PptxMap = {
    schema: MAP_SCHEMA,
    source: {
      family: "vector180",
      kind: "atom",
      id: trustedSource.id,
      sha256: trustedSource.source.sha256,
      profile: "0.1",
      ...(trustedSource.metadataSha256 === undefined
        ? {}
        : { metadataSha256: trustedSource.metadataSha256 }),
    },
    composition: {
      placement,
      scale,
      translateX,
      translateY,
      composedDeckSha256: composition.sourceSha256,
    },
    compiler: COMPILER,
    sourceResolvedSchema: sourceResolved.schema,
    resolvedSchema: composed.schema,
    pptx: {
      sha256: pptxSha256,
      byteLength: canary.bytes.byteLength,
      partNames: canary.parts.map((part) => part.name),
    },
    slides: [
      {
        id: placement.slideId,
        order: 0,
        partName: "ppt/slides/slide1.xml",
        presentationRelationshipId: "rId1",
        presentationNumericId: slideNumericId(placement.slideId),
        objects: objectMap,
      },
    ],
  };
  await validateMapAgainstPackage(map, canary.bytes);

  const frozenMap = deepFreeze(map);
  const mapText = serializeVector180PptxMap(frozenMap);
  return Object.freeze({
    pptxBytes: canary.bytes,
    pptxSha256,
    map: frozenMap,
    mapText,
    mapSha256: sha256(new TextEncoder().encode(mapText)),
    composedDeckSource: composition.sourceText,
    composedDeckSha256: composition.sourceSha256,
    diagnostics: composition.diagnostics,
  });
}

/** Canonical C9 public name; the shorter export remains a compatibility alias. */
export { compilePptxBaseline as compileVector180PptxBaseline };

/**
 * Canonical C9 sidecar serialization. Object keys are recursively sorted;
 * array order remains semantic slide/painter order.
 */
export function serializeVector180PptxMap(map: Vector180PptxMap): string {
  return `${JSON.stringify(canonicalJsonValue(map), null, 2)}\n`;
}

/**
 * Reconstruct the semantic atom from retained source bytes and compare every
 * source-derived field consumed by composition or compilation. The exact SVG
 * bytes remain authority even when a caller spreads the frozen load result and
 * substitutes forged nodes, metadata, source ranges, or canvas state.
 */
async function authenticateSourceAtom(
  source: Vector180Atom,
): Promise<Vector180Atom> {
  let trusted: Vector180Atom;
  try {
    trusted = await loadAtom({
      kind: "bytes",
      bytes: source.source.bytes,
      ...(source.source.name === undefined ? {} : { name: source.source.name }),
    });
  } catch (error) {
    if (!(error instanceof Vector180LoadError)) throw error;
    return baselineFail(
      "VECTOR180-BASELINE-INVALID-SOURCE",
      "The retained exact source bytes could not be reconstructed as one canonical Vector180 SVG atom.",
    );
  }
  if (
    trusted.source.sha256 !== source.source.sha256 ||
    trusted.source.byteLength !== source.source.byteLength ||
    trusted.source.charLength !== source.source.charLength ||
    trusted.source.text !== source.source.text ||
    atomCompilerInputSnapshot(trusted) !== atomCompilerInputSnapshot(source)
  ) {
    baselineFail(
      "VECTOR180-BASELINE-IDENTITY",
      "The supplied atom interpretation does not match the canonical snapshot reconstructed from its exact retained source bytes.",
    );
  }
  return trusted;
}

function atomCompilerInputSnapshot(source: Vector180Atom): string {
  return JSON.stringify(
    canonicalJsonValue({
      version: source.version,
      sourceKind: source.sourceKind,
      wireFamily: source.wireFamily,
      id: source.id,
      viewBox: [...source.viewBox],
      children: source.children.map(snapshotSourceNodeForAuthentication),
      ...(source.metadata === undefined ? {} : { metadata: source.metadata }),
      ...(source.metadataSha256 === undefined
        ? {}
        : { metadataSha256: source.metadataSha256 }),
      sourceRange: { ...source.sourceRange },
      diagnostics: source.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      source: {
        ...(source.source.wireFamily === undefined
          ? {}
          : { wireFamily: source.source.wireFamily }),
        charLength: source.source.charLength,
        byteLength: source.source.byteLength,
        sha256: source.source.sha256,
      },
    }),
  );
}

function snapshotSourceNodeForAuthentication(node: Vector180Node): unknown {
  return {
    id: node.id,
    role: node.role,
    exportMode: node.exportMode,
    elementName: node.elementName,
    classes: [...node.classes],
    attributes: sortedRecord(node.attributes),
    parentId: node.parentId,
    children: node.children.map(snapshotSourceNodeForAuthentication),
    ...(node.text === undefined ? {} : { text: node.text }),
    ...(node.resource === undefined ? {} : { resource: { ...node.resource } }),
    opaque: node.opaque,
    sourceRange: { ...node.sourceRange },
    openTagRange: { ...node.openTagRange },
    ...(node.directTextRange === undefined
      ? {}
      : { directTextRange: { ...node.directTextRange } }),
  };
}

interface ValidatedPlacement {
  readonly placement: Vector180Placement;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

function validatePlacement(
  diagram: Vector180Atom,
  placement: Vector180Placement,
): ValidatedPlacement {
  if (!STABLE_ID_PATTERN.test(placement.slideId)) {
    baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      `Placement slide ID "${placement.slideId}" is not a stable Vector180 ID.`,
    );
  }
  if (
    placement.policy !== "identity" &&
    placement.policy !== "uniform-scale-translate"
  ) {
    baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      `Unknown placement policy "${String(placement.policy)}".`,
    );
  }
  const values = [placement.x, placement.y, placement.width, placement.height];
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        scaleOoxmlInteger(value, EMU_PER_UNIT) === undefined,
    ) ||
    placement.x < 0 ||
    placement.y < 0 ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    placement.x + placement.width > SLIDE_WIDTH ||
    placement.y + placement.height > SLIDE_HEIGHT
  ) {
    baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      "Placement must be finite, positive, exact in C7 EMUs, and contained by the 1600 × 900 slide.",
    );
  }
  const [, , sourceWidth, sourceHeight] = diagram.viewBox;
  let scale: number;
  if (placement.policy === "identity") {
    if (placement.width !== sourceWidth || placement.height !== sourceHeight) {
      baselineFail(
        "VECTOR180-BASELINE-PLACEMENT",
        `Identity placement extent ${placement.width} × ${placement.height} must equal source viewBox extent ${sourceWidth} × ${sourceHeight}.`,
      );
    }
    scale = 1;
  } else {
    if (
      !exactDecimalProductsEqual(
        placement.width,
        sourceHeight,
        placement.height,
        sourceWidth,
      )
    ) {
      baselineFail(
        "VECTOR180-BASELINE-ASPECT",
        `Uniform placement extent ${placement.width} × ${placement.height} does not exactly match source aspect ${sourceWidth} × ${sourceHeight}.`,
      );
    }
    scale = cleanNumber(placement.width / sourceWidth);
    if (!Number.isFinite(scale) || scale <= 0) {
      baselineFail(
        "VECTOR180-BASELINE-PLACEMENT",
        "Uniform placement scale must be finite and positive.",
      );
    }
  }
  const translateX = cleanNumber(placement.x - scale * diagram.viewBox[0]);
  const translateY = cleanNumber(placement.y - scale * diagram.viewBox[1]);
  if (!Number.isFinite(translateX) || !Number.isFinite(translateY)) {
    baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      "Placement transform must remain finite.",
    );
  }
  return Object.freeze({
    placement: Object.freeze({ ...placement }),
    scale,
    translateX,
    translateY,
  });
}

function validateSourceCapability(diagram: Vector180Atom): void {
  const errors = diagram.diagnostics.filter(isErrorDiagnostic);
  if (errors.length > 0) {
    baselineFail(
      errors.some(isUnsupportedDiagnostic)
        ? "VECTOR180-BASELINE-UNSUPPORTED"
        : "VECTOR180-BASELINE-INVALID-SOURCE",
      "Standalone diagram contains C4 validation errors.",
    );
  }
  visitSourceNodes(diagram.children, (node) => {
    const raster =
      node.elementName === "image" &&
      node.role === "asset" &&
      node.exportMode === "raster" &&
      node.opaque &&
      node.resource !== undefined;
    if (node.exportMode !== "native" && !raster) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Object "${node.id}" requests data-vector180-export="${node.exportMode}"; C9 admits native primitives or one exact static inline PNG picture.`,
      );
    }
    if (node.exportMode === "native" && node.opaque) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Opaque object "${node.id}" is outside the bounded C9 native subset.`,
      );
    }
  });
}

function validateResolvedCapability(model: Vector180ResolvedAtom): void {
  const [originX, originY, width, height] = model.canvas.viewBox;
  const maxX = originX + width;
  const maxY = originY + height;
  visitAtomObjects(model.objects, (object) => {
    if (object.kind === "svg-asset") {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `SVG asset "${object.id}" is outside the bounded C9 subset.`,
      );
    }
    if (
      object.kind === "rect" &&
      (object.rx !== undefined || object.ry !== undefined)
    ) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Rounded rectangle "${object.id}" is outside the bounded C9 native subset.`,
      );
    }
    if (object.kind === "text" && object.lines.length !== 1) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Text "${object.id}" has ${object.lines.length} hard lines; the bounded C9 slice accepts exactly one.`,
      );
    }
    if (object.style.opacity !== 1) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Object "${object.id}" opacity must be exactly 1.`,
      );
    }
    const bounds = object.worldBounds;
    if (
      bounds.x < originX ||
      bounds.y < originY ||
      bounds.x + bounds.width > maxX ||
      bounds.y + bounds.height > maxY
    ) {
      baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Object "${object.id}" crosses the source viewBox; C9 does not silently drop SVG clipping semantics.`,
      );
    }
  });
}

function renderComposedDeck(
  source: Vector180Atom,
  diagram: Vector180ResolvedAtom,
  transform: ValidatedPlacement,
  runtime: string,
): string {
  const sourceNodes = new Map<string, { node: Vector180Node; order: number }>();
  indexSourceNodes(source.children, sourceNodes);
  const manifest = {
    extensions: {
      [COMPOSITION_EXTENSION]: {
        placement: transform.placement,
        schema: COMPOSITION_SCHEMA,
        source: {
          id: source.id,
          kind: "atom",
          profile: source.version,
          sha256: source.source.sha256,
        },
        transform: {
          scale: transform.scale,
          translateX: transform.translateX,
          translateY: transform.translateY,
        },
      },
    },
    vector180: "0.1",
    runtime: "vector180-browser/0.1",
    slides: [transform.placement.slideId],
    theme: "diagram-local",
    title: `Vector180 composition: ${source.id}`,
  };
  const manifestText = JSON.stringify(canonicalJsonValue(manifest), null, 2);
  const renderedObjects = diagram.objects
    .map((object) =>
      renderComposedObject(object, sourceNodes, transform, true, 4),
    )
    .join("\n");
  const runtimeSection = runtime.endsWith("\n")
    ? runtime.slice(0, -1)
    : runtime;
  return [
    "<!doctype html>",
    '<html lang="en" data-vector180-version="0.1">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${htmlText(`Vector180 composition: ${source.id}`)}</title>`,
    "</head>",
    "<body>",
    "",
    '<script id="vector180-manifest" type="application/vnd.office180.vector180+json">',
    manifestText,
    "</script>",
    "",
    "<main data-vector180-output></main>",
    "",
    `<template data-vector180-slide="${htmlAttribute(transform.placement.slideId)}">`,
    `  <svg id="${htmlAttribute(transform.placement.slideId)}" viewBox="0 0 1600 900" data-vector180-layout="diagram" xmlns="http://www.w3.org/2000/svg">`,
    renderedObjects,
    "  </svg>",
    "</template>",
    "",
    '<script type="text/css" data-vector180-style="base">',
    "</script>",
    "",
    '<script type="text/css" data-vector180-theme="diagram-local">',
    ":root {",
    "}",
    "</script>",
    "",
    runtimeSection,
    "",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function renderComposedObject(
  object: Vector180ResolvedAtomObject,
  sourceNodes: ReadonlyMap<string, { node: Vector180Node; order: number }>,
  transform: ValidatedPlacement,
  topLevel: boolean,
  indentSize: number,
): string {
  const sourceEntry = sourceNodes.get(object.id);
  const expectedExport = object.kind === "raster-asset" ? "raster" : "native";
  if (
    sourceEntry === undefined ||
    sourceEntry.node.exportMode !== expectedExport
  ) {
    return baselineFail(
      "VECTOR180-BASELINE-IDENTITY",
      `Object "${object.id}" lacks one exact ${expectedExport} source identity during composition.`,
    );
  }
  const indent = " ".repeat(indentSize);
  const common = [
    ["id", object.id],
    ["data-vector180-role", sourceEntry.node.role],
    ["data-vector180-export", expectedExport],
  ] as Array<[string, string]>;
  const style = composedStyleAttributes(object.style, transform.scale);
  const x = (value: number): string =>
    numberText(
      cleanNumber(
        value * transform.scale + (topLevel ? transform.translateX : 0),
      ),
    );
  const y = (value: number): string =>
    numberText(
      cleanNumber(
        value * transform.scale + (topLevel ? transform.translateY : 0),
      ),
    );
  const length = (value: number): string =>
    numberText(cleanNumber(value * transform.scale));

  switch (object.kind) {
    case "rect":
      return emptySvgElement(
        "rect",
        [
          ...common,
          ["x", x(object.x)],
          ["y", y(object.y)],
          ["width", length(object.width)],
          ["height", length(object.height)],
          ...(object.rx === undefined
            ? []
            : ([["rx", length(object.rx)]] as Array<[string, string]>)),
          ...(object.ry === undefined
            ? []
            : ([["ry", length(object.ry)]] as Array<[string, string]>)),
          ...style,
        ],
        indent,
      );
    case "ellipse":
      return emptySvgElement(
        object.sourceElement,
        [
          ...common,
          ["cx", x(object.cx)],
          ["cy", y(object.cy)],
          ...(object.sourceElement === "circle"
            ? ([["r", length(object.rx)]] as Array<[string, string]>)
            : ([
                ["rx", length(object.rx)],
                ["ry", length(object.ry)],
              ] as Array<[string, string]>)),
          ...style,
        ],
        indent,
      );
    case "line":
      return emptySvgElement(
        "line",
        [
          ...common,
          ...(object.fromId === undefined
            ? []
            : ([["data-vector180-from", object.fromId]] as Array<
                [string, string]
              >)),
          ...(object.toId === undefined
            ? []
            : ([["data-vector180-to", object.toId]] as Array<
                [string, string]
              >)),
          ["x1", x(object.x1)],
          ["y1", y(object.y1)],
          ["x2", x(object.x2)],
          ["y2", y(object.y2)],
          ...style,
        ],
        indent,
      );
    case "text": {
      const line = object.lines[0];
      if (line === undefined || object.lines.length !== 1) {
        return baselineFail(
          "VECTOR180-BASELINE-UNSUPPORTED",
          `Text "${object.id}" must contain exactly one hard line.`,
        );
      }
      const attributes = [
        ...common,
        [
          "data-vector180-frame",
          [
            x(object.frame.x),
            y(object.frame.y),
            length(object.frame.width),
            length(object.frame.height),
          ].join(" "),
        ],
        ["data-vector180-line-step", length(object.lineStep)],
        ["x", x(line.x)],
        ["y", y(line.y)],
        ...style,
      ] as Array<[string, string]>;
      return `${indent}<text${renderAttributes(attributes)}>${htmlText(line.text)}</text>`;
    }
    case "group": {
      const translateX = cleanNumber(
        object.translateX * transform.scale +
          (topLevel ? transform.translateX : 0),
      );
      const translateY = cleanNumber(
        object.translateY * transform.scale +
          (topLevel ? transform.translateY : 0),
      );
      const attributes = [
        ...common,
        ...(translateX === 0 && translateY === 0
          ? []
          : ([
              [
                "transform",
                `translate(${numberText(translateX)} ${numberText(translateY)})`,
              ],
            ] as Array<[string, string]>)),
        ...style,
      ];
      const children = object.children
        .map((child) =>
          renderComposedObject(
            child,
            sourceNodes,
            transform,
            false,
            indentSize + 2,
          ),
        )
        .join("\n");
      return `${indent}<g${renderAttributes(attributes)}>\n${children}\n${indent}</g>`;
    }
    case "svg-asset":
      return baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `SVG asset "${object.id}" cannot be composed in the bounded C9 subset.`,
      );
    case "raster-asset": {
      const href = exactInlinePngHref(sourceEntry.node);
      const bounds = object.localBounds;
      return emptySvgElement(
        "image",
        [
          ...common,
          [
            "data-vector180-bounds",
            [
              x(bounds.x),
              y(bounds.y),
              length(bounds.width),
              length(bounds.height),
            ].join(" "),
          ],
          ["x", x(bounds.x)],
          ["y", y(bounds.y)],
          ["width", length(bounds.width)],
          ["height", length(bounds.height)],
          ["href", href],
        ],
        indent,
      );
    }
    default:
      return assertNever(object);
  }
}

function exactInlinePngHref(node: Vector180Node): string {
  const references = Object.entries(node.attributes).filter(([name]) => {
    const normalized = name.toLowerCase();
    return normalized === "href" || normalized === "xlink:href";
  });
  if (references.length !== 1) {
    return baselineFail(
      "VECTOR180-BASELINE-UNSUPPORTED",
      `Raster asset "${node.id}" requires exactly one inline PNG href.`,
    );
  }
  const value = references[0]![1];
  const parsed = parseVector180InlinePngDataUri(value);
  if (
    !parsed.ok ||
    node.resource === undefined ||
    !sameRasterDescriptor(parsed.descriptor, node.resource)
  ) {
    return baselineFail(
      "VECTOR180-BASELINE-UNSUPPORTED",
      `Raster asset "${node.id}" no longer matches its validated PNG descriptor.`,
    );
  }
  return value;
}

function collectRasterPackageResources(
  source: Vector180Atom,
  composed: Vector180ResolvedDeck,
  slideId: string,
): readonly PptxCanaryRasterResource[] {
  const sourceNodes = new Map<string, { node: Vector180Node; order: number }>();
  indexSourceNodes(source.children, sourceNodes);
  const slide = composed.slides[0];
  if (
    slide === undefined ||
    composed.slides.length !== 1 ||
    slide.id !== slideId
  ) {
    return baselineFail(
      "VECTOR180-BASELINE-IDENTITY",
      "Raster packaging requires the exact one-slide C9 composition.",
    );
  }
  const resources: PptxCanaryRasterResource[] = [];
  for (const object of indexObjects(slide.objects).values()) {
    if (object.kind !== "raster-asset") continue;
    const node = sourceNodes.get(object.id)?.node;
    if (node === undefined) {
      return baselineFail(
        "VECTOR180-BASELINE-IDENTITY",
        `Raster asset "${object.id}" has no exact source node.`,
      );
    }
    const parsed = parseVector180InlinePngDataUri(exactInlinePngHref(node));
    if (
      !parsed.ok ||
      !sameRasterDescriptor(parsed.descriptor, object.resource)
    ) {
      return baselineFail(
        "VECTOR180-BASELINE-UNSUPPORTED",
        `Raster asset "${object.id}" source, resolved descriptor, and package bytes disagree.`,
      );
    }
    resources.push(
      Object.freeze({
        slideId,
        objectId: object.id,
        descriptor: object.resource,
        bytes: new Uint8Array(parsed.bytes),
      }),
    );
  }
  return Object.freeze(resources);
}

function sameRasterDescriptor(
  left: Vector180InlinePngResourceDescriptor,
  right: Vector180InlinePngResourceDescriptor,
): boolean {
  return (
    left.mediaType === right.mediaType &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.widthPixels === right.widthPixels &&
    left.heightPixels === right.heightPixels
  );
}

function composedStyleAttributes(
  style: Vector180ResolvedStyle,
  scale: number,
): Array<[string, string]> {
  return [
    ["fill", style.fill],
    ["stroke", style.stroke],
    ["stroke-width", numberText(cleanNumber(style.strokeWidth * scale))],
    ["opacity", numberText(style.opacity)],
    ...(style.fontFamily === undefined
      ? []
      : ([["font-family", style.fontFamily]] as Array<[string, string]>)),
    ...(style.fontSize === undefined
      ? []
      : ([
          ["font-size", numberText(cleanNumber(style.fontSize * scale))],
        ] as Array<[string, string]>)),
    ["font-weight", String(style.fontWeight)],
    ["font-style", style.fontStyle],
    ["text-anchor", style.textAnchor],
  ];
}

function emptySvgElement(
  name: string,
  attributes: readonly [string, string][],
  indent: string,
): string {
  return `${indent}<${name}${renderAttributes(attributes)}/>`;
}

function renderAttributes(attributes: readonly [string, string][]): string {
  return attributes
    .map(([name, value]) => ` ${name}="${htmlAttribute(value)}"`)
    .join("");
}

function htmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function htmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) {
    return baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      "Composition produced a non-finite numeric value.",
    );
  }
  return String(cleanNumber(value));
}

function validateComposedInventory(
  source: Vector180ResolvedAtom,
  composed: Vector180ResolvedDeck,
  transform: ValidatedPlacement,
): void {
  const slide = composed.slides[0];
  if (
    composed.slides.length !== 1 ||
    slide === undefined ||
    slide.id !== transform.placement.slideId
  ) {
    baselineFail(
      "VECTOR180-BASELINE-IDENTITY",
      "Generated composition did not retain its one explicit slide identity.",
    );
  }
  const sourceObjects = flattenAtomObjects(source.objects);
  const composedObjects = [...indexObjects(slide.objects).values()];
  if (
    sourceObjects.length !== composedObjects.length ||
    sourceObjects.some((object, index) => {
      const candidate = composedObjects[index];
      return (
        candidate === undefined ||
        candidate.id !== object.id ||
        candidate.kind !== object.kind ||
        candidate.parentId !== object.parentId ||
        candidate.order !== object.order
      );
    })
  ) {
    baselineFail(
      "VECTOR180-BASELINE-IDENTITY",
      "Generated composition changed stable identity, kind, hierarchy, or painter order.",
    );
  }
}

function buildObjectMap(
  source: Vector180Atom,
  resolved: Vector180ResolvedAtom,
  composedObjects: readonly Vector180ResolvedObject[],
  scale: number,
  translateX: number,
  translateY: number,
): readonly Vector180PptxMapObject[] {
  const sourceNodes = new Map<string, { node: Vector180Node; order: number }>();
  indexSourceNodes(source.children, sourceNodes);
  const composed = indexObjects(composedObjects);
  const resolvedObjects = flattenAtomObjects(resolved.objects);
  if (
    sourceNodes.size !== resolvedObjects.length ||
    composed.size !== resolvedObjects.length
  ) {
    baselineFail(
      "VECTOR180-BASELINE-MAP",
      "Source, resolved, and emitted object inventories are not one-to-one.",
    );
  }

  const numericIds = allocateObjectNumericIds(
    resolvedObjects.map((object) => object.id),
  );
  const rasterRelationships = new Map(
    resolvedObjects
      .filter(
        (
          object,
        ): object is Extract<
          Vector180ResolvedAtomObject,
          { readonly kind: "raster-asset" }
        > => object.kind === "raster-asset",
      )
      .map(
        (object, index) =>
          [
            object.id,
            {
              relationshipId: `rId${index + 2}`,
              partName: `ppt/media/${object.resource.sha256}.png`,
            },
          ] as const,
      ),
  );
  return Object.freeze(
    resolvedObjects.map((object): Vector180PptxMapObject => {
      const sourceEntry = sourceNodes.get(object.id);
      const composedObject = composed.get(object.id);
      const numericId = numericIds.get(object.id);
      const expectedExport =
        object.kind === "raster-asset" ? "raster" : "native";
      if (
        sourceEntry === undefined ||
        composedObject === undefined ||
        numericId === undefined ||
        sourceEntry.node.exportMode !== expectedExport
      ) {
        baselineFail(
          "VECTOR180-BASELINE-MAP",
          `Object "${object.id}" lacks one exact source/resolved/emitted mapping.`,
        );
      }
      if (
        sourceEntry.node.parentId !== object.parentId ||
        sourceEntry.order !== object.order ||
        composedObject.parentId !== object.parentId ||
        composedObject.order !== object.order ||
        composedObject.kind !== object.kind
      ) {
        baselineFail(
          "VECTOR180-BASELINE-MAP",
          `Object "${object.id}" identity, parent, kind, or painter order changed during composition.`,
        );
      }
      return {
        id: object.id,
        kind: object.kind,
        parentId: object.parentId,
        order: object.order,
        source: {
          element: sourceEntry.node.elementName,
          role: sourceEntry.node.role,
          exportMode: expectedExport,
          parentId: sourceEntry.node.parentId,
          order: sourceEntry.order,
          attributes: sourceMapAttributes(sourceEntry.node),
          ...(sourceEntry.node.text === undefined
            ? {}
            : { text: sourceEntry.node.text }),
          ...(sourceEntry.node.resource === undefined
            ? {}
            : { resource: sourceEntry.node.resource }),
          sourceRange: { ...sourceEntry.node.sourceRange },
        },
        resolved: snapshotObject(object),
        composed: snapshotObject(composedObject),
        composition: {
          scale,
          translateX,
          translateY,
        },
        emitted: {
          partName: "ppt/slides/slide1.xml",
          element: emittedElement(object.kind),
          cNvPrName: `src.${object.id}`,
          cNvPrNumericId: numericId,
          drawingMl: drawingMlSnapshot(
            composedObject,
            rasterRelationships.get(object.id),
          ),
        },
        capability: {
          classification:
            object.kind === "raster-asset" ? "atomic-raster" : "native",
          exportMode: expectedExport,
          compilerCapability:
            object.kind === "raster-asset"
              ? "c9-static-png-picture/0.1"
              : "c9-native-primitive/0.1",
        },
      };
    }),
  );
}

function snapshotObject(
  object: Vector180ResolvedAtomObject | Vector180ResolvedObject,
): Vector180PptxMapObjectSnapshot {
  return {
    kind: object.kind,
    localBounds: { ...object.localBounds },
    worldBounds: { ...object.worldBounds },
    worldOffset: { ...object.worldOffset },
    style: styleSnapshot(object.style),
    geometry: geometrySnapshot(object),
  };
}

function styleSnapshot(
  style: Vector180ResolvedStyle,
): Readonly<Record<string, string | number>> {
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAnchor: style.textAnchor,
    ...(style.fontFamily === undefined ? {} : { fontFamily: style.fontFamily }),
    ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
  };
}

function geometrySnapshot(
  object: Vector180ResolvedAtomObject | Vector180ResolvedObject,
): Readonly<Record<string, unknown>> {
  switch (object.kind) {
    case "rect":
      return {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        ...(object.rx === undefined ? {} : { rx: object.rx }),
        ...(object.ry === undefined ? {} : { ry: object.ry }),
      };
    case "ellipse":
      return {
        sourceElement: object.sourceElement,
        cx: object.cx,
        cy: object.cy,
        rx: object.rx,
        ry: object.ry,
      };
    case "line":
      return {
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
        ...(object.fromId === undefined ? {} : { fromId: object.fromId }),
        ...(object.toId === undefined ? {} : { toId: object.toId }),
      };
    case "text":
      return {
        frame: { ...object.frame },
        lineStep: object.lineStep,
        anchor: object.anchor,
        lines: object.lines.map((line) => ({ ...line })),
        wrap: object.wrap,
        autofit: object.autofit,
        margins: { ...object.margins },
      };
    case "group":
      return {
        translateX: object.translateX,
        translateY: object.translateY,
        childIds: object.children.map((child) => child.id),
      };
    case "svg-asset":
      return {};
    case "raster-asset":
      return { resource: { ...object.resource } };
    default:
      return assertNever(object);
  }
}

function drawingMlSnapshot(
  object: Vector180ResolvedObject,
  rasterRelationship?: {
    readonly relationshipId: string;
    readonly partName: string;
  },
): Readonly<Record<string, unknown>> {
  const numeric = (value: number): number => exactScaled(value, EMU_PER_UNIT);
  switch (object.kind) {
    case "rect":
      return {
        presetGeometry: "rect",
        transform: {
          offXEmu: numeric(object.x),
          offYEmu: numeric(object.y),
          extCxEmu: numeric(object.width),
          extCyEmu: numeric(object.height),
        },
        fill: paintSnapshot(object.style.fill),
        line: lineSnapshot(object.style),
      };
    case "ellipse": {
      const rx = numeric(object.rx);
      const ry = numeric(object.ry);
      const cx = numeric(object.cx);
      const cy = numeric(object.cy);
      return {
        presetGeometry: "ellipse",
        transform: {
          offXEmu: cx - rx,
          offYEmu: cy - ry,
          extCxEmu: rx * 2,
          extCyEmu: ry * 2,
        },
        fill: paintSnapshot(object.style.fill),
        line: lineSnapshot(object.style),
      };
    }
    case "line": {
      const x1 = numeric(object.x1);
      const y1 = numeric(object.y1);
      const x2 = numeric(object.x2);
      const y2 = numeric(object.y2);
      return {
        presetGeometry: "line",
        transform: {
          offXEmu: Math.min(x1, x2),
          offYEmu: Math.min(y1, y2),
          extCxEmu: Math.abs(x2 - x1),
          extCyEmu: Math.abs(y2 - y1),
          flipH: x1 > x2,
          flipV: y1 > y2,
        },
        line: lineSnapshot(object.style),
      };
    }
    case "text": {
      const line = object.lines[0];
      const fontFamily = object.style.fontFamily;
      const fontSize = object.style.fontSize;
      if (
        line === undefined ||
        fontFamily === undefined ||
        fontSize === undefined
      ) {
        return baselineFail(
          "VECTOR180-BASELINE-MAP",
          `Text "${object.id}" lacks its admitted single-line font values.`,
        );
      }
      const frameX = numeric(object.frame.x);
      const frameY = numeric(object.frame.y);
      const frameWidth = numeric(object.frame.width);
      const anchorX = numeric(line.x);
      const topInset = numeric(line.y) - frameY - numeric(fontSize);
      if (
        !Number.isSafeInteger(topInset) ||
        topInset < -MAX_TEXT_INSET_EMU ||
        topInset > MAX_TEXT_INSET_EMU
      ) {
        return baselineFail(
          "VECTOR180-BASELINE-MAP",
          `Text "${object.id}" authored baseline requires an unsupported DrawingML top inset.`,
        );
      }
      const margins = paragraphMargins(
        object.anchor,
        anchorX - frameX,
        frameWidth,
      );
      return {
        presetGeometry: "rect",
        transform: {
          offXEmu: frameX,
          offYEmu: frameY,
          extCxEmu: frameWidth,
          extCyEmu: numeric(object.frame.height),
        },
        frameFill: { kind: "none" },
        frameLine: { kind: "none" },
        body: {
          wrap: "none",
          autofit: "none",
          marginsEmu: { left: 0, top: topInset, right: 0, bottom: 0 },
          verticalAnchor: "top",
        },
        paragraph: {
          alignment:
            object.anchor === "start"
              ? "left"
              : object.anchor === "middle"
                ? "center"
                : "right",
          marginLeftEmu: margins.left,
          marginRightEmu: margins.right,
          indentEmu: 0,
          lineSpacingHundredthPoints: exactScaled(
            object.lineStep,
            HUNDREDTH_POINTS_PER_UNIT,
          ),
          spacingBeforeHundredthPoints: 0,
          spacingAfterHundredthPoints: 0,
          bullets: "none",
        },
        run: {
          text: line.text,
          fontFamily,
          fontSizeHundredthPoints: exactScaled(
            fontSize,
            HUNDREDTH_POINTS_PER_UNIT,
          ),
          bold: object.style.fontWeight === 700,
          italic: object.style.fontStyle === "italic",
          fill: paintSnapshot(object.style.fill),
          outline: lineSnapshot(object.style),
        },
      };
    }
    case "group": {
      const localX = numeric(object.localBounds.x);
      const localY = numeric(object.localBounds.y);
      const width = numeric(object.localBounds.width);
      const height = numeric(object.localBounds.height);
      return {
        transform: {
          offXEmu: localX + numeric(object.translateX),
          offYEmu: localY + numeric(object.translateY),
          extCxEmu: width,
          extCyEmu: height,
          childOffXEmu: localX,
          childOffYEmu: localY,
          childExtCxEmu: width,
          childExtCyEmu: height,
        },
      };
    }
    case "svg-asset":
      return baselineFail(
        "VECTOR180-BASELINE-MAP",
        `Unsupported asset "${object.id}" reached DrawingML mapping.`,
      );
    case "raster-asset":
      if (rasterRelationship === undefined) {
        return baselineFail(
          "VECTOR180-BASELINE-MAP",
          `Raster asset "${object.id}" lacks its deterministic image relationship.`,
        );
      }
      return {
        transform: {
          offXEmu: numeric(object.localBounds.x),
          offYEmu: numeric(object.localBounds.y),
          extCxEmu: numeric(object.localBounds.width),
          extCyEmu: numeric(object.localBounds.height),
        },
        picture: {
          relationshipId: rasterRelationship.relationshipId,
          partName: rasterRelationship.partName,
          mediaType: object.resource.mediaType,
          sha256: object.resource.sha256,
          byteLength: object.resource.byteLength,
          widthPixels: object.resource.widthPixels,
          heightPixels: object.resource.heightPixels,
          stretch: "fillRect",
          lockAspect: true,
        },
      };
    default:
      return assertNever(object);
  }
}

async function validateMapAgainstPackage(
  map: Vector180PptxMap,
  bytes: Uint8Array,
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    baselineFail(
      "VECTOR180-BASELINE-OPC",
      `Generated PPTX could not be reopened: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const slide = map.slides[0]!;
  const slideXml = await zip.file(slide.partName)?.async("string");
  const presentationXml = await zip
    .file("ppt/presentation.xml")
    ?.async("string");
  const presentationRels = await zip
    .file("ppt/_rels/presentation.xml.rels")
    ?.async("string");
  const slideRels = await zip
    .file("ppt/slides/_rels/slide1.xml.rels")
    ?.async("string");
  if (
    slideXml === undefined ||
    presentationXml === undefined ||
    presentationRels === undefined ||
    slideRels === undefined
  ) {
    baselineFail(
      "VECTOR180-BASELINE-OPC",
      "Generated PPTX lacks its mapped slide or presentation relationship parts.",
    );
  }

  const actual = [
    ...slideXml.matchAll(/<p:cNvPr id="([1-9]\d*)" name="src\.([^"]+)"\/>/gu),
  ]
    .map((match) => `${match[2]}\0${match[1]}`)
    .sort(compareText);
  const expected = slide.objects
    .map((object) => `${object.id}\0${String(object.emitted.cNvPrNumericId)}`)
    .sort(compareText);
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    baselineFail(
      "VECTOR180-BASELINE-MAP",
      "The source map and emitted stable-name/numeric-ID inventory differ.",
    );
  }
  if (
    !presentationXml.includes(
      `<p:sldId id="${slide.presentationNumericId}" r:id="${slide.presentationRelationshipId}"/>`,
    ) ||
    !presentationRels.includes(
      `<Relationship Id="${slide.presentationRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>`,
    )
  ) {
    baselineFail(
      "VECTOR180-BASELINE-MAP",
      "The mapped slide part, relationship ID, and presentation order do not agree.",
    );
  }
  const rasterObjects = slide.objects.filter(
    (object) => object.kind === "raster-asset",
  );
  for (const [index, object] of rasterObjects.entries()) {
    const descriptor = object.source.resource;
    const relationshipId = `rId${index + 2}`;
    if (descriptor === undefined) {
      baselineFail(
        "VECTOR180-BASELINE-MAP",
        `Mapped raster asset "${object.id}" lacks its exact PNG descriptor.`,
      );
    }
    const partName = `ppt/media/${descriptor.sha256}.png`;
    const target = `../media/${descriptor.sha256}.png`;
    const mediaBytes = await zip.file(partName)?.async("uint8array");
    if (
      object.emitted.element !== "p:pic" ||
      !slideXml.includes(`<a:blip r:embed="${relationshipId}"/>`) ||
      !slideRels.includes(
        `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`,
      ) ||
      mediaBytes === undefined ||
      mediaBytes.byteLength !== descriptor.byteLength ||
      sha256(mediaBytes) !== descriptor.sha256
    ) {
      baselineFail(
        "VECTOR180-BASELINE-MAP",
        `Mapped raster asset "${object.id}" does not match its picture, relationship, and content-addressed media part.`,
      );
    }
  }
}

function indexSourceNodes(
  nodes: readonly Vector180Node[],
  result: Map<string, { node: Vector180Node; order: number }>,
): void {
  for (const [order, node] of nodes.entries()) {
    if (result.has(node.id)) {
      baselineFail(
        "VECTOR180-BASELINE-IDENTITY",
        `Duplicate stable object ID "${node.id}".`,
      );
    }
    result.set(node.id, { node, order });
    indexSourceNodes(node.children, result);
  }
}

function indexObjects(
  objects: readonly Vector180ResolvedObject[],
): ReadonlyMap<string, Vector180ResolvedObject> {
  const result = new Map<string, Vector180ResolvedObject>();
  const visit = (siblings: readonly Vector180ResolvedObject[]): void => {
    for (const object of siblings) {
      if (result.has(object.id)) {
        baselineFail(
          "VECTOR180-BASELINE-IDENTITY",
          `Duplicate composed stable object ID "${object.id}".`,
        );
      }
      result.set(object.id, object);
      if (object.kind === "group") visit(object.children);
    }
  };
  visit(objects);
  return result;
}

function flattenAtomObjects(
  objects: readonly Vector180ResolvedAtomObject[],
): readonly Vector180ResolvedAtomObject[] {
  const result: Vector180ResolvedAtomObject[] = [];
  const visit = (siblings: readonly Vector180ResolvedAtomObject[]): void => {
    for (const object of siblings) {
      result.push(object);
      if (object.kind === "group") visit(object.children);
    }
  };
  visit(objects);
  return result;
}

function allocateObjectNumericIds(
  ids: readonly string[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const reverse = new Map<number, string>();
  for (const id of [...ids].sort(compareText)) {
    const numeric = 2 + (stableHash(id) % (MAX_SIGNED_INT_31 - 1));
    const previous = reverse.get(numeric);
    if (previous !== undefined && previous !== id) {
      baselineFail(
        "VECTOR180-BASELINE-IDENTITY",
        `Stable IDs "${previous}" and "${id}" collide at Office numeric ID ${numeric}.`,
      );
    }
    reverse.set(numeric, id);
    result.set(id, numeric);
  }
  return result;
}

function slideNumericId(id: string): number {
  return 256 + (stableHash(id) % (MAX_SIGNED_INT_31 - 255));
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function emittedElement(
  kind: Vector180ResolvedAtomObject["kind"],
): "p:sp" | "p:cxnSp" | "p:grpSp" | "p:pic" {
  if (kind === "line") return "p:cxnSp";
  if (kind === "group") return "p:grpSp";
  if (kind === "raster-asset") return "p:pic";
  if (kind === "svg-asset") {
    return baselineFail(
      "VECTOR180-BASELINE-MAP",
      `Unsupported ${kind} reached the emitted inventory.`,
    );
  }
  return "p:sp";
}

function paintSnapshot(paint: string): Readonly<Record<string, string>> {
  return paint === "none"
    ? { kind: "none" }
    : { kind: "solid", srgbColor: paint.slice(1).toUpperCase() };
}

function lineSnapshot(
  style: Vector180ResolvedStyle,
): Readonly<Record<string, unknown>> {
  return {
    widthEmu: exactScaled(style.strokeWidth, EMU_PER_UNIT),
    paint: paintSnapshot(style.stroke),
  };
}

function paragraphMargins(
  anchor: "start" | "middle" | "end",
  relativeX: number,
  frameWidth: number,
): { readonly left: number; readonly right: number } {
  if (anchor === "start") return { left: relativeX, right: 0 };
  if (anchor === "end") return { left: 0, right: frameWidth - relativeX };
  const halfSpan = Math.min(relativeX, frameWidth - relativeX);
  return {
    left: relativeX - halfSpan,
    right: frameWidth - relativeX - halfSpan,
  };
}

function exactScaled(value: number, factor: number): number {
  const result = scaleOoxmlInteger(value, factor);
  if (result === undefined) {
    baselineFail(
      "VECTOR180-BASELINE-MAP",
      `Resolved value ${String(value)} does not map exactly by factor ${factor}.`,
    );
  }
  return result;
}

function sortedRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareText(left, right)),
  );
}

function sourceMapAttributes(
  node: Vector180Node,
): Readonly<Record<string, string>> {
  if (node.resource === undefined) return sortedRecord(node.attributes);
  return sortedRecord(
    Object.fromEntries(
      Object.entries(node.attributes).filter(([name]) => {
        const normalized = name.toLowerCase();
        return normalized !== "href" && normalized !== "xlink:href";
      }),
    ),
  );
}

function canonicalPlacement(placement: Vector180Placement): string {
  return JSON.stringify([
    placement.slideId,
    placement.policy,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  ]);
}

function rethrowCanaryError(error: PptxCanaryCompileError): never {
  if (error.code === "VECTOR180-PPTX-ID-COLLISION") {
    return baselineFail("VECTOR180-BASELINE-IDENTITY", error.message);
  }
  if (
    error.code === "VECTOR180-PPTX-OPC-GRAPH" ||
    error.code === "VECTOR180-PPTX-ZIP-LIMIT"
  ) {
    return baselineFail("VECTOR180-BASELINE-OPC", error.message);
  }
  if (
    error.code === "VECTOR180-PPTX-UNRESOLVED" ||
    error.code === "VECTOR180-PPTX-INVALID-MODEL"
  ) {
    return baselineFail("VECTOR180-BASELINE-INVALID-SOURCE", error.message);
  }
  return baselineFail("VECTOR180-BASELINE-UNSUPPORTED", error.message);
}

function visitSourceNodes(
  nodes: readonly Vector180Node[],
  visitor: (node: Vector180Node) => void,
): void {
  for (const node of nodes) {
    visitor(node);
    visitSourceNodes(node.children, visitor);
  }
}

function visitAtomObjects(
  objects: readonly Vector180ResolvedAtomObject[],
  visitor: (object: Vector180ResolvedAtomObject) => void,
): void {
  for (const object of objects) {
    visitor(object);
    if (object.kind === "group") visitAtomObjects(object.children, visitor);
  }
}

interface ExactDecimal {
  readonly coefficient: bigint;
  readonly exponent: number;
}

function exactDecimalProductsEqual(
  leftA: number,
  leftB: number,
  rightA: number,
  rightB: number,
): boolean {
  const left = multiplyExactDecimals(exactDecimal(leftA), exactDecimal(leftB));
  const right = multiplyExactDecimals(
    exactDecimal(rightA),
    exactDecimal(rightB),
  );
  return (
    left.coefficient === right.coefficient && left.exponent === right.exponent
  );
}

function exactDecimal(value: number): ExactDecimal {
  if (!Number.isFinite(value)) {
    return baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      "Placement decimal values must be finite.",
    );
  }
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/iu.exec(
    String(value),
  );
  if (match === null) {
    return baselineFail(
      "VECTOR180-BASELINE-PLACEMENT",
      `Placement value ${String(value)} has no canonical bounded decimal form.`,
    );
  }
  const fraction = match[3] ?? "";
  const sign = match[1] === "-" ? -1n : 1n;
  const coefficient = sign * BigInt(`${match[2]}${fraction}`);
  const exponent = Number(match[4] ?? "0") - fraction.length;
  return normalizeExactDecimal({ coefficient, exponent });
}

function multiplyExactDecimals(
  left: ExactDecimal,
  right: ExactDecimal,
): ExactDecimal {
  return normalizeExactDecimal({
    coefficient: left.coefficient * right.coefficient,
    exponent: left.exponent + right.exponent,
  });
}

function normalizeExactDecimal(value: ExactDecimal): ExactDecimal {
  if (value.coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  let coefficient = value.coefficient;
  let exponent = value.exponent;
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent += 1;
  }
  return { coefficient, exponent };
}

function cleanNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "error" || diagnostic.severity === "fatal";
}

function isUnsupportedDiagnostic(diagnostic: Diagnostic): boolean {
  return UNSUPPORTED_DIAGNOSTIC_CODES.has(diagnostic.code);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Vector180 map values must be finite JSON numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => {
          if (child === undefined) {
            throw new TypeError(`Vector180 map field "${key}" is undefined.`);
          }
          return [key, canonicalJsonValue(child)];
        }),
    );
  }
  throw new TypeError(`Vector180 map contains non-JSON ${typeof value} data.`);
}

function baselineFail(
  code: Vector180PptxBaselineErrorCode,
  message: string,
): never {
  throw new Vector180PptxBaselineCompileError(code, message);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled resolved object: ${String(value)}`);
}
