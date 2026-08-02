/**
 * Public PPTV core types.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.2
 */

export type PptvInput =
  | { kind: "text"; text: string; name?: string }
  | { kind: "bytes"; bytes: Uint8Array; name?: string };

export type PptvSourceKind = "html" | "svg" | "manifest" | "unknown";

export type DiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export interface SourceRange {
  /** Zero-based, half-open UTF-8 byte offsets into the exact retained source. */
  readonly byteStart: number;
  readonly byteEnd: number;
  /** Zero-based, half-open JavaScript UTF-16 code-unit offsets. */
  readonly charStart: number;
  readonly charEnd: number;
  /** One-based source positions. */
  readonly lineStart: number;
  readonly columnStart: number;
  readonly lineEnd: number;
  readonly columnEnd: number;
}

export interface DiagnosticRelated {
  message: string;
  range?: SourceRange;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  range?: SourceRange;
  slideId?: string;
  diagramId?: string;
  objectId?: string;
  related?: DiagnosticRelated[];
}

export interface PptvSourceDocument {
  readonly name?: string;
  /** Exact decoded source. A leading BOM and newline spelling are retained. */
  readonly text: string;
  /** Exact UTF-8 encoding of `text`, including a leading BOM when present. */
  readonly bytes: Uint8Array;
  readonly charLength: number;
  readonly byteLength: number;
  readonly sha256: string;
}

export type PptvSectionKind =
  | "html-head"
  | "manifest"
  | "output-mount"
  | "slide"
  | "library"
  | "style"
  | "theme"
  | "viewer-runtime"
  | "editor-runtime"
  | "unknown";

export interface PptvSectionRef {
  kind: PptvSectionKind;
  id?: string;
  range: SourceRange;
  openTagRange?: SourceRange;
  contentRange?: SourceRange;
  attributes: Record<string, string>;
}

export interface ScanOptions {
  /** Enforce the strict book-like HTML section order. Defaults to true. */
  strictOrder?: boolean;
  /** Maximum exact UTF-8 source size. Defaults to 8 MiB. */
  maxSourceBytes?: number;
  /** Maximum parsed element count. Defaults to 100,000. */
  maxElements?: number;
  /** Maximum HTML/SVG nesting depth. Defaults to 512. */
  maxDepth?: number;
}

export interface PptvScan {
  kind: PptvSourceKind;
  encoding: "utf-8";
  source: PptvSourceDocument;
  versionHint?: string;
  sections: PptvSectionRef[];
  diagnostics: Diagnostic[];
}

export interface PptvManifestSlide {
  id: string;
  layout?: string;
  hidden?: boolean;
  namespace?: string;
  src?: string;
}

export interface PptvManifest {
  pptv: string;
  title?: string;
  runtime?: string;
  editor?: string;
  theme?: string;
  themes?: string[];
  slides: Array<string | PptvManifestSlide>;
  agentProfile?: string;
  extensions?: Record<string, unknown>;
}

export interface ManifestFieldRanges {
  root: SourceRange;
  fields: Map<string, SourceRange>;
  slideEntries: Map<string, SourceRange>;
}

export interface ManifestParseResult {
  manifest?: PptvManifest;
  ranges?: ManifestFieldRanges;
  diagnostics: Diagnostic[];
}

export type PptvRole = "shape" | "text" | "connector" | "group" | "asset";
export type PptvExportMode = "native" | "svg" | "raster" | "ignore";

export interface IndexedObject {
  id: string;
  slideId: string;
  elementRange: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  directTextRange?: SourceRange;
}

export interface IndexedDiagramObject {
  id: string;
  diagramId: string;
  elementRange: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  directTextRange?: SourceRange;
}

export interface IndexedSlide {
  id: string;
  /** Exact enclosing template section range (retained for compatibility). */
  range: SourceRange;
  /** Exact root SVG element range inside the template. */
  svgRange: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  objectIds: string[];
}

export interface IndexedTheme {
  id: string;
  range: SourceRange;
  contentRange: SourceRange;
}

export interface IndexedStyle {
  id: "base";
  range: SourceRange;
  contentRange: SourceRange;
}

export interface IndexedLibrary {
  id: string;
  range: SourceRange;
}

export interface PptvSourceIndex {
  readonly sourceSha256: string;
  readonly manifest: SourceRange;
  readonly manifestFields: ReadonlyMap<string, SourceRange>;
  readonly manifestSlideEntries: ReadonlyMap<string, SourceRange>;
  readonly slides: ReadonlyMap<string, IndexedSlide>;
  readonly objects: ReadonlyMap<string, IndexedObject>;
  readonly style?: IndexedStyle;
  readonly themes: ReadonlyMap<string, IndexedTheme>;
  readonly libraries: ReadonlyMap<string, IndexedLibrary>;
  readonly runtimes: readonly PptvSectionRef[];
}

