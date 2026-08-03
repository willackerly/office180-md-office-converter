// Tests: CONTRACT:C5-PPTV-PATCH.1.3,
// CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDiagram } from "../core/deck.js";
import type { PptvConcreteNativeStyle, PptvDiagram } from "../core/types.js";
import {
  compilePptxBaseline,
  type PptvPptxBaselineArtifact,
  type PptvPptxMap,
} from "../node/pptx-baseline.js";
import { inspectPptxForReconciliation } from "../node/pptx-inspect.js";
import {
  connectorDuplicateResolutionGuidance,
  connectorOccurrenceFingerprintSha256,
  parsePptvReconcileResolution,
  serializePptvReconcileResolution,
  type PptvReconcileResolution,
} from "../node/reconcile-resolution.js";
import { reconcilePptx } from "../node/reconcile.js";
import { applyPatch } from "../ops/patch.js";

const SLIDE_PART = "ppt/slides/slide1.xml";
const CONNECTOR_ID = "diagram.flow";
const COPY_ID = "diagram.flow.copy";
const TEXT_ID = "diagram.label";
const CONNECTOR_STYLE: PptvConcreteNativeStyle = {
  fill: "none",
  stroke: "#334455",
  strokeWidth: 3,
  opacity: 1,
  fontWeight: 400,
  fontStyle: "normal",
  textAnchor: "start",
};

interface Fixture {
  readonly diagram: PptvDiagram;
  readonly artifact: PptvPptxBaselineArtifact;
}

