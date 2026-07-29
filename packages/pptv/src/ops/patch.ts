/**
 * Hash-bound, all-or-nothing PPTV source patching.
 *
 * CONTRACT:C5-PPTV-PATCH.1.0
 */

import { loadDeck, PptvLoadError } from "../core/deck.js";
import { STABLE_ID_PATTERN } from "../core/manifest.js";
import { hasErrors } from "../core/source.js";
import type {
  AppliedSourceEdit,
  Diagnostic,
  PatchResult,
  PptvDeck,
  PptvNode,
  PptvOperation,
  PptvPatch,
  SetActiveThemeOperation,
  SetSlideOrderOperation,
  SetTextOperation,
} from "../core/types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_XML_TEXT =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u;

interface PatchPlan {
  patch?: PptvPatch;
  edits: AppliedSourceEdit[];
  affectedIds: string[];
  diagnostics: Diagnostic[];
}

export async function validatePatch(
  deck: PptvDeck,
  input: unknown,
): Promise<Diagnostic[]> {
  const trusted = await reloadPatchBase(deck);
  return trusted.deck === undefined
    ? trusted.diagnostics
    : [...trusted.diagnostics, ...planPatch(trusted.deck, input).diagnostics];
}

export async function applyPatch(
  deck: PptvDeck,
  input: unknown,
): Promise<PatchResult> {
  const trusted = await reloadPatchBase(deck);
  if (trusted.deck === undefined) {
    return {
      applied: false,
      originalSha256: deck.source.sha256,
      affectedIds: [],
      edits: [],
      diagnostics: trusted.diagnostics,
    };
  }
  const trustedDeck = trusted.deck;
  const plan = planPatch(trustedDeck, input);
  plan.diagnostics.unshift(...trusted.diagnostics);
  if (plan.patch === undefined || hasErrors(plan.diagnostics)) {
    return {
      applied: false,
      originalSha256: trustedDeck.source.sha256,
      affectedIds: [],
      edits: [],
      diagnostics: plan.diagnostics,
    };
  }

  const edits = [...plan.edits].sort(
    (left, right) => right.range.charStart - left.range.charStart,
  );
  let candidateSource = trustedDeck.source.text;
  for (const edit of edits) {
    candidateSource =
      candidateSource.slice(0, edit.range.charStart) +
      edit.replacement +
      candidateSource.slice(edit.range.charEnd);
  }

  try {
    const candidateDeck = await loadDeck({
      kind: "text",
      text: candidateSource,
      ...(trustedDeck.source.name === undefined
        ? {}
        : { name: trustedDeck.source.name }),
    });
    const resultErrors = candidateDeck.diagnostics.filter(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    );
    if (resultErrors.length > 0) {
      return failedResult(
        trustedDeck,
        plan,
        "Candidate source failed PPTV validation; the transaction was not committed.",
        resultErrors,
      );
    }

    return {
      applied: true,
      originalSha256: trustedDeck.source.sha256,
      sourceText: candidateSource,
      sourceSha256: candidateDeck.source.sha256,
      deck: candidateDeck,
      affectedIds: plan.affectedIds,
      edits: plan.edits,
      diagnostics: candidateDeck.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === "info" || diagnostic.severity === "warning",
      ),
    };
  } catch (error) {
    const related = error instanceof PptvLoadError ? error.diagnostics : [];
    return failedResult(
      trustedDeck,
      plan,
      "Candidate source could not be reloaded; the transaction was not committed.",
      related,
    );
  }
}

