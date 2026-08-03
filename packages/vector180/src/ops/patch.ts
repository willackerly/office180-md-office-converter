/**
 * Hash-bound, all-or-nothing Vector180 source patching.
 *
 * CONTRACT:C5-PPTV-PATCH.2.0
 */

import { loadDeck, loadAtom, Vector180LoadError } from "../core/deck.js";
import { STABLE_ID_PATTERN } from "../core/manifest.js";
import {
  resolveVector180Deck,
  resolveVector180Atom,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedObject,
} from "../core/resolved.js";
import { hasErrors } from "../core/source.js";
import type {
  AppliedSourceEdit,
  CloneConnectorOperation,
  DeleteObjectOperation,
  Diagnostic,
  PatchResult,
  Vector180ConcreteNativeStyle,
  Vector180ConnectorCloneState,
  Vector180ConnectorEndpoints,
  Vector180Deck,
  Vector180Document,
  Vector180EllipseGeometry,
  Vector180Node,
  Vector180ObjectGeometry,
  Vector180Patch,
  Vector180PatchOperation,
  Vector180PatchBounds,
  Vector180PatchPoint,
  Vector180RectGeometry,
  SetChildOrderOperation,
  SetConnectorEndpointsOperation,
  SetActiveThemeOperation,
  SetGroupTranslationOperation,
  SetNativeStyleOperation,
  SetObjectGeometryOperation,
  SetSlideOrderOperation,
  SetTextFrameOperation,
  SetTextOperation,
  SourceRange,
} from "../core/types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_XML_TEXT =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u;

interface PatchPlan {
  patch?: Vector180Patch;
  edits: AppliedSourceEdit[];
  affectedIds: string[];
  diagnostics: Diagnostic[];
}

type ResolvedObject = Vector180ResolvedObject | Vector180ResolvedAtomObject;

interface ResolvedPatchState {
  objects: ReadonlyMap<string, ResolvedObject>;
  roots: ReadonlyMap<string, readonly ResolvedObject[]>;
}

export async function validatePatch(
  document: Vector180Document,
  input: unknown,
): Promise<Diagnostic[]> {
  const trusted = await reloadPatchBase(document);
  return trusted.document === undefined
    ? trusted.diagnostics
    : [
        ...trusted.diagnostics,
        ...planPatch(trusted.document, input).diagnostics,
      ];
}

export async function applyPatch(
  document: Vector180Document,
  input: unknown,
): Promise<PatchResult> {
  const trusted = await reloadPatchBase(document);
  if (trusted.document === undefined) {
    return {
      applied: false,
      originalSha256: document.source.sha256,
      affectedIds: [],
      edits: [],
      diagnostics: trusted.diagnostics,
    };
  }
  const trustedDocument = trusted.document;
  const plan = planPatch(trustedDocument, input);
  plan.diagnostics.unshift(...trusted.diagnostics);
  if (plan.patch === undefined || hasErrors(plan.diagnostics)) {
    return {
      applied: false,
      originalSha256: trustedDocument.source.sha256,
      affectedIds: [],
      edits: [],
      diagnostics: plan.diagnostics,
    };
  }

  const edits = [...plan.edits].sort(
    (left, right) => right.range.charStart - left.range.charStart,
  );
  let candidateSource = trustedDocument.source.text;
  for (const edit of edits) {
    candidateSource =
      candidateSource.slice(0, edit.range.charStart) +
      edit.replacement +
      candidateSource.slice(edit.range.charEnd);
  }

  try {
    const candidateDocument = await reloadCandidate(
      trustedDocument,
      candidateSource,
    );
    const candidateResolution = resolvePatchState(candidateDocument);
    const profileDiagnostics = candidateResolution.diagnostics;
    const cloneOperation = plan.patch.ops.find(
      (operation): operation is CloneConnectorOperation =>
        operation.op === "clone-connector",
    );
    const cloneDiagnostics =
      cloneOperation !== undefined && candidateResolution.state !== undefined
        ? validateCloneCandidate(
            candidateDocument,
            candidateResolution.state,
            cloneOperation,
          )
        : [];
    const resultErrors = [
      ...candidateDocument.diagnostics,
      ...profileDiagnostics,
      ...cloneDiagnostics,
    ].filter(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    );
    if (resultErrors.length > 0) {
      return failedResult(
        trustedDocument,
        plan,
        "Candidate source failed Vector180 validation; the transaction was not committed.",
        resultErrors,
      );
    }

    return {
      applied: true,
      originalSha256: trustedDocument.source.sha256,
      sourceText: candidateSource,
      sourceSha256: candidateDocument.source.sha256,
      ...(candidateDocument.sourceKind === "html"
        ? { deck: candidateDocument }
        : { atom: candidateDocument }),
      affectedIds: plan.affectedIds,
      edits: plan.edits,
      diagnostics: candidateDocument.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === "info" || diagnostic.severity === "warning",
      ),
    };
  } catch (error) {
    const related =
      error instanceof Vector180LoadError ? error.diagnostics : [];
    return failedResult(
      trustedDocument,
      plan,
      "Candidate source could not be reloaded; the transaction was not committed.",
      related,
    );
  }
}

function planPatch(document: Vector180Document, input: unknown): PatchPlan {
  const decoded = decodePatch(input);
  const diagnostics = [...decoded.diagnostics];
  const edits: AppliedSourceEdit[] = [];
  const affectedIds: string[] = [];
  const patch = decoded.patch;
  let resolvedState: ResolvedPatchState | undefined;

  if (hasErrors(document.diagnostics)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-INVALID-BASE",
      severity: "error",
      message: "Patches require a source snapshot with no validation errors.",
    });
  }
  if (document.wireFamily !== "vector180") {
    diagnostics.push({
      code: "VECTOR180-LEGACY-WRITE-REQUIRES-MIGRATION",
      severity: "error",
      message:
        "Canonical patching accepts Vector180 source only; migrate a legacy PPTV atom first.",
    });
  }
  if (document.sourceKind === "html" && !document.materialization.complete) {
    diagnostics.push({
      code: "VECTOR180-PATCH-INCOMPLETE-SNAPSHOT",
      severity: "error",
      message: "Patches require a fully materialized deck snapshot.",
    });
  }
  if (patch === undefined) return { edits, affectedIds, diagnostics };
  if (patch.baseSha256 !== document.source.sha256) {
    diagnostics.push({
      code: "VECTOR180-PATCH-STALE",
      severity: "error",
      message: `Patch base ${patch.baseSha256} does not match source ${document.source.sha256}.`,
    });
  }

  const resolution = resolvePatchState(document);
  resolvedState = resolution.state;
  if (resolvedState === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-INVALID-BASE",
      severity: "error",
      message: `${patch.schema} requires a source snapshot that resolves completely through C6.`,
      related: resolution.diagnostics.map((diagnostic) => ({
        message: `${diagnostic.code}: ${diagnostic.message}`,
        ...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
      })),
    });
  }

  const deletingIds = collectDeletionIds(document, patch.ops);

  for (const [operationIndex, operation] of patch.ops.entries()) {
    if (operation.op === "set-text") {
      planSetText(
        document,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    } else if (operation.op === "set-active-theme") {
      if (document.sourceKind === "svg") {
        diagnostics.push(
          unsupportedAtomOperation(operationIndex, operation.op),
        );
        continue;
      }
      planSetActiveTheme(
        document,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    } else if (operation.op === "set-slide-order") {
      if (document.sourceKind === "svg") {
        diagnostics.push(
          unsupportedAtomOperation(operationIndex, operation.op),
        );
        continue;
      }
      planSetSlideOrder(
        document,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    } else if (resolvedState !== undefined) {
      if (operation.op === "set-object-geometry") {
        planSetObjectGeometry(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "set-connector-endpoints") {
        planSetConnectorEndpoints(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "set-group-translation") {
        planSetGroupTranslation(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "set-text-frame") {
        planSetTextFrame(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "set-child-order") {
        planSetChildOrder(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "delete-object") {
        planDeleteObject(
          document,
          resolvedState,
          deletingIds,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else if (operation.op === "set-native-style") {
        planSetNativeStyle(
          document,
          resolvedState,
          operation,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      } else {
        planCloneConnector(
          document,
          resolvedState,
          operation,
          patch.ops,
          operationIndex,
          edits,
          affectedIds,
          diagnostics,
        );
      }
    }
  }

  const sorted = [...edits].sort(
    (left, right) => left.range.charStart - right.range.charStart,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      (current.range.charStart < previous.range.charEnd ||
        (current.range.charStart === previous.range.charStart &&
          (current.range.charStart === current.range.charEnd ||
            previous.range.charStart === previous.range.charEnd)))
    ) {
      diagnostics.push({
        code: "VECTOR180-PATCH-OVERLAP",
        severity: "error",
        message: `Operations ${previous.operationIndex} and ${current.operationIndex} replace intersecting source ranges.`,
        range: current.range,
        related: [
          { message: "Intersecting edit is here.", range: previous.range },
        ],
      });
    }
  }

  return { patch, edits, affectedIds: [...new Set(affectedIds)], diagnostics };
}

async function reloadPatchBase(document: Vector180Document): Promise<{
  document?: Vector180Document;
  diagnostics: Diagnostic[];
}> {
  try {
    const reloaded = await reloadCandidate(document, document.source.text);
    if (reloaded.source.sha256 !== document.source.sha256) {
      return {
        diagnostics: [
          {
            code: "VECTOR180-PATCH-INVALID-BASE",
            severity: "error",
            message:
              "The supplied document snapshot hash does not match its retained source text.",
          },
        ],
      };
    }
    return { document: reloaded, diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "VECTOR180-PATCH-INVALID-BASE",
          severity: "error",
          message:
            "The supplied document source could not be reconstructed as a trusted patch snapshot.",
          ...(error instanceof Vector180LoadError &&
          error.diagnostics.length > 0
            ? {
                related: error.diagnostics.map((diagnostic) => ({
                  message: `${diagnostic.code}: ${diagnostic.message}`,
                  ...(diagnostic.range === undefined
                    ? {}
                    : { range: diagnostic.range }),
                })),
              }
            : {}),
        },
      ],
    };
  }
}

function reloadCandidate(
  source: Vector180Document,
  text: string,
): Promise<Vector180Document> {
  const input = {
    kind: "text" as const,
    text,
    ...(source.source.name === undefined ? {} : { name: source.source.name }),
  };
  return source.sourceKind === "html" ? loadDeck(input) : loadAtom(input);
}

function planSetText(
  document: Vector180Document,
  operation: SetTextOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const indexed = document.index.objects.get(operation.id);
  const node = findObject(document, operation.id);
  if (indexed === undefined || node === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (node.role !== "text") {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Object "${operation.id}" is not text.`),
    );
    return;
  }
  if (node.exportMode !== "native" || node.opaque) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Object "${operation.id}" is an opaque asset boundary; text inside it is not semantically editable.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  if (operation.oldText !== node.text) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} expected text ${JSON.stringify(operation.oldText)}, found ${JSON.stringify(node.text ?? "")}.`,
      objectId: operation.id,
    });
    return;
  }
  if (indexed.directTextRange === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Object "${operation.id}" has nested or mixed text; Vector180 0.1 can only replace direct text.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  if (FORBIDDEN_XML_TEXT.test(operation.value)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-INVALID-TEXT",
      severity: "error",
      message: `Object "${operation.id}" replacement contains a forbidden XML character.`,
      objectId: operation.id,
    });
    return;
  }

  edits.push({
    range: indexed.directTextRange,
    replacement: escapeXmlText(operation.value),
    operationIndex,
  });
  affectedIds.push(operation.id);
}

function planSetActiveTheme(
  deck: Vector180Deck,
  operation: SetActiveThemeOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  if (!deck.themes.has(operation.theme)) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown theme "${operation.theme}".`),
    );
    return;
  }
  if (operation.oldTheme !== deck.activeTheme) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} expected active theme "${operation.oldTheme}", found "${deck.activeTheme ?? "(none)"}".`,
    });
    return;
  }
  const range = deck.index.manifestFields.get("theme");
  if (range === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message:
        "The manifest has no existing theme value to replace surgically.",
    });
    return;
  }

  edits.push({
    range,
    replacement: JSON.stringify(operation.theme),
    operationIndex,
  });
  affectedIds.push(operation.theme);
}

