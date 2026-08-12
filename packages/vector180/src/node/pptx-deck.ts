/**
 * Strict canonical Vector180 HTML deck to editable mapped PPTX compiler.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1
 */

import JSZip from "jszip";

import { loadDeck, Vector180LoadError } from "../core/deck.js";
import { parseVector180InlinePngDataUri } from "../core/inline-png.js";
import {
  resolveVector180Deck,
  type Vector180Bounds,
  type Vector180Point,
  type Vector180ResolvedDeck,
  type Vector180ResolvedObject,
  type Vector180ResolvedStyle,
} from "../core/resolved.js";
import { sha256HexSync } from "../core/source.js";
import type {
  Diagnostic,
  SourceRange,
  Vector180Deck,
  Vector180InlinePngResourceDescriptor,
  Vector180Node,
} from "../core/types.js";
import {
  compilePptxCanaryWithLineage,
  describePptxCanaryBindings,
  PptxCanaryCompileError,
  type PptxCanaryObjectBinding,
  type PptxCanaryRasterResource,
  type PptxCanaryRelationship,
  type PptxCanarySlideBinding,
} from "./pptx-canary.js";

const COMPILER = "office180-vector180-pptx-deck/0.1" as const;
const MAP_SCHEMA = "vector180-pptx-deck-map/0.1" as const;
const RESULT_SCHEMA = "vector180-pptx-deck-result/0.1" as const;
const RESOLVED_SCHEMA = "vector180-resolved-deck/0.1" as const;
const SLIDE_WIDTH = 1600;
const SLIDE_HEIGHT = 900;
const UNSUPPORTED_DIAGNOSTIC_CODES = new Set([
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

export type Vector180PptxDeckErrorCode =
  | "VECTOR180-DECK-PPTX-INVALID-SOURCE"
  | "VECTOR180-DECK-PPTX-FAMILY"
  | "VECTOR180-DECK-PPTX-UNSUPPORTED"
  | "VECTOR180-DECK-PPTX-IDENTITY"
  | "VECTOR180-DECK-PPTX-MAP"
  | "VECTOR180-DECK-PPTX-OPC"
  | "VECTOR180-DECK-PPTX-EXISTS"
  | "VECTOR180-DECK-PPTX-PUBLISH";

export class Vector180PptxDeckCompileError extends Error {
  readonly code: Vector180PptxDeckErrorCode;

  constructor(code: Vector180PptxDeckErrorCode, message: string) {
    super(message);
    this.name = "Vector180PptxDeckCompileError";
    this.code = code;
  }
}

export interface Vector180PptxDeckMapObjectSnapshot {
  readonly kind: Vector180ResolvedObject["kind"];
  readonly localBounds: Vector180Bounds;
  readonly worldBounds: Vector180Bounds;
  readonly worldOffset: Vector180Point;
  readonly style: Readonly<Record<string, string | number>>;
  readonly geometry: Readonly<Record<string, unknown>>;
}

export interface Vector180PptxDeckMapObject {
  readonly id: string;
  readonly kind: Vector180ResolvedObject["kind"];
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
  readonly resolved: Vector180PptxDeckMapObjectSnapshot;
  readonly emitted: {
    readonly partName: string;
    readonly element: PptxCanaryObjectBinding["element"];
    readonly cNvPrName: string;
    readonly cNvPrNumericId: number;
    readonly imageRelationship?: {
      readonly relationshipId: string;
      readonly partName: string;
    };
  };
  readonly capability: {
    readonly classification: "native" | "atomic-raster";
    readonly exportMode: "native" | "raster";
    readonly compilerCapability:
      "deck-native-primitive/0.1" | "deck-static-png-picture/0.1";
  };
}

export interface Vector180PptxDeckMapSlide {
  readonly id: string;
  readonly order: number;
  readonly hidden: boolean;
  readonly layout?: string;
  readonly sourceRange: SourceRange;
  readonly partName: string;
  readonly presentationRelationshipId: string;
  readonly presentationNumericId: number;
  readonly layoutRelationship: {
    readonly relationshipId: "rId1";
    readonly partName: "ppt/slideLayouts/slideLayout1.xml";
  };
  readonly objects: readonly Vector180PptxDeckMapObject[];
}

export interface Vector180PptxDeckMap {
  readonly schema: typeof MAP_SCHEMA;
  readonly source: {
    readonly family: "vector180";
    readonly kind: "deck";
    readonly sha256: string;
    readonly byteLength: number;
    readonly profile: "0.1";
    readonly title?: string;
    readonly activeTheme: string;
    readonly slideOrder: readonly string[];
  };
  readonly compiler: typeof COMPILER;
  readonly sourceResolvedSchema: typeof RESOLVED_SCHEMA;
  readonly pptx: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly partNames: readonly string[];
    readonly relationships: readonly PptxCanaryRelationship[];
  };
  readonly slides: readonly Vector180PptxDeckMapSlide[];
}

export interface Vector180PptxDeckArtifact {
  readonly schema: typeof RESULT_SCHEMA;
  readonly pptxBytes: Uint8Array;
  readonly pptxSha256: string;
  readonly map: Vector180PptxDeckMap;
  /** Canonical UTF-8 sidecar serialization, including one trailing newline. */
  readonly mapText: string;
  readonly mapSha256: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Compile one complete canonical HTML deck. This function is pure with
 * respect to host state: it reads no files, fetches no resources, and writes
 * no destinations. Exact inline PNG bytes come only from retained source.
 */
export async function compileVector180PptxDeck(
  deck: Vector180Deck,
): Promise<Vector180PptxDeckArtifact> {
  const sourceDeck = await authenticateSourceDeck(deck);
  const resolution = resolveVector180Deck(sourceDeck);
  if (
    resolution.model === undefined ||
    resolution.diagnostics.some(isErrorDiagnostic)
  ) {
    const errors = resolution.diagnostics.filter(isErrorDiagnostic);
    deckFail(
      errors.some(isUnsupportedDiagnostic)
        ? "VECTOR180-DECK-PPTX-UNSUPPORTED"
        : "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      `Deck did not produce a complete C6 model${errors.length === 0 ? "" : ` (${errors.map((diagnostic) => diagnostic.code).join(", ")})`}.`,
    );
  }
  const model = resolution.model;
  validateResolvedCapability(model);
  validateDeckInventory(sourceDeck, model);
  const rasterResources = collectRasterPackageResources(sourceDeck, model);
  let packageArtifact;
  try {
    packageArtifact = await compilePptxCanaryWithLineage(model, {
      compiler: COMPILER,
      coreTitle: sourceDeck.title ?? "Vector180 mapped deck",
      customProperties: {
        "vector180.mapSchema": MAP_SCHEMA,
        "vector180.sourceKind": "deck",
        "vector180.sourceProfile": sourceDeck.version,
        "vector180.slideOrder": JSON.stringify(sourceDeck.slideOrder),
      },
      rasterResources,
    });
  } catch (error) {
    if (error instanceof PptxCanaryCompileError) rethrowCanaryError(error);
    throw error;
  }

  const bindings = describePptxCanaryBindings(model);
  const slides = buildSlideMap(sourceDeck, model, bindings);
  const map: Vector180PptxDeckMap = {
    schema: MAP_SCHEMA,
    source: {
      family: "vector180",
      kind: "deck",
      sha256: sourceDeck.source.sha256,
      byteLength: sourceDeck.source.byteLength,
      profile: "0.1",
      ...(sourceDeck.title === undefined ? {} : { title: sourceDeck.title }),
      activeTheme: model.activeTheme,
      slideOrder: Object.freeze([...sourceDeck.slideOrder]),
    },
    compiler: COMPILER,
    sourceResolvedSchema: RESOLVED_SCHEMA,
    pptx: {
      sha256: packageArtifact.sha256,
      byteLength: packageArtifact.bytes.byteLength,
      partNames: Object.freeze(packageArtifact.parts.map((part) => part.name)),
      relationships: Object.freeze(
        packageArtifact.relationships.map((relationship) =>
          Object.freeze({ ...relationship }),
        ),
      ),
    },
    slides,
  };
  await validateMapAgainstPackage(map, packageArtifact.bytes);
  const frozenMap = deepFreeze(map);
  const mapText = serializeVector180PptxDeckMap(frozenMap);
  return Object.freeze({
    schema: RESULT_SCHEMA,
    pptxBytes: packageArtifact.bytes,
    pptxSha256: packageArtifact.sha256,
    map: frozenMap,
    mapText,
    mapSha256: sha256HexSync(new TextEncoder().encode(mapText)),
    diagnostics: Object.freeze([...resolution.diagnostics]),
  });
}

/**
 * A `Vector180Deck` is a source-derived interpretation, not authority separate
 * from its retained bytes. Reconstruct the complete snapshot from those bytes
 * and refuse a caller-provided interpretation that disagrees. This prevents a
 * forged/spread object from producing output that claims the untouched source
 * hash while compiling altered nodes, styles, slide state, or source ranges.
 */
async function authenticateSourceDeck(
  deck: Vector180Deck,
): Promise<Vector180Deck> {
  validateSourceDeck(deck);
  let trusted: Vector180Deck;
  try {
    trusted = await loadDeck({
      kind: "bytes",
      bytes: deck.source.bytes,
      ...(deck.source.name === undefined ? {} : { name: deck.source.name }),
    });
  } catch (error) {
    if (!(error instanceof Vector180LoadError)) throw error;
    return deckFail(
      "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      "The retained exact source bytes could not be reconstructed as one canonical Vector180 HTML deck.",
    );
  }
  validateSourceDeck(trusted);
  if (
    trusted.source.sha256 !== deck.source.sha256 ||
    trusted.source.byteLength !== deck.source.byteLength ||
    trusted.source.charLength !== deck.source.charLength ||
    trusted.source.text !== deck.source.text ||
    compilerInputSnapshot(trusted) !== compilerInputSnapshot(deck)
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-IDENTITY",
      "The supplied deck interpretation does not match the canonical snapshot reconstructed from its exact retained source bytes.",
    );
  }
  return trusted;
}

export function serializeVector180PptxDeckMap(
  map: Vector180PptxDeckMap,
): string {
  return `${JSON.stringify(canonicalJsonValue(map), null, 2)}\n`;
}

function validateSourceDeck(deck: Vector180Deck): void {
  if (deck.sourceKind !== "html") {
    deckFail(
      "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      "Mapped deck compilation requires one canonical Vector180 HTML deck.",
    );
  }
  if (deck.wireFamily !== "vector180") {
    deckFail(
      "VECTOR180-DECK-PPTX-FAMILY",
      "Mapped deck compilation accepts only canonical Vector180 source; migrate legacy PPTV first.",
    );
  }
  const errors = deck.diagnostics.filter(isErrorDiagnostic);
  if (errors.length > 0) {
    deckFail(
      errors.some(isUnsupportedDiagnostic)
        ? "VECTOR180-DECK-PPTX-UNSUPPORTED"
        : "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      "Deck contains C4 validation errors.",
    );
  }
  if (
    !deck.materialization.complete ||
    deck.slides.size !== deck.slideOrder.length ||
    deck.slideOrder.length === 0 ||
    deck.slideOrder.some((id) => !deck.slides.has(id))
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-INVALID-SOURCE",
      "Mapped deck compilation requires the complete manifest-ordered deck, not a partial slide materialization.",
    );
  }
  for (const slideId of deck.slideOrder) {
    const slide = deck.slides.get(slideId)!;
    visitSourceNodes(slide.children, (node) => {
      const raster =
        node.elementName === "image" &&
        node.role === "asset" &&
        node.exportMode === "raster" &&
        node.opaque &&
        node.resource !== undefined;
      if (node.exportMode !== "native" && !raster) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Object "${node.id}" requests data-vector180-export="${node.exportMode}"; mapped decks admit native primitives or exact static inline PNG pictures.`,
        );
      }
      if (node.exportMode === "native" && node.opaque) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Opaque object "${node.id}" is outside the mapped deck native subset.`,
        );
      }
    });
  }
}

