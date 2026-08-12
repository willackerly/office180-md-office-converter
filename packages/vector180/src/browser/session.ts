/**
 * Exact-source browser editor session and history.
 *
 * The session never treats a live DOM as canonical. Every committed intent is
 * translated to a C5 patch, reloaded through C4, and stored as a complete
 * source/hash snapshot so undo can restore lexical spelling byte-for-byte.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 */

import { loadVector180Document } from "../core/deck.js";
import {
  resolveVector180Atom,
  resolveVector180Deck,
  type Vector180ResolvedAtomObject,
  type Vector180ResolvedObject,
} from "../core/resolved.js";
import { hasErrors } from "../core/source.js";
import type {
  Diagnostic,
  PatchResult,
  Vector180ConcreteNativeStyle,
  Vector180ConnectorEndpoints,
  Vector180Deck,
  Vector180Atom,
  Vector180Document,
  Vector180Input,
  Vector180Node,
  Vector180ObjectGeometry,
  Vector180Operation,
  Vector180PatchBounds,
  Vector180PatchPoint,
} from "../core/types.js";
import { applyPatch } from "../ops/patch.js";

const DEFAULT_HISTORY_LIMIT = 100;

export type EditorIntent =
  | { kind: "set-text"; id: string; value: string }
  | { kind: "set-active-theme"; theme: string }
  | { kind: "set-slide-order"; order: string[] }
  | {
      kind: "set-object-geometry";
      id: string;
      geometry: Vector180ObjectGeometry;
    }
  | {
      kind: "set-connector-endpoints";
      id: string;
      endpoints: Vector180ConnectorEndpoints;
    }
  | {
      kind: "set-group-translation";
      id: string;
      translation: Vector180PatchPoint;
    }
  | {
      kind: "set-text-frame";
      id: string;
      frame: Vector180PatchBounds;
      lineAnchor: Vector180PatchPoint;
    }
  | { kind: "set-child-order"; parentId: string; order: string[] }
  | { kind: "delete-object"; id: string }
  | {
      kind: "set-native-style";
      id: string;
      style: Vector180ConcreteNativeStyle;
    };

export interface EditorSessionOptions {
  expectedSha256?: string;
  historyLimit?: number;
  author?: string;
}

interface EditorSnapshotBase {
  readonly sourceText: string;
  readonly sourceSha256: string;
}

export interface EditorDeckSnapshot extends EditorSnapshotBase {
  readonly sourceKind: "html";
  readonly document: Vector180Deck;
  readonly deck: Vector180Deck;
  readonly atom?: never;
}

export interface EditorAtomSnapshot extends EditorSnapshotBase {
  readonly sourceKind: "svg";
  readonly document: Vector180Atom;
  readonly deck?: never;
  readonly atom: Vector180Atom;
}

export type EditorSnapshot = EditorDeckSnapshot | EditorAtomSnapshot;

interface EditorSessionStateBase {
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly originalSha256: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly selectedId?: string;
  readonly dirty: boolean;
  readonly editable: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface EditorDeckSessionState extends EditorSessionStateBase {
  readonly sourceKind: "html";
  readonly document: Vector180Deck;
  readonly deck: Vector180Deck;
  readonly atom?: never;
}

export interface EditorAtomSessionState extends EditorSessionStateBase {
  readonly sourceKind: "svg";
  readonly document: Vector180Atom;
  readonly deck?: never;
  readonly atom: Vector180Atom;
}

export type EditorSessionState =
  EditorDeckSessionState | EditorAtomSessionState;

export class EditorSession {
  readonly originalSha256: string;

  private readonly integrityDiagnostics: Diagnostic[];
  private readonly historyLimit: number;
  private readonly author: string | undefined;
  private history: EditorSnapshot[];
  private historyIndex = 0;
  private selectedId: string | undefined;
  private transactionSequence = 0;

  private constructor(
    document: Vector180Document,
    options: EditorSessionOptions,
  ) {
    this.originalSha256 = document.source.sha256;
    this.history = [snapshot(document)];
    this.historyLimit = normalizeHistoryLimit(options.historyLimit);
    this.author = options.author;
    this.integrityDiagnostics =
      options.expectedSha256 === undefined ||
      options.expectedSha256 === document.source.sha256
        ? []
        : [
            {
              code: "VECTOR180-EDITOR-INTEGRITY",
              severity: "error",
              message: `Embedded source hash ${document.source.sha256} does not match expected hash ${options.expectedSha256}.`,
            },
          ];
  }

