/**
 * Hierarchical, source-hash-bound PPTV semantic snapshot.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 */

import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import {
  parseManifest,
  slideId,
  STABLE_ID_PATTERN,
  validateManifest,
} from "./manifest.js";
import { scanPptvSource } from "./scan.js";
import { hasErrors, SourceMapper } from "./source.js";
import type {
  Diagnostic,
  IndexedDiagramObject,
  IndexedLibrary,
  IndexedObject,
  IndexedSlide,
  IndexedStyle,
  IndexedTheme,
  LoadDiagramOptions,
  LoadDeckOptions,
  LoadPptvDocumentOptions,
  PptvBaseStyle,
  PptvDeck,
  PptvDiagram,
  PptvDiagramIndex,
  PptvDocument,
  PptvExportMode,
  PptvInput,
  PptvLibrary,
  PptvManifestSlide,
  PptvNode,
  PptvRole,
  PptvScan,
  PptvSlide,
  PptvSourceIndex,
  PptvSectionKind,
  PptvSectionRef,
  PptvTheme,
  SourceRange,
} from "./types.js";

type ParentNode = DefaultTreeAdapterMap["parentNode"];
type Node = DefaultTreeAdapterMap["node"];
type ElementNode = DefaultTreeAdapterMap["element"];
type TextNode = DefaultTreeAdapterMap["textNode"];
type Location = NonNullable<ElementNode["sourceCodeLocation"]>;

const ROLES = new Set<PptvRole>([
  "shape",
  "text",
  "connector",
  "group",
  "asset",
]);
const EXPORT_MODES = new Set<PptvExportMode>([
  "native",
  "svg",
  "raster",
  "ignore",
]);
const NON_RENDERED = new Set(["defs", "metadata", "title", "desc"]);
const NATIVE_ELEMENTS: Record<PptvRole, ReadonlySet<string>> = {
  shape: new Set(["rect", "circle", "ellipse"]),
  text: new Set(["text"]),
  connector: new Set(["line", "polyline"]),
  group: new Set(["g"]),
  asset: new Set(["image", "g"]),
};
const SVG_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export class PptvLoadError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = "PptvLoadError";
    this.diagnostics = diagnostics;
  }
}

export async function loadDeck(
  input: PptvInput,
  options: LoadDeckOptions = {},
): Promise<PptvDeck> {
  const scan = await scanPptvSource(input, options);
  assertSafelyScanned(scan);
  if (scan.kind !== "html") {
    throw wrongDocumentKind("HTML deck", scan);
  }
  return loadDeckFromScan(scan, options);
}

export async function loadDiagram(
  input: PptvInput,
  options: LoadDiagramOptions = {},
): Promise<PptvDiagram> {
  const scan = await scanPptvSource(input, options);
  assertSafelyScanned(scan);
  if (scan.kind !== "svg") {
    throw wrongDocumentKind("standalone SVG diagram", scan);
  }
  return loadDiagramFromScan(scan);
}

export async function loadPptvDocument(
  input: PptvInput,
  options: LoadPptvDocumentOptions = {},
): Promise<PptvDocument> {
  const scan = await scanPptvSource(input, options);
  assertSafelyScanned(scan);
  if (scan.kind === "html") return loadDeckFromScan(scan, options);
  if (scan.kind === "svg") return loadDiagramFromScan(scan);
  throw wrongDocumentKind("HTML deck or standalone SVG diagram", scan);
}

function assertSafelyScanned(scan: PptvScan): void {
  if (scan.diagnostics.some((diagnostic) => diagnostic.severity === "fatal")) {
    throw new PptvLoadError("PPTV source could not be scanned safely.", [
      ...scan.diagnostics,
    ]);
  }
}

function wrongDocumentKind(expected: string, scan: PptvScan): PptvLoadError {
  return new PptvLoadError(`PPTV source is not a supported ${expected}.`, [
    ...scan.diagnostics,
    {
      code: "PPTV-DOCUMENT-KIND",
      severity: "error",
      message: `Expected ${expected}; recognized source kind "${scan.kind}".`,
    },
  ]);
}

