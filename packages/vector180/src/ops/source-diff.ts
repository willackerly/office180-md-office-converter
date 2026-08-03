/**
 * Deterministic stable-ID semantic comparison for two visual atoms.
 *
 * CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0
 */

import {
  resolveVector180Atom,
  type Vector180ResolvedAtomObject,
} from "../core/resolved.js";
import { canonicalJsonText } from "../core/metadata.js";
import { hasErrors } from "../core/source.js";
import { loadAtom, Vector180LoadError } from "../core/deck.js";
import { STABLE_ID_PATTERN } from "../core/manifest.js";
import { scanVector180Source } from "../core/scan.js";
import type {
  Diagnostic,
  SourceRange,
  Vector180Atom,
  Vector180Input,
  Vector180Node,
  Vector180Scan,
  VisualWireFamily,
} from "../core/types.js";

export type Vector180DiffClassification =
  "exact" | "semantic-equivalent" | "changed" | "incomparable";

export type Vector180ChangeKind =
  | "root"
  | "added"
  | "removed"
  | "parent"
  | "order"
  | "relationship"
  | "text"
  | "geometry"
  | "transform"
  | "frame"
  | "style"
  | "export-intent"
  | "metadata";

export interface Vector180DiffSourceIdentity {
  readonly family: VisualWireFamily | "unknown";
  readonly kind: "atom" | "deck" | "unknown";
  readonly profile?: "0.1";
  readonly id?: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly metadataSha256?: string;
}

export interface Vector180DiffSide {
  readonly parentId?: string | null;
  readonly order?: number;
  readonly sourceRange?: SourceRange;
  readonly snapshot: JsonValue;
}

export interface Vector180SemanticChange {
  readonly id: string;
  readonly kind: Vector180ChangeKind;
  readonly fieldPath: string;
  readonly left?: Vector180DiffSide;
  readonly right?: Vector180DiffSide;
}

export interface Vector180DiffSummary {
  readonly unchangedObjects: number;
  readonly changedObjects: number;
  readonly added: number;
  readonly removed: number;
  readonly root: number;
  readonly parent: number;
  readonly order: number;
  readonly relationship: number;
  readonly text: number;
  readonly geometry: number;
  readonly transform: number;
  readonly frame: number;
  readonly style: number;
  readonly exportIntent: number;
  readonly metadata: number;
  readonly total: number;
}

export interface Vector180MetadataDiff {
  readonly classification: "absent" | "equal" | "changed" | "unknown";
  readonly leftSha256?: string;
  readonly rightSha256?: string;
  readonly changedSections: readonly (
    "hydration" | "templateLineage" | "styleFamily"
  )[];
}

export interface Vector180SourceDiff {
  readonly schema: "vector180-source-diff/0.1";
  readonly classification: Vector180DiffClassification;
  readonly left: Vector180DiffSourceIdentity;
  readonly right: Vector180DiffSourceIdentity;
  readonly lexical: { readonly equal: boolean };
  readonly metadata: Vector180MetadataDiff;
  readonly summary: Vector180DiffSummary;
  readonly changes: readonly Vector180SemanticChange[];
  readonly diagnostics: readonly Diagnostic[];
}

type JsonPrimitive = null | boolean | number | string;
type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface IndexedSourceNode {
  readonly node: Vector180Node;
  readonly parentId: string | null;
  readonly order: number;
  readonly traversal: number;
}

interface IndexedResolvedObject {
  readonly object: Vector180ResolvedAtomObject;
  readonly traversal: number;
}

const CHANGE_ORDER: Readonly<Record<Vector180ChangeKind, number>> = {
  root: 0,
  added: 1,
  removed: 2,
  parent: 3,
  order: 4,
  relationship: 5,
  text: 6,
  geometry: 7,
  transform: 8,
  frame: 9,
  style: 10,
  "export-intent": 11,
  metadata: 12,
};
const MAX_CHANGES = 100_000;
const MAX_REPORT_BYTES = 8 * 1024 * 1024;

/**
 * Compare two exact input byte streams without requiring callers to pre-load
 * either side. Content failures are contained in a schema-shaped incomparable
 * report so one bad side never prevents the other side's identity from being
 * materialized and recorded.
 */