function planPatch(deck: PptvDeck, input: unknown): PatchPlan {
  const decoded = decodePatch(input);
  const diagnostics = [...decoded.diagnostics];
  const edits: AppliedSourceEdit[] = [];
  const affectedIds: string[] = [];
  const patch = decoded.patch;

  if (hasErrors(deck.diagnostics)) {
    diagnostics.push({
      code: "PPTV-PATCH-INVALID-BASE",
      severity: "error",
      message: "Patches require a source snapshot with no validation errors.",
    });
  }
  if (!deck.materialization.complete) {
    diagnostics.push({
      code: "PPTV-PATCH-INCOMPLETE-SNAPSHOT",
      severity: "error",
      message: "Patches require a fully materialized deck snapshot.",
    });
  }
  if (patch === undefined) return { edits, affectedIds, diagnostics };
  if (patch.baseSha256 !== deck.source.sha256) {
    diagnostics.push({
      code: "PPTV-PATCH-STALE",
      severity: "error",
      message: `Patch base ${patch.baseSha256} does not match source ${deck.source.sha256}.`,
    });
  }

  for (const [operationIndex, operation] of patch.ops.entries()) {
    if (operation.op === "set-text") {
      planSetText(
        deck,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    } else if (operation.op === "set-active-theme") {
      planSetActiveTheme(
        deck,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    } else {
      planSetSlideOrder(
        deck,
        operation,
        operationIndex,
        edits,
        affectedIds,
        diagnostics,
      );
    }
  }

  const sorted = [...edits].sort(
    (left, right) => left.range.charStart - right.range.charStart,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      (current.range.charStart < previous.range.charEnd ||
        (current.range.charStart === previous.range.charStart &&
          (current.range.charStart === current.range.charEnd ||
            previous.range.charStart === previous.range.charEnd)))
    ) {
      diagnostics.push({
        code: "PPTV-PATCH-OVERLAP",
        severity: "error",
        message: `Operations ${previous.operationIndex} and ${current.operationIndex} replace intersecting source ranges.`,
        range: current.range,
        related: [
          { message: "Intersecting edit is here.", range: previous.range },
        ],
      });
    }
  }

  return { patch, edits, affectedIds: [...new Set(affectedIds)], diagnostics };
}

async function reloadPatchBase(deck: PptvDeck): Promise<{
  deck?: PptvDeck;
  diagnostics: Diagnostic[];
}> {
  try {
    const reloaded = await loadDeck({
      kind: "text",
      text: deck.source.text,
      ...(deck.source.name === undefined ? {} : { name: deck.source.name }),
    });
    if (reloaded.source.sha256 !== deck.source.sha256) {
      return {
        diagnostics: [
          {
            code: "PPTV-PATCH-INVALID-BASE",
            severity: "error",
            message:
              "The supplied deck snapshot hash does not match its retained source text.",
          },
        ],
      };
    }
    return { deck: reloaded, diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "PPTV-PATCH-INVALID-BASE",
          severity: "error",
          message:
            "The supplied deck source could not be reconstructed as a trusted patch snapshot.",
          ...(error instanceof PptvLoadError && error.diagnostics.length > 0
            ? {
                related: error.diagnostics.map((diagnostic) => ({
                  message: `${diagnostic.code}: ${diagnostic.message}`,
                  ...(diagnostic.range === undefined
                    ? {}
                    : { range: diagnostic.range }),
                })),
              }
            : {}),
        },
      ],
    };
  }
}