function loadDeckFromScan(scan: PptvScan, options: LoadDeckOptions): PptvDeck {
  const parsedManifest = parseManifest(scan);
  const diagnostics = [...scan.diagnostics, ...parsedManifest.diagnostics];

  if (
    parsedManifest.manifest === undefined ||
    parsedManifest.ranges === undefined
  ) {
    throw new PptvLoadError("PPTV manifest could not be loaded.", diagnostics);
  }

  const manifest = parsedManifest.manifest;
  diagnostics.push(...validateManifest(manifest, scan));
  const mapper = new SourceMapper(scan.source.text, scan.source.bytes);
  const slideOrder = manifest.slides.map(slideId);
  const selectedIds =
    options.slides === undefined
      ? slideOrder
      : slideOrder.filter((id) => options.slides?.includes(id) === true);
  const slides = new Map<string, PptvSlide>();
  const themes = new Map<string, PptvTheme>();
  const libraries = new Map<string, PptvLibrary>();
  const indexedSlides = new Map<string, IndexedSlide>();
  const indexedObjects = new Map<string, IndexedObject>();
  let indexedStyle: IndexedStyle | undefined;
  const indexedThemes = new Map<string, IndexedTheme>();
  const indexedLibraries = new Map<string, IndexedLibrary>();
  const objectDeclarations = new Map<string, ParsedIndexedObject>();
  const slideSections = sectionsById(scan.sections, "slide");
  const styleSections = sectionsById(scan.sections, "style");
  const themeSections = sectionsById(scan.sections, "theme");
  const librarySections = sectionsById(scan.sections, "library");
  let baseStyle: PptvBaseStyle | undefined;

  const baseStyleDeclarations = styleSections.get("base") ?? [];
  const baseStyleSection =
    baseStyleDeclarations.length === 1 ? baseStyleDeclarations[0] : undefined;
  if (baseStyleSection?.contentRange !== undefined) {
    baseStyle = {
      id: "base",
      cssText: scan.source.text.slice(
        baseStyleSection.contentRange.charStart,
        baseStyleSection.contentRange.charEnd,
      ),
      sourceRange: baseStyleSection.range,
      contentRange: baseStyleSection.contentRange,
    };
    indexedStyle = {
      id: "base",
      range: baseStyleSection.range,
      contentRange: baseStyleSection.contentRange,
    };
  }

  for (const [id, declarations] of themeSections) {
    const section = declarations.length === 1 ? declarations[0] : undefined;
    if (section?.contentRange !== undefined) {
      themes.set(id, {
        id,
        cssText: scan.source.text.slice(
          section.contentRange.charStart,
          section.contentRange.charEnd,
        ),
        sourceRange: section.range,
        contentRange: section.contentRange,
      });
      indexedThemes.set(id, {
        id,
        range: section.range,
        contentRange: section.contentRange,
      });
    }
  }
  for (const [id, declarations] of librarySections) {
    const section = declarations.length === 1 ? declarations[0] : undefined;
    if (section !== undefined) {
      libraries.set(id, {
        id,
        sourceRange: section.range,
      });
      indexedLibraries.set(id, {
        id,
        range: section.range,
      });
    }
  }

  for (const id of new Set(selectedIds)) {
    const declarations = slideSections.get(id);
    const section = declarations?.length === 1 ? declarations[0] : undefined;
    if (
      section?.contentRange === undefined ||
      section.openTagRange === undefined
    )
      continue;
    const manifestSlide = manifest.slides.find(
      (candidate) => slideId(candidate) === id,
    );
    const parsed = parseSlideSection(
      id,
      manifestSlide,
      section.contentRange,
      section.range,
      scan.source.text,
      mapper,
      objectDeclarations,
    );
    diagnostics.push(...parsed.diagnostics);
    if (parsed.slide !== undefined) {
      if (
        parsed.svgRange === undefined ||
        parsed.svgOpenTagRange === undefined ||
        parsed.svgAttributeRanges === undefined
      ) {
        throw new Error(
          `Internal PPTV index invariant failed for slide "${id}".`,
        );
      }
      slides.set(id, parsed.slide);
      indexedSlides.set(id, {
        id,
        range: section.range,
        svgRange: parsed.svgRange,
        openTagRange: parsed.svgOpenTagRange,
        attributeRanges: parsed.svgAttributeRanges,
        objectIds: parsed.objectIds,
      });
      for (const object of parsed.indexedObjects)
        indexedObjects.set(object.id, object);
    }
  }

  for (const selected of options.slides ?? []) {
    if (!slideOrder.includes(selected)) {
      diagnostics.push({
        code: "PPTV-MANIFEST-MISSING-REFERENCE",
        severity: "error",
        message: `Requested slide "${selected}" is not in the manifest.`,
      });
    }
  }

  const index: PptvSourceIndex = {
    sourceSha256: scan.source.sha256,
    manifest: parsedManifest.ranges.root,
    manifestFields: parsedManifest.ranges.fields,
    manifestSlideEntries: parsedManifest.ranges.slideEntries,
    slides: indexedSlides,
    objects: indexedObjects,
    ...(indexedStyle === undefined ? {} : { style: indexedStyle }),
    themes: indexedThemes,
    libraries: indexedLibraries,
    runtimes: scan.sections.filter(
      (section) =>
        section.kind === "viewer-runtime" || section.kind === "editor-runtime",
    ),
  };

  return freezeDeck({
    version: manifest.pptv,
    sourceKind: "html",
    ...(manifest.title === undefined ? {} : { title: manifest.title }),
    ...(manifest.theme === undefined ? {} : { activeTheme: manifest.theme }),
    slideOrder,
    slides,
    ...(baseStyle === undefined ? {} : { baseStyle }),
    themes,
    libraries,
    source: scan.source,
    index,
    manifest,
    materialization: {
      level: "semantic",
      slideIds: selectedIds,
      complete: selectedIds.length === slideOrder.length,
    },
    diagnostics,
  });
}