export async function diffVector180Inputs(
  leftInput: Vector180Input,
  rightInput: Vector180Input,
): Promise<Vector180SourceDiff> {
  const [left, right] = await Promise.all([
    prepareDiffInput(leftInput, "left"),
    prepareDiffInput(rightInput, "right"),
  ]);
  const lexical = {
    equal: left.identity.sha256 === right.identity.sha256,
  };
  if (left.atom === undefined || right.atom === undefined) {
    return incomparable(
      left.identity,
      right.identity,
      lexical,
      {
        classification: "unknown",
        changedSections: [],
      },
      [...left.diagnostics, ...right.diagnostics],
    );
  }
  const report = diffVector180Atoms(left.atom, right.atom);
  return report.classification === "incomparable"
    ? Object.freeze({
        ...report,
        diagnostics: reportDiagnostics(report.diagnostics),
      })
    : report;
}

export function diffVector180Atoms(
  leftAtom: Vector180Atom,
  rightAtom: Vector180Atom,
): Vector180SourceDiff {
  const leftIdentity = sourceIdentity(leftAtom);
  const rightIdentity = sourceIdentity(rightAtom);
  const lexical = {
    equal: leftAtom.source.sha256 === rightAtom.source.sha256,
  };
  const metadata = compareMetadata(leftAtom, rightAtom);
  const leftResolved = resolveVector180Atom(leftAtom);
  const rightResolved = resolveVector180Atom(rightAtom);
  const diagnostics: Diagnostic[] = [];
  if (leftResolved.model === undefined || hasErrors(leftResolved.diagnostics)) {
    diagnostics.push({
      code: "VECTOR180-DIFF-INVALID-LEFT",
      severity: "error",
      message:
        "The left atom does not independently pass complete C4/C6 resolution.",
    });
    diagnostics.push(...leftResolved.diagnostics);
  }
  if (
    rightResolved.model === undefined ||
    hasErrors(rightResolved.diagnostics)
  ) {
    diagnostics.push({
      code: "VECTOR180-DIFF-INVALID-RIGHT",
      severity: "error",
      message:
        "The right atom does not independently pass complete C4/C6 resolution.",
    });
    diagnostics.push(...rightResolved.diagnostics);
  }
  if (leftResolved.model === undefined || rightResolved.model === undefined) {
    return incomparable(
      leftIdentity,
      rightIdentity,
      lexical,
      metadata,
      diagnostics,
    );
  }

  const leftNodes = indexSourceNodes(leftAtom.children);
  const rightNodes = indexSourceNodes(rightAtom.children);
  const leftObjects = indexResolvedObjects(leftResolved.model.objects);
  const rightObjects = indexResolvedObjects(rightResolved.model.objects);
  if (
    leftNodes.size !== leftObjects.size ||
    rightNodes.size !== rightObjects.size
  ) {
    diagnostics.push({
      code: "VECTOR180-DIFF-IDENTITY",
      severity: "error",
      message:
        "C4 and C6 stable-ID inventories disagree; semantic comparison is ambiguous.",
    });
    return incomparable(
      leftIdentity,
      rightIdentity,
      lexical,
      metadata,
      diagnostics,
    );
  }

  const changes: Vector180SemanticChange[] = [];
  if (leftAtom.wireFamily !== rightAtom.wireFamily) {
    changes.push(
      rootChange(
        leftAtom,
        rightAtom,
        "/wireFamily",
        leftAtom.wireFamily,
        rightAtom.wireFamily,
      ),
    );
  }
  if (leftAtom.id !== rightAtom.id) {
    changes.push(
      rootChange(leftAtom, rightAtom, "/id", leftAtom.id, rightAtom.id),
    );
  }
  if (!sameJson(leftAtom.viewBox, rightAtom.viewBox)) {
    changes.push(
      rootChange(
        leftAtom,
        rightAtom,
        "/viewBox",
        [...leftAtom.viewBox],
        [...rightAtom.viewBox],
      ),
    );
  }

  const allIds = new Set([...leftNodes.keys(), ...rightNodes.keys()]);
  let unchangedObjects = 0;
  const changedObjectIds = new Set<string>();
  for (const id of allIds) {
    const leftNode = leftNodes.get(id);
    const rightNode = rightNodes.get(id);
    const leftObject = leftObjects.get(id);
    const rightObject = rightObjects.get(id);
    if (leftNode === undefined || leftObject === undefined) {
      if (rightNode !== undefined && rightObject !== undefined) {
        changes.push({
          id,
          kind: "added",
          fieldPath: "/objects",
          right: side(
            rightNode,
            completeSnapshot(rightNode.node, rightObject.object),
          ),
        });
        changedObjectIds.add(id);
      }
      continue;
    }
    if (rightNode === undefined || rightObject === undefined) {
      changes.push({
        id,
        kind: "removed",
        fieldPath: "/objects",
        left: side(
          leftNode,
          completeSnapshot(leftNode.node, leftObject.object),
        ),
      });
      changedObjectIds.add(id);
      continue;
    }

    const before = changes.length;
    compareField(
      changes,
      id,
      "parent",
      "/parentId",
      leftNode.parentId,
      rightNode.parentId,
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "order",
      "/order",
      leftNode.order,
      rightNode.order,
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "export-intent",
      "/exportIntent",
      exportSnapshot(leftNode.node),
      exportSnapshot(rightNode.node),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "relationship",
      "/relationship",
      relationshipSnapshot(leftObject.object),
      relationshipSnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "text",
      "/text",
      textSnapshot(leftObject.object),
      textSnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "geometry",
      "/geometry",
      geometrySnapshot(leftObject.object),
      geometrySnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "transform",
      "/transform",
      transformSnapshot(leftObject.object),
      transformSnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "frame",
      "/frame",
      frameSnapshot(leftObject.object),
      frameSnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    compareField(
      changes,
      id,
      "style",
      "/style",
      styleSnapshot(leftObject.object),
      styleSnapshot(rightObject.object),
      leftNode,
      rightNode,
    );
    if (changes.length === before) unchangedObjects += 1;
    else changedObjectIds.add(id);
  }

  for (const section of metadata.changedSections) {
    changes.push({
      id: leftAtom.id,
      kind: "metadata",
      fieldPath: `/metadata/${section}`,
      ...(leftAtom.metadata?.[section] === undefined
        ? {}
        : {
            left: rootSide(leftAtom, asJsonValue(leftAtom.metadata[section])),
          }),
      ...(rightAtom.metadata?.[section] === undefined
        ? {}
        : {
            right: rootSide(
              rightAtom,
              asJsonValue(rightAtom.metadata[section]),
            ),
          }),
    });
  }

  changes.sort((left, right) => {
    const leftTraversal = traversalForChange(left, leftNodes, rightNodes);
    const rightTraversal = traversalForChange(right, leftNodes, rightNodes);
    return (
      leftTraversal - rightTraversal ||
      left.id.localeCompare(right.id) ||
      CHANGE_ORDER[left.kind] - CHANGE_ORDER[right.kind] ||
      left.fieldPath.localeCompare(right.fieldPath)
    );
  });
  if (changes.length > MAX_CHANGES) {
    diagnostics.push({
      code: "VECTOR180-DIFF-LIMIT",
      severity: "error",
      message: `Semantic diff exceeds the ${MAX_CHANGES} change limit.`,
    });
    return incomparable(
      leftIdentity,
      rightIdentity,
      lexical,
      metadata,
      diagnostics,
    );
  }

  const semanticChanges = changes.filter(
    (change) =>
      change.kind !== "metadata" &&
      !(change.kind === "root" && change.fieldPath === "/wireFamily"),
  );
  const classification: Vector180DiffClassification = lexical.equal
    ? "exact"
    : semanticChanges.length === 0
      ? "semantic-equivalent"
      : "changed";
  const summary = summarize(changes, unchangedObjects, changedObjectIds.size);
  const report: Vector180SourceDiff = {
    schema: "vector180-source-diff/0.1",
    classification,
    left: leftIdentity,
    right: rightIdentity,
    lexical,
    metadata,
    summary,
    changes,
    diagnostics,
  };
  if (
    new TextEncoder().encode(canonicalJsonText(report)).byteLength >
    MAX_REPORT_BYTES
  ) {
    diagnostics.push({
      code: "VECTOR180-DIFF-LIMIT",
      severity: "error",
      message: `Semantic diff exceeds the ${MAX_REPORT_BYTES}-byte report limit.`,
    });
    return incomparable(
      leftIdentity,
      rightIdentity,
      lexical,
      metadata,
      diagnostics,
    );
  }
  return Object.freeze(report);
}

function sourceIdentity(atom: Vector180Atom): Vector180DiffSourceIdentity {
  return {
    family: atom.wireFamily,
    kind: "atom",
    profile: "0.1",
    id: atom.id,
    sha256: atom.source.sha256,
    byteLength: atom.source.byteLength,
    ...(atom.metadataSha256 === undefined
      ? {}
      : { metadataSha256: atom.metadataSha256 }),
  };
}

type DiffInputSide = "left" | "right";

interface PreparedDiffInput {
  readonly identity: Vector180DiffSourceIdentity;
  readonly atom?: Vector180Atom;
  readonly diagnostics: readonly Diagnostic[];
}

async function prepareDiffInput(
  input: Vector180Input,
  side: DiffInputSide,
): Promise<PreparedDiffInput> {
  const scan = await scanVector180Source(input);
  const identity = scanSourceIdentity(scan);
  if (
    scan.kind !== "svg" ||
    scan.wireFamily === undefined ||
    hasErrors(scan.diagnostics)
  ) {
    return {
      identity,
      diagnostics: invalidInputDiagnostics(side, scan),
    };
  }

  try {
    const atom = await loadAtom({
      kind: "bytes",
      bytes: scan.source.bytes,
      ...(scan.source.name === undefined ? {} : { name: scan.source.name }),
    });
    if (hasErrors(atom.diagnostics)) {
      return {
        identity,
        diagnostics: [
          invalidSideDiagnostic(side),
          ...reportDiagnostics(atom.diagnostics),
        ],
      };
    }
    return {
      identity: sourceIdentity(atom),
      atom,
      diagnostics: [],
    };
  } catch (error) {
    return {
      identity,
      diagnostics: [
        invalidSideDiagnostic(side),
        ...(error instanceof Vector180LoadError
          ? reportDiagnostics(error.diagnostics)
          : []),
      ],
    };
  }
}

function scanSourceIdentity(scan: Vector180Scan): Vector180DiffSourceIdentity {
  const family = scan.wireFamily ?? scan.source.wireFamily ?? "unknown";
  const kind =
    scan.kind === "svg" ? "atom" : scan.kind === "html" ? "deck" : "unknown";
  const candidateId =
    scan.kind === "svg"
      ? scan.sections.find((section) => section.kind === "slide")?.id
      : undefined;
  return {
    family,
    kind,
    ...(family !== "unknown" && scan.versionHint === "0.1"
      ? { profile: "0.1" as const }
      : {}),
    ...(candidateId !== undefined && STABLE_ID_PATTERN.test(candidateId)
      ? { id: candidateId }
      : {}),
    sha256: scan.source.sha256,
    byteLength: scan.source.byteLength,
  };
}

function invalidInputDiagnostics(
  side: DiffInputSide,
  scan: Vector180Scan,
): Diagnostic[] {
  return [
    invalidSideDiagnostic(side),
    ...(scan.kind === "svg"
      ? []
      : [
          {
            code: "VECTOR180-DIFF-KIND",
            severity: "error" as const,
            message: `The ${side} input is ${
              scan.kind === "html"
                ? "a deck"
                : scan.kind === "manifest"
                  ? "a manifest"
                  : "not a recognized atom"
            }; C12 comparison requires two standalone SVG atoms.`,
          },
        ]),
    ...reportDiagnostics(scan.diagnostics),
  ];
}

function invalidSideDiagnostic(side: DiffInputSide): Diagnostic {
  return {
    code:
      side === "left"
        ? "VECTOR180-DIFF-INVALID-LEFT"
        : "VECTOR180-DIFF-INVALID-RIGHT",
    severity: "error",
    message: `The ${side} input does not independently pass complete C4/C6 atom validation.`,
  };
}

function reportDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message.slice(0, 4096),
    ...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
  }));
}

