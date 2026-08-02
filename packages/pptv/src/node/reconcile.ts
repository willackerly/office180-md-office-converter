/**
 * Baseline-aware, typed native-object PPTX reconciliation.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.2
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.0
 */

import { createHash } from "node:crypto";

import type {
  Diagnostic,
  PptvConcreteNativeStyle,
  PptvConnectorEndpoints,
  PptvDocument,
  PptvObjectGeometry,
  PptvOperation,
  PptvPatch,
  PptvPatchBounds,
  PptvPatchPoint,
} from "../core/types.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import {
  compilePptxBaseline,
  PptvPptxBaselineCompileError,
  serializePptvPptxMap,
  type PptvPptxMap,
} from "./pptx-baseline.js";
import {
  inspectPptxForReconciliation,
  type PptxInspection,
  type PptxInspectedGeometry,
  type PptxInspectedObject,
  type PptxInspectedStyle,
} from "./pptx-inspect.js";

const INVALID_MAP_SHA256 = "0".repeat(64);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EMU_PER_UNIT = 7_620;
const HUNDREDTH_POINTS_PER_UNIT = 60;
const TRUST_DIAGNOSTIC_CODES = new Set([
  "PPTV-RECONCILE-DUPLICATE-ID",
  "PPTV-RECONCILE-INVALID-PPTX",
  "PPTV-RECONCILE-LINEAGE",
  "PPTV-RECONCILE-MISSING-ID",
]);
const IGNORED_METADATA_PARTS = new Set([
  "docProps/app.xml",
  "docProps/core.xml",
  "docProps/custom.xml",
]);

export type PptvReconciliationStatus =
  "unchanged" | "patchable" | "review-required" | "refused";

export interface PptvOfficeTextChange {
  readonly kind: "text";
  readonly objectId: string;
  readonly field: "text";
  readonly oldText: string;
  readonly newText: string;
  readonly patchable: true;
}

export interface PptvOfficeTypedChange {
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

export interface PptvOfficeUnsupportedChange {
  readonly kind: "unsupported";
  readonly scope: "package" | "slide" | "object";
  readonly field: string;
  readonly objectId?: string;
  readonly message: string;
  readonly patchable: false;
}

export type PptvOfficeChange =
  PptvOfficeTextChange | PptvOfficeTypedChange | PptvOfficeUnsupportedChange;

export interface PptvReconciliationResult {
  readonly schema: "pptv-pptx-reconciliation/0.1";
  readonly status: PptvReconciliationStatus;
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly changes: readonly PptvOfficeChange[];
  readonly patch?: PptvPatch;
  readonly diagnostics: readonly Diagnostic[];
}

export async function reconcilePptx(
  source: PptvDocument,
  baselineInput: PptvPptxMap,
  editedPptxBytes: Uint8Array,
): Promise<PptvReconciliationResult> {
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
  };

