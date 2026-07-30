/**
 * Strict PPTV manifest parsing, field ranges, and container references.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 */

import {
  findNodeAtLocation,
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";

import { SourceMapper } from "./source.js";
import type {
  Diagnostic,
  ManifestFieldRanges,
  ManifestParseResult,
  PptvManifest,
  PptvManifestSlide,
  PptvScan,
  PptvSectionKind,
  SourceRange,
} from "./types.js";

export const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
export const PROFILE_ID_PATTERN =
  /^[A-Za-z][A-Za-z0-9._-]*\/[0-9]+(?:\.[0-9]+)*$/;

const MANIFEST_FIELDS = new Set([
  "pptv",
  "title",
  "runtime",
  "editor",
  "theme",
  "themes",
  "slides",
  "agentProfile",
  "extensions",
]);

const SLIDE_FIELDS = new Set(["id", "layout", "hidden", "namespace", "src"]);
const MAX_MANIFEST_NODES = 100_000;
const MAX_MANIFEST_DEPTH = 256;

export function parseManifest(scan: PptvScan): ManifestParseResult {
  const manifestSection = scan.sections.find(
    (section) => section.kind === "manifest",
  );
  if (manifestSection?.contentRange === undefined) {
    return {
      diagnostics: [
        {
          code: "PPTV-MANIFEST-INVALID",
          severity: "error",
          message:
            "PPTV source does not contain a source-located manifest value.",
        },
      ],
    };
  }

  const mapper = new SourceMapper(scan.source.text, scan.source.bytes);
  const contentRange = manifestSection.contentRange;
  const manifestText = scan.source.text.slice(
    contentRange.charStart,
    contentRange.charEnd,
  );
  if (jsonNestingExceedsLimit(manifestText, MAX_MANIFEST_DEPTH)) {
    return {
      diagnostics: [
        {
          code: "PPTV-MANIFEST-LIMIT",
          severity: "fatal",
          message: `PPTV manifest exceeds the ${MAX_MANIFEST_DEPTH} nesting-depth limit.`,
          range: contentRange,
        },
      ],
    };
  }
  const parseErrors: ParseError[] = [];
  const root = parseTree(manifestText, parseErrors, {
    allowTrailingComma: false,
    disallowComments: true,
    allowEmptyContent: false,
  });
  const diagnostics: Diagnostic[] = parseErrors.map((error) => {
    const localStart = Math.min(Math.max(error.offset, 0), manifestText.length);
    const localEnd = Math.min(
      Math.max(error.offset + Math.max(error.length, 1), localStart),
      manifestText.length,
    );
    return {
      code: "PPTV-MANIFEST-INVALID",
      severity: "error",
      message: `Invalid manifest JSON: ${printParseErrorCode(error.error)}.`,
      range: mapper.range(
        contentRange.charStart + localStart,
        contentRange.charStart + localEnd,
      ),
    };
  });

  if (root === undefined || root.type !== "object") {
    diagnostics.push({
      code: "PPTV-MANIFEST-INVALID",
      severity: "error",
      message: "The PPTV manifest root must be a JSON object.",
      range: contentRange,
    });
    return { diagnostics };
  }

  const limitDiagnostic = validateJsonTreeLimits(
    root,
    contentRange.charStart,
    mapper,
  );
  if (limitDiagnostic !== undefined) {
    diagnostics.push(limitDiagnostic);
    return { diagnostics };
  }
  diagnostics.push(
    ...detectDuplicateKeys(root, contentRange.charStart, mapper),
  );
  const value = getNodeValue(root) as unknown;
  diagnostics.push(
    ...validateManifestValue(value, root, contentRange.charStart, mapper),
  );

  const ranges = buildManifestRanges(root, contentRange.charStart, mapper);
  if (!isManifestValue(value)) {
    return { ranges, diagnostics };
  }

  return { manifest: value, ranges, diagnostics };
}

export function validateManifest(
  manifest: PptvManifest,
  scan: PptvScan,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const slideSections = byId(scan, "slide");
  const themeSections = byId(scan, "theme");
  const runtimeSections = byId(scan, "viewer-runtime");
  const editorRuntimeSections = byId(scan, "editor-runtime");
  const manifestSlideIds = manifest.slides.map(slideId);

  if (scan.kind !== "html") {
    diagnostics.push({
      code: "PPTV-SCAN-UNSUPPORTED-LOAD",
      severity: "error",
      message:
        "PPTV 0.1 semantic loading currently supports self-contained .pptv.html sources only.",
    });
    return diagnostics;
  }

  if (scan.versionHint !== undefined && scan.versionHint !== manifest.pptv) {
    diagnostics.push({
      code: "PPTV-MANIFEST-MIRROR-MISMATCH",
      severity: "error",
      message: `HTML data-pptv-version "${scan.versionHint}" does not match manifest pptv "${manifest.pptv}".`,
    });
  }

  for (const id of manifestSlideIds) {
    const declarations = slideSections.get(id) ?? [];
    if (declarations.length !== 1) {
      diagnostics.push({
        code: "PPTV-MANIFEST-MISSING-REFERENCE",
        severity: "error",
        message: `Manifest slide "${id}" resolves to ${declarations.length} template declarations; expected one.`,
      });
    }
  }

  for (const [id, declarations] of slideSections) {
    if (!manifestSlideIds.includes(id) && declarations.length === 1) {
      const range = declarations[0]?.range;
      diagnostics.push({
        code: "PPTV-MANIFEST-UNUSED-SLIDE",
        severity: "warning",
        message: `Slide template "${id}" is not referenced by the manifest.`,
        ...(range === undefined ? {} : { range }),
      });
    }
  }

  if (
    manifest.theme === undefined ||
    (themeSections.get(manifest.theme)?.length ?? 0) !== 1
  ) {
    diagnostics.push({
      code: "PPTV-MANIFEST-MISSING-REFERENCE",
      severity: "error",
      message:
        manifest.theme === undefined
          ? "Self-contained PPTV HTML requires one active manifest theme."
          : `Active theme "${manifest.theme}" does not resolve to exactly one theme declaration.`,
    });
  }

  for (const themeId of manifest.themes ?? []) {
    if ((themeSections.get(themeId)?.length ?? 0) !== 1) {
      diagnostics.push({
        code: "PPTV-MANIFEST-MISSING-REFERENCE",
        severity: "error",
        message: `Declared theme "${themeId}" does not resolve to exactly one theme declaration.`,
      });
    }
  }

  if (
    manifest.runtime === undefined ||
    (runtimeSections.get(manifest.runtime)?.length ?? 0) !== 1
  ) {
    diagnostics.push({
      code: "PPTV-MANIFEST-MISSING-REFERENCE",
      severity: "error",
      message:
        manifest.runtime === undefined
          ? "Self-contained PPTV HTML requires a manifest runtime identifier."
          : `Runtime "${manifest.runtime}" does not resolve to the fixed viewer runtime declaration.`,
    });
  }

  if (
    manifest.editor !== undefined &&
    (editorRuntimeSections.get(manifest.editor)?.length ?? 0) !== 1
  ) {
    diagnostics.push({
      code: "PPTV-MANIFEST-MISSING-REFERENCE",
      severity: "error",
      message: `Editor runtime "${manifest.editor}" does not resolve to exactly one editor runtime declaration.`,
    });
  }

  return diagnostics;
}

export function slideId(slide: string | PptvManifestSlide): string {
  return typeof slide === "string" ? slide : slide.id;
}

function validateManifestValue(
  value: unknown,
  root: JsonNode,
  baseOffset: number,
  mapper: SourceMapper,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) return diagnostics;

  for (const key of Object.keys(value)) {
    if (!MANIFEST_FIELDS.has(key)) {
      diagnostics.push(
        fieldDiagnostic(root, key, baseOffset, mapper, {
          code: "PPTV-MANIFEST-INVALID",
          severity: "error",
          message: `Unknown manifest field "${key}".`,
        }),
      );
    }
  }

  if (value.pptv !== "0.1") {
    diagnostics.push(
      fieldDiagnostic(root, "pptv", baseOffset, mapper, {
        code: "PPTV-MANIFEST-INVALID",
        severity: "error",
        message: 'Manifest field "pptv" must equal "0.1".',
      }),
    );
  }

  validateOptionalString(
    value,
    root,
    "title",
    baseOffset,
    mapper,
    diagnostics,
    false,
  );
  validateOptionalProfile(
    value,
    root,
    "runtime",
    baseOffset,
    mapper,
    diagnostics,
  );
  validateOptionalProfile(
    value,
    root,
    "editor",
    baseOffset,
    mapper,
    diagnostics,
  );
  validateOptionalString(
    value,
    root,
    "theme",
    baseOffset,
    mapper,
    diagnostics,
    true,
  );
  validateOptionalProfile(
    value,
    root,
    "agentProfile",
    baseOffset,
    mapper,
    diagnostics,
  );

  if (!Array.isArray(value.slides) || value.slides.length === 0) {
    diagnostics.push(
      fieldDiagnostic(root, "slides", baseOffset, mapper, {
        code: "PPTV-MANIFEST-INVALID",
        severity: "error",
        message: 'Manifest field "slides" must be a non-empty array.',
      }),
    );
  } else {
    const ids: string[] = [];
    for (const [index, slide] of value.slides.entries()) {
      const node = findNodeAtLocation(root, ["slides", index]);
      const range =
        node === undefined
          ? undefined
          : jsonNodeRange(node, baseOffset, mapper);
      if (typeof slide === "string") {
        validateStableId(slide, `slides[${index}]`, diagnostics, range);
        ids.push(slide);
        continue;
      }
      if (!isRecord(slide) || typeof slide.id !== "string") {
        diagnostics.push({
          code: "PPTV-MANIFEST-INVALID",
          severity: "error",
          message: `Manifest slides[${index}] must be a stable ID or an object with an id.`,
          ...(range === undefined ? {} : { range }),
        });
        continue;
      }

      for (const key of Object.keys(slide)) {
        if (!SLIDE_FIELDS.has(key)) {
          diagnostics.push({
            code: "PPTV-MANIFEST-INVALID",
            severity: "error",
            message: `Unknown slides[${index}] field "${key}".`,
            ...(range === undefined ? {} : { range }),
          });
        }
      }
      validateStableId(slide.id, `slides[${index}].id`, diagnostics, range);
      ids.push(slide.id);
      if ("layout" in slide && typeof slide.layout !== "string") {
        diagnostics.push(
          typeDiagnostic(`slides[${index}].layout`, "string", range),
        );
      } else if (typeof slide.layout === "string") {
        validateStableId(
          slide.layout,
          `slides[${index}].layout`,
          diagnostics,
          range,
        );
      }
      if ("hidden" in slide && typeof slide.hidden !== "boolean") {
        diagnostics.push(
          typeDiagnostic(`slides[${index}].hidden`, "boolean", range),
        );
      }
      if ("namespace" in slide && typeof slide.namespace !== "string") {
        diagnostics.push(
          typeDiagnostic(`slides[${index}].namespace`, "a stable ID", range),
        );
      } else if (typeof slide.namespace === "string") {
        validateStableId(
          slide.namespace,
          `slides[${index}].namespace`,
          diagnostics,
          range,
        );
      }
      if ("src" in slide && typeof slide.src !== "string") {
        diagnostics.push(
          typeDiagnostic(`slides[${index}].src`, "a string", range),
        );
      }
      if ("namespace" in slide || "src" in slide) {
        diagnostics.push({
          code: "PPTV-MANIFEST-UNSUPPORTED-EXTERNAL",
          severity: "error",
          message: `External slide fields at slides[${index}] are recognized but not supported by the self-contained 0.1 loader.`,
          ...(range === undefined ? {} : { range }),
        });
      }
    }

    for (const duplicate of duplicates(ids)) {
      diagnostics.push({
        code: "PPTV-ID-DUPLICATE",
        severity: "error",
        message: `Manifest references slide "${duplicate}" more than once.`,
      });
    }
  }

  if (value.themes !== undefined) {
    if (
      !Array.isArray(value.themes) ||
      value.themes.some((entry) => typeof entry !== "string")
    ) {
      diagnostics.push(
        fieldDiagnostic(root, "themes", baseOffset, mapper, {
          code: "PPTV-MANIFEST-INVALID",
          severity: "error",
          message: 'Manifest field "themes" must be an array of stable IDs.',
        }),
      );
    } else {
      for (const theme of value.themes)
        validateStableId(theme, "themes[]", diagnostics);
      for (const duplicate of duplicates(value.themes)) {
        diagnostics.push({
          code: "PPTV-ID-DUPLICATE",
          severity: "error",
          message: `Manifest theme list repeats "${duplicate}".`,
        });
      }
    }
  }

  if (value.extensions !== undefined) {
    if (!isRecord(value.extensions)) {
      diagnostics.push(
        fieldDiagnostic(root, "extensions", baseOffset, mapper, {
          code: "PPTV-MANIFEST-INVALID",
          severity: "error",
          message: 'Manifest field "extensions" must be an object.',
        }),
      );
    } else if (Object.keys(value.extensions).length > 0) {
      diagnostics.push(
        fieldDiagnostic(root, "extensions", baseOffset, mapper, {
          code: "PPTV-MANIFEST-UNSUPPORTED-EXTENSION",
          severity: "warning",
          message:
            "Manifest extensions are preserved but not interpreted by the 0.1 source kernel.",
        }),
      );
    }
  }

  return diagnostics;
}

