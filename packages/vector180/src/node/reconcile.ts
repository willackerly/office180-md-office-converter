/**
 * Baseline-aware, typed native-object PPTX reconciliation.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 */

import { createHash } from "node:crypto";

import type {
  CloneConnectorOperation,
  Diagnostic,
  Vector180ConcreteNativeStyle,
  Vector180ConnectorEndpoints,
  Vector180Document,
  Vector180ObjectGeometry,
  Vector180Operation,
  Vector180Patch,
  Vector180PatchOperation,
  Vector180PatchBounds,
  Vector180PatchPoint,
} from "../core/types.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import {
  compilePptxBaseline,
  Vector180PptxBaselineCompileError,
  serializeVector180PptxMap,
  type Vector180PptxMap,
} from "./pptx-baseline.js";
import {
  inspectPptxForReconciliation,
  type PptxInspection,
  type PptxIdentityMatch,
  type PptxIdentityOccurrence,
  type PptxInspectedGeometry,
  type PptxInspectedObject,
  type PptxInspectedStyle,
} from "./pptx-inspect.js";
import {
  connectorDuplicateResolutionGuidance,
  connectorOccurrenceFingerprintSha256,
  parseVector180ReconcileResolution,
  reconciliationReportSha256,
  Vector180ReconcileResolutionError,
  type Vector180ReconcileResolution,
} from "./reconcile-resolution.js";
import {
  buildReconciliationPresentation,
  operationId,
  type Vector180CandidateOperation,
  type Vector180ReconciliationFinding,
  type Vector180ReconciliationFindingInput,
  type Vector180ReconciliationSummary,
} from "./reconciliation-report.js";

const INVALID_MAP_SHA256 = "0".repeat(64);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EMU_PER_UNIT = 7_620;
const HUNDREDTH_POINTS_PER_UNIT = 60;
const TRUST_DIAGNOSTIC_CODES = new Set([
  "VECTOR180-RECONCILE-DUPLICATE-ID",
  "VECTOR180-RECONCILE-INVALID-PPTX",
  "VECTOR180-RECONCILE-LINEAGE",
  "VECTOR180-RECONCILE-MISSING-ID",
  "VECTOR180-RECONCILE-RESOLUTION",
]);
const IGNORED_METADATA_PARTS = new Set([
  "docProps/app.xml",
  "docProps/core.xml",
  "docProps/custom.xml",
]);

export type Vector180ReconciliationStatus =
  "unchanged" | "patchable" | "review-required" | "refused";

export interface Vector180OfficeTextChange {
  readonly kind: "text";
  readonly objectId: string;
  readonly field: "text";
  readonly oldText: string;
  readonly newText: string;
  readonly patchable: true;
}

export interface Vector180OfficeTypedChange {
  readonly kind:
    | "geometry"
    | "connector-endpoints"
    | "group-translation"
    | "text-frame"
    | "child-order"
    | "deletion"
    | "native-style";
  readonly field:
    | "geometry"
    | "endpoints"
    | "translation"
    | "frame"
    | "order"
    | "object"
    | "style";
  readonly objectId?: string;
  readonly parentId?: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly patchable: true;
}

export interface Vector180OfficeUnsupportedChange {
  readonly kind: "unsupported";
  readonly scope: "package" | "slide" | "object";
  readonly field: string;
  readonly objectId?: string;
  readonly message: string;
  readonly patchable: false;
}

export type Vector180OfficeChange =
  | Vector180OfficeTextChange
  | Vector180OfficeTypedChange
  | Vector180OfficeUnsupportedChange;