function planSetSlideOrder(
  deck: Vector180Deck,
  operation: SetSlideOrderOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  if (!sameArray(operation.oldOrder, deck.slideOrder)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} slide-order precondition does not match the manifest.`,
    });
    return;
  }
  if (!isPermutation(operation.order, deck.slideOrder)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} set-slide-order must be a permutation of the current slide IDs.`,
    });
    return;
  }

  for (let index = 0; index < deck.slideOrder.length; index += 1) {
    const currentId = deck.slideOrder[index];
    const desiredId = operation.order[index];
    if (
      currentId === undefined ||
      desiredId === undefined ||
      currentId === desiredId
    )
      continue;
    const slotRange = deck.index.manifestSlideEntries.get(currentId);
    const desiredRange = deck.index.manifestSlideEntries.get(desiredId);
    if (slotRange === undefined || desiredRange === undefined) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Cannot locate manifest entry ranges for slide reorder operation ${operationIndex}.`,
      });
      return;
    }
    edits.push({
      range: slotRange,
      replacement: deck.source.text.slice(
        desiredRange.charStart,
        desiredRange.charEnd,
      ),
      operationIndex,
    });
  }
  affectedIds.push(...operation.order);
}

function resolvePatchState(document: Vector180Document): {
  state?: ResolvedPatchState;
  diagnostics: readonly Diagnostic[];
} {
  const result =
    document.sourceKind === "html"
      ? resolveVector180Deck(document)
      : resolveVector180Atom(document);
  if (result.model === undefined) return { diagnostics: result.diagnostics };

  const objects = new Map<string, ResolvedObject>();
  const roots = new Map<string, readonly ResolvedObject[]>();
  if (result.model.schema === "vector180-resolved-deck/0.1") {
    for (const slide of result.model.slides) {
      roots.set(slide.id, slide.objects);
      indexResolvedObjects(slide.objects, objects);
    }
  } else {
    roots.set(result.model.atomId, result.model.objects);
    indexResolvedObjects(result.model.objects, objects);
  }
  return { state: { objects, roots }, diagnostics: result.diagnostics };
}

function indexResolvedObjects(
  values: readonly ResolvedObject[],
  target: Map<string, ResolvedObject>,
): void {
  for (const value of values) {
    target.set(value.id, value);
    if (value.kind === "group") {
      indexResolvedObjects(value.children, target);
    }
  }
}

function planSetObjectGeometry(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetObjectGeometryOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  if (object === undefined || indexed === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (
    operation.oldGeometry.kind !== operation.geometry.kind ||
    object.kind !== operation.geometry.kind
  ) {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Object "${operation.id}" does not match ${operation.geometry.kind} geometry.`,
      ),
    );
    return;
  }

  if (
    object.kind === "rect" &&
    operation.geometry.kind === "rect" &&
    operation.oldGeometry.kind === "rect"
  ) {
    const current: Vector180RectGeometry = {
      kind: "rect",
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    };
    if (!sameRectGeometry(current, operation.oldGeometry)) {
      diagnostics.push(
        preconditionDiagnostic(operationIndex, operation.id, "rect geometry"),
      );
      return;
    }
    planChangedAttributes(
      document,
      indexed.attributeRanges,
      [
        ["x", current.x, operation.geometry.x],
        ["y", current.y, operation.geometry.y],
        ["width", current.width, operation.geometry.width],
        ["height", current.height, operation.geometry.height],
      ],
      operationIndex,
      operation.id,
      edits,
      affectedIds,
      diagnostics,
    );
    return;
  }

  if (
    object.kind === "ellipse" &&
    operation.geometry.kind === "ellipse" &&
    operation.oldGeometry.kind === "ellipse"
  ) {
    if (object.sourceElement !== "ellipse") {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Object "${operation.id}" is represented by <circle>; set-object-geometry does not change shape representation.`,
        objectId: operation.id,
        range: indexed.elementRange,
      });
      return;
    }
    const current: Vector180EllipseGeometry = {
      kind: "ellipse",
      cx: object.cx,
      cy: object.cy,
      rx: object.rx,
      ry: object.ry,
    };
    if (!sameEllipseGeometry(current, operation.oldGeometry)) {
      diagnostics.push(
        preconditionDiagnostic(
          operationIndex,
          operation.id,
          "ellipse geometry",
        ),
      );
      return;
    }
    planChangedAttributes(
      document,
      indexed.attributeRanges,
      [
        ["cx", current.cx, operation.geometry.cx],
        ["cy", current.cy, operation.geometry.cy],
        ["rx", current.rx, operation.geometry.rx],
        ["ry", current.ry, operation.geometry.ry],
      ],
      operationIndex,
      operation.id,
      edits,
      affectedIds,
      diagnostics,
    );
    return;
  }

  diagnostics.push(
    targetDiagnostic(
      operationIndex,
      `Object "${operation.id}" is not a supported rect or ellipse target.`,
    ),
  );
}

function planSetConnectorEndpoints(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetConnectorEndpointsOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  if (object === undefined || indexed === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (object.kind !== "line") {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Object "${operation.id}" is not a native connector.`,
      ),
    );
    return;
  }
  const current: Vector180ConnectorEndpoints = {
    x1: object.x1,
    y1: object.y1,
    x2: object.x2,
    y2: object.y2,
  };
  if (!sameEndpoints(current, operation.oldEndpoints)) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.id,
        "connector endpoints",
      ),
    );
    return;
  }
  planChangedAttributes(
    document,
    indexed.attributeRanges,
    [
      ["x1", current.x1, operation.endpoints.x1],
      ["y1", current.y1, operation.endpoints.y1],
      ["x2", current.x2, operation.endpoints.x2],
      ["y2", current.y2, operation.endpoints.y2],
    ],
    operationIndex,
    operation.id,
    edits,
    affectedIds,
    diagnostics,
  );
}