function validateResolvedCapability(model: Vector180ResolvedDeck): void {
  for (const slide of model.slides) {
    for (const object of flattenObjects(slide.objects)) {
      if (object.kind === "svg-asset") {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `SVG asset "${object.id}" is outside the mapped deck subset.`,
        );
      }
      if (
        object.kind === "rect" &&
        (object.rx !== undefined || object.ry !== undefined)
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Rounded rectangle "${object.id}" is outside the mapped deck subset.`,
        );
      }
      if (object.kind === "text" && object.lines.length !== 1) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Text "${object.id}" has ${object.lines.length} hard lines; mapped deck text currently accepts exactly one.`,
        );
      }
      if (object.style.opacity !== 1) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Object "${object.id}" opacity must be exactly 1.`,
        );
      }
      const bounds = object.worldBounds;
      if (
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > SLIDE_WIDTH ||
        bounds.y + bounds.height > SLIDE_HEIGHT
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Object "${object.id}" crosses its 1600 × 900 slide; the compiler does not silently drop SVG clipping semantics.`,
        );
      }
    }
  }
}

function validateDeckInventory(
  deck: Vector180Deck,
  model: Vector180ResolvedDeck,
): void {
  if (
    model.sourceSha256 !== deck.source.sha256 ||
    model.slides.length !== deck.slideOrder.length
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-IDENTITY",
      "Exact source, manifest order, and resolved slide inventory disagree.",
    );
  }
  for (const [order, slideId] of deck.slideOrder.entries()) {
    const sourceSlide = deck.slides.get(slideId);
    const resolvedSlide = model.slides[order];
    if (
      sourceSlide === undefined ||
      resolvedSlide === undefined ||
      resolvedSlide.id !== slideId ||
      resolvedSlide.order !== order ||
      resolvedSlide.hidden !== sourceSlide.hidden ||
      resolvedSlide.layout !== sourceSlide.layout
    ) {
      deckFail(
        "VECTOR180-DECK-PPTX-IDENTITY",
        `Slide "${slideId}" changed identity, order, visibility, or layout during resolution.`,
      );
    }
    const sourceNodes = indexSourceNodes(sourceSlide.children);
    const resolvedObjects = flattenObjects(resolvedSlide.objects);
    if (sourceNodes.size !== resolvedObjects.length) {
      deckFail(
        "VECTOR180-DECK-PPTX-IDENTITY",
        `Slide "${slideId}" source and resolved object inventories are not one-to-one.`,
      );
    }
    for (const object of resolvedObjects) {
      const source = sourceNodes.get(object.id);
      if (
        source === undefined ||
        source.node.parentId !== object.parentId ||
        source.order !== object.order
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-IDENTITY",
          `Object "${object.id}" changed stable identity, parent, or painter order during resolution.`,
        );
      }
    }
  }
}