function loadDiagramFromScan(scan: PptvScan): PptvDiagram {
  const diagnostics = [...scan.diagnostics];
  const rootSection = scan.sections.find((section) => section.kind === "slide");
  const root =
    rootSection === undefined
      ? undefined
      : parseStandaloneRoot(rootSection, scan.source.text);
  const id = root === undefined ? undefined : getAttribute(root, "id");
  const version =
    root === undefined ? undefined : getAttribute(root, "data-pptv-version");
  const namespace =
    root === undefined ? undefined : getAttribute(root, "xmlns");
  const viewBox =
    root === undefined
      ? undefined
      : parseViewBox(
          getAttribute(root, "viewBox") ?? getAttribute(root, "viewbox"),
        );

  if (
    rootSection?.openTagRange === undefined ||
    root?.sourceCodeLocation == null ||
    id === undefined ||
    !STABLE_ID_PATTERN.test(id) ||
    version !== "0.1" ||
    namespace !== "http://www.w3.org/2000/svg" ||
    viewBox === undefined
  ) {
    throw new PptvLoadError(
      "Standalone PPTV SVG root could not be loaded semantically.",
      diagnostics,
    );
  }

  const mapper = new SourceMapper(scan.source.text, scan.source.bytes);
  const baseOffset = rootSection.range.charStart;
  const rootLocation = root.sourceCodeLocation;
  const rootOpenLocation = rootLocation.startTag ?? rootLocation;
  const rootOpenTagRange = offsetRange(rootOpenLocation, baseOffset, mapper);
  const attributeRanges = indexAttributeRanges(root, baseOffset, mapper);
  const declarations = new Map<string, ParsedIndexedObject>();
  declarations.set(id, {
    id,
    elementRange: rootSection.range,
    openTagRange: rootOpenTagRange,
    attributeRanges,
  });
  const objectIds: string[] = [];
  const parsedIndexes: ParsedIndexedObject[] = [];
  const children: PptvNode[] = [];
  const scope: SemanticScope = { kind: "diagram", id };
  for (const child of root.childNodes) {
    if (!isElement(child) || NON_RENDERED.has(child.tagName)) continue;
    const parsed = parseObject(
      child,
      scope,
      null,
      baseOffset,
      mapper,
      declarations,
      diagnostics,
      objectIds,
      parsedIndexes,
    );
    if (parsed !== undefined) children.push(parsed);
  }

  const objects = new Map<string, IndexedDiagramObject>();
  for (const indexed of parsedIndexes) {
    objects.set(indexed.id, { ...indexed, diagramId: id });
  }
  const index: PptvDiagramIndex = {
    sourceSha256: scan.source.sha256,
    root: {
      id,
      range: rootSection.range,
      openTagRange: rootOpenTagRange,
      attributeRanges,
      objectIds,
    },
    objects,
  };

  return freezeDiagram({
    version: "0.1",
    sourceKind: "svg",
    id,
    viewBox,
    children,
    sourceRange: rootSection.range,
    source: scan.source,
    index,
    diagnostics,
  });
}

