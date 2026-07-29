/**
 * Exact-source browser editor session and history.
 *
 * The session never treats a live DOM as canonical. Every committed intent is
 * translated to a C5 patch, reloaded through C4, and stored as a complete
 * source/hash snapshot so undo can restore lexical spelling byte-for-byte.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 */

import { loadDeck } from "../core/deck.js";
import { hasErrors } from "../core/source.js";
import type {
  Diagnostic,
  PatchResult,
  PptvDeck,
  PptvInput,
  PptvNode,
  PptvOperation,
} from "../core/types.js";
import { applyPatch } from "../ops/patch.js";

const DEFAULT_HISTORY_LIMIT = 100;

export type EditorIntent =
  | { kind: "set-text"; id: string; value: string }
  | { kind: "set-active-theme"; theme: string }
  | { kind: "set-slide-order"; order: string[] };

export interface EditorSessionOptions {
  expectedSha256?: string;
  historyLimit?: number;
  author?: string;
}

export interface EditorSnapshot {
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly deck: PptvDeck;
}

export interface EditorSessionState {
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly originalSha256: string;
  readonly deck: PptvDeck;
  readonly diagnostics: readonly Diagnostic[];
  readonly selectedId?: string;
  readonly dirty: boolean;
  readonly editable: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export class EditorSession {
  readonly originalSha256: string;

  private readonly integrityDiagnostics: Diagnostic[];
  private readonly historyLimit: number;
  private readonly author: string | undefined;
  private history: EditorSnapshot[];
  private historyIndex = 0;
  private selectedId: string | undefined;
  private transactionSequence = 0;

  private constructor(deck: PptvDeck, options: EditorSessionOptions) {
    this.originalSha256 = deck.source.sha256;
    this.history = [snapshot(deck)];
    this.historyLimit = normalizeHistoryLimit(options.historyLimit);
    this.author = options.author;
    this.integrityDiagnostics =
      options.expectedSha256 === undefined ||
      options.expectedSha256 === deck.source.sha256
        ? []
        : [
            {
              code: "PPTV-EDITOR-INTEGRITY",
              severity: "error",
              message: `Embedded source hash ${deck.source.sha256} does not match expected hash ${options.expectedSha256}.`,
            },
          ];
  }

  static async open(
    input: PptvInput,
    options: EditorSessionOptions = {},
  ): Promise<EditorSession> {
    return new EditorSession(await loadDeck(input), options);
  }

  get state(): EditorSessionState {
    const current = this.current;
    const diagnostics = [
      ...this.integrityDiagnostics,
      ...current.deck.diagnostics,
    ];
    return {
      sourceText: current.sourceText,
      sourceSha256: current.sourceSha256,
      originalSha256: this.originalSha256,
      deck: current.deck,
      diagnostics,
      ...(this.selectedId === undefined ? {} : { selectedId: this.selectedId }),
      dirty: current.sourceSha256 !== this.originalSha256,
      editable: !hasErrors(diagnostics),
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    };
  }

  select(id?: string): boolean {
    if (id === undefined) {
      this.selectedId = undefined;
      return true;
    }
    if (!hasStableTarget(this.current.deck, id)) return false;
    this.selectedId = id;
    return true;
  }

  async dispatch(
    intent: EditorIntent | readonly EditorIntent[],
  ): Promise<PatchResult> {
    const current = this.current;
    const intents = Array.isArray(intent) ? intent : [intent];
    const gateDiagnostics = [
      ...this.integrityDiagnostics,
      ...current.deck.diagnostics,
    ].filter(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    );
    if (gateDiagnostics.length > 0) {
      return rejectedResult(
        current,
        "PPTV-EDITOR-READ-ONLY",
        "The editor session is read-only until source and integrity diagnostics are resolved.",
        gateDiagnostics,
      );
    }

    const decoded = intents.map((candidate) =>
      intentToOperation(current.deck, candidate),
    );
    const intentDiagnostics = decoded.flatMap(
      (candidate) => candidate.diagnostics,
    );
    if (hasErrors(intentDiagnostics)) {
      return {
        applied: false,
        originalSha256: current.sourceSha256,
        affectedIds: [],
        edits: [],
        diagnostics: intentDiagnostics,
      };
    }

    this.transactionSequence += 1;
    const result = await applyPatch(current.deck, {
      schema: "pptv-patch/0.1",
      baseSha256: current.sourceSha256,
      transactionId: `editor-${this.transactionSequence}`,
      ...(this.author === undefined ? {} : { author: this.author }),
      ops: decoded.flatMap((candidate) =>
        candidate.operation === undefined ? [] : [candidate.operation],
      ),
    });
    if (!result.applied || result.deck === undefined) return result;

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot(result.deck));
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
    this.historyIndex = this.history.length - 1;
    if (
      this.selectedId !== undefined &&
      !hasStableTarget(result.deck, this.selectedId)
    ) {
      this.selectedId = undefined;
    }
    return result;
  }