function collectRasterPackageResources(
  deck: Vector180Deck,
  model: Vector180ResolvedDeck,
): readonly PptxCanaryRasterResource[] {
  const resources: PptxCanaryRasterResource[] = [];
  for (const slide of model.slides) {
    const sourceSlide = deck.slides.get(slide.id);
    if (sourceSlide === undefined) {
      deckFail(
        "VECTOR180-DECK-PPTX-IDENTITY",
        `Resolved slide "${slide.id}" lacks its exact source template.`,
      );
    }
    const sourceNodes = indexSourceNodes(sourceSlide.children);
    for (const object of flattenObjects(slide.objects)) {
      if (object.kind !== "raster-asset") continue;
      const sourceNode = sourceNodes.get(object.id)?.node;
      if (sourceNode === undefined || sourceNode.resource === undefined) {
        deckFail(
          "VECTOR180-DECK-PPTX-IDENTITY",
          `Raster asset "${object.id}" lacks one exact source identity.`,
        );
      }
      const parsed = parseVector180InlinePngDataUri(
        exactInlinePngHref(sourceNode),
      );
      if (
        !parsed.ok ||
        !sameRasterDescriptor(parsed.descriptor, sourceNode.resource) ||
        !sameRasterDescriptor(parsed.descriptor, object.resource)
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-UNSUPPORTED",
          `Raster asset "${object.id}" source, C4 descriptor, C6 descriptor, and package bytes disagree.`,
        );
      }
      resources.push(
        Object.freeze({
          slideId: slide.id,
          objectId: object.id,
          descriptor: object.resource,
          bytes: new Uint8Array(parsed.bytes),
        }),
      );
    }
  }
  return Object.freeze(resources);
}

