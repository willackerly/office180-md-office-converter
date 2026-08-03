/**
 * Deterministic trusted-direct-open editor wrapper generator.
 *
 * Exact deck or diagram bytes are embedded as inert base64 data. Source
 * runtime code is never inserted into wrapper markup or executed. The browser
 * app opens the bytes through the shared C4/C5 session and reconstructs every
 * preview from fresh C6 projections.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.3
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { loadPptvDocument, PptvLoadError } from "../core/deck.js";
import {
  resolvePptvDeck,
  resolvePptvDiagram,
  type PptvResolvedDeck,
  type PptvResolvedDiagram,
} from "../core/resolved.js";
import {
  preflightDiagramTextFit,
  preflightTextFit,
  type PptvDiagramTextFitResult,
  type PptvTextFitResult,
} from "../core/text-fit.js";
import { hasErrors } from "../core/source.js";
import type {
  DeckInventory,
  DeckOutline,
  Diagnostic,
  DiagramInventory,
  DiagramOutline,
  PptvDocument,
  PptvInput,
} from "../core/types.js";
import {
  inventoryDeck,
  inventoryDiagram,
  outlineDeck,
  outlineDiagram,
} from "../ops/projections.js";
import {
  createFontkitTextMeasurer,
  type FontkitFontFace,
  type FontkitLoadedFaceEvidence,
  type FontkitTextMeasureRequest,
  type FontkitTextMeasurement,
  type FontkitTextMeasurer,
} from "./fontkit-text-measurer.js";

const APP_URL = new URL("../../assets/pptv-editor-0.1.app.js", import.meta.url);
const CSS_URL = new URL("../../assets/pptv-editor-0.1.css", import.meta.url);
const DEFAULT_NEAR_LIMIT = 0.9;

export interface EditorPackOptions {
  /**
   * Exact explicit font-map faces to embed for browser C8 evidence.
   * No system discovery or substitution is performed.
   */
  readonly fontFaces?: readonly FontkitFontFace[];
  /** C8 warning threshold. Requires an explicit `fontFaces` option. */
  readonly nearLimit?: number;
}

interface EditorPackFont {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
  readonly sourceBase64: string;
  readonly sha256: string;
  readonly postscriptName: string;
  readonly fullName: string;
  readonly unitsPerEm: number;
  readonly coverage: {
    readonly method: "fontkit/2.0.4-cmap";
    readonly checkedCodepoints: readonly number[];
    readonly missingCodepoints: readonly number[];
  };
}

interface EditorPackPayloadBase {
  readonly schema: "pptv-editor-pack/0.1";
  readonly documentKind: "deck" | "diagram";
  readonly title?: string;
  readonly downloadName: string;
  readonly downloadMime:
    "text/html;charset=utf-8" | "image/svg+xml;charset=utf-8";
  readonly sourceSha256: string;
  readonly sourceBase64: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly fonts: readonly EditorPackFont[];
  readonly nearLimit: number;
}

interface DeckEditorPackPayload extends EditorPackPayloadBase {
  readonly documentKind: "deck";
  readonly outline: DeckOutline;
  readonly inventory: DeckInventory;
  readonly resolved: PptvResolvedDeck;
  readonly nodeTextFit: PptvTextFitResult;
}

interface DiagramEditorPackPayload extends EditorPackPayloadBase {
  readonly documentKind: "diagram";
  readonly outline: DiagramOutline;
  readonly inventory: DiagramInventory;
  readonly resolved: PptvResolvedDiagram;
  readonly nodeTextFit: PptvDiagramTextFitResult;
}

type EditorPackPayload = DeckEditorPackPayload | DiagramEditorPackPayload;

export interface EditorPackResult {
  readonly html?: string;
  readonly documentKind?: "deck" | "diagram";
  readonly sourceSha256?: string;
  readonly diagnostics: Diagnostic[];
}

