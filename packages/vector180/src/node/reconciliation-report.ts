/**
 * Deterministic, privacy-bounded agent report for C10 reconciliation.
 *
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 */

import { createHash } from "node:crypto";

import type { Vector180PatchOperation } from "../core/types.js";

export type Vector180FindingDisposition =
  "auto-fixable" | "review-required" | "refused";
export type Vector180FindingEffect =
  "normalization" | "source-change" | "trust";

export interface Vector180FindingScope {
  readonly kind: "package" | "part" | "slide" | "object";
  readonly partName?: string;
  readonly slideId?: string;
  readonly objectId?: string;
  readonly field?: string;
}

export interface Vector180FindingEvidence {
  readonly kind:
    | "digest"
    | "semantic-delta"
    | "normalization-proof"
    | "identity-occurrence"
    | "source-location";
  readonly baseline?: unknown;
  readonly edited?: unknown;
  readonly baselineSha256?: string;
  readonly editedSha256?: string;
  readonly predicates?: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly expected?: unknown;
    readonly actual?: unknown;
  }[];
}

export interface Vector180FindingResolutionOption {
  readonly id: string;
  readonly description: string;
  readonly consequence: string;
}

export interface Vector180FindingResolution {
  readonly summary: string;
  readonly options: readonly Vector180FindingResolutionOption[];
}

export interface Vector180NormalizationRuleReference {
  readonly id: string;
  readonly proofStatus: "proven";
  readonly semanticScope: string;
  readonly observedProducer?: {
    readonly product: string;
    readonly version: string;
    readonly authoritative: false;
  };
}

export interface Vector180ReconciliationFinding {
  readonly id: string;
  readonly rank: number;
  readonly disposition: Vector180FindingDisposition;
  readonly effect: Vector180FindingEffect;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly occurrenceCount: number;
  readonly scope: Vector180FindingScope;
  readonly evidence: readonly Vector180FindingEvidence[];
  readonly normalizationRule?: Vector180NormalizationRuleReference;
  readonly suggestedResolution: Vector180FindingResolution;
  readonly candidateOperationId?: string;
  readonly blocks: readonly string[];
}

export interface Vector180ReconciliationFindingInput {
  readonly disposition: Vector180FindingDisposition;
  readonly effect: Vector180FindingEffect;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly occurrenceCount?: number;
  readonly scope: Vector180FindingScope;
  readonly evidence?: readonly Vector180FindingEvidence[];
  readonly normalizationRule?: Vector180NormalizationRuleReference;
  readonly suggestedResolution: Vector180FindingResolution;
  readonly candidateOperationId?: string;
  readonly blocks?: readonly string[];
}

export interface Vector180CandidateOperation {
  readonly id: string;
  readonly disposition: "auto-fixable";
  readonly applicable: boolean;
  readonly blockedBy: readonly string[];
  readonly operation: Vector180PatchOperation;
  readonly validation:
    | {
        readonly status: "passed";
        readonly regeneratedSemanticEquality: true;
      }
    | {
        readonly status: "blocked";
        readonly reason: string;
      };
}

export interface Vector180ReconciliationSummary {
  readonly highestDisposition: Vector180FindingDisposition;
  readonly findingCounts: {
    readonly autoFixable: number;
    readonly reviewRequired: number;
    readonly refused: number;
  };
  readonly occurrenceCounts: {
    readonly normalizations: number;
    readonly sourceChanges: number;
    readonly identityProblems: number;
  };
  readonly candidateOperationCount: number;
  readonly blockedOperationCount: number;
}

export interface Vector180ReconciliationPresentation {
  readonly summary: Vector180ReconciliationSummary;
  readonly findings: readonly Vector180ReconciliationFinding[];
  readonly candidateOperations: readonly Vector180CandidateOperation[];
}

export interface Vector180ReconciliationCommand {
  readonly argv: readonly string[];
  readonly findingIds?: readonly string[];
}

export interface Vector180ReconciliationCommandContext {
  readonly reproduce?: Vector180ReconciliationCommand;
  readonly inspect?: readonly Vector180ReconciliationCommand[];
  readonly apply:
    | {
        readonly available: true;
        readonly argv: readonly string[];
      }
    | {
        readonly available: false;
        readonly blockedBy: readonly string[];
      };
}

export function operationId(operation: Vector180PatchOperation): string {
  return `operation.${digest(canonicalStringify(operation)).slice(0, 16)}`;
}

