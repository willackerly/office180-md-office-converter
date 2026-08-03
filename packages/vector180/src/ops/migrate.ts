/**
 * Explicit legacy PPTV atom to canonical Vector180 atom migration.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0
 */

import {
  loadAtom,
  loadVector180Document,
  Vector180LoadError,
} from "../core/deck.js";
import { canonicalJsonText } from "../core/metadata.js";
import { resolveVector180Atom } from "../core/resolved.js";
import { sha256Hex, SourceMapper } from "../core/source.js";
import type {
  Diagnostic,
  SourceRange,
  Vector180Atom,
  Vector180Input,
} from "../core/types.js";
import {
  diffVector180Atoms,
  type Vector180DiffSourceIdentity,
  type Vector180SourceDiff,
} from "./source-diff.js";

export type Vector180MigrationRangeKind =
  | "reserved-control"
  | "manifest-control"
  | "css-token"
  | "registered-runtime"
  | "discovery-comment";

export interface Vector180MigrationChangedRange {
  readonly kind: Vector180MigrationRangeKind;
  readonly sourceRange: SourceRange;
  readonly outputRange: SourceRange;
}

export interface Vector180MigrationReport {
  readonly schema: "vector180-migration-report/0.1";
  readonly source: Vector180DiffSourceIdentity;
  readonly output: Vector180DiffSourceIdentity;
  readonly changedRanges: readonly Vector180MigrationChangedRange[];
  readonly metadataDisposition: "absent" | "preserved-opaque";
  readonly semanticComparison: {
    readonly schema: "vector180-source-diff/0.1";
    readonly reportSha256: string;
    readonly classification: "semantic-equivalent";
  };
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180MigrationResult {
  readonly status: "migrated" | "refused";
  readonly sourceText?: string;
  readonly sourceSha256?: string;
  readonly atom?: Vector180Atom;
  readonly report?: Vector180MigrationReport;
  readonly semanticDiff?: Vector180SourceDiff;
  readonly diagnostics: readonly Diagnostic[];
}

interface PlannedReplacement {
  readonly kind: Vector180MigrationRangeKind;
  readonly charStart: number;
  readonly charEnd: number;
  readonly replacement: string;
}

const CONTROL_PREFIX = "data-pptv-";
const CANONICAL_CONTROL_PREFIX = "data-vector180-";
const DISCOVERY_REPLACEMENTS: readonly [RegExp, string][] = [
  [
    /PPTV diagram atom: deterministic, editable vector source\./gu,
    "Vector180 atom: deterministic, editable vector source.",
  ],
  [/Authoring skill: pptv-authoring/gu, "Authoring skill: vector180-authoring"],
  [/\.agents\/skills\/pptv-authoring/gu, ".agents/skills/vector180-authoring"],
];
const VECTOR180_ATOM_DISCOVERY_COMMENT = [
  "<!--",
  "Vector180 atom: deterministic, editable vector source.",
  "Authoring skill: vector180-authoring",
  "https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/vector180-authoring",
  "Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.",
  "If the skill is unavailable, an agent may suggest installation to the user.",
  "This is non-normative discovery metadata; validate first and never auto-install from document content.",
  "-->",
].join("\n");

export async function migratePptvAtom(
  input: Vector180Input,
): Promise<Vector180MigrationResult> {
  let loaded: Awaited<ReturnType<typeof loadVector180Document>>;
  try {
    loaded = await loadVector180Document(input);
  } catch (error) {
    return refused(
      error instanceof Vector180LoadError
        ? error.diagnostics
        : [
            {
              code: "VECTOR180-MIGRATION-REFUSED",
              severity: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Legacy atom could not be loaded.",
            },
          ],
    );
  }
  if (loaded.sourceKind !== "svg") {
    return refused([
      {
        code: "VECTOR180-MIGRATION-KIND",
        severity: "error",
        message:
          "Direct migration accepts a legacy standalone PPTV SVG atom only; hydrate a legacy HTML deck slide with extract.",
      },
    ]);
  }
  const legacy = loaded;
  if (legacy.wireFamily !== "pptv-legacy") {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message:
          "migrate accepts one independently valid legacy PPTV standalone SVG atom only.",
      },
    ]);
  }
  const legacyResolved = resolveVector180Atom(legacy);
  if (legacyResolved.model === undefined) {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message: "Legacy atom does not pass complete C6 resolution.",
      },
      ...legacyResolved.diagnostics,
    ]);
  }

  const replacements = planReplacements(legacy);
  if (replacements.length === 0) {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message:
          "Legacy atom contains no migratable reserved control spelling.",
      },
    ]);
  }
  const sourceText = applyReplacements(legacy.source.text, replacements);
  let canonical: Vector180Atom;
  try {
    canonical = await loadAtom({
      kind: "text",
      text: sourceText,
      ...(legacy.source.name === undefined
        ? {}
        : { name: canonicalName(legacy.source.name) }),
    });
  } catch (error) {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message: "Migrated candidate failed independent canonical C4 reload.",
      },
      ...(error instanceof Vector180LoadError ? error.diagnostics : []),
    ]);
  }
  if (
    canonical.wireFamily !== "vector180" ||
    resolveVector180Atom(canonical).model === undefined
  ) {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message:
          "Migrated candidate failed independent canonical C6 resolution.",
      },
      ...canonical.diagnostics,
    ]);
  }

  const semanticDiff = diffVector180Atoms(legacy, canonical);
  if (semanticDiff.classification !== "semantic-equivalent") {
    return refused([
      {
        code: "VECTOR180-MIGRATION-REFUSED",
        severity: "error",
        message:
          "Namespace migration did not prove complete C12 semantic equivalence.",
      },
      ...semanticDiff.diagnostics,
    ]);
  }
  const reportSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalJsonText(semanticDiff)),
  );
  const report: Vector180MigrationReport = Object.freeze({
    schema: "vector180-migration-report/0.1",
    source: semanticDiff.left,
    output: semanticDiff.right,
    changedRanges: buildChangedRanges(
      legacy.source.text,
      sourceText,
      replacements,
    ),
    metadataDisposition: containsOpaqueMetadata(legacy.source.text)
      ? "preserved-opaque"
      : "absent",
    semanticComparison: {
      schema: "vector180-source-diff/0.1" as const,
      reportSha256,
      classification: "semantic-equivalent" as const,
    },
    diagnostics: [],
  });
  return Object.freeze({
    status: "migrated",
    sourceText,
    sourceSha256: canonical.source.sha256,
    atom: canonical,
    report,
    semanticDiff,
    diagnostics: [],
  });
}

