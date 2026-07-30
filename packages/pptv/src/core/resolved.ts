/**
 * Pure compiler-grade PPTV geometry, text, and object projection.
 *
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 */

import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import {
  resolvePptvDiagramStyles,
  resolvePptvStyles,
  type PptvResolvedObjectStyle,
  type PptvResolvedStyle,
  type PptvStyleProvenance,
} from "./styles.js";
import type {
  Diagnostic,
  PptvDeck,
  PptvDiagram,
  PptvNode,
  PptvSlide,
  SourceRange,
} from "./types.js";

type ParsedNode = DefaultTreeAdapterMap["node"];
type ParsedElement = DefaultTreeAdapterMap["element"];
type ParsedText = DefaultTreeAdapterMap["textNode"];
type ParsedFragment = DefaultTreeAdapterMap["documentFragment"];

const CANVAS_VIEWBOX = [0, 0, 1600, 900] as const;
const CANVAS_WIDTH_EMU = 12_192_000 as const;
const CANVAS_HEIGHT_EMU = 6_858_000 as const;
const EMU_PER_UNIT = 7_620 as const;
const SVG_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const EXACT_DECIMAL_PATTERN =
  /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_EXACT_DECIMAL_SOURCE_LENGTH = 512;
const MAX_EXACT_DECIMAL_SCALE = 1_024;
const ERROR_SEVERITIES = new Set(["error", "fatal"]);
const FORBIDDEN_TEXT_ATTRIBUTES = new Set(["dx", "dy", "rotate", "textlength"]);
const COMMON_BOUNDARY_ATTRIBUTES = [
  "id",
  "class",
  "data-pptv-role",
  "data-pptv-export",
  "style",
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
] as const;
const RECT_ATTRIBUTES = boundaryAttributes(
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
);
const CIRCLE_ATTRIBUTES = boundaryAttributes("cx", "cy", "r");
const ELLIPSE_ATTRIBUTES = boundaryAttributes("cx", "cy", "rx", "ry");
const LINE_ATTRIBUTES = boundaryAttributes(
  "x1",
  "y1",
  "x2",
  "y2",
  "data-pptv-from",
  "data-pptv-to",
);
const GROUP_ATTRIBUTES = boundaryAttributes("transform");
const TEXT_ATTRIBUTES = boundaryAttributes(
  "data-pptv-frame",
  "data-pptv-line-step",
  "x",
  "y",
);
const SVG_ASSET_ATTRIBUTES = boundaryAttributes("data-pptv-bounds");
const RASTER_ASSET_ATTRIBUTES = boundaryAttributes(
  "data-pptv-bounds",
  "href",
  "xlink:href",
  "x",
  "y",
  "width",
  "height",
);
const STYLE_OR_LAYOUT_ATTRIBUTE_PATTERN =
  /^(?:alignment-|baseline-|block-size$|color$|direction$|display$|dominant-|fill-|filter$|font-|inline-size$|letter-spacing$|line-height$|mask$|mix-blend-mode$|overflow$|paint-order$|shape-inside$|stroke-|text-|textlength$|vector-effect$|white-space$|word-spacing$|writing-mode$)/u;
const SLIDE_ROOT_ATTRIBUTES = new Set([
  "id",
  "viewbox",
  "data-pptv-layout",
  "xmlns",
  "xmlns:xlink",
]);

export interface PptvBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PptvPoint {
  readonly x: number;
  readonly y: number;
}

export type PptvResolvedObjectKind =
  "rect" | "ellipse" | "text" | "line" | "group" | "svg-asset" | "raster-asset";

export interface PptvResolvedObjectBase {
  readonly id: string;
  readonly slideId: string;
  readonly parentId: string | null;
  readonly kind: PptvResolvedObjectKind;
  readonly order: number;
  readonly localBounds: PptvBounds;
  readonly worldBounds: PptvBounds;
  readonly worldOffset: PptvPoint;
  readonly style: PptvResolvedStyle;
  readonly styleProvenance: PptvStyleProvenance;
}

export interface PptvResolvedRect extends PptvResolvedObjectBase {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx?: number;
  readonly ry?: number;
}

