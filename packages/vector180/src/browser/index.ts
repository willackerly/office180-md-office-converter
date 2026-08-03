/**
 * Browser-safe Vector180 editor primitives.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 */

export {
  EditorSession,
  type EditorDeckSessionState,
  type EditorDeckSnapshot,
  type EditorAtomSessionState,
  type EditorAtomSnapshot,
  type EditorIntent,
  type EditorSessionOptions,
  type EditorSessionState,
  type EditorSnapshot,
} from "./session.js";
export {
  inspectVector180Conformance,
  type Vector180BrowserConformanceResult,
  type Vector180BrowserJson,
} from "./runtime.js";
export {
  browserEnvironmentFromUserAgent,
  browserFontAlias,
  prepareVector180BrowserTextMeasurer,
  type PrepareVector180BrowserTextMeasurerOptions,
  type Vector180BrowserEnvironmentEvidence,
  type Vector180BrowserFontSource,
  type Vector180BrowserGlyphCoverage,
  type Vector180BrowserLoadedFontEvidence,
  type Vector180BrowserTextMeasureRequest,
  type Vector180PreparedBrowserTextMeasurer,
} from "./text-measurer.js";