export function buildReconciliationPresentation(
  status: "unchanged" | "patchable" | "review-required" | "refused",
  findingInputs: readonly Vector180ReconciliationFindingInput[],
  operations: readonly Vector180PatchOperation[],
): Vector180ReconciliationPresentation {
  const findings = findingInputs.map(materializeFinding).sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return compareText(left.id, right.id);
  });
  const blockerIds = [
    ...new Set(
      findings
        .filter(
          (finding) =>
            finding.disposition === "review-required" ||
            finding.disposition === "refused",
        )
        .map((finding) => finding.id),
    ),
  ];
  const candidateOperations = operations
    .map((operation) => {
      const id = operationId(operation);
      const applicable = status === "patchable" && blockerIds.length === 0;
      return Object.freeze({
        id,
        disposition: "auto-fixable" as const,
        applicable,
        blockedBy: Object.freeze(applicable ? [] : [...blockerIds]),
        operation: deepFreeze(
          redactPrivateValues(operation),
        ) as Vector180PatchOperation,
        validation: applicable
          ? ({
              status: "passed",
              regeneratedSemanticEquality: true,
            } as const)
          : ({
              status: "blocked",
              reason:
                blockerIds.length > 0
                  ? "The complete transaction is blocked by review-required or refused findings."
                  : "The complete typed transaction has not passed C5 application and C9 regeneration.",
            } as const),
      });
    })
    .sort((left, right) => compareText(left.id, right.id));
  const findingCounts = {
    autoFixable: findings.filter(
      (finding) => finding.disposition === "auto-fixable",
    ).length,
    reviewRequired: findings.filter(
      (finding) => finding.disposition === "review-required",
    ).length,
    refused: findings.filter((finding) => finding.disposition === "refused")
      .length,
  };
  const highestDisposition: Vector180FindingDisposition =
    findingCounts.refused > 0
      ? "refused"
      : findingCounts.reviewRequired > 0
        ? "review-required"
        : "auto-fixable";
  return Object.freeze({
    summary: Object.freeze({
      highestDisposition,
      findingCounts: Object.freeze(findingCounts),
      occurrenceCounts: Object.freeze({
        normalizations: findings
          .filter((finding) => finding.effect === "normalization")
          .reduce((sum, finding) => sum + finding.occurrenceCount, 0),
        sourceChanges: findings
          .filter((finding) => finding.effect === "source-change")
          .reduce((sum, finding) => sum + finding.occurrenceCount, 0),
        identityProblems: findings
          .filter(
            (finding) =>
              finding.effect === "trust" &&
              (finding.code === "VECTOR180-RECONCILE-DUPLICATE-ID" ||
                finding.code === "VECTOR180-RECONCILE-MISSING-ID"),
          )
          .reduce((sum, finding) => sum + finding.occurrenceCount, 0),
      }),
      candidateOperationCount: candidateOperations.length,
      blockedOperationCount: candidateOperations.filter(
        (candidate) => !candidate.applicable,
      ).length,
    }),
    findings: Object.freeze(findings),
    candidateOperations: Object.freeze(candidateOperations),
  });
}

export function redactPrivateValues(value: unknown, key = ""): unknown {
  if (
    /^(?:lastModifiedBy|creator|author|user(?:name)?|account|company)$/iu.test(
      key,
    )
  ) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactPrivateValues(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, child]) => [
        name,
        redactPrivateValues(child, name),
      ]),
    );
  }
  return value;
}

function materializeFinding(
  input: Vector180ReconciliationFindingInput,
): Vector180ReconciliationFinding {
  const safeInput = redactPrivateValues(
    input,
  ) as Vector180ReconciliationFindingInput;
  const identity = canonicalStringify({
    code: safeInput.code,
    effect: safeInput.effect,
    disposition: safeInput.disposition,
    title: safeInput.title,
    message: safeInput.message,
    scope: safeInput.scope,
    normalizationRule: safeInput.normalizationRule?.id,
    candidateOperationId: safeInput.candidateOperationId,
    evidence: safeInput.evidence,
  });
  return deepFreeze({
    id: `finding.${digest(identity).slice(0, 16)}`,
    rank: findingRank(safeInput),
    disposition: safeInput.disposition,
    effect: safeInput.effect,
    code: safeInput.code,
    title: safeInput.title,
    message: safeInput.message,
    occurrenceCount: safeInput.occurrenceCount ?? 1,
    scope: safeInput.scope,
    evidence: safeInput.evidence ?? [],
    ...(safeInput.normalizationRule === undefined
      ? {}
      : { normalizationRule: safeInput.normalizationRule }),
    suggestedResolution: safeInput.suggestedResolution,
    ...(safeInput.candidateOperationId === undefined
      ? {}
      : { candidateOperationId: safeInput.candidateOperationId }),
    blocks: safeInput.blocks ?? [],
  });
}

function findingRank(input: Vector180ReconciliationFindingInput): number {
  const disposition =
    input.disposition === "refused"
      ? 0
      : input.disposition === "review-required"
        ? 1_000
        : 2_000;
  const effect =
    input.effect === "trust" ? 0 : input.effect === "source-change" ? 100 : 200;
  const scope =
    input.scope.kind === "package"
      ? 0
      : input.scope.kind === "part"
        ? 10
        : input.scope.kind === "slide"
          ? 20
          : 30;
  return disposition + effect + scope;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