export interface PptvResolvedEllipse extends PptvResolvedObjectBase {
  readonly kind: "ellipse";
  readonly sourceElement: "circle" | "ellipse";
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface PptvResolvedLine extends PptvResolvedObjectBase {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly fromId?: string;
  readonly toId?: string;
}

export interface PptvResolvedGroup extends PptvResolvedObjectBase {
  readonly kind: "group";
  readonly translateX: number;
  readonly translateY: number;
  readonly children: readonly PptvResolvedObject[];
}

export interface PptvResolvedSvgAsset extends PptvResolvedObjectBase {
  readonly kind: "svg-asset";
}

export interface PptvResolvedRasterAsset extends PptvResolvedObjectBase {
  readonly kind: "raster-asset";
  readonly resourceRef: string;
}

export interface PptvResolvedTextLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface PptvResolvedText extends PptvResolvedObjectBase {
  readonly kind: "text";
  readonly frame: PptvBounds;
  readonly lineStep: number;
  readonly anchor: "start" | "middle" | "end";
  readonly lines: readonly PptvResolvedTextLine[];
  readonly wrap: "none";
  readonly autofit: "none";
  readonly margins: {
    readonly left: 0;
    readonly top: 0;
    readonly right: 0;
    readonly bottom: 0;
  };
}

export type PptvResolvedObject =
  | PptvResolvedRect
  | PptvResolvedEllipse
  | PptvResolvedText
  | PptvResolvedLine
  | PptvResolvedGroup
  | PptvResolvedSvgAsset
  | PptvResolvedRasterAsset;

export interface PptvResolvedSlide {
  readonly id: string;
  readonly order: number;
  readonly hidden: boolean;
  readonly layout?: string;
  readonly objects: readonly PptvResolvedObject[];
}

export interface PptvResolvedDeck {
  readonly schema: "pptv-resolved/0.1";
  readonly sourceSha256: string;
  readonly activeTheme: string;
  readonly canvas: {
    readonly viewBox: readonly [0, 0, 1600, 900];
    readonly widthEmu: 12_192_000;
    readonly heightEmu: 6_858_000;
    readonly emuPerUnit: 7_620;
  };
  readonly slides: readonly PptvResolvedSlide[];
}

export interface PptvResolvedResult {
  readonly model?: PptvResolvedDeck;
  readonly diagnostics: readonly Diagnostic[];
}

export interface PptvResolvedDiagramObjectBase extends Omit<
  PptvResolvedObjectBase,
  "slideId"
> {
  readonly diagramId: string;
}

type DiagramScoped<T> = Omit<T, "slideId"> & {
  readonly diagramId: string;
};

export type PptvResolvedDiagramRect = DiagramScoped<PptvResolvedRect>;
export type PptvResolvedDiagramEllipse = DiagramScoped<PptvResolvedEllipse>;
export type PptvResolvedDiagramText = DiagramScoped<PptvResolvedText>;
export type PptvResolvedDiagramLine = DiagramScoped<PptvResolvedLine>;
export type PptvResolvedDiagramSvgAsset = DiagramScoped<PptvResolvedSvgAsset>;
export type PptvResolvedDiagramRasterAsset =
  DiagramScoped<PptvResolvedRasterAsset>;
export type PptvResolvedDiagramGroup = DiagramScoped<
  Omit<PptvResolvedGroup, "children">
> & {
  readonly children: readonly PptvResolvedDiagramObject[];
};

export type PptvResolvedDiagramObject =
  | PptvResolvedDiagramRect
  | PptvResolvedDiagramEllipse
  | PptvResolvedDiagramText
  | PptvResolvedDiagramLine
  | PptvResolvedDiagramGroup
  | PptvResolvedDiagramSvgAsset
  | PptvResolvedDiagramRasterAsset;

export interface PptvResolvedDiagram {
  readonly schema: "pptv-resolved-diagram/0.1";
  readonly sourceSha256: string;
  readonly diagramId: string;
  readonly canvas: {
    readonly viewBox: readonly [number, number, number, number];
  };
  readonly objects: readonly PptvResolvedDiagramObject[];
}

export interface PptvResolvedDiagramResult {
  readonly model?: PptvResolvedDiagram;
  readonly diagnostics: readonly Diagnostic[];
}

type PptvResolvableDocument = PptvDeck | PptvDiagram;

interface ResolutionScope {
  readonly kind: "slide" | "diagram";
  readonly id: string;
  readonly children: readonly PptvNode[];
  readonly viewBox: readonly [number, number, number, number];
  readonly sourceRange: SourceRange;
}

type InternalScoped<T> = Omit<T, "slideId"> & {
  readonly containerId: string;
};

type InternalResolvedObjectBase = InternalScoped<PptvResolvedObjectBase>;
type InternalResolvedRect = InternalScoped<PptvResolvedRect>;
type InternalResolvedEllipse = InternalScoped<PptvResolvedEllipse>;
type InternalResolvedText = InternalScoped<PptvResolvedText>;
type InternalResolvedLine = InternalScoped<PptvResolvedLine>;
type InternalResolvedSvgAsset = InternalScoped<PptvResolvedSvgAsset>;
type InternalResolvedRasterAsset = InternalScoped<PptvResolvedRasterAsset>;
type InternalResolvedGroup = InternalScoped<
  Omit<PptvResolvedGroup, "children">
> & {
  readonly children: readonly InternalResolvedObject[];
};
type InternalResolvedObject =
  | InternalResolvedRect
  | InternalResolvedEllipse
  | InternalResolvedText
  | InternalResolvedLine
  | InternalResolvedGroup
  | InternalResolvedSvgAsset
  | InternalResolvedRasterAsset;

interface ResolutionContext {
  readonly document: PptvResolvableDocument;
  readonly diagnostics: Diagnostic[];
  readonly styles: ReadonlyMap<string, PptvResolvedObjectStyle>;
  readonly sourceNodes: ReadonlyMap<string, PptvNode>;
}

export function resolvePptvDeck(deck: PptvDeck): PptvResolvedResult {
  const diagnostics = [...deck.diagnostics];
  if (!validBaseSnapshot(deck)) {
    diagnostics.push({
      code: "PPTV-PROFILE-INVALID-BASE",
      severity: "error",
      message:
        "C6 resolution requires a complete, unambiguous C4 deck snapshot with no errors.",
    });
    return { diagnostics };
  }

  const styleResult = resolvePptvStyles(deck);
  diagnostics.push(...styleResult.diagnostics);
  const sourceNodes = indexSourceNodes(deck);
  const context: ResolutionContext = {
    document: deck,
    diagnostics,
    styles: styleResult.styles,
    sourceNodes,
  };
  const slides: PptvResolvedSlide[] = [];

  for (const [order, slideId] of deck.slideOrder.entries()) {
    const slide = deck.slides.get(slideId);
    if (slide === undefined) {
      diagnostics.push({
        code: "PPTV-PROFILE-INVALID-BASE",
        severity: "error",
        message: `Fully materialized deck is missing slide "${slideId}".`,
        slideId,
      });
      continue;
    }
    validateSlideRoot(slide, deck, context);
    if (!exactCanvas(slide.viewBox)) {
      diagnostics.push({
        code: "PPTV-PROFILE-VIEWBOX",
        severity: "error",
        message: `Slide "${slide.id}" must use viewBox="0 0 1600 900".`,
        slideId: slide.id,
        range: slide.sourceRange,
      });
    }
    const scope: ResolutionScope = {
      kind: "slide",
      id: slide.id,
      children: slide.children,
      viewBox: slide.viewBox,
      sourceRange: slide.sourceRange,
    };
    const internalObjects = resolveSiblings(
      scope.children,
      scope,
      null,
      { x: 0, y: 0 },
      context,
    );
    validateConnectorReferences(internalObjects, context);
    slides.push({
      id: slide.id,
      order,
      hidden: slide.hidden,
      ...(slide.layout === undefined ? {} : { layout: slide.layout }),
      objects: internalObjects.map(toDeckObject),
    });
  }

  if (hasErrors(diagnostics) || deck.activeTheme === undefined) {
    return { diagnostics };
  }

  const model: PptvResolvedDeck = {
    schema: "pptv-resolved/0.1",
    sourceSha256: deck.source.sha256,
    activeTheme: deck.activeTheme,
    canvas: {
      viewBox: CANVAS_VIEWBOX,
      widthEmu: CANVAS_WIDTH_EMU,
      heightEmu: CANVAS_HEIGHT_EMU,
      emuPerUnit: EMU_PER_UNIT,
    },
    slides,
  };
  return { model: cloneAndFreeze(model), diagnostics };
}

export function resolvePptvDiagram(
  diagram: PptvDiagram,
): PptvResolvedDiagramResult {
  const diagnostics = [...diagram.diagnostics];
  const styleResult = resolvePptvDiagramStyles(diagram);
  diagnostics.push(...styleResult.diagnostics);
  if (!validDiagramBaseSnapshot(diagram)) {
    diagnostics.push({
      code: "PPTV-PROFILE-INVALID-BASE",
      severity: "error",
      message:
        "Diagram resolution requires a complete, unambiguous standalone semantic snapshot with no errors.",
      diagramId: diagram.id,
    });
    return { diagnostics };
  }
  if (!validDiagramCanvas(diagram.viewBox)) {
    diagnostics.push({
      code: "PPTV-PROFILE-VIEWBOX",
      severity: "error",
      message: `Diagram "${diagram.id}" requires a four-number finite viewBox with positive width and height.`,
      diagramId: diagram.id,
      range: diagram.sourceRange,
    });
    return { diagnostics };
  }

  const context: ResolutionContext = {
    document: diagram,
    diagnostics,
    styles: styleResult.styles,
    sourceNodes: indexSourceNodes(diagram),
  };
  const scope: ResolutionScope = {
    kind: "diagram",
    id: diagram.id,
    children: diagram.children,
    viewBox: diagram.viewBox,
    sourceRange: diagram.sourceRange,
  };
  const internalObjects = resolveSiblings(
    scope.children,
    scope,
    null,
    { x: 0, y: 0 },
    context,
  );
  validateConnectorReferences(internalObjects, context);
  if (hasErrors(diagnostics)) return { diagnostics };

  const model: PptvResolvedDiagram = {
    schema: "pptv-resolved-diagram/0.1",
    sourceSha256: diagram.source.sha256,
    diagramId: diagram.id,
    canvas: { viewBox: [...diagram.viewBox] },
    objects: internalObjects.map(toDiagramObject),
  };
  return { model: cloneAndFreeze(model), diagnostics };
}

function validBaseSnapshot(deck: PptvDeck): boolean {
  if (
    hasErrors(deck.diagnostics) ||
    !deck.materialization.complete ||
    deck.index.sourceSha256 !== deck.source.sha256
  ) {
    return false;
  }
  const seen = new Set<string>();
  let objectCount = 0;
  for (const slideId of deck.slideOrder) {
    const slide = deck.slides.get(slideId);
    if (slide === undefined) return false;
    let valid = true;
    visitSourceNodes(slide.children, (node) => {
      objectCount += 1;
      const indexed = deck.index.objects.get(node.id);
      if (
        seen.has(node.id) ||
        indexed === undefined ||
        indexed.slideId !== slideId
      ) {
        valid = false;
      }
      seen.add(node.id);
    });
    if (!valid) return false;
  }
  return objectCount === deck.index.objects.size;
}

function validDiagramBaseSnapshot(diagram: PptvDiagram): boolean {
  if (
    hasErrors(diagram.diagnostics) ||
    diagram.index.sourceSha256 !== diagram.source.sha256 ||
    diagram.index.root.id !== diagram.id
  ) {
    return false;
  }
  const seen = new Set<string>();
  let valid = true;
  let objectCount = 0;
  visitSourceNodes(diagram.children, (node) => {
    objectCount += 1;
    const indexed = diagram.index.objects.get(node.id);
    if (
      seen.has(node.id) ||
      indexed === undefined ||
      indexed.diagramId !== diagram.id
    ) {
      valid = false;
    }
    seen.add(node.id);
  });
  return valid && objectCount === diagram.index.objects.size;
}

function validDiagramCanvas(
  viewBox: readonly [number, number, number, number],
): boolean {
  return (
    viewBox.length === 4 &&
    viewBox.every(Number.isFinite) &&
    (viewBox[2] ?? 0) > 0 &&
    (viewBox[3] ?? 0) > 0
  );
}

function indexSourceNodes(
  document: PptvResolvableDocument,
): Map<string, PptvNode> {
  const nodes = new Map<string, PptvNode>();
  if (document.sourceKind === "html") {
    for (const slide of document.slides.values()) {
      visitSourceNodes(slide.children, (node) => nodes.set(node.id, node));
    }
  } else {
    visitSourceNodes(document.children, (node) => nodes.set(node.id, node));
  }
  return nodes;
}

function toDeckObject(object: InternalResolvedObject): PptvResolvedObject {
  if (object.kind === "group") {
    const { containerId, children, ...fields } = object;
    return {
      ...fields,
      slideId: containerId,
      children: children.map(toDeckObject),
    } as PptvResolvedGroup;
  }
  const { containerId, ...fields } = object;
  return { ...fields, slideId: containerId } as PptvResolvedObject;
}

function toDiagramObject(
  object: InternalResolvedObject,
): PptvResolvedDiagramObject {
  if (object.kind === "group") {
    const { containerId, children, ...fields } = object;
    return {
      ...fields,
      diagramId: containerId,
      children: children.map(toDiagramObject),
    } as PptvResolvedDiagramGroup;
  }
  const { containerId, ...fields } = object;
  return { ...fields, diagramId: containerId } as PptvResolvedDiagramObject;
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

function resolveSiblings(
  nodes: readonly PptvNode[],
  scope: ResolutionScope,
  parentId: string | null,
  parentWorldOffset: PptvPoint,
  context: ResolutionContext,
): InternalResolvedObject[] {
  const result: InternalResolvedObject[] = [];
  for (const node of nodes) {
    if (node.exportMode === "ignore") continue;
    const resolved = resolveObject(
      node,
      scope,
      parentId,
      result.length,
      parentWorldOffset,
      context,
    );
    if (resolved !== undefined) result.push(resolved);
  }
  return result;
}

function resolveObject(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  parentWorldOffset: PptvPoint,
  context: ResolutionContext,
): InternalResolvedObject | undefined {
  const styleEntry = context.styles.get(node.id);
  if (styleEntry === undefined) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-CSS-VALUE",
      `Object "${node.id}" has no resolved style.`,
    );
    return undefined;
  }