function planSetText(
  deck: PptvDeck,
  operation: SetTextOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  const indexed = deck.index.objects.get(operation.id);
  const node = findObject(deck, operation.id);
  if (indexed === undefined || node === undefined) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown object "${operation.id}".`),
    );
    return;
  }
  if (node.role !== "text") {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Object "${operation.id}" is not text.`),
    );
    return;
  }
  if (node.exportMode !== "native" || node.opaque) {
    diagnostics.push({
      code: "PPTV-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Object "${operation.id}" is an opaque asset boundary; text inside it is not semantically editable.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  if (operation.oldText !== undefined && operation.oldText !== node.text) {
    diagnostics.push({
      code: "PPTV-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} expected text ${JSON.stringify(operation.oldText)}, found ${JSON.stringify(node.text ?? "")}.`,
      objectId: operation.id,
    });
    return;
  }
  if (indexed.directTextRange === undefined) {
    diagnostics.push({
      code: "PPTV-PATCH-UNSAFE-RANGE",
      severity: "error",
      message: `Object "${operation.id}" has nested or mixed text; PPTV 0.1 can only replace direct text.`,
      objectId: operation.id,
      range: indexed.elementRange,
    });
    return;
  }
  if (FORBIDDEN_XML_TEXT.test(operation.value)) {
    diagnostics.push({
      code: "PPTV-PATCH-INVALID-TEXT",
      severity: "error",
      message: `Object "${operation.id}" replacement contains a forbidden XML character.`,
      objectId: operation.id,
    });
    return;
  }

  edits.push({
    range: indexed.directTextRange,
    replacement: escapeXmlText(operation.value),
    operationIndex,
  });
  affectedIds.push(operation.id);
}

function planSetActiveTheme(
  deck: PptvDeck,
  operation: SetActiveThemeOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  if (!deck.themes.has(operation.theme)) {
    diagnostics.push(
      targetDiagnostic(operationIndex, `Unknown theme "${operation.theme}".`),
    );
    return;
  }
  if (
    operation.oldTheme !== undefined &&
    operation.oldTheme !== deck.activeTheme
  ) {
    diagnostics.push({
      code: "PPTV-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} expected active theme "${operation.oldTheme}", found "${deck.activeTheme ?? "(none)"}".`,
    });
    return;
  }
  const range = deck.index.manifestFields.get("theme");
  if (range === undefined) {
    diagnostics.push({
      code: "PPTV-PATCH-UNSAFE-RANGE",
      severity: "error",
      message:
        "The manifest has no existing theme value to replace surgically.",
    });
    return;
  }

  edits.push({
    range,
    replacement: JSON.stringify(operation.theme),
    operationIndex,
  });
  affectedIds.push(operation.theme);
}

function planSetSlideOrder(
  deck: PptvDeck,
  operation: SetSlideOrderOperation,
  operationIndex: number,
  edits: AppliedSourceEdit[],
  affectedIds: string[],
  diagnostics: Diagnostic[],
): void {
  if (
    operation.oldOrder !== undefined &&
    !sameArray(operation.oldOrder, deck.slideOrder)
  ) {
    diagnostics.push({
      code: "PPTV-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} slide-order precondition does not match the manifest.`,
    });
    return;
  }
  if (!isPermutation(operation.order, deck.slideOrder)) {
    diagnostics.push({
      code: "PPTV-PATCH-PRECONDITION",
      severity: "error",
      message: `Operation ${operationIndex} set-slide-order must be a permutation of the current slide IDs.`,
    });
    return;
  }

  for (let index = 0; index < deck.slideOrder.length; index += 1) {
    const currentId = deck.slideOrder[index];
    const desiredId = operation.order[index];
    if (
      currentId === undefined ||
      desiredId === undefined ||
      currentId === desiredId
    )
      continue;
    const slotRange = deck.index.manifestSlideEntries.get(currentId);
    const desiredRange = deck.index.manifestSlideEntries.get(desiredId);
    if (slotRange === undefined || desiredRange === undefined) {
      diagnostics.push({
        code: "PPTV-PATCH-UNSAFE-RANGE",
        severity: "error",
        message: `Cannot locate manifest entry ranges for slide reorder operation ${operationIndex}.`,
      });
      return;
    }
    edits.push({
      range: slotRange,
      replacement: deck.source.text.slice(
        desiredRange.charStart,
        desiredRange.charEnd,
      ),
      operationIndex,
    });
  }
  affectedIds.push(...operation.order);
}

function decodePatch(input: unknown): {
  patch?: PptvPatch;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    return {
      diagnostics: [
        {
          code: "PPTV-PATCH-SCHEMA",
          severity: "error",
          message: "Patch must be a JSON object.",
        },
      ],
    };
  }
  for (const key of unknownKeys(input, [
    "schema",
    "baseSha256",
    "transactionId",
    "author",
    "timestamp",
    "ops",
  ])) {
    diagnostics.push({
      code: "PPTV-PATCH-SCHEMA",
      severity: "error",
      message: `Unknown patch field "${key}".`,
    });
  }
  if (input.schema !== "pptv-patch/0.1") {
    diagnostics.push({
      code: "PPTV-PATCH-SCHEMA",
      severity: "error",
      message: 'Patch schema must equal "pptv-patch/0.1".',
    });
  }
  if (
    typeof input.baseSha256 !== "string" ||
    !SHA256_PATTERN.test(input.baseSha256)
  ) {
    diagnostics.push({
      code: "PPTV-PATCH-SCHEMA",
      severity: "error",
      message: "Patch baseSha256 must be a lowercase 64-hex SHA-256 digest.",
    });
  }
  if (!Array.isArray(input.ops) || input.ops.length === 0) {
    diagnostics.push({
      code: "PPTV-PATCH-SCHEMA",
      severity: "error",
      message: "Patch ops must be a non-empty array.",
    });
  }
  for (const key of ["transactionId", "author", "timestamp"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      diagnostics.push({
        code: "PPTV-PATCH-SCHEMA",
        severity: "error",
        message: `Patch ${key} must be a string.`,
      });
    }
  }
  if (
    typeof input.timestamp === "string" &&
    !isRfc3339DateTime(input.timestamp)
  ) {
    diagnostics.push({
      code: "PPTV-PATCH-SCHEMA",
      severity: "error",
      message: "Patch timestamp must be an RFC 3339 date-time.",
    });
  }
  const operations: PptvOperation[] = [];
  if (Array.isArray(input.ops)) {
    for (const [index, value] of input.ops.entries()) {
      const operation = decodeOperation(value, index, diagnostics);
      if (operation !== undefined) operations.push(operation);
    }
  }
  if (hasErrors(diagnostics) || typeof input.baseSha256 !== "string")
    return { diagnostics };

  const patch: PptvPatch = {
    schema: "pptv-patch/0.1",
    baseSha256: input.baseSha256,
    ...(typeof input.transactionId === "string"
      ? { transactionId: input.transactionId }
      : {}),
    ...(typeof input.author === "string" ? { author: input.author } : {}),
    ...(typeof input.timestamp === "string"
      ? { timestamp: input.timestamp }
      : {}),
    ops: operations,
  };
  return { patch, diagnostics };
}