function planCloneConnector(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: CloneConnectorOperation,
  operations: readonly Vector180PatchOperation[],
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.templateId);
  const indexed = document.index.objects.get(operation.templateId);
  const node = findObject(document, operation.templateId);
  if (object === undefined || indexed === undefined || node === undefined) {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Unknown connector template "${operation.templateId}".`,
      ),
    );
    return;
  }
  if (
    object.kind !== "line" ||
    node.elementName !== "line" ||
    node.role !== "connector" ||
    node.exportMode !== "native" ||
    node.opaque ||
    node.children.length !== 0
  ) {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Object "${operation.templateId}" is not a native, non-opaque <line> connector template.`,
      ),
    );
    return;
  }
  for (const attribute of [
    "id",
    "data-vector180-role",
    "data-vector180-export",
    "data-vector180-from",
    "data-vector180-to",
    "x1",
    "y1",
    "x2",
    "y2",
  ]) {
    if (!indexed.attributeRanges.has(attribute)) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Connector template "${operation.templateId}" has no existing literal "${attribute}" attribute to clone safely.`,
        objectId: operation.templateId,
        range: indexed.elementRange,
      });
      return;
    }
  }
  if (
    object.fromId !== operation.oldConnector.fromId ||
    object.toId !== operation.oldConnector.toId ||
    !sameEndpoints(
      {
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
      },
      operation.oldConnector.endpoints,
    ) ||
    !sameStyle(object.style, operation.oldConnector.style)
  ) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.templateId,
        "connector template",
      ),
    );
    return;
  }
  if (
    document.index.objects.has(operation.newId) ||
    isRootId(document, operation.newId)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} new connector ID "${operation.newId}" is already in use.`,
      objectId: operation.newId,
    });
    return;
  }

  const fromTarget = state.objects.get(operation.connector.fromId);
  const toTarget = state.objects.get(operation.connector.toId);
  if (
    fromTarget === undefined ||
    toTarget === undefined ||
    resolvedScopeId(fromTarget) !== resolvedScopeId(object) ||
    resolvedScopeId(toTarget) !== resolvedScopeId(object)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-REFERENCE",
      severity: "error",
      message: `Operation ${operationIndex} clone-connector requires existing from/to targets in the template connector's slide or diagram.`,
      objectId: operation.newId,
    });
    return;
  }

  const resolvedChildren =
    state.roots.get(operation.parentId) ??
    getResolvedGroupChildren(state, operation.parentId);
  const sourceChildren = getSourceContainerChildren(
    document,
    operation.parentId,
  );
  if (resolvedChildren === undefined || sourceChildren === undefined) {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Unknown diagram, slide, or native group "${operation.parentId}".`,
      ),
    );
    return;
  }
  const resolvedOrder = resolvedChildren.map((child) => child.id);
  const sourceOrder = sourceChildren.map((child) => child.id);
  if (!sameArray(sourceOrder, resolvedOrder)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Container "${operation.parentId}" has ignored or mixed direct children and cannot accept a surgical connector clone.`,
    });
    return;
  }
  if (
    !sourceOrder.includes(operation.templateId) ||
    !sameArray(operation.oldOrder, sourceOrder)
  ) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.parentId,
        "direct child order",
      ),
    );
    return;
  }
  if (
    operation.order.length !== operation.oldOrder.length + 1 ||
    operation.oldOrder.includes(operation.newId) ||
    operation.order.filter((id) => id === operation.newId).length !== 1 ||
    !sameArray(
      operation.order.filter((id) => id !== operation.newId),
      operation.oldOrder,
    )
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} clone-connector order must insert only "${operation.newId}" while preserving every existing sibling's relative order.`,
      objectId: operation.newId,
    });
    return;
  }

  if (
    reportCloneConflicts(
      document,
      operation,
      operations,
      operationIndex,
      sourceChildren,
      diagnostics,
    )
  ) {
    return;
  }

  if (
    (object.style.fontFamily === undefined) !==
      (operation.connector.style.fontFamily === undefined) ||
    (object.style.fontSize === undefined) !==
      (operation.connector.style.fontSize === undefined)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Connector clone ${operationIndex} cannot add or remove optional font properties.`,
      objectId: operation.templateId,
    });
    return;
  }

  const cloneAttributeEdits: AppliedSourceEdit[] = [];
  const addCloneAttributeEdit = (
    attribute: string,
    value: string | number,
  ): boolean => {
    const range = indexed.attributeRanges.get(attribute);
    if (range === undefined) return false;
    const edit = replaceAttributeValue(
      document,
      range,
      attribute,
      typeof value === "number" ? formatNumber(value) : value,
      operationIndex,
      operation.templateId,
      diagnostics,
    );
    if (edit === undefined) return false;
    cloneAttributeEdits.push(edit);
    return true;
  };
  if (!addCloneAttributeEdit("id", operation.newId)) return;
  const connectorAttributes: ReadonlyArray<
    readonly [string, string | number, string | number]
  > = [
    [
      "data-vector180-from",
      operation.oldConnector.fromId,
      operation.connector.fromId,
    ],
    [
      "data-vector180-to",
      operation.oldConnector.toId,
      operation.connector.toId,
    ],
    [
      "x1",
      operation.oldConnector.endpoints.x1,
      operation.connector.endpoints.x1,
    ],
    [
      "y1",
      operation.oldConnector.endpoints.y1,
      operation.connector.endpoints.y1,
    ],
    [
      "x2",
      operation.oldConnector.endpoints.x2,
      operation.connector.endpoints.x2,
    ],
    [
      "y2",
      operation.oldConnector.endpoints.y2,
      operation.connector.endpoints.y2,
    ],
  ];
  for (const [attribute, current, next] of connectorAttributes) {
    if (current !== next && !addCloneAttributeEdit(attribute, next)) return;
  }

  const styleProperties: Array<{
    key: keyof Vector180ConcreteNativeStyle;
    attribute: string;
    current: string | number | undefined;
    next: string | number | undefined;
  }> = [
    {
      key: "fill",
      attribute: "fill",
      current: object.style.fill,
      next: operation.connector.style.fill,
    },
    {
      key: "stroke",
      attribute: "stroke",
      current: object.style.stroke,
      next: operation.connector.style.stroke,
    },
    {
      key: "strokeWidth",
      attribute: "stroke-width",
      current: object.style.strokeWidth,
      next: operation.connector.style.strokeWidth,
    },
    {
      key: "opacity",
      attribute: "opacity",
      current: object.style.opacity,
      next: operation.connector.style.opacity,
    },
    {
      key: "fontFamily",
      attribute: "font-family",
      current: object.style.fontFamily,
      next: operation.connector.style.fontFamily,
    },
    {
      key: "fontSize",
      attribute: "font-size",
      current: object.style.fontSize,
      next: operation.connector.style.fontSize,
    },
    {
      key: "fontWeight",
      attribute: "font-weight",
      current: object.style.fontWeight,
      next: operation.connector.style.fontWeight,
    },
    {
      key: "fontStyle",
      attribute: "font-style",
      current: object.style.fontStyle,
      next: operation.connector.style.fontStyle,
    },
    {
      key: "textAnchor",
      attribute: "text-anchor",
      current: object.style.textAnchor,
      next: operation.connector.style.textAnchor,
    },
  ];
  for (const property of styleProperties) {
    if (property.current === property.next) continue;
    const provenance = object.styleProvenance[property.key];
    if (
      property.next === undefined ||
      provenance === undefined ||
      provenance.origin !== "presentation-attribute" ||
      !indexed.attributeRanges.has(property.attribute)
    ) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Style property "${property.key}" on connector template "${operation.templateId}" cannot be materialized into the clone from one direct presentation attribute.`,
        objectId: operation.templateId,
        range: indexed.elementRange,
      });
      return;
    }
    if (!addCloneAttributeEdit(property.attribute, property.next)) return;
  }

  const cloneBytes = applySliceEdits(
    document.source.text,
    indexed.elementRange,
    cloneAttributeEdits,
  );
  if (cloneBytes === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Connector template "${operation.templateId}" attribute ranges do not fit its exact element range.`,
      objectId: operation.templateId,
      range: indexed.elementRange,
    });
    return;
  }
  const insertion = planCloneInsertion(
    document,
    operation,
    sourceChildren,
    cloneBytes,
    operationIndex,
    diagnostics,
  );
  if (insertion === undefined) return;
  edits.push(insertion);
  affectedIds.push(
    operation.parentId,
    operation.templateId,
    operation.newId,
    operation.connector.fromId,
    operation.connector.toId,
  );
}

function resolvedScopeId(object: ResolvedObject): string {
  return "slideId" in object ? object.slideId : object.atomId;
}

function planSetGroupTranslation(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetGroupTranslationOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  if (object === undefined || indexed === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (object.kind !== "group") {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Object "${operation.id}" is not a native group.`,
      ),
    );
    return;
  }
  const current = { x: object.translateX, y: object.translateY };
  if (!samePoint(current, operation.oldTranslation)) {
    diagnostics.push(
      preconditionDiagnostic(operationIndex, operation.id, "group translation"),
    );
    return;
  }
  const range = indexed.attributeRanges.get("transform");
  if (range === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Group "${operation.id}" has an implicit translation; the typed patch does not synthesize transform attributes.`,
      objectId: operation.id,
      range: indexed.openTagRange,
    });
    return;
  }
  if (samePoint(current, operation.translation)) {
    affectedIds.push(operation.id);
    return;
  }
  const edit = replaceAttributeValue(
    document,
    range,
    "transform",
    `translate(${formatNumber(operation.translation.x)} ${formatNumber(operation.translation.y)})`,
    operationIndex,
    operation.id,
    diagnostics,
  );
  if (edit !== undefined) {
    edits.push(edit);
    affectedIds.push(operation.id);
  }
}

function planSetTextFrame(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetTextFrameOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  const node = findObject(document, operation.id);
  if (object === undefined || indexed === undefined || node === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (object.kind !== "text") {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Object "${operation.id}" is not native text.`,
      ),
    );
    return;
  }
  if (
    object.lines.length !== 1 ||
    indexed.directTextRange === undefined ||
    node.children.length !== 0
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Text "${operation.id}" is nested or mixed; frame edits require exactly one direct hard line.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  const line = object.lines[0];
  if (
    line === undefined ||
    !sameBounds(object.frame, operation.oldFrame) ||
    !samePoint(line, operation.oldLineAnchor)
  ) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.id,
        "text frame or line anchor",
      ),
    );
    return;
  }
  planChangedAttributes(
    document,
    indexed.attributeRanges,
    [
      [
        "data-vector180-frame",
        formatBounds(object.frame),
        formatBounds(operation.frame),
      ],
      ["x", line.x, operation.lineAnchor.x],
      ["y", line.y, operation.lineAnchor.y],
    ],
    operationIndex,
    operation.id,
    edits,
    affectedIds,
    diagnostics,
  );
}

