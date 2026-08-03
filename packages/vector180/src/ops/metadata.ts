/**
 * Non-authoritative metadata and resolved style-palette evidence.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import {
  resolveVector180Atom,
  type Vector180ResolvedAtomObject,
} from "../core/resolved.js";
import { canonicalJsonText } from "../core/metadata.js";
import { sha256Hex } from "../core/source.js";
import type {
  Diagnostic,
  Vector180Atom,
  Vector180AtomMetadata,
} from "../core/types.js";

export interface Vector180MetadataInspection {
  readonly schema: "vector180-atom-metadata-inspection/0.1";
  readonly family: Vector180Atom["wireFamily"];
  readonly atomId: string;
  readonly sourceSha256: string;
  readonly metadataStatus: "absent" | "present" | "invalid";
  readonly metadata?: Vector180AtomMetadata;
  readonly metadataSha256?: string;
  readonly templateLineageStatus: "absent" | "asserted";
  readonly stylePaletteSha256?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export type Vector180MetadataComparisonClassification =
  | "exact-verified-template"
  | "matching-asserted-template"
  | "matching-declared-style-family"
  | "matching-derived-style-palette"
  | "different"
  | "insufficient-evidence";

export interface Vector180MetadataComparison {
  readonly schema: "vector180-atom-metadata-comparison/0.1";
  readonly classification: Vector180MetadataComparisonClassification;
  readonly left: Vector180MetadataInspection;
  readonly right: Vector180MetadataInspection;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180MetadataComparisonOptions {
  /** Exact independently supplied template-basis bytes; never discovered. */
  readonly templateBasisBytes?: Uint8Array;
}

const MAX_TEMPLATE_BASIS_BYTES = 8 * 1024 * 1024;

export async function projectAtomMetadata(
  atom: Vector180Atom,
): Promise<Vector180MetadataInspection> {
  const resolved = resolveVector180Atom(atom);
  const stylePaletteSha256 =
    resolved.model === undefined
      ? undefined
      : resolved.model.stylePaletteSha256;
  const hasInvalidMetadata = atom.diagnostics.some(
    (diagnostic) => diagnostic.code === "VECTOR180-METADATA-INVALID",
  );
  return Object.freeze({
    schema: "vector180-atom-metadata-inspection/0.1",
    family: atom.wireFamily,
    atomId: atom.id,
    sourceSha256: atom.source.sha256,
    metadataStatus: hasInvalidMetadata
      ? "invalid"
      : atom.metadata === undefined
        ? "absent"
        : "present",
    ...(atom.metadata === undefined ? {} : { metadata: atom.metadata }),
    ...(atom.metadataSha256 === undefined
      ? {}
      : { metadataSha256: atom.metadataSha256 }),
    templateLineageStatus:
      atom.metadata?.templateLineage === undefined ? "absent" : "asserted",
    ...(stylePaletteSha256 === undefined ? {} : { stylePaletteSha256 }),
    diagnostics: [...resolved.diagnostics],
  });
}

export async function compareAtomMetadata(
  leftAtom: Vector180Atom,
  rightAtom: Vector180Atom,
  options: Vector180MetadataComparisonOptions = {},
): Promise<Vector180MetadataComparison> {
  const templateBasisTooLarge =
    options.templateBasisBytes !== undefined &&
    options.templateBasisBytes.byteLength > MAX_TEMPLATE_BASIS_BYTES;
  const templateBasisBytes =
    options.templateBasisBytes === undefined || templateBasisTooLarge
      ? undefined
      : options.templateBasisBytes.slice();
  const [left, right] = await Promise.all([
    projectAtomMetadata(leftAtom),
    projectAtomMetadata(rightAtom),
  ]);
  const diagnostics: Diagnostic[] = [...left.diagnostics, ...right.diagnostics];
  if (templateBasisTooLarge) {
    diagnostics.push({
      code: "VECTOR180-METADATA-VERIFICATION",
      severity: "error",
      message: `Template-basis bytes exceed the ${MAX_TEMPLATE_BASIS_BYTES}-byte verification limit.`,
    });
  }
  let classification: Vector180MetadataComparisonClassification;
  if (
    left.metadataStatus === "invalid" ||
    right.metadataStatus === "invalid" ||
    left.stylePaletteSha256 === undefined ||
    right.stylePaletteSha256 === undefined
  ) {
    classification = "insufficient-evidence";
  } else if (
    left.metadata?.templateLineage !== undefined &&
    right.metadata?.templateLineage !== undefined
  ) {
    const sameDeclaration = sameJson(
      left.metadata.templateLineage,
      right.metadata.templateLineage,
    );
    if (!sameDeclaration) {
      classification = "different";
    } else if (templateBasisTooLarge) {
      classification = "insufficient-evidence";
    } else if (templateBasisBytes === undefined) {
      classification = "matching-asserted-template";
    } else {
      const basisSha256 = await sha256Hex(templateBasisBytes);
      if (
        basisSha256 === left.metadata.templateLineage.templateSha256 &&
        basisSha256 === right.metadata.templateLineage.templateSha256
      ) {
        classification = "exact-verified-template";
      } else {
        classification = "insufficient-evidence";
        diagnostics.push({
          code: "VECTOR180-METADATA-VERIFICATION",
          severity: "error",
          message:
            "Supplied template-basis bytes do not match both declared templateSha256 values.",
        });
      }
    }
  } else if (
    left.metadata?.styleFamily !== undefined &&
    right.metadata?.styleFamily !== undefined
  ) {
    classification = sameJson(
      left.metadata.styleFamily,
      right.metadata.styleFamily,
    )
      ? "matching-declared-style-family"
      : "different";
  } else {
    classification =
      left.stylePaletteSha256 === right.stylePaletteSha256
        ? "matching-derived-style-palette"
        : "different";
  }
  return Object.freeze({
    schema: "vector180-atom-metadata-comparison/0.1",
    classification,
    left,
    right,
    diagnostics,
  });
}

export async function deriveStylePaletteSha256(
  objects: readonly Vector180ResolvedAtomObject[],
): Promise<string> {
  const tuples = new Set<string>();
  visitResolvedObjects(objects, (object) => {
    if (object.kind === "group") return;
    tuples.add(
      JSON.stringify([
        object.kind,
        object.style.fill,
        object.style.stroke,
        canonicalNumber(object.style.strokeWidth),
        canonicalNumber(object.style.opacity),
        object.style.fontFamily ?? null,
        object.style.fontSize === undefined
          ? null
          : canonicalNumber(object.style.fontSize),
        object.style.fontFamily === undefined ? null : object.style.fontWeight,
        object.style.fontFamily === undefined ? null : object.style.fontStyle,
      ]),
    );
  });
  return await sha256Hex(
    new TextEncoder().encode(`[${[...tuples].sort().join(",")}]`),
  );
}

function visitResolvedObjects(
  objects: readonly Vector180ResolvedAtomObject[],
  visitor: (object: Vector180ResolvedAtomObject) => void,
): void {
  for (const object of objects) {
    visitor(object);
    if (object.kind === "group") {
      visitResolvedObjects(object.children, visitor);
    }
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