function compareMetadata(
  left: Vector180Atom,
  right: Vector180Atom,
): Vector180MetadataDiff {
  const changedSections = (
    ["hydration", "templateLineage", "styleFamily"] as const
  ).filter(
    (section) => !sameJson(left.metadata?.[section], right.metadata?.[section]),
  );
  return {
    classification:
      left.metadata === undefined && right.metadata === undefined
        ? "absent"
        : changedSections.length === 0
          ? "equal"
          : "changed",
    ...(left.metadataSha256 === undefined
      ? {}
      : { leftSha256: left.metadataSha256 }),
    ...(right.metadataSha256 === undefined
      ? {}
      : { rightSha256: right.metadataSha256 }),
    changedSections,
  };
}

function indexSourceNodes(
  children: readonly Vector180Node[],
): Map<string, IndexedSourceNode> {
  const result = new Map<string, IndexedSourceNode>();
  let traversal = 1;
  const visit = (
    nodes: readonly Vector180Node[],
    parentId: string | null,
  ): void => {
    nodes.forEach((node, order) => {
      result.set(node.id, { node, parentId, order, traversal });
      traversal += 1;
      visit(node.children, node.id);
    });
  };
  visit(children, null);
  return result;
}

function indexResolvedObjects(
  objects: readonly Vector180ResolvedAtomObject[],
): Map<string, IndexedResolvedObject> {
  const result = new Map<string, IndexedResolvedObject>();
  let traversal = 1;
  const visit = (values: readonly Vector180ResolvedAtomObject[]): void => {
    for (const object of values) {
      result.set(object.id, { object, traversal });
      traversal += 1;
      if (object.kind === "group") visit(object.children);
    }
  };
  visit(objects);
  return result;
}