function planSetChildOrder(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetChildOrderOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const resolvedChildren =
    state.roots.get(operation.parentId) ??
    getResolvedGroupChildren(state, operation.parentId);
  const sourceChildren = getSourceContainerChildren(
    document,
    operation.parentId,
  );
  if (resolvedChildren === undefined || sourceChildren === undefined) {
    diagnostics.push(
      targetDiagnostic(
        operationIndex,
        `Unknown diagram, slide, or native group "${operation.parentId}".`,
      ),
    );
    return;
  }
  const currentOrder = resolvedChildren.map((child) => child.id);
  const sourceOrder = sourceChildren.map((child) => child.id);
  if (!sameArray(sourceOrder, currentOrder)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Container "${operation.parentId}" has ignored or mixed direct children and cannot be reordered surgically.`,
    });
    return;
  }
  if (!sameArray(operation.oldOrder, currentOrder)) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.parentId,
        "direct child order",
      ),
    );
    return;
  }
  if (!isPermutation(operation.order, currentOrder)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} set-child-order must be a permutation of the current direct child IDs.`,
    });
    return;
  }

  const localEdits: AppliedSourceEdit[] = [];
  for (let index = 0; index < currentOrder.length; index += 1) {
    const currentId = currentOrder[index];
    const desiredId = operation.order[index];
    if (
      currentId === undefined ||
      desiredId === undefined ||
      currentId === desiredId
    ) {
      continue;
    }
    const currentRange = document.index.objects.get(currentId)?.elementRange;
    const desiredRange = document.index.objects.get(desiredId)?.elementRange;
    if (currentRange === undefined || desiredRange === undefined) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Cannot locate exact child element ranges for container "${operation.parentId}".`,
      });
      return;
    }
    localEdits.push({
      range: currentRange,
      replacement: document.source.text.slice(
        desiredRange.charStart,
        desiredRange.charEnd,
      ),
      operationIndex,
    });
  }
  edits.push(...localEdits);
  affectedIds.push(operation.parentId, ...operation.order);
}

function planDeleteObject(
  document: Vector180Document,
  state: ResolvedPatchState,
  deletingIds: ReadonlySet<string>,
  operation: DeleteObjectOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  if (isRootId(document, operation.id)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSUPPORTED",
      severity: "error",
      message: `Operation ${operationIndex} cannot delete diagram or slide root "${operation.id}".`,
    });
    return;
  }
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  const node = findObject(document, operation.id);
  if (object === undefined || indexed === undefined || node === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (node.exportMode !== "native" || node.opaque) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Object "${operation.id}" is opaque or non-native and cannot be deleted through the typed operation.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  if (
    operation.oldParentId !== object.parentId ||
    operation.oldOrder !== object.order
  ) {
    diagnostics.push(
      preconditionDiagnostic(
        operationIndex,
        operation.id,
        "parent or child order",
      ),
    );
    return;
  }
  const subtreeIds = collectNodeIds(node);
  const hazard = findConnectorReferenceHazard(
    document,
    new Set(subtreeIds),
    deletingIds,
  );
  if (hazard !== undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-REFERENCE",
      severity: "error",
      message: `Connector "${hazard.id}" survives this transaction and refers to the deletion subtree rooted at "${operation.id}".`,
      objectId: operation.id,
      range: indexed.elementRange,
      related: [
        {
          message: "Surviving connector is here.",
          range: hazard.sourceRange,
        },
      ],
    });
    return;
  }
  edits.push({
    range: indexed.elementRange,
    replacement: "",
    operationIndex,
  });
  affectedIds.push(...subtreeIds);
}

function planSetNativeStyle(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: SetNativeStyleOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const object = state.objects.get(operation.id);
  const indexed = document.index.objects.get(operation.id);
  if (object === undefined || indexed === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (!sameStyle(object.style, operation.oldStyle)) {
    diagnostics.push(
      preconditionDiagnostic(operationIndex, operation.id, "native style"),
    );
    return;
  }
  if (
    (object.style.fontFamily === undefined) !==
      (operation.style.fontFamily === undefined) ||
    (object.style.fontSize === undefined) !==
      (operation.style.fontSize === undefined)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Style operation ${operationIndex} cannot add or remove optional font properties.`,
      objectId: operation.id,
    });
    return;
  }

  const properties: Array<{
    key: keyof Vector180ConcreteNativeStyle;
    attribute: string;
    current: string | number | undefined;
    next: string | number | undefined;
  }> = [
    {
      key: "fill",
      attribute: "fill",
      current: object.style.fill,
      next: operation.style.fill,
    },
    {
      key: "stroke",
      attribute: "stroke",
      current: object.style.stroke,
      next: operation.style.stroke,
    },
    {
      key: "strokeWidth",
      attribute: "stroke-width",
      current: object.style.strokeWidth,
      next: operation.style.strokeWidth,
    },
    {
      key: "opacity",
      attribute: "opacity",
      current: object.style.opacity,
      next: operation.style.opacity,
    },
    {
      key: "fontFamily",
      attribute: "font-family",
      current: object.style.fontFamily,
      next: operation.style.fontFamily,
    },
    {
      key: "fontSize",
      attribute: "font-size",
      current: object.style.fontSize,
      next: operation.style.fontSize,
    },
    {
      key: "fontWeight",
      attribute: "font-weight",
      current: object.style.fontWeight,
      next: operation.style.fontWeight,
    },
    {
      key: "fontStyle",
      attribute: "font-style",
      current: object.style.fontStyle,
      next: operation.style.fontStyle,
    },
    {
      key: "textAnchor",
      attribute: "text-anchor",
      current: object.style.textAnchor,
      next: operation.style.textAnchor,
    },
  ];
  const localEdits: AppliedSourceEdit[] = [];
  for (const property of properties) {
    if (property.current === property.next) continue;
    const provenance = object.styleProvenance[property.key];
    const range = indexed.attributeRanges.get(property.attribute);
    if (
      property.next === undefined ||
      provenance === undefined ||
      provenance.origin !== "presentation-attribute" ||
      range === undefined
    ) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Style property "${property.key}" on "${operation.id}" is absent, inherited, inline, or otherwise not represented by one direct presentation attribute.`,
        objectId: operation.id,
        range: indexed.elementRange,
      });
      return;
    }
    const edit = replaceAttributeValue(
      document,
      range,
      property.attribute,
      typeof property.next === "number"
        ? formatNumber(property.next)
        : property.next,
      operationIndex,
      operation.id,
      diagnostics,
    );
    if (edit === undefined) return;
    localEdits.push(edit);
  }
  edits.push(...localEdits);
  affectedIds.push(operation.id);
}

function planChangedAttributes(
  document: Vector180Document,
  ranges: ReadonlyMap<string, SourceRange>,
  changes: ReadonlyArray<
    readonly [name: string, current: string | number, next: string | number]
  >,
  operationIndex: number,
  objectId: string,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const localEdits: AppliedSourceEdit[] = [];
  for (const [name, current, next] of changes) {
    if (current === next) continue;
    const range = ranges.get(name);
    if (range === undefined) {
      diagnostics.push({
        code: "VECTOR180-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Object "${objectId}" has no existing "${name}" attribute value to replace.`,
        objectId,
      });
      return;
    }
    const edit = replaceAttributeValue(
      document,
      range,
      name,
      typeof next === "number" ? formatNumber(next) : next,
      operationIndex,
      objectId,
      diagnostics,
    );
    if (edit === undefined) return;
    localEdits.push(edit);
  }
  edits.push(...localEdits);
  affectedIds.push(objectId);
}

