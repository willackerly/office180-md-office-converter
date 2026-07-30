/**
 * Deterministic deck-slide hydration into a standalone PPTV diagram atom.
 *
 * Extraction is a source-to-source dereference operation. It never asks a
 * browser to compute style or layout: C6 supplies concrete presentation
 * values, which are written locally before the candidate is reloaded through
 * the standalone C4/C6 path.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 */

import { loadDiagram, PptvLoadError } from "./deck.js";
import {
  resolvePptvDeck,
  resolvePptvDiagram,
  type PptvResolvedObject,
} from "./resolved.js";
import { hasErrors } from "./source.js";
import type { PptvResolvedStyle } from "./styles.js";
import type {
  Diagnostic,
  PptvDeck,
  PptvDiagram,
  SourceRange,
} from "./types.js";

export interface PptvDiagramExtractionProvenance {
  readonly method: "pptv-slide-hydration/0.1";
  readonly sourceDeckSha256: string;
  readonly sourceSlideId: string;
  readonly activeTheme: string;
}

export interface PptvDiagramExtractionResult {
  readonly sourceText?: string;
  readonly sourceSha256?: string;
  readonly diagram?: PptvDiagram;
  readonly provenance: PptvDiagramExtractionProvenance;
  readonly diagnostics: readonly Diagnostic[];
}

interface SourceEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Materialize one valid C6 deck slide as a context-free `.pptv.svg` atom.
 *
 * IDs, hierarchy, painter order, geometry, authored hard lines, and opaque
 * source payloads remain in their original source spelling. Deck class/theme
 * dependencies are replaced with concrete inline presentation values. The
 * result is returned only after it independently passes diagram loading and
 * resolution.
 */
