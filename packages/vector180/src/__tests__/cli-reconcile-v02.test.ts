// Tests: CONTRACT:C5-PPTV-PATCH.2.0,
// CONTRACT:C9-PPTV-PPTX-BASELINE.2.0,
// CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadAtom } from "../core/deck.js";
import { compilePptxBaseline } from "../node/pptx-baseline.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const TITLE = "Standalone Vector180 diagram";
const EDITED_TITLE = "Edited through native baseline";

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

async function withTempDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "vector180-cli-c10-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function editTitle(
  bytes: Uint8Array,
  title: string,
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const partName = "ppt/slides/slide1.xml";
  const entry = zip.file(partName);
  if (entry === null) throw new Error(`Missing ${partName}`);
  const before = await entry.async("string");
  const after = before.replace(`<a:t>${TITLE}</a:t>`, `<a:t>${title}</a:t>`);
  if (after === before) throw new Error("Generated baseline title was absent");
  zip.file(partName, after, {
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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("Vector180 C10 0.2 CLI", () => {
  it("authenticates an explicit native baseline and emits only safe summary fields", async () => {
    await withTempDirectory(async (directory) => {
      const sourceText = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
      const diagram = await loadAtom({
        kind: "text",
        text: sourceText,
        name: "atom.vector180.svg",
      });
      const artifact = await compilePptxBaseline(diagram, {
        placement: {
          slideId: "system-overview",
          x: 200,
          y: 50,
          width: 1200,
          height: 800,
          policy: "identity",
        },
      });
      const nativeBaseline = artifact.pptxBytes;
      const edited = await editTitle(nativeBaseline, EDITED_TITLE);
      const sourcePath = join(directory, "atom.vector180.svg");
      const mapPath = join(directory, "atom.vector180.map.json");
      const nativePath = join(directory, "native-save.pptx");
      const editedPath = join(directory, "edited.pptx");
      const reportPath = join(directory, "report.json");
      const patchPath = join(directory, "patch.json");
      await Promise.all([
        writeFile(sourcePath, sourceText),
        writeFile(mapPath, artifact.mapText),
        writeFile(nativePath, nativeBaseline),
        writeFile(editedPath, edited),
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
            "--native-baseline",
            nativePath,
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
        schema: "vector180-reconcile-result/0.1",
        reportSchema: "vector180-pptx-reconciliation/0.1",
        status: "patchable",
        report: reportPath,
        patch: patchPath,
        nativeBaselinePptxSha256: sha256(nativeBaseline),
        changeCount: 1,
        findingCount: 1,
        candidateOperationCount: 1,
        summary: {
          findingCounts: {
            autoFixable: 1,
            reviewRequired: 0,
            refused: 0,
          },
          candidateOperationCount: 1,
          blockedOperationCount: 0,
        },
      });
      expect(capture.stderr).toEqual([]);
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
        schema: "vector180-pptx-reconciliation/0.1",
        nativeBaselinePptxSha256: sha256(nativeBaseline),
        status: "patchable",
      });
      expect(JSON.parse(await readFile(patchPath, "utf8"))).toMatchObject({
        schema: "vector180-patch/0.1",
        ops: [{ op: "set-text", value: EDITED_TITLE }],
      });
      expect(await readFile(nativePath)).toEqual(Buffer.from(nativeBaseline));
      expect(await readFile(editedPath)).toEqual(Buffer.from(edited));
    });
  });

  it("retains reconciliation compatibility when no native baseline is supplied", async () => {
    await withTempDirectory(async (directory) => {
      const sourceText = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
      const diagram = await loadAtom({
        kind: "text",
        text: sourceText,
        name: "atom.vector180.svg",
      });
      const artifact = await compilePptxBaseline(diagram, {
        placement: {
          slideId: "system-overview",
          x: 200,
          y: 50,
          width: 1200,
          height: 800,
          policy: "identity",
        },
      });
      const edited = await editTitle(artifact.pptxBytes, EDITED_TITLE);
      const sourcePath = join(directory, "atom.vector180.svg");
      const mapPath = join(directory, "atom.vector180.map.json");
      const editedPath = join(directory, "edited.pptx");
      const reportPath = join(directory, "report.json");
      const patchPath = join(directory, "patch.json");
      await Promise.all([
        writeFile(sourcePath, sourceText),
        writeFile(mapPath, artifact.mapText),
        writeFile(editedPath, edited),
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

      const output = JSON.parse(capture.stdout.join("")) as Record<
        string,
        unknown
      >;
      expect(output).toMatchObject({
        reportSchema: "vector180-pptx-reconciliation/0.1",
        status: "patchable",
        findingCount: 1,
        candidateOperationCount: 1,
      });
      expect(output).not.toHaveProperty("nativeBaselinePptxSha256");
      expect(capture.stderr).toEqual([]);
    });
  });
});

const CONNECTOR_DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" data-vector180-version="0.1"
  id="diagram" viewBox="0 0 800 600">
  <rect id="node-a" data-vector180-role="shape" data-vector180-export="native"
    x="20" y="30" width="100" height="60" fill="#ddeeff"/>
  <rect id="node-b" data-vector180-role="shape" data-vector180-export="native"
    x="250" y="70" width="100" height="60" fill="#eeddee"/>
  <line id="connector" data-vector180-role="connector" data-vector180-export="native"
    x1="120" y1="60" x2="250" y2="100"
    data-vector180-from="node-a" data-vector180-to="node-b"
    fill="none" stroke="#334455" stroke-width="3" opacity="1"
    font-weight="400" font-style="normal" text-anchor="start"/>
</svg>`;

describe("Vector180 C5 0.3 CLI", () => {
  it("applies one reviewed connector clone through the existing patch command", async () => {
    await withTempDirectory(async (directory) => {
      const diagram = await loadAtom({
        kind: "text",
        text: CONNECTOR_DIAGRAM,
        name: "connectors.vector180.svg",
      });
      const sourcePath = join(directory, "connectors.vector180.svg");
      const patchPath = join(directory, "clone.patch.json");
      const outputPath = join(directory, "connectors.updated.vector180.svg");
      await writeFile(sourcePath, CONNECTOR_DIAGRAM);
      await writeFile(
        patchPath,
        JSON.stringify({
          schema: "vector180-patch/0.1",
          baseSha256: diagram.source.sha256,
          ops: [
            {
              op: "clone-connector",
              templateId: "connector",
              newId: "connector-copy",
              parentId: "diagram",
              oldOrder: ["node-a", "node-b", "connector"],
              order: ["node-a", "node-b", "connector", "connector-copy"],
              oldConnector: {
                fromId: "node-a",
                toId: "node-b",
                endpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
                style: {
                  fill: "none",
                  stroke: "#334455",
                  strokeWidth: 3,
                  opacity: 1,
                  fontWeight: 400,
                  fontStyle: "normal",
                  textAnchor: "start",
                },
              },
              connector: {
                fromId: "node-b",
                toId: "node-a",
                endpoints: { x1: 250, y1: 110, x2: 120, y2: 70 },
                style: {
                  fill: "none",
                  stroke: "#aa0000",
                  strokeWidth: 4,
                  opacity: 1,
                  fontWeight: 400,
                  fontStyle: "normal",
                  textAnchor: "start",
                },
              },
            },
          ],
        }),
      );
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "patch",
            sourcePath,
            patchPath,
            "--output",
            outputPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "vector180-patch-result/0.1",
        applied: true,
        affectedIds: expect.arrayContaining(["connector-copy"]),
        editCount: 1,
      });
      const output = await readFile(outputPath, "utf8");
      expect(output).toContain('id="connector-copy"');
      expect(output).toContain('data-vector180-from="node-b"');
      expect(output).toContain('stroke="#aa0000"');
      expect(capture.stderr).toEqual([]);
    });
  });
});
