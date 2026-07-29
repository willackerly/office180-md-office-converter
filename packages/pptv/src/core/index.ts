/**
 * Portable PPTV source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 */

export { deckIsValid, loadDeck, PptvLoadError, validateDeck } from "./deck.js";
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
  type PptvBounds,
  type PptvPoint,
  type PptvResolvedDeck,
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
  hasErrors,
  materializeSource,
  sha256Hex,
  sliceRange,
  SourceMapper,
} from "./source.js";
export {
  resolvePptvStyles,
  type PptvResolvedObjectStyle,
  type PptvResolvedPropertyProvenance,
  type PptvResolvedStyle,
  type PptvStyleOrigin,
  type PptvStyleProvenance,
  type PptvStyleResolution,
} from "./styles.js";
export type * from "./types.js";