export interface Vector180ReconciliationResult {
  readonly schema: "vector180-pptx-reconciliation/0.1";
  readonly status: Vector180ReconciliationStatus;
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly nativeBaselinePptxSha256?: string;
  readonly changes: readonly Vector180OfficeChange[];
  readonly summary: Vector180ReconciliationSummary;
  readonly findings: readonly Vector180ReconciliationFinding[];
  readonly candidateOperations: readonly Vector180CandidateOperation[];
  readonly patch?: Vector180Patch;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180ReconciliationOptions {
  /**
   * Optional exact native-save baseline. It must authenticate against the map
   * and have the same normalized supported slide semantics as deterministic C9
   * regeneration before it can become the comparison base.
   */
  readonly nativeBaselinePptxBytes?: Uint8Array;
  /**
   * Optional explicit human-reviewed recovery for exactly one copied mapped
   * connector. Runtime validation is strict even for typed callers.
   */
  readonly resolution?: Vector180ReconcileResolution;
}

export async function reconcilePptx(
  source: Vector180Document,
  baselineInput: Vector180PptxMap,
  editedPptxBytes: Uint8Array,
  options: Vector180ReconciliationOptions = {},
): Promise<Vector180ReconciliationResult> {
  const sourceSha256 = source.source.sha256;
  const editedPptxSha256 = sha256(editedPptxBytes);
  const serializedBaseline = safeSerializeMap(baselineInput);
  const baselineMapSha256 =
    serializedBaseline === undefined
      ? INVALID_MAP_SHA256
      : sha256Text(serializedBaseline);
  const context = {
    sourceSha256,
    baselineMapSha256,
    editedPptxSha256,
    ...(options.nativeBaselinePptxBytes === undefined
      ? {}
      : {
          nativeBaselinePptxSha256: sha256(options.nativeBaselinePptxBytes),
        }),
  };

  if (
    source.sourceKind !== "svg" ||
    source.diagnostics.some(isErrorDiagnostic)
  ) {
    return refused(
      context,
      "VECTOR180-RECONCILE-INVALID-SOURCE",
      "This bounded C10 slice requires one complete error-free standalone Vector180 diagram.",
    );
  }
  if (serializedBaseline === undefined || !basicBaselineMap(baselineInput)) {
    return refused(
      context,
      "VECTOR180-RECONCILE-INVALID-BASELINE",
      "Baseline map is not a canonical C9 standalone-diagram map.",
    );
  }
  const baseline = baselineInput;
  if (
    source.wireFamily !== "vector180" ||
    baseline.source.family !== "vector180" ||
    baseline.source.kind !== "atom"
  ) {
    return refused(
      context,
      "VECTOR180-RECONCILE-FAMILY",
      "Reconciliation requires one canonical Vector180 atom and a matching canonical C9 map.",
    );
  }
  if (baseline.source.metadataSha256 !== source.metadataSha256) {
    return refused(
      context,
      "VECTOR180-RECONCILE-LINEAGE",
      "Baseline metadata digest does not match the exact source atom.",
    );
  }
  if (baseline.source.sha256 !== sourceSha256) {
    return refused(
      context,
      "VECTOR180-RECONCILE-STALE-SOURCE",
      `Canonical source ${sourceSha256} differs from baseline source ${baseline.source.sha256}.`,
    );
  }

  let regenerated;
  try {
    regenerated = await compilePptxBaseline(source, {
      placement: baseline.composition.placement,
    });
  } catch (error) {
    const message =
      error instanceof Vector180PptxBaselineCompileError
        ? `${error.code}: ${error.message}`
        : errorMessage(error);
    return refused(
      context,
      "VECTOR180-RECONCILE-INVALID-SOURCE",
      `Source cannot regenerate the claimed C9 baseline: ${message}`,
    );
  }
  if (
    serializedBaseline !== regenerated.mapText ||
    baselineMapSha256 !== regenerated.mapSha256
  ) {
    return refused(
      context,
      "VECTOR180-RECONCILE-INVALID-BASELINE",
      "Supplied sidecar map differs from deterministic C9 regeneration of the exact source and placement.",
    );
  }

  const [
    baselineInspectionResult,
    editedInspectionResult,
    nativeBaselineInspectionResult,
  ] = await Promise.all([
    inspectPptxForReconciliation(regenerated.pptxBytes, baseline),
    inspectPptxForReconciliation(editedPptxBytes, baseline),
    options.nativeBaselinePptxBytes === undefined
      ? Promise.resolve(undefined)
      : inspectPptxForReconciliation(options.nativeBaselinePptxBytes, baseline),
  ]);
  if (
    baselineInspectionResult.inspection === undefined ||
    baselineInspectionResult.diagnostics.length > 0
  ) {
    return refused(
      context,
      "VECTOR180-RECONCILE-INVALID-BASELINE",
      "Regenerated C9 package did not pass its own C10 inspection.",
      baselineInspectionResult.diagnostics,
    );
  }
  if (editedInspectionResult.inspection === undefined) {
    return resultWithDiagnostics(
      "refused",
      context,
      [],
      editedInspectionResult.diagnostics,
    );
  }
  if (nativeBaselineInspectionResult !== undefined) {
    if (
      nativeBaselineInspectionResult.inspection === undefined ||
      nativeBaselineInspectionResult.diagnostics.some(isErrorDiagnostic)
    ) {
      return refused(
        context,
        "VECTOR180-RECONCILE-INVALID-BASELINE",
        "Optional native-save baseline did not pass authenticated C10 inspection.",
        nativeBaselineInspectionResult.diagnostics,
      );
    }
    if (
      !sameSupportedSlideSemantics(
        baselineInspectionResult.inspection,
        nativeBaselineInspectionResult.inspection,
      )
    ) {
      return refused(
        context,
        "VECTOR180-RECONCILE-INVALID-BASELINE",
        "Optional native-save baseline does not have the same normalized supported slide semantics as deterministic C9 regeneration.",
      );
    }
  }

  let diagnostics = [...editedInspectionResult.diagnostics];
  const changes: Vector180OfficeChange[] = [];
  const operations: Vector180Operation[] = [];
  const comparisonBaseline =
    nativeBaselineInspectionResult?.inspection ??
    baselineInspectionResult.inspection;
  compareInspections(
    comparisonBaseline,
    editedInspectionResult.inspection,
    baseline,
    changes,
    operations,
    diagnostics,
  );
  const unresolvedFindingInputs = Object.freeze([
    ...(nativeBaselineInspectionResult?.inspection === undefined
      ? []
      : reconciliationFindingInputs(
          baselineInspectionResult.inspection,
          nativeBaselineInspectionResult.inspection,
          [],
          [],
          [],
        )),
    ...reconciliationFindingInputs(
      comparisonBaseline,
      editedInspectionResult.inspection,
      changes,
      operations,
      diagnostics,
    ),
  ]);
  const unresolvedStatus: Vector180ReconciliationStatus = diagnostics.some(
    (diagnostic) => TRUST_DIAGNOSTIC_CODES.has(diagnostic.code),
  )
    ? "refused"
    : diagnostics.some(isErrorDiagnostic)
      ? "review-required"
      : operations.length === 0
        ? "unchanged"
        : "patchable";
  const unresolvedReport = resultWithDiagnostics(
    unresolvedStatus,
    context,
    changes,
    diagnostics,
    unresolvedFindingInputs,
    operations,
  );
  const unresolvedReportSha256 = reconciliationReportSha256(unresolvedReport);
  let connectorClonePlan: ReviewedConnectorClonePlan | undefined;
  const resolutionFindingInputs: Vector180ReconciliationFindingInput[] = [];
  if (options.resolution !== undefined) {
    try {
      const resolution = parseVector180ReconcileResolution(options.resolution);
      connectorClonePlan = planReviewedConnectorClone(
        source,
        baseline,
        comparisonBaseline,
        editedInspectionResult.inspection,
        resolution,
        context,
        unresolvedReportSha256,
        unresolvedReport.findings,
      );
      const resolvedSlideStructureMessage = `Unsupported slide-level structure changed in "${connectorClonePlan.slidePartName}".`;
      diagnostics = diagnostics.filter(
        (diagnostic) =>
          !(
            (diagnostic.code === "VECTOR180-RECONCILE-DUPLICATE-ID" &&
              diagnostic.objectId === connectorClonePlan?.duplicateId) ||
            (diagnostic.code === "VECTOR180-RECONCILE-UNSUPPORTED" &&
              diagnostic.message === resolvedSlideStructureMessage)
          ),
      );
      for (let index = changes.length - 1; index >= 0; index -= 1) {
        const change = changes[index];
        if (
          change?.kind === "unsupported" &&
          change.scope === "slide" &&
          change.field === "structure" &&
          change.message === resolvedSlideStructureMessage
        ) {
          changes.splice(index, 1);
        }
      }
      resolutionFindingInputs.push(
        reviewedConnectorCloneFinding(connectorClonePlan),
      );
    } catch (error) {
      diagnostics.push({
        code: "VECTOR180-RECONCILE-RESOLUTION",
        severity: "error",
        message:
          error instanceof Vector180ReconcileResolutionError
            ? error.message
            : `Reviewed connector-copy resolution failed: ${errorMessage(error)}`,
      });
    }
  }
  const patchOperations: Vector180PatchOperation[] = [
    ...operations,
    ...(connectorClonePlan === undefined ? [] : [connectorClonePlan.operation]),
  ];
  const findingInputs = Object.freeze([
    ...(nativeBaselineInspectionResult?.inspection === undefined
      ? []
      : reconciliationFindingInputs(
          baselineInspectionResult.inspection,
          nativeBaselineInspectionResult.inspection,
          [],
          [],
          [],
        )),
    ...reconciliationFindingInputs(
      comparisonBaseline,
      editedInspectionResult.inspection,
      changes,
      patchOperations,
      diagnostics,
    ),
    ...resolutionFindingInputs,
  ]);

  if (
    diagnostics.some((diagnostic) =>
      TRUST_DIAGNOSTIC_CODES.has(diagnostic.code),
    )
  ) {
    return resultWithDiagnostics(
      "refused",
      context,
      changes,
      diagnostics,
      findingInputs,
      patchOperations,
    );
  }
  if (diagnostics.some(isErrorDiagnostic)) {
    return resultWithDiagnostics(
      "review-required",
      context,
      changes,
      diagnostics,
      findingInputs,
      patchOperations,
    );
  }

  if (patchOperations.length === 0) {
    return resultWithDiagnostics(
      "unchanged",
      context,
      [],
      diagnostics,
      findingInputs,
      [],
    );
  }
  const patch: Vector180Patch = {
    schema: "vector180-patch/0.1",
    baseSha256: sourceSha256,
    ops: patchOperations,
  };
  const validation = await validatePatch(source, patch);
  if (validation.some(isErrorDiagnostic)) {
    return patchFailure(
      context,
      changes,
      validation,
      findingInputs,
      patchOperations,
    );
  }
  const application = await applyPatch(source, patch);
  if (
    !application.applied ||
    application.atom === undefined ||
    application.sourceText === undefined
  ) {
    return patchFailure(
      context,
      changes,
      application.diagnostics,
      findingInputs,
      patchOperations,
    );
  }

  let patchedBaseline;
  try {
    patchedBaseline = await compilePptxBaseline(application.atom, {
      placement: baseline.composition.placement,
    });
  } catch (error) {
    return patchFailure(
      context,
      changes,
      [
        {
          code: "VECTOR180-RECONCILE-PATCH",
          severity: "error",
          message: `Applied C5 patch did not regenerate through C9: ${errorMessage(error)}`,
        },
      ],
      findingInputs,
      patchOperations,
    );
  }
  const regeneratedInspection = await inspectPptxForReconciliation(
    patchedBaseline.pptxBytes,
    patchedBaseline.map,
  );
  if (
    regeneratedInspection.inspection === undefined ||
    regeneratedInspection.diagnostics.some(isErrorDiagnostic) ||
    !(connectorClonePlan === undefined
      ? sameSupportedSlideSemantics(
          editedInspectionResult.inspection,
          regeneratedInspection.inspection,
        )
      : sameSupportedSlideSemanticsAfterConnectorClone(
          editedInspectionResult.inspection,
          regeneratedInspection.inspection,
          connectorClonePlan,
        ))
  ) {
    return patchFailure(
      context,
      changes,
      [
        {
          code: "VECTOR180-RECONCILE-PATCH",
          severity: "error",
          message:
            "Applied C5 patch did not regenerate the exact reconciled supported DrawingML semantics through C9.",
        },
        ...regeneratedInspection.diagnostics,
      ],
      findingInputs,
      patchOperations,
    );
  }

  const presentation = buildReconciliationPresentation(
    "patchable",
    findingInputs,
    patchOperations,
  );
  return Object.freeze({
    schema: "vector180-pptx-reconciliation/0.1",
    status: "patchable",
    ...context,
    changes: Object.freeze(changes),
    ...presentation,
    patch: deepFreeze(patch),
    diagnostics: Object.freeze(diagnostics),
  });
}

/** Canonical C10 public name; the shorter export remains a compatibility alias. */
export { reconcilePptx as reconcileVector180Pptx };

function compareInspections(
  baseline: PptxInspection,
  edited: PptxInspection,
  map: Vector180PptxMap,
  changes: Vector180OfficeChange[],
  operations: Vector180Operation[],
  diagnostics: Diagnostic[],
): void {
  const slidePartNames = new Set(map.slides.map((slide) => slide.partName));
  for (const partName of baseline.semanticPartNames) {
    if (slidePartNames.has(partName) || IGNORED_METADATA_PARTS.has(partName)) {
      continue;
    }
    const before = baseline.partSignatures[partName];
    const after = edited.partSignatures[partName];
    if (before !== undefined && after !== undefined && before !== after) {
      const message = `Unsupported structural change in package part "${partName}".`;
      changes.push({
        kind: "unsupported",
        scope: "package",
        field: partName,
        message,
        patchable: false,
      });
      diagnostics.push(unsupportedDiagnostic(message));
    }
  }

  for (const mapSlide of map.slides) {
    const beforeSlide = baseline.slides.find(
      (slide) => slide.partName === mapSlide.partName,
    );
    const afterSlide = edited.slides.find(
      (slide) => slide.partName === mapSlide.partName,
    );
    if (beforeSlide === undefined || afterSlide === undefined) continue;
    if (beforeSlide.skeletonSignature !== afterSlide.skeletonSignature) {
      const message = `Unsupported slide-level structure changed in "${mapSlide.partName}".`;
      changes.push({
        kind: "unsupported",
        scope: "slide",
        field: "structure",
        message,
        patchable: false,
      });
      diagnostics.push(unsupportedDiagnostic(message));
    }

    const beforeById = new Map(
      beforeSlide.objects.map((object) => [object.id, object] as const),
    );
    const afterById = new Map(
      afterSlide.objects.map((object) => [object.id, object] as const),
    );
    const missingIds = new Set(
      afterSlide.identities
        .filter((identity) => identity.status === "missing")
        .map((identity) => identity.id),
    );
    for (const mapObject of mapSlide.objects) {
      const before = beforeById.get(mapObject.id);
      const after = afterById.get(mapObject.id);
      if (before === undefined || after === undefined) continue;
      if (before.structureSignature !== after.structureSignature) {
        const message = `Object "src.${mapObject.id}" changed geometry, style, grouping, run structure, or another unsupported field.`;
        changes.push({
          kind: "unsupported",
          scope: "object",
          field: "structure",
          objectId: mapObject.id,
          message,
          patchable: false,
        });
        diagnostics.push({
          ...unsupportedDiagnostic(message),
          objectId: mapObject.id,
        });
        continue;
      }
      compareObjectSemantics(
        mapObject,
        before,
        after,
        changes,
        operations,
        diagnostics,
      );
      if (
        mapObject.kind === "text" &&
        before.text !== undefined &&
        after.text !== undefined &&
        before.text !== after.text
      ) {
        changes.push({
          kind: "text",
          objectId: mapObject.id,
          field: "text",
          oldText: before.text,
          newText: after.text,
          patchable: true,
        });
        operations.push({
          op: "set-text",
          id: mapObject.id,
          oldText: before.text,
          value: after.text,
        });
      }
    }
    planDeletions(mapSlide.objects, missingIds, changes, operations);
    planChildOrders(
      map.source.id,
      mapSlide.objects,
      afterById,
      missingIds,
      changes,
      operations,
    );
  }
}

function compareObjectSemantics(
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
  before: PptxInspectedObject,
  after: PptxInspectedObject,
  changes: Vector180OfficeChange[],
  operations: Vector180Operation[],
  diagnostics: Diagnostic[],
): void {
  if (
    before.geometry !== undefined &&
    after.geometry !== undefined &&
    !sameJson(before.geometry, after.geometry)
  ) {
    const operation = geometryOperation(mapObject, after.geometry);
    if (operation === undefined) {
      pushUnsupportedObject(
        mapObject.id,
        "geometry",
        "DrawingML geometry does not have one exact supported inverse mapping.",
        changes,
        diagnostics,
      );
    } else {
      operations.push(operation);
      changes.push(geometryChange(operation));
    }
  }

  if (
    before.style !== undefined &&
    after.style !== undefined &&
    !sameJson(before.style, after.style)
  ) {
    const oldStyle = sourceStyle(mapObject);
    const style = inverseStyle(mapObject, after.style);
    if (
      oldStyle === undefined ||
      style === undefined ||
      !styleChangeHasDirectRepresentation(mapObject, oldStyle, style)
    ) {
      pushUnsupportedObject(
        mapObject.id,
        "style",
        "DrawingML style does not map exactly to existing direct SVG presentation attributes.",
        changes,
        diagnostics,
      );
    } else {
      operations.push({
        op: "set-native-style",
        id: mapObject.id,
        oldStyle,
        style,
      });
      changes.push({
        kind: "native-style",
        field: "style",
        objectId: mapObject.id,
        oldValue: oldStyle,
        newValue: style,
        patchable: true,
      });
    }
  }
}

function geometryOperation(
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
  geometry: PptxInspectedGeometry,
): Vector180Operation | undefined {
  if (mapObject.kind === "rect" && geometry.kind === "rect") {
    const oldGeometry = sourceRectGeometry(mapObject);
    const next = inverseBounds(mapObject, geometry);
    return oldGeometry === undefined || next === undefined
      ? undefined
      : {
          op: "set-object-geometry",
          id: mapObject.id,
          oldGeometry,
          geometry: { kind: "rect", ...next },
        };
  }
  if (
    mapObject.kind === "ellipse" &&
    geometry.kind === "ellipse" &&
    mapObject.source.element === "ellipse"
  ) {
    const oldGeometry = sourceEllipseGeometry(mapObject);
    const bounds = inverseBounds(mapObject, geometry);
    if (oldGeometry === undefined || bounds === undefined) return undefined;
    return {
      op: "set-object-geometry",
      id: mapObject.id,
      oldGeometry,
      geometry: {
        kind: "ellipse",
        cx: cleanNumber(bounds.x + bounds.width / 2),
        cy: cleanNumber(bounds.y + bounds.height / 2),
        rx: cleanNumber(bounds.width / 2),
        ry: cleanNumber(bounds.height / 2),
      },
    };
  }
  if (mapObject.kind === "line" && geometry.kind === "line") {
    const oldEndpoints = sourceConnectorEndpoints(mapObject);
    const endpoints = inverseEndpoints(mapObject, geometry);
    return oldEndpoints === undefined || endpoints === undefined
      ? undefined
      : {
          op: "set-connector-endpoints",
          id: mapObject.id,
          oldEndpoints,
          endpoints,
        };
  }
  if (
    mapObject.kind === "group" &&
    geometry.kind === "group" &&
    typeof mapObject.source.attributes["transform"] === "string"
  ) {
    const before = drawingGeometry(mapObject);
    const oldTranslation = sourceGroupTranslation(mapObject);
    if (
      before?.kind !== "group" ||
      oldTranslation === undefined ||
      geometry.extCxEmu !== before.extCxEmu ||
      geometry.extCyEmu !== before.extCyEmu ||
      geometry.childOffXEmu !== before.childOffXEmu ||
      geometry.childOffYEmu !== before.childOffYEmu ||
      geometry.childExtCxEmu !== before.childExtCxEmu ||
      geometry.childExtCyEmu !== before.childExtCyEmu
    ) {
      return undefined;
    }
    const translation = {
      x: inverseCoordinate(
        geometry.offXEmu - geometry.childOffXEmu,
        "x",
        mapObject,
      ),
      y: inverseCoordinate(
        geometry.offYEmu - geometry.childOffYEmu,
        "y",
        mapObject,
      ),
    };
    return translation.x === undefined || translation.y === undefined
      ? undefined
      : {
          op: "set-group-translation",
          id: mapObject.id,
          oldTranslation,
          translation: { x: translation.x, y: translation.y },
        };
  }
  if (mapObject.kind === "text" && geometry.kind === "text") {
    const old = sourceTextFrame(mapObject);
    const frame = inverseBounds(mapObject, geometry);
    const anchorX =
      geometry.anchorXEmu === undefined
        ? undefined
        : inverseCoordinate(geometry.anchorXEmu, "x", mapObject);
    if (old === undefined || frame === undefined || anchorX === undefined) {
      return undefined;
    }
    const relativeBaseline = cleanNumber(old.oldLineAnchor.y - old.oldFrame.y);
    return {
      op: "set-text-frame",
      id: mapObject.id,
      oldFrame: old.oldFrame,
      frame,
      oldLineAnchor: old.oldLineAnchor,
      lineAnchor: {
        x: anchorX,
        y: cleanNumber(frame.y + relativeBaseline),
      },
    };
  }
  return undefined;
}

function geometryChange(
  operation: Vector180Operation,
): Vector180OfficeTypedChange {
  if (operation.op === "set-object-geometry") {
    return {
      kind: "geometry",
      field: "geometry",
      objectId: operation.id,
      oldValue: operation.oldGeometry,
      newValue: operation.geometry,
      patchable: true,
    };
  }
  if (operation.op === "set-connector-endpoints") {
    return {
      kind: "connector-endpoints",
      field: "endpoints",
      objectId: operation.id,
      oldValue: operation.oldEndpoints,
      newValue: operation.endpoints,
      patchable: true,
    };
  }
  if (operation.op === "set-group-translation") {
    return {
      kind: "group-translation",
      field: "translation",
      objectId: operation.id,
      oldValue: operation.oldTranslation,
      newValue: operation.translation,
      patchable: true,
    };
  }
  if (operation.op === "set-text-frame") {
    return {
      kind: "text-frame",
      field: "frame",
      objectId: operation.id,
      oldValue: {
        frame: operation.oldFrame,
        lineAnchor: operation.oldLineAnchor,
      },
      newValue: {
        frame: operation.frame,
        lineAnchor: operation.lineAnchor,
      },
      patchable: true,
    };
  }
  throw new Error(`Unexpected geometry operation "${operation.op}".`);
}

function planDeletions(
  mapObjects: Vector180PptxMap["slides"][number]["objects"],
  missingIds: ReadonlySet<string>,
  changes: Vector180OfficeChange[],
  operations: Vector180Operation[],
): void {
  for (const object of mapObjects) {
    if (
      !missingIds.has(object.id) ||
      (object.parentId !== null && missingIds.has(object.parentId))
    ) {
      continue;
    }
    operations.push({
      op: "delete-object",
      id: object.id,
      oldParentId: object.parentId,
      oldOrder: object.order,
    });
    changes.push({
      kind: "deletion",
      field: "object",
      objectId: object.id,
      oldValue: {
        parentId: object.parentId,
        order: object.order,
      },
      newValue: null,
      patchable: true,
    });
  }
}

function planChildOrders(
  rootId: string,
  mapObjects: Vector180PptxMap["slides"][number]["objects"],
  afterById: ReadonlyMap<string, PptxInspectedObject>,
  missingIds: ReadonlySet<string>,
  changes: Vector180OfficeChange[],
  operations: Vector180Operation[],
): void {
  const parents = new Set(mapObjects.map((object) => object.parentId));
  for (const parentId of parents) {
    const beforeChildren = mapObjects
      .filter((object) => object.parentId === parentId)
      .sort((left, right) => left.order - right.order);
    if (
      beforeChildren.length === 0 ||
      beforeChildren.some((object) => missingIds.has(object.id))
    ) {
      continue;
    }
    const afterChildren = beforeChildren
      .map((object) => afterById.get(object.id))
      .filter((object): object is PptxInspectedObject => object !== undefined)
      .sort((left, right) => left.order - right.order);
    if (
      afterChildren.length !== beforeChildren.length ||
      afterChildren.some((object) => object.parentId !== parentId)
    ) {
      continue;
    }
    const oldOrder = beforeChildren.map((object) => object.id);
    const order = afterChildren.map((object) => object.id);
    if (sameStringArray(oldOrder, order)) continue;
    const operationParentId = parentId ?? rootId;
    operations.push({
      op: "set-child-order",
      parentId: operationParentId,
      oldOrder,
      order,
    });
    changes.push({
      kind: "child-order",
      field: "order",
      parentId: operationParentId,
      oldValue: oldOrder,
      newValue: order,
      patchable: true,
    });
  }
}

function inverseBounds(
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
  geometry: Extract<
    PptxInspectedGeometry,
    { readonly kind: "rect" | "ellipse" | "text" }
  >,
): Vector180PatchBounds | undefined {
  const x = inverseCoordinate(geometry.offXEmu, "x", mapObject);
  const y = inverseCoordinate(geometry.offYEmu, "y", mapObject);
  const width = inverseLength(geometry.extCxEmu, mapObject);
  const height = inverseLength(geometry.extCyEmu, mapObject);
  return x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
    ? undefined
    : { x, y, width, height };
}

function inverseEndpoints(
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
  geometry: Extract<PptxInspectedGeometry, { readonly kind: "line" }>,
): Vector180ConnectorEndpoints | undefined {
  const x1 = inverseCoordinate(geometry.x1Emu, "x", mapObject);
  const y1 = inverseCoordinate(geometry.y1Emu, "y", mapObject);
  const x2 = inverseCoordinate(geometry.x2Emu, "x", mapObject);
  const y2 = inverseCoordinate(geometry.y2Emu, "y", mapObject);
  return x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    (x1 === x2 && y1 === y2)
    ? undefined
    : { x1, y1, x2, y2 };
}

function inverseCoordinate(
  emu: number,
  axis: "x" | "y",
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
): number | undefined {
  const scale = mapObject.composition.scale;
  const translation =
    mapObject.parentId === null
      ? axis === "x"
        ? mapObject.composition.translateX
        : mapObject.composition.translateY
      : 0;
  const value = cleanNumber((emu / EMU_PER_UNIT - translation) / scale);
  const roundTrip = (value * scale + translation) * EMU_PER_UNIT;
  return Number.isFinite(value) &&
    Number.isSafeInteger(roundTrip) &&
    roundTrip === emu
    ? value
    : undefined;
}

function inverseLength(
  emu: number,
  mapObject: Vector180PptxMap["slides"][number]["objects"][number],
): number | undefined {
  const value = cleanNumber(emu / EMU_PER_UNIT / mapObject.composition.scale);
  const roundTrip = value * mapObject.composition.scale * EMU_PER_UNIT;
  return Number.isFinite(value) &&
    Number.isSafeInteger(roundTrip) &&
    roundTrip === emu
    ? value
    : undefined;
}

function sourceRectGeometry(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): Extract<Vector180ObjectGeometry, { readonly kind: "rect" }> | undefined {
  const value = object.resolved.geometry;
  return finiteFields(value, ["x", "y", "width", "height"])
    ? {
        kind: "rect",
        x: value["x"] as number,
        y: value["y"] as number,
        width: value["width"] as number,
        height: value["height"] as number,
      }
    : undefined;
}

function sourceEllipseGeometry(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): Extract<Vector180ObjectGeometry, { readonly kind: "ellipse" }> | undefined {
  const value = object.resolved.geometry;
  return finiteFields(value, ["cx", "cy", "rx", "ry"])
    ? {
        kind: "ellipse",
        cx: value["cx"] as number,
        cy: value["cy"] as number,
        rx: value["rx"] as number,
        ry: value["ry"] as number,
      }
    : undefined;
}

function sourceConnectorEndpoints(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): Vector180ConnectorEndpoints | undefined {
  const value = object.resolved.geometry;
  return finiteFields(value, ["x1", "y1", "x2", "y2"])
    ? {
        x1: value["x1"] as number,
        y1: value["y1"] as number,
        x2: value["x2"] as number,
        y2: value["y2"] as number,
      }
    : undefined;
}

function sourceGroupTranslation(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): Vector180PatchPoint | undefined {
  const value = object.resolved.geometry;
  return finiteFields(value, ["translateX", "translateY"])
    ? {
        x: value["translateX"] as number,
        y: value["translateY"] as number,
      }
    : undefined;
}

function sourceTextFrame(
  object: Vector180PptxMap["slides"][number]["objects"][number],
):
  | {
      readonly oldFrame: Vector180PatchBounds;
      readonly oldLineAnchor: Vector180PatchPoint;
    }
  | undefined {
  const geometry = object.resolved.geometry;
  const frame = geometry["frame"];
  const lines = geometry["lines"];
  if (
    !isRecord(frame) ||
    !finiteFields(frame, ["x", "y", "width", "height"]) ||
    !Array.isArray(lines) ||
    lines.length !== 1 ||
    !isRecord(lines[0]) ||
    !finiteFields(lines[0], ["x", "y"])
  ) {
    return undefined;
  }
  return {
    oldFrame: {
      x: frame["x"] as number,
      y: frame["y"] as number,
      width: frame["width"] as number,
      height: frame["height"] as number,
    },
    oldLineAnchor: {
      x: lines[0]["x"] as number,
      y: lines[0]["y"] as number,
    },
  };
}

function drawingGeometry(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): PptxInspectedGeometry | undefined {
  const drawing = object.emitted.drawingMl;
  const transform = drawing["transform"];
  if (!isRecord(transform)) return undefined;
  if (
    object.kind === "group" &&
    finiteFields(transform, [
      "offXEmu",
      "offYEmu",
      "extCxEmu",
      "extCyEmu",
      "childOffXEmu",
      "childOffYEmu",
      "childExtCxEmu",
      "childExtCyEmu",
    ])
  ) {
    return {
      kind: "group",
      offXEmu: transform["offXEmu"] as number,
      offYEmu: transform["offYEmu"] as number,
      extCxEmu: transform["extCxEmu"] as number,
      extCyEmu: transform["extCyEmu"] as number,
      childOffXEmu: transform["childOffXEmu"] as number,
      childOffYEmu: transform["childOffYEmu"] as number,
      childExtCxEmu: transform["childExtCxEmu"] as number,
      childExtCyEmu: transform["childExtCyEmu"] as number,
    };
  }
  return undefined;
}

function sourceStyle(
  object: Vector180PptxMap["slides"][number]["objects"][number],
): Vector180ConcreteNativeStyle | undefined {
  const style = object.resolved.style;
  const fill = style["fill"];
  const stroke = style["stroke"];
  const strokeWidth = style["strokeWidth"];
  const opacity = style["opacity"];
  const fontFamily = style["fontFamily"];
  const fontSize = style["fontSize"];
  const fontWeight = style["fontWeight"];
  const fontStyle = style["fontStyle"];
  const textAnchor = style["textAnchor"];
  if (
    typeof fill !== "string" ||
    typeof stroke !== "string" ||
    !finiteNumber(strokeWidth) ||
    !finiteNumber(opacity) ||
    (fontFamily !== undefined && typeof fontFamily !== "string") ||
    (fontSize !== undefined && !finiteNumber(fontSize)) ||
    (fontWeight !== 400 && fontWeight !== 700) ||
    (fontStyle !== "normal" && fontStyle !== "italic") ||
    (textAnchor !== "start" && textAnchor !== "middle" && textAnchor !== "end")
  ) {
    return undefined;
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

function inverseStyle(
  object: Vector180PptxMap["slides"][number]["objects"][number],
  inspected: PptxInspectedStyle,
): Vector180ConcreteNativeStyle | undefined {
  const old = sourceStyle(object);
  const strokeWidth = inverseLength(inspected.strokeWidthEmu, object);
  const fontSize =
    inspected.fontSizeHundredthPoints === undefined
      ? undefined
      : inverseFontSize(inspected.fontSizeHundredthPoints, object);
  if (
    old === undefined ||
    strokeWidth === undefined ||
    (inspected.fontSizeHundredthPoints !== undefined && fontSize === undefined)
  ) {
    return undefined;
  }
  return {
    fill: inspected.fill,
    stroke: inspected.stroke,
    strokeWidth,
    opacity: inspected.opacity,
    ...(inspected.fontFamily === undefined
      ? old.fontFamily === undefined
        ? {}
        : { fontFamily: old.fontFamily }
      : { fontFamily: inspected.fontFamily }),
    ...(fontSize === undefined
      ? old.fontSize === undefined
        ? {}
        : { fontSize: old.fontSize }
      : { fontSize }),
    fontWeight: inspected.fontWeight,
    fontStyle: inspected.fontStyle,
    textAnchor: inspected.textAnchor,
  };
}

function inverseFontSize(
  value: number,
  object: Vector180PptxMap["slides"][number]["objects"][number],
): number | undefined {
  const size = cleanNumber(
    value / HUNDREDTH_POINTS_PER_UNIT / object.composition.scale,
  );
  const roundTrip = size * object.composition.scale * HUNDREDTH_POINTS_PER_UNIT;
  return Number.isFinite(size) &&
    size > 0 &&
    Number.isSafeInteger(roundTrip) &&
    roundTrip === value
    ? size
    : undefined;
}

function styleChangeHasDirectRepresentation(
  object: Vector180PptxMap["slides"][number]["objects"][number],
  oldStyle: Vector180ConcreteNativeStyle,
  style: Vector180ConcreteNativeStyle,
): boolean {
  if (typeof object.source.attributes["style"] === "string") return false;
  const attributes: Record<keyof Vector180ConcreteNativeStyle, string> = {
    fill: "fill",
    stroke: "stroke",
    strokeWidth: "stroke-width",
    opacity: "opacity",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontWeight: "font-weight",
    fontStyle: "font-style",
    textAnchor: "text-anchor",
  };
  return (
    Object.keys(attributes) as Array<keyof Vector180ConcreteNativeStyle>
  ).every(
    (key) =>
      oldStyle[key] === style[key] ||
      typeof object.source.attributes[attributes[key]] === "string",
  );
}

function pushUnsupportedObject(
  objectId: string,
  field: string,
  reason: string,
  changes: Vector180OfficeChange[],
  diagnostics: Diagnostic[],
): void {
  const message = `Object "src.${objectId}" ${reason}`;
  changes.push({
    kind: "unsupported",
    scope: "object",
    field,
    objectId,
    message,
    patchable: false,
  });
  diagnostics.push({
    ...unsupportedDiagnostic(message),
    objectId,
  });
}

function sameSupportedSlideSemantics(
  left: PptxInspection,
  right: PptxInspection,
): boolean {
  if (left.slides.length !== right.slides.length) return false;
  return left.slides.every((leftSlide) => {
    const rightSlide = right.slides.find(
      (candidate) => candidate.order === leftSlide.order,
    );
    if (
      rightSlide === undefined ||
      leftSlide.skeletonSignature !== rightSlide.skeletonSignature ||
      leftSlide.objects.length !== rightSlide.objects.length
    ) {
      return false;
    }
    const rightById = new Map(
      rightSlide.objects.map((object) => [object.id, object] as const),
    );
    return leftSlide.objects.every((leftObject) => {
      const rightObject = rightById.get(leftObject.id);
      return (
        rightObject !== undefined &&
        leftObject.element === rightObject.element &&
        leftObject.parentId === rightObject.parentId &&
        leftObject.order === rightObject.order &&
        leftObject.structureSignature === rightObject.structureSignature &&
        leftObject.text === rightObject.text &&
        sameJson(leftObject.geometry, rightObject.geometry) &&
        sameJson(leftObject.style, rightObject.style)
      );
    });
  });
}

interface ReviewedConnectorClonePlan {
  readonly duplicateId: string;
  readonly newId: string;
  readonly slidePartName: string;
  readonly baselineOccurrence: PptxIdentityOccurrence;
  readonly copiedOccurrence: PptxIdentityOccurrence;
  readonly baselineOccurrenceFingerprintSha256: string;
  readonly copiedOccurrenceFingerprintSha256: string;
  readonly operation: CloneConnectorOperation;
}

function planReviewedConnectorClone(
  source: Vector180Document,
  map: Vector180PptxMap,
  comparisonBaseline: PptxInspection,
  edited: PptxInspection,
  resolution: Vector180ReconcileResolution,
  context: ResultContext,
  unresolvedReportSha256: string,
  unresolvedFindings: readonly Vector180ReconciliationFinding[],
): ReviewedConnectorClonePlan {
  const boundFinding = unresolvedFindings.find(
    (finding) => finding.id === resolution.findingId,
  );
  if (
    resolution.reconciliationReportSha256 !== unresolvedReportSha256 ||
    resolution.classification !== "one-baseline-equivalent-copy" ||
    boundFinding === undefined ||
    boundFinding.code !== "VECTOR180-RECONCILE-DUPLICATE-ID" ||
    boundFinding.scope.objectId !== resolution.duplicateId
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution report digest, finding ID, classification, and duplicate identity must bind one current unresolved connector-copy finding.",
    );
  }
  if (
    resolution.sourceSha256 !== context.sourceSha256 ||
    resolution.baselineMapSha256 !== context.baselineMapSha256 ||
    resolution.editedPptxSha256 !== context.editedPptxSha256 ||
    resolution.comparisonPptxSha256 !== comparisonBaseline.pptxSha256
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution hashes do not exactly match the current source, canonical map, edited PPTX, and authenticated comparison PPTX.",
    );
  }
  const duplicateEntries = edited.slides.flatMap((slide) =>
    slide.identities
      .filter((identity) => identity.status === "duplicate")
      .map((identity) => ({ slide, identity })),
  );
  if (
    duplicateEntries.length !== 1 ||
    duplicateEntries[0]?.identity.id !== resolution.duplicateId
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution requires exactly one duplicated mapped identity, and duplicateId must name it.",
    );
  }
  const duplicateEntry = duplicateEntries[0];
  const identity = duplicateEntry.identity;
  if (identity.occurrences.length !== 2) {
    throw new Vector180ReconcileResolutionError(
      `Mapped identity "${resolution.duplicateId}" must have exactly two occurrences.`,
    );
  }
  const mapSlide = map.slides.find(
    (slide) => slide.partName === duplicateEntry.slide.partName,
  );
  const mapObject = mapSlide?.objects.find(
    (object) => object.id === resolution.duplicateId,
  );
  if (
    mapSlide === undefined ||
    mapObject === undefined ||
    mapObject.kind !== "line" ||
    mapObject.emitted.element !== "p:cxnSp"
  ) {
    throw new Vector180ReconcileResolutionError(
      "The duplicated mapped identity is not one supported native straight connector.",
    );
  }
  const baselineSlide = comparisonBaseline.slides.find(
    (slide) => slide.partName === mapSlide.partName,
  );
  if (
    baselineSlide === undefined ||
    baselineSlide.inventoryNormalizedSkeletonSignature !==
      duplicateEntry.slide.inventoryNormalizedSkeletonSignature
  ) {
    throw new Vector180ReconcileResolutionError(
      "The edited slide contains structure outside the one reviewed visible-object insertion.",
    );
  }
  const baselineIdentity = baselineSlide?.identities.find(
    (candidate) => candidate.id === resolution.duplicateId,
  );
  if (
    baselineIdentity?.status !== "unique" ||
    baselineIdentity.occurrences.length !== 1
  ) {
    throw new Vector180ReconcileResolutionError(
      "The authenticated comparison PPTX does not contain one unique template occurrence.",
    );
  }
  const baselineOccurrence = baselineIdentity.occurrences[0]!;
  const baselineFingerprintSha256 =
    connectorOccurrenceFingerprintSha256(baselineOccurrence);
  if (
    baselineFingerprintSha256 === undefined ||
    resolution.baselineOccurrenceFingerprintSha256 !== baselineFingerprintSha256
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution baselineOccurrenceFingerprintSha256 is stale or the template is not a strictly supported connector occurrence.",
    );
  }
  const occurrenceFingerprints = identity.occurrences.map((occurrence) => ({
    occurrence,
    sha256: connectorOccurrenceFingerprintSha256(occurrence),
  }));
  if (occurrenceFingerprints.some((entry) => entry.sha256 === undefined)) {
    throw new Vector180ReconcileResolutionError(
      "Both duplicate occurrences must parse as complete supported native straight connectors.",
    );
  }
  const baselineMatches = occurrenceFingerprints.filter(
    (entry) => entry.sha256 === baselineFingerprintSha256,
  );
  if (baselineMatches.length !== 1) {
    throw new Vector180ReconcileResolutionError(
      "Exactly one duplicate occurrence must be structurally and semantically baseline-equivalent; zero or two matches are ambiguous.",
    );
  }
  const matchedBaselineOccurrence = baselineMatches[0]!.occurrence;
  const copiedEntry = occurrenceFingerprints.find(
    (entry) => entry.occurrence !== matchedBaselineOccurrence,
  )!;
  if (
    copiedEntry.sha256 === undefined ||
    copiedEntry.sha256 !== resolution.copiedOccurrenceFingerprintSha256
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution copiedOccurrenceFingerprintSha256 does not exactly match the non-baseline occurrence.",
    );
  }
  if (
    matchedBaselineOccurrence.parentId !== mapObject.parentId ||
    copiedEntry.occurrence.parentId !== mapObject.parentId
  ) {
    throw new Vector180ReconcileResolutionError(
      "The template and copied connector must remain in the same mapped source parent.",
    );
  }
  if (
    map.source.id === resolution.newId ||
    mapSlide.objects.some((object) => object.id === resolution.newId) ||
    source.index.objects.has(resolution.newId)
  ) {
    throw new Vector180ReconcileResolutionError(
      `Resolution newId "${resolution.newId}" is already used by canonical source.`,
    );
  }

  const oldEndpoints = sourceConnectorEndpoints(mapObject);
  const oldStyle = sourceStyle(mapObject);
  const fromId = mapObject.source.attributes["data-vector180-from"];
  const toId = mapObject.source.attributes["data-vector180-to"];
  const copiedGeometry = copiedEntry.occurrence.geometry;
  const copiedStyle = copiedEntry.occurrence.style;
  const endpoints =
    copiedGeometry?.kind === "line"
      ? inverseEndpoints(mapObject, copiedGeometry)
      : undefined;
  const style =
    copiedStyle === undefined
      ? undefined
      : inverseStyle(mapObject, copiedStyle);
  if (
    oldEndpoints === undefined ||
    oldStyle === undefined ||
    typeof fromId !== "string" ||
    typeof toId !== "string" ||
    endpoints === undefined ||
    style === undefined ||
    !styleChangeHasDirectRepresentation(mapObject, oldStyle, style)
  ) {
    throw new Vector180ReconcileResolutionError(
      "The copied connector endpoints/style do not have one exact source-unit inverse over the template's direct SVG representation.",
    );
  }
  const existingIds = new Set(mapSlide.objects.map((object) => object.id));
  if (
    !existingIds.has(resolution.connector.fromId) ||
    !existingIds.has(resolution.connector.toId)
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution connector.fromId and connector.toId must explicitly name existing mapped source objects.",
    );
  }
  const connector = {
    fromId: resolution.connector.fromId,
    toId: resolution.connector.toId,
    endpoints,
    style,
  };
  if (!sameJson(resolution.connector, connector)) {
    throw new Vector180ReconcileResolutionError(
      "Resolution connector endpoints/style do not exactly match the copied Office occurrence.",
    );
  }
  const parentId = mapObject.parentId ?? map.source.id;
  const oldOrder = mapSlide.objects
    .filter((object) => object.parentId === mapObject.parentId)
    .sort((left, right) => left.order - right.order)
    .map((object) => object.id);
  const order = deriveReviewedCloneOrder(
    mapSlide.objects,
    duplicateEntry.slide,
    mapObject.parentId,
    resolution.duplicateId,
    resolution.newId,
    matchedBaselineOccurrence,
    copiedEntry.occurrence,
  );
  if (
    resolution.parentId !== parentId ||
    !sameStringArray(resolution.oldOrder, oldOrder) ||
    !sameStringArray(resolution.order, order)
  ) {
    throw new Vector180ReconcileResolutionError(
      "Resolution parentId/oldOrder/order does not exactly match the source parent and reviewed Office insertion position.",
    );
  }
  const operation: CloneConnectorOperation = {
    op: "clone-connector",
    templateId: resolution.duplicateId,
    newId: resolution.newId,
    parentId,
    oldOrder,
    order,
    oldConnector: {
      fromId,
      toId,
      endpoints: oldEndpoints,
      style: oldStyle,
    },
    connector,
  };
  return Object.freeze({
    duplicateId: resolution.duplicateId,
    newId: resolution.newId,
    slidePartName: mapSlide.partName,
    baselineOccurrence: matchedBaselineOccurrence,
    copiedOccurrence: copiedEntry.occurrence,
    baselineOccurrenceFingerprintSha256: baselineFingerprintSha256,
    copiedOccurrenceFingerprintSha256: copiedEntry.sha256,
    operation: deepFreeze(operation),
  });
}