function compareField(
  changes: Vector180SemanticChange[],
  id: string,
  kind: Vector180ChangeKind,
  fieldPath: string,
  leftValue: JsonValue,
  rightValue: JsonValue,
  leftNode: IndexedSourceNode,
  rightNode: IndexedSourceNode,
): void {
  if (sameJson(leftValue, rightValue)) return;
  changes.push({
    id,
    kind,
    fieldPath,
    left: side(leftNode, leftValue),
    right: side(rightNode, rightValue),
  });
}

function side(
  indexed: IndexedSourceNode,
  snapshot: JsonValue,
): Vector180DiffSide {
  return {
    parentId: indexed.parentId,
    order: indexed.order,
    sourceRange: indexed.node.sourceRange,
    snapshot: normalizeJson(snapshot),
  };
}

function rootSide(atom: Vector180Atom, snapshot: JsonValue): Vector180DiffSide {
  return {
    sourceRange: atom.sourceRange,
    snapshot: normalizeJson(snapshot),
  };
}

function rootChange(
  left: Vector180Atom,
  right: Vector180Atom,
  fieldPath: string,
  leftValue: JsonValue,
  rightValue: JsonValue,
): Vector180SemanticChange {
  return {
    id: left.id,
    kind: "root",
    fieldPath,
    left: rootSide(left, leftValue),
    right: rootSide(right, rightValue),
  };
}

