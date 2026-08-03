/**
 * Deterministic, privacy-bounded agent report for C10 reconciliation.
 *
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2
 */

import { createHash } from "node:crypto";

import type { PptvPatchOperation } from "../core/types.js";

export type PptvFindingDisposition =
  "auto-fixable" | "review-required" | "refused";
export type PptvFindingEffect = "normalization" | "source-change" | "trust";

export interface PptvFindingScope {
  readonly kind: "package" | "part" | "slide" | "object";
  readonly partName?: string;
  readonly slideId?: string;
  readonly objectId?: string;
  readonly field?: string;
}

export interface PptvFindingEvidence {
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

export interface PptvFindingResolutionOption {
  readonly id: string;
  readonly description: string;
  readonly consequence: string;
}

export interface PptvFindingResolution {
  readonly summary: string;
  readonly options: readonly PptvFindingResolutionOption[];
}

export interface PptvNormalizationRuleReference {
  readonly id: string;
  readonly proofStatus: "proven";
  readonly semanticScope: string;
  readonly observedProducer?: {
    readonly product: string;
    readonly version: string;
    readonly authoritative: false;
  };
}

export interface PptvReconciliationFinding {
  readonly id: string;
  readonly rank: number;
  readonly disposition: PptvFindingDisposition;
  readonly effect: PptvFindingEffect;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly occurrenceCount: number;
  readonly scope: PptvFindingScope;
  readonly evidence: readonly PptvFindingEvidence[];
  readonly normalizationRule?: PptvNormalizationRuleReference;
  readonly suggestedResolution: PptvFindingResolution;
  readonly candidateOperationId?: string;
  readonly blocks: readonly string[];
}

export interface PptvReconciliationFindingInput {
  readonly disposition: PptvFindingDisposition;
  readonly effect: PptvFindingEffect;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly occurrenceCount?: number;
  readonly scope: PptvFindingScope;
  readonly evidence?: readonly PptvFindingEvidence[];
  readonly normalizationRule?: PptvNormalizationRuleReference;
  readonly suggestedResolution: PptvFindingResolution;
  readonly candidateOperationId?: string;
  readonly blocks?: readonly string[];
}

export interface PptvCandidateOperation {
  readonly id: string;
  readonly disposition: "auto-fixable";
  readonly applicable: boolean;
  readonly blockedBy: readonly string[];
  readonly operation: PptvPatchOperation;
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

export interface PptvReconciliationSummary {
  readonly highestDisposition: PptvFindingDisposition;
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

export interface PptvReconciliationPresentation {
  readonly summary: PptvReconciliationSummary;
  readonly findings: readonly PptvReconciliationFinding[];
  readonly candidateOperations: readonly PptvCandidateOperation[];
}

export interface PptvReconciliationCommand {
  readonly argv: readonly string[];
  readonly findingIds?: readonly string[];
}

export interface PptvReconciliationCommandContext {
  readonly reproduce?: PptvReconciliationCommand;
  readonly inspect?: readonly PptvReconciliationCommand[];
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

export function operationId(operation: PptvPatchOperation): string {
  return `operation.${digest(canonicalStringify(operation)).slice(0, 16)}`;
}

export function buildReconciliationPresentation(
  status: "unchanged" | "patchable" | "review-required" | "refused",
  findingInputs: readonly PptvReconciliationFindingInput[],
  operations: readonly PptvPatchOperation[],
): PptvReconciliationPresentation {
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
        ) as PptvPatchOperation,
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
  const highestDisposition: PptvFindingDisposition =
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
              (finding.code === "PPTV-RECONCILE-DUPLICATE-ID" ||
                finding.code === "PPTV-RECONCILE-MISSING-ID"),
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
  input: PptvReconciliationFindingInput,
): PptvReconciliationFinding {
  const safeInput = redactPrivateValues(
    input,
  ) as PptvReconciliationFindingInput;
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

function findingRank(input: PptvReconciliationFindingInput): number {
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
