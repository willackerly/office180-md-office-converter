/**
 * Explicit Node-only PPTV filesystem and wrapper boundaries.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.2
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.0
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
  type PptxInspectedObject,
  type PptxInspectedSlide,
  type PptxInspection,
  type PptxInspectionResult,
} from "./pptx-inspect.js";
export {
  reconcilePptx,
  type PptvOfficeChange,
  type PptvOfficeTextChange,
  type PptvOfficeUnsupportedChange,
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