  if (
    node.elementName === "g" &&
    node.role === "group" &&
    node.exportMode === "native"
  ) {
    return resolveGroup(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }

  if (getAttribute(node, "transform") !== undefined) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-TRANSFORM",
      `Transform is not allowed on C6 ${node.elementName} object "${node.id}".`,
    );
  }

  if (
    node.elementName === "rect" &&
    node.role === "shape" &&
    node.exportMode === "native"
  ) {
    return resolveRect(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }
  if (
    (node.elementName === "circle" || node.elementName === "ellipse") &&
    node.role === "shape" &&
    node.exportMode === "native"
  ) {
    return resolveEllipse(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }
  if (
    node.elementName === "line" &&
    node.role === "connector" &&
    node.exportMode === "native"
  ) {
    return resolveLine(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }
  if (
    node.elementName === "text" &&
    node.role === "text" &&
    node.exportMode === "native"
  ) {
    return resolveText(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }
  if (
    node.elementName === "g" &&
    node.role === "asset" &&
    node.exportMode === "svg"
  ) {
    return resolveSvgAsset(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }
  if (
    node.elementName === "image" &&
    node.role === "asset" &&
    node.exportMode === "raster"
  ) {
    return resolveRasterAsset(
      node,
      scope,
      parentId,
      order,
      parentWorldOffset,
      styleEntry,
      context,
    );
  }

  pushNodeDiagnostic(
    context,
    node,
    "PPTV-PROFILE-OBJECT-KIND",
    `Element/role/export combination ${node.elementName}/${node.role}/${node.exportMode} is outside C6.`,
  );
  return undefined;
}

function resolveRect(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedRect | undefined {
  validateBoundaryAttributes(node, RECT_ATTRIBUTES, context);
  const x = requiredNumber(node, "x", false, context);
  const y = requiredNumber(node, "y", false, context);
  const width = requiredNumber(node, "width", true, context);
  const height = requiredNumber(node, "height", true, context);
  const rx = optionalNumber(node, "rx", true, context);
  const ry = optionalNumber(node, "ry", true, context);
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }
  const localBounds = { x, y, width, height };
  const worldBounds = offsetBounds(localBounds, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "rect",
      order,
      localBounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    x,
    y,
    width,
    height,
    ...(rx === undefined ? {} : { rx }),
    ...(ry === undefined ? {} : { ry }),
  };
}

function resolveEllipse(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedEllipse | undefined {
  validateBoundaryAttributes(
    node,
    node.elementName === "circle" ? CIRCLE_ATTRIBUTES : ELLIPSE_ATTRIBUTES,
    context,
  );
  const cx = requiredNumber(node, "cx", false, context);
  const cy = requiredNumber(node, "cy", false, context);
  const circleRadius =
    node.elementName === "circle"
      ? requiredNumber(node, "r", true, context)
      : undefined;
  const rx =
    node.elementName === "circle"
      ? circleRadius
      : requiredNumber(node, "rx", true, context);
  const ry =
    node.elementName === "circle"
      ? circleRadius
      : requiredNumber(node, "ry", true, context);
  if (
    cx === undefined ||
    cy === undefined ||
    rx === undefined ||
    ry === undefined
  ) {
    return undefined;
  }
  const localBounds = {
    x: cx - rx,
    y: cy - ry,
    width: rx * 2,
    height: ry * 2,
  };
  if (!boundsAreFinite(localBounds)) {
    pushNumberDiagnostic(context, node, "ellipse bounds overflow");
    return undefined;
  }
  const worldBounds = offsetBounds(localBounds, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "ellipse",
      order,
      localBounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    sourceElement: node.elementName === "circle" ? "circle" : "ellipse",
    cx,
    cy,
    rx,
    ry,
  };
}

function resolveLine(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedLine | undefined {
  validateBoundaryAttributes(node, LINE_ATTRIBUTES, context);
  const x1 = requiredNumber(node, "x1", false, context);
  const y1 = requiredNumber(node, "y1", false, context);
  const x2 = requiredNumber(node, "x2", false, context);
  const y2 = requiredNumber(node, "y2", false, context);
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    return undefined;
  }
  if (x1 === x2 && y1 === y2) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-GEOMETRY",
      `Connector "${node.id}" must have two distinct endpoints.`,
    );
    return undefined;
  }
  const localBounds = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
  if (!boundsAreFinite(localBounds)) {
    pushNumberDiagnostic(context, node, "line bounds overflow");
    return undefined;
  }
  const worldBounds = offsetBounds(localBounds, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  const fromId = getAttribute(node, "data-pptv-from");
  const toId = getAttribute(node, "data-pptv-to");
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "line",
      order,
      localBounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    x1,
    y1,
    x2,
    y2,
    ...(fromId === undefined ? {} : { fromId }),
    ...(toId === undefined ? {} : { toId }),
  };
}

function resolveGroup(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  parentWorldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedGroup | undefined {
  validateBoundaryAttributes(node, GROUP_ATTRIBUTES, context);
  const translation = parseGroupTranslation(node, context);
  if (translation === undefined) return undefined;
  const worldOffset = addPoints(parentWorldOffset, translation, node, context);
  if (worldOffset === undefined) return undefined;
  const children = resolveSiblings(
    node.children,
    scope,
    node.id,
    worldOffset,
    context,
  );
  if (children.length === 0) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-GEOMETRY",
      `Native group "${node.id}" must contain at least one rendered child.`,
    );
    return undefined;
  }
  const worldBounds = unionBounds(children.map((child) => child.worldBounds));
  if (worldBounds === undefined) {
    pushNumberDiagnostic(context, node, "group bounds are not finite");
    return undefined;
  }
  const localBounds = {
    x: worldBounds.x - worldOffset.x,
    y: worldBounds.y - worldOffset.y,
    width: worldBounds.width,
    height: worldBounds.height,
  };
  if (!boundsAreFinite(localBounds)) {
    pushNumberDiagnostic(context, node, "group local bounds overflow");
    return undefined;
  }
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "group",
      order,
      localBounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    translateX: translation.x,
    translateY: translation.y,
    children,
  };
}

function resolveSvgAsset(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedSvgAsset | undefined {
  validateBoundaryAttributes(node, SVG_ASSET_ATTRIBUTES, context);
  const bounds = parseDeclaredBounds(node, context);
  if (bounds === undefined) return undefined;
  const worldBounds = offsetBounds(bounds, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "svg-asset",
      order,
      bounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
  };
}

function resolveRasterAsset(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedRasterAsset | undefined {
  validateBoundaryAttributes(node, RASTER_ASSET_ATTRIBUTES, context);
  const bounds = parseDeclaredBounds(node, context);
  const resourceRef =
    getAttribute(node, "href") ?? getAttribute(node, "xlink:href");
  if (resourceRef === undefined || resourceRef === "") {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-RESOURCE",
      `Raster asset "${node.id}" has no separately resolvable static resource.`,
    );
  } else {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-RESOURCE",
      `Raster asset "${node.id}" cannot be resolved by the dependency-free C6 resolver.`,
    );
  }
  if (bounds === undefined || resourceRef === undefined) return undefined;
  const worldBounds = offsetBounds(bounds, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "raster-asset",
      order,
      bounds,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    resourceRef,
  };
}

function resolveText(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  order: number,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
  context: ResolutionContext,
): InternalResolvedText | undefined {
  validateBoundaryAttributes(node, TEXT_ATTRIBUTES, context);
  const frame = parseTupleBounds(
    getAttribute(node, "data-pptv-frame"),
    "PPTV-PROFILE-TEXT-FRAME",
    "text frame",
    node,
    context,
  );
  const lineStepSource = getAttribute(node, "data-pptv-line-step");
  const lineStep = parseSingleNumber(lineStepSource, true);
  if (lineStep === undefined) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-TEXT-FRAME",
      `Text object "${node.id}" requires a positive finite data-pptv-line-step.`,
    );
  }
  if (
    styleEntry.style.fontFamily === undefined ||
    styleEntry.style.fontSize === undefined
  ) {
    pushNodeDiagnostic(
      context,
      node,
      "PPTV-PROFILE-FONT",
      `Text object "${node.id}" requires one resolved font family and size.`,
    );
  }
  const parsedElement = parseSourceElement(node, context.document);
  if (parsedElement === undefined) {
    pushTextLinesDiagnostic(
      context,
      node,
      "the exact source element could not be reconstructed",
    );
  }
  const lines =
    frame === undefined ||
    lineStep === undefined ||
    lineStepSource === undefined ||
    parsedElement === undefined
      ? undefined
      : parseHardLines(
          node,
          parsedElement,
          frame,
          lineStep,
          lineStepSource,
          context,
        );
  if (frame === undefined || lineStep === undefined || lines === undefined) {
    return undefined;
  }
  const worldBounds = offsetBounds(frame, worldOffset, node, context);
  if (worldBounds === undefined) return undefined;
  return {
    ...objectBase(
      node,
      scope,
      parentId,
      "text",
      order,
      frame,
      worldBounds,
      worldOffset,
      styleEntry,
    ),
    frame,
    lineStep,
    anchor: styleEntry.style.textAnchor,
    lines,
    wrap: "none",
    autofit: "none",
    margins: { left: 0, top: 0, right: 0, bottom: 0 },
  };
}

