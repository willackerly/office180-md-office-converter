/**
 * Vector180 queries, projections, and semantic patches.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 */

export { applyPatch, validatePatch } from "./patch.js";
export {
  compareAtomMetadata,
  deriveStylePaletteSha256,
  projectAtomMetadata,
  type Vector180MetadataComparison,
  type Vector180MetadataComparisonClassification,
  type Vector180MetadataComparisonOptions,
  type Vector180MetadataInspection,
} from "./metadata.js";
export {
  migratePptvAtom,
  type Vector180MigrationChangedRange,
  type Vector180MigrationRangeKind,
  type Vector180MigrationReport,
  type Vector180MigrationResult,
} from "./migrate.js";
export {
  diffVector180Atoms,
  type Vector180ChangeKind,
  type Vector180DiffClassification,
  type Vector180DiffSide,
  type Vector180DiffSourceIdentity,
  type Vector180DiffSummary,
  type Vector180MetadataDiff,
  type Vector180SemanticChange,
  type Vector180SourceDiff,
} from "./source-diff.js";
export {
  extractAtomText,
  extractText,
  getAtom,
  getAtomObject,
  getObject,
  getSlide,
  inventoryDeck,
  inventoryAtom,
  outlineDeck,
  outlineAtom,
  outlineManifest,
  queryAtomObjects,
  queryObjects,
  type Vector180AtomQuery,
} from "./projections.js";
