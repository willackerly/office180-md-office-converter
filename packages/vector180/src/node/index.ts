/**
 * Explicit Node-only Vector180 filesystem and wrapper boundaries.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 */

export {
  createEditorPack,
  type EditorPackOptions,
  type EditorPackResult,
} from "./editor-pack.js";
export {
  createDefaultFontkitTextMeasurer,
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
  type Vector180DefaultFontEnvironmentEvidence,
  Vector180DefaultFontIntegrityError,
} from "./fontkit-text-measurer.js";
export {
  readBytesPath,
  readJsonPath,
  readVector180Path,
  writeFileAtomic,
  writeFilesAtomicExclusive,
  type AtomicWriteEntry,
  type AtomicWriteOptions,
} from "./io.js";
export {
  composeVector180AtomDeck,
  compileVector180PptxBaseline,
  compilePptxBaseline,
  Vector180PptxBaselineCompileError,
  serializeVector180PptxMap,
  type Vector180AtomCompositionArtifact,
  type Vector180Placement,
  type Vector180PptxBaselineArtifact,
  type Vector180PptxBaselineErrorCode,
  type Vector180PptxBaselineOptions,
  type Vector180PptxMap,
  type Vector180PptxMapObject,
  type Vector180PptxMapObjectSnapshot,
  type Vector180PptxMapSlide,
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
  type Vector180CandidateOperation,
  type Vector180FindingDisposition,
  type Vector180FindingEffect,
  type Vector180FindingEvidence,
  type Vector180FindingResolution,
  type Vector180FindingResolutionOption,
  type Vector180FindingScope,
  type Vector180NormalizationRuleReference,
  type Vector180ReconciliationCommand,
  type Vector180ReconciliationCommandContext,
  type Vector180ReconciliationFinding,
  type Vector180ReconciliationFindingInput,
  type Vector180ReconciliationPresentation,
  type Vector180ReconciliationSummary,
} from "./reconciliation-report.js";
export {
  connectorDuplicateResolutionGuidance,
  connectorOccurrenceFingerprintSha256,
  fingerprintConnectorOccurrence,
  parseVector180ReconcileResolution,
  reconciliationReportSha256,
  Vector180ReconcileResolutionError,
  serializeVector180ReconcileResolution,
  type Vector180ConnectorDuplicateResolutionAssessment,
  type Vector180ConnectorDuplicateResolutionGuidance,
  type Vector180ConnectorDuplicateResolutionStatus,
  type Vector180ConnectorOccurrenceFingerprint,
  type Vector180ReconcileResolution,
} from "./reconcile-resolution.js";
export {
  reconcileVector180Pptx,
  reconcilePptx,
  type Vector180OfficeChange,
  type Vector180OfficeTextChange,
  type Vector180OfficeTypedChange,
  type Vector180OfficeUnsupportedChange,
  type Vector180ReconciliationOptions,
  type Vector180ReconciliationResult,
  type Vector180ReconciliationStatus,
} from "./reconcile.js";
export {
  compilePptxCanary,
  compileVector180PptxCanary,
  createPptxCanaryGraph,
  PptxCanaryCompileError,
  validatePptxCanaryGraph,
  type PptxCanaryArtifact,
  type PptxCanaryErrorCode,
  type PptxCanaryGraph,
  type PptxCanaryPart,
  type PptxCanaryRelationship,
  type Vector180PptxCanaryArtifact,
  type Vector180PptxPart,
} from "./pptx-canary.js";
