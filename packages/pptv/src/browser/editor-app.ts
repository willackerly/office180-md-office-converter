/**
 * Writable trusted PPTV editor application.
 *
 * This entry is bundled into a deterministic browser IIFE. It opens only the
 * inert exact source bytes embedded by the Node editor-pack generator, commits
 * through EditorSession/C5, and reconstructs previews from fresh C6 data.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.1
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 */

import {
  extractPptvDiagram,
  preflightDiagramTextFit,
  preflightTextFit,
  resolvePptvDeck,
  resolvePptvDiagram,
  sha256Hex,
  type DeckInventory,
  type DeckOutline,
  type Diagnostic,
  type DiagramInventory,
  type DiagramOutline,
  type PptvDiagramTextFitLine,
  type PptvDiagramTextFitResult,
  type PptvNode,
  type PptvResolvedDeck,
  type PptvResolvedDiagram,
  type PptvResolvedDiagramObject,
  type PptvResolvedObject,
  type PptvTextFitLine,
  type PptvTextFitResult,
  type PptvTextFitStatus,
  type PptvTextMeasurement,
} from "../core/index.js";
import {
  inventoryDeck,
  inventoryDiagram,
  outlineDeck,
  outlineDiagram,
} from "../ops/index.js";
import { EditorSession, type EditorSessionState } from "./session.js";
import {
  preparePptvBrowserTextMeasurer,
  type PptvBrowserFontSource,
  type PptvPreparedBrowserTextMeasurer,
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
  readonly schema: "pptv-editor-pack/0.1";
  readonly documentKind: "deck" | "diagram";
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
  readonly resolved: PptvResolvedDeck;
  readonly nodeTextFit: PptvTextFitResult;
}

interface DiagramPayload extends PayloadBase {
  readonly documentKind: "diagram";
  readonly outline: DiagramOutline;
  readonly inventory: DiagramInventory;
  readonly resolved: PptvResolvedDiagram;
  readonly nodeTextFit: PptvDiagramTextFitResult;
}

type EditorPayload = DeckPayload | DiagramPayload;
type ResolvedObject = PptvResolvedObject | PptvResolvedDiagramObject;
type FitLine = PptvTextFitLine | PptvDiagramTextFitLine;

interface DeckView {
  readonly kind: "deck";
  readonly outline: DeckOutline;
  readonly inventory: DeckInventory;
  readonly resolved: PptvResolvedDeck;
  readonly browserFit: PptvTextFitResult;
  readonly diagnostics: readonly Diagnostic[];
}

interface DiagramView {
  readonly kind: "diagram";
  readonly outline: DiagramOutline;
  readonly inventory: DiagramInventory;
  readonly resolved: PptvResolvedDiagram;
  readonly browserFit: PptvDiagramTextFitResult;
  readonly diagnostics: readonly Diagnostic[];
}

type DocumentView = DeckView | DiagramView;

