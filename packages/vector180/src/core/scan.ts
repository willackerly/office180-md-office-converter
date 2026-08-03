/**
 * Non-executing Vector180 container scanner.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 */

import {
  parse,
  parseFragment,
  type DefaultTreeAdapterMap,
  type ParserError,
} from "parse5";
import { SaxesParser } from "saxes";

import {
  detectWireDialect,
  wireAttribute,
  wireCssTokenPrefix,
  type VisualDialect,
} from "./dialect.js";
import { PROFILE_ID_PATTERN, STABLE_ID_PATTERN } from "./manifest.js";
import { materializeSource, sha256Hex, SourceMapper } from "./source.js";
import type {
  Diagnostic,
  Vector180Input,
  Vector180Scan,
  Vector180SectionKind,
  Vector180SectionRef,
  ScanOptions,
  SourceRange,
  VisualWireFamily,
} from "./types.js";

type DocumentNode = DefaultTreeAdapterMap["document"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];
type Node = DefaultTreeAdapterMap["node"];
type ElementNode = DefaultTreeAdapterMap["element"];
type TemplateNode = DefaultTreeAdapterMap["template"];

const SECTION_RANK: Partial<Record<Vector180SectionKind, number>> = {
  manifest: 1,
  "output-mount": 2,
  slide: 3,
  library: 4,
  style: 5,
  theme: 6,
  "viewer-runtime": 7,
  "editor-runtime": 7,
};

const REFERENCE_RUNTIME_DIGESTS = new Map([
  [
    "vector180-browser/0.1",
    "8732b69a203a3382f9037f30085c347bd2f2bddfd1713d4959b20dbd3d2c9293",
  ],
  [
    "pptv-browser/0.1",
    "373b44a1b3779bc9373d9e96222891b2c4886dc07f88cfd271f319ba341e75a5",
  ],
]);

const FORBIDDEN_EMBED_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "base",
  "discard",
  "embed",
  "foreignobject",
  "iframe",
  "link",
  "object",
  "set",
  "style",
]);
const CSS_RESOURCE_ATTRIBUTES = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
  "style",
]);
const DEFAULT_MAX_ELEMENTS = 100_000;
const DEFAULT_MAX_DEPTH = 512;
const SVG_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export async function scanVector180Source(
  input: Vector180Input,
  options: ScanOptions = {},
): Promise<Vector180Scan> {
  const materialized = await materializeSource(input, options);
  const kind = identifySourceKind(
    materialized.document.name,
    materialized.document.text,
  );
  const detection = detectWireDialect(kind, materialized.document.text);
  const document =
    detection.dialect === undefined
      ? materialized.document
      : sourceWithWireFamily(
          materialized.document,
          detection.dialect.wireFamily,
        );
  const diagnostics = [...materialized.diagnostics];
  const mapper = new SourceMapper(document.text, document.bytes);

  if (detection.mixed) {
    diagnostics.push({
      code: "VECTOR180-NAMESPACE-MIXED",
      severity: "fatal",
      message:
        "Source mixes canonical Vector180 and legacy PPTV control vocabularies; dialect selection is whole-document.",
      related: [
        ...detection.vector180Evidence.map((marker) => ({
          message: `Canonical evidence: ${marker}.`,
        })),
        ...detection.legacyEvidence.map((marker) => ({
          message: `Legacy evidence: ${marker}.`,
        })),
      ],
    });
  } else if (kind === "unknown" || detection.dialect === undefined) {
    diagnostics.push({
      code: "VECTOR180-SCAN-UNRECOGNIZED",
      severity: "fatal",
      message:
        "Source is not a recognizable canonical Vector180 or legacy PPTV HTML, SVG, or manifest document.",
    });
  }

  if (kind === "unknown" || detection.dialect === undefined) {
    return {
      kind,
      encoding: "utf-8",
      source: document,
      sections: [],
      diagnostics,
    };
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "fatal")) {
    return {
      kind,
      encoding: "utf-8",
      source: document,
      sections: [],
      diagnostics,
    };
  }

  if (kind === "html") {
    return await scanHtml(
      document,
      mapper,
      diagnostics,
      options,
      detection.dialect,
    );
  }

  if (kind === "svg") {
    if (!validateStandaloneSvgXml(document, mapper, diagnostics)) {
      return {
        kind,
        encoding: "utf-8",
        source: document,
        sections: [],
        diagnostics,
      };
    }
    return scanSvg(document, mapper, diagnostics, options, detection.dialect);
  }

  return {
    kind,
    wireFamily: detection.dialect.wireFamily,
    encoding: "utf-8",
    source: document,
    sections: [
      {
        kind: "manifest",
        range: mapper.range(0, document.text.length),
        contentRange: mapper.range(
          document.text.startsWith("\uFEFF") ? 1 : 0,
          document.text.length,
        ),
        attributes: {},
      },
    ],
    diagnostics,
  };
}

function validateStandaloneSvgXml(
  source: Vector180Scan["source"],
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
): boolean {
  const parser = new SaxesParser({
    xmlns: true,
    fragment: false,
    defaultXMLVersion: "1.0",
  });
  let policyFailure: string | undefined;

  parser.on("xmldecl", (declaration) => {
    if (declaration.version !== undefined && declaration.version !== "1.0") {
      policyFailure =
        "Standalone Vector180 SVG requires XML 1.0 when an XML declaration is present.";
      throw new Error(policyFailure);
    }
  });
  parser.on("doctype", () => {
    policyFailure =
      "Standalone Vector180 SVG forbids DOCTYPE, DTD, and custom entity declarations.";
    throw new Error(policyFailure);
  });

  try {
    parser.write(source.text).close();
    return true;
  } catch (error) {
    const position = Math.max(
      0,
      Math.min(source.text.length, parser.position - 1),
    );
    diagnostics.push({
      code: "VECTOR180-SCAN-SVG-XML",
      severity: "fatal",
      message:
        policyFailure ??
        `Standalone Vector180 SVG is not namespace-aware XML 1.0: ${
          error instanceof Error ? error.message : "unknown XML parse error"
        }`,
      range: mapper.range(position, Math.min(source.text.length, position + 1)),
    });
    return false;
  }
}