function buildManifestRanges(
  root: JsonNode,
  baseOffset: number,
  mapper: SourceMapper,
): ManifestFieldRanges {
  const fields = new Map<string, SourceRange>();
  for (const property of root.children ?? []) {
    const key = property.children?.[0]?.value;
    const value = property.children?.[1];
    if (typeof key === "string" && value !== undefined) {
      fields.set(key, jsonNodeRange(value, baseOffset, mapper));
    }
  }

  const slideEntries = new Map<string, SourceRange>();
  const slides = findNodeAtLocation(root, ["slides"]);
  for (const entry of slides?.children ?? []) {
    const value = getNodeValue(entry) as unknown;
    const id =
      typeof value === "string"
        ? value
        : isRecord(value) && typeof value.id === "string"
          ? value.id
          : undefined;
    if (id !== undefined && !slideEntries.has(id)) {
      slideEntries.set(id, jsonNodeRange(entry, baseOffset, mapper));
    }
  }

  return {
    root: jsonNodeRange(root, baseOffset, mapper),
    fields,
    slideEntries,
  };
}

function detectDuplicateKeys(
  root: JsonNode,
  baseOffset: number,
  mapper: SourceMapper,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.type === "object") {
      const seen = new Map<string, JsonNode>();
      for (const property of node.children ?? []) {
        const keyNode = property.children?.[0];
        const valueNode = property.children?.[1];
        if (typeof keyNode?.value === "string") {
          const previous = seen.get(keyNode.value);
          if (previous !== undefined) {
            diagnostics.push({
              code: "PPTV-MANIFEST-DUPLICATE-KEY",
              severity: "error",
              message: `Manifest JSON repeats property "${keyNode.value}".`,
              range: jsonNodeRange(keyNode, baseOffset, mapper),
              related: [
                {
                  message: "First property is here.",
                  range: jsonNodeRange(previous, baseOffset, mapper),
                },
              ],
            });
          } else {
            seen.set(keyNode.value, keyNode);
          }
        }
        if (valueNode !== undefined) pending.push(valueNode);
      }
    } else {
      pending.push(...(node.children ?? []));
    }
  }
  return diagnostics;
}

