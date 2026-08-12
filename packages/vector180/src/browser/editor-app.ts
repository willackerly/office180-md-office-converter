/**
 * Writable trusted Vector180 editor application.
 *
 * This entry is bundled into a deterministic browser IIFE. It opens only the
 * inert exact source bytes embedded by the Node editor-pack generator, commits
 * through EditorSession/C5, and reconstructs previews from fresh C6 data.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 * CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1
 */

import {
  extractVector180Atom,
  preflightAtomTextFit,
  preflightDeckTextFit,
  resolveVector180Deck,
  resolveVector180Atom,
  sha256Hex,
  type DeckInventory,
  type DeckOutline,
  type Diagnostic,
  type AtomInventory,
  type AtomOutline,
  type Vector180ConcreteNativeStyle,
  type Vector180AtomTextFitLine,
  type Vector180AtomTextFitResult,
  type Vector180Node,
  type Vector180ResolvedDeck,
  type Vector180ResolvedAtom,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedObject,
  type Vector180DeckTextFitLine,
  type Vector180DeckTextFitResult,
  type Vector180TextFitStatus,
  type Vector180TextMeasurement,
  type Vector180StyleProvenance,
} from "../core/index.js";
import {
  inventoryDeck,
  inventoryAtom,
  outlineDeck,
  outlineAtom,
} from "../ops/index.js";
import {
  compileVector180PptxDeck,
  type Vector180PptxDeckArtifact,
} from "../node/pptx-deck.js";
import {
  renderVector180PreviewPng,
  type Vector180DerivativeFont,
} from "./derivative-export.js";
import { EditorSession, type EditorSessionState } from "./session.js";
import { recoverTrustedInlinePng } from "./trusted-raster.js";
import {
  prepareVector180BrowserTextMeasurer,
  type Vector180BrowserFontSource,
  type Vector180PreparedBrowserTextMeasurer,
} from "./text-measurer.js";

interface EmbeddedFont {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
  readonly sourceBase64: string;
  readonly sha256: string;
  readonly postscriptName: string;
  readonly fullName: string;
  readonly unitsPerEm: number;
  readonly coverage: {
    readonly method: string;
    readonly checkedCodepoints: readonly number[];
    readonly missingCodepoints: readonly number[];
  };
}

interface PayloadBase {
  readonly schema: "vector180-editor-pack/0.1";
  readonly documentKind: "deck" | "atom";
  readonly title?: string;
  readonly downloadName: string;
  readonly downloadMime:
    "text/html;charset=utf-8" | "image/svg+xml;charset=utf-8";
  readonly sourceSha256: string;
  readonly sourceBase64: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly fonts: readonly EmbeddedFont[];
  readonly nearLimit: number;
}

interface DeckPayload extends PayloadBase {
  readonly documentKind: "deck";
  readonly outline: DeckOutline;
  readonly inventory: DeckInventory;
  readonly resolved: Vector180ResolvedDeck;
  readonly nodeTextFit: Vector180DeckTextFitResult;
}

interface AtomPayload extends PayloadBase {
  readonly documentKind: "atom";
  readonly outline: AtomOutline;
  readonly inventory: AtomInventory;
  readonly resolved: Vector180ResolvedAtom;
  readonly nodeTextFit: Vector180AtomTextFitResult;
}

type EditorPayload = DeckPayload | AtomPayload;
type ResolvedObject = Vector180ResolvedObject | Vector180ResolvedAtomObject;
type FitLine = Vector180DeckTextFitLine | Vector180AtomTextFitLine;

interface DeckView {
  readonly kind: "deck";
  readonly outline: DeckOutline;
  readonly inventory: DeckInventory;
  readonly resolved: Vector180ResolvedDeck;
  readonly browserFit: Vector180DeckTextFitResult;
  readonly diagnostics: readonly Diagnostic[];
}

interface AtomView {
  readonly kind: "atom";
  readonly outline: AtomOutline;
  readonly inventory: AtomInventory;
  readonly resolved: Vector180ResolvedAtom;
  readonly browserFit: Vector180AtomTextFitResult;
  readonly diagnostics: readonly Diagnostic[];
}

type DocumentView = DeckView | AtomView;

interface CombinedFitLine {
  readonly current: FitLine;
  readonly node?: FitLine;
  readonly browser: FitLine;
  readonly status: Vector180TextFitStatus;
  readonly nodeCurrent: boolean;
}

interface WritableFileLike {
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFileLike>;
}

type SaveFilePicker = (options: {
  readonly suggestedName: string;
  readonly types: readonly {
    readonly description: string;
    readonly accept: Readonly<Record<string, readonly string[]>>;
  }[];
}) => Promise<FileHandleLike>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const FIT_SEVERITY: Readonly<Record<Vector180TextFitStatus, number>> = {
  clear: 0,
  "near-limit": 1,
  overflow: 2,
  unverified: 3,
};

const nodes = {
  app: required<HTMLElement>(".app"),
  payload: required<HTMLScriptElement>("#vector180-editor-payload"),
  title: required<HTMLElement>("[data-title]"),
  hash: required<HTMLElement>("[data-hash]"),
  integrity: required<HTMLElement>("[data-integrity]"),
  operationStatus: required<HTMLElement>("[data-operation-status]"),
  navigationTitle: required<HTMLElement>("[data-navigation-title]"),
  navigation: required<HTMLOListElement>("[data-navigation]"),
  deckControls: required<HTMLElement>("[data-deck-controls]"),
  modeView: required<HTMLButtonElement>("[data-mode-view]"),
  modeEdit: required<HTMLButtonElement>("[data-mode-edit]"),
  theme: required<HTMLSelectElement>("[data-theme]"),
  themeApply: required<HTMLButtonElement>("[data-theme-apply]"),
  slideUp: required<HTMLButtonElement>("[data-slide-up]"),
  slideDown: required<HTMLButtonElement>("[data-slide-down]"),
  extract: required<HTMLButtonElement>("[data-extract]"),
  viewport: required<HTMLElement>("[data-viewport]"),
  source: required<HTMLTextAreaElement>("[data-source]"),
  tree: required<HTMLUListElement>("[data-tree]"),
  textEdit: required<HTMLInputElement>("[data-text-edit]"),
  textApply: required<HTMLButtonElement>("[data-text-apply]"),
  textHelp: required<HTMLElement>("[data-text-help]"),
  manipulation: required<HTMLElement>("[data-manipulation]"),
  inspector: required<HTMLElement>("[data-inspector]"),
  diagnostics: required<HTMLUListElement>("[data-diagnostics]"),
  undo: required<HTMLButtonElement>("[data-undo]"),
  redo: required<HTMLButtonElement>("[data-redo]"),
  save: required<HTMLButtonElement>("[data-save]"),
  download: required<HTMLButtonElement>("[data-download]"),
  exportSvg: required<HTMLButtonElement>("[data-export-svg]"),
  exportPng: required<HTMLButtonElement>("[data-export-png]"),
  exportPptx: required<HTMLButtonElement>("[data-export-pptx]"),
  exportMap: required<HTMLButtonElement>("[data-export-map]"),
};

let payload: EditorPayload;
let session: EditorSession;
let view: DocumentView;
let browserMeasurer: Vector180PreparedBrowserTextMeasurer | undefined;
let authenticatedDerivativeFonts:
  readonly Vector180DerivativeFont[] | undefined;
let browserMeasurementError: string | undefined;
let selectedSlideId: string | undefined;
let lastOperationDiagnostics: readonly Diagnostic[] = [];
let fitLinesByObject = new Map<string, CombinedFitLine[]>();
let fileHandle: FileHandleLike | undefined;
let lastSavedSha256: string | undefined;
let editorMode: "view" | "edit" = "view";
let rasterRenderDiagnostics: readonly Diagnostic[] = [];
const rasterObjectUrls = new Map<string, string>();
const verifiedRasterUrls = new Map<string, string>();
let lastDeckExport:
  | {
      readonly sourceSha256: string;
      readonly artifact: Vector180PptxDeckArtifact;
    }
  | undefined;

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  nodes.integrity.textContent = `Editor failed closed: ${message}`;
  nodes.integrity.dataset.ok = "false";
  nodes.operationStatus.textContent = "The embedded editor could not open.";
  nodes.operationStatus.dataset.kind = "error";
  disableWritableControls();
});