function parseHardLines(
  node: PptvNode,
  element: ParsedElement,
  frame: PptvBounds,
  lineStep: number,
  lineStepSource: string,
  context: ResolutionContext,
): PptvResolvedTextLine[] | undefined {
  if (hasForbiddenTextAttributes(element)) {
    pushTextLinesDiagnostic(
      context,
      node,
      "dx, dy, rotate, and textLength are outside the C6 text subset",
    );
    return undefined;
  }
  const elementChildren = element.childNodes.filter(isParsedElement);
  if (elementChildren.length === 0) {
    if (!element.childNodes.every(isParsedText)) {
      pushTextLinesDiagnostic(
        context,
        node,
        "direct text cannot contain comments or child elements",
      );
      return undefined;
    }
    const text = element.childNodes
      .filter(isParsedText)
      .map((child) => child.value)
      .join("");
    if (/[\r\n]/u.test(text)) {
      pushTextLinesDiagnostic(
        context,
        node,
        "one direct hard line cannot contain a decoded newline",
      );
      return undefined;
    }
    const x = parseSingleNumber(getParsedAttribute(element, "x"), false);
    const y = parseSingleNumber(getParsedAttribute(element, "y"), false);
    if (x === undefined || y === undefined) {
      pushTextLinesDiagnostic(
        context,
        node,
        "direct text requires finite unitless x and y",
      );
      return undefined;
    }
    if (!pointInside(frame, x, y)) {
      pushTextLinesDiagnostic(
        context,
        node,
        "the direct line anchor and baseline must fall inside its frame",
      );
      return undefined;
    }
    return [{ text, x, y }];
  }

  if (
    getParsedAttribute(element, "x") !== undefined ||
    getParsedAttribute(element, "y") !== undefined
  ) {
    pushTextLinesDiagnostic(
      context,
      node,
      "a multiline text parent must not declare x or y",
    );
    return undefined;
  }
  if (
    element.childNodes.some(
      (child) =>
        !isParsedElement(child) &&
        (!isParsedText(child) || !/^[\t\n\r ]*$/u.test(child.value)),
    )
  ) {
    pushTextLinesDiagnostic(
      context,
      node,
      "multiline text permits only direct tspans and formatting whitespace",
    );
    return undefined;
  }

  const lines: PptvResolvedTextLine[] = [];
  let previousYSource: string | undefined;
  for (const child of elementChildren) {
    if (
      child.tagName !== "tspan" ||
      child.attrs.some(
        (attribute) => attribute.name !== "x" && attribute.name !== "y",
      ) ||
      hasForbiddenTextAttributes(child) ||
      !child.childNodes.every(isParsedText)
    ) {
      pushTextLinesDiagnostic(
        context,
        node,
        "each hard line must be one direct, non-nested tspan with only x and y",
      );
      return undefined;
    }
    const text = child.childNodes
      .filter(isParsedText)
      .map((textNode) => textNode.value)
      .join("");
    const x = parseSingleNumber(getParsedAttribute(child, "x"), false);
    const ySource = getParsedAttribute(child, "y");
    const y = parseSingleNumber(ySource, false);
    if (
      x === undefined ||
      y === undefined ||
      /[\r\n]/u.test(text) ||
      !pointInside(frame, x, y)
    ) {
      pushTextLinesDiagnostic(
        context,
        node,
        "every tspan needs a finite in-frame x/y and one newline-free string",
      );
      return undefined;
    }
    if (
      previousYSource !== undefined &&
      (ySource === undefined ||
        !exactDecimalDifference(ySource, previousYSource, lineStepSource))
    ) {
      pushTextLinesDiagnostic(
        context,
        node,
        "successive tspan baselines must differ by exactly data-pptv-line-step",
      );
      return undefined;
    }
    lines.push({ text, x, y });
    previousYSource = ySource;
  }
  return lines;
}

