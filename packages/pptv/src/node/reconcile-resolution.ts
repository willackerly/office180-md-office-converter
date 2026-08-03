/**
 * Strict, hash-bound review input for one copied native connector.
 *
 * CONTRACT:C5-PPTV-PATCH.1.3
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2
 */

import { createHash } from "node:crypto";

import type {
  PptvConcreteNativeStyle,
  PptvConnectorCloneState,
  PptvConnectorEndpoints,
} from "../core/types.js";
import type {
  PptxIdentityOccurrence,
  PptxInspectedStyle,
} from "./pptx-inspect.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const PAINT_PATTERN = /^(?:none|#[0-9a-f]{6})$/u;
const RESOLUTION_KEYS = [
  "schema",
  "sourceSha256",
  "baselineMapSha256",
  "editedPptxSha256",
  "comparisonPptxSha256",
  "duplicateId",
  "newId",
  "baselineOccurrenceFingerprintSha256",
  "copiedOccurrenceFingerprintSha256",
  "parentId",
  "oldOrder",
  "order",
  "connector",
] as const;

export interface PptvConnectorOccurrenceFingerprint {
  readonly element: "p:cxnSp";
  readonly parentId: string | null;
  readonly order: number;
  readonly identityNormalizedStructureSignature: string;
  readonly geometry: {
    readonly kind: "line";
    readonly x1Emu: number;
    readonly y1Emu: number;
    readonly x2Emu: number;
    readonly y2Emu: number;
  };
  readonly style: PptxInspectedStyle;
  readonly connections: readonly {
    readonly end: "start" | "end";
    readonly targetObjectId?: string;
    readonly siteIndex: number;
  }[];
  readonly hasCreationId: boolean;
}

export interface PptvReconcileResolution {
  readonly schema: "pptv-reconcile-resolution/0.1";
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly comparisonPptxSha256: string;
  readonly duplicateId: string;
  readonly newId: string;
  readonly baselineOccurrenceFingerprintSha256: string;
  readonly copiedOccurrenceFingerprintSha256: string;
  readonly parentId: string;
  readonly oldOrder: readonly string[];
  readonly order: readonly string[];
  readonly connector: PptvConnectorCloneState;
}

export class PptvReconcileResolutionError extends Error {
  readonly code = "PPTV-RECONCILE-RESOLUTION";

  constructor(message: string) {
    super(message);
    this.name = "PptvReconcileResolutionError";
  }
}

export type PptvConnectorDuplicateResolutionStatus =
  | "eligible"
  | "no-baseline-match"
  | "ambiguous-baseline-matches"
  | "wrong-occurrence-count"
  | "unsupported-fingerprint";

export interface PptvConnectorDuplicateResolutionAssessment {
  readonly status: PptvConnectorDuplicateResolutionStatus;
  readonly eligible: boolean;
  readonly editedOccurrenceCount: number;
  readonly requiredEditedOccurrenceCount: 2;
  readonly baselineEquivalentOccurrenceCount: number | null;
  readonly requiredBaselineEquivalentOccurrenceCount: 1;
  readonly resolutionSchema: "pptv-reconcile-resolution/0.1";
  readonly nextActionIds: readonly string[];
}

export interface PptvConnectorDuplicateResolutionGuidance {
  readonly assessment: PptvConnectorDuplicateResolutionAssessment;
  readonly summary: string;
  readonly options: readonly {
    readonly id: string;
    readonly description: string;
    readonly consequence: string;
  }[];
}

/**
 * Turns privacy-safe occurrence digests into deterministic agent handoff
 * guidance. It never chooses an occurrence or manufactures review fields.
 */