async function bootstrap(): Promise<void> {
  payload = parsePayload(nodes.payload.textContent ?? "");
  const sourceBytes = decodeBase64(payload.sourceBase64);
  session = await EditorSession.open(
    {
      kind: "bytes",
      bytes: sourceBytes,
      name: payload.downloadName,
    },
    {
      expectedSha256: payload.sourceSha256,
      author: "vector180-editor/0.1",
    },
  );
  if (
    (session.state.sourceKind === "html" ? "deck" : "atom") !==
    payload.documentKind
  ) {
    throw new Error("Embedded document kind does not match the source bytes.");
  }

  nodes.title.textContent = payload.title ?? payload.downloadName;
  selectedSlideId =
    session.state.sourceKind === "html"
      ? session.state.deck.slideOrder[0]
      : undefined;
  await prepareBrowserMeasurement();
  bindControls();
  recompute();
  render();
}

function parsePayload(serialized: string): EditorPayload {
  const value = JSON.parse(serialized) as Partial<EditorPayload>;
  if (
    value.schema !== "vector180-editor-pack/0.1" ||
    (value.documentKind !== "deck" && value.documentKind !== "atom") ||
    typeof value.sourceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.sourceSha256) ||
    typeof value.sourceBase64 !== "string" ||
    typeof value.downloadName !== "string" ||
    !Array.isArray(value.fonts) ||
    typeof value.nearLimit !== "number" ||
    !Number.isFinite(value.nearLimit) ||
    value.nearLimit <= 0 ||
    value.nearLimit >= 1
  ) {
    throw new Error("Embedded editor payload is invalid.");
  }
  return value as EditorPayload;
}

async function prepareBrowserMeasurement(): Promise<void> {
  try {
    const sources: Vector180BrowserFontSource[] = [];
    for (const font of payload.fonts) {
      const bytes = decodeBase64(font.sourceBase64);
      const actualSha256 = await sha256Hex(bytes);
      if (actualSha256 !== font.sha256) {
        throw new Error(
          `Embedded font "${font.postscriptName}" failed its SHA-256 check.`,
        );
      }
      sources.push({
        family: font.family,
        weight: font.weight,
        style: font.style,
        bytes,
        coverage: {
          method: font.coverage.method,
          checkedCodepoints: [...font.coverage.checkedCodepoints],
          missingCodepoints: [...font.coverage.missingCodepoints],
        },
      });
    }
    browserMeasurer = await prepareVector180BrowserTextMeasurer(sources);
    authenticatedDerivativeFonts = Object.freeze(
      payload.fonts.map((font) => {
        const loaded = browserMeasurer?.fonts.find(
          (candidate) =>
            candidate.family.trim().toLowerCase() ===
              font.family.trim().toLowerCase() &&
            candidate.weight === font.weight &&
            candidate.style === font.style &&
            candidate.sha256 === font.sha256,
        );
        if (loaded === undefined) {
          throw new Error(
            `Embedded font "${font.postscriptName}" did not produce matching browser evidence.`,
          );
        }
        return Object.freeze({
          family: loaded.alias,
          weight: font.weight,
          style: font.style,
          sourceBase64: font.sourceBase64,
        });
      }),
    );
  } catch (error) {
    browserMeasurementError =
      error instanceof Error ? error.message : String(error);
    browserMeasurer = undefined;
    authenticatedDerivativeFonts = undefined;
  }
}

function bindControls(): void {
  nodes.modeView.addEventListener("click", () => setEditorMode("view"));
  nodes.modeEdit.addEventListener("click", () => setEditorMode("edit"));
  nodes.download.addEventListener("click", downloadCurrentSource);
  nodes.exportSvg.addEventListener("click", () => void exportCurrentSvg());
  nodes.exportPng.addEventListener("click", () => void exportCurrentPng());
  nodes.exportPptx.addEventListener(
    "click",
    () => void exportCurrentDeckPptx(),
  );
  nodes.exportMap.addEventListener("click", downloadCurrentDeckMap);
  nodes.undo.addEventListener("click", () => {
    if (!session.undo()) return;
    lastOperationDiagnostics = [];
    lastDeckExport = undefined;
    announce("Undo restored the prior exact source snapshot.", "success");
    recompute();
    render();
  });
  nodes.redo.addEventListener("click", () => {
    if (!session.redo()) return;
    lastOperationDiagnostics = [];
    lastDeckExport = undefined;
    announce("Redo restored the next exact source snapshot.", "success");
    recompute();
    render();
  });
  nodes.textApply.addEventListener("click", () => void applyDirectText());
  nodes.theme.addEventListener("change", renderDeckControls);
  nodes.themeApply.addEventListener("click", () => void applyTheme());
  nodes.slideUp.addEventListener("click", () => void moveSlide(-1));
  nodes.slideDown.addEventListener("click", () => void moveSlide(1));
  nodes.extract.addEventListener("click", () => void extractSelectedSlide());
  nodes.save.addEventListener("click", () => void saveCurrentSource());
  globalThis.addEventListener("beforeunload", revokeRasterObjectUrls, {
    once: true,
  });
}

function recompute(): void {
  const state = session.state;
  if (state.sourceKind === "html") {
    const resolved = resolveVector180Deck(state.deck);
    if (resolved.model === undefined) {
      throw new Error("Current deck no longer resolves through C6.");
    }
    if (
      selectedSlideId === undefined ||
      !state.deck.slides.has(selectedSlideId)
    ) {
      selectedSlideId = state.deck.slideOrder[0];
    }
    view = {
      kind: "deck",
      outline: outlineDeck(state.deck),
      inventory: inventoryDeck(state.deck),
      resolved: resolved.model,
      browserFit: preflightDeckTextFit(resolved.model, browserMeasure, {
        nearLimit: payload.nearLimit,
      }),
      diagnostics: resolved.diagnostics,
    };
  } else {
    const resolved = resolveVector180Atom(state.atom);
    if (resolved.model === undefined) {
      throw new Error("Current diagram no longer resolves through C6.");
    }
    view = {
      kind: "atom",
      outline: outlineAtom(state.atom),
      inventory: inventoryAtom(state.atom),
      resolved: resolved.model,
      browserFit: preflightAtomTextFit(resolved.model, browserMeasure, {
        nearLimit: payload.nearLimit,
      }),
      diagnostics: resolved.diagnostics,
    };
  }
  fitLinesByObject = combineFitEvidence(
    payload.nodeTextFit.lines,
    view.browserFit.lines,
  );
}

function browserMeasure(
  request: Parameters<
    NonNullable<Vector180PreparedBrowserTextMeasurer>["measure"]
  >[0],
): Vector180TextMeasurement {
  if (browserMeasurer !== undefined) return browserMeasurer.measure(request);
  return {
    kind: "unverified",
    method: "browser-editor-unavailable",
    reason:
      browserMeasurementError ??
      "No exact browser font measurement adapter is available.",
    missingCodepoints: [],
  };
}

function combineFitEvidence(
  nodeLines: readonly FitLine[],
  browserLines: readonly FitLine[],
): Map<string, CombinedFitLine[]> {
  const remainingNode = [...nodeLines];
  const result = new Map<string, CombinedFitLine[]>();
  for (const browser of browserLines) {
    const nodeIndex = remainingNode.findIndex((candidate) =>
      sameLineEvidence(candidate, browser),
    );
    const node =
      nodeIndex < 0 ? undefined : remainingNode.splice(nodeIndex, 1)[0];
    const status =
      node === undefined
        ? worseStatus("unverified", browser.status)
        : worseStatus(node.status, browser.status);
    const combined: CombinedFitLine = {
      current: browser,
      ...(node === undefined ? {} : { node }),
      browser,
      status,
      nodeCurrent: node !== undefined,
    };
    const lines = result.get(browser.objectId) ?? [];
    lines.push(combined);
    result.set(browser.objectId, lines);
  }
  return result;
}

function sameLineEvidence(left: FitLine, right: FitLine): boolean {
  return (
    left.objectId === right.objectId &&
    left.lineIndex === right.lineIndex &&
    left.text === right.text &&
    left.anchor === right.anchor &&
    left.anchorX === right.anchorX &&
    left.frameX === right.frameX &&
    left.frameWidth === right.frameWidth &&
    left.availableWidth === right.availableWidth &&
    left.font.family === right.font.family &&
    left.font.size === right.font.size &&
    left.font.weight === right.font.weight &&
    left.font.style === right.font.style &&
    ("slideId" in left
      ? "slideId" in right && left.slideId === right.slideId
      : "atomId" in right && left.atomId === right.atomId)
  );
}