  static async open(
    input: Vector180Input,
    options: EditorSessionOptions = {},
  ): Promise<EditorSession> {
    return new EditorSession(await loadVector180Document(input), options);
  }

  get state(): EditorSessionState {
    const current = this.current;
    const diagnostics = [
      ...this.integrityDiagnostics,
      ...current.document.diagnostics,
    ];
    const common = {
      sourceText: current.sourceText,
      sourceSha256: current.sourceSha256,
      originalSha256: this.originalSha256,
      diagnostics,
      ...(this.selectedId === undefined ? {} : { selectedId: this.selectedId }),
      dirty: current.sourceSha256 !== this.originalSha256,
      editable: !hasErrors(diagnostics),
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    };
    return current.sourceKind === "html"
      ? {
          ...common,
          sourceKind: "html",
          document: current.document,
          deck: current.deck,
        }
      : {
          ...common,
          sourceKind: "svg",
          document: current.document,
          atom: current.atom,
        };
  }

  select(id?: string): boolean {
    if (id === undefined) {
      this.selectedId = undefined;
      return true;
    }
    if (!hasStableTarget(this.current.document, id)) return false;
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
      ...current.document.diagnostics,
    ].filter(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    );
    if (gateDiagnostics.length > 0) {
      return rejectedResult(
        current,
        "VECTOR180-EDITOR-READ-ONLY",
        "The editor session is read-only until source and integrity diagnostics are resolved.",
        gateDiagnostics,
      );
    }

    const decoded = intents.map((candidate) =>
      intentToOperation(current.document, candidate),
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
    const result = await applyPatch(current.document, {
      schema: "vector180-patch/0.1",
      baseSha256: current.sourceSha256,
      transactionId: `editor-${this.transactionSequence}`,
      ...(this.author === undefined ? {} : { author: this.author }),
      ops: decoded.flatMap((candidate) =>
        candidate.operation === undefined ? [] : [candidate.operation],
      ),
    });
    const resultDocument = result.deck ?? result.atom;
    if (!result.applied || resultDocument === undefined) return result;

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot(resultDocument));
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
    this.historyIndex = this.history.length - 1;
    if (
      this.selectedId !== undefined &&
      !hasStableTarget(resultDocument, this.selectedId)
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
      !hasStableTarget(this.current.document, this.selectedId)
    ) {
      this.selectedId = undefined;
    }
  }
}

interface DecodedIntent {
  operation?: Vector180Operation;
  diagnostics: Diagnostic[];
}