function parseStandaloneRoot(
  section: PptvSectionRef,
  sourceText: string,
): ElementNode | undefined {
  const fragment = parseFragment(
    sourceText.slice(section.range.charStart, section.range.charEnd),
    {
      sourceCodeLocationInfo: true,
      scriptingEnabled: false,
    },
  );
  const roots = fragment.childNodes.filter(isElement);
  return roots.length === 1 && roots[0]?.tagName === "svg"
    ? roots[0]
    : undefined;
}

export function validateDeck(deck: PptvDeck): Diagnostic[] {
  return [...deck.diagnostics];
}

export function deckIsValid(deck: PptvDeck): boolean {
  return !hasErrors(deck.diagnostics);
}

export function validateDiagram(diagram: PptvDiagram): Diagnostic[] {
  return [...diagram.diagnostics];
}

export function diagramIsValid(diagram: PptvDiagram): boolean {
  return !hasErrors(diagram.diagnostics);
}

function sectionsById(
  sections: readonly PptvSectionRef[],
  kind: PptvSectionKind,
): Map<string, PptvSectionRef[]> {
  const result = new Map<string, PptvSectionRef[]>();
  for (const section of sections) {
    if (section.kind !== kind || section.id === undefined) continue;
    const declarations = result.get(section.id) ?? [];
    declarations.push(section);
    result.set(section.id, declarations);
  }
  return result;
}

interface ParsedSlide {
  slide?: PptvSlide;
  svgRange?: SourceRange;
  svgOpenTagRange?: SourceRange;
  svgAttributeRanges?: ReadonlyMap<string, SourceRange>;
  objectIds: string[];
  indexedObjects: IndexedObject[];
  diagnostics: Diagnostic[];
}

interface ParsedIndexedObject {
  id: string;
  elementRange: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: Map<string, SourceRange>;
  directTextRange?: SourceRange;
}

type SemanticScope =
  | { readonly kind: "slide"; readonly id: string }
  | { readonly kind: "diagram"; readonly id: string };

function scopeDiagnostic(
  scope: SemanticScope,
): Pick<Diagnostic, "slideId" | "diagramId"> {
  return scope.kind === "slide"
    ? { slideId: scope.id }
    : { diagramId: scope.id };
}

