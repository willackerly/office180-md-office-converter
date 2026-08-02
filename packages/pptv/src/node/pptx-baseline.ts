/**
 * Strict standalone PPTV atom to editable PPTX baseline compiler.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import JSZip from "jszip";

import { loadDeck } from "../core/deck.js";
import { STABLE_ID_PATTERN } from "../core/manifest.js";
import {
  resolvePptvDeck,
  resolvePptvDiagram,
  type PptvBounds,
  type PptvPoint,
  type PptvResolvedDeck,
  type PptvResolvedDiagram,
  type PptvResolvedDiagramObject,
  type PptvResolvedObject,
  type PptvResolvedStyle,
} from "../core/resolved.js";
import type {
  Diagnostic,
  PptvDeck,
  PptvDiagram,
  PptvNode,
  SourceRange,
} from "../core/types.js";
import {
  compilePptxCanaryWithLineage,
  PptxCanaryCompileError,
} from "./pptx-canary.js";

const COMPILER = "office180-pptv-pptx-baseline/0.1" as const;
const MAP_SCHEMA = "pptv-pptx-map/0.1" as const;
const SLIDE_WIDTH = 1600;
const SLIDE_HEIGHT = 900;
const EMU_PER_UNIT = 7_620;
const HUNDREDTH_POINTS_PER_UNIT = 60;
const MAX_SIGNED_INT_31 = 0x7fffffff;
const RUNTIME_URL = new URL(
  "../../assets/pptv-browser-0.1.script.html",
  import.meta.url,
);
const COMPOSITION_EXTENSION = "office180.c9Composition";
const COMPOSITION_SCHEMA = "pptv-c9-composition/0.1";
const UNSUPPORTED_DIAGNOSTIC_CODES = new Set([
  "PPTV-DIAGRAM-STYLE",
  "PPTV-SECURITY-URL",
  "PPTV-SVG-UNSUPPORTED-NATIVE",
  "PPTV-PROFILE-ASSET-BOUNDS",
  "PPTV-PROFILE-CSS-PROPERTY",
  "PPTV-PROFILE-DIAGRAM-STYLE",
  "PPTV-PROFILE-FONT",
  "PPTV-PROFILE-OBJECT-KIND",
  "PPTV-PROFILE-RESOURCE",
  "PPTV-PROFILE-TEXT-LINES",
  "PPTV-PROFILE-TRANSFORM",
]);

export type PptvPptxBaselineErrorCode =
  | "PPTV-BASELINE-INVALID-SOURCE"
  | "PPTV-BASELINE-PLACEMENT-REQUIRED"
  | "PPTV-BASELINE-PLACEMENT"
  | "PPTV-BASELINE-ASPECT"
  | "PPTV-BASELINE-UNSUPPORTED"
  | "PPTV-BASELINE-IDENTITY"
  | "PPTV-BASELINE-MAP"
  | "PPTV-BASELINE-OPC"
  | "PPTV-BASELINE-EXISTS";

export class PptvPptxBaselineCompileError extends Error {
  readonly code: PptvPptxBaselineErrorCode;

  constructor(code: PptvPptxBaselineErrorCode, message: string) {
    super(message);
    this.name = "PptvPptxBaselineCompileError";
    this.code = code;
  }
}

export interface PptvPlacement {
  readonly slideId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: "identity" | "uniform-scale-translate";
}

export interface PptvPptxMapObjectSnapshot {
  readonly kind: PptvResolvedDiagramObject["kind"];
  readonly localBounds: PptvBounds;
  readonly worldBounds: PptvBounds;
  readonly worldOffset: PptvPoint;
  readonly style: Readonly<Record<string, string | number>>;
  readonly geometry: Readonly<Record<string, unknown>>;
}

export interface PptvPptxMapObject {
  readonly id: string;
  readonly kind: PptvResolvedDiagramObject["kind"];
  readonly parentId: string | null;
  readonly order: number;
  readonly source: {
    readonly element: string;
    readonly role: PptvNode["role"];
    readonly exportMode: "native";
    readonly parentId: string | null;
    readonly order: number;
    readonly attributes: Readonly<Record<string, string>>;
    readonly text?: string;
    readonly sourceRange: SourceRange;
  };
  readonly resolved: PptvPptxMapObjectSnapshot;
  readonly composed: PptvPptxMapObjectSnapshot;
  readonly composition: {
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
  };
  readonly emitted: {
    readonly partName: string;
    readonly element: "p:sp" | "p:cxnSp" | "p:grpSp";
    readonly cNvPrName: string;
    readonly cNvPrNumericId: number;
    readonly drawingMl: Readonly<Record<string, unknown>>;
  };
  readonly capability: {
    readonly classification: "native";
    readonly exportMode: "native";
    readonly compilerCapability: "c9-native-primitive/0.1";
  };
}

export interface PptvPptxMapSlide {
  readonly id: string;
  readonly order: number;
  readonly partName: string;
  readonly presentationRelationshipId: string;
  readonly presentationNumericId: number;
  readonly objects: readonly PptvPptxMapObject[];
}

export interface PptvPptxMap {
  readonly schema: typeof MAP_SCHEMA;
  readonly source: {
    readonly kind: "diagram";
    readonly id: string;
    readonly sha256: string;
    readonly profile: "0.1";
  };
  readonly composition: {
    readonly placement: PptvPlacement;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
    readonly composedDeckSha256: string;
  };
  readonly compiler: typeof COMPILER;
  /** Records the standalone C6 projection before one-slide composition. */
  readonly sourceResolvedSchema: "pptv-resolved-diagram/0.1";
  readonly resolvedSchema: "pptv-resolved/0.1";
  readonly pptx: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly partNames: readonly string[];
  };
  readonly slides: readonly PptvPptxMapSlide[];
}