async function scanHtml(
  source: Vector180Scan["source"],
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  options: ScanOptions,
  dialect: VisualDialect,
): Promise<Vector180Scan> {
  const parseErrors: ParserError[] = [];
  const sourceOffset = source.text.startsWith("\uFEFF") ? 1 : 0;
  const documentNode = parse(source.text.slice(sourceOffset), {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
    onParseError: (error) => parseErrors.push(error),
  });

  for (const error of parseErrors) {
    diagnostics.push({
      code: "VECTOR180-SCAN-HTML-PARSE",
      severity: "error",
      message: `HTML parse error: ${error.code}.`,
      range: mapper.range(
        sourceOffset + error.startOffset,
        sourceOffset + error.endOffset,
      ),
    });
  }

  const html = findElement(documentNode, "html");
  const head = html === undefined ? undefined : findDirectElement(html, "head");
  const body = html === undefined ? undefined : findDirectElement(html, "body");
  const sections: Vector180SectionRef[] = [];

  if (head?.sourceCodeLocation != null) {
    sections.push(
      sectionFromElement("html-head", head, mapper, undefined, sourceOffset),
    );
  }

  if (
    !hasExplicitPairedElement(html) ||
    !hasExplicitPairedElement(head) ||
    !hasExplicitPairedElement(body)
  ) {
    diagnostics.push({
      code: "VECTOR180-SCAN-HTML-STRUCTURE",
      severity: "fatal",
      message:
        "Vector180 HTML requires explicit, source-located html, head, and body elements.",
    });
  } else {
    inspectStructureLimits(html, mapper, diagnostics, sourceOffset, options);
    if (!diagnostics.some((diagnostic) => diagnostic.severity === "fatal")) {
      inspectSecurity(html, mapper, diagnostics, sourceOffset);
      rejectDeckAtomMetadataMarkers(html, mapper, diagnostics, sourceOffset);
      validateContainerAttributes(
        html,
        head,
        body,
        mapper,
        diagnostics,
        sourceOffset,
        dialect,
      );
      validateHead(head, mapper, diagnostics, sourceOffset, dialect);
      for (const child of body.childNodes) {
        if (!isElement(child)) {
          if (!isInertWhitespaceOrComment(child)) {
            const location = child.sourceCodeLocation;
            diagnostics.push({
              code: "VECTOR180-SCAN-UNKNOWN-SECTION",
              severity: "error",
              message:
                "Unexpected visible text at top level in the Vector180 body.",
              ...(location == null
                ? {}
                : {
                    range: mapper.range(
                      sourceOffset + location.startOffset,
                      sourceOffset + location.endOffset,
                    ),
                  }),
            });
          }
          continue;
        }
        const section = classifyBodyElement(
          child,
          mapper,
          diagnostics,
          sourceOffset,
          dialect,
        );
        if (section !== undefined) sections.push(section);
      }
    }
  }

  const htmlVersion =
    html === undefined
      ? undefined
      : getAttribute(html, dialect.versionAttribute);
  validateSectionInventory(sections, diagnostics, options.strictOrder ?? true);
  await validateReferenceRuntimes(source, sections, diagnostics, dialect);
  inspectCssSections(source, sections, diagnostics);

  return {
    kind: "html",
    wireFamily: dialect.wireFamily,
    encoding: "utf-8",
    source,
    ...(htmlVersion === undefined ? {} : { versionHint: htmlVersion }),
    sections: sections.sort(
      (left, right) => left.range.charStart - right.range.charStart,
    ),
    diagnostics,
  };
}

function hasExplicitPairedElement(
  element: ElementNode | undefined,
): element is ElementNode {
  return (
    element?.sourceCodeLocation?.startTag !== undefined &&
    element.sourceCodeLocation.endTag !== undefined
  );
}

function scanSvg(
  source: Vector180Scan["source"],
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  options: ScanOptions,
  dialect: VisualDialect,
): Vector180Scan {
  const parseErrors: ParserError[] = [];
  const sourceOffset = source.text.startsWith("\uFEFF") ? 1 : 0;
  const fragment = parseFragment(source.text.slice(sourceOffset), {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
    onParseError: (error) => parseErrors.push(error),
  });
  const hasLeadingXmlDeclaration =
    /^(?:\s|<!--[\s\S]*?-->)*<\?xml(?:\s|\?>)[\s\S]*?\?>/iu.test(
      source.text.slice(sourceOffset),
    );
  const directElements = fragment.childNodes.filter(isElement);
  const svg =
    directElements.length === 1 && directElements[0]?.tagName === "svg"
      ? directElements[0]
      : undefined;
  const hasCompetingContent = fragment.childNodes.some(
    (node) => !isElement(node) && !isInertWhitespaceOrComment(node),
  );

  for (const error of parseErrors) {
    if (
      hasLeadingXmlDeclaration &&
      error.code === "unexpected-question-mark-instead-of-tag-name"
    ) {
      continue;
    }
    diagnostics.push({
      code: "VECTOR180-SCAN-SVG-PARSE",
      severity: "error",
      message: `SVG parse error: ${error.code}.`,
      range: mapper.range(
        sourceOffset + error.startOffset,
        sourceOffset + error.endOffset,
      ),
    });
  }

  if (
    svg === undefined ||
    svg.sourceCodeLocation == null ||
    hasCompetingContent
  ) {
    diagnostics.push({
      code: "VECTOR180-SCAN-UNRECOGNIZED",
      severity: "fatal",
      message:
        "Standalone Vector180 SVG must contain one source-located root svg element.",
    });
    return {
      kind: "svg",
      encoding: "utf-8",
      source,
      sections: [],
      diagnostics,
    };
  }

  inspectStructureLimits(svg, mapper, diagnostics, sourceOffset, options);
  inspectSecurity(svg, mapper, diagnostics, sourceOffset);
  validateAtomMetadataMarkers(svg, mapper, diagnostics, sourceOffset, dialect);
  validateAtomRoot(svg, mapper, diagnostics, sourceOffset, dialect);
  validateAtomStyleAuthority(svg, mapper, diagnostics, sourceOffset, dialect);
  const id = getAttribute(svg, "id");
  const versionHint = getAttribute(svg, dialect.versionAttribute);
  return {
    kind: "svg",
    wireFamily: dialect.wireFamily,
    encoding: "utf-8",
    source,
    ...(versionHint === undefined ? {} : { versionHint }),
    sections: [sectionFromElement("slide", svg, mapper, id, sourceOffset)],
    diagnostics,
  };
}