function parseSlideSection(
  slideIdValue: string,
  manifestSlide: string | PptvManifestSlide | undefined,
  contentRange: SourceRange,
  sectionRange: SourceRange,
  sourceText: string,
  mapper: SourceMapper,
  declarations: Map<string, ParsedIndexedObject>,
): ParsedSlide {
  const diagnostics: Diagnostic[] = [];
  const fragmentText = sourceText.slice(
    contentRange.charStart,
    contentRange.charEnd,
  );
  const fragment = parseFragment(fragmentText, {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
  });
  const directElements = fragment.childNodes.filter(isElement);
  const hasUnexpectedContent = fragment.childNodes.some(
    (node) =>
      !isElement(node) &&
      node.nodeName !== "#comment" &&
      (!isText(node) || node.value.trim() !== ""),
  );
  const svg =
    directElements.length === 1 && directElements[0]?.tagName === "svg"
      ? directElements[0]
      : undefined;
  if (svg?.sourceCodeLocation == null) {
    diagnostics.push({
      code: "PPTV-SVG-MISSING-ROOT",
      severity: "error",
      message: `Slide template "${slideIdValue}" must contain exactly one direct root svg element and otherwise only whitespace or comments.`,
      range: contentRange,
      slideId: slideIdValue,
    });
    return { objectIds: [], indexedObjects: [], diagnostics };
  }
  if (hasUnexpectedContent) {
    diagnostics.push({
      code: "PPTV-SVG-MISSING-ROOT",
      severity: "error",
      message: `Slide template "${slideIdValue}" contains non-inert content outside its root svg.`,
      range: contentRange,
      slideId: slideIdValue,
    });
  }

  const baseOffset = contentRange.charStart;
  const svgRange = offsetRange(svg.sourceCodeLocation, baseOffset, mapper);
  const svgOpenTagRange =
    svg.sourceCodeLocation.startTag === undefined
      ? svgRange
      : offsetRange(svg.sourceCodeLocation.startTag, baseOffset, mapper);
  const svgAttributeRanges = indexAttributeRanges(svg, baseOffset, mapper);
  const rootId = getAttribute(svg, "id");
  if (rootId !== slideIdValue) {
    diagnostics.push({
      code: "PPTV-MANIFEST-MIRROR-MISMATCH",
      severity: "error",
      message: `Slide template "${slideIdValue}" contains svg id "${rootId ?? "(missing)"}".`,
      range: svgOpenTagRange,
      slideId: slideIdValue,
    });
  }

  const viewBox = parseViewBox(
    getAttribute(svg, "viewBox") ?? getAttribute(svg, "viewbox"),
  );
  if (viewBox === undefined) {
    diagnostics.push({
      code: "PPTV-SVG-VIEWBOX",
      severity: "error",
      message: `Slide "${slideIdValue}" requires a four-number viewBox with positive width and height.`,
      range: svgOpenTagRange,
      slideId: slideIdValue,
    });
  }

  const objectIds: string[] = [];
  const parsedIndexes: ParsedIndexedObject[] = [];
  const children: PptvNode[] = [];
  const scope: SemanticScope = { kind: "slide", id: slideIdValue };
  for (const child of svg.childNodes) {
    if (!isElement(child) || NON_RENDERED.has(child.tagName)) continue;
    const parsed = parseObject(
      child,
      scope,
      null,
      baseOffset,
      mapper,
      declarations,
      diagnostics,
      objectIds,
      parsedIndexes,
    );
    if (parsed !== undefined) children.push(parsed);
  }

  const manifestLayout =
    typeof manifestSlide === "string" ? undefined : manifestSlide?.layout;
  const svgLayout = getAttribute(svg, "data-pptv-layout");
  const layout = manifestLayout ?? svgLayout;
  const hidden =
    typeof manifestSlide === "string"
      ? false
      : (manifestSlide?.hidden ?? false);
  const slide: PptvSlide = {
    id: slideIdValue,
    ...(layout === undefined ? {} : { layout }),
    hidden,
    viewBox: viewBox ?? [0, 0, 1, 1],
    children,
    sourceRange: sectionRange,
  };

  const indexedObjects = parsedIndexes.map<IndexedObject>((indexed) => ({
    ...indexed,
    slideId: slideIdValue,
  }));
  return {
    slide,
    svgRange,
    svgOpenTagRange,
    svgAttributeRanges,
    objectIds,
    indexedObjects,
    diagnostics,
  };
}