export interface PptvPptxBaselineArtifact {
  readonly pptxBytes: Uint8Array;
  readonly pptxSha256: string;
  readonly map: PptvPptxMap;
  /** Canonical UTF-8 sidecar serialization, including one trailing newline. */
  readonly mapText: string;
  readonly mapSha256: string;
  readonly composedDeckSource?: string;
  readonly composedDeckSha256?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface PptvPptxBaselineOptions {
  readonly placement?: PptvPlacement;
}

export interface PptvDiagramCompositionArtifact {
  /** Deterministic, self-contained C4 deck source with one trailing newline. */
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly sourceResolved: PptvResolvedDiagram;
  readonly resolved: PptvResolvedDeck;
  readonly placement: PptvPlacement;
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
export async function composePptvDiagramDeck(
  source: PptvDiagram,
  placementInput: PptvPlacement,
): Promise<PptvDiagramCompositionArtifact> {
  if (source.sourceKind !== "svg") {
    baselineFail(
      "PPTV-BASELINE-UNSUPPORTED",
      "Composition accepts one standalone .pptv.svg atom only.",
    );
  }
  const transform = validatePlacement(source, placementInput);
  validateSourceCapability(source);
  const sourceResolution = resolvePptvDiagram(source);
  if (
    sourceResolution.model === undefined ||
    sourceResolution.diagnostics.some(isErrorDiagnostic)
  ) {
    const errors = sourceResolution.diagnostics.filter(isErrorDiagnostic);
    const codes = errors.map((diagnostic) => diagnostic.code).join(", ");
    baselineFail(
      errors.some(isUnsupportedDiagnostic)
        ? "PPTV-BASELINE-UNSUPPORTED"
        : "PPTV-BASELINE-INVALID-SOURCE",
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
    name: `${placementInput.slideId}.pptv.html`,
  });
  const resolved = resolvePptvDeck(deck);
  if (
    resolved.model === undefined ||
    resolved.diagnostics.some(isErrorDiagnostic)
  ) {
    const errors = resolved.diagnostics.filter(isErrorDiagnostic);
    baselineFail(
      "PPTV-BASELINE-INVALID-SOURCE",
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
          diagnostic.code !== "PPTV-MANIFEST-UNSUPPORTED-EXTENSION",
      ),
    ),
  });
}

/**
 * Bounded C9 baseline: one standalone diagram, one explicit identity or
 * uniform-scale-and-translate placement, and native C7 primitives only.
 */