function rejectDeckAtomMetadataMarkers(
  html: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
): void {
  walk(html, (node) => {
    if (!isElement(node)) return;
    for (const marker of [
      "data-vector180-metadata",
      "data-pptv-metadata",
    ] as const) {
      if (getAttribute(node, marker) === undefined) continue;
      const location = findAttributeLocation(node, marker);
      diagnostics.push({
        code: "VECTOR180-METADATA-INVALID",
        severity: "error",
        message:
          "Atom metadata markers are unsupported anywhere inside deck HTML.",
        ...(location === undefined
          ? {}
          : {
              range: mapper.range(
                sourceOffset + location.startOffset,
                sourceOffset + location.endOffset,
              ),
            }),
      });
    }
  });
}

function validateAtomMetadataMarkers(
  svg: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): void {
  walk(svg, (node) => {
    if (!isElement(node)) return;
    const legacyMarker = getAttribute(node, "data-pptv-metadata");
    const canonicalMarker = getAttribute(node, "data-vector180-metadata");
    const invalidLegacy = legacyMarker !== undefined;
    const invalidCanonicalPlacement =
      canonicalMarker !== undefined &&
      (dialect.wireFamily !== "vector180" ||
        node.tagName !== "metadata" ||
        node.parentNode !== svg);
    if (!invalidLegacy && !invalidCanonicalPlacement) return;
    const marker = invalidLegacy
      ? "data-pptv-metadata"
      : "data-vector180-metadata";
    const location = findAttributeLocation(node, marker);
    diagnostics.push({
      code: "VECTOR180-METADATA-INVALID",
      severity: "error",
      message: invalidLegacy
        ? "Legacy PPTV 0.1 has no structured metadata marker; data-pptv-metadata is forbidden."
        : "Canonical atom metadata must be a direct-child metadata element.",
      ...(location === undefined
        ? {}
        : {
            range: mapper.range(
              sourceOffset + location.startOffset,
              sourceOffset + location.endOffset,
            ),
          }),
    });
  });
}

function validateAtomStyleAuthority(
  svg: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): void {
  walk(svg, (node) => {
    if (!isElement(node)) return;
    if (node.tagName === "style") {
      const range = locationRange(node, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-ATOM-STYLE",
        severity: "error",
        message:
          "Standalone Vector180 diagrams forbid style elements; use local presentation attributes or inline style.",
        ...(range === undefined ? {} : { range }),
      });
    }
    for (const attribute of node.attrs) {
      const name = qualifiedAttributeName(attribute);
      const normalizedName = name.toLowerCase();
      const reason =
        normalizedName === "class"
          ? "class attributes because no class stylesheet authority exists"
          : normalizedName === wireAttribute(dialect.wireFamily, "style") ||
              normalizedName === wireAttribute(dialect.wireFamily, "theme")
            ? `diagram control attribute "${name}"`
            : normalizedName.startsWith("--") ||
                /var\s*\(/iu.test(attribute.value) ||
                attribute.value.includes(
                  wireCssTokenPrefix(dialect.wireFamily),
                ) ||
                (normalizedName === "style" &&
                  /(?:^|;)\s*--[-_A-Za-z0-9]+\s*:/u.test(attribute.value))
              ? `custom-property or var() styling in attribute "${name}"`
              : undefined;
      if (reason === undefined) continue;
      const location = findAttributeLocation(node, name);
      diagnostics.push({
        code: "VECTOR180-ATOM-STYLE",
        severity: "error",
        message: `Standalone Vector180 diagrams forbid ${reason}.`,
        ...(location === undefined
          ? {}
          : {
              range: mapper.range(
                sourceOffset + location.startOffset,
                sourceOffset + location.endOffset,
              ),
            }),
      });
    }
  });
}

function validateAtomRoot(
  svg: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): void {
  const rootRange = locationRange(svg, mapper, sourceOffset);
  const id = getAttribute(svg, "id");
  if (id === undefined || !STABLE_ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "VECTOR180-ATOM-ROOT",
      severity: "error",
      message:
        "Standalone Vector180 SVG requires an explicit valid stable ID on its root; filenames never supply semantic identity.",
      ...(rootRange === undefined ? {} : { range: rootRange }),
    });
  }

  const version = getAttribute(svg, dialect.versionAttribute);
  if (version !== "0.1") {
    diagnostics.push({
      code: "VECTOR180-ATOM-ROOT",
      severity: "error",
      message: `Standalone ${dialect.wireFamily === "vector180" ? "Vector180" : "PPTV"} SVG requires ${dialect.versionAttribute}="0.1" on its root.`,
      ...(rootRange === undefined ? {} : { range: rootRange }),
    });
  }

  if (getAttribute(svg, "xmlns") !== SVG_NAMESPACE) {
    diagnostics.push({
      code: "VECTOR180-ATOM-ROOT",
      severity: "error",
      message: `Standalone Vector180 SVG requires xmlns="${SVG_NAMESPACE}" on its root.`,
      ...(rootRange === undefined ? {} : { range: rootRange }),
    });
  }

  if (parseAtomViewBox(getAttribute(svg, "viewBox")) === undefined) {
    diagnostics.push({
      code: "VECTOR180-SVG-VIEWBOX",
      severity: "error",
      message:
        "Standalone Vector180 SVG requires a finite four-number viewBox with positive width and height.",
      ...(rootRange === undefined ? {} : { range: rootRange }),
    });
  }

  const diagramRootAttributes = new Set([
    "id",
    dialect.versionAttribute,
    "viewbox",
    "xmlns",
    "xmlns:xlink",
  ]);
  for (const attribute of svg.attrs) {
    const name = qualifiedAttributeName(attribute);
    const normalizedName = name.toLowerCase();
    const validXlinkNamespace =
      normalizedName !== "xmlns:xlink" ||
      attribute.value === "http://www.w3.org/1999/xlink";
    if (diagramRootAttributes.has(normalizedName) && validXlinkNamespace) {
      continue;
    }
    const attributeLocation = findAttributeLocation(svg, name);
    diagnostics.push({
      code: "VECTOR180-ATOM-ROOT",
      severity: "error",
      message: `Standalone Vector180 SVG root attribute "${name}" is outside the strict semantic profile.`,
      ...(attributeLocation === undefined
        ? rootRange === undefined
          ? {}
          : { range: rootRange }
        : {
            range: mapper.range(
              sourceOffset + attributeLocation.startOffset,
              sourceOffset + attributeLocation.endOffset,
            ),
          }),
    });
  }
}

