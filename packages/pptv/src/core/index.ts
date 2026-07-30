/**
 * Portable PPTV source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 */

export {
  deckIsValid,
  diagramIsValid,
  loadDeck,
  loadDiagram,
  loadPptvDocument,
  PptvLoadError,
  validateDeck,
  validateDiagram,
} from "./deck.js";
export {
  addPptvDiagramDiscoveryComment,
  extractPptvDiagram,
  PPTV_DIAGRAM_DISCOVERY_COMMENT,
  type PptvDiagramExtractionProvenance,
  type PptvDiagramExtractionResult,
} from "./extract.js";
export {
  parseManifest,
  PROFILE_ID_PATTERN,
  slideId,
  STABLE_ID_PATTERN,
  validateManifest,
} from "./manifest.js";
export { scanPptvSource } from "./scan.js";
export {
  resolvePptvDeck,
  resolvePptvDiagram,
  type PptvBounds,
  type PptvPoint,
  type PptvResolvedDeck,
  type PptvResolvedDiagram,
  type PptvResolvedDiagramEllipse,
  type PptvResolvedDiagramGroup,
  type PptvResolvedDiagramLine,
  type PptvResolvedDiagramObject,
  type PptvResolvedDiagramObjectBase,
  type PptvResolvedDiagramRasterAsset,
  type PptvResolvedDiagramRect,
  type PptvResolvedDiagramResult,
  type PptvResolvedDiagramSvgAsset,
  type PptvResolvedDiagramText,
  type PptvResolvedEllipse,
  type PptvResolvedGroup,
  type PptvResolvedLine,
  type PptvResolvedObject,
  type PptvResolvedObjectBase,
  type PptvResolvedObjectKind,
  type PptvResolvedRasterAsset,
  type PptvResolvedRect,
  type PptvResolvedResult,
  type PptvResolvedSlide,
  type PptvResolvedSvgAsset,
  type PptvResolvedText,
  type PptvResolvedTextLine,
} from "./resolved.js";
export {
  preflightDiagramTextFit,
  preflightTextFit,
  textLineAvailableWidth,
  type PptvDiagramTextFitLine,
  type PptvDiagramTextFitResult,
  type PptvDiagramTextMeasurer,
  type PptvDiagramTextMeasureRequest,
  type PptvMeasuredText,
  type PptvTextFitLine,
  type PptvTextFitOptions,
  type PptvTextFitResult,
  type PptvTextFitStatus,
  type PptvTextFitSummary,
  type PptvTextFont,
  type PptvTextMeasurement,
  type PptvTextMeasurer,
  type PptvTextMeasureRequest,
  type PptvUnverifiedText,
} from "./text-fit.js";
export {
  hasErrors,
  materializeSource,
  sha256Hex,
  sliceRange,
  SourceMapper,
} from "./source.js";
export {
  resolvePptvDiagramStyles,
  resolvePptvStyles,
  type PptvResolvedObjectStyle,
  type PptvResolvedPropertyProvenance,
  type PptvResolvedStyle,
  type PptvStyleOrigin,
  type PptvStyleProvenance,
  type PptvStyleResolution,
} from "./styles.js";
export type * from "./types.js";