export function connectorDuplicateResolutionGuidance(
  baselineFingerprintSha256: string | undefined,
  occurrenceFingerprintSha256s: readonly (string | undefined)[],
): PptvConnectorDuplicateResolutionGuidance {
  const editedOccurrenceCount = occurrenceFingerprintSha256s.length;
  const allFingerprintable =
    baselineFingerprintSha256 !== undefined &&
    occurrenceFingerprintSha256s.every(
      (fingerprint): fingerprint is string => fingerprint !== undefined,
    );
  const baselineEquivalentOccurrenceCount = allFingerprintable
    ? occurrenceFingerprintSha256s.filter(
        (fingerprint) => fingerprint === baselineFingerprintSha256,
      ).length
    : null;

  if (!allFingerprintable) {
    return guidance(
      {
        status: "unsupported-fingerprint",
        eligible: false,
        editedOccurrenceCount,
        baselineEquivalentOccurrenceCount,
        nextActionIds: ["author-connectors-in-source"],
      },
      "The baseline or at least one edited occurrence lacks a complete supported connector fingerprint. Strict connector-copy resolution is unavailable.",
      [
        {
          id: "author-connectors-in-source",
          description:
            "Represent the intended connector inventory explicitly in canonical PPTV source with fresh stable IDs and explicit bindings.",
          consequence:
            "Compile a new authenticated baseline; no Office occurrence is selected heuristically.",
        },
      ],
    );
  }
  if (editedOccurrenceCount !== 2) {
    return guidance(
      {
        status: "wrong-occurrence-count",
        eligible: false,
        editedOccurrenceCount,
        baselineEquivalentOccurrenceCount,
        nextActionIds: [
          "restore-exactly-two-occurrences",
          "author-connectors-in-source",
        ],
      },
      `Strict connector-copy recovery requires exactly two edited occurrences; this identity has ${editedOccurrenceCount}.`,
      [
        {
          id: "restore-exactly-two-occurrences",
          description:
            "Remove unintended copies until one mapped connector and one intended copy remain.",
          consequence:
            "Rerun reconciliation to obtain fresh fingerprints; the current evidence cannot be used as a resolution.",
        },
        {
          id: "author-connectors-in-source",
          description:
            "Represent the intended connector inventory explicitly in canonical PPTV source.",
          consequence:
            "Compile a new authenticated baseline rather than importing an ambiguous Office inventory.",
        },
      ],
    );
  }
  if (baselineEquivalentOccurrenceCount === 0) {
    return guidance(
      {
        status: "no-baseline-match",
        eligible: false,
        editedOccurrenceCount,
        baselineEquivalentOccurrenceCount,
        nextActionIds: [
          "restore-one-baseline-occurrence",
          "author-connectors-in-source",
        ],
      },
      "Neither edited connector occurrence is baseline-equivalent. Both copies changed or their structure drifted, so a single-clone resolution cannot be accepted.",
      [
        {
          id: "restore-one-baseline-occurrence",
          description:
            "Restore one occurrence exactly to the authenticated mapped connector while retaining the intended edited copy.",
          consequence:
            "Rerun reconciliation and review fresh hashes and fingerprints before creating a resolution.",
        },
        {
          id: "author-connectors-in-source",
          description:
            "Author the intended original and additional connector explicitly in canonical PPTV source.",
          consequence:
            "Compile a new authenticated baseline; do not attempt to assign either changed Office occurrence by numeric ID or position.",
        },
      ],
    );
  }
  if (baselineEquivalentOccurrenceCount === 2) {
    return guidance(
      {
        status: "ambiguous-baseline-matches",
        eligible: false,
        editedOccurrenceCount,
        baselineEquivalentOccurrenceCount,
        nextActionIds: ["finish-one-copy-edit", "author-connectors-in-source"],
      },
      "Both edited connector occurrences are baseline-equivalent. The intended copy is ambiguous, so a single-clone resolution cannot select one.",
      [
        {
          id: "finish-one-copy-edit",
          description:
            "Leave the mapped occurrence unchanged and finish the intended copy's geometry or style edit.",
          consequence:
            "Rerun reconciliation and review fresh evidence; numeric IDs and z-order still cannot select the copy.",
        },
        {
          id: "author-connectors-in-source",
          description:
            "Author the additional connector explicitly in canonical PPTV source with a fresh stable ID.",
          consequence:
            "Compile a new authenticated baseline without asking reconciliation to distinguish identical Office occurrences.",
        },
      ],
    );
  }
  return guidance(
    {
      status: "eligible",
      eligible: true,
      editedOccurrenceCount,
      baselineEquivalentOccurrenceCount,
      nextActionIds: [
        "submit-hash-bound-connector-resolution",
        "restore-one-mapped-occurrence",
      ],
    },
    "Exactly one of two edited connector occurrences is baseline-equivalent. This duplicate is eligible for a strict pptv-reconcile-resolution/0.1 review input; every other finding must still be resolved.",
    [
      {
        id: "submit-hash-bound-connector-resolution",
        description:
          "Choose a fresh stable ID and explicit existing from/to IDs, then copy the exact hashes, fingerprints, parent/order, endpoints, and style into the strict resolution document.",
        consequence:
          "Rerun reconcile with --resolution PATH; any intervening source, map, PPTX, or occurrence change makes the review stale.",
      },
      {
        id: "restore-one-mapped-occurrence",
        description:
          "Undo/delete the copy and restore one object with the mapped src.<stable-id> name.",
        consequence:
          "Rerun reconciliation; supported independent changes can then be validated without clone recovery.",
      },
    ],
  );
}

