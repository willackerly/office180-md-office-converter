/**
 * PPTV queries, projections, and semantic patches.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 */

export { applyPatch, validatePatch } from "./patch.js";
export {
  extractText,
  getObject,
  getSlide,
  inventoryDeck,
  outlineDeck,
  outlineManifest,
  queryObjects,
} from "./projections.js";