function objectBase<Kind extends PptvResolvedObjectKind>(
  node: PptvNode,
  scope: ResolutionScope,
  parentId: string | null,
  kind: Kind,
  order: number,
  localBounds: PptvBounds,
  worldBounds: PptvBounds,
  worldOffset: PptvPoint,
  styleEntry: PptvResolvedObjectStyle,
): Omit<InternalResolvedObjectBase, "kind"> & { readonly kind: Kind } {
  return {
    id: node.id,
    containerId: scope.id,
    parentId,
    kind,
    order,
    localBounds,
    worldBounds,
    worldOffset,
    style: styleEntry.style,
    styleProvenance: styleEntry.styleProvenance,
  };
}

function boundaryAttributes(...specific: string[]): ReadonlySet<string> {
  return new Set([...COMMON_BOUNDARY_ATTRIBUTES, ...specific]);
}

function validateBoundaryAttributes(
  node: PptvNode,
  allowed: ReadonlySet<string>,
  context: ResolutionContext,
): void {
  for (const authoredName of Object.keys(node.attributes)) {
    const name = authoredName.toLowerCase();
    if (allowed.has(name)) continue;
    // Non-group transforms have their own exact capability diagnostic.
    if (name === "transform") continue;
    const styleOrLayout = STYLE_OR_LAYOUT_ATTRIBUTE_PATTERN.test(name);
    pushNodeDiagnostic(
      context,
      node,
      styleOrLayout ? "PPTV-PROFILE-CSS-PROPERTY" : "PPTV-PROFILE-OBJECT-KIND",
      styleOrLayout
        ? `Object "${node.id}" uses unsupported presentation or layout attribute "${authoredName}".`
        : `Object "${node.id}" uses unsupported C6 boundary attribute "${authoredName}".`,
    );
  }
}