function parseAtomViewBox(
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
  const tokens = trimmed.split(/[\s,]+/u);
  if (
    tokens.length !== 4 ||
    tokens.some((token) => !SVG_NUMBER_PATTERN.test(token))
  ) {
    return undefined;
  }
  const values = tokens.map(Number);
  if (
    values.some((entry) => !Number.isFinite(entry)) ||
    (values[2] ?? 0) <= 0 ||
    (values[3] ?? 0) <= 0
  ) {
    return undefined;
  }
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

function identifySourceKind(
  name: string | undefined,
  source: string,
): Vector180Scan["kind"] {
  let sniffed = source.startsWith("\uFEFF") ? source.slice(1) : source;
  sniffed = sniffed.trimStart();
  while (sniffed.startsWith("<!--")) {
    const commentEnd = sniffed.indexOf("-->");
    if (commentEnd < 0) break;
    sniffed = sniffed.slice(commentEnd + 3).trimStart();
  }
  if (/^<\?xml(?:\s|\?>)/iu.test(sniffed)) {
    const declarationEnd = sniffed.indexOf("?>");
    if (declarationEnd >= 0) {
      sniffed = sniffed.slice(declarationEnd + 2).trimStart();
      while (sniffed.startsWith("<!--")) {
        const commentEnd = sniffed.indexOf("-->");
        if (commentEnd < 0) break;
        sniffed = sniffed.slice(commentEnd + 3).trimStart();
      }
    }
  }
  const trimmed = sniffed.toLowerCase();
  const byContent =
    trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")
      ? "html"
      : trimmed.startsWith("<svg") ||
          /^<!doctype\s+svg(?:\s|>|\[)/iu.test(trimmed)
        ? "svg"
        : trimmed.startsWith("{")
          ? "manifest"
          : "unknown";

  if (byContent !== "unknown") return byContent;
  if (name?.toLowerCase().endsWith(".vector180.html") === true) return "html";
  if (name?.toLowerCase().endsWith(".pptv.html") === true) return "html";
  if (name?.toLowerCase().endsWith(".vector180.svg") === true) return "svg";
  if (name?.toLowerCase().endsWith(".pptv.svg") === true) return "svg";
  if (name?.toLowerCase().endsWith(".vector180-manifest.json") === true)
    return "manifest";
  if (name?.toLowerCase().endsWith(".pptv-manifest.json") === true)
    return "manifest";
  return "unknown";
}

function classifyBodyElement(
  element: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): Vector180SectionRef | undefined {
  const manifestId = getAttribute(element, "id");
  const type = getAttribute(element, "type");
  const slideAttribute = wireAttribute(dialect.wireFamily, "slide");
  const libraryAttribute = wireAttribute(dialect.wireFamily, "library");
  const styleAttribute = wireAttribute(dialect.wireFamily, "style");
  const themeAttribute = wireAttribute(dialect.wireFamily, "theme");
  const runtimeAttribute = wireAttribute(dialect.wireFamily, "runtime");
  const editorRuntimeAttribute = wireAttribute(
    dialect.wireFamily,
    "editor-runtime",
  );
  const outputAttribute = wireAttribute(dialect.wireFamily, "output");
  const slideId = getAttribute(element, slideAttribute);
  const libraryId = getAttribute(element, libraryAttribute);
  const styleId = getAttribute(element, styleAttribute);
  const themeId = getAttribute(element, themeAttribute);
  const runtimeId = getAttribute(element, runtimeAttribute);
  const editorRuntimeId = getAttribute(element, editorRuntimeAttribute);
  const markerKinds = [
    ...(manifestId === dialect.manifestId && type === dialect.manifestType
      ? ["manifest"]
      : []),
    ...(hasAttribute(element, outputAttribute) ? ["output"] : []),
    ...(slideId === undefined ? [] : ["slide"]),
    ...(libraryId === undefined ? [] : ["library"]),
    ...(styleId === undefined ? [] : ["style"]),
    ...(themeId === undefined ? [] : ["theme"]),
    ...(runtimeId === undefined ? [] : ["viewer runtime"]),
    ...(editorRuntimeId === undefined ? [] : ["editor runtime"]),
  ];
  if (markerKinds.length > 1) {
    const range = locationRange(element, mapper, sourceOffset);
    diagnostics.push({
      code: "VECTOR180-SCAN-UNKNOWN-SECTION",
      severity: "error",
      message: `A top-level Vector180 element cannot declare multiple section kinds (${markerKinds.join(", ")}).`,
      ...(range === undefined ? {} : { range }),
    });
    return sectionFromElement(
      "unknown",
      element,
      mapper,
      undefined,
      sourceOffset,
    );
  }

  if (
    element.tagName === "script" &&
    manifestId === dialect.manifestId &&
    type === dialect.manifestType
  ) {
    validateSectionAttributes(
      element,
      ["id", "type"],
      "manifest",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement(
      "manifest",
      element,
      mapper,
      dialect.manifestId,
      sourceOffset,
    );
  }
  if (element.tagName !== "script" && hasAttribute(element, outputAttribute)) {
    if (
      (element.tagName !== "main" && element.tagName !== "div") ||
      !hasOnlyAttributes(element, [outputAttribute]) ||
      element.childNodes.some((child) => !isInertWhitespaceOrComment(child))
    ) {
      const range = locationRange(element, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-SCAN-OUTPUT-NONEMPTY",
        severity: "error",
        message:
          "The Vector180 output mount must be an empty, inert main or div element.",
        ...(range === undefined ? {} : { range }),
      });
    }
    return sectionFromElement(
      "output-mount",
      element,
      mapper,
      undefined,
      sourceOffset,
    );
  }
  if (element.tagName === "template" && slideId !== undefined) {
    validateSectionAttributes(
      element,
      [slideAttribute],
      "slide",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement("slide", element, mapper, slideId, sourceOffset);
  }
  if (element.tagName === "template" && libraryId !== undefined) {
    validateSectionAttributes(
      element,
      [libraryAttribute],
      "library",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement(
      "library",
      element,
      mapper,
      libraryId,
      sourceOffset,
    );
  }
  if (
    element.tagName === "script" &&
    type === "text/css" &&
    styleId !== undefined
  ) {
    validateSectionAttributes(
      element,
      ["type", styleAttribute],
      "base style",
      mapper,
      diagnostics,
      sourceOffset,
    );
    if (styleId !== "base") {
      const range = locationRange(element, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-SCAN-STYLE-ID",
        severity: "error",
        message:
          'The strict Vector180 base-style identifier must be exactly "base".',
        ...(range === undefined ? {} : { range }),
      });
    }
    return sectionFromElement("style", element, mapper, styleId, sourceOffset);
  }
  if (
    element.tagName === "script" &&
    type === "text/css" &&
    themeId !== undefined
  ) {
    validateSectionAttributes(
      element,
      ["type", themeAttribute],
      "theme",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement("theme", element, mapper, themeId, sourceOffset);
  }
  if (element.tagName === "script" && runtimeId !== undefined) {
    validateSectionAttributes(
      element,
      [runtimeAttribute],
      "viewer runtime",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement(
      "viewer-runtime",
      element,
      mapper,
      runtimeId,
      sourceOffset,
    );
  }
  if (element.tagName === "script" && editorRuntimeId !== undefined) {
    validateSectionAttributes(
      element,
      [editorRuntimeAttribute],
      "editor runtime",
      mapper,
      diagnostics,
      sourceOffset,
    );
    return sectionFromElement(
      "editor-runtime",
      element,
      mapper,
      editorRuntimeId,
      sourceOffset,
    );
  }

  if (element.tagName === "script") {
    const range = locationRange(element, mapper, sourceOffset);
    diagnostics.push({
      code: "VECTOR180-SECURITY-EXECUTABLE",
      severity: "error",
      message:
        "Strict Vector180 HTML permits only the manifest, inert base/theme CSS, and recognized runtimes.",
      ...(range === undefined ? {} : { range }),
    });
    return sectionFromElement(
      "unknown",
      element,
      mapper,
      undefined,
      sourceOffset,
    );
  }

  // Headings, prose, or hidden application state at body scope can become a
  // competing authority. Treat the element as an explicit unknown section.
  const range = locationRange(element, mapper, sourceOffset);
  diagnostics.push({
    code: "VECTOR180-SCAN-UNKNOWN-SECTION",
    severity: "error",
    message: `Unexpected top-level <${element.tagName}> element in Vector180 body.`,
    ...(range === undefined ? {} : { range }),
  });
  return sectionFromElement(
    "unknown",
    element,
    mapper,
    undefined,
    sourceOffset,
  );
}

function validateSectionAttributes(
  element: ElementNode,
  allowedNames: readonly string[],
  label: string,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
): void {
  if (hasOnlyAttributes(element, allowedNames)) return;
  const range = locationRange(element, mapper, sourceOffset);
  diagnostics.push({
    code: "VECTOR180-SCAN-SECTION-ATTRIBUTES",
    severity: "error",
    message: `The strict Vector180 ${label} declaration has unsupported attributes.`,
    ...(range === undefined ? {} : { range }),
  });
}

function validateHead(
  head: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): void {
  let titleCount = 0;
  for (const child of head.childNodes) {
    if (!isElement(child)) {
      if (!isInertWhitespaceOrComment(child)) {
        diagnostics.push({
          code: "VECTOR180-SCAN-HTML-HEAD",
          severity: "error",
          message: "Unexpected non-whitespace content in the Vector180 head.",
        });
      }
      continue;
    }
    let allowed = false;
    if (child.tagName === "title") {
      titleCount += 1;
      allowed = hasOnlyAttributes(child, []);
    } else if (child.tagName === "meta") {
      const name = getAttribute(child, "name")?.toLowerCase();
      if (hasAttribute(child, "charset")) {
        allowed =
          getAttribute(child, "charset")?.toLowerCase() === "utf-8" &&
          hasOnlyAttributes(child, ["charset"]);
      } else if (name === "viewport" || name === dialect.agentProfileMeta) {
        allowed =
          getAttribute(child, "content") !== undefined &&
          hasOnlyAttributes(child, ["name", "content"]);
      }
    }
    if (!allowed) {
      const range = locationRange(child, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-SCAN-HTML-HEAD",
        severity: "error",
        message: `Unexpected or behavior-bearing <${child.tagName}> declaration in the strict Vector180 head.`,
        ...(range === undefined ? {} : { range }),
      });
    }
  }
  if (titleCount !== 1) {
    const range = locationRange(head, mapper, sourceOffset);
    diagnostics.push({
      code: "VECTOR180-SCAN-HTML-HEAD",
      severity: "error",
      message: `Strict Vector180 HTML requires exactly one title element; found ${titleCount}.`,
      ...(range === undefined ? {} : { range }),
    });
  }
}

function validateContainerAttributes(
  html: ElementNode,
  head: ElementNode,
  body: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  dialect: VisualDialect,
): void {
  const declarations: Array<{
    element: ElementNode;
    allowed: readonly string[];
  }> = [
    { element: html, allowed: ["lang", dialect.versionAttribute] },
    { element: head, allowed: [] },
    { element: body, allowed: [] },
  ];
  for (const declaration of declarations) {
    if (hasOnlyAttributes(declaration.element, declaration.allowed)) continue;
    const range = locationRange(declaration.element, mapper, sourceOffset);
    diagnostics.push({
      code: "VECTOR180-SCAN-HTML-STRUCTURE",
      severity: "error",
      message: `Strict Vector180 does not allow presentation or behavior attributes on <${declaration.element.tagName}>.`,
      ...(range === undefined ? {} : { range }),
    });
  }
}

function hasOnlyAttributes(
  element: ElementNode,
  allowedNames: readonly string[],
): boolean {
  const allowed = new Set(allowedNames.map((name) => name.toLowerCase()));
  return element.attrs.every((attribute) =>
    allowed.has(qualifiedAttributeName(attribute).toLowerCase()),
  );
}

function isInertWhitespaceOrComment(node: Node): boolean {
  if (node.nodeName === "#comment") return true;
  return (
    node.nodeName === "#text" && "value" in node && node.value.trim() === ""
  );
}

function sectionFromElement(
  kind: Vector180SectionKind,
  element: ElementNode,
  mapper: SourceMapper,
  id?: string,
  sourceOffset = 0,
): Vector180SectionRef {
  const location = element.sourceCodeLocation;
  if (location == null) {
    throw new Error(`Cannot index implicit <${element.tagName}> as ${kind}`);
  }
  const attributes = Object.fromEntries(
    element.attrs.map((attribute) => [
      qualifiedAttributeName(attribute),
      attribute.value,
    ]),
  );
  const contentStart = location.startTag?.endOffset;
  const contentEnd = location.endTag?.startOffset;

  return {
    kind,
    ...(id === undefined ? {} : { id }),
    range: mapper.range(
      sourceOffset + location.startOffset,
      sourceOffset + location.endOffset,
    ),
    ...(location.startTag === undefined
      ? {}
      : {
          openTagRange: mapper.range(
            sourceOffset + location.startTag.startOffset,
            sourceOffset + location.startTag.endOffset,
          ),
        }),
    ...(contentStart === undefined || contentEnd === undefined
      ? {}
      : {
          contentRange: mapper.range(
            sourceOffset + contentStart,
            sourceOffset + contentEnd,
          ),
        }),
    attributes,
  };
}

function validateSectionInventory(
  sections: readonly Vector180SectionRef[],
  diagnostics: Diagnostic[],
  strictOrder: boolean,
): void {
  const canonical = sections.filter((section) => section.kind !== "html-head");
  requireExactlyOne(canonical, "manifest", "manifest", diagnostics);
  requireExactlyOne(canonical, "output-mount", "output mount", diagnostics);
  requireExactlyOne(canonical, "style", "base style", diagnostics);
  requireExactlyOne(canonical, "viewer-runtime", "viewer runtime", diagnostics);

  const identitySeen = new Map<string, Vector180SectionRef>();
  for (const section of canonical) {
    if (section.id === undefined) continue;
    const requiresStableId =
      section.kind === "slide" ||
      section.kind === "style" ||
      section.kind === "theme" ||
      section.kind === "library";
    const requiresProfileId =
      section.kind === "viewer-runtime" || section.kind === "editor-runtime";
    if (
      (requiresStableId && !STABLE_ID_PATTERN.test(section.id)) ||
      (requiresProfileId &&
        (section.id.length > 128 || !PROFILE_ID_PATTERN.test(section.id)))
    ) {
      diagnostics.push({
        code: "VECTOR180-ID-INVALID",
        severity: "error",
        message: `Invalid ${section.kind} identifier "${section.id}".`,
        range: section.openTagRange ?? section.range,
      });
    }
    const key = `${section.kind}:${section.id}`;
    const prior = identitySeen.get(key);
    if (prior !== undefined) {
      diagnostics.push({
        code: "VECTOR180-ID-DUPLICATE",
        severity: "error",
        message: `Duplicate ${section.kind} identifier "${section.id}".`,
        range: section.range,
        related: [
          { message: "First declaration is here.", range: prior.range },
        ],
      });
    } else {
      identitySeen.set(key, section);
    }
  }

  if (!strictOrder) return;
  let highestRank = 0;
  for (const section of canonical) {
    const rank = SECTION_RANK[section.kind];
    if (rank === undefined) continue;
    if (rank < highestRank) {
      diagnostics.push({
        code: "VECTOR180-SCAN-PHYSICAL-ORDER",
        severity: "error",
        message: `The ${section.kind} section appears after a later canonical section class.`,
        range: section.range,
      });
    } else {
      highestRank = rank;
    }
  }

  const runtimeIndex = canonical.findIndex(
    (section) => section.kind === "viewer-runtime",
  );
  if (runtimeIndex >= 0 && runtimeIndex !== canonical.length - 1) {
    const runtime = canonical[runtimeIndex];
    diagnostics.push({
      code: "VECTOR180-SCAN-PHYSICAL-ORDER",
      severity: "error",
      message:
        "The fixed viewer runtime must be the final canonical body section.",
      ...(runtime === undefined ? {} : { range: runtime.range }),
    });
  }
}

function requireExactlyOne(
  sections: readonly Vector180SectionRef[],
  kind: Vector180SectionKind,
  label: string,
  diagnostics: Diagnostic[],
): void {
  const matching = sections.filter((section) => section.kind === kind);
  if (matching.length === 1) return;
  diagnostics.push({
    code: "VECTOR180-SCAN-SECTION-COUNT",
    severity: "error",
    message: `Strict Vector180 HTML requires exactly one ${label}; found ${matching.length}.`,
    ...(matching[1] === undefined ? {} : { range: matching[1].range }),
  });
}

function inspectSecurity(
  root: ElementNode,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
): void {
  walk(root, (node) => {
    if (!isElement(node)) return;
    const normalizedTagName = node.tagName.toLowerCase();
    if (FORBIDDEN_EMBED_ELEMENTS.has(normalizedTagName)) {
      const range = locationRange(node, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-SECURITY-EXECUTABLE",
        severity: "error",
        message: `<${node.tagName}> is forbidden in strict Vector180 source because it can load or execute external document behavior.`,
        ...(range === undefined ? {} : { range }),
      });
    }
    if (
      node.tagName === "script" &&
      (node.parentNode === null ||
        !isElement(node.parentNode) ||
        node.parentNode.tagName !== "body")
    ) {
      const range = locationRange(node, mapper, sourceOffset);
      diagnostics.push({
        code: "VECTOR180-SECURITY-EXECUTABLE",
        severity: "error",
        message:
          "Executable script elements are forbidden outside the recognized top-level Vector180 control blocks.",
        ...(range === undefined ? {} : { range }),
      });
    }
    for (const attribute of node.attrs) {
      const qualifiedName = qualifiedAttributeName(attribute);
      const attributeLocation = findAttributeLocation(node, qualifiedName);
      const range =
        attributeLocation === undefined
          ? undefined
          : mapper.range(
              sourceOffset + attributeLocation.startOffset,
              sourceOffset + attributeLocation.endOffset,
            );
      if (qualifiedName.toLowerCase().startsWith("on")) {
        diagnostics.push({
          code: "VECTOR180-SECURITY-EXECUTABLE",
          severity: "error",
          message: `Event-handler attribute "${qualifiedName}" is forbidden in Vector180 source.`,
          ...(range === undefined ? {} : { range }),
        });
      }
      if (node.tagName === "script" && qualifiedName.toLowerCase() === "src") {
        diagnostics.push({
          code: "VECTOR180-SECURITY-EXECUTABLE",
          severity: "error",
          message:
            "Vector180 runtime and data scripts must be inline; src is forbidden.",
          ...(range === undefined ? {} : { range }),
        });
      }
      if (qualifiedName.toLowerCase() === "srcset") {
        diagnostics.push({
          code: "VECTOR180-SECURITY-URL",
          severity: "error",
          message:
            "srcset is forbidden until Vector180 has a deterministic resource-set resolver.",
          ...(range === undefined ? {} : { range }),
        });
      }
      if (qualifiedName.toLowerCase() === "xml:base") {
        diagnostics.push({
          code: "VECTOR180-SECURITY-URL",
          severity: "error",
          message:
            "xml:base is forbidden because it can change same-document fragment resolution.",
          ...(range === undefined ? {} : { range }),
        });
      }
      if (
        CSS_RESOURCE_ATTRIBUTES.has(qualifiedName.toLowerCase()) ||
        /url\s*\(/iu.test(attribute.value)
      ) {
        const unsafeReason = unsafeCssResourceReason(attribute.value);
        if (unsafeReason !== undefined) {
          diagnostics.push({
            code: "VECTOR180-SECURITY-URL",
            severity: "error",
            message: `${unsafeReason} in attribute "${qualifiedName}".`,
            ...(range === undefined ? {} : { range }),
          });
        }
      }
      if (isUrlAttribute(node, qualifiedName)) {
        const unsafeReason = unsafeUrlReason(attribute.value);
        if (unsafeReason !== undefined) {
          diagnostics.push({
            code: "VECTOR180-SECURITY-URL",
            severity: "error",
            message: `${unsafeReason} in ${qualifiedName}=${JSON.stringify(attribute.value)}.`,
            ...(range === undefined ? {} : { range }),
          });
        }
      }
    }
  });
}

function isUrlAttribute(element: ElementNode, name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "action" ||
    normalized === "formaction" ||
    normalized === "href" ||
    normalized === "ping" ||
    normalized === "poster" ||
    normalized === "xlink:href" ||
    normalized === "src" ||
    (element.tagName === "object" && normalized === "data")
  );
}

function unsafeUrlReason(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f]/u.test(value)) {
    return "Control characters and whitespace are forbidden in resource references";
  }
  return value.startsWith("#")
    ? undefined
    : "Only same-document fragment references are allowed in self-contained Vector180 0.1";
}

async function validateReferenceRuntimes(
  source: Vector180Scan["source"],
  sections: readonly Vector180SectionRef[],
  diagnostics: Diagnostic[],
  dialect: VisualDialect,
): Promise<void> {
  for (const section of sections) {
    if (
      section.kind !== "viewer-runtime" &&
      section.kind !== "editor-runtime"
    ) {
      continue;
    }
    const expectedDigest =
      section.kind === "viewer-runtime" && section.id !== undefined
        ? section.id === dialect.browserRuntime
          ? REFERENCE_RUNTIME_DIGESTS.get(section.id)
          : undefined
        : undefined;
    if (expectedDigest === undefined || section.contentRange === undefined) {
      diagnostics.push({
        code: "VECTOR180-SECURITY-RUNTIME",
        severity: "error",
        message: `Runtime "${section.id ?? "(missing)"}" is not a recognized fixed Vector180 runtime artifact.`,
        range: section.range,
      });
      continue;
    }
    const content = source.text
      .slice(section.contentRange.charStart, section.contentRange.charEnd)
      .replace(/\r\n?/gu, "\n");
    const actualDigest = await sha256Hex(new TextEncoder().encode(content));
    if (actualDigest !== expectedDigest) {
      diagnostics.push({
        code: "VECTOR180-SECURITY-RUNTIME",
        severity: "error",
        message: `Runtime "${section.id}" content does not match the fixed reference artifact.`,
        range: section.contentRange,
      });
    }
  }
}

function inspectCssSections(
  source: Vector180Scan["source"],
  sections: readonly Vector180SectionRef[],
  diagnostics: Diagnostic[],
): void {
  for (const section of sections) {
    if (
      (section.kind !== "style" && section.kind !== "theme") ||
      section.contentRange === undefined
    )
      continue;
    const css = source.text.slice(
      section.contentRange.charStart,
      section.contentRange.charEnd,
    );
    const unsafeReason = unsafeCssResourceReason(css);
    if (unsafeReason !== undefined) {
      diagnostics.push({
        code: "VECTOR180-SECURITY-URL",
        severity: "error",
        message: `${unsafeReason} in ${section.kind} "${section.id ?? "(missing)"}".`,
        range: section.contentRange,
      });
    }
  }
}

function unsafeCssResourceReason(css: string): string | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  if (withoutComments.includes("/*")) {
    return "Unterminated CSS comments are disabled";
  }
  if (/@import\b/iu.test(withoutComments)) return "CSS imports are disabled";
  if (/\\/u.test(withoutComments)) {
    return "CSS escape sequences are disabled in the strict 0.1 security subset";
  }
  if (/(?:image-set|src)\s*\(/iu.test(withoutComments)) {
    return "CSS resource functions outside fragment-only url() are disabled";
  }
  const urls = withoutComments.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/giu);
  for (const match of urls) {
    const value = (match[2] ?? "").trim();
    if (value.startsWith("#")) continue;
    return (
      unsafeUrlReason(value) ??
      "External CSS resources are disabled in self-contained Vector180 0.1"
    );
  }
  return undefined;
}