function validateJsonTreeLimits(
  root: JsonNode,
  baseOffset: number,
  mapper: SourceMapper,
): Diagnostic | undefined {
  const pending: Array<{ node: JsonNode; depth: number }> = [
    { node: root, depth: 0 },
  ];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    count += 1;
    if (count > MAX_MANIFEST_NODES || current.depth > MAX_MANIFEST_DEPTH) {
      return {
        code: "PPTV-MANIFEST-LIMIT",
        severity: "fatal",
        message:
          count > MAX_MANIFEST_NODES
            ? `PPTV manifest exceeds the ${MAX_MANIFEST_NODES} node limit.`
            : `PPTV manifest exceeds the ${MAX_MANIFEST_DEPTH} nesting-depth limit.`,
        range: jsonNodeRange(current.node, baseOffset, mapper),
      };
    }
    for (const child of current.node.children ?? []) {
      pending.push({ node: child, depth: current.depth + 1 });
    }
  }
  return undefined;
}

function jsonNestingExceedsLimit(text: string, limit: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > limit) return true;
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}

function validateOptionalString(
  value: Record<string, unknown>,
  root: JsonNode,
  key: string,
  baseOffset: number,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
  stable: boolean,
): void {
  const item = value[key];
  if (item === undefined) return;
  if (typeof item !== "string") {
    diagnostics.push(
      fieldDiagnostic(root, key, baseOffset, mapper, {
        code: "PPTV-MANIFEST-INVALID",
        severity: "error",
        message: `Manifest field "${key}" must be a string.`,
      }),
    );
  } else if (stable) {
    validateStableId(
      item,
      key,
      diagnostics,
      fieldRange(root, key, baseOffset, mapper),
    );
  }
}