function deriveReviewedCloneOrder(
  mapObjects: Vector180PptxMap["slides"][number]["objects"],
  editedSlide: PptxInspection["slides"][number],
  parentId: string | null,
  duplicateId: string,
  newId: string,
  baselineOccurrence: PptxIdentityOccurrence,
  copiedOccurrence: PptxIdentityOccurrence,
): string[] {
  const siblings = mapObjects
    .filter((object) => object.parentId === parentId)
    .sort((left, right) => left.order - right.order);
  const events: Array<{ readonly id: string; readonly order: number }> = [];
  for (const sibling of siblings) {
    if (sibling.id === duplicateId) {
      events.push({ id: sibling.id, order: baselineOccurrence.order });
      continue;
    }
    const identity = editedSlide.identities.find(
      (candidate) => candidate.id === sibling.id,
    );
    if (
      identity?.status !== "unique" ||
      identity.occurrences.length !== 1 ||
      identity.occurrences[0]?.parentId !== parentId
    ) {
      throw new Vector180ReconcileResolutionError(
        "Every existing sibling must remain one unique object in the same parent before a reviewed insertion can be recovered.",
      );
    }
    events.push({ id: sibling.id, order: identity.occurrences[0].order });
  }
  events.push({ id: newId, order: copiedOccurrence.order });
  const ordered = [...events].sort(
    (left, right) => left.order - right.order || compareText(left.id, right.id),
  );
  if (
    new Set(ordered.map((entry) => entry.order)).size !== ordered.length ||
    ordered.some((entry, index) => entry.order !== index)
  ) {
    throw new Vector180ReconcileResolutionError(
      "Reviewed connector insertion order is not one complete unambiguous direct-child sequence.",
    );
  }
  const oldOrder = siblings.map((object) => object.id);
  const order = ordered.map((entry) => entry.id);
  if (
    !sameStringArray(
      order.filter((id) => id !== newId),
      oldOrder,
    )
  ) {
    throw new Vector180ReconcileResolutionError(
      "Reviewed connector insertion also reorders existing siblings.",
    );
  }
  return order;
}