export async function compilePptxBaseline(
  source: PptvDeck | PptvDiagram,
  options: PptvPptxBaselineOptions = {},
): Promise<PptvPptxBaselineArtifact> {
  if (source.sourceKind !== "svg") {
    baselineFail(
      "PPTV-BASELINE-UNSUPPORTED",
      "The bounded C9 baseline accepts a standalone .pptv.svg atom only; use pptx-canary for the current deck canary.",
    );
  }
  if (options.placement === undefined) {
    baselineFail(
      "PPTV-BASELINE-PLACEMENT-REQUIRED",
      "A standalone diagram requires an explicit target placement.",
    );
  }

  const composition = await composePptvDiagramDeck(source, options.placement);
  const {
    placement,
    scale,
    translateX,
    translateY,
    sourceResolved,
    resolved: composed,
  } = composition;
  const packageOptions = {
    compiler: COMPILER,
    coreTitle: `PPTV baseline: ${source.id}`,
    customProperties: {
      "pptv.mapSchema": MAP_SCHEMA,
      "pptv.placement": canonicalPlacement(placement),
      "pptv.atomSha256": source.source.sha256,
      "pptv.sourceId": source.id,
      "pptv.sourceKind": "diagram",
      "pptv.sourceResolvedSchema": sourceResolved.schema,
    },
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

  const pptxSha256 = sha256(canary.bytes);
  const objectMap = buildObjectMap(
    source,
    sourceResolved,
    composed.slides[0]!.objects,
    scale,
    translateX,
    translateY,
  );
  const map: PptvPptxMap = {
    schema: MAP_SCHEMA,
    source: {
      kind: "diagram",
      id: source.id,
      sha256: source.source.sha256,
      profile: "0.1",
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
      partNames: [...canary.partNames],
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
  const mapText = serializePptvPptxMap(frozenMap);
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

/**
 * Canonical C9 sidecar serialization. Object keys are recursively sorted;
 * array order remains semantic slide/painter order.
 */
export function serializePptvPptxMap(map: PptvPptxMap): string {
  return `${JSON.stringify(canonicalJsonValue(map), null, 2)}\n`;
}

interface ValidatedPlacement {
  readonly placement: PptvPlacement;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

function validatePlacement(
  diagram: PptvDiagram,
  placement: PptvPlacement,
): ValidatedPlacement {
  if (!STABLE_ID_PATTERN.test(placement.slideId)) {
    baselineFail(
      "PPTV-BASELINE-PLACEMENT",
      `Placement slide ID "${placement.slideId}" is not a stable PPTV ID.`,
    );
  }
  if (
    placement.policy !== "identity" &&
    placement.policy !== "uniform-scale-translate"
  ) {
    baselineFail(
      "PPTV-BASELINE-PLACEMENT",
      `Unknown placement policy "${String(placement.policy)}".`,
    );
  }
  const values = [placement.x, placement.y, placement.width, placement.height];
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) || !Number.isSafeInteger(value * EMU_PER_UNIT),
    ) ||
    placement.x < 0 ||
    placement.y < 0 ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    placement.x + placement.width > SLIDE_WIDTH ||
    placement.y + placement.height > SLIDE_HEIGHT
  ) {
    baselineFail(
      "PPTV-BASELINE-PLACEMENT",
      "Placement must be finite, positive, exact in C7 EMUs, and contained by the 1600 × 900 slide.",
    );
  }
  const [, , sourceWidth, sourceHeight] = diagram.viewBox;
  let scale: number;
  if (placement.policy === "identity") {
    if (placement.width !== sourceWidth || placement.height !== sourceHeight) {
      baselineFail(
        "PPTV-BASELINE-PLACEMENT",
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
        "PPTV-BASELINE-ASPECT",
        `Uniform placement extent ${placement.width} × ${placement.height} does not exactly match source aspect ${sourceWidth} × ${sourceHeight}.`,
      );
    }
    scale = cleanNumber(placement.width / sourceWidth);
    if (!Number.isFinite(scale) || scale <= 0) {
      baselineFail(
        "PPTV-BASELINE-PLACEMENT",
        "Uniform placement scale must be finite and positive.",
      );
    }
  }
  const translateX = cleanNumber(placement.x - scale * diagram.viewBox[0]);
  const translateY = cleanNumber(placement.y - scale * diagram.viewBox[1]);
  if (!Number.isFinite(translateX) || !Number.isFinite(translateY)) {
    baselineFail(
      "PPTV-BASELINE-PLACEMENT",
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

function validateSourceCapability(diagram: PptvDiagram): void {
  const errors = diagram.diagnostics.filter(isErrorDiagnostic);
  if (errors.length > 0) {
    baselineFail(
      errors.some(isUnsupportedDiagnostic)
        ? "PPTV-BASELINE-UNSUPPORTED"
        : "PPTV-BASELINE-INVALID-SOURCE",
      "Standalone diagram contains C4 validation errors.",
    );
  }
  visitSourceNodes(diagram.children, (node) => {
    if (node.exportMode !== "native") {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Object "${node.id}" requests data-pptv-export="${node.exportMode}"; the bounded C9 slice admits native objects only.`,
      );
    }
    if (node.opaque) {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Opaque object "${node.id}" is outside the bounded C9 native subset.`,
      );
    }
  });
}

function validateResolvedCapability(model: PptvResolvedDiagram): void {
  const [originX, originY, width, height] = model.canvas.viewBox;
  const maxX = originX + width;
  const maxY = originY + height;
  visitDiagramObjects(model.objects, (object) => {
    if (object.kind === "svg-asset" || object.kind === "raster-asset") {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Asset object "${object.id}" is outside the bounded C9 native subset.`,
      );
    }
    if (
      object.kind === "rect" &&
      (object.rx !== undefined || object.ry !== undefined)
    ) {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Rounded rectangle "${object.id}" is outside the bounded C9 native subset.`,
      );
    }
    if (object.kind === "text" && object.lines.length !== 1) {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Text "${object.id}" has ${object.lines.length} hard lines; the bounded C9 slice accepts exactly one.`,
      );
    }
    if (object.style.opacity !== 1) {
      baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
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
        "PPTV-BASELINE-UNSUPPORTED",
        `Object "${object.id}" crosses the source viewBox; C9 does not silently drop SVG clipping semantics.`,
      );
    }
  });
}

function renderComposedDeck(
  source: PptvDiagram,
  diagram: PptvResolvedDiagram,
  transform: ValidatedPlacement,
  runtime: string,
): string {
  const sourceNodes = new Map<string, { node: PptvNode; order: number }>();
  indexSourceNodes(source.children, sourceNodes);
  const manifest = {
    extensions: {
      [COMPOSITION_EXTENSION]: {
        placement: transform.placement,
        schema: COMPOSITION_SCHEMA,
        source: {
          id: source.id,
          kind: "diagram",
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
    pptv: "0.1",
    runtime: "pptv-browser/0.1",
    slides: [transform.placement.slideId],
    theme: "diagram-local",
    title: `PPTV composition: ${source.id}`,
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
    '<html lang="en" data-pptv-version="0.1">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${htmlText(`PPTV composition: ${source.id}`)}</title>`,
    "</head>",
    "<body>",
    "",
    '<script id="pptv-manifest" type="application/pptv+json">',
    manifestText,
    "</script>",
    "",
    "<main data-pptv-output></main>",
    "",
    `<template data-pptv-slide="${htmlAttribute(transform.placement.slideId)}">`,
    `  <svg id="${htmlAttribute(transform.placement.slideId)}" viewBox="0 0 1600 900" data-pptv-layout="diagram" xmlns="http://www.w3.org/2000/svg">`,
    renderedObjects,
    "  </svg>",
    "</template>",
    "",
    '<script type="text/css" data-pptv-style="base">',
    "</script>",
    "",
    '<script type="text/css" data-pptv-theme="diagram-local">',
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
  object: PptvResolvedDiagramObject,
  sourceNodes: ReadonlyMap<string, { node: PptvNode; order: number }>,
  transform: ValidatedPlacement,
  topLevel: boolean,
  indentSize: number,
): string {
  const sourceEntry = sourceNodes.get(object.id);
  if (sourceEntry === undefined || sourceEntry.node.exportMode !== "native") {
    return baselineFail(
      "PPTV-BASELINE-IDENTITY",
      `Object "${object.id}" lacks one native source identity during composition.`,
    );
  }
  const indent = " ".repeat(indentSize);
  const common = [
    ["id", object.id],
    ["data-pptv-role", sourceEntry.node.role],
    ["data-pptv-export", "native"],
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
            : ([["data-pptv-from", object.fromId]] as Array<[string, string]>)),
          ...(object.toId === undefined
            ? []
            : ([["data-pptv-to", object.toId]] as Array<[string, string]>)),
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
          "PPTV-BASELINE-UNSUPPORTED",
          `Text "${object.id}" must contain exactly one hard line.`,
        );
      }
      const attributes = [
        ...common,
        [
          "data-pptv-frame",
          [
            x(object.frame.x),
            y(object.frame.y),
            length(object.frame.width),
            length(object.frame.height),
          ].join(" "),
        ],
        ["data-pptv-line-step", length(object.lineStep)],
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
    case "raster-asset":
      return baselineFail(
        "PPTV-BASELINE-UNSUPPORTED",
        `Asset object "${object.id}" cannot be composed in the C9 native subset.`,
      );
    default:
      return assertNever(object);
  }
}

function composedStyleAttributes(
  style: PptvResolvedStyle,
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
      "PPTV-BASELINE-PLACEMENT",
      "Composition produced a non-finite numeric value.",
    );
  }
  return String(cleanNumber(value));
}

function validateComposedInventory(
  source: PptvResolvedDiagram,
  composed: PptvResolvedDeck,
  transform: ValidatedPlacement,
): void {
  const slide = composed.slides[0];
  if (
    composed.slides.length !== 1 ||
    slide === undefined ||
    slide.id !== transform.placement.slideId
  ) {
    baselineFail(
      "PPTV-BASELINE-IDENTITY",
      "Generated composition did not retain its one explicit slide identity.",
    );
  }
  const sourceObjects = flattenDiagramObjects(source.objects);
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
      "PPTV-BASELINE-IDENTITY",
      "Generated composition changed stable identity, kind, hierarchy, or painter order.",
    );
  }
}