export async function extractPptvDiagram(
  deck: PptvDeck,
  slideId: string,
): Promise<PptvDiagramExtractionResult> {
  const provenance: PptvDiagramExtractionProvenance = Object.freeze({
    method: "pptv-slide-hydration/0.1",
    sourceDeckSha256: deck.source.sha256,
    sourceSlideId: slideId,
    activeTheme: deck.activeTheme ?? "",
  });
  const diagnostics: Diagnostic[] = [];

  if (hasErrors(deck.diagnostics) || !deck.materialization.complete) {
    diagnostics.push({
      code: "PPTV-EXTRACT-INVALID-BASE",
      severity: "error",
      message:
        "Diagram extraction requires a complete C4 deck snapshot with no errors.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }
  const indexedSlide = deck.index.slides.get(slideId);
  if (indexedSlide === undefined || !deck.slides.has(slideId)) {
    diagnostics.push({
      code: "PPTV-EXTRACT-SLIDE",
      severity: "error",
      message: `Deck has no fully materialized slide "${slideId}".`,
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  const resolvedDeck = resolvePptvDeck(deck);
  diagnostics.push(...resolvedDeck.diagnostics);
  const resolvedSlide = resolvedDeck.model?.slides.find(
    (candidate) => candidate.id === slideId,
  );
  if (resolvedDeck.model === undefined || resolvedSlide === undefined) {
    diagnostics.push({
      code: "PPTV-EXTRACT-UNRESOLVED",
      severity: "error",
      message:
        "The selected slide could not be resolved through the strict C6 deck profile.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  const styleById = new Map<string, PptvResolvedStyle>();
  visitResolvedObjects(resolvedSlide.objects, (object) => {
    styleById.set(object.id, object.style);
  });
  const edits: SourceEdit[] = [];
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "class",
    edits,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "style",
    edits,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "data-pptv-layout",
    edits,
  );
  setAttribute(
    deck.source.text,
    indexedSlide.openTagRange,
    indexedSlide.attributeRanges,
    "data-pptv-version",
    "0.1",
    edits,
  );
  setAttribute(
    deck.source.text,
    indexedSlide.openTagRange,
    indexedSlide.attributeRanges,
    "xmlns",
    "http://www.w3.org/2000/svg",
    edits,
  );

  for (const objectId of indexedSlide.objectIds) {
    const indexedObject = deck.index.objects.get(objectId);
    if (indexedObject === undefined || indexedObject.slideId !== slideId)
      continue;
    removeAttribute(
      deck.source.text,
      indexedObject.attributeRanges,
      "class",
      edits,
    );
    const resolvedStyle = styleById.get(objectId);
    if (resolvedStyle !== undefined) {
      setAttribute(
        deck.source.text,
        indexedObject.openTagRange,
        indexedObject.attributeRanges,
        "style",
        serializeResolvedStyle(resolvedStyle),
        edits,
      );
    }
  }

  let sourceText: string;
  try {
    sourceText = applyScopedEdits(
      deck.source.text,
      indexedSlide.svgRange,
      edits,
    );
  } catch (error) {
    diagnostics.push({
      code: "PPTV-EXTRACT-SOURCE",
      severity: "error",
      message: `Slide hydration could not produce a non-overlapping exact-source edit plan: ${
        error instanceof Error ? error.message : String(error)
      }.`,
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }
  if (!sourceText.endsWith("\n")) sourceText += "\n";

  let diagram: PptvDiagram;
  try {
    diagram = await loadDiagram({
      kind: "text",
      text: sourceText,
      name: `${slideId}.pptv.svg`,
    });
  } catch (error) {
    const related =
      error instanceof PptvLoadError ? error.diagnostics : ([] as Diagnostic[]);
    diagnostics.push(...related, {
      code: "PPTV-EXTRACT-INVALID-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source did not reload as an independent PPTV diagram.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }
  if (hasErrors(diagram.diagnostics)) {
    diagnostics.push(...diagram.diagnostics, {
      code: "PPTV-EXTRACT-INVALID-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source did not validate as an independent PPTV diagram.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  const resolvedDiagram = resolvePptvDiagram(diagram);
  diagnostics.push(...resolvedDiagram.diagnostics);
  if (resolvedDiagram.model === undefined) {
    diagnostics.push({
      code: "PPTV-EXTRACT-UNRESOLVED-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source passed C4 but not the standalone C6 diagram profile.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  return freezeResult({
    sourceText,
    sourceSha256: diagram.source.sha256,
    diagram,
    provenance,
    diagnostics,
  });
}

function serializeResolvedStyle(style: PptvResolvedStyle): string {
  return [
    `fill:${style.fill}`,
    `stroke:${style.stroke}`,
    `stroke-width:${style.strokeWidth}`,
    `opacity:${style.opacity}`,
    ...(style.fontFamily === undefined
      ? []
      : [`font-family:${style.fontFamily}`]),
    ...(style.fontSize === undefined ? [] : [`font-size:${style.fontSize}`]),
    `font-weight:${style.fontWeight}`,
    `font-style:${style.fontStyle}`,
    `text-anchor:${style.textAnchor}`,
  ].join(";");
}

function removeAttribute(
  source: string,
  ranges: ReadonlyMap<string, SourceRange>,
  name: string,
  edits: SourceEdit[],
): void {
  const range = findAttributeRange(ranges, name);
  if (range === undefined) return;
  assertRangeSpelling(source, range, name);
  edits.push({
    start: range.charStart,
    end: range.charEnd,
    replacement: "",
  });
}

function setAttribute(
  source: string,
  openTagRange: SourceRange,
  ranges: ReadonlyMap<string, SourceRange>,
  name: string,
  value: string,
  edits: SourceEdit[],
): void {
  const escapedValue = escapeXmlAttribute(value);
  const range = findAttributeRange(ranges, name);
  if (range !== undefined) {
    assertRangeSpelling(source, range, name);
    edits.push({
      start: range.charStart,
      end: range.charEnd,
      replacement: `${name}="${escapedValue}"`,
    });
    return;
  }
  const insertion = openTagInsertionOffset(source, openTagRange);
  const existingInsertion = edits.find(
    (edit) => edit.start === insertion && edit.end === insertion,
  );
  if (existingInsertion === undefined) {
    edits.push({
      start: insertion,
      end: insertion,
      replacement: ` ${name}="${escapedValue}"`,
    });
  } else {
    const index = edits.indexOf(existingInsertion);
    edits[index] = {
      ...existingInsertion,
      replacement: existingInsertion.replacement + ` ${name}="${escapedValue}"`,
    };
  }
}

function findAttributeRange(
  ranges: ReadonlyMap<string, SourceRange>,
  name: string,
): SourceRange | undefined {
  const normalized = name.toLowerCase();
  for (const [candidate, range] of ranges) {
    if (candidate.toLowerCase() === normalized) return range;
  }
  return undefined;
}

function assertRangeSpelling(
  source: string,
  range: SourceRange,
  name: string,
): void {
  const spelling = source.slice(range.charStart, range.charEnd);
  const pattern = new RegExp(`^${escapeRegExp(name)}(?:\\s*=|\\s|$)`, "iu");
  if (!pattern.test(spelling)) {
    throw new Error(`indexed attribute range for "${name}" is inconsistent`);
  }
}

function openTagInsertionOffset(
  source: string,
  openTagRange: SourceRange,
): number {
  let offset = openTagRange.charEnd - 1;
  if (source[offset] !== ">") {
    throw new Error("indexed opening tag does not end with '>'");
  }
  offset -= 1;
  while (offset >= openTagRange.charStart && /\s/u.test(source[offset] ?? ""))
    offset -= 1;
  if (source[offset] === "/") return offset;
  return openTagRange.charEnd - 1;
}

function applyScopedEdits(
  source: string,
  scope: SourceRange,
  inputEdits: readonly SourceEdit[],
): string {
  const edits = [...inputEdits].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  for (const [index, edit] of edits.entries()) {
    if (
      edit.start < scope.charStart ||
      edit.end > scope.charEnd ||
      edit.start > edit.end
    ) {
      throw new Error("edit falls outside the selected SVG source range");
    }
    const prior = edits[index - 1];
    if (
      prior !== undefined &&
      (edit.start < prior.end ||
        (edit.start === prior.start &&
          edit.end === edit.start &&
          prior.end === prior.start))
    ) {
      throw new Error("edits overlap or share an ambiguous insertion point");
    }
  }

  let output = source.slice(scope.charStart, scope.charEnd);
  for (const edit of edits.reverse()) {
    const start = edit.start - scope.charStart;
    const end = edit.end - scope.charStart;
    output = output.slice(0, start) + edit.replacement + output.slice(end);
  }
  return output;
}

function visitResolvedObjects(
  objects: readonly PptvResolvedObject[],
  visit: (object: PptvResolvedObject) => void,
): void {
  for (const object of objects) {
    visit(object);
    if (object.kind === "group") visitResolvedObjects(object.children, visit);
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function freezeResult(
  result: PptvDiagramExtractionResult,
): PptvDiagramExtractionResult {
  return Object.freeze({
    ...result,
    provenance: Object.freeze({ ...result.provenance }),
    diagnostics: Object.freeze([...result.diagnostics]),
  });
}