function sameSupportedSlideSemanticsAfterConnectorClone(
  edited: PptxInspection,
  regenerated: PptxInspection,
  plan: ReviewedConnectorClonePlan,
): boolean {
  if (edited.slides.length !== regenerated.slides.length) return false;
  return regenerated.slides.every((regeneratedSlide) => {
    const editedSlide = edited.slides.find(
      (slide) => slide.partName === regeneratedSlide.partName,
    );
    if (
      editedSlide === undefined ||
      editedSlide.inventoryNormalizedSkeletonSignature !==
        regeneratedSlide.inventoryNormalizedSkeletonSignature ||
      regeneratedSlide.identities.some(
        (identity) => identity.status !== "unique",
      )
    ) {
      return false;
    }
    const editedOccurrenceCount = editedSlide.identities.reduce(
      (sum, identity) => sum + identity.occurrences.length,
      0,
    );
    if (editedOccurrenceCount !== regeneratedSlide.objects.length) return false;
    const editedById = new Map(
      editedSlide.objects.map((object) => [object.id, object] as const),
    );
    return regeneratedSlide.objects.every((regeneratedObject) => {
      if (
        regeneratedSlide.partName === plan.slidePartName &&
        regeneratedObject.id === plan.duplicateId
      ) {
        return sameOccurrenceAndRegeneratedObject(
          plan.baselineOccurrence,
          regeneratedObject,
        );
      }
      if (
        regeneratedSlide.partName === plan.slidePartName &&
        regeneratedObject.id === plan.newId
      ) {
        return sameOccurrenceAndRegeneratedObject(
          plan.copiedOccurrence,
          regeneratedObject,
        );
      }
      const editedObject = editedById.get(regeneratedObject.id);
      return (
        editedObject !== undefined &&
        sameInspectedObjectSemantics(editedObject, regeneratedObject)
      );
    });
  });
}