export function parsePptvReconcileResolution(
  input: unknown,
): PptvReconcileResolution {
  const value = requireRecord(input, "Resolution");
  requireExactKeys(value, RESOLUTION_KEYS, "Resolution");
  if (value["schema"] !== "pptv-reconcile-resolution/0.1") {
    fail('Resolution schema must be exactly "pptv-reconcile-resolution/0.1".');
  }
  const connector = parseConnector(value["connector"]);
  const result: PptvReconcileResolution = {
    schema: "pptv-reconcile-resolution/0.1",
    sourceSha256: requireSha256(value["sourceSha256"], "sourceSha256"),
    baselineMapSha256: requireSha256(
      value["baselineMapSha256"],
      "baselineMapSha256",
    ),
    editedPptxSha256: requireSha256(
      value["editedPptxSha256"],
      "editedPptxSha256",
    ),
    comparisonPptxSha256: requireSha256(
      value["comparisonPptxSha256"],
      "comparisonPptxSha256",
    ),
    duplicateId: requireStableId(value["duplicateId"], "duplicateId"),
    newId: requireStableId(value["newId"], "newId"),
    baselineOccurrenceFingerprintSha256: requireSha256(
      value["baselineOccurrenceFingerprintSha256"],
      "baselineOccurrenceFingerprintSha256",
    ),
    copiedOccurrenceFingerprintSha256: requireSha256(
      value["copiedOccurrenceFingerprintSha256"],
      "copiedOccurrenceFingerprintSha256",
    ),
    parentId: requireStableId(value["parentId"], "parentId"),
    oldOrder: parseStableIdArray(value["oldOrder"], "oldOrder"),
    order: parseStableIdArray(value["order"], "order"),
    connector,
  };
  if (result.duplicateId === result.newId) {
    fail("Resolution newId must differ from duplicateId.");
  }
  if (
    result.connector.endpoints.x1 === result.connector.endpoints.x2 &&
    result.connector.endpoints.y1 === result.connector.endpoints.y2
  ) {
    fail("Resolution connector endpoints must be non-degenerate.");
  }
  return deepFreeze(result);
}

function guidance(
  assessment: Omit<
    PptvConnectorDuplicateResolutionAssessment,
    | "requiredEditedOccurrenceCount"
    | "requiredBaselineEquivalentOccurrenceCount"
    | "resolutionSchema"
  >,
  summary: string,
  options: PptvConnectorDuplicateResolutionGuidance["options"],
): PptvConnectorDuplicateResolutionGuidance {
  return deepFreeze({
    assessment: {
      ...assessment,
      requiredEditedOccurrenceCount: 2,
      requiredBaselineEquivalentOccurrenceCount: 1,
      resolutionSchema: "pptv-reconcile-resolution/0.1",
    },
    summary,
    options: options.map((option) => ({ ...option })),
  });
}

export function serializePptvReconcileResolution(input: unknown): string {
  return `${JSON.stringify(parsePptvReconcileResolution(input), null, 2)}\n`;
}

export function fingerprintConnectorOccurrence(
  occurrence: PptxIdentityOccurrence,
): PptvConnectorOccurrenceFingerprint | undefined {
  if (
    occurrence.element !== "p:cxnSp" ||
    occurrence.semanticError !== undefined ||
    occurrence.identityNormalizedStructureSignature === undefined ||
    occurrence.geometry?.kind !== "line" ||
    occurrence.style === undefined
  ) {
    return undefined;
  }
  return deepFreeze({
    element: "p:cxnSp",
    parentId: occurrence.parentId,
    order: occurrence.order,
    identityNormalizedStructureSignature:
      occurrence.identityNormalizedStructureSignature,
    geometry: {
      kind: "line",
      x1Emu: occurrence.geometry.x1Emu,
      y1Emu: occurrence.geometry.y1Emu,
      x2Emu: occurrence.geometry.x2Emu,
      y2Emu: occurrence.geometry.y2Emu,
    },
    style: { ...occurrence.style },
    connections: Object.freeze(
      occurrence.connections.map((connection) =>
        Object.freeze({
          end: connection.end,
          ...(connection.targetObjectId === undefined
            ? {}
            : { targetObjectId: connection.targetObjectId }),
          siteIndex: connection.siteIndex,
        }),
      ),
    ),
    hasCreationId: occurrence.hasCreationId,
  });
}

export function connectorOccurrenceFingerprintSha256(
  occurrence: PptxIdentityOccurrence,
): string | undefined {
  const fingerprint = fingerprintConnectorOccurrence(occurrence);
  return fingerprint === undefined
    ? undefined
    : sha256Text(canonicalStringify(fingerprint));
}

