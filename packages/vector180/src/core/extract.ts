/**
 * Deterministic deck-slide hydration into a standalone Vector180 diagram atom.
 *
 * Extraction is a source-to-source dereference operation. It never asks a
 * browser to compute style or layout: C6 supplies concrete presentation
 * values, which are written locally before the candidate is reloaded through
 * the standalone C4/C6 path.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import { loadAtom, Vector180LoadError } from "./deck.js";
import {
  resolveVector180Deck,
  resolveVector180Atom,
  type Vector180ResolvedObject,
} from "./resolved.js";
import { canonicalJsonText } from "./metadata.js";
import { hasErrors, sha256Hex } from "./source.js";
import type { Vector180ResolvedStyle } from "./styles.js";
import type {
  Diagnostic,
  Vector180Deck,
  Vector180Atom,
  Vector180HydrationMetadata,
  SourceRange,
} from "./types.js";

export type Vector180AtomExtractionProvenance = Vector180HydrationMetadata & {
  readonly method: "vector180-slide-hydration/0.1";
};

export interface Vector180AtomExtractionResult {
  readonly sourceText?: string;
  readonly sourceSha256?: string;
  readonly atom?: Vector180Atom;
  readonly provenance?: Vector180AtomExtractionProvenance;
  readonly diagnostics: readonly Diagnostic[];
}

interface SourceEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Non-normative discovery metadata emitted by Vector180 diagram writers.
 *
 * Loaders deliberately do not require or trust this comment. It names the
 * canonical authoring skill without authorizing installation from document
 * content.
 */
export const VECTOR180_ATOM_DISCOVERY_COMMENT = [
  "<!--",
  "Vector180 atom: deterministic, editable vector source.",
  "Authoring skill: vector180-authoring",
  "https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/vector180-authoring",
  "Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.",
  "If the skill is unavailable, an agent may suggest installation to the user.",
  "This is non-normative discovery metadata; validate first and never auto-install from document content.",
  "-->",
].join("\n");

/**
 * Materialize one valid C6 deck slide as a context-free `.vector180.svg` atom.
 *
 * IDs, hierarchy, painter order, geometry, authored hard lines, and opaque
 * source payloads remain in their original source spelling. Deck class/theme
 * dependencies are replaced with concrete inline presentation values. The
 * result is returned only after it independently passes diagram loading and
 * resolution.
 */