export interface IndexedDiagram {
  id: string;
  range: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  objectIds: string[];
}

export interface PptvDiagramIndex {
  readonly sourceSha256: string;
  readonly root: IndexedDiagram;
  readonly objects: ReadonlyMap<string, IndexedDiagramObject>;
}

export interface PptvNode {
  readonly id: string;
  readonly role: PptvRole;
  readonly exportMode: PptvExportMode;
  readonly elementName: string;
  readonly classes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly parentId: string | null;
  readonly children: readonly PptvNode[];
  readonly text?: string;
  readonly opaque: boolean;
  readonly sourceRange: SourceRange;
  readonly openTagRange: SourceRange;
  readonly directTextRange?: SourceRange;
}

export interface PptvSlide {
  readonly id: string;
  readonly layout?: string;
  readonly hidden: boolean;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly PptvNode[];
  readonly sourceRange: SourceRange;
}

export interface PptvTheme {
  id: string;
  cssText: string;
  sourceRange: SourceRange;
  contentRange: SourceRange;
}

export interface PptvBaseStyle {
  readonly id: "base";
  readonly cssText: string;
  readonly sourceRange: SourceRange;
  readonly contentRange: SourceRange;
}

export interface PptvLibrary {
  id: string;
  sourceRange: SourceRange;
}

export interface PptvDeck {
  readonly version: string;
  readonly sourceKind: "html";
  readonly title?: string;
  readonly activeTheme?: string;
  readonly slideOrder: readonly string[];
  readonly slides: ReadonlyMap<string, PptvSlide>;
  readonly baseStyle?: PptvBaseStyle;
  readonly themes: ReadonlyMap<string, PptvTheme>;
  readonly libraries: ReadonlyMap<string, PptvLibrary>;
  readonly source: PptvSourceDocument;
  readonly index: PptvSourceIndex;
  readonly manifest: PptvManifest;
  readonly materialization: {
    readonly level: "semantic";
    readonly slideIds: readonly string[];
    readonly complete: boolean;
  };
  readonly diagnostics: readonly Diagnostic[];
}

export interface LoadDeckOptions extends ScanOptions {
  slides?: string[];
}

export interface PptvDiagram {
  readonly version: "0.1";
  readonly sourceKind: "svg";
  readonly id: string;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly PptvNode[];
  readonly sourceRange: SourceRange;
  readonly source: PptvSourceDocument;
  readonly index: PptvDiagramIndex;
  readonly diagnostics: readonly Diagnostic[];
}

export type PptvDocument = PptvDeck | PptvDiagram;

export type LoadDiagramOptions = ScanOptions;

export interface LoadPptvDocumentOptions extends ScanOptions {
  /** Applied only when the recognized document is an HTML deck. */
  slides?: string[];
}

export interface DeckInventoryObject {
  id: string;
  role: PptvRole;
  text?: string;
  children: DeckInventoryObject[];
}

export interface DeckOutlineSlide {
  id: string;
  layout?: string;
  hidden: boolean;
}

export interface DeckOutline {
  schema: "pptv-outline/0.1";
  version: string;
  title?: string;
  activeTheme?: string;
  slides: DeckOutlineSlide[];
}

export interface DeckInventorySlide extends DeckOutlineSlide {
  objects: DeckInventoryObject[];
}

export interface DeckInventory {
  schema: "pptv-inventory/0.1";
  slides: DeckInventorySlide[];
}

export interface DiagramOutline {
  schema: "pptv-diagram-outline/0.1";
  version: string;
  diagramId: string;
  viewBox: [number, number, number, number];
}

export interface DiagramInventoryObject {
  id: string;
  role: PptvRole;
  text?: string;
  children: DiagramInventoryObject[];
}

export interface DiagramInventory {
  schema: "pptv-diagram-inventory/0.1";
  diagramId: string;
  viewBox: [number, number, number, number];
  objects: DiagramInventoryObject[];
}

export type ProjectionView = "semantic" | "editing";

export interface ObjectProjection {
  id: string;
  role: PptvRole;
  export: PptvExportMode;
  element: string;
  text?: string;
  children: ObjectProjection[];
  classes?: string[];
  attributes?: Record<string, string>;
  sourceRange?: SourceRange;
}