interface CombinedFitLine {
  readonly current: FitLine;
  readonly node?: FitLine;
  readonly browser: FitLine;
  readonly status: PptvTextFitStatus;
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
const FIT_SEVERITY: Readonly<Record<PptvTextFitStatus, number>> = {
  clear: 0,
  "near-limit": 1,
  overflow: 2,
  unverified: 3,
};

const nodes = {
  payload: required<HTMLScriptElement>("#pptv-editor-payload"),
  title: required<HTMLElement>("[data-title]"),
  hash: required<HTMLElement>("[data-hash]"),
  integrity: required<HTMLElement>("[data-integrity]"),
  operationStatus: required<HTMLElement>("[data-operation-status]"),
  navigationTitle: required<HTMLElement>("[data-navigation-title]"),
  navigation: required<HTMLOListElement>("[data-navigation]"),
  deckControls: required<HTMLElement>("[data-deck-controls]"),
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
  inspector: required<HTMLElement>("[data-inspector]"),
  diagnostics: required<HTMLUListElement>("[data-diagnostics]"),
  undo: required<HTMLButtonElement>("[data-undo]"),
  redo: required<HTMLButtonElement>("[data-redo]"),
  save: required<HTMLButtonElement>("[data-save]"),
  download: required<HTMLButtonElement>("[data-download]"),
};

let payload: EditorPayload;
let session: EditorSession;
let view: DocumentView;
let browserMeasurer: PptvPreparedBrowserTextMeasurer | undefined;
let browserMeasurementError: string | undefined;
let selectedSlideId: string | undefined;
let lastOperationDiagnostics: readonly Diagnostic[] = [];
let fitLinesByObject = new Map<string, CombinedFitLine[]>();
let fileHandle: FileHandleLike | undefined;
let lastSavedSha256: string | undefined;

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
      author: "pptv-editor/0.1",
    },
  );
  if (
    (session.state.sourceKind === "html" ? "deck" : "diagram") !==
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
    value.schema !== "pptv-editor-pack/0.1" ||
    (value.documentKind !== "deck" && value.documentKind !== "diagram") ||
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
    const sources: PptvBrowserFontSource[] = [];
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
    browserMeasurer = await preparePptvBrowserTextMeasurer(sources);
  } catch (error) {
    browserMeasurementError =
      error instanceof Error ? error.message : String(error);
    browserMeasurer = undefined;
  }
}

function bindControls(): void {
  nodes.download.addEventListener("click", downloadCurrentSource);
  nodes.undo.addEventListener("click", () => {
    if (!session.undo()) return;
    lastOperationDiagnostics = [];
    announce("Undo restored the prior exact source snapshot.", "success");
    recompute();
    render();
  });
  nodes.redo.addEventListener("click", () => {
    if (!session.redo()) return;
    lastOperationDiagnostics = [];
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
}

function recompute(): void {
  const state = session.state;
  if (state.sourceKind === "html") {
    const resolved = resolvePptvDeck(state.deck);
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
      browserFit: preflightTextFit(resolved.model, browserMeasure, {
        nearLimit: payload.nearLimit,
      }),
      diagnostics: resolved.diagnostics,
    };
  } else {
    const resolved = resolvePptvDiagram(state.diagram);
    if (resolved.model === undefined) {
      throw new Error("Current diagram no longer resolves through C6.");
    }
    view = {
      kind: "diagram",
      outline: outlineDiagram(state.diagram),
      inventory: inventoryDiagram(state.diagram),
      resolved: resolved.model,
      browserFit: preflightDiagramTextFit(resolved.model, browserMeasure, {
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
    NonNullable<PptvPreparedBrowserTextMeasurer>["measure"]
  >[0],
): PptvTextMeasurement {
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
      : "diagramId" in right && left.diagramId === right.diagramId)
  );
}

function worseStatus(
  left: PptvTextFitStatus,
  right: PptvTextFitStatus,
): PptvTextFitStatus {
  return FIT_SEVERITY[left] >= FIT_SEVERITY[right] ? left : right;
}

function render(): void {
  const state = session.state;
  nodes.hash.textContent = state.sourceSha256;
  nodes.source.value = state.sourceText;
  nodes.integrity.textContent = state.editable
    ? "source hash verified"
    : "source integrity failed — read only";
  nodes.integrity.dataset.ok = String(state.editable);
  nodes.undo.disabled = !state.editable || !state.canUndo;
  nodes.redo.disabled = !state.editable || !state.canRedo;
  nodes.save.hidden = getSaveFilePicker() === undefined;
  nodes.save.disabled = !state.editable;
  nodes.download.textContent =
    state.sourceKind === "html" ? "Download deck" : "Download diagram";
  renderNavigation();
  renderTree();
  renderViewport();
  renderTextEditor();
  renderInspector();
  renderDiagnostics();
  renderDeckControls();
}

function renderNavigation(): void {
  if (view.kind === "diagram") {
    nodes.navigationTitle.textContent = "Diagram";
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slide-button";
    button.ariaCurrent = "true";
    button.textContent = view.outline.diagramId;
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
  const container =
    view.kind === "deck"
      ? view.resolved.slides.find(({ id }) => id === selectedSlideId)
      : view.resolved;
  if (container === undefined) {
    nodes.viewport.replaceChildren();
    return;
  }
  const svg = svgElement("svg");
  svg.classList.add("pptv-preview");
  svg.setAttribute("viewBox", view.resolved.canvas.viewBox.join(" "));
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    view.kind === "deck"
      ? `Resolved slide ${selectedSlideId ?? ""}`
      : `Resolved diagram ${view.outline.diagramId}`,
  );
  const objects =
    view.kind === "deck"
      ? (container as PptvResolvedDeck["slides"][number]).objects
      : view.resolved.objects;
  for (const object of objects) svg.append(renderResolvedObject(object));
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
  } else {
    element = svgElement("g");
  }
  element.dataset.pptvObjectId = object.id;
  element.dataset.selected = String(object.id === session.state.selectedId);
  element.dataset.fitStatus = objectFitStatus(object.id);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    selectObject(object.id);
  });
  return element;
}