function buildSlideMap(
  deck: Vector180Deck,
  model: Vector180ResolvedDeck,
  bindings: readonly PptxCanarySlideBinding[],
): readonly Vector180PptxDeckMapSlide[] {
  if (bindings.length !== model.slides.length) {
    deckFail(
      "VECTOR180-DECK-PPTX-MAP",
      "Resolved and emitted slide inventories are not one-to-one.",
    );
  }
  return Object.freeze(
    model.slides.map((slide, index): Vector180PptxDeckMapSlide => {
      const sourceSlide = deck.slides.get(slide.id);
      const binding = bindings[index];
      if (
        sourceSlide === undefined ||
        binding === undefined ||
        binding.id !== slide.id ||
        binding.order !== slide.order
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-MAP",
          `Slide "${slide.id}" lacks one exact source/resolved/emitted mapping.`,
        );
      }
      const sourceNodes = indexSourceNodes(sourceSlide.children);
      const resolvedObjects = flattenObjects(slide.objects);
      if (
        sourceNodes.size !== resolvedObjects.length ||
        binding.objects.length !== resolvedObjects.length
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-MAP",
          `Slide "${slide.id}" object inventories are not one-to-one.`,
        );
      }
      const objects = resolvedObjects.map(
        (object, objectIndex): Vector180PptxDeckMapObject => {
          const sourceEntry = sourceNodes.get(object.id);
          const emitted = binding.objects[objectIndex];
          const expectedExport =
            object.kind === "raster-asset" ? "raster" : "native";
          if (
            sourceEntry === undefined ||
            emitted === undefined ||
            emitted.id !== object.id ||
            sourceEntry.node.exportMode !== expectedExport ||
            sourceEntry.node.parentId !== object.parentId ||
            sourceEntry.order !== object.order
          ) {
            deckFail(
              "VECTOR180-DECK-PPTX-MAP",
              `Object "${object.id}" lacks one exact source/resolved/emitted mapping.`,
            );
          }
          const imageRelationship = emitted.imageRelationship;
          if (
            (object.kind === "raster-asset") !==
            (imageRelationship !== undefined)
          ) {
            deckFail(
              "VECTOR180-DECK-PPTX-MAP",
              `Object "${object.id}" picture relationship does not match its resolved kind.`,
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
            emitted: {
              partName: binding.partName,
              element: emitted.element,
              cNvPrName: emitted.cNvPrName,
              cNvPrNumericId: emitted.cNvPrNumericId,
              ...(imageRelationship === undefined
                ? {}
                : { imageRelationship: { ...imageRelationship } }),
            },
            capability: {
              classification:
                object.kind === "raster-asset" ? "atomic-raster" : "native",
              exportMode: expectedExport,
              compilerCapability:
                object.kind === "raster-asset"
                  ? "deck-static-png-picture/0.1"
                  : "deck-native-primitive/0.1",
            },
          };
        },
      );
      return {
        id: slide.id,
        order: slide.order,
        hidden: slide.hidden,
        ...(slide.layout === undefined ? {} : { layout: slide.layout }),
        sourceRange: { ...sourceSlide.sourceRange },
        partName: binding.partName,
        presentationRelationshipId: binding.presentationRelationshipId,
        presentationNumericId: binding.presentationNumericId,
        layoutRelationship: {
          relationshipId: "rId1",
          partName: "ppt/slideLayouts/slideLayout1.xml",
        },
        objects: Object.freeze(objects),
      };
    }),
  );
}