function worseStatus(
  left: Vector180TextFitStatus,
  right: Vector180TextFitStatus,
): Vector180TextFitStatus {
  return FIT_SEVERITY[left] >= FIT_SEVERITY[right] ? left : right;
}

function render(): void {
  const state = session.state;
  nodes.app.dataset.editorMode = editorMode;
  nodes.modeView.ariaPressed = String(editorMode === "view");
  nodes.modeEdit.ariaPressed = String(editorMode === "edit");
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-edit-only]",
  )) {
    element.hidden = editorMode !== "edit";
  }
  nodes.hash.textContent = state.sourceSha256;
  nodes.source.value = state.sourceText;
  nodes.integrity.textContent = state.editable
    ? "source hash verified"
    : "source integrity failed — read only";
  nodes.integrity.dataset.ok = String(state.editable);
  nodes.modeEdit.disabled = !state.editable;
  nodes.undo.disabled =
    editorMode !== "edit" || !state.editable || !state.canUndo;
  nodes.redo.disabled =
    editorMode !== "edit" || !state.editable || !state.canRedo;
  nodes.save.hidden = getSaveFilePicker() === undefined;
  nodes.save.disabled = !state.editable;
  nodes.download.textContent = "Download source";
  nodes.exportSvg.disabled = !state.editable;
  nodes.exportSvg.textContent =
    state.sourceKind === "html" ? "Selected slide SVG" : "SVG";
  nodes.exportPng.disabled = !state.editable;
  nodes.exportPptx.hidden = state.sourceKind !== "html";
  nodes.exportPptx.disabled = !state.editable;
  const currentDeckExport =
    lastDeckExport !== undefined &&
    lastDeckExport.sourceSha256 === state.sourceSha256;
  nodes.exportMap.hidden = state.sourceKind !== "html" || !currentDeckExport;
  nodes.exportMap.disabled = !currentDeckExport;
  renderNavigation();
  renderTree();
  renderViewport();
  renderTextEditor();
  renderManipulation();
  renderInspector();
  renderDiagnostics();
  renderDeckControls();
}

function renderNavigation(): void {
  if (view.kind === "atom") {
    nodes.navigationTitle.textContent = "Atom";
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slide-button";
    button.ariaCurrent = "true";
    button.textContent = view.outline.atomId;
    button.addEventListener("click", clearSelection);
    item.append(button);
    nodes.navigation.replaceChildren(item);
    return;
  }

  nodes.navigationTitle.textContent = "Slides";
  nodes.navigation.replaceChildren(
    ...view.outline.slides.map((slide, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slide-button";
      button.dataset.slideId = slide.id;
      button.ariaCurrent = String(slide.id === selectedSlideId);
      button.textContent = `${index + 1}. ${slide.id}${
        slide.hidden ? " (hidden)" : ""
      }`;
      button.addEventListener("click", () => {
        selectedSlideId = slide.id;
        clearSelection();
      });
      item.append(button);
      return item;
    }),
  );
}

function renderTree(): void {
  const objects =
    view.kind === "deck"
      ? (view.inventory.slides.find(({ id }) => id === selectedSlideId)
          ?.objects ?? [])
      : view.inventory.objects;
  nodes.tree.replaceChildren(
    ...objects.map((object) =>
      objectTree(
        object as {
          readonly id: string;
          readonly role: string;
          readonly children: readonly unknown[];
        },
      ),
    ),
  );
}

function objectTree(object: {
  readonly id: string;
  readonly role: string;
  readonly children: readonly unknown[];
}): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.className = "object-button";
  button.type = "button";
  button.dataset.objectId = object.id;
  button.ariaCurrent = String(object.id === session.state.selectedId);
  button.textContent = `${object.id} · ${object.role}`;
  button.addEventListener("click", () => selectObject(object.id));
  item.append(button);
  if (object.children.length > 0) {
    const children = document.createElement("ul");
    children.className = "object-children";
    children.append(
      ...object.children.map((child) =>
        objectTree(
          child as {
            readonly id: string;
            readonly role: string;
            readonly children: readonly unknown[];
          },
        ),
      ),
    );
    item.append(children);
  }
  return item;
}

function renderViewport(): void {
  rasterRenderDiagnostics = [];
  const container =
    view.kind === "deck"
      ? view.resolved.slides.find(({ id }) => id === selectedSlideId)
      : view.resolved;
  if (container === undefined) {
    nodes.viewport.replaceChildren();
    return;
  }
  const svg = svgElement("svg");
  svg.classList.add("vector180-preview");
  svg.setAttribute("viewBox", view.resolved.canvas.viewBox.join(" "));
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    view.kind === "deck"
      ? `Resolved slide ${selectedSlideId ?? ""}`
      : `Resolved diagram ${view.outline.atomId}`,
  );
  const objects =
    view.kind === "deck"
      ? (container as Vector180ResolvedDeck["slides"][number]).objects
      : view.resolved.objects;
  for (const object of objects) svg.append(renderResolvedObject(object));
  const selected = findResolvedObject(session.state.selectedId);
  if (editorMode === "edit" && selected !== undefined) {
    svg.append(renderSelectionOverlay(selected));
  }
  svg.addEventListener("click", (event) => {
    if (event.target === svg) clearSelection();
  });
  nodes.viewport.replaceChildren(svg);
}

function renderResolvedObject(object: ResolvedObject): SVGElement {
  let element: SVGElement;
  if (object.kind === "group") {
    element = svgElement("g");
    element.setAttribute(
      "transform",
      `translate(${object.translateX} ${object.translateY})`,
    );
    for (const child of object.children) {
      element.append(renderResolvedObject(child));
    }
  } else if (object.kind === "rect") {
    element = svgElement("rect");
    setAttributes(element, {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rx: object.rx,
      ry: object.ry,
    });
    applyStyle(element, object.style);
  } else if (object.kind === "ellipse") {
    element = svgElement("ellipse");
    setAttributes(element, {
      cx: object.cx,
      cy: object.cy,
      rx: object.rx,
      ry: object.ry,
    });
    applyStyle(element, object.style);
  } else if (object.kind === "line") {
    element = svgElement("line");
    setAttributes(element, {
      x1: object.x1,
      y1: object.y1,
      x2: object.x2,
      y2: object.y2,
    });
    applyStyle(element, object.style);
  } else if (object.kind === "text") {
    const group = svgElement("g");
    const text = svgElement("text");
    applyStyle(text, object.style);
    for (const line of object.lines) {
      const tspan = svgElement("tspan");
      setAttributes(tspan, { x: line.x, y: line.y });
      tspan.textContent = line.text;
      text.append(tspan);
    }
    group.append(text);
    const fitStatus = objectFitStatus(object.id);
    if (fitStatus !== "clear") {
      const overlay = svgElement("rect");
      overlay.classList.add("fit-overlay");
      overlay.dataset.fitStatus = fitStatus;
      setAttributes(overlay, {
        x: object.frame.x,
        y: object.frame.y,
        width: object.frame.width,
        height: object.frame.height,
      });
      group.append(overlay);
    }
    element = group;
  } else if (object.kind === "svg-asset") {
    element = svgElement("g");
    const boundary = svgElement("rect");
    setAttributes(boundary, {
      x: object.localBounds.x,
      y: object.localBounds.y,
      width: object.localBounds.width,
      height: object.localBounds.height,
    });
    boundary.setAttribute("fill", "none");
    boundary.setAttribute("stroke", "#8d7cff");
    boundary.setAttribute("stroke-width", "2");
    boundary.setAttribute("stroke-dasharray", "8 6");
    element.append(boundary);
  } else if (object.kind === "raster-asset") {
    const trustedUrl = trustedRasterObjectUrl(object);
    if (trustedUrl === undefined) {
      element = svgElement("g");
      const boundary = svgElement("rect");
      setAttributes(boundary, {
        x: object.localBounds.x,
        y: object.localBounds.y,
        width: object.localBounds.width,
        height: object.localBounds.height,
      });
      boundary.classList.add("raster-placeholder");
      element.append(boundary);
    } else {
      element = svgElement("image");
      setAttributes(element, {
        x: object.localBounds.x,
        y: object.localBounds.y,
        width: object.localBounds.width,
        height: object.localBounds.height,
        href: trustedUrl,
        preserveAspectRatio: "xMidYMid meet",
      });
    }
  } else {
    element = svgElement("g");
  }
  element.dataset.vector180ObjectId = object.id;
  element.dataset.selected = String(object.id === session.state.selectedId);
  element.dataset.fitStatus = objectFitStatus(object.id);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    selectObject(object.id);
  });
  return element;
}

