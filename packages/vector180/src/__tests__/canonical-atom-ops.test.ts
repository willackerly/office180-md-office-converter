// Tests: CONTRACT:C4-PPTV-SOURCE.2.0,
// CONTRACT:C6-PPTV-RESOLVED.2.0,
// CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadAtom } from "../core/deck.js";
import { VECTOR180_ATOM_DISCOVERY_COMMENT } from "../core/extract.js";
import { compareAtomMetadata, projectAtomMetadata } from "../ops/metadata.js";
import { migratePptvAtom } from "../ops/migrate.js";
import { diffVector180Atoms } from "../ops/source-diff.js";

const CANONICAL_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const LEGACY_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
  import.meta.url,
);

describe("canonical Vector180 atom operations", () => {
  it("projects non-authoritative metadata and compares declared style families", async () => {
    const atom = await loadAtom({
      kind: "text",
      text: await readFile(CANONICAL_URL, "utf8"),
    });
    const inspection = await projectAtomMetadata(atom);
    const comparison = await compareAtomMetadata(atom, atom);

    expect(inspection).toMatchObject({
      schema: "vector180-atom-metadata-inspection/0.1",
      family: "vector180",
      atomId: "system-overview",
      metadataStatus: "present",
      templateLineageStatus: "absent",
      metadata: {
        styleFamily: { id: "office180.minimal", version: "1.0" },
      },
    });
    expect(inspection.metadataSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(inspection.stylePaletteSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(comparison.classification).toBe("matching-declared-style-family");
  });

  it("produces stable-ID semantic changes and keeps lexical-only edits equivalent", async () => {
    const source = await readFile(CANONICAL_URL, "utf8");
    const left = await loadAtom({ kind: "text", text: source });
    const lexical = await loadAtom({
      kind: "text",
      text: source.replace('fill="#f7f9fc"/>', 'fill="#f7f9fc" />'),
    });
    const changed = await loadAtom({
      kind: "text",
      text: source.replace(
        ">Standalone Vector180 diagram</text>",
        ">Deterministic Vector180 atom</text>",
      ),
    });

    expect(diffVector180Atoms(left, left)).toMatchObject({
      schema: "vector180-source-diff/0.1",
      classification: "exact",
      summary: { total: 0 },
    });
    expect(diffVector180Atoms(left, lexical)).toMatchObject({
      classification: "semantic-equivalent",
      lexical: { equal: false },
      summary: { total: 0 },
    });
    const report = diffVector180Atoms(left, changed);
    expect(report.classification).toBe("changed");
    expect(report.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "system-overview.title",
          kind: "text",
          fieldPath: "/text",
        }),
      ]),
    );
  });

  it("migrates only a legacy SVG atom and proves semantic equivalence", async () => {
    const result = await migratePptvAtom({
      kind: "text",
      text: await readFile(LEGACY_URL, "utf8"),
      name: "legacy.pptv.svg",
    });

    expect(result.status).toBe("migrated");
    expect(result.sourceText?.startsWith('<?xml version="1.0"')).toBe(true);
    expect(result.sourceText).toContain(VECTOR180_ATOM_DISCOVERY_COMMENT);
    expect(result.sourceText).toContain('data-vector180-version="0.1"');
    expect(result.sourceText).not.toContain("data-pptv-");
    expect(result.report).toMatchObject({
      schema: "vector180-migration-report/0.1",
      metadataDisposition: "absent",
      semanticComparison: { classification: "semantic-equivalent" },
    });
    expect(result.semanticDiff?.classification).toBe("semantic-equivalent");
    expect(result.atom?.wireFamily).toBe("vector180");
    expect(result.diagnostics).toEqual([]);
  });

  it("publishes CLI migration and diff reports without overwriting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vector180-atom-ops-"));
    try {
      const legacyPath = join(directory, "legacy.pptv.svg");
      const outputPath = join(directory, "migrated.vector180.svg");
      const migrationPath = join(directory, "migration.json");
      const diffPath = join(directory, "diff.json");
      await writeFile(legacyPath, await readFile(LEGACY_URL));
      const migration = captureEnvironment();

      expect(
        await runCli(
          [
            "migrate",
            legacyPath,
            "--output",
            outputPath,
            "--report",
            migrationPath,
            "--format",
            "json",
          ],
          migration.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(await readFile(migrationPath, "utf8"))).toMatchObject({
        schema: "vector180-migration-report/0.1",
        semanticComparison: { classification: "semantic-equivalent" },
      });

      const diff = captureEnvironment();
      expect(
        await runCli(
          [
            "diff",
            outputPath,
            outputPath,
            "--output",
            diffPath,
            "--format",
            "json",
          ],
          diff.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(await readFile(diffPath, "utf8"))).toMatchObject({
        schema: "vector180-source-diff/0.1",
        classification: "exact",
      });

      const collision = captureEnvironment();
      expect(
        await runCli(
          ["migrate", legacyPath, "--output", outputPath],
          collision.environment,
        ),
      ).toBe(2);
      expect(collision.stderr.join("")).toContain("refuses to overwrite");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

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
