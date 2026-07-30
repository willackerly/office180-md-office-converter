/**
 * Browser-safe C4/C6 inspection over the same portable kernel used in Node.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 */

import {
  loadPptvDocument,
  PptvLoadError,
  resolvePptvDeck,
  resolvePptvDiagram,
  scanPptvSource,
  type Diagnostic,
  type PptvDeck,
  type PptvDiagram,
  type PptvDocument,
  type PptvInput,
  type PptvNode,
  type SourceRange,
} from "../core/index.js";

export type PptvBrowserJson =
  | null
  | boolean
  | number
  | string
  | readonly PptvBrowserJson[]
  | { readonly [key: string]: PptvBrowserJson };

export interface PptvBrowserConformanceResult {
  readonly schema: "pptv-browser-conformance/0.1";
  readonly scan: PptvBrowserJson;
  readonly c4: PptvBrowserJson | null;
  readonly c4Diagnostics: readonly Diagnostic[];
  readonly c6: PptvBrowserJson | null;
  readonly c6Diagnostics: readonly Diagnostic[];
}

/**
 * Load and resolve exact PPTV bytes without consulting a DOM, CSSOM, runtime,
 * filesystem, or host font. The JSON-safe normalization is intentionally the
 * same in Node and a browser so conformance tests can compare it byte-for-byte.
 */
export async function inspectPptvConformance(
  input: PptvInput,
): Promise<PptvBrowserConformanceResult> {
  const scan = await scanPptvSource(copyInput(input));
  let document: PptvDocument | undefined;
  let c4Diagnostics: readonly Diagnostic[] = scan.diagnostics;

  try {
    document = await loadPptvDocument(copyInput(input));
    c4Diagnostics = document.diagnostics;
  } catch (error) {
    c4Diagnostics =
      error instanceof PptvLoadError
        ? error.diagnostics
        : [runtimeDiagnostic("PPTV-BROWSER-C4", error)];
  }

  let resolved: unknown;
  let c6Diagnostics: readonly Diagnostic[] = [];
  if (document !== undefined) {
    try {
      const result =
        document.sourceKind === "html"
          ? resolvePptvDeck(document)
          : resolvePptvDiagram(document);
      resolved = result.model;
      c6Diagnostics = result.diagnostics;
    } catch (error) {
      c6Diagnostics = [runtimeDiagnostic("PPTV-BROWSER-C6", error)];
    }
  }

  return deepFreeze({
    schema: "pptv-browser-conformance/0.1",
    scan: normalizeScan(scan),
    c4: document === undefined ? null : normalizeDocument(document),
    c4Diagnostics: c4Diagnostics.map(copyDiagnostic),
    c6: resolved === undefined ? null : toJson(resolved),
    c6Diagnostics: c6Diagnostics.map(copyDiagnostic),
  });
}

function copyInput(input: PptvInput): PptvInput {
  return input.kind === "text"
    ? {
        kind: "text",
        text: input.text,
        ...(input.name === undefined ? {} : { name: input.name }),
      }
    : {
        kind: "bytes",
        bytes: input.bytes.slice(),
        ...(input.name === undefined ? {} : { name: input.name }),
      };
}

function normalizeScan(scan: Awaited<ReturnType<typeof scanPptvSource>>) {
  return toJson({
    kind: scan.kind,
    encoding: scan.encoding,
    source: normalizeSource(scan.source),
    ...(scan.versionHint === undefined
      ? {}
      : { versionHint: scan.versionHint }),
    sections: scan.sections,
    diagnostics: scan.diagnostics,
  });
}

function normalizeDocument(document: PptvDocument): PptvBrowserJson {
  return document.sourceKind === "html"
    ? normalizeDeck(document)
    : normalizeDiagram(document);
}