export interface SlideProjection {
  schema: "pptv-slide/0.1";
  id: string;
  layout?: string;
  hidden: boolean;
  viewBox?: [number, number, number, number];
  objects: ObjectProjection[];
}

export interface DiagramProjection {
  schema: "pptv-diagram/0.1";
  diagramId: string;
  viewBox: [number, number, number, number];
  objects: ObjectProjection[];
}

export interface DiagramObjectProjection {
  schema: "pptv-diagram-object/0.1";
  diagramId: string;
  object: ObjectProjection;
}

export interface DiagramQueryProjection {
  schema: "pptv-diagram-query/0.1";
  diagramId: string;
  objects: ObjectProjection[];
}

export interface TextProjectionEntry {
  slideId: string;
  objectId: string;
  text: string;
}

export interface TextProjection {
  schema: "pptv-text/0.1";
  entries: TextProjectionEntry[];
}

export interface DiagramTextProjectionEntry {
  diagramId: string;
  objectId: string;
  text: string;
}

export interface DiagramTextProjection {
  schema: "pptv-diagram-text/0.1";
  diagramId: string;
  entries: DiagramTextProjectionEntry[];
}

export interface PptvQuery {
  slideId?: string;
  ids?: string[];
  role?: PptvRole;
  className?: string;
  elementName?: string;
  textContains?: string;
  descendantOf?: string;
}

export interface SetTextOperation {
  op: "set-text";
  id: string;
  oldText?: string;
  value: string;
}

export interface SetActiveThemeOperation {
  op: "set-active-theme";
  theme: string;
  oldTheme?: string;
}

export interface SetSlideOrderOperation {
  op: "set-slide-order";
  order: string[];
  oldOrder?: string[];
}

export interface PptvRectGeometry {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PptvEllipseGeometry {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export type PptvObjectGeometry = PptvRectGeometry | PptvEllipseGeometry;

export interface SetObjectGeometryOperation {
  op: "set-object-geometry";
  id: string;
  oldGeometry: PptvObjectGeometry;
  geometry: PptvObjectGeometry;
}

export interface PptvConnectorEndpoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SetConnectorEndpointsOperation {
  op: "set-connector-endpoints";
  id: string;
  oldEndpoints: PptvConnectorEndpoints;
  endpoints: PptvConnectorEndpoints;
}

export interface PptvPatchPoint {
  x: number;
  y: number;
}

export interface SetGroupTranslationOperation {
  op: "set-group-translation";
  id: string;
  oldTranslation: PptvPatchPoint;
  translation: PptvPatchPoint;
}

export interface PptvPatchBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SetTextFrameOperation {
  op: "set-text-frame";
  id: string;
  oldFrame: PptvPatchBounds;
  frame: PptvPatchBounds;
  oldLineAnchor: PptvPatchPoint;
  lineAnchor: PptvPatchPoint;
}

export interface SetChildOrderOperation {
  op: "set-child-order";
  parentId: string;
  oldOrder: string[];
  order: string[];
}

export interface DeleteObjectOperation {
  op: "delete-object";
  id: string;
  oldParentId: string | null;
  oldOrder: number;
}

export interface PptvConcreteNativeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  textAnchor: "start" | "middle" | "end";
}

export interface SetNativeStyleOperation {
  op: "set-native-style";
  id: string;
  oldStyle: PptvConcreteNativeStyle;
  style: PptvConcreteNativeStyle;
}

export type PptvLegacyOperation =
  SetTextOperation | SetActiveThemeOperation | SetSlideOrderOperation;

export type PptvOperation =
  | PptvLegacyOperation
  | SetObjectGeometryOperation
  | SetConnectorEndpointsOperation
  | SetGroupTranslationOperation
  | SetTextFrameOperation
  | SetChildOrderOperation
  | DeleteObjectOperation
  | SetNativeStyleOperation;

interface PptvPatchMetadata {
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
}

export interface PptvPatch01 extends PptvPatchMetadata {
  schema: "pptv-patch/0.1";
  ops: PptvLegacyOperation[];
}

export interface PptvPatch02 extends PptvPatchMetadata {
  schema: "pptv-patch/0.2";
  ops: PptvOperation[];
}

export type PptvPatch = PptvPatch01 | PptvPatch02;

export interface AppliedSourceEdit {
  range: SourceRange;
  replacement: string;
  operationIndex: number;
}

export interface PatchResult {
  applied: boolean;
  originalSha256: string;
  sourceText?: string;
  sourceSha256?: string;
  deck?: PptvDeck;
  diagram?: PptvDiagram;
  affectedIds: string[];
  edits: AppliedSourceEdit[];
  diagnostics: Diagnostic[];
}