function snapshotObject(
  object: Vector180ResolvedObject,
): Vector180PptxDeckMapObjectSnapshot {
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
  object: Vector180ResolvedObject,
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
    case "raster-asset":
      return { resource: { ...object.resource } };
    case "svg-asset":
      return {};
    default:
      return assertNever(object);
  }
}

async function validateMapAgainstPackage(
  map: Vector180PptxDeckMap,
  bytes: Uint8Array,
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    deckFail(
      "VECTOR180-DECK-PPTX-OPC",
      `Generated PPTX could not be reopened: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const actualPartNames = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  if (
    actualPartNames.length !== map.pptx.partNames.length ||
    map.pptx.partNames.some((name, index) => actualPartNames[index] !== name)
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-MAP",
      "The map and emitted PPTX part inventories differ.",
    );
  }
  const presentationXml = await zip
    .file("ppt/presentation.xml")
    ?.async("string");
  const presentationRels = await zip
    .file("ppt/_rels/presentation.xml.rels")
    ?.async("string");
  const customXml = await zip.file("docProps/custom.xml")?.async("string");
  if (
    presentationXml === undefined ||
    presentationRels === undefined ||
    customXml === undefined
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-OPC",
      "Generated PPTX lacks its presentation or custom-property lineage parts.",
    );
  }
  const emittedSlideOrder = [
    ...presentationXml.matchAll(
      /<p:sldId id="[1-9]\d*" r:id="(rId[1-9]\d*)"\/>/gu,
    ),
  ].map((match) => match[1]);
  const mappedSlideOrder = map.slides.map(
    (slide) => slide.presentationRelationshipId,
  );
  if (
    emittedSlideOrder.length !== mappedSlideOrder.length ||
    emittedSlideOrder.some((id, index) => id !== mappedSlideOrder[index])
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-MAP",
      "Manifest slide order and emitted presentation order differ.",
    );
  }
  if (
    !customXml.includes(COMPILER) ||
    !customXml.includes(MAP_SCHEMA) ||
    !customXml.includes("vector180.sourceKind") ||
    !customXml.includes("<vt:lpwstr>deck</vt:lpwstr>")
  ) {
    deckFail(
      "VECTOR180-DECK-PPTX-MAP",
      "Generated PPTX lacks its mapped-deck compiler lineage.",
    );
  }

  for (const slide of map.slides) {
    const slideXml = await zip.file(slide.partName)?.async("string");
    const partNumber = /^ppt\/slides\/slide([1-9]\d*)\.xml$/u.exec(
      slide.partName,
    )?.[1];
    const slideRels =
      partNumber === undefined
        ? undefined
        : await zip
            .file(`ppt/slides/_rels/slide${partNumber}.xml.rels`)
            ?.async("string");
    if (slideXml === undefined || slideRels === undefined) {
      deckFail(
        "VECTOR180-DECK-PPTX-OPC",
        `Mapped slide "${slide.id}" lacks its slide or relationship part.`,
      );
    }
    if (
      !presentationXml.includes(
        `<p:sldId id="${slide.presentationNumericId}" r:id="${slide.presentationRelationshipId}"/>`,
      ) ||
      !presentationRels.includes(
        `<Relationship Id="${slide.presentationRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${partNumber}.xml"/>`,
      ) ||
      !slideRels.includes(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
      )
    ) {
      deckFail(
        "VECTOR180-DECK-PPTX-MAP",
        `Mapped slide "${slide.id}" part and relationships disagree.`,
      );
    }
    const actualObjects = [
      ...slideXml.matchAll(
        /<p:cNvPr id="([1-9]\d*)" name="src\.([^"&]+)"\/>/gu,
      ),
    ]
      .map((match) => `${match[2]}\0${match[1]}`)
      .sort(compareText);
    const expectedObjects = slide.objects
      .map((object) => `${object.id}\0${object.emitted.cNvPrNumericId}`)
      .sort(compareText);
    if (
      actualObjects.length !== expectedObjects.length ||
      actualObjects.some((entry, index) => entry !== expectedObjects[index])
    ) {
      deckFail(
        "VECTOR180-DECK-PPTX-MAP",
        `Mapped slide "${slide.id}" stable-name/numeric-ID inventory differs from its PPTX part.`,
      );
    }
    const emittedHidden = /<p:sld\b[^>]*\bshow="0"/u.test(slideXml);
    if (emittedHidden !== slide.hidden) {
      deckFail(
        "VECTOR180-DECK-PPTX-MAP",
        `Mapped slide "${slide.id}" visibility differs from its PPTX part.`,
      );
    }
    for (const object of slide.objects) {
      const relationship = object.emitted.imageRelationship;
      const descriptor = object.source.resource;
      if (relationship === undefined && descriptor === undefined) continue;
      if (relationship === undefined || descriptor === undefined) {
        deckFail(
          "VECTOR180-DECK-PPTX-MAP",
          `Mapped raster asset "${object.id}" lacks its complete picture binding.`,
        );
      }
      const target = `../media/${descriptor.sha256}.png`;
      const mediaBytes = await zip
        .file(relationship.partName)
        ?.async("uint8array");
      if (
        !slideXml.includes(
          `<a:blip r:embed="${relationship.relationshipId}"/>`,
        ) ||
        !slideRels.includes(
          `<Relationship Id="${relationship.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`,
        ) ||
        mediaBytes === undefined ||
        mediaBytes.byteLength !== descriptor.byteLength ||
        sha256HexSync(mediaBytes) !== descriptor.sha256
      ) {
        deckFail(
          "VECTOR180-DECK-PPTX-MAP",
          `Mapped raster asset "${object.id}" does not match its picture, relationship, and content-addressed media part.`,
        );
      }
    }
  }
}