function buildObjectMap(
  source: PptvDiagram,
  resolved: PptvResolvedDiagram,
  composedObjects: readonly PptvResolvedObject[],
  scale: number,
  translateX: number,
  translateY: number,
): readonly PptvPptxMapObject[] {
  const sourceNodes = new Map<string, { node: PptvNode; order: number }>();
  indexSourceNodes(source.children, sourceNodes);
  const composed = indexObjects(composedObjects);
  const resolvedObjects = flattenDiagramObjects(resolved.objects);
  if (
    sourceNodes.size !== resolvedObjects.length ||
    composed.size !== resolvedObjects.length
  ) {
    baselineFail(
      "PPTV-BASELINE-MAP",
      "Source, resolved, and emitted object inventories are not one-to-one.",
    );
  }

  const numericIds = allocateObjectNumericIds(
    resolvedObjects.map((object) => object.id),
  );
  return Object.freeze(
    resolvedObjects.map((object): PptvPptxMapObject => {
      const sourceEntry = sourceNodes.get(object.id);
      const composedObject = composed.get(object.id);
      const numericId = numericIds.get(object.id);
      if (
        sourceEntry === undefined ||
        composedObject === undefined ||
        numericId === undefined ||
        sourceEntry.node.exportMode !== "native"
      ) {
        baselineFail(
          "PPTV-BASELINE-MAP",
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
          "PPTV-BASELINE-MAP",
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
          exportMode: "native",
          parentId: sourceEntry.node.parentId,
          order: sourceEntry.order,
          attributes: sortedRecord(sourceEntry.node.attributes),
          ...(sourceEntry.node.text === undefined
            ? {}
            : { text: sourceEntry.node.text }),
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
          drawingMl: drawingMlSnapshot(composedObject),
        },
        capability: {
          classification: "native",
          exportMode: "native",
          compilerCapability: "c9-native-primitive/0.1",
        },
      };
    }),
  );
}