function replaceAttributeValue(
  document: Vector180Document,
  range: SourceRange,
  expectedName: string,
  value: string,
  operationIndex: number,
  objectId: string,
  diagnostics: Diagnostic[],
): AppliedSourceEdit | undefined {
  const raw = document.source.text.slice(range.charStart, range.charEnd);
  const match = /^([^\s=]+)(\s*=\s*)(["'])([\s\S]*)\3$/u.exec(raw);
  const actualName = match?.[1];
  const quote = match?.[3];
  if (
    match === null ||
    actualName === undefined ||
    actualName.toLowerCase() !== expectedName ||
    (quote !== '"' && quote !== "'")
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Operation ${operationIndex} cannot isolate one quoted "${expectedName}" attribute value on "${objectId}".`,
      objectId,
      range,
    });
    return undefined;
  }
  return {
    range,
    replacement: `${actualName}${match[2] ?? "="}${quote}${escapeXmlAttribute(value, quote)}${quote}`,
    operationIndex,
  };
}

function getResolvedGroupChildren(
  state: ResolvedPatchState,
  parentId: string,
): readonly ResolvedObject[] | undefined {
  const parent = state.objects.get(parentId);
  return parent?.kind === "group" ? parent.children : undefined;
}

function getSourceContainerChildren(
  document: Vector180Document,
  parentId: string,
): readonly Vector180Node[] | undefined {
  if (document.sourceKind === "svg" && document.id === parentId) {
    return document.children;
  }
  if (document.sourceKind === "html") {
    const slide = document.slides.get(parentId);
    if (slide !== undefined) return slide.children;
  }
  const parent = findObject(document, parentId);
  return parent?.role === "group" &&
    parent.exportMode === "native" &&
    !parent.opaque
    ? parent.children
    : undefined;
}

function getContainerOpenTagRange(
  document: Vector180Document,
  parentId: string,
): SourceRange | undefined {
  if (document.sourceKind === "svg" && document.id === parentId) {
    return document.index.root.openTagRange;
  }
  if (document.sourceKind === "html") {
    const slide = document.index.slides.get(parentId);
    if (slide !== undefined) return slide.openTagRange;
  }
  const node = findObject(document, parentId);
  const indexed = document.index.objects.get(parentId);
  return node?.role === "group" && node.exportMode === "native" && !node.opaque
    ? indexed?.openTagRange
    : undefined;
}

function reportCloneConflicts(
  document: Vector180Document,
  clone: CloneConnectorOperation,
  operations: readonly Vector180PatchOperation[],
  cloneIndex: number,
  directChildren: readonly Vector180Node[],
  diagnostics: Diagnostic[],
): boolean {
  const directChildIds = new Set(directChildren.map((child) => child.id));
  const protectedIds = new Set([
    clone.parentId,
    clone.templateId,
    clone.connector.fromId,
    clone.connector.toId,
  ]);
  for (const [index, operation] of operations.entries()) {
    if (index === cloneIndex) continue;
    if (
      operation.op === "set-child-order" &&
      operation.parentId === clone.parentId
    ) {
      diagnostics.push({
        code: "VECTOR180-PATCH-OVERLAP",
        severity: "error",
        message: `Operations ${cloneIndex} and ${index} both claim direct-child order for "${clone.parentId}".`,
      });
      return true;
    }
    if (operation.op === "delete-object") {
      const deleted = findObject(document, operation.id);
      const deletedIds =
        deleted === undefined
          ? new Set([operation.id])
          : new Set(collectNodeIds(deleted));
      if (
        directChildIds.has(operation.id) ||
        [...protectedIds].some((id) => deletedIds.has(id))
      ) {
        diagnostics.push({
          code: protectedIds.has(operation.id)
            ? "VECTOR180-PATCH-REFERENCE"
            : "VECTOR180-PATCH-OVERLAP",
          severity: "error",
          message: `Operation ${index} deletes source structure required by clone-connector operation ${cloneIndex}.`,
          objectId: operation.id,
        });
        return true;
      }
    }
    if (
      operation.op !== "set-active-theme" &&
      operation.op !== "set-slide-order" &&
      operation.op !== "set-child-order" &&
      operation.op !== "clone-connector" &&
      operation.id === clone.templateId
    ) {
      diagnostics.push({
        code: "VECTOR180-PATCH-OVERLAP",
        severity: "error",
        message: `Operation ${index} changes connector template "${clone.templateId}" while operation ${cloneIndex} clones its exact base bytes.`,
        objectId: clone.templateId,
      });
      return true;
    }
  }
  return false;
}

function applySliceEdits(
  source: string,
  range: SourceRange,
  edits: readonly AppliedSourceEdit[],
): string | undefined {
  const sorted = [...edits].sort(
    (left, right) => right.range.charStart - left.range.charStart,
  );
  let result = source.slice(range.charStart, range.charEnd);
  for (const edit of sorted) {
    if (
      edit.range.charStart < range.charStart ||
      edit.range.charEnd > range.charEnd
    ) {
      return undefined;
    }
    const start = edit.range.charStart - range.charStart;
    const end = edit.range.charEnd - range.charStart;
    result = result.slice(0, start) + edit.replacement + result.slice(end);
  }
  return result;
}

function planCloneInsertion(
  document: Vector180Document,
  operation: CloneConnectorOperation,
  children: readonly Vector180Node[],
  cloneBytes: string,
  operationIndex: number,
  diagnostics: Diagnostic[],
): AppliedSourceEdit | undefined {
  const newIndex = operation.order.indexOf(operation.newId);
  const containerOpenTag = getContainerOpenTagRange(
    document,
    operation.parentId,
  );
  if (newIndex < 0 || children.length === 0 || containerOpenTag === undefined) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Cannot locate a nonempty exact source container for clone-connector operation ${operationIndex}.`,
      objectId: operation.newId,
    });
    return undefined;
  }

  let gapStart: number;
  let gapEnd: number;
  let insertionRange: SourceRange;
  let replacement: string;
  if (newIndex < children.length) {
    const next = children[newIndex];
    const previous = children[newIndex - 1];
    if (next === undefined) return undefined;
    gapStart =
      previous === undefined
        ? containerOpenTag.charEnd
        : previous.sourceRange.charEnd;
    gapEnd = next.sourceRange.charStart;
    insertionRange = zeroRangeAtStart(next.sourceRange);
    replacement = cloneBytes;
  } else {
    const last = children[children.length - 1];
    const beforeLast = children[children.length - 2];
    if (last === undefined) return undefined;
    gapStart =
      beforeLast === undefined
        ? containerOpenTag.charEnd
        : beforeLast.sourceRange.charEnd;
    gapEnd = last.sourceRange.charStart;
    insertionRange = zeroRangeAtEnd(last.sourceRange);
    replacement = "";
  }
  if (gapStart > gapEnd) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Clone insertion slot for "${operation.newId}" has inverted source boundaries.`,
      objectId: operation.newId,
    });
    return undefined;
  }
  const whitespace = document.source.text.slice(gapStart, gapEnd);
  if (!/^[\t\n\r ]*$/u.test(whitespace)) {
    diagnostics.push({
      code: "VECTOR180-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Clone insertion slot for "${operation.newId}" contains comments, markup, or non-whitespace text.`,
      objectId: operation.newId,
      range: insertionRange,
    });
    return undefined;
  }
  return {
    range: insertionRange,
    replacement:
      newIndex < children.length
        ? `${replacement}${whitespace}`
        : `${whitespace}${cloneBytes}`,
    operationIndex,
  };
}

