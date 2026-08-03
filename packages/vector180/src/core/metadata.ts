/**
 * Strict inert metadata parsing and canonical hashing for Vector180 atoms.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import {
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";

import { PROFILE_ID_PATTERN, STABLE_ID_PATTERN } from "./manifest.js";
import { sha256Hex } from "./source.js";
import type {
  Diagnostic,
  SourceRange,
  Vector180AtomMetadata,
  Vector180MetadataProjection,
} from "./types.js";

const METADATA_SCHEMA = "vector180-atom-metadata/0.1";
const MAX_METADATA_BYTES = 4096;
const MAX_METADATA_DEPTH = 4;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/u;

export interface ParseAtomMetadataInput {
  readonly marker: string;
  readonly payload: string;
  readonly elementRange: SourceRange;
  readonly contentRange: SourceRange;
}

export interface ParseAtomMetadataResult {
  readonly projection?: Vector180MetadataProjection;
  readonly diagnostics: readonly Diagnostic[];
}

export async function parseAtomMetadata(
  input: ParseAtomMetadataInput,
): Promise<ParseAtomMetadataResult> {
  const diagnostics: Diagnostic[] = [];
  if (input.marker !== METADATA_SCHEMA) {
    diagnostics.push(
      invalidMetadata(
        `Recognized metadata marker must equal "${METADATA_SCHEMA}".`,
        input.elementRange,
      ),
    );
    return { diagnostics };
  }

  const payloadBytes = new TextEncoder().encode(input.payload);
  if (payloadBytes.byteLength > MAX_METADATA_BYTES) {
    diagnostics.push(
      invalidMetadata(
        `Atom metadata is ${payloadBytes.byteLength} bytes; the limit is ${MAX_METADATA_BYTES}.`,
        input.contentRange,
      ),
    );
    return { diagnostics };
  }

  const parseErrors: ParseError[] = [];
  const root = parseTree(input.payload, parseErrors, {
    allowTrailingComma: false,
    disallowComments: true,
    allowEmptyContent: false,
  });
  for (const error of parseErrors) {
    diagnostics.push(
      invalidMetadata(
        `Invalid metadata JSON: ${printParseErrorCode(error.error)}.`,
        input.contentRange,
      ),
    );
  }
  if (root === undefined || root.type !== "object") {
    diagnostics.push(
      invalidMetadata(
        "Atom metadata payload must be one JSON object.",
        input.contentRange,
      ),
    );
    return { diagnostics };
  }
  diagnostics.push(...detectDuplicateKeys(root, input.contentRange));
  if (jsonDepth(root) > MAX_METADATA_DEPTH) {
    diagnostics.push(
      invalidMetadata(
        `Atom metadata exceeds the ${MAX_METADATA_DEPTH}-level depth limit.`,
        input.contentRange,
      ),
    );
  }

  const value = getNodeValue(root) as unknown;
  const metadata = validateMetadata(value, diagnostics, input.contentRange);
  if (metadata === undefined || hasMetadataErrors(diagnostics)) {
    return { diagnostics };
  }
  const canonicalJson = canonicalJsonText(metadata);
  const metadataSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalJson),
  );
  return {
    projection: Object.freeze({
      value: deepFreeze(metadata),
      metadataSha256,
      canonicalJson,
      sourceRange: input.elementRange,
      contentRange: input.contentRange,
    }),
    diagnostics,
  };
}

export function canonicalJsonText(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function validateMetadata(
  value: unknown,
  diagnostics: Diagnostic[],
  range: SourceRange,
): Vector180AtomMetadata | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      invalidMetadata("Atom metadata must be an object.", range),
    );
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ["hydration", "templateLineage", "styleFamily"],
    "metadata",
    diagnostics,
    range,
  );
  if (
    value.hydration === undefined &&
    value.templateLineage === undefined &&
    value.styleFamily === undefined
  ) {
    diagnostics.push(
      invalidMetadata(
        "Atom metadata must declare hydration, templateLineage, or styleFamily.",
        range,
      ),
    );
  }

  const hydration =
    value.hydration === undefined
      ? undefined
      : validateHydration(value.hydration, diagnostics, range);
  const templateLineage =
    value.templateLineage === undefined
      ? undefined
      : validateTemplateLineage(value.templateLineage, diagnostics, range);
  const styleFamily =
    value.styleFamily === undefined
      ? undefined
      : validateStyleFamily(value.styleFamily, diagnostics, range);
  if (
    (value.hydration !== undefined && hydration === undefined) ||
    (value.templateLineage !== undefined && templateLineage === undefined) ||
    (value.styleFamily !== undefined && styleFamily === undefined)
  ) {
    return undefined;
  }
  return {
    ...(hydration === undefined ? {} : { hydration }),
    ...(templateLineage === undefined ? {} : { templateLineage }),
    ...(styleFamily === undefined ? {} : { styleFamily }),
  };
}

function validateHydration(
  value: unknown,
  diagnostics: Diagnostic[],
  range: SourceRange,
): Vector180AtomMetadata["hydration"] | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalidMetadata("hydration must be an object.", range));
    return undefined;
  }
  const keys = [
    "method",
    "sourceWireFamily",
    "sourceSha256",
    "sourceObjectId",
    "sourceObjectSha256",
    "activeThemeId",
  ];
  rejectUnknownKeys(value, keys, "hydration", diagnostics, range);
  const valid =
    isProfile(value.method) &&
    (value.sourceWireFamily === "vector180" ||
      value.sourceWireFamily === "pptv-legacy") &&
    isSha256(value.sourceSha256) &&
    isStableId(value.sourceObjectId) &&
    isSha256(value.sourceObjectSha256) &&
    isStableId(value.activeThemeId) &&
    keys.every((key) => Object.hasOwn(value, key));
  if (!valid) {
    diagnostics.push(
      invalidMetadata(
        "hydration requires the contracted profile, source family, exact hashes, source object ID, and active theme ID.",
        range,
      ),
    );
    return undefined;
  }
  return {
    method: value.method as string,
    sourceWireFamily: value.sourceWireFamily as "vector180" | "pptv-legacy",
    sourceSha256: value.sourceSha256 as string,
    sourceObjectId: value.sourceObjectId as string,
    sourceObjectSha256: value.sourceObjectSha256 as string,
    activeThemeId: value.activeThemeId as string,
  };
}

function validateTemplateLineage(
  value: unknown,
  diagnostics: Diagnostic[],
  range: SourceRange,
): Vector180AtomMetadata["templateLineage"] | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      invalidMetadata("templateLineage must be an object.", range),
    );
    return undefined;
  }
  const keys = ["generatorProfile", "templateId", "templateSha256"];
  rejectUnknownKeys(value, keys, "templateLineage", diagnostics, range);
  if (
    !isProfile(value.generatorProfile) ||
    !isStableId(value.templateId) ||
    !isSha256(value.templateSha256) ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    diagnostics.push(
      invalidMetadata(
        "templateLineage requires generatorProfile, templateId, and exact lowercase templateSha256.",
        range,
      ),
    );
    return undefined;
  }
  return {
    generatorProfile: value.generatorProfile,
    templateId: value.templateId,
    templateSha256: value.templateSha256,
  };
}

function validateStyleFamily(
  value: unknown,
  diagnostics: Diagnostic[],
  range: SourceRange,
): Vector180AtomMetadata["styleFamily"] | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalidMetadata("styleFamily must be an object.", range));
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ["id", "version", "definitionSha256"],
    "styleFamily",
    diagnostics,
    range,
  );
  if (
    !isStableId(value.id) ||
    (value.version !== undefined &&
      (typeof value.version !== "string" ||
        value.version.length > 32 ||
        !VERSION_PATTERN.test(value.version))) ||
    (value.definitionSha256 !== undefined && !isSha256(value.definitionSha256))
  ) {
    diagnostics.push(
      invalidMetadata(
        "styleFamily requires a stable id and permits only a bounded numeric version and lowercase definitionSha256.",
        range,
      ),
    );
    return undefined;
  }
  return {
    id: value.id,
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.definitionSha256 === undefined
      ? {}
      : { definitionSha256: value.definitionSha256 }),
  };
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  diagnostics: Diagnostic[],
  range: SourceRange,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      diagnostics.push(
        invalidMetadata(`${label} contains unknown field "${key}".`, range),
      );
    }
  }
}

function detectDuplicateKeys(root: JsonNode, range: SourceRange): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.type === "object") {
      const seen = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value;
        if (typeof key === "string") {
          if (seen.has(key)) {
            diagnostics.push(
              invalidMetadata(`Metadata JSON repeats field "${key}".`, range),
            );
          }
          seen.add(key);
        }
      }
    }
    pending.push(...(node.children ?? []));
  }
  return diagnostics;
}

function jsonDepth(root: JsonNode): number {
  let maximum = 0;
  const pending: Array<{ node: JsonNode; depth: number }> = [
    { node: root, depth: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    maximum = Math.max(maximum, current.depth);
    for (const child of current.node.children ?? []) {
      pending.push({
        node: child,
        depth:
          child.type === "object" || child.type === "array"
            ? current.depth + 1
            : current.depth,
      });
    }
  }
  return maximum;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

function invalidMetadata(message: string, range: SourceRange): Diagnostic {
  return {
    code: "VECTOR180-METADATA-INVALID",
    severity: "error",
    message,
    range,
  };
}

function hasMetadataErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

function isProfile(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    PROFILE_ID_PATTERN.test(value)
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