function sameOccurrenceAndRegeneratedObject(
  occurrence: PptxIdentityOccurrence,
  regenerated: PptxInspectedObject,
): boolean {
  return (
    occurrence.element === regenerated.element &&
    occurrence.parentId === regenerated.parentId &&
    occurrence.order === regenerated.order &&
    occurrence.identityNormalizedStructureSignature ===
      regenerated.identityNormalizedStructureSignature &&
    sameJson(occurrence.geometry, regenerated.geometry) &&
    sameJson(occurrence.style, regenerated.style)
  );
}

function sameInspectedObjectSemantics(
  left: PptxInspectedObject,
  right: PptxInspectedObject,
): boolean {
  return (
    left.element === right.element &&
    left.parentId === right.parentId &&
    left.order === right.order &&
    left.structureSignature === right.structureSignature &&
    left.text === right.text &&
    sameJson(left.geometry, right.geometry) &&
    sameJson(left.style, right.style)
  );
}

function finiteFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => finiteNumber(value[field]));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cleanNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function basicBaselineMap(value: unknown): value is Vector180PptxMap {
  if (
    !isRecord(value) ||
    value["schema"] !== "vector180-pptx-map/0.1" ||
    value["compiler"] !== "office180-vector180-pptx-baseline/0.1" ||
    value["resolvedSchema"] !== "vector180-resolved-deck/0.1" ||
    value["sourceResolvedSchema"] !== "vector180-resolved-atom/0.1"
  ) {
    return false;
  }
  const source = value["source"];
  const composition = value["composition"];
  const pptx = value["pptx"];
  const slides = value["slides"];
  if (
    !isRecord(source) ||
    source["family"] !== "vector180" ||
    source["kind"] !== "atom" ||
    source["profile"] !== "0.1" ||
    typeof source["id"] !== "string" ||
    typeof source["sha256"] !== "string" ||
    !SHA256_PATTERN.test(source["sha256"]) ||
    (source["metadataSha256"] !== undefined &&
      (typeof source["metadataSha256"] !== "string" ||
        !SHA256_PATTERN.test(source["metadataSha256"]))) ||
    !isRecord(composition) ||
    typeof composition["scale"] !== "number" ||
    !Number.isFinite(composition["scale"]) ||
    composition["scale"] <= 0 ||
    typeof composition["translateX"] !== "number" ||
    !Number.isFinite(composition["translateX"]) ||
    typeof composition["translateY"] !== "number" ||
    !Number.isFinite(composition["translateY"]) ||
    typeof composition["composedDeckSha256"] !== "string" ||
    !SHA256_PATTERN.test(composition["composedDeckSha256"]) ||
    !isRecord(composition["placement"]) ||
    !validPlacement(composition["placement"]) ||
    (composition["placement"]["policy"] === "identity" &&
      composition["scale"] !== 1) ||
    !isRecord(pptx) ||
    typeof pptx["sha256"] !== "string" ||
    !SHA256_PATTERN.test(pptx["sha256"]) ||
    !Array.isArray(pptx["partNames"]) ||
    !pptx["partNames"].every((name) => typeof name === "string") ||
    !Array.isArray(slides) ||
    slides.length !== 1
  ) {
    return false;
  }
  return true;
}