function decodeOperation(
  input: unknown,
  index: number,
  diagnostics: Diagnostic[],
): PptvOperation | undefined {
  if (!isRecord(input) || typeof input.op !== "string") {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        "Operation must be an object with an op.",
      ),
    );
    return undefined;
  }
  if (input.op === "set-text") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "id", "oldText", "value"],
      diagnostics,
    );
    if (typeof input.id !== "string" || typeof input.value !== "string") {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-text requires string id and value.",
        ),
      );
      return undefined;
    }
    if (!STABLE_ID_PATTERN.test(input.id)) {
      diagnostics.push(
        schemaOperationDiagnostic(index, "set-text id is not a stable ID."),
      );
      return undefined;
    }
    if (input.oldText !== undefined && typeof input.oldText !== "string") {
      diagnostics.push(
        schemaOperationDiagnostic(index, "set-text oldText must be a string."),
      );
      return undefined;
    }
    return {
      op: "set-text",
      id: input.id,
      value: input.value,
      ...(typeof input.oldText === "string" ? { oldText: input.oldText } : {}),
    };
  }
  if (input.op === "set-active-theme") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "theme", "oldTheme"],
      diagnostics,
    );
    if (typeof input.theme !== "string") {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme requires string theme.",
        ),
      );
      return undefined;
    }
    if (!STABLE_ID_PATTERN.test(input.theme)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme theme is not a stable ID.",
        ),
      );
      return undefined;
    }
    if (input.oldTheme !== undefined && typeof input.oldTheme !== "string") {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme oldTheme must be a string.",
        ),
      );
      return undefined;
    }
    if (
      typeof input.oldTheme === "string" &&
      !STABLE_ID_PATTERN.test(input.oldTheme)
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-active-theme oldTheme is not a stable ID.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-active-theme",
      theme: input.theme,
      ...(typeof input.oldTheme === "string"
        ? { oldTheme: input.oldTheme }
        : {}),
    };
  }
  if (input.op === "set-slide-order") {
    reportUnknownOperationKeys(
      input,
      index,
      ["op", "order", "oldOrder"],
      diagnostics,
    );
    if (!isStringArray(input.order)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order requires string[] order.",
        ),
      );
      return undefined;
    }
    if (input.order.length === 0) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order must not be empty.",
        ),
      );
      return undefined;
    }
    if (input.order.some((id) => !STABLE_ID_PATTERN.test(id))) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order contains an invalid stable ID.",
        ),
      );
      return undefined;
    }
    if (new Set(input.order).size !== input.order.length) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order order must contain unique IDs.",
        ),
      );
      return undefined;
    }
    if (input.oldOrder !== undefined && !isStringArray(input.oldOrder)) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order oldOrder must be string[].",
        ),
      );
      return undefined;
    }
    if (
      isStringArray(input.oldOrder) &&
      input.oldOrder.some((id) => !STABLE_ID_PATTERN.test(id))
    ) {
      diagnostics.push(
        schemaOperationDiagnostic(
          index,
          "set-slide-order oldOrder contains an invalid stable ID.",
        ),
      );
      return undefined;
    }
    return {
      op: "set-slide-order",
      order: input.order,
      ...(isStringArray(input.oldOrder) ? { oldOrder: input.oldOrder } : {}),
    };
  }

  diagnostics.push({
    code: "PPTV-PATCH-UNSUPPORTED",
    severity: "error",
    message: `Operation ${index} uses unsupported op "${input.op}".`,
  });
  return undefined;
}