function zeroRangeAtStart(range: SourceRange): SourceRange {
  return {
    byteStart: range.byteStart,
    byteEnd: range.byteStart,
    charStart: range.charStart,
    charEnd: range.charStart,
    lineStart: range.lineStart,
    columnStart: range.columnStart,
    lineEnd: range.lineStart,
    columnEnd: range.columnStart,
  };
}

function zeroRangeAtEnd(range: SourceRange): SourceRange {
  return {
    byteStart: range.byteEnd,
    byteEnd: range.byteEnd,
    charStart: range.charEnd,
    charEnd: range.charEnd,
    lineStart: range.lineEnd,
    columnStart: range.columnEnd,
    lineEnd: range.lineEnd,
    columnEnd: range.columnEnd,
  };
}

function validateCloneCandidate(
  document: Vector180Document,
  state: ResolvedPatchState,
  operation: CloneConnectorOperation,
): Diagnostic[] {
  const object = state.objects.get(operation.newId);
  const children = getSourceContainerChildren(document, operation.parentId);
  if (
    object === undefined ||
    object.kind !== "line" ||
    children === undefined ||
    !sameArray(
      children.map((child) => child.id),
      operation.order,
    ) ||
    object.fromId !== operation.connector.fromId ||
    object.toId !== operation.connector.toId ||
    !sameEndpoints(
      {
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
      },
      operation.connector.endpoints,
    ) ||
    !sameStyle(object.style, operation.connector.style)
  ) {
    return [
      {
        code: "VECTOR180-PATCH-INVALID-RESULT",
        severity: "error",
        message: `Cloned connector "${operation.newId}" does not resolve to its declared identity, parent order, references, endpoints, and style.`,
        objectId: operation.newId,
      },
    ];
  }
  return [];
}

function collectDeletionIds(
  document: Vector180Document,
  operations: readonly Vector180PatchOperation[],
): Set<string> {
  const ids = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== "delete-object") continue;
    const node = findObject(document, operation.id);
    if (node === undefined) continue;
    for (const id of collectNodeIds(node)) ids.add(id);
  }
  return ids;
}

function collectNodeIds(node: Vector180Node): string[] {
  const ids = [node.id];
  for (const child of node.children) ids.push(...collectNodeIds(child));
  return ids;
}

function findConnectorReferenceHazard(
  document: Vector180Document,
  deletedSubtreeIds: ReadonlySet<string>,
  allDeletingIds: ReadonlySet<string>,
): Vector180Node | undefined {
  let hazard: Vector180Node | undefined;
  visitDocumentNodes(document, (node) => {
    if (
      hazard !== undefined ||
      node.role !== "connector" ||
      allDeletingIds.has(node.id)
    ) {
      return;
    }
    const from = node.attributes["data-vector180-from"];
    const to = node.attributes["data-vector180-to"];
    if (
      (from !== undefined && deletedSubtreeIds.has(from)) ||
      (to !== undefined && deletedSubtreeIds.has(to))
    ) {
      hazard = node;
    }
  });
  return hazard;
}

function visitDocumentNodes(
  document: Vector180Document,
  visitor: (node: Vector180Node) => void,
): void {
  const visit = (nodes: readonly Vector180Node[]): void => {
    for (const node of nodes) {
      visitor(node);
      visit(node.children);
    }
  };
  if (document.sourceKind === "svg") {
    visit(document.children);
  } else {
    for (const slide of document.slides.values()) visit(slide.children);
  }
}

function isRootId(document: Vector180Document, id: string): boolean {
  return document.sourceKind === "svg"
    ? document.id === id
    : document.slides.has(id);
}

function preconditionDiagnostic(
  operationIndex: number,
  objectId: string,
  label: string,
): Diagnostic {
  return {
    code: "VECTOR180-PATCH-PRECONDITION",
    severity: "error",
    message: `Operation ${operationIndex} ${label} precondition does not match object "${objectId}".`,
    objectId,
  };
}

function sameRectGeometry(
  left: Vector180RectGeometry,
  right: Vector180RectGeometry,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameEllipseGeometry(
  left: Vector180EllipseGeometry,
  right: Vector180EllipseGeometry,
): boolean {
  return (
    left.cx === right.cx &&
    left.cy === right.cy &&
    left.rx === right.rx &&
    left.ry === right.ry
  );
}

function sameEndpoints(
  left: Vector180ConnectorEndpoints,
  right: Vector180ConnectorEndpoints,
): boolean {
  return (
    left.x1 === right.x1 &&
    left.y1 === right.y1 &&
    left.x2 === right.x2 &&
    left.y2 === right.y2
  );
}

function samePoint(
  left: Vector180PatchPoint,
  right: Vector180PatchPoint,
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameBounds(
  left: Vector180PatchBounds,
  right: Vector180PatchBounds,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameStyle(
  left: Vector180ConcreteNativeStyle,
  right: Vector180ConcreteNativeStyle,
): boolean {
  return (
    left.fill === right.fill &&
    left.stroke === right.stroke &&
    left.strokeWidth === right.strokeWidth &&
    left.opacity === right.opacity &&
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.fontStyle === right.fontStyle &&
    left.textAnchor === right.textAnchor
  );
}

function formatBounds(bounds: Vector180PatchBounds): string {
  return [bounds.x, bounds.y, bounds.width, bounds.height]
    .map(formatNumber)
    .join(" ");
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function escapeXmlAttribute(value: string, quote: '"' | "'"): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(quote, quote === '"' ? "&quot;" : "&apos;");
}

function decodePatch(input: unknown): {
  patch?: Vector180Patch;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    return {
      diagnostics: [
        {
          code: "VECTOR180-PATCH-SCHEMA",
          severity: "error",
          message: "Patch must be a JSON object.",
        },
      ],
    };
  }
  for (const key of unknownKeys(input, [
    "schema",
    "baseSha256",
    "transactionId",
    "author",
    "timestamp",
    "ops",
  ])) {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message: `Unknown patch field "${key}".`,
    });
  }
  if (input.schema !== "vector180-patch/0.1") {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message: 'Patch schema must equal "vector180-patch/0.1".',
    });
  }
  if (
    typeof input.baseSha256 !== "string" ||
    !SHA256_PATTERN.test(input.baseSha256)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message: "Patch baseSha256 must be a lowercase 64-hex SHA-256 digest.",
    });
  }
  if (!Array.isArray(input.ops) || input.ops.length === 0) {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message: "Patch ops must be a non-empty array.",
    });
  }
  for (const key of ["transactionId", "author", "timestamp"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      diagnostics.push({
        code: "VECTOR180-PATCH-SCHEMA",
        severity: "error",
        message: `Patch ${key} must be a string.`,
      });
    }
  }
  if (
    typeof input.timestamp === "string" &&
    !isRfc3339DateTime(input.timestamp)
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message: "Patch timestamp must be an RFC 3339 date-time.",
    });
  }
  const operations: Vector180PatchOperation[] = [];
  if (Array.isArray(input.ops)) {
    for (const [index, value] of input.ops.entries()) {
      const operation = decodeOperation(value, index, diagnostics);
      if (operation !== undefined) operations.push(operation);
    }
  }
  if (
    operations.filter((operation) => operation.op === "clone-connector")
      .length > 1
  ) {
    diagnostics.push({
      code: "VECTOR180-PATCH-SCHEMA",
      severity: "error",
      message:
        "vector180-patch/0.1 permits at most one clone-connector operation.",
    });
  }
  if (
    hasErrors(diagnostics) ||
    typeof input.baseSha256 !== "string" ||
    input.schema !== "vector180-patch/0.1"
  ) {
    return { diagnostics };
  }

  const metadata = {
    baseSha256: input.baseSha256,
    ...(typeof input.transactionId === "string"
      ? { transactionId: input.transactionId }
      : {}),
    ...(typeof input.author === "string" ? { author: input.author } : {}),
    ...(typeof input.timestamp === "string"
      ? { timestamp: input.timestamp }
      : {}),
  };
  const patch: Vector180Patch = {
    schema: "vector180-patch/0.1",
    ...metadata,
    ops: operations,
  };
  return { patch, diagnostics };
}

