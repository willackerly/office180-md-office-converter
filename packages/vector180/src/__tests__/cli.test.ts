// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C5-PPTV-PATCH.2.0,
// CONTRACT:C6-PPTV-RESOLVED.2.0, CONTRACT:C7-PPTX-CANARY.2.0

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck, loadAtom } from "../core/deck.js";
import { VECTOR180_ATOM_DISCOVERY_COMMENT } from "../core/extract.js";
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
  const directory = await mkdtemp(join(tmpdir(), "vector180-cli-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readMinimalAtom(): Promise<string> {
  return readFile(
    new URL(
      "../../../../examples/minimal-diagram.vector180.svg",
      import.meta.url,
    ),
    "utf8",
  );
}

describe("Vector180 CLI", () => {
  it("scaffolds validated no-overwrite atom and deck sources", async () => {
    await withTempDirectory(async (directory) => {
      const atomPath = join(directory, "starter.vector180.svg");
      const deckPath = join(directory, "starter.vector180.html");
      const atomCapture = captureEnvironment();
      const deckCapture = captureEnvironment();

      expect(
        await runCli(
          [
            "new",
            "atom",
            "--output",
            atomPath,
            "--id",
            "starter",
            "--title",
            'Architecture & "intent"',
          ],
          atomCapture.environment,
        ),
      ).toBe(0);
      const atom = await loadAtom({
        kind: "text",
        text: await readFile(atomPath, "utf8"),
      });
      expect(atom.viewBox).toEqual([0, 0, 1600, 900]);
      expect(atom.metadata?.styleFamily?.id).toBe(
        "office180.vector180.default",
      );
      expect(atom.diagnostics).toEqual([]);

      expect(
        await runCli(
          [
            "new",
            "deck",
            "--output",
            deckPath,
            "--title",
            "Report </script> & safe",
          ],
          deckCapture.environment,
        ),
      ).toBe(0);
      const deck = await loadDeck({
        kind: "text",
        text: await readFile(deckPath, "utf8"),
      });
      expect(deck.title).toBe("Report </script> & safe");
      expect(deck.slideOrder).toEqual(["cover"]);
      expect(deck.diagnostics).toEqual([]);

      const collision = captureEnvironment();
      expect(
        await runCli(
          [
            "new",
            "atom",
            "--output",
            atomPath,
            "--id",
            "starter",
            "--title",
            "Do not replace",
          ],
          collision.environment,
        ),
      ).toBe(2);
      expect(collision.stderr.join("")).toContain("refuses to overwrite");

      const incompleteDimensions = captureEnvironment();
      expect(
        await runCli(
          [
            "new",
            "atom",
            "--output",
            join(directory, "incomplete.vector180.svg"),
            "--id",
            "incomplete",
            "--title",
            "Incomplete dimensions",
            "--width",
            "1200",
          ],
          incompleteDimensions.environment,
        ),
      ).toBe(2);
      expect(incompleteDimensions.stderr.join("")).toContain(
        "--width and --height",
      );
    });
  });

  it("returns a manifest-only JSON outline", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
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
      expect(output.schema).toBe("vector180-deck-outline/0.1");
      expect(capture.stdout.join("")).not.toContain("vector180-browser");
      expect(capture.stderr).toEqual([]);
    });
  });

  it("uses validation exit code 1 for an ambiguous stable ID", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "invalid.vector180.html");
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
      expect(capture.stderr.join("")).toContain("VECTOR180-ID-DUPLICATE");
    });
  });

  it("emits the pure compiler-grade resolved model", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
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
      expect(output.schema).toBe("vector180-resolved-deck/0.1");
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
      const sourcePath = join(directory, "invalid.vector180.html");
      await writeFile(sourcePath, "<!doctype html><p>not a deck</p>");
      const capture = captureEnvironment();

      const exitCode = await runCli(
        ["resolve", sourcePath],
        capture.environment,
      );

      expect(exitCode).toBe(1);
      expect(JSON.parse(capture.stdout.join(""))).toMatchObject({
        schema: "vector180-diagnostics/0.1",
      });
      expect(capture.stderr).toEqual([]);
    });
  });

  it("atomically writes a deterministic trusted editor wrapper", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
      const outputPath = join(directory, "deck.editable.html");
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
      expect(summary.schema).toBe("vector180-editor-pack-result/0.1");
      expect(wrapper).toContain("vector180-editor/0.1");
      expect(wrapper).toContain("source hash verified");
      expect(wrapper).not.toContain(
        'data-vector180-runtime="vector180-browser/0.1"',
      );
      expect(capture.stderr).toEqual([]);
    });
  });

  it("requires an explicit editor-pack destination", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      ["editor-pack", "source.vector180.html"],
      capture.environment,
    );

    expect(exitCode).toBe(2);
    expect(capture.stderr.join("")).toContain(
      "requires an explicit --output PATH",
    );
  });

  it("passes an explicit font map and fit threshold into the editor pack", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
      const fontMapPath = join(directory, "fonts.json");
      const outputPath = join(directory, "deck.editable.html");
      const defaultOutputPath = join(directory, "deck-default.editable.html");
      await writeFile(sourcePath, await readMinimalDeck());
      await writeFile(
        fontMapPath,
        '{"schema":"vector180-font-map/0.1","faces":[]}',
      );
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
        schema: "vector180-editor-pack-result/0.1",
        documentKind: "deck",
      });
      expect(await readFile(outputPath, "utf8")).toContain('"nearLimit":0.8');

      const packagedDefault = captureEnvironment();
      expect(
        await runCli(
          [
            "editor-pack",
            sourcePath,
            "--output",
            defaultOutputPath,
            "--near-limit",
            "0.8",
            "--format",
            "json",
          ],
          packagedDefault.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(packagedDefault.stdout.join(""))).toMatchObject({
        schema: "vector180-editor-pack-result/0.1",
        fontEnvironment: {
          schema: "office180-vector180-default-font-map/0.1",
        },
      });
    });
  });

  it("atomically writes the explicit deterministic PPTX canary destination", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
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
      expect(summary.schema).toBe("vector180-pptx-canary-result/0.1");
      expect(summary.partCount).toBe(17);
      expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
      expect(capture.stderr).toEqual([]);
    });
  });

  it("fails closed without a PPTX when source geometry exceeds the canary", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "rounded.vector180.html");
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
        "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      );
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("requires an explicit PPTX canary destination", async () => {
    const capture = captureEnvironment();
    const exitCode = await runCli(
      ["pptx-canary", "source.vector180.html"],
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
      const sourcePath = join(directory, "deck.vector180.html");
      const patchPath = join(directory, "rename.patch.json");
      const outputPath = join(directory, "patched.vector180.html");
      await writeFile(sourcePath, source);
      await writeFile(
        patchPath,
        JSON.stringify({
          schema: "vector180-patch/0.1",
          baseSha256: deck.source.sha256,
          ops: [
            {
              op: "set-text",
              id: "cover.title",
              oldText: "Minimal Vector180 deck",
              value: "CLI title",
            },
          ],
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
      ["patch", "source.vector180.html", "change.json"],
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
        "source.vector180.html",
        "change.json",
        "--check",
        "--output",
        "updated.vector180.html",
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
        ["validate", "source.vector180.html", "--strcit"],
        unknown.environment,
      ),
    ).toBe(2);
    expect(
      await runCli(
        ["validate", "source.vector180.html", "extra.vector180.html"],
        extra.environment,
      ),
    ).toBe(2);
    expect(unknown.stderr.join("")).toContain('Unknown option "--strcit"');
    expect(extra.stderr.join("")).toContain(
      "validate requires exactly one Vector180 path",
    );
  });

  it("dispatches standalone outline, validation, and resolution to diagram schemas", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.vector180.svg");
      await writeFile(sourcePath, await readMinimalAtom());

      const outlineCapture = captureEnvironment();
      expect(
        await runCli(
          ["outline", sourcePath, "--format", "json"],
          outlineCapture.environment,
        ),
      ).toBe(0);
      expect(JSON.parse(outlineCapture.stdout.join(""))).toMatchObject({
        schema: "vector180-atom-outline/0.1",
        wireFamily: "vector180",
        atomId: "system-overview",
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
        schema: "vector180-atom-validation/0.1",
        wireFamily: "vector180",
        valid: true,
        atomId: "system-overview",
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
        schema: "vector180-resolved-atom/0.1",
        atomId: "system-overview",
        canvas: { viewBox: [-100, -50, 1200, 800] },
      });
      expect(resolution).not.toHaveProperty("slides");
      expect(resolution).not.toHaveProperty("activeTheme");
    });
  });

  it("uses diagram-specific text, list, and object projections without synthetic slides", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.vector180.svg");
      await writeFile(sourcePath, await readMinimalAtom());

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
        schema: "vector180-atom-text/0.1",
        wireFamily: "vector180",
        atomId: "system-overview",
      });
      expect(text.entries).toHaveLength(3);
      expect(text.entries[0]).toMatchObject({
        wireFamily: "vector180",
        atomId: "system-overview",
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
        schema: "vector180-atom-query/0.1",
        wireFamily: "vector180",
        atomId: "system-overview",
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
        schema: "vector180-atom-object/0.1",
        wireFamily: "vector180",
        atomId: "system-overview",
        object: {
          wireFamily: "vector180",
          id: "system-overview.client.label",
        },
      });
    });
  });

  it("rejects deck-only slide selectors against a standalone diagram", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "system.vector180.svg");
      await writeFile(sourcePath, await readMinimalAtom());

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
      const source = await readMinimalAtom();
      const diagram = await loadAtom({
        kind: "text",
        text: source,
        name: "system.vector180.svg",
      });
      const sourcePath = join(directory, "system.vector180.svg");
      const patchPath = join(directory, "rename.patch.json");
      const outputPath = join(directory, "system.updated.vector180.svg");
      await writeFile(sourcePath, source);
      await writeFile(
        patchPath,
        JSON.stringify({
          schema: "vector180-patch/0.1",
          baseSha256: diagram.source.sha256,
          ops: [
            {
              op: "set-text",
              id: "system-overview.title",
              oldText: "Standalone Vector180 diagram",
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
      const reloaded = await loadAtom({
        kind: "text",
        text: output,
        name: "system.updated.vector180.svg",
      });
      expect(reloaded.sourceKind).toBe("svg");
      expect(reloaded.diagnostics).toEqual([]);
    });
  });

  it("hydrates one deck slide into a validated standalone atom and refuses overwrite", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "deck.vector180.html");
      const outputPath = join(directory, "cover.vector180.svg");
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
        schema: "vector180-atom-extraction-result/0.1",
        output: outputPath,
        provenance: {
          method: "vector180-slide-hydration/0.1",
          sourceObjectId: "cover",
        },
      });
      expect(summary.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
      const extracted = await readFile(outputPath, "utf8");
      expect(extracted.startsWith(VECTOR180_ATOM_DISCOVERY_COMMENT)).toBe(true);
      expect(extracted).toContain('id="cover"');
      expect(extracted).toContain('data-vector180-version="0.1"');
      expect(extracted).not.toContain('class="');
      const diagram = await loadAtom({
        kind: "text",
        text: extracted,
        name: "cover.vector180.svg",
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
        (await readdir(directory)).filter((name) =>
          name.includes(".vector180-"),
        ),
      ).toEqual([]);
    });
  });

  it("rejects even a 1600x900 standalone diagram before creating a PPTX", async () => {
    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, "sixteen-nine.vector180.svg");
      const outputPath = join(directory, "forbidden.pptx");
      await writeFile(
        sourcePath,
        (await readMinimalAtom()).replace(
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
      expect(capture.stderr.join("")).toContain("VECTOR180-DOCUMENT-KIND");
      await expect(readFile(outputPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("names the standalone SVG atom and the HTML-only compiler lane in help", async () => {
    const capture = captureEnvironment();
    expect(await runCli(["help"], capture.environment)).toBe(0);
    const output = capture.stdout.join("");

    expect(output).toContain("file.vector180.svg");
    expect(output).toContain("extract <deck.vector180.html>");
    expect(output).toContain("pptx-canary <deck.vector180.html>");
  });

  it("provides accurate scoped help for every subcommand without other arguments", async () => {
    const cases: readonly {
      readonly argv: readonly string[];
      readonly usage: string;
    }[] = [
      {
        argv: ["new", "--help"],
        usage:
          "vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]",
      },
      {
        argv: ["new", "atom", "--help"],
        usage:
          "vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]",
      },
      {
        argv: ["new", "deck", "--help"],
        usage: "vector180 new deck --output PATH --title TITLE",
      },
      {
        argv: ["metadata", "--help"],
        usage: "vector180 metadata <atom.vector180.svg> [--format text|json]",
      },
      {
        argv: ["metadata-compare", "--help"],
        usage:
          "vector180 metadata-compare <left.vector180.svg> <right.vector180.svg> [--template-basis PATH] [--format text|json]",
      },
      {
        argv: ["diff", "--help"],
        usage:
          "vector180 diff <left.vector180.svg> <right.vector180.svg> [--output PATH] [--format text|json]",
      },
      {
        argv: ["migrate", "--help"],
        usage:
          "vector180 migrate <legacy.pptv.svg> --output PATH [--report PATH] [--format text|json]",
      },
      {
        argv: ["outline", "--help"],
        usage:
          "vector180 outline <file.vector180.html|file.vector180.svg> [--format text|json]",
      },
      {
        argv: ["validate", "--help"],
        usage:
          "vector180 validate <file.vector180.html|file.vector180.svg> [--format text|json]",
      },
      {
        argv: ["resolve", "--help"],
        usage:
          "vector180 resolve <file.vector180.html|file.vector180.svg> [--format text|json]",
      },
      {
        argv: ["extract", "--help"],
        usage:
          "vector180 extract <deck.vector180.html> --slide ID --output file.vector180.svg [--format text|json]",
      },
      {
        argv: ["editor-pack", "--help"],
        usage:
          "vector180 editor-pack <file.vector180.html|file.vector180.svg> --output PATH [--font-map default|PATH] [--near-limit N] [--format text|json]",
      },
      {
        argv: ["pptx-canary", "--help"],
        usage:
          "vector180 pptx-canary <deck.vector180.html> --output PATH [--format text|json]",
      },
      {
        argv: ["compose", "--help"],
        usage:
          "vector180 compose <atom.vector180.svg> --placement X,Y,W,H --output PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]",
      },
      {
        argv: ["compile", "--help"],
        usage:
          "vector180 compile <atom.vector180.svg> --placement X,Y,W,H --output PATH --map PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]",
      },
      {
        argv: ["reconcile", "--help"],
        usage:
          "vector180 reconcile <edited.pptx> --source atom.vector180.svg --baseline atom.vector180.map.json [--native-baseline native-save.pptx] [--resolution reviewed-copy.json] --patch PATH --report PATH [--format text|json]",
      },
      {
        argv: ["text-fit", "--help"],
        usage:
          "vector180 text-fit <file.vector180.html|file.vector180.svg> [--font-map default|PATH] [--near-limit N] [--format text|json]",
      },
      {
        argv: ["text", "--help"],
        usage:
          "vector180 text <file.vector180.html|file.vector180.svg> [--slide ID] [--include-hidden] [--format text|json|jsonl]",
      },
      {
        argv: ["show", "--help"],
        usage:
          "vector180 show <file.vector180.html|file.vector180.svg> <id> [--view semantic|editing] [--format json]",
      },
      {
        argv: ["list", "--help"],
        usage:
          "vector180 list <file.vector180.html|file.vector180.svg> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT] [--view semantic|editing] [--format text|json|jsonl]",
      },
      {
        argv: ["patch", "--help"],
        usage: "vector180 patch SOURCE PATCH.json --check [--format text|json]",
      },
    ];

    for (const testCase of cases) {
      const capture = captureEnvironment();
      const label = testCase.argv.slice(0, -1).join(" ");
      expect(
        await runCli(testCase.argv, capture.environment),
        `${label} should return help`,
      ).toBe(0);
      expect(
        capture.stdout.join(""),
        `${label} should print its usage`,
      ).toContain(`Usage:\n  ${testCase.usage}`);
      expect(capture.stderr, `${label} should not print an error`).toEqual([]);
    }
  });

  it("provides task-scoped help for both scaffolds and canonical patching", async () => {
    const atom = captureEnvironment();
    const deck = captureEnvironment();
    const patch = captureEnvironment();

    expect(await runCli(["new", "atom", "--help"], atom.environment)).toBe(0);
    expect(await runCli(["new", "deck", "-h"], deck.environment)).toBe(0);
    expect(await runCli(["patch", "--help"], patch.environment)).toBe(0);

    expect(atom.stdout.join("")).toContain("--width 1600 --height 900");
    expect(deck.stdout.join("")).toContain("explicit HTML deck/report");
    expect(patch.stdout.join("")).toContain('"oldText":"Old title"');
    expect(atom.stderr).toEqual([]);
    expect(deck.stderr).toEqual([]);
    expect(patch.stderr).toEqual([]);
  });
});