function parseObject(
  element: ElementNode,
  scope: SemanticScope,
  parentId: string | null,
  baseOffset: number,
  mapper: SourceMapper,
  declarations: Map<string, ParsedIndexedObject>,
  diagnostics: Diagnostic[],
  objectIds: string[],
  indexedObjects: ParsedIndexedObject[],
): PptvNode | undefined {
  const location = element.sourceCodeLocation;
  if (location == null) return undefined;
  const sourceRange = offsetRange(location, baseOffset, mapper);
  const openTagRange =
    location.startTag === undefined
      ? sourceRange
      : offsetRange(location.startTag, baseOffset, mapper);
  const id = getAttribute(element, "id");
  const roleValue = getAttribute(element, "data-pptv-role");
  const exportValue = getAttribute(element, "data-pptv-export");

  if (
    id === undefined ||
    roleValue === undefined ||
    exportValue === undefined
  ) {
    diagnostics.push({
      code: "PPTV-ID-MISSING",
      severity: "error",
      message: `Renderable <${element.tagName}> outside an opaque boundary requires id, data-pptv-role, and data-pptv-export.`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
    });
    return undefined;
  }

  if (!STABLE_ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "PPTV-ID-INVALID",
      severity: "error",
      message: `Object id "${id}" is not a valid PPTV stable ID.`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
      objectId: id,
    });
  }
  if (!ROLES.has(roleValue as PptvRole)) {
    diagnostics.push({
      code: "PPTV-SVG-ROLE",
      severity: "error",
      message: `Object "${id}" has unsupported role "${roleValue}".`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
      objectId: id,
    });
    return undefined;
  }
  if (!EXPORT_MODES.has(exportValue as PptvExportMode)) {
    diagnostics.push({
      code: "PPTV-SVG-EXPORT",
      severity: "error",
      message: `Object "${id}" has unsupported export mode "${exportValue}".`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
      objectId: id,
    });
    return undefined;
  }

  const role = roleValue as PptvRole;
  const exportMode = exportValue as PptvExportMode;
  const opaque =
    exportMode === "svg" || exportMode === "raster" || exportMode === "ignore";
  if (!opaque && !NATIVE_ELEMENTS[role].has(element.tagName)) {
    diagnostics.push({
      code: "PPTV-SVG-UNSUPPORTED-NATIVE",
      severity: "error",
      message: `Native role "${role}" is not compatible with <${element.tagName}>.`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
      objectId: id,
    });
  }

  const attributeRanges = new Map<string, SourceRange>();
  for (const attribute of element.attrs) {
    const name = qualifiedAttributeName(attribute);
    const attributeLocation = findAttributeLocation(location, name);
    if (attributeLocation !== undefined) {
      attributeRanges.set(
        name,
        offsetRange(attributeLocation, baseOffset, mapper),
      );
    }
  }

  const directTextRange =
    role === "text"
      ? getDirectTextRange(element, baseOffset, mapper)
      : undefined;
  const text = role === "text" ? readText(element) : undefined;
  const indexed: ParsedIndexedObject = {
    id,
    elementRange: sourceRange,
    openTagRange,
    attributeRanges,
    ...(directTextRange === undefined ? {} : { directTextRange }),
  };
  const prior = declarations.get(id);
  if (prior !== undefined) {
    diagnostics.push({
      code: "PPTV-ID-DUPLICATE",
      severity: "error",
      message: `Stable id "${id}" is declared more than once in the semantic document.`,
      range: openTagRange,
      ...scopeDiagnostic(scope),
      objectId: id,
      related: [
        { message: "First declaration is here.", range: prior.openTagRange },
      ],
    });
  } else {
    declarations.set(id, indexed);
    indexedObjects.push(indexed);
    objectIds.push(id);
  }

  const children: PptvNode[] = [];
  if (!opaque && role === "group") {
    for (const child of element.childNodes) {
      if (!isElement(child) || NON_RENDERED.has(child.tagName)) continue;
      const parsed = parseObject(
        child,
        scope,
        id,
        baseOffset,
        mapper,
        declarations,
        diagnostics,
        objectIds,
        indexedObjects,
      );
      if (parsed !== undefined) children.push(parsed);
    }
  } else if (!opaque && role === "text") {
    for (const child of invalidTextDescendants(element)) {
      diagnostics.push({
        code: "PPTV-SVG-UNSUPPORTED-NATIVE",
        severity: "error",
        message: `Native text object "${id}" can contain text and nested constrained tspan elements only.`,
        range: offsetRange(
          child.sourceCodeLocation ?? location,
          baseOffset,
          mapper,
        ),
        ...scopeDiagnostic(scope),
        objectId: id,
      });
    }
  } else if (!opaque) {
    for (const child of element.childNodes) {
      if (isElement(child) && !NON_RENDERED.has(child.tagName)) {
        diagnostics.push({
          code: "PPTV-SVG-UNSUPPORTED-NATIVE",
          severity: "error",
          message: `Native non-group object "${id}" cannot contain renderable child <${child.tagName}>.`,
          range: offsetRange(
            child.sourceCodeLocation ?? location,
            baseOffset,
            mapper,
          ),
          ...scopeDiagnostic(scope),
          objectId: id,
        });
      }
    }
  }

  const attributes = Object.fromEntries(
    element.attrs.map((attribute) => [
      qualifiedAttributeName(attribute),
      attribute.value,
    ]),
  );
  const classes = (getAttribute(element, "class") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return {
    id,
    role,
    exportMode,
    elementName: element.tagName,
    classes,
    attributes,
    parentId,
    children,
    ...(text === undefined ? {} : { text }),
    opaque,
    sourceRange,
    openTagRange,
    ...(directTextRange === undefined ? {} : { directTextRange }),
  };
}