function renderSelectionOverlay(object: ResolvedObject): SVGElement {
  const group = svgElement("g");
  group.classList.add("selection-overlay");
  group.dataset.selectionOverlay = object.id;
  const boundary = svgElement("rect");
  const minimumExtent = 2;
  const width = Math.max(object.worldBounds.width, minimumExtent);
  const height = Math.max(object.worldBounds.height, minimumExtent);
  setAttributes(boundary, {
    x: object.worldBounds.x - (width - object.worldBounds.width) / 2,
    y: object.worldBounds.y - (height - object.worldBounds.height) / 2,
    width,
    height,
  });
  group.append(boundary);
  for (const [x, y] of [
    [object.worldBounds.x, object.worldBounds.y],
    [
      object.worldBounds.x + object.worldBounds.width,
      object.worldBounds.y + object.worldBounds.height,
    ],
  ] as const) {
    const handle = svgElement("circle");
    setAttributes(handle, { cx: x, cy: y, r: 5 });
    group.append(handle);
  }
  return group;
}

function trustedRasterObjectUrl(
  object: Extract<ResolvedObject, { kind: "raster-asset" }>,
): string | undefined {
  const state = session.state;
  const verificationKey = `${state.sourceSha256}:${object.id}:${object.resource.sha256}`;
  const verifiedUrl = verifiedRasterUrls.get(verificationKey);
  if (verifiedUrl !== undefined) return verifiedUrl;

  const recovered = recoverTrustedInlinePng(
    state.document,
    object.id,
    object.resource,
    state.editable,
  );
  if (!recovered.ok) {
    rasterRenderDiagnostics = [
      ...rasterRenderDiagnostics,
      recovered.diagnostic,
    ];
    return undefined;
  }

  let url = rasterObjectUrls.get(recovered.descriptor.sha256);
  if (url === undefined) {
    url = URL.createObjectURL(
      new Blob([recovered.bytes.slice().buffer], { type: "image/png" }),
    );
    rasterObjectUrls.set(recovered.descriptor.sha256, url);
  }
  verifiedRasterUrls.set(verificationKey, url);
  return url;
}

function revokeRasterObjectUrls(): void {
  for (const url of rasterObjectUrls.values()) URL.revokeObjectURL(url);
  rasterObjectUrls.clear();
  verifiedRasterUrls.clear();
}

function objectFitStatus(objectId: string): Vector180TextFitStatus {
  return (fitLinesByObject.get(objectId) ?? []).reduce<Vector180TextFitStatus>(
    (status, line) => worseStatus(status, line.status),
    "clear",
  );
}

function applyStyle(element: SVGElement, style: ResolvedObject["style"]): void {
  setAttributes(element, {
    fill: style.fill,
    stroke: style.stroke,
    "stroke-width": style.strokeWidth,
    opacity: style.opacity,
    "font-family": browserRenderFontFamily(style),
    "font-size": style.fontSize,
    "font-weight": style.fontWeight,
    "font-style": style.fontStyle,
    "text-anchor": style.textAnchor,
  });
}

function browserRenderFontFamily(
  style: ResolvedObject["style"],
): string | undefined {
  if (style.fontFamily === undefined) return undefined;
  return (
    browserMeasurer?.fonts.find(
      (font) =>
        font.family.trim().toLowerCase() ===
          style.fontFamily?.trim().toLowerCase() &&
        font.weight === style.fontWeight &&
        font.style === style.fontStyle,
    )?.alias ?? style.fontFamily
  );
}

function setAttributes(
  element: Element,
  attributes: Readonly<Record<string, string | number | undefined>>,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) element.setAttribute(name, String(value));
  }
}

function renderTextEditor(): void {
  const state = session.state;
  const object = findSelectedNode(state);
  const directText =
    object?.role === "text" && object.directTextRange !== undefined;
  nodes.textEdit.value = object?.role === "text" ? (object.text ?? "") : "";
  nodes.textEdit.disabled =
    editorMode !== "edit" || !state.editable || !directText;
  nodes.textApply.disabled =
    editorMode !== "edit" || !state.editable || !directText;
  nodes.textHelp.textContent =
    object?.role !== "text"
      ? "Select one direct-text object."
      : directText
        ? "Apply commits one hash-bound C5 text replacement. No wrapping or repair occurs."
        : "This text has structured hard lines and is read-only in the direct-text editor.";
}

function renderManipulation(): void {
  nodes.manipulation.replaceChildren();
  if (editorMode !== "edit") return;
  const state = session.state;
  const object = findResolvedObject(state.selectedId);
  const node = findSelectedNode(state);
  if (object === undefined || node === undefined) {
    nodes.manipulation.append(
      manipulationHelp("Select one native object to edit its exact fields."),
    );
    return;
  }
  if (!state.editable) {
    nodes.manipulation.append(
      manipulationHelp("Source integrity must pass before edits are enabled."),
    );
    return;
  }
  if (node.exportMode !== "native" || node.opaque) {
    nodes.manipulation.append(
      manipulationHelp(
        object.kind === "raster-asset"
          ? "This authenticated picture is immutable. Replace, move, resize, crop, effects, deletion, duplication, and reorder remain review-required."
          : "This object is opaque or non-native and remains read-only.",
      ),
    );
    return;
  }

  const geometry = geometryEditor(object, node);
  if (geometry !== undefined) nodes.manipulation.append(geometry);
  if (
    object.kind === "rect" ||
    object.kind === "ellipse" ||
    object.kind === "line" ||
    object.kind === "text"
  ) {
    nodes.manipulation.append(styleEditor(object));
  }
  nodes.manipulation.append(orderEditor(object), deletionEditor(object));
}

function geometryEditor(
  object: ResolvedObject,
  node: Vector180Node,
): HTMLElement | undefined {
  if (object.kind === "rect") {
    return numericEditor(
      "Rectangle geometry",
      [
        numberField("x", "X", object.x),
        numberField("y", "Y", object.y),
        numberField("width", "Width", object.width, { positive: true }),
        numberField("height", "Height", object.height, { positive: true }),
      ],
      "geometry",
      hasDirectAttributes(object.id, ["x", "y", "width", "height"]),
      (values) =>
        dispatch(
          {
            kind: "set-object-geometry",
            id: object.id,
            geometry: {
              kind: "rect",
              x: values.x!,
              y: values.y!,
              width: values.width!,
              height: values.height!,
            },
          },
          `Updated rectangle geometry "${object.id}".`,
        ),
    );
  }
  if (object.kind === "ellipse") {
    if (object.sourceElement !== "ellipse") {
      return manipulationHelp(
        "Circle representation cannot be converted into ellipse geometry by the typed editor.",
      );
    }
    return numericEditor(
      "Ellipse geometry",
      [
        numberField("cx", "Center X", object.cx),
        numberField("cy", "Center Y", object.cy),
        numberField("rx", "Radius X", object.rx, { positive: true }),
        numberField("ry", "Radius Y", object.ry, { positive: true }),
      ],
      "geometry",
      hasDirectAttributes(object.id, ["cx", "cy", "rx", "ry"]),
      (values) =>
        dispatch(
          {
            kind: "set-object-geometry",
            id: object.id,
            geometry: {
              kind: "ellipse",
              cx: values.cx!,
              cy: values.cy!,
              rx: values.rx!,
              ry: values.ry!,
            },
          },
          `Updated ellipse geometry "${object.id}".`,
        ),
    );
  }
  if (object.kind === "line") {
    return numericEditor(
      "Connector endpoints",
      [
        numberField("x1", "Start X", object.x1),
        numberField("y1", "Start Y", object.y1),
        numberField("x2", "End X", object.x2),
        numberField("y2", "End Y", object.y2),
      ],
      "endpoints",
      hasDirectAttributes(object.id, ["x1", "y1", "x2", "y2"]),
      (values) =>
        dispatch(
          {
            kind: "set-connector-endpoints",
            id: object.id,
            endpoints: {
              x1: values.x1!,
              y1: values.y1!,
              x2: values.x2!,
              y2: values.y2!,
            },
          },
          `Updated connector endpoints "${object.id}".`,
        ),
    );
  }
  if (object.kind === "group") {
    return numericEditor(
      "Group translation",
      [
        numberField("x", "Translate X", object.translateX),
        numberField("y", "Translate Y", object.translateY),
      ],
      "translation",
      hasDirectAttributes(object.id, ["transform"]),
      (values) =>
        dispatch(
          {
            kind: "set-group-translation",
            id: object.id,
            translation: { x: values.x!, y: values.y! },
          },
          `Updated group translation "${object.id}".`,
        ),
    );
  }
  if (
    object.kind === "text" &&
    object.lines.length === 1 &&
    node.directTextRange !== undefined
  ) {
    const line = object.lines[0]!;
    return numericEditor(
      "Text frame and hard-line anchor",
      [
        numberField("x", "Frame X", object.frame.x),
        numberField("y", "Frame Y", object.frame.y),
        numberField("width", "Frame width", object.frame.width, {
          positive: true,
        }),
        numberField("height", "Frame height", object.frame.height, {
          positive: true,
        }),
        numberField("anchorX", "Line anchor X", line.x),
        numberField("anchorY", "Baseline Y", line.y),
      ],
      "text-frame",
      hasDirectAttributes(object.id, ["data-vector180-frame", "x", "y"]),
      (values) =>
        dispatch(
          {
            kind: "set-text-frame",
            id: object.id,
            frame: {
              x: values.x!,
              y: values.y!,
              width: values.width!,
              height: values.height!,
            },
            lineAnchor: { x: values.anchorX!, y: values.anchorY! },
          },
          `Updated text frame and anchor "${object.id}".`,
        ),
    );
  }
  return object.kind === "text"
    ? manipulationHelp(
        "Structured multiline text remains read-only; no wrapping or rich-text approximation is available.",
      )
    : undefined;
}

