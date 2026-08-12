/**
 * Trusted browser recovery for descriptor-only inline PNG projections.
 *
 * Raster payload bytes remain exact-source authority. The editor recovers one
 * literal href only after the surrounding source has passed its integrity gate,
 * then reruns the bounded C4 PNG parser and compares every descriptor field.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import { parseVector180InlinePngDataUri } from "../core/inline-png.js";
import type {
  Diagnostic,
  Vector180Document,
  Vector180InlinePngResourceDescriptor,
  Vector180Node,
} from "../core/types.js";

export type TrustedInlinePngRecovery =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly descriptor: Vector180InlinePngResourceDescriptor;
    }
  | {
      readonly ok: false;
      readonly diagnostic: Diagnostic;
    };

export function recoverTrustedInlinePng(
  document: Vector180Document,
  objectId: string,
  expected: Vector180InlinePngResourceDescriptor,
  integrityVerified: boolean,
): TrustedInlinePngRecovery {
  if (!integrityVerified) {
    return failure(
      objectId,
      "VECTOR180-EDITOR-RASTER-INTEGRITY",
      "Raster preview is unavailable because the exact source integrity gate did not pass.",
    );
  }

  const node = findNode(document, objectId);
  const indexed = document.index.objects.get(objectId);
  if (
    node === undefined ||
    indexed === undefined ||
    node.elementName !== "image" ||
    node.role !== "asset" ||
    node.exportMode !== "raster" ||
    node.resource === undefined ||
    !sameDescriptor(node.resource, expected)
  ) {
    return failure(
      objectId,
      "VECTOR180-EDITOR-RASTER-DESCRIPTOR",
      `Raster "${objectId}" no longer matches its descriptor-only resolved model.`,
    );
  }

  const hrefRanges = ["href", "xlink:href"]
    .map((name) => ({ name, range: indexed.attributeRanges.get(name) }))
    .filter(
      (
        candidate,
      ): candidate is {
        name: string;
        range: NonNullable<typeof candidate.range>;
      } => candidate.range !== undefined,
    );
  if (hrefRanges.length !== 1) {
    return failure(
      objectId,
      "VECTOR180-EDITOR-RASTER-SOURCE",
      `Raster "${objectId}" does not have exactly one source-located inline PNG attribute.`,
    );
  }

  const candidate = hrefRanges[0]!;
  const exactAttribute = document.source.text.slice(
    candidate.range.charStart,
    candidate.range.charEnd,
  );
  const dataUri = literalAttributeValue(exactAttribute, candidate.name);
  if (dataUri === undefined) {
    return failure(
      objectId,
      "VECTOR180-EDITOR-RASTER-SOURCE",
      `Raster "${objectId}" does not retain one literal canonical inline PNG attribute.`,
    );
  }

  const parsed = parseVector180InlinePngDataUri(dataUri);
  if (!parsed.ok || !sameDescriptor(parsed.descriptor, expected)) {
    return failure(
      objectId,
      "VECTOR180-EDITOR-RASTER-AUTHENTICATION",
      `Raster "${objectId}" failed exact-byte authentication against its descriptor.`,
    );
  }
  return {
    ok: true,
    bytes: parsed.bytes.slice(),
    descriptor: parsed.descriptor,
  };
}

function literalAttributeValue(
  exactAttribute: string,
  expectedName: string,
): string | undefined {
  const match = exactAttribute.match(
    /^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([^"'<>]*)\2$/u,
  );
  if (match?.[1]?.toLowerCase() !== expectedName) return undefined;
  return match[3];
}

function sameDescriptor(
  left: Vector180InlinePngResourceDescriptor,
  right: Vector180InlinePngResourceDescriptor,
): boolean {
  return (
    left.mediaType === right.mediaType &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.widthPixels === right.widthPixels &&
    left.heightPixels === right.heightPixels
  );
}

function findNode(
  document: Vector180Document,
  id: string,
): ReturnType<typeof findInRoots> {
  if (document.sourceKind === "svg") return findInRoots(document.children, id);
  for (const slide of document.slides.values()) {
    const node = findInRoots(slide.children, id);
    if (node !== undefined) return node;
  }
  return undefined;
}

function findInRoots(
  roots: readonly Vector180Node[],
  id: string,
): Vector180Node | undefined {
  for (const node of roots) {
    if (node.id === id) return node;
    const child = findInRoots(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function failure(
  objectId: string,
  code: string,
  message: string,
): TrustedInlinePngRecovery {
  return {
    ok: false,
    diagnostic: { code, severity: "error", message, objectId },
  };
}