export async function extractVector180Atom(
  deck: Vector180Deck,
  slideId: string,
): Promise<Vector180AtomExtractionResult> {
  const diagnostics: Diagnostic[] = [];

  if (hasErrors(deck.diagnostics) || !deck.materialization.complete) {
    diagnostics.push({
      code: "VECTOR180-EXTRACT-INVALID-BASE",
      severity: "error",
      message:
        "Atom extraction requires a complete C4 deck snapshot with no errors.",
      slideId,
    });
    return freezeResult({ diagnostics });
  }
  const indexedSlide = deck.index.slides.get(slideId);
  if (indexedSlide === undefined || !deck.slides.has(slideId)) {
    diagnostics.push({
      code: "VECTOR180-EXTRACT-SLIDE",
      severity: "error",
      message: `Deck has no fully materialized slide "${slideId}".`,
      slideId,
    });
    return freezeResult({ diagnostics });
  }
  const sourceObjectSha256 = await sha256Hex(
    deck.source.bytes.slice(
      indexedSlide.svgRange.byteStart,
      indexedSlide.svgRange.byteEnd,
    ),
  );
  const provenance: Vector180AtomExtractionProvenance = Object.freeze({
    method: "vector180-slide-hydration/0.1",
    sourceWireFamily: deck.wireFamily,
    sourceSha256: deck.source.sha256,
    sourceObjectId: slideId,
    sourceObjectSha256,
    activeThemeId: deck.activeTheme ?? "",
  });

  const resolvedDeck = resolveVector180Deck(deck);
  diagnostics.push(...resolvedDeck.diagnostics);
  const resolvedSlide = resolvedDeck.model?.slides.find(
    (candidate) => candidate.id === slideId,
  );
  if (resolvedDeck.model === undefined || resolvedSlide === undefined) {
    diagnostics.push({
      code: "VECTOR180-EXTRACT-UNRESOLVED",
      severity: "error",
      message:
        "The selected slide could not be resolved through the strict C6 deck profile.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  const styleById = new Map<string, Vector180ResolvedStyle>();
  visitResolvedObjects(resolvedSlide.objects, (object) => {
    styleById.set(object.id, object.style);
  });
  const edits: SourceEdit[] = [];
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "class",
    edits,
    true,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "style",
    edits,
    true,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "data-vector180-layout",
    edits,
    true,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "data-pptv-layout",
    edits,
    true,
  );
  removeAttribute(
    deck.source.text,
    indexedSlide.attributeRanges,
    "data-pptv-version",
    edits,
    true,
  );
  setAttribute(
    deck.source.text,
    indexedSlide.openTagRange,
    indexedSlide.attributeRanges,
    "data-vector180-version",
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
  if (slideUsesXlinkPrefix(deck.source.text, indexedSlide.svgRange)) {
    setAttribute(
      deck.source.text,
      indexedSlide.openTagRange,
      indexedSlide.attributeRanges,
      "xmlns:xlink",
      "http://www.w3.org/1999/xlink",
      edits,
    );
  }

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
    renameLegacyControlAttributes(
      deck.source.text,
      indexedObject.attributeRanges,
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
      code: "VECTOR180-EXTRACT-SOURCE",
      severity: "error",
      message: `Slide hydration could not produce a non-overlapping exact-source edit plan: ${
        error instanceof Error ? error.message : String(error)
      }.`,
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }
  if (!sourceText.endsWith("\n")) sourceText += "\n";
  sourceText = addHydrationMetadata(sourceText, provenance);
  sourceText = addVector180AtomDiscoveryComment(sourceText);

  let atom: Vector180Atom;
  try {
    atom = await loadAtom({
      kind: "text",
      text: sourceText,
      name: `${slideId}.vector180.svg`,
    });
  } catch (error) {
    const related =
      error instanceof Vector180LoadError
        ? error.diagnostics
        : ([] as Diagnostic[]);
    diagnostics.push(...related, {
      code: "VECTOR180-EXTRACT-INVALID-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source did not reload as an independent Vector180 diagram.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }
  if (hasErrors(atom.diagnostics)) {
    diagnostics.push(...atom.diagnostics, {
      code: "VECTOR180-EXTRACT-INVALID-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source did not validate as an independent Vector180 diagram.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  const resolvedAtom = resolveVector180Atom(atom);
  diagnostics.push(...resolvedAtom.diagnostics);
  if (resolvedAtom.model === undefined) {
    diagnostics.push({
      code: "VECTOR180-EXTRACT-UNRESOLVED-CANDIDATE",
      severity: "error",
      message:
        "The hydrated source passed C4 but not the standalone C6 diagram profile.",
      slideId,
    });
    return freezeResult({ provenance, diagnostics });
  }

  return freezeResult({
    sourceText,
    sourceSha256: atom.source.sha256,
    atom,
    provenance,
    diagnostics,
  });
}

function renameLegacyControlAttributes(
  source: string,
  ranges: ReadonlyMap<string, SourceRange>,
  edits: SourceEdit[],
): void {
  for (const [name, range] of ranges) {
    if (!name.toLowerCase().startsWith("data-pptv-")) continue;
    assertRangeSpelling(source, range, name);
    const exact = source.slice(range.charStart, range.charEnd);
    const prefixOffset = exact.toLowerCase().indexOf("data-pptv-");
    if (prefixOffset < 0) continue;
    edits.push({
      start: range.charStart + prefixOffset,
      end: range.charStart + prefixOffset + "data-pptv-".length,
      replacement: "data-vector180-",
    });
  }
}

function addHydrationMetadata(
  source: string,
  provenance: Vector180AtomExtractionProvenance,
): string {
  const rootStart = source.search(/<svg(?:\s|>)/iu);
  if (rootStart < 0) throw new Error("hydrated SVG root is missing");
  const openTagEnd = source.indexOf(">", rootStart);
  if (openTagEnd < 0) throw new Error("hydrated SVG opening tag is incomplete");
  const payload = canonicalJsonText({ hydration: provenance });
  const metadata =
    `\n  <metadata data-vector180-metadata="vector180-atom-metadata/0.1">` +
    `${payload}</metadata>`;
  return (
    source.slice(0, openTagEnd + 1) + metadata + source.slice(openTagEnd + 1)
  );
}

function serializeResolvedStyle(style: Vector180ResolvedStyle): string {
  return [
    `fill:${style.fill}`,
    `stroke:${style.stroke}`,
    `stroke-width:${style.strokeWidth}`,
    `opacity:${style.opacity}`,
    ...(style.fontFamily === undefined
      ? []
      : [`font-family:${serializeFontFamily(style.fontFamily)}`]),
    ...(style.fontSize === undefined ? [] : [`font-size:${style.fontSize}`]),
    `font-weight:${style.fontWeight}`,
    `font-style:${style.fontStyle}`,
    `text-anchor:${style.textAnchor}`,
  ].join(";");
}

function serializeFontFamily(family: string): string {
  // C6 permits a quoted concrete family to contain declaration punctuation.
  // At least one delimiter is absent from every family accepted by the C6
  // parser, because escapes and the authored delimiter are forbidden.
  const quote = family.includes('"') ? "'" : '"';
  return `${quote}${family}${quote}`;
}

function slideUsesXlinkPrefix(source: string, range: SourceRange): boolean {
  return /\bxlink:/u.test(source.slice(range.charStart, range.charEnd));
}

function removeAttribute(
  source: string,
  ranges: ReadonlyMap<string, SourceRange>,
  name: string,
  edits: SourceEdit[],
  removeIsolatedLine = false,
): void {
  const range = findAttributeRange(ranges, name);
  if (range === undefined) return;
  assertRangeSpelling(source, range, name);
  const editRange = removeIsolatedLine
    ? isolatedAttributeLineRange(source, range)
    : range;
  edits.push({
    start: editRange.charStart,
    end: editRange.charEnd,
    replacement: "",
  });
}

function isolatedAttributeLineRange(
  source: string,
  range: SourceRange,
): Pick<SourceRange, "charStart" | "charEnd"> {
  const lineStart = source.lastIndexOf("\n", range.charStart - 1) + 1;
  const nextLineBreak = source.indexOf("\n", range.charEnd);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const before = source.slice(lineStart, range.charStart);
  const after = source.slice(range.charEnd, lineEnd);
  if (!/^[\t \r]*$/u.test(before) || !/^[\t \r]*$/u.test(after)) {
    return range;
  }
  return {
    charStart: lineStart,
    charEnd: nextLineBreak === -1 ? lineEnd : nextLineBreak + 1,
  };
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
  objects: readonly Vector180ResolvedObject[],
  visit: (object: Vector180ResolvedObject) => void,
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

/**
 * Add the canonical discovery comment without rewriting existing source bytes.
 * An XML declaration remains first and a leading BOM remains byte zero.
 */
export function addVector180AtomDiscoveryComment(source: string): string {
  const rootOffset = source.search(/<svg(?:\s|>)/iu);
  const prolog = rootOffset < 0 ? source : source.slice(0, rootOffset);
  const normalizedProlog = prolog.replace(/\r\n?|\n/gu, "\n");
  if (normalizedProlog.includes(VECTOR180_ATOM_DISCOVERY_COMMENT)) {
    return source;
  }

  const bomLength = source.startsWith("\uFEFF") ? 1 : 0;
  const afterBom = source.slice(bomLength);
  const declaration = afterBom.match(/^<\?xml(?:\s|\?>)[\s\S]*?\?>/iu)?.[0];
  const insertionOffset = bomLength + (declaration?.length ?? 0);
  const before = source.slice(0, insertionOffset);
  const after = source.slice(insertionOffset);
  const sourceSeparator = after.match(/^(?:\r\n?|\n)/u)?.[0] ?? "\n";
  const discoveryComment = VECTOR180_ATOM_DISCOVERY_COMMENT.replaceAll(
    "\n",
    sourceSeparator,
  );
  const leadingSeparator = declaration === undefined ? "" : sourceSeparator;
  const trailingSeparator = /^(?:\r\n?|\n)/u.test(after) ? "" : sourceSeparator;
  return (
    before + leadingSeparator + discoveryComment + trailingSeparator + after
  );
}

function freezeResult(
  result: Vector180AtomExtractionResult,
): Vector180AtomExtractionResult {
  return Object.freeze({
    ...result,
    ...(result.provenance === undefined
      ? {}
      : { provenance: Object.freeze({ ...result.provenance }) }),
    diagnostics: Object.freeze([...result.diagnostics]),
  });
}