function decodeOperation(
  input: unknown,
  index: number,
  diagnostics: Diagnostic[],
): Vector180PatchOperation | undefined {
  if (!isRecord(input) || typeof input.op !== "string") {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        "Operation must be an object with an op.",
      ),
    );
    return undefined;
  }
  if (input.op === "set-text") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldText", "value"],
      diagnostics,
    );
    if (
      typeof input.id !== "string" ||
      typeof input.oldText !== "string" ||
      typeof input.value !== "string"
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-text requires string id, oldText, and value.",
        ),
      );
      return undefined;
    }
    if (!STABLE_ID_PATTERN.test(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(index, "set-text id is not a stable ID."),
      );
      return undefined;
    }
    return {
      op: "set-text",
      id: input.id,
      oldText: input.oldText,
      value: input.value,
    };
  }
  if (input.op === "set-active-theme") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "theme", "oldTheme"],
      diagnostics,
    );
    if (typeof input.theme !== "string" || typeof input.oldTheme !== "string") {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme requires string oldTheme and theme.",
        ),
      );
      return undefined;
    }
    if (!STABLE_ID_PATTERN.test(input.theme)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme theme is not a stable ID.",
        ),
      );
      return undefined;
    }
    if (!STABLE_ID_PATTERN.test(input.oldTheme)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme oldTheme is not a stable ID.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-active-theme",
      theme: input.theme,
      oldTheme: input.oldTheme,
    };
  }
  if (input.op === "set-slide-order") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "order", "oldOrder"],
      diagnostics,
    );
    if (!isStringArray(input.order) || !isStringArray(input.oldOrder)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order requires string[] oldOrder and order.",
        ),
      );
      return undefined;
    }
    if (input.order.length === 0) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order must not be empty.",
        ),
      );
      return undefined;
    }
    if (input.order.some((id) => !STABLE_ID_PATTERN.test(id))) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order contains an invalid stable ID.",
        ),
      );
      return undefined;
    }
    if (new Set(input.order).size !== input.order.length) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order must contain unique IDs.",
        ),
      );
      return undefined;
    }
    if (input.oldOrder.some((id) => !STABLE_ID_PATTERN.test(id))) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order oldOrder contains an invalid stable ID.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-slide-order",
      order: input.order,
      oldOrder: input.oldOrder,
    };
  }

  if (input.op === "clone-connector") {
    reportUnknownOperationKeys(
      input,
      index,
      [
        "op",
        "templateId",
        "newId",
        "parentId",
        "oldOrder",
        "order",
        "oldConnector",
        "connector",
      ],
      diagnostics,
    );
    if (
      !validStableId(input.templateId) ||
      !validStableId(input.newId) ||
      !validStableId(input.parentId) ||
      !validStableIdArray(input.oldOrder) ||
      !validStableIdArray(input.order)
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "clone-connector requires stable templateId/newId/parentId and unique stable-ID oldOrder/order arrays.",
        ),
      );
      return undefined;
    }
    const oldConnector = decodeConnectorCloneState(
      input.oldConnector,
      index,
      "oldConnector",
      diagnostics,
    );
    const connector = decodeConnectorCloneState(
      input.connector,
      index,
      "connector",
      diagnostics,
    );
    if (oldConnector === undefined || connector === undefined) return undefined;
    return {
      op: "clone-connector",
      templateId: input.templateId,
      newId: input.newId,
      parentId: input.parentId,
      oldOrder: input.oldOrder,
      order: input.order,
      oldConnector,
      connector,
    };
  }

  if (input.op === "set-object-geometry") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldGeometry", "geometry"],
      diagnostics,
    );
    if (!validStableId(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-object-geometry requires a stable id.",
        ),
      );
      return undefined;
    }
    const oldGeometry = decodeGeometry(
      input.oldGeometry,
      index,
      "oldGeometry",
      diagnostics,
    );
    const geometry = decodeGeometry(
      input.geometry,
      index,
      "geometry",
      diagnostics,
    );
    if (oldGeometry === undefined || geometry === undefined) return undefined;
    if (oldGeometry.kind !== geometry.kind) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-object-geometry oldGeometry and geometry kinds must match.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-object-geometry",
      id: input.id,
      oldGeometry,
      geometry,
    };
  }

  if (input.op === "set-connector-endpoints") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldEndpoints", "endpoints"],
      diagnostics,
    );
    if (!validStableId(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-connector-endpoints requires a stable id.",
        ),
      );
      return undefined;
    }
    const oldEndpoints = decodeEndpoints(
      input.oldEndpoints,
      index,
      "oldEndpoints",
      diagnostics,
      false,
    );
    const endpoints = decodeEndpoints(
      input.endpoints,
      index,
      "endpoints",
      diagnostics,
      true,
    );
    if (oldEndpoints === undefined || endpoints === undefined) return undefined;
    return {
      op: "set-connector-endpoints",
      id: input.id,
      oldEndpoints,
      endpoints,
    };
  }

  if (input.op === "set-group-translation") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldTranslation", "translation"],
      diagnostics,
    );
    if (!validStableId(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-group-translation requires a stable id.",
        ),
      );
      return undefined;
    }
    const oldTranslation = decodePoint(
      input.oldTranslation,
      index,
      "oldTranslation",
      diagnostics,
    );
    const translation = decodePoint(
      input.translation,
      index,
      "translation",
      diagnostics,
    );
    if (oldTranslation === undefined || translation === undefined)
      return undefined;
    return {
      op: "set-group-translation",
      id: input.id,
      oldTranslation,
      translation,
    };
  }

  if (input.op === "set-text-frame") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldFrame", "frame", "oldLineAnchor", "lineAnchor"],
      diagnostics,
    );
    if (!validStableId(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-text-frame requires a stable id.",
        ),
      );
      return undefined;
    }
    const oldFrame = decodeBounds(
      input.oldFrame,
      index,
      "oldFrame",
      diagnostics,
    );
    const frame = decodeBounds(input.frame, index, "frame", diagnostics);
    const oldLineAnchor = decodePoint(
      input.oldLineAnchor,
      index,
      "oldLineAnchor",
      diagnostics,
    );
    const lineAnchor = decodePoint(
      input.lineAnchor,
      index,
      "lineAnchor",
      diagnostics,
    );
    if (
      oldFrame === undefined ||
      frame === undefined ||
      oldLineAnchor === undefined ||
      lineAnchor === undefined
    ) {
      return undefined;
    }
    return {
      op: "set-text-frame",
      id: input.id,
      oldFrame,
      frame,
      oldLineAnchor,
      lineAnchor,
    };
  }

  if (input.op === "set-child-order") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "parentId", "oldOrder", "order"],
      diagnostics,
    );
    if (
      !validStableId(input.parentId) ||
      !validStableIdArray(input.oldOrder) ||
      !validStableIdArray(input.order)
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-child-order requires stable parentId and unique stable-ID oldOrder/order arrays.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-child-order",
      parentId: input.parentId,
      oldOrder: input.oldOrder,
      order: input.order,
    };
  }

  if (input.op === "delete-object") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldParentId", "oldOrder"],
      diagnostics,
    );
    if (
      !validStableId(input.id) ||
      !(input.oldParentId === null || validStableId(input.oldParentId)) ||
      !Number.isInteger(input.oldOrder) ||
      (input.oldOrder as number) < 0
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "delete-object requires stable id, nullable stable oldParentId, and nonnegative integer oldOrder.",
        ),
      );
      return undefined;
    }
    return {
      op: "delete-object",
      id: input.id,
      oldParentId: input.oldParentId,
      oldOrder: input.oldOrder as number,
    };
  }

  if (input.op === "set-native-style") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldStyle", "style"],
      diagnostics,
    );
    if (!validStableId(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-native-style requires a stable id.",
        ),
      );
      return undefined;
    }
    const oldStyle = decodeConcreteStyle(
      input.oldStyle,
      index,
      "oldStyle",
      diagnostics,
    );
    const style = decodeConcreteStyle(input.style, index, "style", diagnostics);
    if (oldStyle === undefined || style === undefined) return undefined;
    return {
      op: "set-native-style",
      id: input.id,
      oldStyle,
      style,
    };
  }

  diagnostics.push({
    code: "VECTOR180-PATCH-UNSUPPORTED",
    severity: "error",
    message: `Operation ${index} uses unsupported op "${input.op}".`,
  });
  return undefined;
}

function decodeConnectorCloneState(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
): Vector180ConnectorCloneState | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} must be a connector state object.`,
      ),
    );
    return undefined;
  }
  reportUnknownNestedKeys(
    input,
    index,
    label,
    ["fromId", "toId", "endpoints", "style"],
    diagnostics,
  );
  if (!validStableId(input.fromId) || !validStableId(input.toId)) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} requires stable fromId and toId.`,
      ),
    );
    return undefined;
  }
  const endpoints = decodeEndpoints(
    input.endpoints,
    index,
    `${label}.endpoints`,
    diagnostics,
    true,
  );
  const style = decodeConcreteStyle(
    input.style,
    index,
    `${label}.style`,
    diagnostics,
  );
  if (endpoints === undefined || style === undefined) return undefined;
  return {
    fromId: input.fromId,
    toId: input.toId,
    endpoints,
    style,
  };
}

