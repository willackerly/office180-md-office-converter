/**
 * Portable Vector180 source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 */

export {
  deckIsValid,
  atomIsValid,
  loadDeck,
  loadAtom,
  loadVector180Document,
  Vector180LoadError,
  validateDeck,
  validateAtom,
} from "./deck.js";
export {
  addVector180AtomDiscoveryComment,
  extractVector180Atom,
  VECTOR180_ATOM_DISCOVERY_COMMENT,
  type Vector180AtomExtractionProvenance,
  type Vector180AtomExtractionResult,
} from "./extract.js";
export {
  parseManifest,
  PROFILE_ID_PATTERN,
  slideId,
  STABLE_ID_PATTERN,
  validateManifest,
} from "./manifest.js";
export { scanVector180Source } from "./scan.js";
export {
  resolveVector180Deck,
  resolveVector180Atom,
  type Vector180Bounds,
  type Vector180Point,
  type Vector180ResolvedDeck,
  type Vector180ResolvedAtom,
  type Vector180ResolvedAtomEllipse,
  type Vector180ResolvedAtomGroup,
  type Vector180ResolvedAtomLine,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedAtomObjectBase,
  type Vector180ResolvedAtomRasterAsset,
  type Vector180ResolvedAtomRect,
  type Vector180ResolvedAtomResult,
  type Vector180ResolvedAtomSvgAsset,
  type Vector180ResolvedAtomText,
  type Vector180ResolvedEllipse,
  type Vector180ResolvedGroup,
  type Vector180ResolvedLine,
  type Vector180ResolvedObject,
  type Vector180ResolvedObjectBase,
  type Vector180ResolvedObjectKind,
  type Vector180ResolvedRasterAsset,
  type Vector180ResolvedRect,
  type Vector180ResolvedDeckResult,
  type Vector180ResolvedSlide,
  type Vector180ResolvedSvgAsset,
  type Vector180ResolvedText,
  type Vector180ResolvedTextLine,
} from "./resolved.js";
export {
  preflightAtomTextFit,
  preflightDeckTextFit,
  textLineAvailableWidth,
  type Vector180AtomTextFitLine,
  type Vector180AtomTextFitResult,
  type Vector180AtomTextMeasurer,
  type Vector180AtomTextMeasureRequest,
  type Vector180MeasuredText,
  type Vector180DeckTextFitLine,
  type Vector180TextFitOptions,
  type Vector180DeckTextFitResult,
  type Vector180TextFitStatus,
  type Vector180TextFitSummary,
  type Vector180TextFont,
  type Vector180TextMeasurement,
  type Vector180DeckTextMeasurer,
  type Vector180DeckTextMeasureRequest,
  type Vector180UnverifiedText,
} from "./text-fit.js";
export {
  hasErrors,
  materializeSource,
  sha256Hex,
  sliceRange,
  SourceMapper,
} from "./source.js";
export {
  resolveVector180AtomStyles,
  resolveVector180Styles,
  type Vector180ResolvedObjectStyle,
  type Vector180ResolvedPropertyProvenance,
  type Vector180ResolvedStyle,
  type Vector180StyleOrigin,
  type Vector180StyleProvenance,
  type Vector180StyleResolution,
} from "./styles.js";
export type * from "./types.js";