function requiredNumber(
  node: PptvNode,
  name: string,
  positive: boolean,
  context: ResolutionContext,
): number | undefined {
  const value = parseSingleNumber(getAttribute(node, name), positive);
  if (value === undefined) {
    pushNumberDiagnostic(context, node, `attribute "${name}" is invalid`);
  }
  return value;
}

function optionalNumber(
  node: PptvNode,
  name: string,
  positive: boolean,
  context: ResolutionContext,
): number | undefined {
  const raw = getAttribute(node, name);
  if (raw === undefined) return undefined;
  const value = parseSingleNumber(raw, positive);
  if (value === undefined) {
    pushNumberDiagnostic(context, node, `attribute "${name}" is invalid`);
  }
  return value;
}

function parseSingleNumber(
  raw: string | undefined,
  positive: boolean,
): number | undefined {
  if (raw === undefined || !SVG_NUMBER_PATTERN.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || (positive && value <= 0)) return undefined;
  return normalizeZero(value);
}

interface ExactDecimal {
  readonly coefficient: bigint;
  readonly exponent: number;
}

function exactDecimalDifference(
  currentSource: string,
  previousSource: string,
  stepSource: string,
): boolean {
  const current = parseExactDecimal(currentSource);
  const previous = parseExactDecimal(previousSource);
  const step = parseExactDecimal(stepSource);
  if (current === undefined || previous === undefined || step === undefined) {
    return false;
  }
  const commonExponent = Math.min(
    current.exponent,
    previous.exponent,
    step.exponent,
  );
  try {
    return (
      scaleExactDecimal(current, commonExponent) -
        scaleExactDecimal(previous, commonExponent) ===
      scaleExactDecimal(step, commonExponent)
    );
  } catch {
    return false;
  }
}

