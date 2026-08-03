// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.3,
// CONTRACT:C6-PPTV-RESOLVED.1.1, CONTRACT:C7-PPTX-CANARY.1.1

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck, loadDiagram } from "../core/deck.js";
import { PPTV_DIAGRAM_DISCOVERY_COMMENT } from "../core/extract.js";
import { readMinimalDeck } from "./test-helpers.js";

function captureEnvironment(): {
  environment: CliEnvironment;
  stdout: string[];
  stderr: string[];
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
  const directory = await mkdtemp(join(tmpdir(), "pptv-cli-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readMinimalDiagram(): Promise<string> {
  return readFile(
    new URL("../../../../examples/minimal-diagram.pptv.svg", import.meta.url),
    "utf8",
  );
}

describe("PPTV CLI", () => {
  it("returns a manifest-only JSON outline", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      await writeFile(sourcePath, await readMinimalDeck());
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["outline", sourcePath, "--format", "json"],
        capture.environment,
      );
      const output = JSON.parse(capture.stdout.join("")) as Record<
        string,
        unknown
      >;

      expect(exitCode).toBe(0);
      expect(output.schema).toBe("pptv-outline/0.1");
      expect(capture.stdout.join("")).not.toContain("pptv-browser");
      expect(capture.stderr).toEqual([]);
    });
  });

  it("uses validation exit code 1 for an ambiguous stable ID", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "invalid.pptv.html");
      const source = (await readMinimalDeck()).replace(
        'id="cover.subtitle"',
        'id="cover.title"',
      );
      await writeFile(sourcePath, source);
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["validate", sourcePath],
        capture.environment,
      );

      expect(exitCode).toBe(1);
      expect(capture.stderr.join("")).toContain("PPTV-ID-DUPLICATE");
    });
  });

  it("emits the pure compiler-grade resolved model", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      await writeFile(sourcePath, await readMinimalDeck());
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["resolve", sourcePath],
        capture.environment,
      );
      const output = JSON.parse(capture.stdout.join("")) as {
        schema: string;
        canvas: { widthEmu: number; heightEmu: number };
        slides: Array<{ id: string }>;
      };

      expect(exitCode).toBe(0);
      expect(output.schema).toBe("pptv-resolved/0.1");
      expect(output.canvas).toMatchObject({
        widthEmu: 12_192_000,
        heightEmu: 6_858_000,
      });
      expect(output.slides.map((slide) => slide.id)).toEqual([
        "cover",
        "architecture",
      ]);
      expect(capture.stderr).toEqual([]);
    });
  });

  it("keeps fatal resolve diagnostics JSON by default", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "invalid.pptv.html");
      await writeFile(sourcePath, "<!doctype html><p>not a deck</p>");
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["resolve", sourcePath],
        capture.environment,
      );

      expect(exitCode).toBe(1);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "pptv-diagnostics/0.1",
      });
      expect(capture.stderr).toEqual([]);
    });
  });

  it("atomically writes a deterministic trusted editor wrapper", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      const outputPath = join(directory, "deck.editable.pptv.html");
      await writeFile(sourcePath, await readMinimalDeck());
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["editor-pack", sourcePath, "--output", outputPath, "--format", "json"],
        capture.environment,
      );
      const summary = JSON.parse(capture.stdout.join("")) as Record<
        string,
        unknown
      >;
      const wrapper = await readFile(outputPath, "utf8");

      expect(exitCode).toBe(0);
      expect(summary.schema).toBe("pptv-editor-pack-result/0.1");
      expect(wrapper).toContain("pptv-editor/0.1");
      expect(wrapper).toContain("source hash verified");
      expect(wrapper).not.toContain('data-pptv-runtime="pptv-browser/0.1"');
      expect(capture.stderr).toEqual([]);
    });
  });

  it("requires an explicit editor-pack destination", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      ["editor-pack", "source.pptv.html"],
      capture.environment,
    );

    expect(exitCode).toBe(2);
    expect(capture.stderr.join("")).toContain(
      "requires an explicit --output PATH",
    );
  });

  it("passes an explicit font map and fit threshold into the editor pack", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      const fontMapPath = join(directory, "fonts.json");
      const outputPath = join(directory, "deck.editable.pptv.html");
      await writeFile(sourcePath, await readMinimalDeck());
      await writeFile(fontMapPath, '{"schema":"pptv-font-map/0.1","faces":[]}');
      const capture = captureEnvironment();

      expect(
        await runCli(
          [
            "editor-pack",
            sourcePath,
            "--output",
            outputPath,
            "--font-map",
            fontMapPath,
            "--near-limit",
            "0.8",
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "pptv-editor-pack-result/0.1",
        documentKind: "deck",
      });
      expect(await readFile(outputPath, "utf8")).toContain('"nearLimit":0.8');
    });

    const missingMap = captureEnvironment();
    expect(
      await runCli(
        [
          "editor-pack",
          "source.pptv.html",
          "--output",
          "editor.html",
          "--near-limit",
          "0.8",
        ],
        missingMap.environment,
      ),
    ).toBe(2);
    expect(missingMap.stderr.join("")).toContain(
      "--near-limit requires an explicit --font-map",
    );
  });

  it("atomically writes the explicit deterministic PPTX canary destination", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      const outputPath = join(directory, "deck.pptx");
      const source = (await readMinimalDeck())
        .replaceAll(' rx="24"', "")
        .replaceAll(' ry="24"', "");
      await writeFile(sourcePath, source);
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["pptx-canary", sourcePath, "--output", outputPath, "--format", "json"],
        capture.environment,
      );
      const summary = JSON.parse(capture.stdout.join("")) as Record<
        string,
        unknown
      >;
      const bytes = await readFile(outputPath);

      expect(exitCode).toBe(0);
      expect(summary.schema).toBe("pptv-pptx-canary-result/0.1");
      expect(summary.partCount).toBe(17);
      expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
      expect(capture.stderr).toEqual([]);
    });
  });

  it("fails closed without a PPTX when source geometry exceeds the canary", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "rounded.pptv.html");
      const outputPath = join(directory, "rounded.pptx");
      const source = (await readMinimalDeck()).replace(
        'x="190" y="320" width="380" height="260"',
        'x="190" y="320" width="380" height="260" rx="24" ry="24"',
      );
      await writeFile(sourcePath, source);
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["pptx-canary", sourcePath, "--output", outputPath],
        capture.environment,
      );

      expect(exitCode).toBe(1);
      expect(capture.stderr.join("")).toContain(
        "PPTV-PPTX-UNSUPPORTED-GEOMETRY",
      );
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("requires an explicit PPTX canary destination", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      ["pptx-canary", "source.pptv.html"],
      capture.environment,
    );

    expect(exitCode).toBe(2);
    expect(capture.stderr.join("")).toContain(
      "pptx-canary requires an explicit --output PATH",
    );
  });

  it("checks or atomically writes an explicit patch destination", async () => {
    await withTempDirectory(async (directory) => {
      const source = await readMinimalDeck();
      const deck = await loadDeck({ kind: "text", text: source });
      const sourcePath = join(directory, "deck.pptv.html");
      const patchPath = join(directory, "rename.patch.json");
      const outputPath = join(directory, "patched.pptv.html");
      await writeFile(sourcePath, source);
      await writeFile(
        patchPath,
        JSON.stringify({
          schema: "pptv-patch/0.1",
          baseSha256: deck.source.sha256,
          ops: [{ op: "set-text", id: "cover.title", value: "CLI title" }],
        }),
      );

      const checked = captureEnvironment();
      expect(
        await runCli(
          ["patch", "--check", sourcePath, patchPath],
          checked.environment,
        ),
      ).toBe(0);
      await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });

      const written = captureEnvironment();
      expect(
        await runCli(
          ["patch", sourcePath, patchPath, "--output", outputPath],
          written.environment,
        ),
      ).toBe(0);
      expect(await readFile(outputPath, "utf8")).toContain(">CLI title</text>");
    });
  });

  it("requires an explicit patch check or destination", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      ["patch", "source.pptv.html", "change.json"],
      capture.environment,
    );

    expect(exitCode).toBe(2);
    expect(capture.stderr.join("")).toContain(
      "--check or an explicit --output",
    );
  });

  it("rejects ambiguous check-and-write patch invocation", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      [
        "patch",
        "source.pptv.html",
        "change.json",
        "--check",
        "--output",
        "updated.pptv.html",
      ],
      capture.environment,
    );

    expect(exitCode).toBe(2);
    expect(capture.stderr.join("")).toContain("--check or --output, not both");
  });

  it("rejects unknown options and surplus positional arguments", async () => {
    const unknown = captureEnvironment();
    const extra = captureEnvironment();

    expect(
      await runCli(
        ["validate", "source.pptv.html", "--strcit"],
        unknown.environment,
      ),
    ).toBe(2);
    expect(
      await runCli(
        ["validate", "source.pptv.html", "extra.pptv.html"],
        extra.environment,
      ),
    ).toBe(2);
    expect(unknown.stderr.join("")).toContain('Unknown option "--strcit"');
    expect(extra.stderr.join("")).toContain(
      "validate requires exactly one PPTV path",
    );
  });

  it("dispatches standalone outline, validation, and resolution to diagram schemas", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.pptv.svg");
      await writeFile(sourcePath, await readMinimalDiagram());

      const outlineCapture = captureEnvironment();
      expect(
        await runCli(
          ["outline", sourcePath, "--format", "json"],
          outlineCapture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(outlineCapture.stdout.join(""))).toMatchObject({
        schema: "pptv-diagram-outline/0.1",
        diagramId: "system-overview",
        viewBox: [-100, -50, 1200, 800],
      });

      const validationCapture = captureEnvironment();
      expect(
        await runCli(
          ["validate", sourcePath, "--format", "json"],
          validationCapture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(validationCapture.stdout.join(""))).toMatchObject({
        schema: "pptv-diagram-validation/0.1",
        valid: true,
        diagramId: "system-overview",
      });

      const resolutionCapture = captureEnvironment();
      expect(
        await runCli(
          ["resolve", sourcePath, "--format", "json"],
          resolutionCapture.environment,
        ),
      ).toBe(0);
      const resolution = JSON.parse(
        resolutionCapture.stdout.join(""),
      ) as Record<string, unknown>;
      expect(resolution).toMatchObject({
        schema: "pptv-resolved-diagram/0.1",
        diagramId: "system-overview",
        canvas: { viewBox: [-100, -50, 1200, 800] },
      });
      expect(resolution).not.toHaveProperty("slides");
      expect(resolution).not.toHaveProperty("activeTheme");
    });
  });

  it("uses diagram-specific text, list, and object projections without synthetic slides", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.pptv.svg");
      await writeFile(sourcePath, await readMinimalDiagram());

      const textCapture = captureEnvironment();
      expect(
        await runCli(
          ["text", sourcePath, "--format", "json"],
          textCapture.environment,
        ),
      ).toBe(0);
      const text = JSON.parse(textCapture.stdout.join("")) as {
        entries: Array<Record<string, unknown>>;
      };
      expect(text).toMatchObject({
        schema: "pptv-diagram-text/0.1",
        diagramId: "system-overview",
      });
      expect(text.entries).toHaveLength(3);
      expect(text.entries[0]).toMatchObject({
        diagramId: "system-overview",
        objectId: "system-overview.title",
      });
      expect(text.entries[0]).not.toHaveProperty("slideId");

      const listCapture = captureEnvironment();
      expect(
        await runCli(
          ["list", sourcePath, "--role", "text", "--format", "json"],
          listCapture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(listCapture.stdout.join(""))).toMatchObject({
        schema: "pptv-diagram-query/0.1",
        diagramId: "system-overview",
        objects: [
          { id: "system-overview.title" },
          { id: "system-overview.client.label" },
          { id: "system-overview.service.label" },
        ],
      });

      const showCapture = captureEnvironment();
      expect(
        await runCli(
          ["show", sourcePath, "system-overview.client.label"],
          showCapture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(showCapture.stdout.join(""))).toMatchObject({
        schema: "pptv-diagram-object/0.1",
        diagramId: "system-overview",
        object: { id: "system-overview.client.label" },
      });
    });
  });

  it("rejects deck-only slide selectors against a standalone diagram", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.pptv.svg");
      await writeFile(sourcePath, await readMinimalDiagram());

      const textCapture = captureEnvironment();
      expect(
        await runCli(
          ["text", sourcePath, "--slide", "fake"],
          textCapture.environment,
        ),
      ).toBe(2);
      expect(textCapture.stderr.join("")).toContain(
        '"--slide" is deck-only; standalone diagrams have no slides',
      );

      const listCapture = captureEnvironment();
      expect(
        await runCli(
          ["list", sourcePath, "--slide", "fake"],
          listCapture.environment,
        ),
      ).toBe(2);
      expect(listCapture.stderr.join("")).toContain(
        '"--slide" is deck-only; standalone diagrams have no slides',
      );
    });
  });

  it("checks and writes diagram text patches without changing artifact kind", async () => {
    await withTempDirectory(async (directory) => {
      const source = await readMinimalDiagram();
      const diagram = await loadDiagram({
        kind: "text",
        text: source,
        name: "system.pptv.svg",
      });
      const sourcePath = join(directory, "system.pptv.svg");
      const patchPath = join(directory, "rename.patch.json");
      const outputPath = join(directory, "system.updated.pptv.svg");
      await writeFile(sourcePath, source);
      await writeFile(
        patchPath,
        JSON.stringify({
          schema: "pptv-patch/0.1",
          baseSha256: diagram.source.sha256,
          ops: [
            {
              op: "set-text",
              id: "system-overview.title",
              oldText: "Standalone PPTV diagram",
              value: "Updated diagram",
            },
          ],
        }),
      );

      const capture = captureEnvironment();
      expect(
        await runCli(
          ["patch", sourcePath, patchPath, "--output", outputPath],
          capture.environment,
        ),
      ).toBe(0);
      const output = await readFile(outputPath, "utf8");
      expect(output).toContain(">Updated diagram</text>");
      const reloaded = await loadDiagram({
        kind: "text",
        text: output,
        name: "system.updated.pptv.svg",
      });
      expect(reloaded.sourceKind).toBe("svg");
      expect(reloaded.diagnostics).toEqual([]);
    });
  });

  it("hydrates one deck slide into a validated standalone atom and refuses overwrite", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.pptv.html");
      const outputPath = join(directory, "cover.pptv.svg");
      await writeFile(sourcePath, await readMinimalDeck());

      const capture = captureEnvironment();
      expect(
        await runCli(
          [
            "extract",
            sourcePath,
            "--slide",
            "cover",
            "--output",
            outputPath,
            "--format",
            "json",
          ],
          capture.environment,
        ),
      ).toBe(0);
      const summary = JSON.parse(capture.stdout.join("")) as {
        sourceSha256: string;
        provenance: Record<string, unknown>;
      };
      expect(summary).toMatchObject({
        schema: "pptv-diagram-extraction-result/0.1",
        output: outputPath,
        provenance: {
          method: "pptv-slide-hydration/0.1",
          sourceSlideId: "cover",
        },
      });
      expect(summary.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
      const extracted = await readFile(outputPath, "utf8");
      expect(extracted.startsWith(PPTV_DIAGRAM_DISCOVERY_COMMENT)).toBe(true);
      expect(extracted).toContain('id="cover"');
      expect(extracted).toContain('data-pptv-version="0.1"');
      expect(extracted).not.toContain('class="');
      const diagram = await loadDiagram({
        kind: "text",
        text: extracted,
        name: "cover.pptv.svg",
      });
      expect(diagram.source.sha256).toBe(summary.sourceSha256);
      expect(diagram.diagnostics).toEqual([]);

      const overwriteCapture = captureEnvironment();
      expect(
        await runCli(
          ["extract", sourcePath, "--slide", "cover", "--output", outputPath],
          overwriteCapture.environment,
        ),
      ).toBe(2);
      expect(overwriteCapture.stderr.join("")).toContain(
        "refuses to overwrite existing output",
      );
      expect(await readFile(outputPath, "utf8")).toBe(extracted);
      expect(
        (await readdir(directory)).filter((name) => name.includes(".pptv-")),
      ).toEqual([]);
    });
  });

  it("rejects even a 1600x900 standalone diagram before creating a PPTX", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "sixteen-nine.pptv.svg");
      const outputPath = join(directory, "forbidden.pptx");
      await writeFile(
        sourcePath,
        (await readMinimalDiagram()).replace(
          'viewBox="-100 -50 1200 800"',
          'viewBox="0 0 1600 900"',
        ),
      );
      const capture = captureEnvironment();

      expect(
        await runCli(
          ["pptx-canary", sourcePath, "--output", outputPath],
          capture.environment,
        ),
      ).toBe(1);
      expect(capture.stderr.join("")).toContain("PPTV-DOCUMENT-KIND");
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("names the standalone SVG atom and the HTML-only compiler lane in help", async () => {
    const capture = captureEnvironment();
    expect(await runCli(["help"], capture.environment)).toBe(0);
    const output = capture.stdout.join("");

    expect(output).toContain("file.pptv.svg");
    expect(output).toContain("extract <deck.pptv.html>");
    expect(output).toContain("pptx-canary <deck.pptv.html>");
  });
});