function snapshotObject(
  object: PptvResolvedDiagramObject | PptvResolvedObject,
): PptvPptxMapObjectSnapshot {
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
  style: PptvResolvedStyle,
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
  object: PptvResolvedDiagramObject | PptvResolvedObject,
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
      return { resourceRef: object.resourceRef };
    default:
      return assertNever(object);
  }
}

function drawingMlSnapshot(
  object: PptvResolvedObject,
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
          "PPTV-BASELINE-MAP",
          `Text "${object.id}" lacks its admitted single-line font values.`,
        );
      }
      const frameX = numeric(object.frame.x);
      const frameWidth = numeric(object.frame.width);
      const anchorX = numeric(line.x);
      const margins = paragraphMargins(
        object.anchor,
        anchorX - frameX,
        frameWidth,
      );
      return {
        presetGeometry: "rect",
        transform: {
          offXEmu: frameX,
          offYEmu: numeric(object.frame.y),
          extCxEmu: frameWidth,
          extCyEmu: numeric(object.frame.height),
        },
        frameFill: { kind: "none" },
        frameLine: { kind: "none" },
        body: {
          wrap: "none",
          autofit: "none",
          marginsEmu: { left: 0, top: 0, right: 0, bottom: 0 },
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
    case "raster-asset":
      return baselineFail(
        "PPTV-BASELINE-MAP",
        `Unsupported asset "${object.id}" reached DrawingML mapping.`,
      );
    default:
      return assertNever(object);
  }
}