function exportSnapshot(node: Vector180Node): JsonValue {
  return {
    element: node.elementName,
    role: node.role,
    export: node.exportMode,
  };
}

function relationshipSnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  return object.kind === "line"
    ? {
        fromId: object.fromId ?? null,
        toId: object.toId ?? null,
      }
    : null;
}

function textSnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  return object.kind === "text"
    ? object.lines.map((line) => ({ text: line.text, x: line.x, y: line.y }))
    : null;
}

function geometrySnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  switch (object.kind) {
    case "rect":
      return {
        kind: object.kind,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        rx: object.rx ?? null,
        ry: object.ry ?? null,
      };
    case "ellipse":
      return {
        kind: object.kind,
        sourceElement: object.sourceElement,
        cx: object.cx,
        cy: object.cy,
        rx: object.rx,
        ry: object.ry,
      };
    case "line":
      return {
        kind: object.kind,
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
      };
    default:
      return {
        kind: object.kind,
        localBounds: {
          x: object.localBounds.x,
          y: object.localBounds.y,
          width: object.localBounds.width,
          height: object.localBounds.height,
        },
      };
  }
}

function transformSnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  return object.kind === "group"
    ? { x: object.translateX, y: object.translateY }
    : null;
}

function frameSnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  return object.kind === "text"
    ? {
        frame: {
          x: object.frame.x,
          y: object.frame.y,
          width: object.frame.width,
          height: object.frame.height,
        },
        lineStep: object.lineStep,
        anchor: object.anchor,
        wrap: object.wrap,
        autofit: object.autofit,
        margins: {
          left: object.margins.left,
          top: object.margins.top,
          right: object.margins.right,
          bottom: object.margins.bottom,
        },
      }
    : null;
}