export async function createEditorPack(
  input: PptvInput,
  options: EditorPackOptions = {},
): Promise<EditorPackResult> {
  validateOptions(options);
  let document: PptvDocument;
  try {
    document = await loadPptvDocument(input);
  } catch (error) {
    if (error instanceof PptvLoadError) {
      return { diagnostics: [...error.diagnostics] };
    }
    throw error;
  }
  if (hasErrors(document.diagnostics)) {
    return { diagnostics: [...document.diagnostics] };
  }

  const nearLimit = options.nearLimit ?? DEFAULT_NEAR_LIMIT;
  const fontMeasurer = await createFontkitTextMeasurer(options.fontFaces ?? []);
  const [app, css] = await Promise.all([
    readFile(APP_URL, "utf8"),
    readFile(CSS_URL, "utf8"),
  ]);

  let payload: EditorPackPayload;
  if (document.sourceKind === "html") {
    const resolved = resolvePptvDeck(document);
    if (resolved.model === undefined) {
      return { diagnostics: [...resolved.diagnostics] };
    }
    const nodeTextFit = preflightTextFit(resolved.model, fontMeasurer, {
      nearLimit,
    });
    const fonts = await embedExactFonts(fontMeasurer, nodeTextFit);
    payload = {
      schema: "pptv-editor-pack/0.1",
      documentKind: "deck",
      ...(document.title === undefined ? {} : { title: document.title }),
      downloadName: canonicalDownloadName(document.source.name, "deck"),
      downloadMime: "text/html;charset=utf-8",
      sourceSha256: document.source.sha256,
      sourceBase64: Buffer.from(document.source.bytes).toString("base64"),
      outline: outlineDeck(document),
      inventory: inventoryDeck(document),
      resolved: resolved.model,
      diagnostics: resolved.diagnostics,
      fonts,
      nearLimit,
      nodeTextFit,
    };
  } else {
    const resolved = resolvePptvDiagram(document);
    if (resolved.model === undefined) {
      return { diagnostics: [...resolved.diagnostics] };
    }
    const nodeTextFit = preflightDiagramTextFit(
      resolved.model,
      fontMeasurer as unknown as (
        request: FontkitTextMeasureRequest,
      ) => FontkitTextMeasurement,
      { nearLimit },
    );
    const fonts = await embedExactFonts(fontMeasurer, nodeTextFit);
    payload = {
      schema: "pptv-editor-pack/0.1",
      documentKind: "diagram",
      title: document.id,
      downloadName: canonicalDownloadName(document.source.name, "diagram"),
      downloadMime: "image/svg+xml;charset=utf-8",
      sourceSha256: document.source.sha256,
      sourceBase64: Buffer.from(document.source.bytes).toString("base64"),
      outline: outlineDiagram(document),
      inventory: inventoryDiagram(document),
      resolved: resolved.model,
      diagnostics: resolved.diagnostics,
      fonts,
      nearLimit,
      nodeTextFit,
    };
  }

  return {
    html: renderWrapper(payload, app, css),
    documentKind: payload.documentKind,
    sourceSha256: document.source.sha256,
    diagnostics: [...payload.diagnostics],
  };
}

function validateOptions(options: EditorPackOptions): void {
  if (options.nearLimit !== undefined && options.fontFaces === undefined) {
    throw new Error(
      "Editor-pack nearLimit requires an explicit fontFaces option.",
    );
  }
  if (
    options.nearLimit !== undefined &&
    (!Number.isFinite(options.nearLimit) ||
      options.nearLimit <= 0 ||
      options.nearLimit >= 1)
  ) {
    throw new RangeError(
      "Editor-pack nearLimit must be greater than 0 and less than 1.",
    );
  }
}

async function embedExactFonts(
  measurer: FontkitTextMeasurer,
  textFit: PptvTextFitResult | PptvDiagramTextFitResult,
): Promise<readonly EditorPackFont[]> {
  return Promise.all(
    measurer.faces.map(async (face) => {
      const bytes = await readFile(face.path);
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== face.sha256) {
        throw new Error(
          `Mapped font changed while building editor pack: "${face.path}".`,
        );
      }
      const checked = new Set<number>();
      const missing = new Set<number>();
      for (const line of textFit.lines) {
        if (!sameFace(line.font, face)) continue;
        for (const codepoint of codepoints(line.text)) checked.add(codepoint);
        for (const codepoint of line.missingCodepoints) missing.add(codepoint);
      }
      return Object.freeze({
        family: face.family,
        weight: face.weight,
        style: face.style,
        sourceBase64: bytes.toString("base64"),
        sha256: face.sha256,
        postscriptName: face.postscriptName,
        fullName: face.fullName,
        unitsPerEm: face.unitsPerEm,
        coverage: Object.freeze({
          method: "fontkit/2.0.4-cmap" as const,
          checkedCodepoints: Object.freeze([...checked].sort(numberOrder)),
          missingCodepoints: Object.freeze([...missing].sort(numberOrder)),
        }),
      });
    }),
  );
}