function parseConnector(value: unknown): PptvConnectorCloneState {
  const connector = requireRecord(value, "connector");
  requireExactKeys(
    connector,
    ["fromId", "toId", "endpoints", "style"],
    "connector",
  );
  return {
    fromId: requireStableId(connector["fromId"], "connector.fromId"),
    toId: requireStableId(connector["toId"], "connector.toId"),
    endpoints: parseEndpoints(connector["endpoints"]),
    style: parseStyle(connector["style"]),
  };
}

function parseEndpoints(value: unknown): PptvConnectorEndpoints {
  const endpoints = requireRecord(value, "connector.endpoints");
  requireExactKeys(endpoints, ["x1", "y1", "x2", "y2"], "connector.endpoints");
  return {
    x1: requireFinite(endpoints["x1"], "connector.endpoints.x1"),
    y1: requireFinite(endpoints["y1"], "connector.endpoints.y1"),
    x2: requireFinite(endpoints["x2"], "connector.endpoints.x2"),
    y2: requireFinite(endpoints["y2"], "connector.endpoints.y2"),
  };
}

function parseStyle(value: unknown): PptvConcreteNativeStyle {
  const style = requireRecord(value, "connector.style");
  const requiredKeys = [
    "fill",
    "stroke",
    "strokeWidth",
    "opacity",
    "fontWeight",
    "fontStyle",
    "textAnchor",
  ] as const;
  const optionalKeys = ["fontFamily", "fontSize"] as const;
  requireExactKeys(
    style,
    [...requiredKeys, ...optionalKeys],
    "connector.style",
    {
      optional: optionalKeys,
    },
  );
  const fill = requirePaint(style["fill"], "connector.style.fill");
  const stroke = requirePaint(style["stroke"], "connector.style.stroke");
  const strokeWidth = requireFinite(
    style["strokeWidth"],
    "connector.style.strokeWidth",
  );
  const opacity = requireFinite(style["opacity"], "connector.style.opacity");
  const fontWeight = style["fontWeight"];
  const fontStyle = style["fontStyle"];
  const textAnchor = style["textAnchor"];
  if (strokeWidth < 0) fail("connector.style.strokeWidth must be nonnegative.");
  if (opacity < 0 || opacity > 1) {
    fail("connector.style.opacity must be between 0 and 1.");
  }
  if (fontWeight !== 400 && fontWeight !== 700) {
    fail("connector.style.fontWeight must be 400 or 700.");
  }
  if (fontStyle !== "normal" && fontStyle !== "italic") {
    fail('connector.style.fontStyle must be "normal" or "italic".');
  }
  if (
    textAnchor !== "start" &&
    textAnchor !== "middle" &&
    textAnchor !== "end"
  ) {
    fail('connector.style.textAnchor must be "start", "middle", or "end".');
  }
  const fontFamily = style["fontFamily"];
  const fontSize = style["fontSize"];
  if (
    fontFamily !== undefined &&
    (typeof fontFamily !== "string" || fontFamily.length === 0)
  ) {
    fail("connector.style.fontFamily must be a nonempty string.");
  }
  if (
    fontSize !== undefined &&
    (typeof fontSize !== "number" ||
      !Number.isFinite(fontSize) ||
      fontSize <= 0)
  ) {
    fail("connector.style.fontSize must be a finite positive number.");
  }
  return {
    fill,
    stroke,
    strokeWidth,
    opacity,
    ...(typeof fontFamily === "string" ? { fontFamily } : {}),
    ...(typeof fontSize === "number" ? { fontSize } : {}),
    fontWeight,
    fontStyle,
    textAnchor,
  };
}

function parseStableIdArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a nonempty stable-ID array.`);
  }
  const parsed = value.map((entry, index) =>
    requireStableId(entry, `${label}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length) {
    fail(`${label} must not contain duplicate stable IDs.`);
  }
  return Object.freeze(parsed);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  label: string,
  options: { readonly optional?: readonly string[] } = {},
): void {
  const allowed = new Set(allowedKeys);
  const optional = new Set(options.optional ?? []);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !allowed.has(key));
  const missing = allowedKeys.filter(
    (key) => !optional.has(key) && !Object.hasOwn(value, key),
  );
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      `${label} has invalid fields (missing: ${listOrNone(missing)}; unknown: ${listOrNone(unknown)}).`,
    );
  }
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireStableId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !STABLE_ID_PATTERN.test(value)
  ) {
    fail(`${label} must be one valid stable ID.`);
  }
  return value;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function requirePaint(value: unknown, label: string): string {
  if (typeof value !== "string" || !PAINT_PATTERN.test(value)) {
    fail(`${label} must be "none" or a lowercase six-digit hex color.`);
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function listOrNone(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new PptvReconcileResolutionError(message);
}