  if (
    source.sourceKind !== "svg" ||
    source.diagnostics.some(isErrorDiagnostic)
  ) {
    return refused(
      context,
      "PPTV-RECONCILE-INVALID-SOURCE",
      "This bounded C10 slice requires one complete error-free standalone PPTV diagram.",
    );
  }
  if (serializedBaseline === undefined || !basicBaselineMap(baselineInput)) {
    return refused(
      context,
      "PPTV-RECONCILE-INVALID-BASELINE",
      "Baseline map is not a canonical C9 standalone-diagram map.",
    );
  }
  const baseline = baselineInput;
  if (baseline.source.sha256 !== sourceSha256) {
    return refused(
      context,
      "PPTV-RECONCILE-STALE-SOURCE",
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
      error instanceof PptvPptxBaselineCompileError
        ? `${error.code}: ${error.message}`
        : errorMessage(error);
    return refused(
      context,
      "PPTV-RECONCILE-INVALID-SOURCE",
      `Source cannot regenerate the claimed C9 baseline: ${message}`,
    );
  }
  if (
    serializedBaseline !== regenerated.mapText ||
    baselineMapSha256 !== regenerated.mapSha256
  ) {
    return refused(
      context,
      "PPTV-RECONCILE-INVALID-BASELINE",
      "Supplied sidecar map differs from deterministic C9 regeneration of the exact source and placement.",
    );
  }

  const [baselineInspectionResult, editedInspectionResult] = await Promise.all([
    inspectPptxForReconciliation(regenerated.pptxBytes, baseline),
    inspectPptxForReconciliation(editedPptxBytes, baseline),
  ]);
  if (
    baselineInspectionResult.inspection === undefined ||
    baselineInspectionResult.diagnostics.length > 0
  ) {
    return refused(
      context,
      "PPTV-RECONCILE-INVALID-BASELINE",
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

  const diagnostics = [...editedInspectionResult.diagnostics];
  const changes: PptvOfficeChange[] = [];
  const operations: PptvOperation[] = [];
  compareInspections(
    baselineInspectionResult.inspection,
    editedInspectionResult.inspection,
    baseline,
    changes,
    operations,
    diagnostics,
  );

  if (
    diagnostics.some((diagnostic) =>
      TRUST_DIAGNOSTIC_CODES.has(diagnostic.code),
    )
  ) {
    return resultWithDiagnostics("refused", context, changes, diagnostics);
  }
  if (diagnostics.some(isErrorDiagnostic)) {
    return resultWithDiagnostics(
      "review-required",
      context,
      changes,
      diagnostics,
    );
  }

  if (operations.length === 0) {
    return resultWithDiagnostics("unchanged", context, [], diagnostics);
  }
  const patch: PptvPatch = {
    schema: "pptv-patch/0.2",
    baseSha256: sourceSha256,
    ops: operations,
  };
  const validation = await validatePatch(source, patch);
  if (validation.some(isErrorDiagnostic)) {
    return patchFailure(context, changes, validation);
  }
  const application = await applyPatch(source, patch);
  if (
    !application.applied ||
    application.diagram === undefined ||
    application.sourceText === undefined
  ) {
    return patchFailure(context, changes, application.diagnostics);
  }

  let patchedBaseline;
  try {
    patchedBaseline = await compilePptxBaseline(application.diagram, {
      placement: baseline.composition.placement,
    });
  } catch (error) {
    return patchFailure(context, changes, [
      {
        code: "PPTV-RECONCILE-PATCH",
        severity: "error",
        message: `Applied C5 patch did not regenerate through C9: ${errorMessage(error)}`,
      },
    ]);
  }
  const regeneratedInspection = await inspectPptxForReconciliation(
    patchedBaseline.pptxBytes,
    patchedBaseline.map,
  );
  if (
    regeneratedInspection.inspection === undefined ||
    regeneratedInspection.diagnostics.some(isErrorDiagnostic) ||
    !sameSupportedSlideSemantics(
      editedInspectionResult.inspection,
      regeneratedInspection.inspection,
    )
  ) {
    return patchFailure(context, changes, [
      {
        code: "PPTV-RECONCILE-PATCH",
        severity: "error",
        message:
          "Applied C5 patch did not regenerate the exact reconciled supported DrawingML semantics through C9.",
      },
      ...regeneratedInspection.diagnostics,
    ]);
  }

  return Object.freeze({
    schema: "pptv-pptx-reconciliation/0.1",
    status: "patchable",
    ...context,
    changes: Object.freeze(changes),
    patch: deepFreeze(patch),
    diagnostics: Object.freeze(diagnostics),
  });
}

function compareInspections(
  baseline: PptxInspection,
  edited: PptxInspection,
  map: PptvPptxMap,
  changes: PptvOfficeChange[],
  operations: PptvOperation[],
  diagnostics: Diagnostic[],
): void {
  const slidePartNames = new Set(map.slides.map((slide) => slide.partName));
  for (const partName of baseline.partNames) {
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
      mapSlide.objects
        .filter((object) => !afterById.has(object.id))
        .map((object) => object.id),
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
  before: PptxInspectedObject,
  after: PptxInspectedObject,
  changes: PptvOfficeChange[],
  operations: PptvOperation[],
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
  geometry: PptxInspectedGeometry,
): PptvOperation | undefined {
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

function geometryChange(operation: PptvOperation): PptvOfficeTypedChange {
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
  mapObjects: PptvPptxMap["slides"][number]["objects"],
  missingIds: ReadonlySet<string>,
  changes: PptvOfficeChange[],
  operations: PptvOperation[],
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
  mapObjects: PptvPptxMap["slides"][number]["objects"],
  afterById: ReadonlyMap<string, PptxInspectedObject>,
  missingIds: ReadonlySet<string>,
  changes: PptvOfficeChange[],
  operations: PptvOperation[],
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
  geometry: Extract<
    PptxInspectedGeometry,
    { readonly kind: "rect" | "ellipse" | "text" }
  >,
): PptvPatchBounds | undefined {
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
  geometry: Extract<PptxInspectedGeometry, { readonly kind: "line" }>,
): PptvConnectorEndpoints | undefined {
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
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
  mapObject: PptvPptxMap["slides"][number]["objects"][number],
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
  object: PptvPptxMap["slides"][number]["objects"][number],
): Extract<PptvObjectGeometry, { readonly kind: "rect" }> | undefined {
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
  object: PptvPptxMap["slides"][number]["objects"][number],
): Extract<PptvObjectGeometry, { readonly kind: "ellipse" }> | undefined {
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
  object: PptvPptxMap["slides"][number]["objects"][number],
): PptvConnectorEndpoints | undefined {
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
  object: PptvPptxMap["slides"][number]["objects"][number],
): PptvPatchPoint | undefined {
  const value = object.resolved.geometry;
  return finiteFields(value, ["translateX", "translateY"])
    ? {
        x: value["translateX"] as number,
        y: value["translateY"] as number,
      }
    : undefined;
}

function sourceTextFrame(
  object: PptvPptxMap["slides"][number]["objects"][number],
):
  | {
      readonly oldFrame: PptvPatchBounds;
      readonly oldLineAnchor: PptvPatchPoint;
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
  object: PptvPptxMap["slides"][number]["objects"][number],
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
  object: PptvPptxMap["slides"][number]["objects"][number],
): PptvConcreteNativeStyle | undefined {
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
  object: PptvPptxMap["slides"][number]["objects"][number],
  inspected: PptxInspectedStyle,
): PptvConcreteNativeStyle | undefined {
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
  object: PptvPptxMap["slides"][number]["objects"][number],
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
  object: PptvPptxMap["slides"][number]["objects"][number],
  oldStyle: PptvConcreteNativeStyle,
  style: PptvConcreteNativeStyle,
): boolean {
  if (typeof object.source.attributes["style"] === "string") return false;
  const attributes: Record<keyof PptvConcreteNativeStyle, string> = {
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
    Object.keys(attributes) as Array<keyof PptvConcreteNativeStyle>
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
  changes: PptvOfficeChange[],
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

function cleanNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function basicBaselineMap(value: unknown): value is PptvPptxMap {
  if (
    !isRecord(value) ||
    value["schema"] !== "pptv-pptx-map/0.1" ||
    value["compiler"] !== "office180-pptv-pptx-baseline/0.1" ||
    value["resolvedSchema"] !== "pptv-resolved/0.1" ||
    value["sourceResolvedSchema"] !== "pptv-resolved-diagram/0.1"
  ) {
    return false;
  }
  const source = value["source"];
  const composition = value["composition"];
  const pptx = value["pptx"];
  const slides = value["slides"];
  if (
    !isRecord(source) ||
    source["kind"] !== "diagram" ||
    source["profile"] !== "0.1" ||
    typeof source["id"] !== "string" ||
    typeof source["sha256"] !== "string" ||
    !SHA256_PATTERN.test(source["sha256"]) ||
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

function safeSerializeMap(map: unknown): string | undefined {
  try {
    return serializePptvPptxMap(map as PptvPptxMap);
  } catch {
    return undefined;
  }
}

function patchFailure(
  context: ResultContext,
  changes: readonly PptvOfficeChange[],
  related: readonly Diagnostic[],
): PptvReconciliationResult {
  return refused(
    context,
    "PPTV-RECONCILE-PATCH",
    "Proposed typed operations did not pass exact current C5 validation, application, and C9 regeneration.",
    related,
    changes,
  );
}

interface ResultContext {
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
}

function refused(
  context: ResultContext,
  code: string,
  message: string,
  related: readonly Diagnostic[] = [],
  changes: readonly PptvOfficeChange[] = [],
): PptvReconciliationResult {
  return resultWithDiagnostics("refused", context, changes, [
    {
      code,
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
  ]);
}

function resultWithDiagnostics(
  status: PptvReconciliationStatus,
  context: ResultContext,
  changes: readonly PptvOfficeChange[],
  diagnostics: readonly Diagnostic[],
): PptvReconciliationResult {
  return Object.freeze({
    schema: "pptv-pptx-reconciliation/0.1",
    status,
    ...context,
    changes: Object.freeze([...changes]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function unsupportedDiagnostic(message: string): Diagnostic {
  return {
    code: "PPTV-RECONCILE-UNSUPPORTED",
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