function sameFace(
  font: {
    readonly family: string;
    readonly weight: 400 | 700;
    readonly style: "normal" | "italic";
  },
  face: FontkitLoadedFaceEvidence,
): boolean {
  return (
    font.family.trim().toLowerCase() === face.family.trim().toLowerCase() &&
    font.weight === face.weight &&
    font.style === face.style
  );
}

function codepoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0)!);
}

function numberOrder(left: number, right: number): number {
  return left - right;
}

function renderWrapper(
  payload: EditorPackPayload,
  app: string,
  css: string,
): string {
  const serializedPayload = safeScriptJson(payload);
  const csp = [
    "default-src 'none'",
    `script-src '${sha256Csp(serializedPayload)}' '${sha256Csp(app)}'`,
    `style-src '${sha256Csp(css)}'`,
    "img-src data:",
    "connect-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <meta name="pptv-editor-runtime" content="pptv-editor/0.1">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">
  <title>PPTV Editor</title>
  <style>${css}</style>
</head>
<body>
  <div class="app">
    <header class="toolbar">
      <div class="toolbar__title">
        <strong data-title>PPTV Editor</strong>
        <small data-hash></small>
      </div>
      <span class="status" data-integrity data-ok="false">verifying source…</span>
      <button type="button" data-undo disabled>Undo</button>
      <button type="button" data-redo disabled>Redo</button>
      <button type="button" data-save hidden>Save file</button>
      <button type="button" data-download>Download source</button>
    </header>
    <div class="operation-status" data-operation-status role="status" aria-live="polite"></div>
    <main class="workspace">
      <nav class="panel" aria-label="Document navigation">
        <h2 data-navigation-title>Slides</h2>
        <ol class="slides" data-navigation></ol>
        <section class="deck-controls" data-deck-controls hidden>
          <h2>Deck</h2>
          <label>
            Theme
            <select data-theme></select>
          </label>
          <button type="button" data-theme-apply>Apply theme</button>
          <div class="button-row">
            <button type="button" data-slide-up>Move slide up</button>
            <button type="button" data-slide-down>Move slide down</button>
          </div>
          <button type="button" data-extract>Download slide SVG</button>
        </section>
      </nav>
      <section class="center" aria-label="PPTV workspace">
        <div class="viewport" data-viewport aria-label="Resolved preview"></div>
        <textarea class="source" data-source readonly spellcheck="false" aria-label="Exact current source"></textarea>
      </section>
      <aside class="panel" aria-label="Object inspector">
        <h2>Objects</h2>
        <ul class="tree" data-tree></ul>
        <h2>Direct text</h2>
        <div class="text-editor">
          <label for="pptv-direct-text">Selected hard line</label>
          <input id="pptv-direct-text" type="text" data-text-edit disabled>
          <button type="button" data-text-apply disabled>Apply text</button>
          <small data-text-help>Select one direct-text object.</small>
        </div>
        <h2>Inspector</h2>
        <div class="inspector" data-inspector></div>
        <h2>Diagnostics</h2>
        <ul class="diagnostics" data-diagnostics></ul>
      </aside>
    </main>
  </div>
  <script id="pptv-editor-payload" type="application/json">${serializedPayload}</script>
  <script>${app}</script>
</body>
</html>
`;
}

function canonicalDownloadName(
  name: string | undefined,
  kind: "deck" | "diagram",
): string {
  const suffix = kind === "deck" ? ".pptv.html" : ".pptv.svg";
  if (name === undefined || name.length === 0) {
    return kind === "deck" ? "deck.pptv.html" : "diagram.pptv.svg";
  }
  const leaf = basename(name);
  return leaf.endsWith(suffix) ? leaf : `${leaf}${suffix}`;
}

function sha256Csp(contents: string): string {
  return `sha256-${createHash("sha256").update(contents).digest("base64")}`;
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
