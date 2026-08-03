/**
 * Explicit Node-only PPTV filesystem and wrapper boundaries.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.3
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2
 */

export {
  createEditorPack,
  type EditorPackOptions,
  type EditorPackResult,
} from "./editor-pack.js";
export {
  createFontkitTextMeasurer,
  parseFontMap,
  type FontkitFontFace,
  type FontkitFontMap,
  type FontkitFontStyle,
  type FontkitFontWeight,
  type FontkitLoadedFaceEvidence,
  type FontkitMeasuredText,
  type FontkitRequestedFace,
  type FontkitTextMeasurement,
  type FontkitTextMeasurementEvidence,
  type FontkitTextMeasurer,
  type FontkitTextMeasureRequest,
  type FontkitUnverifiedText,
} from "./fontkit-text-measurer.js";
export {
  readBytesPath,
  readJsonPath,
  readPptvPath,
  writeFileAtomic,
  writeFilesAtomicExclusive,
  type AtomicWriteEntry,
  type AtomicWriteOptions,
} from "./io.js";
export {
  composePptvDiagramDeck,
  compilePptxBaseline,
  PptvPptxBaselineCompileError,
  serializePptvPptxMap,
  type PptvDiagramCompositionArtifact,
  type PptvPlacement,
  type PptvPptxBaselineArtifact,
  type PptvPptxBaselineErrorCode,
  type PptvPptxBaselineOptions,
  type PptvPptxMap,
  type PptvPptxMapObject,
  type PptvPptxMapObjectSnapshot,
  type PptvPptxMapSlide,
} from "./pptx-baseline.js";
export {
  inspectPptxForReconciliation,
  type PptxIdentityMatch,
  type PptxIdentityOccurrence,
  type PptxInspectedGeometry,
  type PptxInspectedObject,
  type PptxInspectedSlide,
  type PptxInspectedStyle,
  type PptxInspection,
  type PptxInspectionResult,
  type PptxObjectNormalizationEvidence,
  type SupportedOfficeElement,
} from "./pptx-inspect.js";
export {
  normalizePptxPackage,
  type PptxNormalizationEvidence,
  type PptxNormalizationPredicate,
  type PptxNormalizationRuleId,
  type PptxPackageNormalizationInput,
  type PptxPackageNormalizationResult,
} from "./pptx-normalization.js";
export {
  buildReconciliationPresentation,
  operationId,
  redactPrivateValues,
  type PptvCandidateOperation,
  type PptvFindingDisposition,
  type PptvFindingEffect,
  type PptvFindingEvidence,
  type PptvFindingResolution,
  type PptvFindingResolutionOption,
  type PptvFindingScope,
  type PptvNormalizationRuleReference,
  type PptvReconciliationCommand,
  type PptvReconciliationCommandContext,
  type PptvReconciliationFinding,
  type PptvReconciliationFindingInput,
  type PptvReconciliationPresentation,
  type PptvReconciliationSummary,
} from "./reconciliation-report.js";
export {
  connectorDuplicateResolutionGuidance,
  connectorOccurrenceFingerprintSha256,
  fingerprintConnectorOccurrence,
  parsePptvReconcileResolution,
  PptvReconcileResolutionError,
  serializePptvReconcileResolution,
  type PptvConnectorDuplicateResolutionAssessment,
  type PptvConnectorDuplicateResolutionGuidance,
  type PptvConnectorDuplicateResolutionStatus,
  type PptvConnectorOccurrenceFingerprint,
  type PptvReconcileResolution,
} from "./reconcile-resolution.js";
export {
  reconcilePptx,
  type PptvOfficeChange,
  type PptvOfficeTextChange,
  type PptvOfficeTypedChange,
  type PptvOfficeUnsupportedChange,
  type PptvReconciliationOptions,
  type PptvReconciliationResult,
  type PptvReconciliationStatus,
} from "./reconcile.js";
export {
  compilePptxCanary,
  createPptxCanaryGraph,
  PptxCanaryCompileError,
  validatePptxCanaryGraph,
  type PptxCanaryArtifact,
  type PptxCanaryErrorCode,
  type PptxCanaryGraph,
  type PptxCanaryPart,
  type PptxCanaryRelationship,
} from "./pptx-canary.js";