function validateOptionalProfile(
  value: Record<string, unknown>,
  root: JsonNode,
  key: string,
  baseOffset: number,
  mapper: SourceMapper,
  diagnostics: Diagnostic[],
): void {
  const item = value[key];
  if (item === undefined) return;
  const range = fieldRange(root, key, baseOffset, mapper);
  if (
    typeof item !== "string" ||
    item.length > 128 ||
    !PROFILE_ID_PATTERN.test(item)
  ) {
    diagnostics.push({
      code: "PPTV-MANIFEST-INVALID",
      severity: "error",
      message: `Manifest field "${key}" must be a versioned profile identifier such as "pptv-browser/0.1".`,
      ...(range === undefined ? {} : { range }),
    });
  }
}

function validateStableId(
  id: string,
  field: string,
  diagnostics: Diagnostic[],
  range?: SourceRange,
): void {
  if (STABLE_ID_PATTERN.test(id)) return;
  diagnostics.push({
    code: "PPTV-ID-INVALID",
    severity: "error",
    message: `${field} value "${id}" is not a valid stable ID (ASCII letter first; up to 128 letters, digits, ".", "_", ":", or "-").`,
    ...(range === undefined ? {} : { range }),
  });
}

function fieldDiagnostic(
  root: JsonNode,
  key: string,
  baseOffset: number,
  mapper: SourceMapper,
  diagnostic: Omit<Diagnostic, "range">,
): Diagnostic {
  const range = fieldRange(root, key, baseOffset, mapper);
  return { ...diagnostic, ...(range === undefined ? {} : { range }) };
}