function exactInlinePngHref(node: Vector180Node): string {
  const references = Object.entries(node.attributes).filter(([name]) => {
    const normalized = name.toLowerCase();
    return normalized === "href" || normalized === "xlink:href";
  });
  if (references.length !== 1) {
    deckFail(
      "VECTOR180-DECK-PPTX-UNSUPPORTED",
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
    deckFail(
      "VECTOR180-DECK-PPTX-UNSUPPORTED",
      `Raster asset "${node.id}" no longer matches its validated PNG descriptor.`,
    );
  }
  return value;
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

function indexSourceNodes(
  nodes: readonly Vector180Node[],
): ReadonlyMap<
  string,
  { readonly node: Vector180Node; readonly order: number }
> {
  const result = new Map<
    string,
    { readonly node: Vector180Node; readonly order: number }
  >();
  const visit = (siblings: readonly Vector180Node[]): void => {
    for (const [order, node] of siblings.entries()) {
      if (result.has(node.id)) {
        deckFail(
          "VECTOR180-DECK-PPTX-IDENTITY",
          `Duplicate stable object ID "${node.id}".`,
        );
      }
      result.set(node.id, { node, order });
      visit(node.children);
    }
  };
  visit(nodes);
  return result;
}

function flattenObjects(
  objects: readonly Vector180ResolvedObject[],
): readonly Vector180ResolvedObject[] {
  const result: Vector180ResolvedObject[] = [];
  const visit = (siblings: readonly Vector180ResolvedObject[]): void => {
    for (const object of siblings) {
      result.push(object);
      if (object.kind === "group") visit(object.children);
    }
  };
  visit(objects);
  return result;
}

function sourceMapAttributes(
  node: Vector180Node,
): Readonly<Record<string, string>> {
  return sortedRecord(
    Object.fromEntries(
      Object.entries(node.attributes).filter(([name]) => {
        if (node.resource === undefined) return true;
        const normalized = name.toLowerCase();
        return normalized !== "href" && normalized !== "xlink:href";
      }),
    ),
  );
}

function compilerInputSnapshot(deck: Vector180Deck): string {
  const slides = deck.slideOrder.map((id) => {
    const slide = deck.slides.get(id);
    if (slide === undefined) {
      deckFail(
        "VECTOR180-DECK-PPTX-IDENTITY",
        `Manifest slide "${id}" is absent from the supplied deck interpretation.`,
      );
    }
    return {
      id: slide.id,
      ...(slide.layout === undefined ? {} : { layout: slide.layout }),
      hidden: slide.hidden,
      viewBox: [...slide.viewBox],
      sourceRange: { ...slide.sourceRange },
      children: slide.children.map(snapshotSourceNode),
    };
  });
  const themes = [...deck.themes.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, theme]) => [id, { ...theme }] as const);
  return JSON.stringify(
    canonicalJsonValue({
      version: deck.version,
      sourceKind: deck.sourceKind,
      wireFamily: deck.wireFamily,
      ...(deck.title === undefined ? {} : { title: deck.title }),
      ...(deck.activeTheme === undefined
        ? {}
        : { activeTheme: deck.activeTheme }),
      slideOrder: [...deck.slideOrder],
      ...(deck.baseStyle === undefined
        ? {}
        : { baseStyle: { ...deck.baseStyle } }),
      themes,
      slides,
      materialization: {
        ...deck.materialization,
        slideIds: [...deck.materialization.slideIds],
      },
      diagnostics: deck.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      source: {
        ...(deck.source.wireFamily === undefined
          ? {}
          : { wireFamily: deck.source.wireFamily }),
        charLength: deck.source.charLength,
        byteLength: deck.source.byteLength,
        sha256: deck.source.sha256,
      },
    }),
  );
}