async function validateMapAgainstPackage(
  map: PptvPptxMap,
  bytes: Uint8Array,
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    baselineFail(
      "PPTV-BASELINE-OPC",
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
  if (
    slideXml === undefined ||
    presentationXml === undefined ||
    presentationRels === undefined
  ) {
    baselineFail(
      "PPTV-BASELINE-OPC",
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
      "PPTV-BASELINE-MAP",
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
      "PPTV-BASELINE-MAP",
      "The mapped slide part, relationship ID, and presentation order do not agree.",
    );
  }
}

function indexSourceNodes(
  nodes: readonly PptvNode[],
  result: Map<string, { node: PptvNode; order: number }>,
): void {
  for (const [order, node] of nodes.entries()) {
    if (result.has(node.id)) {
      baselineFail(
        "PPTV-BASELINE-IDENTITY",
        `Duplicate stable object ID "${node.id}".`,
      );
    }
    result.set(node.id, { node, order });
    indexSourceNodes(node.children, result);
  }
}

function indexObjects(
  objects: readonly PptvResolvedObject[],
): ReadonlyMap<string, PptvResolvedObject> {
  const result = new Map<string, PptvResolvedObject>();
  const visit = (siblings: readonly PptvResolvedObject[]): void => {
    for (const object of siblings) {
      if (result.has(object.id)) {
        baselineFail(
          "PPTV-BASELINE-IDENTITY",
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

function flattenDiagramObjects(
  objects: readonly PptvResolvedDiagramObject[],
): readonly PptvResolvedDiagramObject[] {
  const result: PptvResolvedDiagramObject[] = [];
  const visit = (siblings: readonly PptvResolvedDiagramObject[]): void => {
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
        "PPTV-BASELINE-IDENTITY",
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
  kind: PptvResolvedDiagramObject["kind"],
): "p:sp" | "p:cxnSp" | "p:grpSp" {
  if (kind === "line") return "p:cxnSp";
  if (kind === "group") return "p:grpSp";
  if (kind === "svg-asset" || kind === "raster-asset") {
    return baselineFail(
      "PPTV-BASELINE-MAP",
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
  style: PptvResolvedStyle,
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
  const result = value * factor;
  if (!Number.isSafeInteger(result)) {
    baselineFail(
      "PPTV-BASELINE-MAP",
      `Resolved value ${String(value)} does not map exactly by factor ${factor}.`,
    );
  }
  return Object.is(result, -0) ? 0 : result;
}

function sortedRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareText(left, right)),
  );
}

function canonicalPlacement(placement: PptvPlacement): string {
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
  if (error.code === "PPTV-PPTX-ID-COLLISION") {
    return baselineFail("PPTV-BASELINE-IDENTITY", error.message);
  }
  if (
    error.code === "PPTV-PPTX-OPC-GRAPH" ||
    error.code === "PPTV-PPTX-ZIP-LIMIT"
  ) {
    return baselineFail("PPTV-BASELINE-OPC", error.message);
  }
  if (
    error.code === "PPTV-PPTX-UNRESOLVED" ||
    error.code === "PPTV-PPTX-INVALID-MODEL"
  ) {
    return baselineFail("PPTV-BASELINE-INVALID-SOURCE", error.message);
  }
  return baselineFail("PPTV-BASELINE-UNSUPPORTED", error.message);
}

function visitSourceNodes(
  nodes: readonly PptvNode[],
  visitor: (node: PptvNode) => void,
): void {
  for (const node of nodes) {
    visitor(node);
    visitSourceNodes(node.children, visitor);
  }
}

function visitDiagramObjects(
  objects: readonly PptvResolvedDiagramObject[],
  visitor: (object: PptvResolvedDiagramObject) => void,
): void {
  for (const object of objects) {
    visitor(object);
    if (object.kind === "group") visitDiagramObjects(object.children, visitor);
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
      "PPTV-BASELINE-PLACEMENT",
      "Placement decimal values must be finite.",
    );
  }
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/iu.exec(
    String(value),
  );
  if (match === null) {
    return baselineFail(
      "PPTV-BASELINE-PLACEMENT",
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
      throw new TypeError("PPTV map values must be finite JSON numbers.");
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
            throw new TypeError(`PPTV map field "${key}" is undefined.`);
          }
          return [key, canonicalJsonValue(child)];
        }),
    );
  }
  throw new TypeError(`PPTV map contains non-JSON ${typeof value} data.`);
}

function baselineFail(code: PptvPptxBaselineErrorCode, message: string): never {
  throw new PptvPptxBaselineCompileError(code, message);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled resolved object: ${String(value)}`);
}
