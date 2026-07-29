/**
 * Public PPTV core types.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
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
  attributeRanges: Map<string, SourceRange>;
  directTextRange?: SourceRange;
}

export interface IndexedSlide {
  id: string;
  range: SourceRange;
  openTagRange: SourceRange;
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
  readonly sourceKind: PptvSourceKind;
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

export interface TextProjectionEntry {
  slideId: string;
  objectId: string;
  text: string;
}

export interface TextProjection {
  schema: "pptv-text/0.1";
  entries: TextProjectionEntry[];
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

export type PptvOperation =
  SetTextOperation | SetActiveThemeOperation | SetSlideOrderOperation;

export interface PptvPatch {
  schema: "pptv-patch/0.1";
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: PptvOperation[];
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
  deck?: PptvDeck;
  affectedIds: string[];
  edits: AppliedSourceEdit[];
  diagnostics: Diagnostic[];
}