interface NumberField {
  readonly name: string;
  readonly label: string;
  readonly value: number;
  readonly positive: boolean;
}

function numberField(
  name: string,
  label: string,
  value: number,
  options: { readonly positive?: boolean } = {},
): NumberField {
  return { name, label, value, positive: options.positive ?? false };
}

function numericEditor(
  title: string,
  fields: readonly NumberField[],
  kind: string,
  editable: boolean,
  commit: (values: Readonly<Record<string, number>>) => Promise<void>,
): HTMLElement {
  const section = manipulationSection(title);
  const form = document.createElement("form");
  form.className = "field-form";
  form.dataset.manipulationForm = kind;
  for (const field of fields) {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.name = field.name;
    input.value = String(field.value);
    input.disabled = !editable;
    if (field.positive) input.min = "0.000000000001";
    label.append(input);
    form.append(label);
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Apply";
  button.disabled = !editable;
  form.append(button);
  if (!editable) {
    form.append(
      manipulationHelp(
        "These values are inherited, implicit, or not represented by the required direct attributes.",
      ),
    );
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values: Record<string, number> = {};
    for (const field of fields) {
      const input = form.elements.namedItem(field.name);
      const value =
        input instanceof HTMLInputElement ? input.valueAsNumber : Number.NaN;
      if (!Number.isFinite(value) || (field.positive && value <= 0)) {
        announce(`${field.label} must be a valid finite number.`, "error");
        return;
      }
      values[field.name] = value;
    }
    if (fields.every((field) => values[field.name] === field.value)) {
      announce("No numeric value changed.", "info");
      return;
    }
    void commit(values);
  });
  section.append(form);
  return section;
}

function styleEditor(object: ResolvedObject): HTMLElement {
  const section = manipulationSection("Direct native style");
  const form = document.createElement("form");
  form.className = "field-form style-form";
  form.dataset.manipulationForm = "style";
  const oldStyle = concreteStyle(object);
  const definitions: ReadonlyArray<{
    readonly key: keyof Vector180ConcreteNativeStyle;
    readonly label: string;
    readonly attribute: string;
    readonly kind: "text" | "number" | "weight" | "font-style" | "anchor";
    readonly value: string | number | undefined;
  }> = [
    {
      key: "fill",
      label: "Fill",
      attribute: "fill",
      kind: "text",
      value: oldStyle.fill,
    },
    {
      key: "stroke",
      label: "Stroke",
      attribute: "stroke",
      kind: "text",
      value: oldStyle.stroke,
    },
    {
      key: "strokeWidth",
      label: "Stroke width",
      attribute: "stroke-width",
      kind: "number",
      value: oldStyle.strokeWidth,
    },
    {
      key: "opacity",
      label: "Opacity",
      attribute: "opacity",
      kind: "number",
      value: oldStyle.opacity,
    },
    {
      key: "fontFamily",
      label: "Font family",
      attribute: "font-family",
      kind: "text",
      value: oldStyle.fontFamily,
    },
    {
      key: "fontSize",
      label: "Font size",
      attribute: "font-size",
      kind: "number",
      value: oldStyle.fontSize,
    },
    {
      key: "fontWeight",
      label: "Font weight",
      attribute: "font-weight",
      kind: "weight",
      value: oldStyle.fontWeight,
    },
    {
      key: "fontStyle",
      label: "Font style",
      attribute: "font-style",
      kind: "font-style",
      value: oldStyle.fontStyle,
    },
    {
      key: "textAnchor",
      label: "Text anchor",
      attribute: "text-anchor",
      kind: "anchor",
      value: oldStyle.textAnchor,
    },
  ];
  let directCount = 0;
  for (const definition of definitions) {
    if (definition.value === undefined) continue;
    const direct = directStyleProperty(
      object.id,
      object.styleProvenance,
      definition.key,
      definition.attribute,
    );
    if (direct) directCount += 1;
    const label = document.createElement("label");
    label.textContent = definition.label;
    label.dataset.direct = String(direct);
    let control: HTMLInputElement | HTMLSelectElement;
    if (
      definition.kind === "weight" ||
      definition.kind === "font-style" ||
      definition.kind === "anchor"
    ) {
      const select = document.createElement("select");
      const values =
        definition.kind === "weight"
          ? ["400", "700"]
          : definition.kind === "font-style"
            ? ["normal", "italic"]
            : ["start", "middle", "end"];
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
      control = select;
    } else {
      const input = document.createElement("input");
      input.type = definition.kind;
      if (definition.kind === "number") input.step = "any";
      control = input;
    }
    control.name = definition.key;
    control.value = String(definition.value);
    control.disabled = !direct;
    label.append(control);
    form.append(label);
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Apply style";
  button.disabled = directCount === 0;
  form.append(button);
  const note = manipulationHelp(
    "Only fields backed by direct presentation attributes are writable; inherited or inline values stay locked.",
  );
  form.append(note);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fill = stringFormValue(form, "fill").toLowerCase();
    const stroke = stringFormValue(form, "stroke").toLowerCase();
    const strokeWidth = numberFormValue(form, "strokeWidth");
    const opacity = numberFormValue(form, "opacity");
    const fontFamily = optionalStringFormValue(form, "fontFamily");
    const fontSize = optionalNumberFormValue(form, "fontSize");
    const fontWeight = Number(stringFormValue(form, "fontWeight"));
    const fontStyle = stringFormValue(form, "fontStyle");
    const textAnchor = stringFormValue(form, "textAnchor");
    if (
      !/^(?:none|#[0-9a-f]{6})$/u.test(fill) ||
      !/^(?:none|#[0-9a-f]{6})$/u.test(stroke) ||
      !Number.isFinite(strokeWidth) ||
      strokeWidth < 0 ||
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1 ||
      (fontSize !== undefined &&
        (!Number.isFinite(fontSize) || fontSize <= 0)) ||
      (fontWeight !== 400 && fontWeight !== 700) ||
      (fontStyle !== "normal" && fontStyle !== "italic") ||
      (textAnchor !== "start" &&
        textAnchor !== "middle" &&
        textAnchor !== "end")
    ) {
      announce(
        "Style values must match the strict native paint and typography profile.",
        "error",
      );
      return;
    }
    const style: Vector180ConcreteNativeStyle = {
      fill,
      stroke,
      strokeWidth,
      opacity,
      ...(fontFamily === undefined ? {} : { fontFamily }),
      ...(fontSize === undefined ? {} : { fontSize }),
      fontWeight,
      fontStyle,
      textAnchor,
    };
    if (sameConcreteStyle(style, oldStyle)) {
      announce("No direct style value changed.", "info");
      return;
    }
    void dispatch(
      { kind: "set-native-style", id: object.id, style },
      `Updated direct native style "${object.id}".`,
    );
  });
  section.append(form);
  return section;
}

function orderEditor(object: ResolvedObject): HTMLElement {
  const section = manipulationSection("Sibling painter order");
  const context = siblingContext(object);
  if (context === undefined) {
    section.append(
      manipulationHelp(
        "The selected object's exact sibling order is unavailable.",
      ),
    );
    return section;
  }
  const row = document.createElement("div");
  row.className = "button-row";
  const backward = document.createElement("button");
  backward.type = "button";
  backward.dataset.orderBackward = "";
  backward.textContent = "Send backward";
  backward.disabled =
    context.index <= 0 ||
    !isEntirelyNativeNode(sourceNodeById(context.order[context.index - 1]));
  backward.addEventListener("click", () => void moveSibling(object.id, -1));
  const forward = document.createElement("button");
  forward.type = "button";
  forward.dataset.orderForward = "";
  forward.textContent = "Bring forward";
  forward.disabled =
    context.index >= context.order.length - 1 ||
    !isEntirelyNativeNode(sourceNodeById(context.order[context.index + 1]));
  forward.addEventListener("click", () => void moveSibling(object.id, 1));
  row.append(backward, forward);
  section.append(row);
  return section;
}

function deletionEditor(object: ResolvedObject): HTMLElement {
  const section = manipulationSection("Safe deletion");
  const safeSubtree = isEntirelyNativeNode(sourceNodeById(object.id));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger-button";
  button.dataset.deleteObject = "";
  button.textContent = `Delete ${object.id}`;
  button.disabled = !safeSubtree;
  button.addEventListener(
    "click",
    () =>
      void dispatch(
        { kind: "delete-object", id: object.id },
        `Deleted native object "${object.id}". Undo remains available.`,
      ),
  );
  section.append(
    button,
    manipulationHelp(
      safeSubtree
        ? "Deletion fails closed when a surviving connector references this object or the source slice is unsafe."
        : "Deletion is unavailable because this subtree contains an opaque or non-native asset.",
    ),
  );
  return section;
}

function manipulationSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "manipulation-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function manipulationHelp(message: string): HTMLElement {
  const help = document.createElement("small");
  help.className = "manipulation-help";
  help.textContent = message;
  return help;
}