function invalidTextDescendants(element: ElementNode): ElementNode[] {
  const invalid: ElementNode[] = [];
  const pending = [...element.childNodes];
  while (pending.length > 0) {
    const child = pending.pop();
    if (child === undefined || !isElement(child)) continue;
    if (child.tagName !== "tspan") invalid.push(child);
    if ("childNodes" in child) pending.push(...child.childNodes);
  }
  return invalid;
}

function parseViewBox(
  value: string | undefined,
): [number, number, number, number] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    /^\s*,/u.test(value) ||
    /,\s*$/u.test(value) ||
    /,\s*,/u.test(value)
  ) {
    return undefined;
  }
  const tokens = trimmed.split(/[\s,]+/);
  if (tokens.some((entry) => !SVG_NUMBER_PATTERN.test(entry))) return undefined;
  const values = tokens.map(Number);
  if (
    values.length !== 4 ||
    values.some((entry) => !Number.isFinite(entry)) ||
    (values[2] ?? 0) <= 0 ||
    (values[3] ?? 0) <= 0
  ) {
    return undefined;
  }
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

function getDirectTextRange(
  element: ElementNode,
  baseOffset: number,
  mapper: SourceMapper,
): SourceRange | undefined {
  if (element.childNodes.length === 0) {
    const start = element.sourceCodeLocation?.startTag?.endOffset;
    const end = element.sourceCodeLocation?.endTag?.startOffset;
    return start === undefined || end === undefined
      ? undefined
      : mapper.range(baseOffset + start, baseOffset + end);
  }
  if (!element.childNodes.every(isText)) {
    return undefined;
  }
  const textNodes = element.childNodes.filter(isText);
  const first = textNodes[0]?.sourceCodeLocation;
  const last = textNodes.at(-1)?.sourceCodeLocation;
  if (first == null || last == null) return undefined;
  return mapper.range(
    baseOffset + first.startOffset,
    baseOffset + last.endOffset,
  );
}

function readText(element: ElementNode): string {
  let text = "";
  walk(element, (node) => {
    if (isText(node)) text += node.value;
  });
  return text;
}

function getAttribute(element: ElementNode, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  return element.attrs.find(
    (attribute) =>
      qualifiedAttributeName(attribute).toLowerCase() === lowerName,
  )?.value;
}

function qualifiedAttributeName(
  attribute: ElementNode["attrs"][number],
): string {
  return attribute.prefix == null || attribute.prefix === ""
    ? attribute.name
    : `${attribute.prefix}:${attribute.name}`;
}

function indexAttributeRanges(
  element: ElementNode,
  baseOffset: number,
  mapper: SourceMapper,
): Map<string, SourceRange> {
  const ranges = new Map<string, SourceRange>();
  const location = element.sourceCodeLocation;
  if (location == null) return ranges;
  for (const attribute of element.attrs) {
    const name = qualifiedAttributeName(attribute);
    const attributeLocation = findAttributeLocation(location, name);
    if (attributeLocation !== undefined) {
      ranges.set(name, offsetRange(attributeLocation, baseOffset, mapper));
    }
  }
  return ranges;
}