function normalizeDeck(deck: PptvDeck): PptvBrowserJson {
  return toJson({
    sourceKind: deck.sourceKind,
    version: deck.version,
    ...(deck.title === undefined ? {} : { title: deck.title }),
    ...(deck.activeTheme === undefined
      ? {}
      : { activeTheme: deck.activeTheme }),
    source: normalizeSource(deck.source),
    manifest: deck.manifest,
    slideOrder: deck.slideOrder,
    slides: [...deck.slides.values()].map((slide) => ({
      id: slide.id,
      ...(slide.layout === undefined ? {} : { layout: slide.layout }),
      hidden: slide.hidden,
      viewBox: slide.viewBox,
      sourceRange: slide.sourceRange,
      objects: slide.children.map(normalizeNode),
    })),
    baseStyle:
      deck.baseStyle === undefined
        ? null
        : {
            id: deck.baseStyle.id,
            cssText: deck.baseStyle.cssText,
            sourceRange: deck.baseStyle.sourceRange,
            contentRange: deck.baseStyle.contentRange,
          },
    themes: [...deck.themes.values()].map((theme) => ({
      id: theme.id,
      cssText: theme.cssText,
      sourceRange: theme.sourceRange,
      contentRange: theme.contentRange,
    })),
    libraries: [...deck.libraries.values()].map((library) => ({
      id: library.id,
      sourceRange: library.sourceRange,
    })),
    materialization: deck.materialization,
    index: {
      sourceSha256: deck.index.sourceSha256,
      manifest: deck.index.manifest,
      manifestFields: normalizeRangeMap(deck.index.manifestFields),
      manifestSlideEntries: normalizeRangeMap(deck.index.manifestSlideEntries),
      slides: [...deck.index.slides.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({ id, value })),
      objects: [...deck.index.objects.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({
          id,
          value: {
            ...value,
            attributeRanges: normalizeRangeMap(value.attributeRanges),
          },
        })),
      style: deck.index.style ?? null,
      themes: [...deck.index.themes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({ id, value })),
      libraries: [...deck.index.libraries.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({ id, value })),
      runtimes: deck.index.runtimes,
    },
    diagnostics: deck.diagnostics,
  });
}

function normalizeDiagram(diagram: PptvDiagram): PptvBrowserJson {
  return toJson({
    sourceKind: diagram.sourceKind,
    version: diagram.version,
    id: diagram.id,
    viewBox: diagram.viewBox,
    sourceRange: diagram.sourceRange,
    source: normalizeSource(diagram.source),
    objects: diagram.children.map(normalizeNode),
    index: {
      sourceSha256: diagram.index.sourceSha256,
      root: {
        ...diagram.index.root,
        attributeRanges: normalizeRangeMap(diagram.index.root.attributeRanges),
      },
      objects: [...diagram.index.objects.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, value]) => ({
          id,
          value: {
            ...value,
            attributeRanges: normalizeRangeMap(value.attributeRanges),
          },
        })),
    },
    diagnostics: diagram.diagnostics,
  });
}

function normalizeSource(source: {
  readonly name?: string;
  readonly charLength: number;
  readonly byteLength: number;
  readonly sha256: string;
}) {
  return {
    ...(source.name === undefined ? {} : { name: source.name }),
    charLength: source.charLength,
    byteLength: source.byteLength,
    sha256: source.sha256,
  };
}

function normalizeNode(node: PptvNode): unknown {
  return {
    id: node.id,
    role: node.role,
    exportMode: node.exportMode,
    elementName: node.elementName,
    classes: node.classes,
    attributes: node.attributes,
    parentId: node.parentId,
    children: node.children.map(normalizeNode),
    ...(node.text === undefined ? {} : { text: node.text }),
    opaque: node.opaque,
    sourceRange: node.sourceRange,
    openTagRange: node.openTagRange,
    ...(node.directTextRange === undefined
      ? {}
      : { directTextRange: node.directTextRange }),
  };
}

function normalizeRangeMap(
  ranges: ReadonlyMap<string, SourceRange>,
): readonly { readonly key: string; readonly range: SourceRange }[] {
  return [...ranges.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, range]) => ({ key, range }));
}

function runtimeDiagnostic(code: string, error: unknown): Diagnostic {
  return {
    code,
    severity: "fatal",
    message:
      error instanceof Error
        ? error.message
        : "The shared browser runtime failed with a non-Error value.",
  };
}

function copyDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.range === undefined
      ? {}
      : { range: { ...diagnostic.range } }),
    ...(diagnostic.slideId === undefined
      ? {}
      : { slideId: diagnostic.slideId }),
    ...(diagnostic.diagramId === undefined
      ? {}
      : { diagramId: diagnostic.diagramId }),
    ...(diagnostic.objectId === undefined
      ? {}
      : { objectId: diagnostic.objectId }),
    ...(diagnostic.related === undefined
      ? {}
      : {
          related: diagnostic.related.map((related) => ({
            message: related.message,
            ...(related.range === undefined
              ? {}
              : { range: { ...related.range } }),
          })),
        }),
  };
}

function toJson(value: unknown): PptvBrowserJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "PPTV browser normalization rejects non-finite JSON.",
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry));
  }
  if (value instanceof Uint8Array) {
    return [...value];
  }
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entry]) => ({
        key: toJson(key),
        value: toJson(entry),
      }));
  }
  if (typeof value !== "object" || value === undefined) {
    throw new TypeError(
      `PPTV browser normalization cannot encode ${typeof value}.`,
    );
  }

  const normalized: Record<string, PptvBrowserJson> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) normalized[key] = toJson(entry);
  }
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