function parseExactDecimal(source: string): ExactDecimal | undefined {
  if (source.length > MAX_EXACT_DECIMAL_SOURCE_LENGTH) return undefined;
  const match = EXACT_DECIMAL_PATTERN.exec(source);
  if (match === null) return undefined;
  const integer = match[2] ?? "";
  const fraction = match[3] ?? match[4] ?? "";
  const unsignedDigits = `${integer}${fraction}`.replace(/^0+/u, "");
  if (unsignedDigits === "") return { coefficient: 0n, exponent: 0 };

  const explicitExponent = Number(match[5] ?? "0");
  if (!Number.isSafeInteger(explicitExponent)) return undefined;
  const trailingZeroCount = /0+$/u.exec(unsignedDigits)?.[0].length ?? 0;
  const coefficientDigits =
    trailingZeroCount === 0
      ? unsignedDigits
      : unsignedDigits.slice(0, -trailingZeroCount);
  const exponent = explicitExponent - fraction.length + trailingZeroCount;
  if (!Number.isSafeInteger(exponent)) return undefined;

  const unsignedCoefficient = BigInt(coefficientDigits);
  return {
    coefficient: match[1] === "-" ? -unsignedCoefficient : unsignedCoefficient,
    exponent,
  };
}

function scaleExactDecimal(value: ExactDecimal, exponent: number): bigint {
  const shift = value.exponent - exponent;
  if (
    !Number.isSafeInteger(shift) ||
    shift < 0 ||
    shift > MAX_EXACT_DECIMAL_SCALE
  ) {
    throw new RangeError("Invalid exact-decimal scale");
  }
  return value.coefficient * 10n ** BigInt(shift);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function parseGroupTranslation(
  node: PptvNode,
  context: ResolutionContext,
): PptvPoint | undefined {
  const raw = getAttribute(node, "transform");
  if (raw === undefined) return { x: 0, y: 0 };
  const match = /^translate\((.*)\)$/u.exec(raw.trim());
  if (match === null) {
    pushTransformDiagnostic(context, node);
    return undefined;
  }
  const body = match[1]?.trim() ?? "";
  let parts: string[];
  if (body.includes(",")) {
    parts = body.split(",").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => part === "")) {
      pushTransformDiagnostic(context, node);
      return undefined;
    }
  } else {
    parts = body.split(/\s+/u);
  }
  if (parts.length < 1 || parts.length > 2) {
    pushTransformDiagnostic(context, node);
    return undefined;
  }
  const x = parseSingleNumber(parts[0], false);
  const y = parts.length === 1 ? 0 : parseSingleNumber(parts[1], false);
  if (x === undefined || y === undefined) {
    pushTransformDiagnostic(context, node);
    return undefined;
  }
  return { x, y };
}

function parseDeclaredBounds(
  node: PptvNode,
  context: ResolutionContext,
): PptvBounds | undefined {
  return parseTupleBounds(
    getAttribute(node, "data-pptv-bounds"),
    "PPTV-PROFILE-ASSET-BOUNDS",
    "opaque asset bounds",
    node,
    context,
  );
}

function parseTupleBounds(
  raw: string | undefined,
  code: string,
  label: string,
  node: PptvNode,
  context: ResolutionContext,
): PptvBounds | undefined {
  const normalized = raw?.trim();
  const parts =
    normalized === undefined || normalized === ""
      ? []
      : normalized.split(/[ \t\r\n\f]+/u);
  if (
    raw === undefined ||
    parts.length !== 4 ||
    parts.some((part) => !SVG_NUMBER_PATTERN.test(part))
  ) {
    pushNodeDiagnostic(
      context,
      node,
      code,
      `Object "${node.id}" requires finite unitless ${label} as "x y width height".`,
    );
    return undefined;
  }
  const values = parts.map((part) => normalizeZero(Number(part)));
  const bounds = {
    x: values[0] ?? Number.NaN,
    y: values[1] ?? Number.NaN,
    width: values[2] ?? Number.NaN,
    height: values[3] ?? Number.NaN,
  };
  if (!boundsAreFinite(bounds) || bounds.width <= 0 || bounds.height <= 0) {
    pushNodeDiagnostic(
      context,
      node,
      code,
      `Object "${node.id}" has invalid ${label}; width and height must be positive.`,
    );
    return undefined;
  }
  return bounds;
}

function exactCanvas(
  viewBox: readonly [number, number, number, number],
): viewBox is readonly [0, 0, 1600, 900] {
  return viewBox.every((value, index) => value === CANVAS_VIEWBOX[index]);
}

function addPoints(
  left: PptvPoint,
  right: PptvPoint,
  node: PptvNode,
  context: ResolutionContext,
): PptvPoint | undefined {
  const result = { x: left.x + right.x, y: left.y + right.y };
  if (!Number.isFinite(result.x) || !Number.isFinite(result.y)) {
    pushNumberDiagnostic(context, node, "world translation overflow");
    return undefined;
  }
  return result;
}

function offsetBounds(
  bounds: PptvBounds,
  offset: PptvPoint,
  node: PptvNode,
  context: ResolutionContext,
): PptvBounds | undefined {
  const result = {
    x: bounds.x + offset.x,
    y: bounds.y + offset.y,
    width: bounds.width,
    height: bounds.height,
  };
  if (!boundsAreFinite(result)) {
    pushNumberDiagnostic(context, node, "world bounds overflow");
    return undefined;
  }
  return result;
}

function unionBounds(bounds: readonly PptvBounds[]): PptvBounds | undefined {
  if (bounds.length === 0) return undefined;
  const first = bounds[0];
  if (first === undefined) return undefined;
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const entry of bounds.slice(1)) {
    left = Math.min(left, entry.x);
    top = Math.min(top, entry.y);
    right = Math.max(right, entry.x + entry.width);
    bottom = Math.max(bottom, entry.y + entry.height);
  }
  const result = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  return boundsAreFinite(result) ? result : undefined;
}

function boundsAreFinite(bounds: PptvBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    Number.isFinite(bounds.x + bounds.width) &&
    Number.isFinite(bounds.y + bounds.height)
  );
}