function validPlacement(value: Record<string, unknown>): boolean {
  return (
    typeof value["slideId"] === "string" &&
    (value["policy"] === "identity" ||
      value["policy"] === "uniform-scale-translate") &&
    ["x", "y", "width", "height"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) &&
    (value["width"] as number) > 0 &&
    (value["height"] as number) > 0
  );
}

function reconciliationFindingInputs(
  baseline: PptxInspection,
  edited: PptxInspection,
  changes: readonly Vector180OfficeChange[],
  operations: readonly Vector180PatchOperation[],
  diagnostics: readonly Diagnostic[],
): readonly Vector180ReconciliationFindingInput[] {
  const result: Vector180ReconciliationFindingInput[] = [];
  const operationIds = operations.map(operationId);

  for (const normalization of edited.normalizations) {
    const baselineRaw = baseline.rawPartSignatures[normalization.partName];
    const editedRaw = edited.rawPartSignatures[normalization.partName];
    if (
      baselineRaw === editedRaw &&
      baseline.partSha256[normalization.partName] ===
        edited.partSha256[normalization.partName]
    ) {
      continue;
    }
    result.push({
      disposition: "auto-fixable",
      effect: "normalization",
      code: "VECTOR180-RECONCILE-NORMALIZED",
      title: normalizationTitle(normalization.ruleId),
      message: normalization.message,
      occurrenceCount: normalization.occurrenceCount,
      scope: {
        kind: "part",
        partName: normalization.partName,
      },
      evidence: [
        {
          kind: "digest",
          ...(baseline.partSha256[normalization.partName] === undefined
            ? {}
            : {
                baselineSha256: baseline.partSha256[normalization.partName],
              }),
          ...(edited.partSha256[normalization.partName] === undefined
            ? {}
            : { editedSha256: edited.partSha256[normalization.partName] }),
        },
        {
          kind: "normalization-proof",
          predicates: normalization.predicates,
        },
      ],
      normalizationRule: {
        id: normalization.ruleId,
        proofStatus: "proven",
        semanticScope: normalization.semanticScope,
      },
      suggestedResolution: {
        summary:
          "No source edit is required; retain the evidence and compare the canonical semantic form.",
        options: [
          {
            id: "accept-proven-normalization",
            description:
              "Accept this narrowly proven serialization normalization.",
            consequence:
              "The exact edited PPTX remains untouched while C10 excludes this rewrite from the source delta.",
          },
        ],
      },
      blocks: [],
    });
  }

  const objectNormalizationGroups = new Map<
    string,
    {
      readonly ruleId: string;
      readonly partName: string;
      readonly semanticScope: string;
      readonly message: string;
      readonly objectIds: string[];
    }
  >();
  for (const slide of edited.slides) {
    for (const object of slide.objects) {
      for (const normalization of object.normalizations) {
        const baselineObject = baseline.slides
          .find((candidate) => candidate.partName === slide.partName)
          ?.objects.find((candidate) => candidate.id === object.id);
        if (
          baselineObject === undefined ||
          baselineObject.structureSignature !== object.structureSignature
        ) {
          continue;
        }
        const key = `${normalization.ruleId}\0${normalization.partName}`;
        const group = objectNormalizationGroups.get(key) ?? {
          ruleId: normalization.ruleId,
          partName: normalization.partName,
          semanticScope: normalization.semanticScope,
          message: normalization.message,
          objectIds: [],
        };
        group.objectIds.push(object.id);
        objectNormalizationGroups.set(key, group);
      }
    }
  }
  for (const group of objectNormalizationGroups.values()) {
    result.push({
      disposition: "auto-fixable",
      effect: "normalization",
      code: "VECTOR180-RECONCILE-NORMALIZED",
      title: "End-paragraph insertion marker omitted",
      message: group.message,
      occurrenceCount: group.objectIds.length,
      scope: { kind: "part", partName: group.partName },
      evidence: [
        {
          kind: "normalization-proof",
          edited: { objectIds: [...group.objectIds].sort(compareText) },
          predicates: [
            {
              name: "single-complete-existing-run",
              passed: true,
              expected: group.objectIds.length,
              actual: group.objectIds.length,
            },
            {
              name: "normalized-structure-equals-baseline",
              passed: true,
              expected: true,
              actual: true,
            },
          ],
        },
      ],
      normalizationRule: {
        id: group.ruleId,
        proofStatus: "proven",
        semanticScope: group.semanticScope,
      },
      suggestedResolution: {
        summary:
          "No source edit is required for existing rendered text; future PowerPoint insertion defaults are outside this equivalence.",
        options: [
          {
            id: "accept-existing-content-equivalence",
            description:
              "Accept the omitted marker for the complete existing run.",
            consequence:
              "C9 regeneration restores the explicit end marker without changing the existing text run.",
          },
        ],
      },
      blocks: [],
    });
  }

  for (const change of changes) {
    const operation = matchingOperation(change, operations);
    const candidateOperationId =
      operation === undefined ? undefined : operationId(operation);
    if (change.kind === "unsupported") {
      result.push({
        disposition: "review-required",
        effect: "source-change",
        code: "VECTOR180-RECONCILE-UNSUPPORTED",
        title: `Unsupported ${change.field} change`,
        message: change.message,
        scope: {
          kind: change.scope,
          ...(change.objectId === undefined
            ? {}
            : { objectId: change.objectId }),
          ...(change.scope === "package"
            ? { partName: change.field }
            : { field: change.field }),
        },
        evidence: [{ kind: "semantic-delta", edited: change.message }],
        suggestedResolution: {
          summary:
            "Review or undo the unsupported Office edit, or author the intended structure explicitly in canonical Vector180 source.",
          options: [
            {
              id: "undo-and-rerun",
              description:
                "Undo the unsupported PowerPoint structure and rerun reconciliation.",
              consequence:
                "Remaining supported changes may become one validated patch.",
            },
            {
              id: "author-in-source",
              description:
                "Represent the intended change explicitly in canonical Vector180 source.",
              consequence:
                "Compile a new authenticated branch; do not infer source structure from this Office object.",
            },
          ],
        },
        blocks: operationIds,
      });
      continue;
    }
    const oldValue = change.kind === "text" ? change.oldText : change.oldValue;
    const newValue = change.kind === "text" ? change.newText : change.newValue;
    result.push({
      disposition: "auto-fixable",
      effect: "source-change",
      code: "VECTOR180-RECONCILE-SUPPORTED-CHANGE",
      title: supportedChangeTitle(change),
      message: supportedChangeMessage(change),
      scope: {
        kind: "object",
        ...(change.objectId === undefined ? {} : { objectId: change.objectId }),
        ...(!("parentId" in change) || change.parentId === undefined
          ? {}
          : { objectId: change.parentId }),
        field: change.field,
      },
      evidence: [
        {
          kind: "semantic-delta",
          baseline: oldValue,
          edited: newValue,
        },
      ],
      suggestedResolution: {
        summary:
          "Apply only as part of the complete old-value-preconditioned C5 transaction after every blocker is resolved.",
        options: [
          {
            id: "apply-validated-transaction",
            description:
              "Review the typed operation, run patch validation, and write a new source output.",
            consequence:
              "The edited PPTX and canonical input remain unchanged; regenerated C9 semantics must match.",
          },
        ],
      },
      ...(candidateOperationId === undefined ? {} : { candidateOperationId }),
      blocks: [],
    });
  }

  const representedMessages = new Set(
    changes
      .filter(
        (change): change is Vector180OfficeUnsupportedChange =>
          change.kind === "unsupported",
      )
      .map((change) => change.message),
  );
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.code === "VECTOR180-RECONCILE-DUPLICATE-ID" &&
      diagnostic.objectId !== undefined
    ) {
      const identity = findIdentity(edited, diagnostic.objectId, "duplicate");
      result.push(
        duplicateIdentityFinding(
          diagnostic,
          findIdentity(baseline, diagnostic.objectId, "unique"),
          identity,
          operationIds,
          baseline.pptxSha256,
        ),
      );
      continue;
    }
    if (representedMessages.has(diagnostic.message)) continue;
    if (
      diagnostic.code === "VECTOR180-RECONCILE-UNSUPPORTED" &&
      result.some(
        (finding) =>
          finding.code === diagnostic.code &&
          finding.scope.objectId === diagnostic.objectId &&
          finding.message.includes(diagnostic.objectId ?? "\u0000"),
      )
    ) {
      continue;
    }
    result.push(diagnosticFindingInput(diagnostic, operationIds));
  }
  return Object.freeze(result);
}