function findAttributeLocation(
  location: Location,
  qualifiedName: string,
): NonNullable<Location["attrs"]>[string] | undefined {
  const attributes = location.attrs;
  if (attributes === undefined) return undefined;
  return (
    attributes[qualifiedName] ??
    Object.entries(attributes).find(
      ([name]) => name.toLowerCase() === qualifiedName.toLowerCase(),
    )?.[1]
  );
}

function findElement(
  root: ParentNode,
  tagName: string,
): ElementNode | undefined {
  let found: ElementNode | undefined;
  walk(root, (node) => {
    if (found === undefined && isElement(node) && node.tagName === tagName)
      found = node;
  });
  return found;
}

function walk(root: Node, visitor: (node: Node) => void): void {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    visitor(node);
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        const child = node.childNodes[index];
        if (child !== undefined) pending.push(child);
      }
    }
  }
}

function isElement(node: Node): node is ElementNode {
  return "tagName" in node && "attrs" in node;
}

function isText(node: Node): node is TextNode {
  return node.nodeName === "#text";
}

function offsetRange(
  location: Pick<Location, "startOffset" | "endOffset">,
  baseOffset: number,
  mapper: SourceMapper,
): SourceRange {
  return mapper.range(
    baseOffset + location.startOffset,
    baseOffset + location.endOffset,
  );
}

function freezeDeck(deck: PptvDeck): PptvDeck {
  const indexedSlides = new Map<string, IndexedSlide>();
  for (const [id, slide] of deck.index.slides) {
    indexedSlides.set(id, {
      ...slide,
      attributeRanges: immutableMap(slide.attributeRanges),
      objectIds: [...slide.objectIds],
    });
  }
  const index: PptvSourceIndex = {
    ...deck.index,
    manifestFields: immutableMap(deck.index.manifestFields),
    manifestSlideEntries: immutableMap(deck.index.manifestSlideEntries),
    slides: immutableMap(indexedSlides),
    objects: immutableMap(deck.index.objects),
    themes: immutableMap(deck.index.themes),
    libraries: immutableMap(deck.index.libraries),
    runtimes: deepFreeze([...deck.index.runtimes]),
  };
  return deepFreeze({
    ...deck,
    slideOrder: [...deck.slideOrder],
    slides: immutableMap(deck.slides),
    themes: immutableMap(deck.themes),
    libraries: immutableMap(deck.libraries),
    index: deepFreeze(index),
    manifest: deepFreeze(deck.manifest),
    materialization: {
      ...deck.materialization,
      slideIds: [...deck.materialization.slideIds],
    },
    diagnostics: [...deck.diagnostics],
  });
}

function freezeDiagram(diagram: PptvDiagram): PptvDiagram {
  const indexedObjects = new Map<string, IndexedDiagramObject>();
  for (const [id, object] of diagram.index.objects) {
    indexedObjects.set(id, {
      ...object,
      attributeRanges: immutableMap(object.attributeRanges),
    });
  }
  const index: PptvDiagramIndex = {
    ...diagram.index,
    root: deepFreeze({
      ...diagram.index.root,
      attributeRanges: immutableMap(diagram.index.root.attributeRanges),
      objectIds: [...diagram.index.root.objectIds],
    }),
    objects: immutableMap(indexedObjects),
  };
  return deepFreeze({
    ...diagram,
    viewBox: [...diagram.viewBox],
    children: [...diagram.children],
    index: deepFreeze(index),
    diagnostics: [...diagram.diagnostics],
  });
}

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>;
  readonly [Symbol.toStringTag] = "Map";

  constructor(values: ReadonlyMap<K, V>) {
    this.#values = new Map(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: K): V | undefined {
    return this.#values.get(key);
  }

  has(key: K): boolean {
    return this.#values.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#values.entries();
  }

  keys(): MapIterator<K> {
    return this.#values.keys();
  }

  values(): MapIterator<V> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.#values.forEach((value, key) =>
      callbackfn.call(thisArg, value, key, this),
    );
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

function immutableMap<K, V>(values: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const entries = new Map<K, V>();
  for (const [key, value] of values) {
    entries.set(key, deepFreeze(value));
  }
  return new ImmutableMapView(entries);
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    Object.isFrozen(value) ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}