function pointInside(bounds: PptvBounds, x: number, y: number): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function validateConnectorReferences(
  objects: readonly InternalResolvedObject[],
  context: ResolutionContext,
): void {
  const ids = new Set<string>();
  visitResolvedObjects(objects, (object) => ids.add(object.id));
  visitResolvedObjects(objects, (object) => {
    if (object.kind !== "line") return;
    for (const [label, target] of [
      ["from", object.fromId],
      ["to", object.toId],
    ] as const) {
      if (target !== undefined && !ids.has(target)) {
        const source = context.sourceNodes.get(object.id);
        if (source !== undefined) {
          pushNodeDiagnostic(
            context,
            source,
            "PPTV-PROFILE-GEOMETRY",
            `Connector "${object.id}" ${label} target "${target}" is not a unique resolved object in "${object.containerId}".`,
          );
        }
      }
    }
  });
}

function visitResolvedObjects(
  objects: readonly InternalResolvedObject[],
  visitor: (object: InternalResolvedObject) => void,
): void {
  for (const object of objects) {
    visitor(object);
    if (object.kind === "group") {
      visitResolvedObjects(object.children, visitor);
    }
  }
}

function getAttribute(node: PptvNode, name: string): string | undefined {
  const normalized = name.toLowerCase();
  return Object.entries(node.attributes).find(
    ([candidate]) => candidate.toLowerCase() === normalized,
  )?.[1];
}

function parseSourceElement(
  node: PptvNode,
  document: PptvResolvableDocument,
): ParsedElement | undefined {
  const source = document.source.text.slice(
    node.sourceRange.charStart,
    node.sourceRange.charEnd,
  );
  const fragment = parseFragment(source, {
    scriptingEnabled: false,
  });
  const elements = fragment.childNodes.filter(isParsedElement);
  return elements.length === 1 && elements[0]?.tagName === node.elementName
    ? elements[0]
    : undefined;
}

function validateSlideRoot(
  slide: PptvSlide,
  deck: PptvDeck,
  context: ResolutionContext,
): void {
  const source = deck.source.text.slice(
    slide.sourceRange.charStart,
    slide.sourceRange.charEnd,
  );
  const fragment = parseFragment(source, { scriptingEnabled: false });
  const template = fragment.childNodes.find(
    (node): node is ParsedElement =>
      isParsedElement(node) && node.tagName === "template",
  );
  const content = (
    template as
      (ParsedElement & { readonly content?: ParsedFragment }) | undefined
  )?.content;
  const root = content?.childNodes.find(
    (node): node is ParsedElement =>
      isParsedElement(node) && node.tagName === "svg",
  );
  if (root === undefined) {
    context.diagnostics.push({
      code: "PPTV-PROFILE-INVALID-BASE",
      severity: "error",
      message: `Slide "${slide.id}" root SVG could not be reconstructed from its exact C4 range.`,
      slideId: slide.id,
      range: slide.sourceRange,
    });
    return;
  }

  for (const attribute of root.attrs) {
    const name =
      `${attribute.prefix === undefined || attribute.prefix === "" ? "" : `${attribute.prefix}:`}${attribute.name}`.toLowerCase();
    const validNamespace =
      (name !== "xmlns" || attribute.value === "http://www.w3.org/2000/svg") &&
      (name !== "xmlns:xlink" ||
        attribute.value === "http://www.w3.org/1999/xlink");
    if (SLIDE_ROOT_ATTRIBUTES.has(name) && validNamespace) continue;
    context.diagnostics.push({
      code: "PPTV-PROFILE-VIEWBOX",
      severity: "error",
      message: `Slide "${slide.id}" root SVG uses unsupported C6 canvas attribute "${name}".`,
      slideId: slide.id,
      range: slide.sourceRange,
    });
  }
}

function getParsedAttribute(
  element: ParsedElement,
  name: string,
): string | undefined {
  const normalized = name.toLowerCase();
  return element.attrs.find(
    (attribute) => attribute.name.toLowerCase() === normalized,
  )?.value;
}

function hasForbiddenTextAttributes(element: ParsedElement): boolean {
  return element.attrs.some((attribute) =>
    FORBIDDEN_TEXT_ATTRIBUTES.has(attribute.name.toLowerCase()),
  );
}

function isParsedElement(node: ParsedNode): node is ParsedElement {
  return "tagName" in node && "attrs" in node;
}

function isParsedText(node: ParsedNode): node is ParsedText {
  return node.nodeName === "#text";
}

function pushNumberDiagnostic(
  context: ResolutionContext,
  node: PptvNode,
  detail: string,
): void {
  pushNodeDiagnostic(
    context,
    node,
    "PPTV-PROFILE-NUMBER",
    `Object "${node.id}" ${detail}.`,
  );
}

function pushTransformDiagnostic(
  context: ResolutionContext,
  node: PptvNode,
): void {
  pushNodeDiagnostic(
    context,
    node,
    "PPTV-PROFILE-TRANSFORM",
    `Native group "${node.id}" accepts only one finite translate(tx ty) transform.`,
  );
}

function pushTextLinesDiagnostic(
  context: ResolutionContext,
  node: PptvNode,
  detail: string,
): void {
  pushNodeDiagnostic(
    context,
    node,
    "PPTV-PROFILE-TEXT-LINES",
    `Text object "${node.id}": ${detail}.`,
  );
}

function pushNodeDiagnostic(
  context: ResolutionContext,
  node: PptvNode,
  code: string,
  message: string,
): void {
  context.diagnostics.push({
    code,
    severity: "error",
    message,
    ...nodeSourceScope(node, context),
    objectId: node.id,
    range: node.openTagRange,
  });
}

function nodeSourceScope(
  node: PptvNode,
  context: ResolutionContext,
): Pick<Diagnostic, "slideId" | "diagramId"> {
  if (context.document.sourceKind === "html") {
    return {
      slideId: context.document.index.objects.get(node.id)?.slideId ?? "",
    };
  }
  return {
    diagramId: context.document.index.objects.get(node.id)?.diagramId ?? "",
  };
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) =>
    ERROR_SEVERITIES.has(diagnostic.severity),
  );
}

function cloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => cloneAndFreeze(child))) as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    clone[key] = cloneAndFreeze(child);
  }
  return Object.freeze(clone) as T;
}

export type { PptvResolvedObjectStyle, PptvResolvedStyle, PptvStyleProvenance };