function sourceWithWireFamily(
  source: Vector180Scan["source"],
  wireFamily: VisualWireFamily,
): Vector180Scan["source"] {
  const retainedBytes = source.bytes;
  return Object.freeze({
    ...(source.name === undefined ? {} : { name: source.name }),
    wireFamily,
    text: source.text,
    get bytes(): Uint8Array {
      return retainedBytes.slice();
    },
    charLength: source.charLength,
    byteLength: source.byteLength,
    sha256: source.sha256,
  });
}

export function findElement(
  root: ParentNode,
  tagName: string,
): ElementNode | undefined {
  let result: ElementNode | undefined;
  walk(root, (node) => {
    if (result === undefined && isElement(node) && node.tagName === tagName)
      result = node;
  });
  return result;
}

export function findDirectElement(
  root: ParentNode,
  tagName: string,
): ElementNode | undefined {
  return childNodes(root).find(
    (node): node is ElementNode => isElement(node) && node.tagName === tagName,
  );
}

export function walk(root: Node, visitor: (node: Node) => void): void {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    visitor(node);
    const children = [
      ...childNodes(node),
      ...(isTemplate(node) ? node.content.childNodes : []),
    ];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push(child);
    }
  }
}

function inspectStructureLimits(
  root: Node,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  sourceOffset: number,
  options: ScanOptions,
): void {
  const maxElements = options.maxElements ?? DEFAULT_MAX_ELEMENTS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const pending: Array<{ node: Node; depth: number }> = [
    { node: root, depth: 0 },
  ];
  let elements = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (isElement(current.node)) elements += 1;
    if (elements > maxElements || current.depth > maxDepth) {
      const range = isElement(current.node)
        ? locationRange(current.node, mapper, sourceOffset)
        : undefined;
      diagnostics.push({
        code: "VECTOR180-SCAN-STRUCTURE-LIMIT",
        severity: "fatal",
        message:
          elements > maxElements
            ? `Vector180 source exceeds the ${maxElements} element limit.`
            : `Vector180 source exceeds the ${maxDepth} nesting-depth limit.`,
        ...(range === undefined ? {} : { range }),
      });
      return;
    }
    const children = [
      ...childNodes(current.node),
      ...(isTemplate(current.node) ? current.node.content.childNodes : []),
    ];
    for (const child of children) {
      pending.push({ node: child, depth: current.depth + 1 });
    }
  }
}

