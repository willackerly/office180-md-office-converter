/**
 * PPTV queries, projections, and semantic patches.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.3
 */

export { applyPatch, validatePatch } from "./patch.js";
export {
  extractDiagramText,
  extractText,
  getDiagram,
  getDiagramObject,
  getObject,
  getSlide,
  inventoryDeck,
  inventoryDiagram,
  outlineDeck,
  outlineDiagram,
  outlineManifest,
  queryDiagramObjects,
  queryObjects,
  type PptvDiagramQuery,
} from "./projections.js";
