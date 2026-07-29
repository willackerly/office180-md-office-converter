import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "../cli.js";
import { loadDeck } from "../core/deck.js";
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
});