function duplicateIdentityFinding(
  diagnostic: Diagnostic,
  baselineIdentity: PptxIdentityMatch | undefined,
  identity: PptxIdentityMatch | undefined,
  operationIds: readonly string[],
  comparisonPptxSha256: string,
): Vector180ReconciliationFindingInput {
  const baselineOccurrence = baselineIdentity?.occurrences[0];
  const baselineOccurrenceFingerprintSha256 =
    baselineOccurrence === undefined
      ? undefined
      : connectorOccurrenceFingerprintSha256(baselineOccurrence);
  const editedOccurrenceFingerprintSha256s =
    identity?.occurrences.map((occurrence) =>
      connectorOccurrenceFingerprintSha256(occurrence),
    ) ?? [];
  const resolutionGuidance = connectorDuplicateResolutionGuidance(
    baselineOccurrenceFingerprintSha256,
    editedOccurrenceFingerprintSha256s,
  );
  return {
    disposition: "refused",
    effect: "trust",
    code: diagnostic.code,
    title: "Duplicate stable Office identity",
    message: diagnostic.message,
    occurrenceCount: identity?.occurrences.length ?? 2,
    scope: {
      kind: "object",
      ...(diagnostic.objectId === undefined
        ? {}
        : { objectId: diagnostic.objectId }),
    },
    evidence: [
      {
        kind: "identity-occurrence",
        baseline: {
          requiredOccurrenceCount: 1,
          comparisonPptxSha256,
          ...(baselineOccurrence === undefined
            ? {}
            : {
                occurrenceFingerprintSha256:
                  baselineOccurrenceFingerprintSha256,
              }),
        },
        edited: {
          occurrenceCount: identity?.occurrences.length ?? 0,
          occurrences:
            identity?.occurrences.map((occurrence) => ({
              element: occurrence.element,
              numericId: occurrence.numericId,
              parentId: occurrence.parentId,
              order: occurrence.order,
              geometry: occurrence.geometry,
              style: occurrence.style,
              connections: occurrence.connections,
              hasCreationId: occurrence.hasCreationId,
              semanticError: occurrence.semanticError,
              semanticFingerprintSha256:
                connectorOccurrenceFingerprintSha256(occurrence),
            })) ?? [],
          numericIdsAreAuthority: false,
          resolutionAssessment: resolutionGuidance.assessment,
        },
      },
    ],
    suggestedResolution: {
      summary: resolutionGuidance.summary,
      options: resolutionGuidance.options,
    },
    blocks: operationIds,
  };
}