export function childNodes(node: Node): DefaultTreeAdapterMap["childNode"][] {
  if ("childNodes" in node) return node.childNodes;
  return [];
}

export function isElement(node: Node): node is ElementNode {
  return "tagName" in node && "attrs" in node;
}

export function isTemplate(node: Node): node is TemplateNode {
  return isElement(node) && node.tagName === "template" && "content" in node;
}

export function getAttribute(
  element: ElementNode,
  name: string,
): string | undefined {
  const normalized = name.toLowerCase();
  return element.attrs.find(
    (attribute) =>
      qualifiedAttributeName(attribute).toLowerCase() === normalized,
  )?.value;
}

export function hasAttribute(element: ElementNode, name: string): boolean {
  const normalized = name.toLowerCase();
  return element.attrs.some(
    (attribute) =>
      qualifiedAttributeName(attribute).toLowerCase() === normalized,
  );
}

function qualifiedAttributeName(
  attribute: ElementNode["attrs"][number],
): string {
  return attribute.prefix == null || attribute.prefix === ""
    ? attribute.name
    : `${attribute.prefix}:${attribute.name}`;
}

function findAttributeLocation(
  element: ElementNode,
  qualifiedName: string,
):
  | NonNullable<NonNullable<ElementNode["sourceCodeLocation"]>["attrs"]>[string]
  | undefined {
  const locations = element.sourceCodeLocation?.attrs;
  if (locations === undefined) return undefined;
  return (
    locations[qualifiedName] ??
    Object.entries(locations).find(
      ([name]) => name.toLowerCase() === qualifiedName.toLowerCase(),
    )?.[1]
  );
}

function locationRange(
  element: ElementNode,
  mapper: SourceMapper,
  sourceOffset: number,
): SourceRange | undefined {
  const location = element.sourceCodeLocation;
  return location == null
    ? undefined
    : mapper.range(
        sourceOffset + location.startOffset,
        sourceOffset + location.endOffset,
      );
}