function hasDirectAttributes(id: string, names: readonly string[]): boolean {
  const indexed = session.state.document.index.objects.get(id);
  return (
    indexed !== undefined &&
    names.every((name) => indexed.attributeRanges.has(name))
  );
}

function directStyleProperty(
  id: string,
  provenance: Vector180StyleProvenance,
  key: keyof Vector180ConcreteNativeStyle,
  attribute: string,
): boolean {
  return (
    provenance[key]?.origin === "presentation-attribute" &&
    hasDirectAttributes(id, [attribute])
  );
}

function concreteStyle(object: ResolvedObject): Vector180ConcreteNativeStyle {
  return {
    fill: object.style.fill,
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    opacity: object.style.opacity,
    ...(object.style.fontFamily === undefined
      ? {}
      : { fontFamily: object.style.fontFamily }),
    ...(object.style.fontSize === undefined
      ? {}
      : { fontSize: object.style.fontSize }),
    fontWeight: object.style.fontWeight,
    fontStyle: object.style.fontStyle,
    textAnchor: object.style.textAnchor,
  };
}

function sameConcreteStyle(
  left: Vector180ConcreteNativeStyle,
  right: Vector180ConcreteNativeStyle,
): boolean {
  return (
    left.fill === right.fill &&
    left.stroke === right.stroke &&
    left.strokeWidth === right.strokeWidth &&
    left.opacity === right.opacity &&
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.fontStyle === right.fontStyle &&
    left.textAnchor === right.textAnchor
  );
}

function stringFormValue(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement
    ? control.value.trim()
    : "";
}

function optionalStringFormValue(
  form: HTMLFormElement,
  name: string,
): string | undefined {
  const control = form.elements.namedItem(name);
  if (!(
    control instanceof HTMLInputElement || control instanceof HTMLSelectElement
  )) {
    return undefined;
  }
  const value = control.value.trim();
  return value === "" ? undefined : value;
}

function numberFormValue(form: HTMLFormElement, name: string): number {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement
    ? control.valueAsNumber
    : Number.NaN;
}

function optionalNumberFormValue(
  form: HTMLFormElement,
  name: string,
): number | undefined {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement
    ? control.valueAsNumber
    : undefined;
}

function siblingContext(object: ResolvedObject):
  | {
      readonly parentId: string;
      readonly order: readonly string[];
      readonly index: number;
    }
  | undefined {
  const parentId =
    object.parentId ?? ("slideId" in object ? object.slideId : object.atomId);
  const roots =
    view.kind === "deck"
      ? view.resolved.slides.find(({ id }) => id === parentId)?.objects
      : parentId === view.resolved.atomId
        ? view.resolved.objects
        : undefined;
  const parent = findResolvedObject(parentId);
  const children =
    roots ?? (parent?.kind === "group" ? parent.children : undefined);
  if (children === undefined) return undefined;
  const order = children.map(({ id }) => id);
  const index = order.indexOf(object.id);
  return index < 0 ? undefined : { parentId, order, index };
}

async function moveSibling(id: string, delta: -1 | 1): Promise<void> {
  const object = findResolvedObject(id);
  if (object === undefined) return;
  const context = siblingContext(object);
  if (context === undefined) return;
  const target = context.index + delta;
  if (target < 0 || target >= context.order.length) return;
  if (!isEntirelyNativeNode(sourceNodeById(context.order[target]))) {
    announce(
      "Painter-order edit refused: an opaque or non-native sibling cannot move.",
      "error",
    );
    return;
  }
  const order = [...context.order];
  [order[context.index], order[target]] = [
    order[target]!,
    order[context.index]!,
  ];
  await dispatch(
    { kind: "set-child-order", parentId: context.parentId, order },
    `Moved "${id}" ${delta < 0 ? "backward" : "forward"} in sibling painter order.`,
  );
}

function renderInspector(): void {
  const state = session.state;
  const object = findResolvedObject(state.selectedId);
  const values: Array<readonly [string, string]> = [];
  if (object === undefined) {
    if (view.kind === "deck") {
      const slide = view.outline.slides.find(
        ({ id }) => id === selectedSlideId,
      );
      values.push(
        ["Slide", slide?.id ?? "—"],
        ["Layout", slide?.layout ?? "—"],
        ["Hidden", String(slide?.hidden ?? false)],
        ["Theme", view.outline.activeTheme ?? "—"],
      );
    } else {
      values.push(
        ["Atom", view.outline.atomId],
        ["ViewBox", view.outline.viewBox.join(" ")],
      );
    }
  } else {
    values.push(
      ["Stable ID", object.id],
      ["Kind", object.kind],
      [
        "Parent",
        object.parentId ?? (view.kind === "deck" ? "slide" : "diagram"),
      ],
      [
        "Bounds",
        `${object.worldBounds.x}, ${object.worldBounds.y}, ${object.worldBounds.width} × ${object.worldBounds.height}`,
      ],
      [
        "Text",
        object.kind === "text"
          ? object.lines.map(({ text }) => text).join("\n")
          : "—",
      ],
    );
    const fit = fitLinesByObject.get(object.id) ?? [];
    for (const line of fit) {
      values.push(
        [`Line ${line.current.lineIndex + 1} fit`, line.status],
        [
          `Line ${line.current.lineIndex + 1} Node`,
          line.nodeCurrent && line.node !== undefined
            ? formatFitEvidence(line.node)
            : "unverified — embedded Fontkit evidence is stale for this edited line",
        ],
        [
          `Line ${line.current.lineIndex + 1} browser`,
          formatFitEvidence(line.browser),
        ],
      );
    }
  }
  if (browserMeasurer !== undefined) {
    values.push(
      [
        "Browser engine",
        `${browserMeasurer.environment.engine} ${browserMeasurer.environment.engineVersion}`,
      ],
      [
        "Browser platform",
        `${browserMeasurer.environment.platform}; DPR ${browserMeasurer.environment.devicePixelRatio}`,
      ],
      [
        "Exact browser fonts",
        browserMeasurer.fonts.length === 0
          ? "none"
          : browserMeasurer.fonts
              .map(({ family, sha256 }) => `${family} ${sha256.slice(0, 12)}`)
              .join(", "),
      ],
    );
  } else {
    values.push([
      "Browser fit",
      `unverified — ${browserMeasurementError ?? "adapter unavailable"}`,
    ]);
  }

  const list = document.createElement("dl");
  for (const [label, value] of values) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    list.append(term, detail);
  }
  nodes.inspector.replaceChildren(list);
}

