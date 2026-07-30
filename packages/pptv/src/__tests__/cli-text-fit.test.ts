// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C6-PPTV-RESOLVED.1.1,
// CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PptvDiagramTextMeasurer,
  PptvTextMeasurer,
} from "../core/text-fit.js";

const adapterMocks = vi.hoisted(() => ({
  parseFontMap: vi.fn(),
  createFontkitTextMeasurer: vi.fn(),
}));

vi.mock("../node/fontkit-text-measurer.js", () => adapterMocks);

import { runCli, type CliEnvironment } from "../cli.js";
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

async function withFixture(
  run: (sourcePath: string, fontMapPath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pptv-text-fit-cli-"));
  const sourcePath = join(directory, "deck.pptv.html");
  const fontMapPath = join(directory, "fonts.json");
  try {
    await writeFile(sourcePath, await readMinimalDeck());
    await writeFile(fontMapPath, '{"schema":"fixture"}');
    await run(sourcePath, fontMapPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withDiagramFixture(
  run: (sourcePath: string, fontMapPath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pptv-diagram-fit-cli-"));
  const sourcePath = join(directory, "diagram.pptv.svg");
  const fontMapPath = join(directory, "fonts.json");
  try {
    await writeFile(
      sourcePath,
      await readFile(
        new URL(
          "../../../../examples/minimal-diagram.pptv.svg",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await writeFile(fontMapPath, '{"schema":"fixture"}');
    await run(sourcePath, fontMapPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  adapterMocks.parseFontMap.mockReturnValue({
    schema: "pptv-font-map/0.1",
    faces: [],
  });
});

describe("PPTV text-fit CLI", () => {
  it("emits the complete JSON result and fails for overflow or unverified lines", async () => {
    const measurer: PptvTextMeasurer = (request) => {
      if (request.objectId === "cover.title") {
        return {
          kind: "measured",
          width: 1_400,
          method: "fixture",
          fontIdentity: "fixture",
        };
      }
      if (request.objectId === "architecture.title") {
        return {
          kind: "unverified",
          method: "fixture",
          reason: "missing face",
        };
      }
      return {
        kind: "measured",
        width: 10,
        method: "fixture",
        fontIdentity: "fixture",
      };
    };
    adapterMocks.createFontkitTextMeasurer.mockResolvedValue(measurer);

    await withFixture(async (sourcePath, fontMapPath) => {
      const capture = captureEnvironment();
      const exitCode = await runCli(
        ["text-fit", sourcePath, "--font-map", fontMapPath, "--format", "json"],
        capture.environment,
      );
      const output = JSON.parse(capture.stdout.join("")) as {
        schema: string;
        summary: {
          total: number;
          overflow: number;
          unverified: number;
        };
      };

      expect(exitCode).toBe(1);
      expect(output).toMatchObject({
        schema: "pptv-text-fit/0.1",
        summary: { total: 5, overflow: 1, unverified: 1 },
      });
      expect(adapterMocks.parseFontMap).toHaveBeenCalledWith(
        { schema: "fixture" },
        expect.any(String),
      );
      expect(adapterMocks.createFontkitTextMeasurer).toHaveBeenCalledWith([]);
      expect(capture.stderr).toEqual([]);
    });
  });

  it("prints only warnings/errors plus a concise text summary", async () => {
    const measurer: PptvTextMeasurer = (request) => ({
      kind: "measured",
      width: request.objectId === "cover.title" ? 1_300 : 10,
      method: "fixture",
      fontIdentity: "fixture",
    });
    adapterMocks.createFontkitTextMeasurer.mockResolvedValue(measurer);

    await withFixture(async (sourcePath, fontMapPath) => {
      const capture = captureEnvironment();
      const exitCode = await runCli(
        ["text-fit", sourcePath, "--font-map", fontMapPath],
        capture.environment,
      );
      const output = capture.stdout.join("");

      expect(exitCode).toBe(0);
      expect(output).toContain("NEAR-LIMIT cover/cover.title#1");
      expect(output).toContain(
        "text-fit 5 lines: 4 clear, 1 near-limit, 0 overflow, 0 unverified",
      );
      expect(output).not.toContain("cover.subtitle#1");
      expect(capture.stderr).toEqual([]);
    });
  });

  it("requires a font map and a bounded near-limit threshold", async () => {
    const missingMap = captureEnvironment();
    const badThreshold = captureEnvironment();

    expect(
      await runCli(["text-fit", "deck.pptv.html"], missingMap.environment),
    ).toBe(2);
    expect(missingMap.stderr.join("")).toContain(
      "requires an explicit --font-map PATH",
    );

    expect(
      await runCli(
        [
          "text-fit",
          "deck.pptv.html",
          "--font-map",
          "fonts.json",
          "--near-limit",
          "1",
        ],
        badThreshold.environment,
      ),
    ).toBe(2);
    expect(badThreshold.stderr.join("")).toContain(
      "--near-limit must be a finite number",
    );
  });

  it("distinguishes malformed font maps from font-loading environment failures", async () => {
    adapterMocks.parseFontMap.mockImplementation(() => {
      throw new Error("schema must be pptv-font-map/0.1");
    });
    adapterMocks.createFontkitTextMeasurer.mockResolvedValue((() => ({
      kind: "measured",
      width: 1,
      method: "fixture",
      fontIdentity: "fixture",
    })) satisfies PptvTextMeasurer);

    await withFixture(async (sourcePath, fontMapPath) => {
      const capture = captureEnvironment();
      const exitCode = await runCli(
        ["text-fit", sourcePath, "--font-map", fontMapPath],
        capture.environment,
      );

      expect(exitCode).toBe(2);
      expect(capture.stderr.join("")).toContain(
        "Invalid font map: schema must be pptv-font-map/0.1",
      );

      adapterMocks.parseFontMap.mockReturnValue({
        schema: "pptv-font-map/0.1",
        faces: [],
      });
      adapterMocks.createFontkitTextMeasurer.mockRejectedValueOnce(
        new Error("font file could not be loaded"),
      );
      const environmentFailure = captureEnvironment();
      const environmentExitCode = await runCli(
        ["text-fit", sourcePath, "--font-map", fontMapPath],
        environmentFailure.environment,
      );

      expect(environmentExitCode).toBe(3);
      expect(environmentFailure.stderr.join("")).toContain(
        "PPTV environment failure: font file could not be loaded",
      );
    });
  });

  it("emits diagram-specific JSON and text evidence with the same exit policy", async () => {
    const measurer: PptvDiagramTextMeasurer = (request) => ({
      kind: "measured",
      width: request.objectId === "system-overview.service.label" ? 300 : 10,
      method: "fixture",
      fontIdentity: "fixture",
    });
    adapterMocks.createFontkitTextMeasurer.mockResolvedValue(measurer);

    await withDiagramFixture(async (sourcePath, fontMapPath) => {
      const jsonCapture = captureEnvironment();
      expect(
        await runCli(
          [
            "text-fit",
            sourcePath,
            "--font-map",
            fontMapPath,
            "--format",
            "json",
          ],
          jsonCapture.environment,
        ),
      ).toBe(1);
      const result = JSON.parse(jsonCapture.stdout.join("")) as {
        lines: Array<Record<string, unknown>>;
      };
      expect(result).toMatchObject({
        schema: "pptv-diagram-text-fit/0.1",
        diagramId: "system-overview",
        summary: { total: 3, overflow: 1, unverified: 0 },
      });
      expect(result.lines[0]).toHaveProperty("diagramId", "system-overview");
      expect(result.lines[0]).not.toHaveProperty("slideId");
      expect(JSON.stringify(result)).not.toContain("activeTheme");

      const textCapture = captureEnvironment();
      expect(
        await runCli(
          ["text-fit", sourcePath, "--font-map", fontMapPath],
          textCapture.environment,
        ),
      ).toBe(1);
      expect(textCapture.stdout.join("")).toContain(
        "OVERFLOW system-overview/system-overview.service.label#1",
      );
      expect(textCapture.stdout.join("")).toContain(
        "text-fit 3 lines: 2 clear, 0 near-limit, 1 overflow, 0 unverified",
      );
    });
  });
});
