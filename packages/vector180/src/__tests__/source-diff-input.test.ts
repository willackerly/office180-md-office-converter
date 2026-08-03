// Tests: CONTRACT:C4-PPTV-SOURCE.2.0,
// CONTRACT:C6-PPTV-RESOLVED.2.0,
// CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { migratePptvAtom } from "../ops/migrate.js";
import {
  diffVector180Inputs,
  type Vector180SourceDiff,
} from "../ops/source-diff.js";
import { readMinimalDeck } from "./test-helpers.js";

const CANONICAL_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const LEGACY_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
  import.meta.url,
);

describe("C12 input-level source diff", () => {
  it("retains exact independent identities for valid canonical inputs", async () => {
    const leftText = await readFile(CANONICAL_URL, "utf8");
    const rightText = leftText.replace('fill="#f7f9fc"/>', 'fill="#f7f9fc" />');
    const report = await diffVector180Inputs(
      { kind: "text", text: leftText, name: "left.vector180.svg" },
      { kind: "text", text: rightText, name: "right.vector180.svg" },
    );

    expect(report).toMatchObject({
      schema: "vector180-source-diff/0.1",
      classification: "semantic-equivalent",
      left: {
        family: "vector180",
        kind: "atom",
        profile: "0.1",
        id: "system-overview",
        sha256: nodeSha256(leftText),
        byteLength: Buffer.byteLength(leftText),
      },
      right: {
        family: "vector180",
        kind: "atom",
        profile: "0.1",
        id: "system-overview",
        sha256: nodeSha256(rightText),
        byteLength: Buffer.byteLength(rightText),
      },
      lexical: { equal: false },
      summary: { total: 0 },
      changes: [],
      diagnostics: [],
    });
    expectSchemaShape(report);
  });

  it("contains malformed, invalid C4, and invalid C6 atoms by side", async () => {
    const valid = await readFile(CANONICAL_URL, "utf8");
    const cases = [
      {
        name: "malformed XML",
        input: {
          kind: "text" as const,
          text:
            '<svg id="broken" data-vector180-version="0.1" viewBox="0 0 1 1" ' +
            'xmlns="http://www.w3.org/2000/svg"><rect',
          name: "malformed.vector180.svg",
        },
        identity: { family: "vector180", kind: "atom" },
        diagnostic: "VECTOR180-SCAN-SVG-XML",
      },
      {
        name: "invalid C4 root",
        input: {
          kind: "text" as const,
          text: valid.replace(' id="system-overview"', ""),
          name: "invalid-c4.vector180.svg",
        },
        identity: {
          family: "vector180",
          kind: "atom",
          profile: "0.1",
        },
        diagnostic: "VECTOR180-ATOM-ROOT",
      },
      {
        name: "invalid C4 stable root ID",
        input: {
          kind: "text" as const,
          text: valid.replace('id="system-overview"', 'id="not a stable id"'),
          name: "invalid-id.vector180.svg",
        },
        identity: {
          family: "vector180",
          kind: "atom",
          profile: "0.1",
        },
        diagnostic: "VECTOR180-ATOM-ROOT",
      },
      {
        name: "invalid C6 font authority",
        input: {
          kind: "text" as const,
          text: valid.replace(" font-family: ABeeZee;", ""),
          name: "invalid-c6.vector180.svg",
        },
        identity: {
          family: "vector180",
          kind: "atom",
          profile: "0.1",
          id: "system-overview",
        },
        diagnostic: "VECTOR180-PROFILE-FONT",
      },
    ];

    for (const testCase of cases) {
      const report = await diffVector180Inputs(testCase.input, {
        kind: "text",
        text: valid,
        name: "valid.vector180.svg",
      });

      expect(report.classification, testCase.name).toBe("incomparable");
      expect(report.left, testCase.name).toMatchObject({
        ...testCase.identity,
        sha256: nodeSha256(testCase.input.text),
        byteLength: Buffer.byteLength(testCase.input.text),
      });
      if (testCase.name.includes("root")) {
        expect(report.left, testCase.name).not.toHaveProperty("id");
      }
      expect(report.right, testCase.name).toMatchObject({
        family: "vector180",
        kind: "atom",
        profile: "0.1",
        id: "system-overview",
        sha256: nodeSha256(valid),
        byteLength: Buffer.byteLength(valid),
      });
      expect(
        report.diagnostics.map(({ code }) => code),
        testCase.name,
      ).toEqual(
        expect.arrayContaining([
          "VECTOR180-DIFF-INVALID-LEFT",
          testCase.diagnostic,
        ]),
      );
      expectIncomparableShape(report);
    }
  });

  it("refuses deck, composed HTML, and PPTX bytes without losing identity", async () => {
    const valid = await readFile(CANONICAL_URL, "utf8");
    const deck = await readMinimalDeck();
    const pptx = Uint8Array.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
    ]);
    const cases = [
      {
        name: "deck",
        input: {
          kind: "text" as const,
          text: deck,
          name: "report.vector180.html",
        },
        identity: {
          family: "vector180",
          kind: "deck",
          profile: "0.1",
          sha256: nodeSha256(deck),
          byteLength: Buffer.byteLength(deck),
        },
        codes: ["VECTOR180-DIFF-INVALID-LEFT", "VECTOR180-DIFF-KIND"],
      },
      {
        name: "composed HTML",
        input: {
          kind: "text" as const,
          text: deck,
          name: "atom.composed.vector180.html",
        },
        identity: {
          family: "vector180",
          kind: "deck",
          profile: "0.1",
          sha256: nodeSha256(deck),
          byteLength: Buffer.byteLength(deck),
        },
        codes: ["VECTOR180-DIFF-INVALID-LEFT", "VECTOR180-DIFF-KIND"],
      },
      {
        name: "PPTX",
        input: {
          kind: "bytes" as const,
          bytes: pptx,
          name: "edited.pptx",
        },
        identity: {
          family: "unknown",
          kind: "unknown",
          sha256: nodeSha256(pptx),
          byteLength: pptx.byteLength,
        },
        codes: [
          "VECTOR180-DIFF-INVALID-LEFT",
          "VECTOR180-DIFF-KIND",
          "VECTOR180-SCAN-UNRECOGNIZED",
        ],
      },
    ];

    for (const testCase of cases) {
      const report = await diffVector180Inputs(testCase.input, {
        kind: "text",
        text: valid,
        name: "valid.vector180.svg",
      });

      expect(report.classification, testCase.name).toBe("incomparable");
      expect(report.left, testCase.name).toEqual(testCase.identity);
      expect(
        report.diagnostics.map(({ code }) => code),
        testCase.name,
      ).toEqual(expect.arrayContaining(testCase.codes));
      expectIncomparableShape(report);
    }
  });

  it("compares independently valid legacy and canonical migration atoms", async () => {
    const legacy = await readFile(LEGACY_URL, "utf8");
    const migration = await migratePptvAtom({
      kind: "text",
      text: legacy,
      name: "legacy.pptv.svg",
    });
    expect(migration.sourceText).toBeDefined();

    const report = await diffVector180Inputs(
      { kind: "text", text: legacy, name: "legacy.pptv.svg" },
      {
        kind: "text",
        text: migration.sourceText!,
        name: "canonical.vector180.svg",
      },
    );

    expect(report).toMatchObject({
      classification: "semantic-equivalent",
      left: {
        family: "pptv-legacy",
        kind: "atom",
        profile: "0.1",
        id: "system-overview",
      },
      right: {
        family: "vector180",
        kind: "atom",
        profile: "0.1",
        id: "system-overview",
      },
      lexical: { equal: false },
      metadata: { classification: "absent" },
    });
    expect(report.changes).toEqual([
      expect.objectContaining({
        kind: "root",
        fieldPath: "/wireFamily",
      }),
    ]);
    expectSchemaShape(report);
  });

  it("separates metadata-only changes from key visual change categories", async () => {
    const source = await readFile(CANONICAL_URL, "utf8");
    const metadataOnly = source.replace('"version":"1.0"', '"version":"1.1"');
    const metadataReport = await diffVector180Inputs(
      { kind: "text", text: source },
      { kind: "text", text: metadataOnly },
    );
    expect(metadataReport).toMatchObject({
      classification: "semantic-equivalent",
      metadata: {
        classification: "changed",
        changedSections: ["styleFamily"],
      },
      summary: { metadata: 1, total: 1 },
    });
    expect(metadataReport.changes).toEqual([
      expect.objectContaining({
        id: "system-overview",
        kind: "metadata",
        fieldPath: "/metadata/styleFamily",
      }),
    ]);

    const changed = source
      .replace('width="1200"', 'width="1190"')
      .replace('fill="#f7f9fc"', 'fill="#ffffff"')
      .replace(
        'data-vector180-to="system-overview.service"',
        'data-vector180-to="system-overview.client"',
      )
      .replace(
        ">Standalone Vector180 diagram</text>",
        ">Changed deterministic atom</text>",
      );
    const changedReport = await diffVector180Inputs(
      { kind: "text", text: source },
      { kind: "text", text: changed },
    );
    expect(changedReport.classification).toBe("changed");
    expect(changedReport.changes.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["text", "geometry", "style", "relationship"]),
    );
    for (const change of changedReport.changes) {
      expect(change.left?.sourceRange).toBeDefined();
      expect(change.right?.sourceRange).toBeDefined();
      expect(change.left?.snapshot).toBeDefined();
      expect(change.right?.snapshot).toBeDefined();
    }
    expectSchemaShape(metadataReport);
    expectSchemaShape(changedReport);
  });

  it("CLI writes and emits an incomparable report without mutating either source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vector180-diff-boundary-"));
    try {
      const leftPath = join(directory, "malformed.vector180.svg");
      const rightPath = join(directory, "valid.vector180.svg");
      const reportPath = join(directory, "diff.json");
      const left = '<svg data-vector180-version="0.1"';
      const right = await readFile(CANONICAL_URL, "utf8");
      await writeFile(leftPath, left);
      await writeFile(rightPath, right);
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "diff",
            leftPath,
            rightPath,
            "--output",
            reportPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(1);

      const stdoutReport = JSON.parse(
        capture.stdout.join(""),
      ) as Vector180SourceDiff;
      const fileReport = JSON.parse(
        await readFile(reportPath, "utf8"),
      ) as Vector180SourceDiff;
      expect(fileReport).toEqual(stdoutReport);
      expectIncomparableShape(fileReport);
      expect(capture.stderr).toEqual([]);
      expect(capture.stdout.join("")).not.toMatch(
        /Vector180LoadError|\n\s+at |environment failure/u,
      );
      expect(await readFile(leftPath, "utf8")).toBe(left);
      expect(await readFile(rightPath, "utf8")).toBe(right);
      expect((await readdir(directory)).sort()).toEqual(
        ["diff.json", "malformed.vector180.svg", "valid.vector180.svg"].sort(),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function nodeSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function expectIncomparableShape(report: Vector180SourceDiff): void {
  expect(report).toMatchObject({
    schema: "vector180-source-diff/0.1",
    classification: "incomparable",
    metadata: { classification: "unknown", changedSections: [] },
    summary: {
      unchangedObjects: 0,
      changedObjects: 0,
      added: 0,
      removed: 0,
      root: 0,
      parent: 0,
      order: 0,
      relationship: 0,
      text: 0,
      geometry: 0,
      transform: 0,
      frame: 0,
      style: 0,
      exportIntent: 0,
      metadata: 0,
      total: 0,
    },
    changes: [],
  });
  expect(report.diagnostics.length).toBeGreaterThan(0);
  expectSchemaShape(report);
}

function expectSchemaShape(report: Vector180SourceDiff): void {
  expect(Object.keys(report).sort()).toEqual(
    [
      "schema",
      "classification",
      "left",
      "right",
      "lexical",
      "metadata",
      "summary",
      "changes",
      "diagnostics",
    ].sort(),
  );
  for (const identity of [report.left, report.right]) {
    expect(identity.family).toMatch(/^(?:vector180|pptv-legacy|unknown)$/u);
    expect(identity.kind).toMatch(/^(?:atom|deck|unknown)$/u);
    expect(identity.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(identity.byteLength).toBeGreaterThanOrEqual(0);
  }
  for (const diagnostic of report.diagnostics) {
    expect(
      Object.keys(diagnostic).every((key) =>
        ["code", "severity", "message", "range"].includes(key),
      ),
    ).toBe(true);
  }
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