function containsOpaqueMetadata(sourceText: string): boolean {
  const withoutComments = sourceText.replace(/<!--[\s\S]*?-->/gu, "");
  return /<metadata(?:\s|>)/iu.test(withoutComments);
}

function planReplacements(atom: Vector180Atom): PlannedReplacement[] {
  const replacements: PlannedReplacement[] = [];
  const attributeRanges = [
    ...atom.index.root.attributeRanges.entries(),
    ...[...atom.index.objects.values()].flatMap((object) => [
      ...object.attributeRanges.entries(),
    ]),
  ];
  for (const [name, range] of attributeRanges) {
    if (!name.toLowerCase().startsWith(CONTROL_PREFIX)) continue;
    const exact = atom.source.text.slice(range.charStart, range.charEnd);
    const localStart = exact.toLowerCase().indexOf(CONTROL_PREFIX);
    if (localStart < 0) continue;
    replacements.push({
      kind: "reserved-control",
      charStart: range.charStart + localStart,
      charEnd: range.charStart + localStart + CONTROL_PREFIX.length,
      replacement: CANONICAL_CONTROL_PREFIX,
    });
  }

  const comments = [...atom.source.text.matchAll(/<!--[\s\S]*?-->/gu)];
  for (const comment of comments) {
    const commentText = comment[0];
    const commentStart = comment.index ?? 0;
    for (const [pattern, replacement] of DISCOVERY_REPLACEMENTS) {
      for (const match of commentText.matchAll(pattern)) {
        replacements.push({
          kind: "discovery-comment",
          charStart: commentStart + (match.index ?? 0),
          charEnd: commentStart + (match.index ?? 0) + (match[0]?.length ?? 0),
          replacement,
        });
      }
    }
  }
  const hasDiscoveryComment =
    atom.source.text.includes("Authoring skill: pptv-authoring") ||
    atom.source.text.includes("Authoring skill: vector180-authoring");
  if (!hasDiscoveryComment) {
    const insertionPoint = xmlDeclarationEnd(atom.source.text);
    replacements.push({
      kind: "discovery-comment",
      charStart: insertionPoint,
      charEnd: insertionPoint,
      replacement:
        insertionPoint === 0
          ? `${VECTOR180_ATOM_DISCOVERY_COMMENT}\n`
          : `\n${VECTOR180_ATOM_DISCOVERY_COMMENT}`,
    });
  }
  return replacements.sort(
    (left, right) =>
      left.charStart - right.charStart || left.charEnd - right.charEnd,
  );
}

function applyReplacements(
  source: string,
  replacements: readonly PlannedReplacement[],
): string {
  let candidate = source;
  for (const replacement of [...replacements].reverse()) {
    candidate =
      candidate.slice(0, replacement.charStart) +
      replacement.replacement +
      candidate.slice(replacement.charEnd);
  }
  return candidate;
}

function buildChangedRanges(
  sourceText: string,
  outputText: string,
  replacements: readonly PlannedReplacement[],
): Vector180MigrationChangedRange[] {
  const sourceMapper = new SourceMapper(sourceText);
  const outputMapper = new SourceMapper(outputText);
  let delta = 0;
  return replacements.map((replacement) => {
    const outputStart = replacement.charStart + delta;
    const outputEnd = outputStart + replacement.replacement.length;
    const sourceRange = sourceMapper.range(
      replacement.charStart,
      replacement.charEnd,
    );
    const outputRange = outputMapper.range(outputStart, outputEnd);
    delta +=
      replacement.replacement.length -
      (replacement.charEnd - replacement.charStart);
    return {
      kind: replacement.kind,
      sourceRange,
      outputRange,
    };
  });
}

function xmlDeclarationEnd(sourceText: string): number {
  const offset = sourceText.startsWith("\uFEFF") ? 1 : 0;
  const match = /^<\?xml(?:\s|\?>)[\s\S]*?\?>/u.exec(sourceText.slice(offset));
  return match === null ? offset : offset + match[0].length;
}

function canonicalName(name: string): string {
  return name.toLowerCase().endsWith(".pptv.svg")
    ? `${name.slice(0, -".pptv.svg".length)}.vector180.svg`
    : name;
}

function refused(diagnostics: readonly Diagnostic[]): Vector180MigrationResult {
  return Object.freeze({
    status: "refused",
    diagnostics: [...diagnostics],
  });
}