function sourceText(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-pptv-version="0.1"
  id="diagram" viewBox="0 0 800 600">
  <rect id="diagram.left" data-pptv-role="shape" data-pptv-export="native"
    x="40" y="80" width="180" height="100"
    fill="#ddeeff" stroke="#223344" stroke-width="2"/>
  <rect id="diagram.right" data-pptv-role="shape" data-pptv-export="native"
    x="500" y="80" width="180" height="100"
    fill="#eeddee" stroke="#443322" stroke-width="2"/>
  <line id="diagram.flow" data-pptv-role="connector" data-pptv-export="native"
    data-pptv-from="diagram.left" data-pptv-to="diagram.right"
    x1="220" y1="130" x2="500" y2="130"
    fill="none" stroke="#334455" stroke-width="3" opacity="1"
    font-weight="400" font-style="normal" text-anchor="start"/>
  <text id="diagram.label" data-pptv-role="text" data-pptv-export="native"
    data-pptv-frame="180 260 440 80" data-pptv-line-step="32"
    x="180" y="310" fill="#17211e" stroke="none" stroke-width="1"
    font-family="Arial" font-size="26" font-weight="400"
    font-style="normal" text-anchor="start">Original label</text>
</svg>`;
}

async function fixture(): Promise<Fixture> {
  const diagram = await loadDiagram({
    kind: "text",
    text: sourceText(),
    name: "connector-copy.pptv.svg",
  });
  return {
    diagram,
    artifact: await compilePptxBaseline(diagram, {
      placement: {
        slideId: "connector-copy",
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        policy: "identity",
      },
    }),
  };
}

async function editPackage(
  bytes: Uint8Array,
  map: PptvPptxMap,
  options: {
    readonly editText?: boolean;
    readonly duplicateId?: string;
    readonly changeOriginalGeometry?: boolean;
    readonly changeCopiedGeometry?: boolean;
  } = {},
): Promise<Uint8Array> {
  const duplicateId = options.duplicateId ?? CONNECTOR_ID;
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entry = zip.file(SLIDE_PART);
  if (entry === null) throw new Error("Missing test slide");
  let xml = await entry.async("string");
  const block = mappedObjectBlock(xml, map, duplicateId);
  const mapped = map.slides[0]?.objects.find(
    (object) => object.id === duplicateId,
  );
  if (mapped === undefined) throw new Error("Missing mapped duplicate target");
  const replacementNumericId =
    Math.max(
      ...map.slides[0]!.objects.map((object) => object.emitted.cNvPrNumericId),
    ) + 10_000;
  let original = block.text;
  if (options.changeOriginalGeometry === true) {
    original = original.replace(/<a:off x="(\d+)"/u, (_match, value) => {
      return `<a:off x="${Number(value) + 7_620}"`;
    });
  }
  let copied = block.text.replace(
    `id="${mapped.emitted.cNvPrNumericId}"`,
    `id="${replacementNumericId}"`,
  );
  if (options.changeCopiedGeometry === true) {
    copied = copied.replace(/<a:off x="(\d+)"/u, (_match, value) => {
      return `<a:off x="${Number(value) + 15_240}"`;
    });
  }
  const lineStart = xml.lastIndexOf("\n", block.start);
  const indent = lineStart < 0 ? "" : xml.slice(lineStart + 1, block.start);
  xml =
    xml.slice(0, block.start) +
    original +
    `\n${indent}${copied}` +
    xml.slice(block.end);
  if (options.editText === true) {
    xml = xml.replace("<a:t>Original label</a:t>", "<a:t>Reviewed label</a:t>");
  }
  zip.file(SLIDE_PART, xml, {
    date: new Date("1980-01-01T00:00:00.000Z"),
    createFolders: false,
  });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}

function mappedObjectBlock(
  xml: string,
  map: PptvPptxMap,
  id: string,
): { readonly start: number; readonly end: number; readonly text: string } {
  const object = map.slides[0]?.objects.find(
    (candidate) => candidate.id === id,
  );
  if (object === undefined) throw new Error(`Missing mapped object ${id}`);
  const marker = `name="src.${id}"`;
  const markerIndex = xml.indexOf(marker);
  const start = xml.lastIndexOf(`<${object.emitted.element}>`, markerIndex);
  const close = `</${object.emitted.element}>`;
  const closeIndex = xml.indexOf(close, markerIndex);
  if (markerIndex < 0 || start < 0 || closeIndex < 0) {
    throw new Error(`Missing emitted block src.${id}`);
  }
  const end = closeIndex + close.length;
  return { start, end, text: xml.slice(start, end) };
}

async function resolutionFor(
  fixtureValue: Fixture,
  edited: Uint8Array,
): Promise<PptvReconcileResolution> {
  const baseline = await inspectPptxForReconciliation(
    fixtureValue.artifact.pptxBytes,
    fixtureValue.artifact.map,
  );
  const inspected = await inspectPptxForReconciliation(
    edited,
    fixtureValue.artifact.map,
  );
  const baselineIdentity = baseline.inspection?.slides[0]?.identities.find(
    (identity) => identity.id === CONNECTOR_ID,
  );
  const duplicateIdentity = inspected.inspection?.slides[0]?.identities.find(
    (identity) => identity.id === CONNECTOR_ID,
  );
  const baselineOccurrence = baselineIdentity?.occurrences[0];
  if (
    baselineOccurrence === undefined ||
    duplicateIdentity?.occurrences.length !== 2
  ) {
    throw new Error("Test fixture did not produce the expected occurrences");
  }
  const baselineFingerprint =
    connectorOccurrenceFingerprintSha256(baselineOccurrence);
  const copiedOccurrence = duplicateIdentity.occurrences.find(
    (occurrence) =>
      connectorOccurrenceFingerprintSha256(occurrence) !== baselineFingerprint,
  );
  const copiedFingerprint =
    copiedOccurrence === undefined
      ? undefined
      : connectorOccurrenceFingerprintSha256(copiedOccurrence);
  if (baselineFingerprint === undefined || copiedFingerprint === undefined) {
    throw new Error("Test connector occurrence is not fingerprintable");
  }
  return parsePptvReconcileResolution({
    schema: "pptv-reconcile-resolution/0.1",
    sourceSha256: fixtureValue.diagram.source.sha256,
    baselineMapSha256: fixtureValue.artifact.mapSha256,
    editedPptxSha256: sha256(edited),
    comparisonPptxSha256: fixtureValue.artifact.pptxSha256,
    duplicateId: CONNECTOR_ID,
    newId: COPY_ID,
    baselineOccurrenceFingerprintSha256: baselineFingerprint,
    copiedOccurrenceFingerprintSha256: copiedFingerprint,
    parentId: "diagram",
    oldOrder: ["diagram.left", "diagram.right", CONNECTOR_ID, TEXT_ID],
    order: ["diagram.left", "diagram.right", CONNECTOR_ID, COPY_ID, TEXT_ID],
    connector: {
      fromId: "diagram.left",
      toId: "diagram.right",
      endpoints: { x1: 220, y1: 130, x2: 500, y2: 130 },
      style: CONNECTOR_STYLE,
    },
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function captureEnvironment(): {
  readonly environment: CliEnvironment;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    environment: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe("reviewed connector-copy reconciliation", () => {
  it("recovers one reviewed copy with an independent supported edit", async () => {
    const value = await fixture();
    const edited = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
      { editText: true },
    );
    const unresolved = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      edited,
    );
    expect(unresolved.status).toBe("refused");
    expect(unresolved.patch).toBeUndefined();
    expect(
      unresolved.findings.find(
        (finding) => finding.code === "PPTV-RECONCILE-DUPLICATE-ID",
      ),
    ).toMatchObject({
      suggestedResolution: {
        summary:
          "Exactly one of two edited connector occurrences is baseline-equivalent. This duplicate is eligible for a strict pptv-reconcile-resolution/0.1 review input; every other finding must still be resolved.",
        options: [
          { id: "submit-hash-bound-connector-resolution" },
          { id: "restore-one-mapped-occurrence" },
        ],
      },
      evidence: [
        {
          kind: "identity-occurrence",
          baseline: {
            comparisonPptxSha256: value.artifact.pptxSha256,
          },
          edited: {
            resolutionAssessment: {
              status: "eligible",
              eligible: true,
              baselineEquivalentOccurrenceCount: 1,
              nextActionIds: [
                "submit-hash-bound-connector-resolution",
                "restore-one-mapped-occurrence",
              ],
            },
          },
        },
      ],
    });

    const resolution = await resolutionFor(value, edited);
    const result = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      edited,
      { resolution },
    );

    expect(result.status).toBe("patchable");
    expect(result.patch).toMatchObject({
      schema: "pptv-patch/0.3",
      baseSha256: value.diagram.source.sha256,
    });
    expect(result.patch?.ops.map((operation) => operation.op)).toEqual([
      "set-text",
      "clone-connector",
    ]);
    expect(
      result.patch?.ops.find((operation) => operation.op === "clone-connector"),
    ).toMatchObject({
      templateId: CONNECTOR_ID,
      newId: COPY_ID,
      parentId: "diagram",
      connector: {
        fromId: "diagram.left",
        toId: "diagram.right",
      },
    });
    expect(
      result.findings.some(
        (finding) => finding.code === "PPTV-RECONCILE-REVIEWED-CONNECTOR-CLONE",
      ),
    ).toBe(true);
    expect(result.candidateOperations).toHaveLength(2);
    expect(
      result.candidateOperations.every(
        (candidate) =>
          candidate.applicable &&
          candidate.validation.status === "passed" &&
          candidate.blockedBy.length === 0,
      ),
    ).toBe(true);

    const applied = await applyPatch(value.diagram, result.patch!);
    expect(applied.applied).toBe(true);
    expect(applied.diagram?.index.objects.has(COPY_ID)).toBe(true);
    expect(applied.sourceText).toContain("Reviewed label");
  });

  it("strictly parses, freezes, and deterministically serializes resolutions", async () => {
    const value = await fixture();
    const edited = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
    );
    const resolution = await resolutionFor(value, edited);
    const first = serializePptvReconcileResolution(resolution);
    const second = serializePptvReconcileResolution(JSON.parse(first));
    expect(second).toBe(first);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(() =>
      parsePptvReconcileResolution({ ...resolution, unexpected: true }),
    ).toThrow(/unknown: unexpected/u);
    expect(() =>
      parsePptvReconcileResolution({
        ...resolution,
        connector: {
          ...resolution.connector,
          endpoints: { x1: 1, y1: 1, x2: 1, y2: 1 },
        },
      }),
    ).toThrow(/non-degenerate/u);
  });

  it("gives deterministic agent actions for one, zero, and two baseline matches", () => {
    const eligible = connectorDuplicateResolutionGuidance("base", [
      "base",
      "copy",
    ]);
    const neither = connectorDuplicateResolutionGuidance("base", [
      "first-change",
      "second-change",
    ]);
    const ambiguous = connectorDuplicateResolutionGuidance("base", [
      "base",
      "base",
    ]);

    expect(eligible).toMatchObject({
      assessment: {
        status: "eligible",
        eligible: true,
        editedOccurrenceCount: 2,
        baselineEquivalentOccurrenceCount: 1,
        nextActionIds: [
          "submit-hash-bound-connector-resolution",
          "restore-one-mapped-occurrence",
        ],
      },
      summary:
        "Exactly one of two edited connector occurrences is baseline-equivalent. This duplicate is eligible for a strict pptv-reconcile-resolution/0.1 review input; every other finding must still be resolved.",
    });
    expect(neither).toMatchObject({
      assessment: {
        status: "no-baseline-match",
        eligible: false,
        baselineEquivalentOccurrenceCount: 0,
        nextActionIds: [
          "restore-one-baseline-occurrence",
          "author-connectors-in-source",
        ],
      },
      summary:
        "Neither edited connector occurrence is baseline-equivalent. Both copies changed or their structure drifted, so a single-clone resolution cannot be accepted.",
    });
    expect(ambiguous).toMatchObject({
      assessment: {
        status: "ambiguous-baseline-matches",
        eligible: false,
        baselineEquivalentOccurrenceCount: 2,
        nextActionIds: ["finish-one-copy-edit", "author-connectors-in-source"],
      },
      summary:
        "Both edited connector occurrences are baseline-equivalent. The intended copy is ambiguous, so a single-clone resolution cannot select one.",
    });
    expect(Object.isFrozen(eligible)).toBe(true);
  });

  it("publishes a reviewed clone through the CLI without overwriting review input", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "pptv-reconcile-resolution-test-"),
    );
    try {
      const value = await fixture();
      const edited = await editPackage(
        value.artifact.pptxBytes,
        value.artifact.map,
        { editText: true },
      );
      const resolution = await resolutionFor(value, edited);
      const sourcePath = join(directory, "connector-copy.pptv.svg");
      const mapPath = join(directory, "connector-copy.pptv.map.json");
      const editedPath = join(directory, "edited.pptx");
      const resolutionPath = join(directory, "reviewed-copy.json");
      const patchPath = join(directory, "reconciled.patch.json");
      const reportPath = join(directory, "reconciliation.report.json");
      const resolutionText = serializePptvReconcileResolution(resolution);
      await Promise.all([
        writeFile(sourcePath, sourceText()),
        writeFile(mapPath, value.artifact.mapText),
        writeFile(editedPath, edited),
        writeFile(resolutionPath, resolutionText),
      ]);
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "reconcile",
            editedPath,
            "--source",
            sourcePath,
            "--baseline",
            mapPath,
            "--resolution",
            resolutionPath,
            "--patch",
            patchPath,
            "--report",
            reportPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "pptv-reconcile-result/0.1",
        status: "patchable",
        patch: patchPath,
        report: reportPath,
        resolutionProvided: true,
        resolutionAccepted: true,
      });
      expect(capture.stderr).toEqual([]);
      expect(JSON.parse(await readFile(patchPath, "utf8"))).toMatchObject({
        schema: "pptv-patch/0.3",
        ops: [{ op: "set-text" }, { op: "clone-connector", newId: COPY_ID }],
      });
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
        status: "patchable",
        patch: { schema: "pptv-patch/0.3" },
      });
      expect(await readFile(resolutionPath, "utf8")).toBe(resolutionText);

      const collision = captureEnvironment();
      expect(
        await runCli(
          [
            "reconcile",
            editedPath,
            "--source",
            sourcePath,
            "--baseline",
            mapPath,
            "--resolution",
            resolutionPath,
            "--patch",
            join(directory, "unused.patch.json"),
            "--report",
            resolutionPath,
          ],
          collision.environment,
        ),
      ).toBe(2);
      expect(collision.stderr.join("")).toMatch(
        /--resolution input must be distinct/u,
      );
      expect(await readFile(resolutionPath, "utf8")).toBe(resolutionText);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses stale fingerprints, hashes, IDs, refs, and insertion order", async () => {
    const value = await fixture();
    const edited = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
    );
    const resolution = await resolutionFor(value, edited);
    const cases: Array<{
      readonly label: string;
      readonly resolution: PptvReconcileResolution;
    }> = [
      {
        label: "source hash",
        resolution: {
          ...resolution,
          sourceSha256: "2".repeat(64),
        },
      },
      {
        label: "map hash",
        resolution: {
          ...resolution,
          baselineMapSha256: "3".repeat(64),
        },
      },
      {
        label: "edited hash",
        resolution: {
          ...resolution,
          editedPptxSha256: "0".repeat(64),
        },
      },
      {
        label: "comparison hash",
        resolution: {
          ...resolution,
          comparisonPptxSha256: "4".repeat(64),
        },
      },
      {
        label: "baseline fingerprint",
        resolution: {
          ...resolution,
          baselineOccurrenceFingerprintSha256: "5".repeat(64),
        },
      },
      {
        label: "copied fingerprint",
        resolution: {
          ...resolution,
          copiedOccurrenceFingerprintSha256: "1".repeat(64),
        },
      },
      {
        label: "reused ID",
        resolution: { ...resolution, newId: "diagram.left" },
      },
      {
        label: "missing reference",
        resolution: {
          ...resolution,
          connector: { ...resolution.connector, toId: "diagram.missing" },
        },
      },
      {
        label: "reorder",
        resolution: {
          ...resolution,
          order: [
            "diagram.right",
            "diagram.left",
            CONNECTOR_ID,
            COPY_ID,
            TEXT_ID,
          ],
        },
      },
    ];
    for (const testCase of cases) {
      const result = await reconcilePptx(
        value.diagram,
        value.artifact.map,
        edited,
        { resolution: testCase.resolution },
      );
      expect(result.status, testCase.label).toBe("refused");
      expect(result.patch, testCase.label).toBeUndefined();
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.code === "PPTV-RECONCILE-RESOLUTION",
        ),
        testCase.label,
      ).toBe(true);
    }
  });

  it("refuses nonconnector duplicates and a third occurrence", async () => {
    const value = await fixture();
    const connectorEdited = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
    );
    const connectorResolution = await resolutionFor(value, connectorEdited);

    const rectDuplicate = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
      { duplicateId: "diagram.left" },
    );
    const nonconnector = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      rectDuplicate,
      {
        resolution: {
          ...connectorResolution,
          editedPptxSha256: sha256(rectDuplicate),
          duplicateId: "diagram.left",
          newId: "diagram.left.copy",
        },
      },
    );
    expect(nonconnector.status).toBe("refused");
    expect(nonconnector.patch).toBeUndefined();
    expect(
      nonconnector.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "PPTV-RECONCILE-RESOLUTION" &&
          /not one supported native straight connector/u.test(
            diagnostic.message,
          ),
      ),
    ).toBe(true);

    const threeOccurrences = await editPackage(
      connectorEdited,
      value.artifact.map,
    );
    const third = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      threeOccurrences,
      {
        resolution: {
          ...connectorResolution,
          editedPptxSha256: sha256(threeOccurrences),
        },
      },
    );
    expect(third.status).toBe("refused");
    expect(third.patch).toBeUndefined();
    expect(
      third.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "PPTV-RECONCILE-RESOLUTION" &&
          /exactly two occurrences/u.test(diagnostic.message),
      ),
    ).toBe(true);
  });

  it("refuses two changed occurrences and any independent review finding", async () => {
    const value = await fixture();
    const oneCopy = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
    );
    const resolution = await resolutionFor(value, oneCopy);
    const twoChanged = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
      { changeOriginalGeometry: true, changeCopiedGeometry: true },
    );
    const staleForChanged = {
      ...resolution,
      editedPptxSha256: sha256(twoChanged),
    };
    const changedWithoutResolution = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      twoChanged,
    );
    expect(
      changedWithoutResolution.findings.find(
        (finding) => finding.code === "PPTV-RECONCILE-DUPLICATE-ID",
      ),
    ).toMatchObject({
      suggestedResolution: {
        summary:
          "Neither edited connector occurrence is baseline-equivalent. Both copies changed or their structure drifted, so a single-clone resolution cannot be accepted.",
      },
      evidence: [
        {
          edited: {
            resolutionAssessment: {
              status: "no-baseline-match",
              eligible: false,
              baselineEquivalentOccurrenceCount: 0,
            },
          },
        },
      ],
    });
    const changedResult = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      twoChanged,
      { resolution: staleForChanged },
    );
    expect(changedResult.status).toBe("refused");
    expect(changedResult.patch).toBeUndefined();
    expect(
      changedResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "PPTV-RECONCILE-RESOLUTION" &&
          /zero or two matches/u.test(diagnostic.message),
      ),
    ).toBe(true);

    const withReview = await editPackage(
      value.artifact.pptxBytes,
      value.artifact.map,
      { editText: true },
    );
    const zip = await JSZip.loadAsync(withReview, { checkCRC32: true });
    const slide = zip.file(SLIDE_PART);
    const xml = await slide!.async("string");
    zip.file(
      SLIDE_PART,
      xml.replace(
        "<a:t>Reviewed label</a:t>",
        '<a:t foo="bar">Reviewed label</a:t>',
      ),
      { createFolders: false },
    );
    const unsupported = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      platform: "DOS",
    });
    const unsupportedResolution = {
      ...(await resolutionFor(value, unsupported)),
    };
    const reviewed = await reconcilePptx(
      value.diagram,
      value.artifact.map,
      unsupported,
      { resolution: unsupportedResolution },
    );
    expect(reviewed.status).toBe("review-required");
    expect(reviewed.patch).toBeUndefined();
    expect(
      reviewed.candidateOperations.some(
        (candidate) =>
          candidate.operation.op === "clone-connector" &&
          !candidate.applicable &&
          candidate.blockedBy.length > 0,
      ),
    ).toBe(true);
  });
});
