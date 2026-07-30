/**
 * Explicit Node-only PPTV filesystem and wrapper boundaries.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.1
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 */

export { createEditorPack, type EditorPackResult } from "./editor-pack.js";
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
  readJsonPath,
  readPptvPath,
  writeFileAtomic,
  type AtomicWriteOptions,
} from "./io.js";
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