function decodeGeometry(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
): Vector180ObjectGeometry | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} must be a geometry object.`),
    );
    return undefined;
  }
  if (input.kind === "rect") {
    reportUnknownNestedKeys(
      input,
      index,
      label,
      ["kind", "x", "y", "width", "height"],
      diagnostics,
    );
    if (
      !isFiniteNumber(input.x) ||
      !isFiniteNumber(input.y) ||
      !isPositiveFiniteNumber(input.width) ||
      !isPositiveFiniteNumber(input.height)
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          `${label} rect requires finite x/y and positive finite width/height.`,
        ),
      );
      return undefined;
    }
    return {
      kind: "rect",
      x: normalizePatchZero(input.x),
      y: normalizePatchZero(input.y),
      width: input.width,
      height: input.height,
    };
  }
  if (input.kind === "ellipse") {
    reportUnknownNestedKeys(
      input,
      index,
      label,
      ["kind", "cx", "cy", "rx", "ry"],
      diagnostics,
    );
    if (
      !isFiniteNumber(input.cx) ||
      !isFiniteNumber(input.cy) ||
      !isPositiveFiniteNumber(input.rx) ||
      !isPositiveFiniteNumber(input.ry)
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          `${label} ellipse requires finite cx/cy and positive finite rx/ry.`,
        ),
      );
      return undefined;
    }
    return {
      kind: "ellipse",
      cx: normalizePatchZero(input.cx),
      cy: normalizePatchZero(input.cy),
      rx: input.rx,
      ry: input.ry,
    };
  }
  diagnostics.push(
    schemaOperationDiagnostic(
      index,
      `${label} kind must be "rect" or "ellipse".`,
    ),
  );
  return undefined;
}

function decodeEndpoints(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
  _replacement: boolean,
): Vector180ConnectorEndpoints | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} must be an endpoint object.`),
    );
    return undefined;
  }
  reportUnknownNestedKeys(
    input,
    index,
    label,
    ["x1", "y1", "x2", "y2"],
    diagnostics,
  );
  if (
    !isFiniteNumber(input.x1) ||
    !isFiniteNumber(input.y1) ||
    !isFiniteNumber(input.x2) ||
    !isFiniteNumber(input.y2)
  ) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} requires four finite numbers.`,
      ),
    );
    return undefined;
  }
  const endpoints = {
    x1: normalizePatchZero(input.x1),
    y1: normalizePatchZero(input.y1),
    x2: normalizePatchZero(input.x2),
    y2: normalizePatchZero(input.y2),
  };
  if (endpoints.x1 === endpoints.x2 && endpoints.y1 === endpoints.y2) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} connector endpoints must be distinct.`,
      ),
    );
    return undefined;
  }
  return endpoints;
}

function decodePoint(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
): Vector180PatchPoint | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} must be a point object.`),
    );
    return undefined;
  }
  reportUnknownNestedKeys(input, index, label, ["x", "y"], diagnostics);
  if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} requires finite x and y.`),
    );
    return undefined;
  }
  return {
    x: normalizePatchZero(input.x),
    y: normalizePatchZero(input.y),
  };
}

function decodeBounds(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
): Vector180PatchBounds | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} must be a bounds object.`),
    );
    return undefined;
  }
  reportUnknownNestedKeys(
    input,
    index,
    label,
    ["x", "y", "width", "height"],
    diagnostics,
  );
  if (
    !isFiniteNumber(input.x) ||
    !isFiniteNumber(input.y) ||
    !isPositiveFiniteNumber(input.width) ||
    !isPositiveFiniteNumber(input.height)
  ) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} requires finite x/y and positive finite width/height.`,
      ),
    );
    return undefined;
  }
  return {
    x: normalizePatchZero(input.x),
    y: normalizePatchZero(input.y),
    width: input.width,
    height: input.height,
  };
}

function decodeConcreteStyle(
  input: unknown,
  index: number,
  label: string,
  diagnostics: Diagnostic[],
): Vector180ConcreteNativeStyle | undefined {
  if (!isRecord(input)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `${label} must be a style object.`),
    );
    return undefined;
  }
  reportUnknownNestedKeys(
    input,
    index,
    label,
    [
      "fill",
      "stroke",
      "strokeWidth",
      "opacity",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "textAnchor",
    ],
    diagnostics,
  );
  if (
    !isConcretePaint(input.fill) ||
    !isConcretePaint(input.stroke) ||
    !isFiniteNumber(input.strokeWidth) ||
    input.strokeWidth < 0 ||
    !isFiniteNumber(input.opacity) ||
    input.opacity < 0 ||
    input.opacity > 1 ||
    (input.fontFamily !== undefined &&
      !isConcreteFontFamily(input.fontFamily)) ||
    (input.fontSize !== undefined && !isPositiveFiniteNumber(input.fontSize)) ||
    (input.fontWeight !== 400 && input.fontWeight !== 700) ||
    (input.fontStyle !== "normal" && input.fontStyle !== "italic") ||
    (input.textAnchor !== "start" &&
      input.textAnchor !== "middle" &&
      input.textAnchor !== "end")
  ) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `${label} must be one complete concrete C6 native style.`,
      ),
    );
    return undefined;
  }
  return {
    fill: input.fill,
    stroke: input.stroke,
    strokeWidth: normalizePatchZero(input.strokeWidth),
    opacity: normalizePatchZero(input.opacity),
    ...(typeof input.fontFamily === "string"
      ? { fontFamily: input.fontFamily }
      : {}),
    ...(typeof input.fontSize === "number" ? { fontSize: input.fontSize } : {}),
    fontWeight: input.fontWeight,
    fontStyle: input.fontStyle,
    textAnchor: input.textAnchor,
  };
}

function reportUnknownNestedKeys(
  value: Record<string, unknown>,
  index: number,
  label: string,
  allowed: readonly string[],
  diagnostics: Diagnostic[],
): void {
  for (const key of unknownKeys(value, allowed)) {
    diagnostics.push(
      schemaOperationDiagnostic(index, `Unknown ${label} field "${key}".`),
    );
  }
}

function validStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

function validStableIdArray(value: unknown): value is string[] {
  return (
    isStringArray(value) &&
    value.every((id) => STABLE_ID_PATTERN.test(id)) &&
    new Set(value).size === value.length
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function normalizePatchZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function isConcretePaint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === "none" || /^#[0-9a-f]{6}$/u.test(value))
  );
}

const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "emoji",
  "fangsong",
  "fantasy",
  "math",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

function isConcreteFontFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !value.includes(",") &&
    /^-?[_A-Za-z][_A-Za-z0-9-]*(?:\s+-?[_A-Za-z][_A-Za-z0-9-]*)*$/u.test(
      value,
    ) &&
    !GENERIC_FONT_FAMILIES.has(value.toLowerCase())
  );
}

function findObject(
  document: Vector180Document,
  id: string,
): Vector180Node | undefined {
  if (document.sourceKind === "svg") {
    return findNode(document.children, id);
  }
  for (const slideId of document.slideOrder) {
    const slide = document.slides.get(slideId);
    if (slide === undefined) continue;
    const found = findNode(slide.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findNode(
  nodes: readonly Vector180Node[],
  id: string,
): Vector180Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function failedResult(
  document: Vector180Document,
  plan: PatchPlan,
  message: string,
  related: Diagnostic[],
): PatchResult {
  return {
    applied: false,
    originalSha256: document.source.sha256,
    affectedIds: [],
    edits: [],
    diagnostics: [
      ...plan.diagnostics,
      {
        code: "VECTOR180-PATCH-INVALID-RESULT",
        severity: "error",
        message,
        ...(related.length === 0
          ? {}
          : {
              related: related.map((diagnostic) => ({
                message: `${diagnostic.code}: ${diagnostic.message}`,
                ...(diagnostic.range === undefined
                  ? {}
                  : { range: diagnostic.range }),
              })),
            }),
      },
    ],
  };
}

function unsupportedAtomOperation(
  operationIndex: number,
  operation: "set-active-theme" | "set-slide-order",
): Diagnostic {
  return {
    code: "VECTOR180-PATCH-UNSUPPORTED",
    severity: "error",
    message: `Operation ${operationIndex} uses deck-only op "${operation}" against a standalone diagram.`,
  };
}

function targetDiagnostic(index: number, message: string): Diagnostic {
  return {
    code: "VECTOR180-PATCH-TARGET",
    severity: "error",
    message: `Operation ${index}: ${message}`,
  };
}

function schemaOperationDiagnostic(index: number, message: string): Diagnostic {
  return {
    code: "VECTOR180-PATCH-SCHEMA",
    severity: "error",
    message: `Operation ${index}: ${message}`,
  };
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isPermutation(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    sameArray([...left].sort(), [...right].sort())
  );
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRfc3339DateTime(value: string): boolean {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u.exec(
      value,
    );
  if (match?.groups === undefined) return false;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const offsetHour = Number(match.groups.offsetHour ?? 0);
  const offsetMinute = Number(match.groups.offsetMinute ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function reportUnknownOperationKeys(
  operation: Record<string, unknown>,
  index: number,
  allowed: readonly string[],
  diagnostics: Diagnostic[],
): void {
  for (const key of unknownKeys(operation, allowed)) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `Unknown ${String(operation.op)} field "${key}".`,
      ),
    );
  }
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key));
}