function formatFitEvidence(line: FitLine): string {
  const width =
    line.measuredWidth === null
      ? "width unverified"
      : `${line.measuredWidth.toFixed(3)} / ${line.availableWidth.toFixed(3)}`;
  const identity =
    line.fontIdentity === undefined ? "" : ` · ${line.fontIdentity}`;
  const reason = line.reason === undefined ? "" : ` · ${line.reason}`;
  return `${line.status} · ${width} · ${line.method}${identity}${reason}`;
}

function renderDiagnostics(): void {
  const state = session.state;
  const entries = [
    ...state.diagnostics,
    ...view.diagnostics,
    ...rasterRenderDiagnostics,
    ...lastOperationDiagnostics,
    ...(browserMeasurementError === undefined
      ? []
      : [
          {
            code: "VECTOR180-EDITOR-C8-UNVERIFIED",
            severity: "warning" as const,
            message: browserMeasurementError,
          },
        ]),
  ];
  const visible =
    entries.length > 0
      ? entries
      : [
          {
            code: "VECTOR180-EDITOR-READY",
            severity: "info" as const,
            message:
              "Exact source is open through the shared C4/C5 session. Preview and projections are fresh C6 data.",
          },
        ];
  nodes.diagnostics.replaceChildren(
    ...visible.map((entry) => {
      const item = document.createElement("li");
      item.className = "diagnostic";
      item.dataset.severity = entry.severity;
      item.textContent = `${entry.code}: ${entry.message}`;
      return item;
    }),
  );
}

function renderDeckControls(): void {
  const state = session.state;
  const isDeck = view.kind === "deck" && state.sourceKind === "html";
  nodes.deckControls.hidden = !isDeck;
  if (!isDeck) return;

  const selectedTheme = nodes.theme.value;
  nodes.theme.replaceChildren(
    ...[...state.deck.themes.keys()].map((themeId) => {
      const option = document.createElement("option");
      option.value = themeId;
      option.textContent = themeId;
      return option;
    }),
  );
  nodes.theme.value = state.deck.themes.has(selectedTheme)
    ? selectedTheme
    : (state.deck.activeTheme ?? "");
  nodes.theme.disabled = editorMode !== "edit" || !state.editable;
  nodes.themeApply.disabled =
    editorMode !== "edit" ||
    !state.editable ||
    nodes.theme.value === state.deck.activeTheme;

  const index = state.deck.slideOrder.indexOf(selectedSlideId ?? "");
  nodes.slideUp.disabled =
    editorMode !== "edit" || !state.editable || index <= 0;
  nodes.slideDown.disabled =
    editorMode !== "edit" ||
    !state.editable ||
    index < 0 ||
    index >= state.deck.slideOrder.length - 1;
  nodes.extract.disabled = !state.editable || selectedSlideId === undefined;
}

async function applyDirectText(): Promise<void> {
  const id = session.state.selectedId;
  if (id === undefined) return;
  await dispatch(
    {
      kind: "set-text",
      id,
      value: nodes.textEdit.value,
    },
    `Updated direct text "${id}".`,
  );
}

async function applyTheme(): Promise<void> {
  if (session.state.sourceKind !== "html") return;
  await dispatch(
    { kind: "set-active-theme", theme: nodes.theme.value },
    `Applied theme "${nodes.theme.value}".`,
  );
}

async function moveSlide(delta: -1 | 1): Promise<void> {
  const state = session.state;
  if (state.sourceKind !== "html" || selectedSlideId === undefined) return;
  const order = [...state.deck.slideOrder];
  const index = order.indexOf(selectedSlideId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target]!, order[index]!];
  await dispatch(
    { kind: "set-slide-order", order },
    `Moved slide "${selectedSlideId}" ${delta < 0 ? "up" : "down"}.`,
  );
}

async function dispatch(
  intent: Parameters<EditorSession["dispatch"]>[0],
  successMessage: string,
): Promise<void> {
  const result = await session.dispatch(intent);
  lastOperationDiagnostics = result.diagnostics;
  if (result.applied) {
    lastDeckExport = undefined;
    announce(successMessage, "success");
    recompute();
    render();
    return;
  }
  announce(
    result.diagnostics[0]?.message ??
      "The edit failed without changing source.",
    "error",
  );
  render();
}

async function extractSelectedSlide(): Promise<void> {
  const state = session.state;
  if (
    state.sourceKind !== "html" ||
    !state.editable ||
    selectedSlideId === undefined
  )
    return;
  const sourceSha256 = state.sourceSha256;
  const slideId = selectedSlideId;
  const result = await extractVector180Atom(state.deck, slideId);
  if (session.state.sourceSha256 !== sourceSha256) {
    recordExportError(
      "VECTOR180-EDITOR-SVG-STALE",
      "SVG export refused because canonical source changed while hydration was running.",
    );
    return;
  }
  lastOperationDiagnostics = result.diagnostics;
  if (result.sourceText === undefined) {
    announce(
      result.diagnostics[0]?.message ?? "Slide extraction failed.",
      "error",
    );
    renderDiagnostics();
    return;
  }
  downloadBytes(
    new TextEncoder().encode(result.sourceText),
    `${slideId}.vector180.svg`,
    "image/svg+xml;charset=utf-8",
  );
  announce(
    `Downloaded hydrated standalone diagram "${slideId}.vector180.svg".`,
    "success",
  );
  renderDiagnostics();
}

async function exportCurrentSvg(): Promise<void> {
  const state = session.state;
  if (!state.editable) return;
  if (state.sourceKind === "html") {
    await extractSelectedSlide();
    return;
  }
  downloadBytes(
    state.document.source.bytes,
    payload.downloadName,
    "image/svg+xml;charset=utf-8",
  );
  announce(`Exported canonical SVG "${payload.downloadName}".`, "success");
}

