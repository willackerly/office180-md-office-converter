/**
 * Public Vector180 core types.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 */

export type Vector180Input =
  | { kind: "text"; text: string; name?: string }
  | { kind: "bytes"; bytes: Uint8Array; name?: string };

export type Vector180SourceKind = "html" | "svg" | "manifest" | "unknown";
export type VisualWireFamily = "vector180" | "pptv-legacy";

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
  atomId?: string;
  objectId?: string;
  related?: DiagnosticRelated[];
}

export interface Vector180SourceDocument {
  readonly name?: string;
  /** Present on classified C4 snapshots and every semantically loaded model. */
  readonly wireFamily?: VisualWireFamily;
  /** Exact decoded source. A leading BOM and newline spelling are retained. */
  readonly text: string;
  /** Exact UTF-8 encoding of `text`, including a leading BOM when present. */
  readonly bytes: Uint8Array;
  readonly charLength: number;
  readonly byteLength: number;
  readonly sha256: string;
}

export type Vector180SectionKind =
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

export interface Vector180SectionRef {
  kind: Vector180SectionKind;
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

export interface Vector180Scan {
  kind: Vector180SourceKind;
  wireFamily?: VisualWireFamily;
  encoding: "utf-8";
  source: Vector180SourceDocument;
  versionHint?: string;
  sections: Vector180SectionRef[];
  diagnostics: Diagnostic[];
}

export interface Vector180ManifestSlide {
  id: string;
  layout?: string;
  hidden?: boolean;
  namespace?: string;
  src?: string;
}

export interface Vector180Manifest {
  vector180: string;
  title?: string;
  runtime?: string;
  editor?: string;
  theme?: string;
  themes?: string[];
  slides: Array<string | Vector180ManifestSlide>;
  agentProfile?: string;
  extensions?: Record<string, unknown>;
}

export interface ManifestFieldRanges {
  root: SourceRange;
  fields: Map<string, SourceRange>;
  slideEntries: Map<string, SourceRange>;
}

export interface ManifestParseResult {
  manifest?: Vector180Manifest;
  ranges?: ManifestFieldRanges;
  diagnostics: Diagnostic[];
}

export type Vector180Role = "shape" | "text" | "connector" | "group" | "asset";
export type Vector180ExportMode = "native" | "svg" | "raster" | "ignore";

export interface IndexedObject {
  id: string;
  slideId: string;
  elementRange: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  directTextRange?: SourceRange;
}

export interface IndexedAtomObject {
  id: string;
  atomId: string;
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

export interface Vector180SourceIndex {
  readonly sourceSha256: string;
  readonly manifest: SourceRange;
  readonly manifestFields: ReadonlyMap<string, SourceRange>;
  readonly manifestSlideEntries: ReadonlyMap<string, SourceRange>;
  readonly slides: ReadonlyMap<string, IndexedSlide>;
  readonly objects: ReadonlyMap<string, IndexedObject>;
  readonly style?: IndexedStyle;
  readonly themes: ReadonlyMap<string, IndexedTheme>;
  readonly libraries: ReadonlyMap<string, IndexedLibrary>;
  readonly runtimes: readonly Vector180SectionRef[];
}

export interface IndexedAtom {
  id: string;
  range: SourceRange;
  openTagRange: SourceRange;
  attributeRanges: ReadonlyMap<string, SourceRange>;
  objectIds: string[];
}

export interface IndexedAtomMetadata {
  readonly range: SourceRange;
  readonly contentRange: SourceRange;
}

export interface Vector180AtomIndex {
  readonly sourceSha256: string;
  readonly root: IndexedAtom;
  readonly objects: ReadonlyMap<string, IndexedAtomObject>;
  readonly metadata?: IndexedAtomMetadata;
}

export interface Vector180Node {
  readonly id: string;
  readonly role: Vector180Role;
  readonly exportMode: Vector180ExportMode;
  readonly elementName: string;
  readonly classes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly parentId: string | null;
  readonly children: readonly Vector180Node[];
  readonly text?: string;
  readonly opaque: boolean;
  readonly sourceRange: SourceRange;
  readonly openTagRange: SourceRange;
  readonly directTextRange?: SourceRange;
}

export interface Vector180Slide {
  readonly id: string;
  readonly layout?: string;
  readonly hidden: boolean;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly Vector180Node[];
  readonly sourceRange: SourceRange;
}

export interface Vector180Theme {
  id: string;
  cssText: string;
  sourceRange: SourceRange;
  contentRange: SourceRange;
}

export interface Vector180BaseStyle {
  readonly id: "base";
  readonly cssText: string;
  readonly sourceRange: SourceRange;
  readonly contentRange: SourceRange;
}

export interface Vector180Library {
  id: string;
  sourceRange: SourceRange;
}

export interface Vector180Deck {
  readonly version: string;
  readonly sourceKind: "html";
  readonly wireFamily: VisualWireFamily;
  readonly title?: string;
  readonly activeTheme?: string;
  readonly slideOrder: readonly string[];
  readonly slides: ReadonlyMap<string, Vector180Slide>;
  readonly baseStyle?: Vector180BaseStyle;
  readonly themes: ReadonlyMap<string, Vector180Theme>;
  readonly libraries: ReadonlyMap<string, Vector180Library>;
  readonly source: Vector180SourceDocument;
  readonly index: Vector180SourceIndex;
  readonly manifest: Vector180Manifest;
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

export interface Vector180Atom {
  readonly version: "0.1";
  readonly sourceKind: "svg";
  readonly wireFamily: VisualWireFamily;
  readonly id: string;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly Vector180Node[];
  readonly metadata?: Vector180AtomMetadata;
  readonly metadataSha256?: string;
  readonly sourceRange: SourceRange;
  readonly source: Vector180SourceDocument;
  readonly index: Vector180AtomIndex;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180HydrationMetadata {
  readonly method: string;
  readonly sourceWireFamily: VisualWireFamily;
  readonly sourceSha256: string;
  readonly sourceObjectId: string;
  readonly sourceObjectSha256: string;
  readonly activeThemeId: string;
}

export interface Vector180TemplateLineage {
  readonly generatorProfile: string;
  readonly templateId: string;
  readonly templateSha256: string;
}

export interface Vector180StyleFamily {
  readonly id: string;
  readonly version?: string;
  readonly definitionSha256?: string;
}

export interface Vector180AtomMetadata {
  readonly hydration?: Vector180HydrationMetadata;
  readonly templateLineage?: Vector180TemplateLineage;
  readonly styleFamily?: Vector180StyleFamily;
}

export interface Vector180MetadataProjection {
  readonly value: Vector180AtomMetadata;
  readonly metadataSha256: string;
  readonly canonicalJson: string;
  readonly sourceRange: SourceRange;
  readonly contentRange: SourceRange;
}

export type Vector180Document = Vector180Deck | Vector180Atom;

export type LoadAtomOptions = ScanOptions;

export interface LoadVector180DocumentOptions extends ScanOptions {
  /** Applied only when the recognized document is an HTML deck. */
  slides?: string[];
}

export interface DeckInventoryObject {
  id: string;
  role: Vector180Role;
  text?: string;
  children: DeckInventoryObject[];
}

export interface DeckOutlineSlide {
  id: string;
  layout?: string;
  hidden: boolean;
}

export interface DeckOutline {
  schema: "vector180-deck-outline/0.1";
  wireFamily: VisualWireFamily;
  version: string;
  title?: string;
  activeTheme?: string;
  slides: DeckOutlineSlide[];
}

export interface DeckInventorySlide extends DeckOutlineSlide {
  objects: DeckInventoryObject[];
}

export interface DeckInventory {
  schema: "vector180-deck-inventory/0.1";
  wireFamily: VisualWireFamily;
  slides: DeckInventorySlide[];
}

export interface AtomOutline {
  schema: "vector180-atom-outline/0.1";
  wireFamily: VisualWireFamily;
  version: string;
  atomId: string;
  viewBox: [number, number, number, number];
}

export interface AtomInventoryObject {
  id: string;
  role: Vector180Role;
  text?: string;
  children: AtomInventoryObject[];
}

export interface AtomInventory {
  schema: "vector180-atom-inventory/0.1";
  wireFamily: VisualWireFamily;
  atomId: string;
  viewBox: [number, number, number, number];
  objects: AtomInventoryObject[];
}

export type ProjectionView = "semantic" | "editing";

export interface ObjectProjection {
  wireFamily: VisualWireFamily;
  id: string;
  role: Vector180Role;
  export: Vector180ExportMode;
  element: string;
  text?: string;
  children: ObjectProjection[];
  classes?: string[];
  attributes?: Record<string, string>;
  sourceRange?: SourceRange;
}

export interface SlideProjection {
  schema: "vector180-slide/0.1";
  wireFamily: VisualWireFamily;
  id: string;
  layout?: string;
  hidden: boolean;
  viewBox?: [number, number, number, number];
  objects: ObjectProjection[];
}

export interface AtomProjection {
  schema: "vector180-atom/0.1";
  wireFamily: VisualWireFamily;
  atomId: string;
  viewBox: [number, number, number, number];
  objects: ObjectProjection[];
}

export interface AtomObjectProjection {
  schema: "vector180-atom-object/0.1";
  wireFamily: VisualWireFamily;
  atomId: string;
  object: ObjectProjection;
}

export interface AtomQueryProjection {
  schema: "vector180-atom-query/0.1";
  wireFamily: VisualWireFamily;
  atomId: string;
  objects: ObjectProjection[];
}

export interface TextProjectionEntry {
  wireFamily: VisualWireFamily;
  slideId: string;
  objectId: string;
  text: string;
}

export interface TextProjection {
  schema: "vector180-deck-text/0.1";
  wireFamily: VisualWireFamily;
  entries: TextProjectionEntry[];
}

export interface AtomTextProjectionEntry {
  wireFamily: VisualWireFamily;
  atomId: string;
  objectId: string;
  text: string;
}

export interface AtomTextProjection {
  schema: "vector180-atom-text/0.1";
  wireFamily: VisualWireFamily;
  atomId: string;
  entries: AtomTextProjectionEntry[];
}

export interface Vector180Query {
  slideId?: string;
  ids?: string[];
  role?: Vector180Role;
  className?: string;
  elementName?: string;
  textContains?: string;
  descendantOf?: string;
}

export interface SetTextOperation {
  op: "set-text";
  id: string;
  oldText: string;
  value: string;
}

export interface SetActiveThemeOperation {
  op: "set-active-theme";
  theme: string;
  oldTheme: string;
}

export interface SetSlideOrderOperation {
  op: "set-slide-order";
  order: string[];
  oldOrder: string[];
}

export interface Vector180RectGeometry {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vector180EllipseGeometry {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export type Vector180ObjectGeometry =
  Vector180RectGeometry | Vector180EllipseGeometry;

export interface SetObjectGeometryOperation {
  op: "set-object-geometry";
  id: string;
  oldGeometry: Vector180ObjectGeometry;
  geometry: Vector180ObjectGeometry;
}

export interface Vector180ConnectorEndpoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SetConnectorEndpointsOperation {
  op: "set-connector-endpoints";
  id: string;
  oldEndpoints: Vector180ConnectorEndpoints;
  endpoints: Vector180ConnectorEndpoints;
}

export interface Vector180PatchPoint {
  x: number;
  y: number;
}

export interface SetGroupTranslationOperation {
  op: "set-group-translation";
  id: string;
  oldTranslation: Vector180PatchPoint;
  translation: Vector180PatchPoint;
}

export interface Vector180PatchBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SetTextFrameOperation {
  op: "set-text-frame";
  id: string;
  oldFrame: Vector180PatchBounds;
  frame: Vector180PatchBounds;
  oldLineAnchor: Vector180PatchPoint;
  lineAnchor: Vector180PatchPoint;
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

export interface Vector180ConcreteNativeStyle {
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
  oldStyle: Vector180ConcreteNativeStyle;
  style: Vector180ConcreteNativeStyle;
}

export interface Vector180ConnectorCloneState {
  fromId: string;
  toId: string;
  endpoints: Vector180ConnectorEndpoints;
  style: Vector180ConcreteNativeStyle;
}

export interface CloneConnectorOperation {
  op: "clone-connector";
  templateId: string;
  newId: string;
  parentId: string;
  oldOrder: string[];
  order: string[];
  oldConnector: Vector180ConnectorCloneState;
  connector: Vector180ConnectorCloneState;
}

export type Vector180Operation =
  | SetTextOperation
  | SetActiveThemeOperation
  | SetSlideOrderOperation
  | SetObjectGeometryOperation
  | SetConnectorEndpointsOperation
  | SetGroupTranslationOperation
  | SetTextFrameOperation
  | SetChildOrderOperation
  | DeleteObjectOperation
  | SetNativeStyleOperation;

export type Vector180PatchOperation =
  Vector180Operation | CloneConnectorOperation;

export interface Vector180Patch {
  readonly schema: "vector180-patch/0.1";
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: Vector180PatchOperation[];
}

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
  deck?: Vector180Deck;
  atom?: Vector180Atom;
  affectedIds: string[];
  edits: AppliedSourceEdit[];
  diagnostics: Diagnostic[];
}