function fieldRange(
  root: JsonNode,
  key: string,
  baseOffset: number,
  mapper: SourceMapper,
): SourceRange | undefined {
  const node = findNodeAtLocation(root, [key]);
  return node === undefined
    ? undefined
    : jsonNodeRange(node, baseOffset, mapper);
}

function jsonNodeRange(
  node: JsonNode,
  baseOffset: number,
  mapper: SourceMapper,
): SourceRange {
  return mapper.range(
    baseOffset + node.offset,
    baseOffset + node.offset + node.length,
  );
}

function typeDiagnostic(
  field: string,
  type: string,
  range?: SourceRange,
): Diagnostic {
  return {
    code: "PPTV-MANIFEST-INVALID",
    severity: "error",
    message: `Manifest ${field} must be ${type}.`,
    ...(range === undefined ? {} : { range }),
  };
}

function isManifestValue(value: unknown): value is PptvManifest {
  return (
    isRecord(value) &&
    typeof value.pptv === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.runtime === undefined || typeof value.runtime === "string") &&
    (value.editor === undefined || typeof value.editor === "string") &&
    (value.theme === undefined || typeof value.theme === "string") &&
    (value.themes === undefined ||
      (Array.isArray(value.themes) &&
        value.themes.every((theme) => typeof theme === "string"))) &&
    Array.isArray(value.slides) &&
    value.slides.every(isManifestSlideValue) &&
    (value.agentProfile === undefined ||
      typeof value.agentProfile === "string") &&
    (value.extensions === undefined || isRecord(value.extensions))
  );
}

function isManifestSlideValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    (isRecord(value) &&
      typeof value.id === "string" &&
      (value.layout === undefined || typeof value.layout === "string") &&
      (value.hidden === undefined || typeof value.hidden === "boolean") &&
      (value.namespace === undefined || typeof value.namespace === "string") &&
      (value.src === undefined || typeof value.src === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byId(
  scan: PptvScan,
  kind: PptvSectionKind,
): Map<string, PptvScan["sections"]> {
  const result = new Map<string, PptvScan["sections"]>();
  for (const section of scan.sections) {
    if (section.kind !== kind || section.id === undefined) continue;
    const values = result.get(section.id) ?? [];
    values.push(section);
    result.set(section.id, values);
  }
  return result;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    else seen.add(value);
  }
  return [...repeated];
}