  undo(): boolean {
    if (this.historyIndex === 0) return false;
    this.historyIndex -= 1;
    this.reconcileSelection();
    return true;
  }

  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) return false;
    this.historyIndex += 1;
    this.reconcileSelection();
    return true;
  }

  private get current(): EditorSnapshot {
    return this.history[this.historyIndex]!;
  }

  private reconcileSelection(): void {
    if (
      this.selectedId !== undefined &&
      !hasStableTarget(this.current.deck, this.selectedId)
    ) {
      this.selectedId = undefined;
    }
  }
}

interface DecodedIntent {
  operation?: PptvOperation;
  diagnostics: Diagnostic[];
}

function intentToOperation(
  deck: PptvDeck,
  intent: EditorIntent,
): DecodedIntent {
  if (intent.kind === "set-active-theme") {
    return {
      operation: {
        op: "set-active-theme",
        theme: intent.theme,
        ...(deck.activeTheme === undefined
          ? {}
          : { oldTheme: deck.activeTheme }),
      },
      diagnostics: [],
    };
  }
  if (intent.kind === "set-slide-order") {
    return {
      operation: {
        op: "set-slide-order",
        order: [...intent.order],
        oldOrder: [...deck.slideOrder],
      },
      diagnostics: [],
    };
  }

  const node = findObject(deck, intent.id);
  if (node === undefined) {
    return {
      diagnostics: [
        {
          code: "PPTV-EDITOR-TARGET",
          severity: "error",
          message: `No object has stable ID "${intent.id}".`,
          objectId: intent.id,
        },
      ],
    };
  }
  if (node.role !== "text") {
    return {
      diagnostics: [
        {
          code: "PPTV-EDITOR-TARGET",
          severity: "error",
          message: `Object "${intent.id}" is not editable text.`,
          objectId: intent.id,
        },
      ],
    };
  }
  return {
    operation: {
      op: "set-text",
      id: intent.id,
      oldText: node.text ?? "",
      value: intent.value,
    },
    diagnostics: [],
  };
}

function snapshot(deck: PptvDeck): EditorSnapshot {
  return Object.freeze({
    sourceText: deck.source.text,
    sourceSha256: deck.source.sha256,
    deck,
  });
}

function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new RangeError("Editor historyLimit must be a safe integer >= 2.");
  }
  return value;
}

function findObject(deck: PptvDeck, id: string): PptvNode | undefined {
  for (const slide of deck.slides.values()) {
    const found = findNode(slide.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findNode(
  nodes: readonly PptvNode[],
  id: string,
): PptvNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function hasStableTarget(deck: PptvDeck, id: string): boolean {
  return (
    deck.slides.has(id) ||
    deck.themes.has(id) ||
    deck.libraries.has(id) ||
    deck.index.objects.has(id)
  );
}

function rejectedResult(
  current: EditorSnapshot,
  code: string,
  message: string,
  relatedDiagnostics: readonly Diagnostic[],
): PatchResult {
  return {
    applied: false,
    originalSha256: current.sourceSha256,
    affectedIds: [],
    edits: [],
    diagnostics: [
      {
        code,
        severity: "error",
        message,
        related: relatedDiagnostics.map((diagnostic) => ({
          message: `${diagnostic.code}: ${diagnostic.message}`,
          ...(diagnostic.range === undefined
            ? {}
            : { range: diagnostic.range }),
        })),
      },
    ],
  };
}