function snapshotSourceNode(node: Vector180Node): unknown {
  return {
    id: node.id,
    role: node.role,
    exportMode: node.exportMode,
    elementName: node.elementName,
    classes: [...node.classes],
    attributes: sortedRecord(node.attributes),
    parentId: node.parentId,
    children: node.children.map(snapshotSourceNode),
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

function sortedRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareText(left, right)),
  );
}

function rethrowCanaryError(error: PptxCanaryCompileError): never {
  if (error.code === "VECTOR180-PPTX-FAMILY") {
    return deckFail("VECTOR180-DECK-PPTX-FAMILY", error.message);
  }
  if (error.code === "VECTOR180-PPTX-ID-COLLISION") {
    return deckFail("VECTOR180-DECK-PPTX-IDENTITY", error.message);
  }
  if (
    error.code === "VECTOR180-PPTX-OPC-GRAPH" ||
    error.code === "VECTOR180-PPTX-ZIP-LIMIT"
  ) {
    return deckFail("VECTOR180-DECK-PPTX-OPC", error.message);
  }
  if (
    error.code === "VECTOR180-PPTX-UNRESOLVED" ||
    error.code === "VECTOR180-PPTX-INVALID-MODEL"
  ) {
    return deckFail("VECTOR180-DECK-PPTX-INVALID-SOURCE", error.message);
  }
  return deckFail("VECTOR180-DECK-PPTX-UNSUPPORTED", error.message);
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

function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "error" || diagnostic.severity === "fatal";
}

function isUnsupportedDiagnostic(diagnostic: Diagnostic): boolean {
  return UNSUPPORTED_DIAGNOSTIC_CODES.has(diagnostic.code);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function deckFail(code: Vector180PptxDeckErrorCode, message: string): never {
  throw new Vector180PptxDeckCompileError(code, message);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled resolved object kind: ${JSON.stringify(value)}`);
}
