/**
 * Deterministic trusted-direct-open editor wrapper generator.
 *
 * Canonical deck bytes are embedded as base64 data. They are never parsed as
 * wrapper markup, and their viewer runtime is therefore never executed.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { loadDeck, PptvLoadError } from "../core/deck.js";
import { resolvePptvDeck, type PptvResolvedDeck } from "../core/resolved.js";
import { hasErrors } from "../core/source.js";
import type {
  DeckInventory,
  DeckOutline,
  Diagnostic,
  PptvInput,
} from "../core/types.js";
import { inventoryDeck, outlineDeck } from "../ops/projections.js";

const APP_URL = new URL("../../assets/pptv-editor-0.1.app.js", import.meta.url);
const CSS_URL = new URL("../../assets/pptv-editor-0.1.css", import.meta.url);

interface EditorPackPayload {
  schema: "pptv-editor-pack/0.1";
  title?: string;
  downloadName: string;
  sourceSha256: string;
  sourceBase64: string;
  outline: DeckOutline;
  inventory: DeckInventory;
  resolved: PptvResolvedDeck;
  diagnostics: readonly Diagnostic[];
}

export interface EditorPackResult {
  html?: string;
  sourceSha256?: string;
  diagnostics: Diagnostic[];
}

export async function createEditorPack(
  input: PptvInput,
): Promise<EditorPackResult> {
  let deck;
  try {
    deck = await loadDeck(input);
  } catch (error) {
    if (error instanceof PptvLoadError) {
      return { diagnostics: [...error.diagnostics] };
    }
    throw error;
  }
  if (hasErrors(deck.diagnostics)) {
    return { diagnostics: [...deck.diagnostics] };
  }
  const resolved = resolvePptvDeck(deck);
  if (resolved.model === undefined) {
    return { diagnostics: [...resolved.diagnostics] };
  }

  const [app, css] = await Promise.all([
    readFile(APP_URL, "utf8"),
    readFile(CSS_URL, "utf8"),
  ]);
  const payload: EditorPackPayload = {
    schema: "pptv-editor-pack/0.1",
    ...(deck.title === undefined ? {} : { title: deck.title }),
    downloadName: canonicalDownloadName(deck.source.name),
    sourceSha256: deck.source.sha256,
    sourceBase64: Buffer.from(deck.source.bytes).toString("base64"),
    outline: outlineDeck(deck),
    inventory: inventoryDeck(deck),
    resolved: resolved.model,
    diagnostics: resolved.diagnostics,
  };

  return {
    html: renderWrapper(payload, app, css),
    sourceSha256: deck.source.sha256,
    diagnostics: [...resolved.diagnostics],
  };
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
    "img-src blob: data:",
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
      <button type="button" data-download>Download clean deck</button>
    </header>
    <main class="workspace">
      <nav class="panel" aria-label="Slides">
        <h2>Slides</h2>
        <ol class="slides" data-slides></ol>
      </nav>
      <section class="center" aria-label="Deck workspace">
        <div class="viewport" data-viewport aria-label="Resolved slide preview"></div>
        <textarea class="source" data-source readonly spellcheck="false" aria-label="Exact canonical source"></textarea>
      </section>
      <aside class="panel" aria-label="Object inspector">
        <h2>Objects</h2>
        <ul class="tree" data-tree></ul>
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

function canonicalDownloadName(name: string | undefined): string {
  if (name === undefined || name.length === 0) return "deck.pptv.html";
  const leaf = basename(name);
  return leaf.endsWith(".pptv.html") ? leaf : `${leaf}.pptv.html`;
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