function intentToOperation(
  document: Vector180Document,
  intent: EditorIntent,
): DecodedIntent {
  if (intent.kind === "set-active-theme") {
    if (document.sourceKind !== "html" || document.activeTheme === undefined) {
      return {
        diagnostics: [
          {
            code: "VECTOR180-EDITOR-DOCUMENT-KIND",
            severity: "error",
            message: "set-active-theme requires a deck with an active theme.",
          },
        ],
      };
    }
    return {
      operation: {
        op: "set-active-theme",
        theme: intent.theme,
        oldTheme: document.activeTheme,
      },
      diagnostics: [],
    };
  }
  if (intent.kind === "set-slide-order") {
    if (document.sourceKind !== "html") {
      return {
        diagnostics: [
          {
            code: "VECTOR180-EDITOR-DOCUMENT-KIND",
            severity: "error",
            message: "set-slide-order requires a deck.",
          },
        ],
      };
    }
    return {
      operation: {
        op: "set-slide-order",
        order: [...intent.order],
        oldOrder: [...document.slideOrder],
      },
      diagnostics: [],
    };
  }

  if (intent.kind === "set-child-order") {
    const resolved = resolveIntentState(document);
    const parent = resolved.state?.objects.get(intent.parentId);
    const children =
      resolved.state?.roots.get(intent.parentId) ??
      (parent?.kind === "group" ? parent.children : undefined);
    if (children === undefined) {
      return unresolvedIntent(
        intent.parentId,
        `No native container has stable ID "${intent.parentId}".`,
        resolved.diagnostics,
      );
    }
    const sourceChildren = findContainerNodes(document, intent.parentId);
    const movesProtectedChild = sourceChildren?.some(
      (child, index) =>
        !isEntirelyNative(child) && intent.order.indexOf(child.id) !== index,
    );
    if (movesProtectedChild) {
      return {
        diagnostics: [
          {
            code: "VECTOR180-EDITOR-TARGET",
            severity: "error",
            message: `Container "${intent.parentId}" order cannot move an opaque or non-native child.`,
            objectId: intent.parentId,
          },
        ],
      };
    }
    return {
      operation: {
        op: "set-child-order",
        parentId: intent.parentId,
        oldOrder: children.map(({ id }) => id),
        order: [...intent.order],
      },
      diagnostics: [],
    };
  }

  const node = findObject(document, intent.id);
  if (node === undefined) {
    return {
      diagnostics: [
        {
          code: "VECTOR180-EDITOR-TARGET",
          severity: "error",
          message: `No object has stable ID "${intent.id}".`,
          objectId: intent.id,
        },
      ],
    };
  }

  if (intent.kind === "set-text") {
    if (node.role !== "text" || node.exportMode !== "native" || node.opaque) {
      return {
        diagnostics: [
          {
            code: "VECTOR180-EDITOR-TARGET",
            severity: "error",
            message: `Object "${intent.id}" is not editable native text.`,
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

  if (node.exportMode !== "native" || node.opaque) {
    return {
      diagnostics: [
        {
          code: "VECTOR180-EDITOR-TARGET",
          severity: "error",
          message: `Object "${intent.id}" is opaque or non-native and cannot accept a native editor intent.`,
          objectId: intent.id,
        },
      ],
    };
  }

  const resolved = resolveIntentState(document);
  const object = resolved.state?.objects.get(intent.id);
  if (object === undefined) {
    return unresolvedIntent(
      intent.id,
      `Object "${intent.id}" does not have a complete native resolved model.`,
      resolved.diagnostics,
    );
  }

  if (intent.kind === "set-object-geometry") {
    const oldGeometry = objectGeometry(object);
    if (oldGeometry === undefined) {
      return wrongResolvedKind(intent.id, "a native rect or ellipse");
    }
    return {
      operation: {
        op: "set-object-geometry",
        id: intent.id,
        oldGeometry,
        geometry: intent.geometry,
      },
      diagnostics: [],
    };
  }

  if (intent.kind === "set-connector-endpoints") {
    if (object.kind !== "line") {
      return wrongResolvedKind(intent.id, "a native connector");
    }
    return {
      operation: {
        op: "set-connector-endpoints",
        id: intent.id,
        oldEndpoints: {
          x1: object.x1,
          y1: object.y1,
          x2: object.x2,
          y2: object.y2,
        },
        endpoints: intent.endpoints,
      },
      diagnostics: [],
    };
  }

  if (intent.kind === "set-group-translation") {
    if (object.kind !== "group") {
      return wrongResolvedKind(intent.id, "a native group");
    }
    if (!isEntirelyNative(node)) {
      return wrongResolvedKind(
        intent.id,
        "an entirely native group with no protected asset subtree",
      );
    }
    return {
      operation: {
        op: "set-group-translation",
        id: intent.id,
        oldTranslation: { x: object.translateX, y: object.translateY },
        translation: intent.translation,
      },
      diagnostics: [],
    };
  }

  if (intent.kind === "set-text-frame") {
    const line = object.kind === "text" ? object.lines[0] : undefined;
    if (
      object.kind !== "text" ||
      object.lines.length !== 1 ||
      line === undefined
    ) {
      return wrongResolvedKind(intent.id, "one direct native hard text line");
    }
    return {
      operation: {
        op: "set-text-frame",
        id: intent.id,
        oldFrame: { ...object.frame },
        frame: intent.frame,
        oldLineAnchor: { x: line.x, y: line.y },
        lineAnchor: intent.lineAnchor,
      },
      diagnostics: [],
    };
  }

  if (intent.kind === "delete-object") {
    if (!isEntirelyNative(node)) {
      return {
        diagnostics: [
          {
            code: "VECTOR180-EDITOR-TARGET",
            severity: "error",
            message: `Object "${intent.id}" contains an opaque or non-native subtree and cannot be deleted by the trusted editor.`,
            objectId: intent.id,
          },
        ],
      };
    }
    return {
      operation: {
        op: "delete-object",
        id: intent.id,
        oldParentId: object.parentId,
        oldOrder: object.order,
      },
      diagnostics: [],
    };
  }

  return {
    operation: {
      op: "set-native-style",
      id: intent.id,
      oldStyle: concreteStyle(object.style),
      style: intent.style,
    },
    diagnostics: [],
  };
}

function isEntirelyNative(node: Vector180Node): boolean {
  return (
    node.exportMode === "native" &&
    !node.opaque &&
    node.children.every(isEntirelyNative)
  );
}

function findContainerNodes(
  document: Vector180Document,
  parentId: string,
): readonly Vector180Node[] | undefined {
  if (document.sourceKind === "svg") {
    if (document.id === parentId) return document.children;
    const parent = findNode(document.children, parentId);
    return parent?.role === "group" ? parent.children : undefined;
  }
  const slide = document.slides.get(parentId);
  if (slide !== undefined) return slide.children;
  for (const candidate of document.slides.values()) {
    const parent = findNode(candidate.children, parentId);
    if (parent?.role === "group") return parent.children;
  }
  return undefined;
}

type ResolvedIntentObject =
  Vector180ResolvedObject | Vector180ResolvedAtomObject;

interface ResolvedIntentState {
  readonly objects: ReadonlyMap<string, ResolvedIntentObject>;
  readonly roots: ReadonlyMap<string, readonly ResolvedIntentObject[]>;
}

function resolveIntentState(document: Vector180Document): {
  readonly state?: ResolvedIntentState;
  readonly diagnostics: readonly Diagnostic[];
} {
  const result =
    document.sourceKind === "html"
      ? resolveVector180Deck(document)
      : resolveVector180Atom(document);
  if (result.model === undefined) return { diagnostics: result.diagnostics };
  const objects = new Map<string, ResolvedIntentObject>();
  const roots = new Map<string, readonly ResolvedIntentObject[]>();
  if (result.model.schema === "vector180-resolved-deck/0.1") {
    for (const slide of result.model.slides) {
      roots.set(slide.id, slide.objects);
      indexResolvedIntentObjects(slide.objects, objects);
    }
  } else {
    roots.set(result.model.atomId, result.model.objects);
    indexResolvedIntentObjects(result.model.objects, objects);
  }
  return { state: { objects, roots }, diagnostics: result.diagnostics };
}

function indexResolvedIntentObjects(
  values: readonly ResolvedIntentObject[],
  target: Map<string, ResolvedIntentObject>,
): void {
  for (const value of values) {
    target.set(value.id, value);
    if (value.kind === "group") {
      indexResolvedIntentObjects(value.children, target);
    }
  }
}

function objectGeometry(
  object: ResolvedIntentObject,
): Vector180ObjectGeometry | undefined {
  if (object.kind === "rect") {
    return {
      kind: "rect",
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    };
  }
  if (object.kind === "ellipse") {
    return {
      kind: "ellipse",
      cx: object.cx,
      cy: object.cy,
      rx: object.rx,
      ry: object.ry,
    };
  }
  return undefined;
}

function concreteStyle(
  style: ResolvedIntentObject["style"],
): Vector180ConcreteNativeStyle {
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    ...(style.fontFamily === undefined ? {} : { fontFamily: style.fontFamily }),
    ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textAnchor: style.textAnchor,
  };
}

function unresolvedIntent(
  objectId: string,
  message: string,
  relatedDiagnostics: readonly Diagnostic[],
): DecodedIntent {
  return {
    diagnostics: [
      {
        code: "VECTOR180-EDITOR-RESOLVED",
        severity: "error",
        message,
        objectId,
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

function wrongResolvedKind(id: string, expected: string): DecodedIntent {
  return {
    diagnostics: [
      {
        code: "VECTOR180-EDITOR-TARGET",
        severity: "error",
        message: `Object "${id}" is not ${expected}.`,
        objectId: id,
      },
    ],
  };
}

function snapshot(document: Vector180Document): EditorSnapshot {
  const common = {
    sourceText: document.source.text,
    sourceSha256: document.source.sha256,
  };
  return document.sourceKind === "html"
    ? Object.freeze({
        ...common,
        sourceKind: "html" as const,
        document,
        deck: document,
      })
    : Object.freeze({
        ...common,
        sourceKind: "svg" as const,
        document,
        atom: document,
      });
}

function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new RangeError("Editor historyLimit must be a safe integer >= 2.");
  }
  return value;
}

function findObject(
  document: Vector180Document,
  id: string,
): Vector180Node | undefined {
  if (document.sourceKind === "svg") {
    return findNode(document.children, id);
  }
  for (const slide of document.slides.values()) {
    const found = findNode(slide.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findNode(
  nodes: readonly Vector180Node[],
  id: string,
): Vector180Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function hasStableTarget(document: Vector180Document, id: string): boolean {
  if (document.sourceKind === "svg") {
    return document.id === id || document.index.objects.has(id);
  }
  return (
    document.slides.has(id) ||
    document.themes.has(id) ||
    document.libraries.has(id) ||
    document.index.objects.has(id)
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
