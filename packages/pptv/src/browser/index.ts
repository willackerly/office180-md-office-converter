/**
 * Browser-safe PPTV editor primitives.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.1
 */

export {
  EditorSession,
  type EditorDeckSessionState,
  type EditorDeckSnapshot,
  type EditorDiagramSessionState,
  type EditorDiagramSnapshot,
  type EditorIntent,
  type EditorSessionOptions,
  type EditorSessionState,
  type EditorSnapshot,
} from "./session.js";
export {
  inspectPptvConformance,
  type PptvBrowserConformanceResult,
  type PptvBrowserJson,
} from "./runtime.js";
export {
  browserEnvironmentFromUserAgent,
  browserFontAlias,
  preparePptvBrowserTextMeasurer,
  type PreparePptvBrowserTextMeasurerOptions,
  type PptvBrowserEnvironmentEvidence,
  type PptvBrowserFontSource,
  type PptvBrowserGlyphCoverage,
  type PptvBrowserLoadedFontEvidence,
  type PptvBrowserTextMeasureRequest,
  type PptvPreparedBrowserTextMeasurer,
} from "./text-measurer.js";