async function exportCurrentPng(): Promise<void> {
  const state = session.state;
  if (!state.editable) return;
  const sourceSha256 = state.sourceSha256;
  const visualId = currentVisualId();

  // Reconstruct the derivative input from current exact source immediately
  // before cloning it. The extant preview DOM is convenience state and never
  // becomes an alternate export authority.
  recompute();
  render();
  const preview =
    nodes.viewport.querySelector<SVGSVGElement>(".vector180-preview");
  if (preview === null) {
    recordExportError(
      "VECTOR180-EDITOR-PNG-PREVIEW",
      "PNG export requires one current resolved SVG preview.",
    );
    return;
  }
  nodes.exportPng.disabled = true;
  announce("Rendering the selected visual as a browser-bound PNG…", "info");
  try {
    const derivative = await renderVector180PreviewPng(preview, {
      fonts: derivativeFonts(),
      rasterDataUris: currentRasterDataUris(),
    });
    if (session.state.sourceSha256 !== sourceSha256) {
      throw new Error(
        "PNG export refused because canonical source changed while rendering was running.",
      );
    }
    const filename = `${visualId}.png`;
    downloadBlob(derivative.blob, filename);
    announce(
      `Exported ${filename} at ${derivative.widthPixels} × ${derivative.heightPixels}; PNG output is bound to this browser renderer.`,
      "success",
    );
  } catch (error) {
    recordExportError(
      "VECTOR180-EDITOR-PNG-EXPORT",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    render();
  }
}

function derivativeFonts(): readonly Vector180DerivativeFont[] {
  if (payload.fonts.length === 0) return [];
  if (authenticatedDerivativeFonts === undefined) {
    throw new Error(
      `PNG export requires authenticated browser font bytes: ${
        browserMeasurementError ?? "font preparation did not complete"
      }.`,
    );
  }
  return authenticatedDerivativeFonts;
}

async function exportCurrentDeckPptx(): Promise<void> {
  const state = session.state;
  if (state.sourceKind !== "html" || !state.editable) return;
  const sourceSha256 = state.sourceSha256;
  nodes.exportPptx.disabled = true;
  announce("Compiling the complete mapped deck to editable PPTX…", "info");
  try {
    const artifact = await compileVector180PptxDeck(state.deck);
    if (session.state.sourceSha256 !== sourceSha256) {
      throw new Error(
        "PPTX export refused because canonical source changed while compilation was running.",
      );
    }
    lastDeckExport = { sourceSha256, artifact };
    lastOperationDiagnostics = artifact.diagnostics;
    const filename = `${deckExportStem()}.pptx`;
    downloadBytes(
      artifact.pptxBytes,
      filename,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    announce(
      `Exported editable ${filename}; its descriptor-only mapping is ready for a separate download.`,
      "success",
    );
  } catch (error) {
    lastDeckExport = undefined;
    recordExportError(
      "VECTOR180-EDITOR-PPTX-EXPORT",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    render();
  }
}

function downloadCurrentDeckMap(): void {
  const state = session.state;
  if (
    state.sourceKind !== "html" ||
    lastDeckExport === undefined ||
    lastDeckExport.sourceSha256 !== state.sourceSha256
  ) {
    recordExportError(
      "VECTOR180-EDITOR-PPTX-MAP-STALE",
      "Compile the current deck before downloading its mapping sidecar.",
    );
    return;
  }
  const filename = `${deckExportStem()}.vector180.deck.map.json`;
  downloadBytes(
    new TextEncoder().encode(lastDeckExport.artifact.mapText),
    filename,
    "application/json;charset=utf-8",
  );
  announce(`Downloaded descriptor-only mapping "${filename}".`, "success");
}

function currentRasterDataUris(): ReadonlyMap<string, string> {
  const state = session.state;
  const result = new Map<string, string>();
  visitResolvedObjects(currentResolvedRoots(), (object) => {
    if (object.kind !== "raster-asset") return;
    const recovered = recoverTrustedInlinePng(
      state.document,
      object.id,
      object.resource,
      state.editable,
    );
    if (!recovered.ok) throw new Error(recovered.diagnostic.message);
    result.set(
      object.id,
      `data:image/png;base64,${encodeBase64(recovered.bytes)}`,
    );
  });
  return result;
}

function currentResolvedRoots(): readonly ResolvedObject[] {
  if (view.kind === "atom") return view.resolved.objects;
  return (
    view.resolved.slides.find(({ id }) => id === selectedSlideId)?.objects ?? []
  );
}

function visitResolvedObjects(
  objects: readonly ResolvedObject[],
  visitor: (object: ResolvedObject) => void,
): void {
  for (const object of objects) {
    visitor(object);
    if (object.kind === "group") visitResolvedObjects(object.children, visitor);
  }
}

function currentVisualId(): string {
  return view.kind === "deck"
    ? (selectedSlideId ?? "slide")
    : view.resolved.atomId;
}

function deckExportStem(): string {
  const suffix = ".vector180.html";
  return payload.downloadName.endsWith(suffix)
    ? payload.downloadName.slice(0, -suffix.length)
    : payload.downloadName;
}

function recordExportError(code: string, message: string): void {
  lastOperationDiagnostics = [{ code, severity: "error", message }];
  announce(message, "error");
  renderDiagnostics();
}

function downloadCurrentSource(): void {
  downloadBytes(
    session.state.document.source.bytes,
    payload.downloadName,
    payload.downloadMime,
  );
  announce(
    `Downloaded exact current source "${payload.downloadName}".`,
    "success",
  );
}

function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  downloadBlob(new Blob([bytes.slice().buffer], { type: mime }), name);
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function saveCurrentSource(): Promise<void> {
  const picker = getSaveFilePicker();
  if (picker === undefined || !session.state.editable) return;
  try {
    if (fileHandle === undefined) {
      fileHandle = await picker({
        suggestedName: payload.downloadName,
        types: [
          {
            description:
              payload.documentKind === "deck"
                ? "Vector180 HTML deck"
                : "Vector180 SVG diagram",
            accept: {
              [payload.downloadMime.split(";")[0]!]: [
                payload.documentKind === "deck"
                  ? ".vector180.html"
                  : ".vector180.svg",
              ],
            },
          },
        ],
      });
    } else if (lastSavedSha256 !== undefined) {
      const diskBytes = new Uint8Array(
        await (await fileHandle.getFile()).arrayBuffer(),
      );
      const diskSha256 = await sha256Hex(diskBytes);
      if (diskSha256 !== lastSavedSha256) {
        announce(
          "Save refused: the selected file changed on disk after the last editor save.",
          "error",
        );
        return;
      }
    }

    const current = session.state.document.source;
    const writable = await fileHandle.createWritable();
    await writable.write(current.bytes.slice().buffer);
    await writable.close();
    lastSavedSha256 = current.sha256;
    announce(`Saved exact current source to "${fileHandle.name}".`, "success");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      announce("Save cancelled.", "info");
      return;
    }
    announce(
      `Save failed: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

function getSaveFilePicker(): SaveFilePicker | undefined {
  const candidate = (
    globalThis as typeof globalThis & {
      showSaveFilePicker?: SaveFilePicker;
    }
  ).showSaveFilePicker;
  return typeof candidate === "function"
    ? candidate.bind(globalThis)
    : undefined;
}

function selectObject(id: string): void {
  if (!session.select(id)) return;
  render();
}

function setEditorMode(mode: "view" | "edit"): void {
  if (mode === "edit" && !session.state.editable) {
    announce(
      "Edit mode is unavailable until source integrity passes.",
      "error",
    );
    return;
  }
  if (editorMode === mode) return;
  editorMode = mode;
  announce(
    mode === "edit"
      ? "Edit mode enabled. Every Apply action commits one hash-bound transaction."
      : "View mode enabled. Source mutation controls are hidden.",
    "info",
  );
  render();
}

function clearSelection(): void {
  session.select();
  render();
}

function findSelectedNode(
  state: EditorSessionState,
): Vector180Node | undefined {
  const id = state.selectedId;
  if (id === undefined) return undefined;
  return sourceNodeById(id, state);
}

function sourceNodeById(
  id: string | undefined,
  state: EditorSessionState = session.state,
): Vector180Node | undefined {
  if (id === undefined) return undefined;
  const roots =
    state.sourceKind === "html"
      ? [...state.deck.slides.values()].flatMap(({ children }) => children)
      : state.atom.children;
  return findNode(roots, id);
}

function isEntirelyNativeNode(node: Vector180Node | undefined): boolean {
  return (
    node !== undefined &&
    node.exportMode === "native" &&
    !node.opaque &&
    node.children.every(isEntirelyNativeNode)
  );
}

function findNode(
  roots: readonly Vector180Node[],
  id: string,
): Vector180Node | undefined {
  for (const node of roots) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function findResolvedObject(
  id: string | undefined,
): ResolvedObject | undefined {
  if (id === undefined) return undefined;
  const roots =
    view.kind === "deck"
      ? (view.resolved.slides.find(({ id }) => id === selectedSlideId)
          ?.objects ?? [])
      : view.resolved.objects;
  return findResolved(roots, id);
}

function findResolved(
  roots: readonly ResolvedObject[],
  id: string,
): ResolvedObject | undefined {
  for (const object of roots) {
    if (object.id === id) return object;
    if (object.kind === "group") {
      const child = findResolved(object.children, id);
      if (child !== undefined) return child;
    }
  }
  return undefined;
}

function announce(message: string, kind: "success" | "error" | "info"): void {
  nodes.operationStatus.textContent = message;
  nodes.operationStatus.dataset.kind = kind;
}

function disableWritableControls(): void {
  for (const control of [
    nodes.undo,
    nodes.redo,
    nodes.save,
    nodes.modeEdit,
    nodes.textEdit,
    nodes.textApply,
    nodes.theme,
    nodes.themeApply,
    nodes.slideUp,
    nodes.slideDown,
    nodes.extract,
    nodes.exportSvg,
    nodes.exportPng,
    nodes.exportPptx,
    nodes.exportMap,
  ]) {
    control.disabled = true;
  }
}

function svgElement(name: string): SVGElement {
  return document.createElementNS(SVG_NAMESPACE, name);
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Embedded base64 data is invalid.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join(""));
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Editor wrapper is missing required element ${selector}.`);
  }
  return element;
}