function reviewedConnectorCloneFinding(
  plan: ReviewedConnectorClonePlan,
): Vector180ReconciliationFindingInput {
  const candidateOperationId = operationId(plan.operation);
  return {
    disposition: "auto-fixable",
    effect: "source-change",
    code: "VECTOR180-RECONCILE-REVIEWED-CONNECTOR-CLONE",
    title: "Reviewed connector copy has one exact source inverse",
    message: `The copied occurrence of "src.${plan.duplicateId}" is explicitly assigned fresh stable ID "${plan.newId}" and maps to one C5 clone-connector operation.`,
    scope: {
      kind: "object",
      objectId: plan.duplicateId,
      field: "connector-copy",
    },
    evidence: [
      {
        kind: "identity-occurrence",
        baseline: {
          occurrenceFingerprintSha256: plan.baselineOccurrenceFingerprintSha256,
          parentId: plan.baselineOccurrence.parentId,
          order: plan.baselineOccurrence.order,
        },
        edited: {
          newId: plan.newId,
          occurrenceFingerprintSha256: plan.copiedOccurrenceFingerprintSha256,
          parentId: plan.copiedOccurrence.parentId,
          order: plan.copiedOccurrence.order,
          connector: plan.operation.connector,
        },
      },
    ],
    suggestedResolution: {
      summary:
        "Apply only through the complete hash-bound C5 0.3 transaction and retain C9 regeneration equality as the acceptance proof.",
      options: [
        {
          id: "apply-reviewed-connector-clone",
          description:
            "Apply the validated clone-connector operation with the reviewed fresh stable ID.",
          consequence:
            "Canonical source gains exactly one same-parent connector; neither Office input nor the original source is overwritten.",
        },
      ],
    },
    candidateOperationId,
    blocks: [],
  };
}

function diagnosticFindingInput(
  diagnostic: Diagnostic,
  operationIds: readonly string[] = [],
): Vector180ReconciliationFindingInput {
  const refused =
    TRUST_DIAGNOSTIC_CODES.has(diagnostic.code) ||
    diagnostic.code === "VECTOR180-RECONCILE-INVALID-SOURCE" ||
    diagnostic.code === "VECTOR180-RECONCILE-INVALID-BASELINE" ||
    diagnostic.code === "VECTOR180-RECONCILE-STALE-SOURCE" ||
    diagnostic.code === "VECTOR180-RECONCILE-PATCH";
  return {
    disposition: refused ? "refused" : "review-required",
    effect: refused ? "trust" : "source-change",
    code: diagnostic.code,
    title: refused
      ? "Reconciliation trust check failed"
      : "Office change requires review",
    message: diagnostic.message,
    scope: {
      kind: diagnostic.objectId === undefined ? "package" : "object",
      ...(diagnostic.slideId === undefined
        ? {}
        : { slideId: diagnostic.slideId }),
      ...(diagnostic.objectId === undefined
        ? {}
        : { objectId: diagnostic.objectId }),
    },
    evidence: [
      {
        kind: "semantic-delta",
        edited: {
          code: diagnostic.code,
          severity: diagnostic.severity,
        },
      },
    ],
    suggestedResolution: {
      summary: refused
        ? "Restore authenticated lineage and unique stable identity before attempting any source patch."
        : "Review the exact Office structure and either undo it or represent it explicitly in canonical source.",
      options: [
        {
          id: refused ? "restore-trust-boundary" : "review-office-delta",
          description: refused
            ? "Supply the exact authenticated baseline and unique mapped identities."
            : "Review or undo the unsupported Office delta, then rerun.",
          consequence: "No patch is emitted while this finding remains.",
        },
      ],
    },
    blocks: operationIds,
  };
}

function findIdentity(
  inspection: PptxInspection,
  objectId: string,
  status: PptxIdentityMatch["status"],
): PptxIdentityMatch | undefined {
  return inspection.slides
    .flatMap((slide) => slide.identities)
    .find((identity) => identity.id === objectId && identity.status === status);
}

function matchingOperation(
  change: Vector180OfficeChange,
  operations: readonly Vector180PatchOperation[],
): Vector180PatchOperation | undefined {
  if (change.kind === "unsupported") return undefined;
  const objectId = change.objectId;
  const parentId = "parentId" in change ? change.parentId : undefined;
  return operations.find((operation) => {
    if (
      "id" in operation &&
      objectId !== undefined &&
      operation.id === objectId
    ) {
      return true;
    }
    return (
      operation.op === "set-child-order" &&
      parentId !== undefined &&
      operation.parentId === parentId
    );
  });
}

function normalizationTitle(ruleId: string): string {
  const titles: Record<string, string> = {
    "vector180-c10/content-type-set/1":
      "Content-type declaration order normalized",
    "vector180-c10/relationship-graph/1":
      "Relationship IDs and order normalized",
    "vector180-c10/relationship-reference/1":
      "Relationship references resolved semantically",
    "vector180-c10/view-properties-inert/1":
      "PowerPoint view state excluded from source semantics",
    "vector180-c10/table-styles-inert/1":
      "Empty default table styles excluded from current content",
    "vector180-c10/slide-size-preset-omitted/1":
      "Optional 16:9 preset label restored semantically",
    "vector180-c10/root-zero-group-transform/1":
      "All-zero root transform normalized",
    "vector180-c10/theme-empty-defaults/1": "Empty theme defaults normalized",
    "vector180-c10/presentation-property-defaults/1":
      "Inert image/chart defaults normalized",
    "vector180-c10/generated-metadata/1":
      "Generated Office metadata excluded from source authority",
  };
  return titles[ruleId] ?? "Proven Office serialization normalization";
}

function supportedChangeTitle(
  change: Exclude<Vector180OfficeChange, Vector180OfficeUnsupportedChange>,
): string {
  return change.kind === "text"
    ? "Direct text change"
    : `${change.kind.replaceAll("-", " ")} change`;
}

function supportedChangeMessage(
  change: Exclude<Vector180OfficeChange, Vector180OfficeUnsupportedChange>,
): string {
  const target =
    change.objectId ??
    ("parentId" in change ? change.parentId : undefined) ??
    "<unknown>";
  return `Mapped object "${target}" has one exact supported ${change.field} delta.`;
}

function safeSerializeMap(map: unknown): string | undefined {
  try {
    return serializeVector180PptxMap(map as Vector180PptxMap);
  } catch {
    return undefined;
  }
}

function patchFailure(
  context: ResultContext,
  changes: readonly Vector180OfficeChange[],
  related: readonly Diagnostic[],
  findingInputs: readonly Vector180ReconciliationFindingInput[] = [],
  operations: readonly Vector180PatchOperation[] = [],
): Vector180ReconciliationResult {
  return refused(
    context,
    "VECTOR180-RECONCILE-PATCH",
    "Proposed typed operations did not pass exact current C5 validation, application, and C9 regeneration.",
    related,
    changes,
    findingInputs,
    operations,
  );
}

interface ResultContext {
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly nativeBaselinePptxSha256?: string;
}

function refused(
  context: ResultContext,
  code: string,
  message: string,
  related: readonly Diagnostic[] = [],
  changes: readonly Vector180OfficeChange[] = [],
  findingInputs: readonly Vector180ReconciliationFindingInput[] = [],
  operations: readonly Vector180PatchOperation[] = [],
): Vector180ReconciliationResult {
  const diagnostic: Diagnostic = {
    code,
    severity: "error",
    message,
    ...(related.length === 0
      ? {}
      : {
          related: related.map((entry) => ({
            message: `${entry.code}: ${entry.message}`,
            ...(entry.range === undefined ? {} : { range: entry.range }),
          })),
        }),
  };
  return resultWithDiagnostics(
    "refused",
    context,
    changes,
    [diagnostic],
    findingInputs.length === 0
      ? [diagnosticFindingInput(diagnostic)]
      : findingInputs,
    operations,
  );
}

function resultWithDiagnostics(
  status: Vector180ReconciliationStatus,
  context: ResultContext,
  changes: readonly Vector180OfficeChange[],
  diagnostics: readonly Diagnostic[],
  findingInputs: readonly Vector180ReconciliationFindingInput[] = [],
  operations: readonly Vector180PatchOperation[] = [],
): Vector180ReconciliationResult {
  const presentation = buildReconciliationPresentation(
    status,
    findingInputs.length === 0
      ? diagnostics.map((diagnostic) => diagnosticFindingInput(diagnostic))
      : findingInputs,
    operations,
  );
  return Object.freeze({
    schema: "vector180-pptx-reconciliation/0.1",
    status,
    ...context,
    changes: Object.freeze([...changes]),
    ...presentation,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function unsupportedDiagnostic(message: string): Diagnostic {
  return {
    code: "VECTOR180-RECONCILE-UNSUPPORTED",
    severity: "error",
    message,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(text: string): string {
  return sha256(new TextEncoder().encode(text));
}

function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "error" || diagnostic.severity === "fatal";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
