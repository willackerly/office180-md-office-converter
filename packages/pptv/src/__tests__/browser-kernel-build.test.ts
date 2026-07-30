// Tests: CONTRACT:C4-PPTV-SOURCE.1.1
// Tests: CONTRACT:C5-PPTV-PATCH.1.1
// Tests: CONTRACT:C6-PPTV-RESOLVED.1.1
// Tests: CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const BUILD_SCRIPT_URL = new URL(
  "../../scripts/build-browser-kernel.mjs",
  import.meta.url,
);
const ASSET_URL = new URL(
  "../../assets/pptv-browser-kernel-0.1.iife.js",
  import.meta.url,
);
const META_URL = new URL(
  "../../assets/pptv-browser-kernel-0.1.meta.json",
  import.meta.url,
);
const LEGACY_ASSET_URL = new URL(
  "../../assets/pptv-browser-0.1.script.html",
  import.meta.url,
);

describe("generated shared browser kernel", () => {
  it("is byte-locked to the exact esbuild inputs and excludes Node-only packages", async () => {
    await expect(
      execFileAsync(process.execPath, [BUILD_SCRIPT_URL.pathname, "--check"]),
    ).resolves.toMatchObject({ stderr: "" });

    const [asset, metadata, legacy] = await Promise.all([
      readFile(ASSET_URL, "utf8"),
      readFile(META_URL, "utf8"),
      readFile(LEGACY_ASSET_URL, "utf8"),
    ]);
    const parsed = JSON.parse(metadata) as {
      generator: { name: string; version: string };
      sha256: string;
      inputs: string[];
    };
    expect(parsed.generator).toEqual({ name: "esbuild", version: "0.28.1" });
    expect(parsed.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(parsed.inputs).toEqual(
      expect.arrayContaining([
        "src/browser/conformance-entry.ts",
        "src/core/deck.ts",
        "src/core/resolved.ts",
        "src/core/scan.ts",
        "src/ops/patch.ts",
        expect.stringMatching(/node_modules\/saxes\/saxes\.js$/u),
      ]),
    );
    expect(asset).toContain("PptvBrowserKernel");
    expect(asset).not.toMatch(/\b(?:fontkit|jszip|node:fs|node:path)\b/iu);
    expect(legacy).toContain("pptv-browser/0.1");
  });
});