function findObject(deck: PptvDeck, id: string): PptvNode | undefined {
  for (const slideId of deck.slideOrder) {
    const slide = deck.slides.get(slideId);
    if (slide === undefined) continue;
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
    const found = findNode(node.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function failedResult(
  deck: PptvDeck,
  plan: PatchPlan,
  message: string,
  related: Diagnostic[],
): PatchResult {
  return {
    applied: false,
    originalSha256: deck.source.sha256,
    affectedIds: [],
    edits: [],
    diagnostics: [
      ...plan.diagnostics,
      {
        code: "PPTV-PATCH-INVALID-RESULT",
        severity: "error",
        message,
        ...(related.length === 0
          ? {}
          : {
              related: related.map((diagnostic) => ({
                message: `${diagnostic.code}: ${diagnostic.message}`,
                ...(diagnostic.range === undefined
                  ? {}
                  : { range: diagnostic.range }),
              })),
            }),
      },
    ],
  };
}

function targetDiagnostic(index: number, message: string): Diagnostic {
  return {
    code: "PPTV-PATCH-TARGET",
    severity: "error",
    message: `Operation ${index}: ${message}`,
  };
}

function schemaOperationDiagnostic(index: number, message: string): Diagnostic {
  return {
    code: "PPTV-PATCH-SCHEMA",
    severity: "error",
    message: `Operation ${index}: ${message}`,
  };
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isPermutation(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    sameArray([...left].sort(), [...right].sort())
  );
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRfc3339DateTime(value: string): boolean {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u.exec(
      value,
    );
  if (match?.groups === undefined) return false;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const offsetHour = Number(match.groups.offsetHour ?? 0);
  const offsetMinute = Number(match.groups.offsetMinute ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function reportUnknownOperationKeys(
  operation: Record<string, unknown>,
  index: number,
  allowed: readonly string[],
  diagnostics: Diagnostic[],
): void {
  for (const key of unknownKeys(operation, allowed)) {
    diagnostics.push(
      schemaOperationDiagnostic(
        index,
        `Unknown ${String(operation.op)} field "${key}".`,
      ),
    );
  }
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key));
}