function styleSnapshot(object: Vector180ResolvedAtomObject): JsonValue {
  return {
    fill: object.style.fill,
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    opacity: object.style.opacity,
    fontFamily: object.style.fontFamily ?? null,
    fontSize: object.style.fontSize ?? null,
    fontWeight: object.style.fontWeight,
    fontStyle: object.style.fontStyle,
    textAnchor: object.style.textAnchor,
  };
}

function completeSnapshot(
  node: Vector180Node,
  object: Vector180ResolvedAtomObject,
): JsonValue {
  return {
    exportIntent: exportSnapshot(node),
    relationship: relationshipSnapshot(object),
    text: textSnapshot(object),
    geometry: geometrySnapshot(object),
    transform: transformSnapshot(object),
    frame: frameSnapshot(object),
    style: styleSnapshot(object),
    ...(object.kind === "group"
      ? {
          children: object.children.map((child) =>
            completeSnapshot(
              node.children.find((candidate) => candidate.id === child.id) ??
                node,
              child,
            ),
          ),
        }
      : {}),
  };
}

function summarize(
  changes: readonly Vector180SemanticChange[],
  unchangedObjects: number,
  changedObjects: number,
): Vector180DiffSummary {
  const count = (kind: Vector180ChangeKind): number =>
    changes.filter((change) => change.kind === kind).length;
  return {
    unchangedObjects,
    changedObjects,
    added: count("added"),
    removed: count("removed"),
    root: count("root"),
    parent: count("parent"),
    order: count("order"),
    relationship: count("relationship"),
    text: count("text"),
    geometry: count("geometry"),
    transform: count("transform"),
    frame: count("frame"),
    style: count("style"),
    exportIntent: count("export-intent"),
    metadata: count("metadata"),
    total: changes.length,
  };
}

function traversalForChange(
  change: Vector180SemanticChange,
  left: ReadonlyMap<string, IndexedSourceNode>,
  right: ReadonlyMap<string, IndexedSourceNode>,
): number {
  if (change.kind === "root" || change.kind === "metadata") return 0;
  return left.get(change.id)?.traversal ?? right.get(change.id)?.traversal ?? 0;
}

function incomparable(
  left: Vector180DiffSourceIdentity,
  right: Vector180DiffSourceIdentity,
  lexical: { readonly equal: boolean },
  _metadata: Vector180MetadataDiff,
  diagnostics: readonly Diagnostic[],
): Vector180SourceDiff {
  return Object.freeze({
    schema: "vector180-source-diff/0.1",
    classification: "incomparable",
    left,
    right,
    lexical,
    metadata: {
      classification: "unknown",
      changedSections: [],
    } satisfies Vector180MetadataDiff,
    summary: {
      unchangedObjects: 0,
      changedObjects: 0,
      added: 0,
      removed: 0,
      root: 0,
      parent: 0,
      order: 0,
      relationship: 0,
      text: 0,
      geometry: 0,
      transform: 0,
      frame: 0,
      style: 0,
      exportIntent: 0,
      metadata: 0,
      total: 0,
    },
    changes: [],
    diagnostics: [...diagnostics],
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(canonicalJsonText(value)) as JsonValue;
}

function normalizeJson(value: JsonValue): JsonValue {
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalizeJson(child)]),
  );
}
