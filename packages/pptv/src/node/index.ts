/**
 * Explicit Node-only PPTV filesystem and wrapper boundaries.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 * CONTRACT:C7-PPTX-CANARY.1.0
 */

export { createEditorPack, type EditorPackResult } from "./editor-pack.js";
export { readJsonPath, readPptvPath, writeFileAtomic } from "./io.js";
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