function objectFitStatus(objectId: string): PptvTextFitStatus {
  return (fitLinesByObject.get(objectId) ?? []).reduce<PptvTextFitStatus>(
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
    "font-family": style.fontFamily,
    "font-size": style.fontSize,
    "font-weight": style.fontWeight,
    "font-style": style.fontStyle,
    "text-anchor": style.textAnchor,
  });
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
  nodes.textEdit.disabled = !state.editable || !directText;
  nodes.textApply.disabled = !state.editable || !directText;
  nodes.textHelp.textContent =
    object?.role !== "text"
      ? "Select one direct-text object."
      : directText
        ? "Apply commits one hash-bound C5 text replacement. No wrapping or repair occurs."
        : "This text has structured hard lines and is read-only in the direct-text editor.";
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
        ["Diagram", view.outline.diagramId],
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
    ...lastOperationDiagnostics,
    ...(browserMeasurementError === undefined
      ? []
      : [
          {
            code: "PPTV-EDITOR-C8-UNVERIFIED",
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
            code: "PPTV-EDITOR-READY",
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
  nodes.theme.disabled = !state.editable;
  nodes.themeApply.disabled =
    !state.editable || nodes.theme.value === state.deck.activeTheme;

  const index = state.deck.slideOrder.indexOf(selectedSlideId ?? "");
  nodes.slideUp.disabled = !state.editable || index <= 0;
  nodes.slideDown.disabled =
    !state.editable || index < 0 || index >= state.deck.slideOrder.length - 1;
  nodes.extract.disabled = selectedSlideId === undefined;
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
  if (state.sourceKind !== "html" || selectedSlideId === undefined) return;
  const result = await extractPptvDiagram(state.deck, selectedSlideId);
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
    `${selectedSlideId}.pptv.svg`,
    "image/svg+xml;charset=utf-8",
  );
  announce(
    `Downloaded hydrated standalone diagram "${selectedSlideId}.pptv.svg".`,
    "success",
  );
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
  const blob = new Blob([bytes.slice().buffer], { type: mime });
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
                ? "PPTV HTML deck"
                : "PPTV SVG diagram",
            accept: {
              [payload.downloadMime.split(";")[0]!]: [
                payload.documentKind === "deck" ? ".pptv.html" : ".pptv.svg",
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

function clearSelection(): void {
  session.select();
  render();
}

function findSelectedNode(state: EditorSessionState): PptvNode | undefined {
  const id = state.selectedId;
  if (id === undefined) return undefined;
  const roots =
    state.sourceKind === "html"
      ? [...state.deck.slides.values()].flatMap(({ children }) => children)
      : state.diagram.children;
  return findNode(roots, id);
}

function findNode(
  roots: readonly PptvNode[],
  id: string,
): PptvNode | undefined {
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
    nodes.textEdit,
    nodes.textApply,
    nodes.theme,
    nodes.themeApply,
    nodes.slideUp,
    nodes.slideDown,
    nodes.extract,
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

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Editor wrapper is missing required element ${selector}.`);
  }
  return element;
}
