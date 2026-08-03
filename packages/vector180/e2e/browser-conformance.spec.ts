// Verification: CONTRACT:C4-PPTV-SOURCE.2.0
// Verification: CONTRACT:C6-PPTV-RESOLVED.2.0
// Verification: CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { create as createFont } from "fontkit";

import type {
  Vector180Atom,
  Vector180AtomTextFitResult,
  Vector180AtomTextMeasurer,
  Vector180ResolvedAtomResult,
} from "../src/core/index.js";
import { createFontkitTextMeasurer } from "../src/node/fontkit-text-measurer.js";
import {
  inspectVector180Conformance,
  type Vector180BrowserConformanceResult,
} from "../src/browser/runtime.js";
import type {
  Vector180BrowserFontSource,
  Vector180BrowserTextMeasureRequest,
  Vector180PreparedBrowserTextMeasurer,
} from "../src/browser/text-measurer.js";

interface BrowserKernel {
  inspectVector180Conformance(input: {
    kind: "text";
    text: string;
    name: string;
  }): Promise<Vector180BrowserConformanceResult>;
  prepareVector180BrowserTextMeasurer(
    sources: readonly Vector180BrowserFontSource[],
  ): Promise<Vector180PreparedBrowserTextMeasurer>;
  loadAtom(input: {
    kind: "text";
    text: string;
    name: string;
  }): Promise<Vector180Atom>;
  resolveVector180Atom(diagram: Vector180Atom): Vector180ResolvedAtomResult;
  preflightAtomTextFit(
    diagram: NonNullable<Vector180ResolvedAtomResult["model"]>,
    measurer: Vector180AtomTextMeasurer,
  ): Vector180AtomTextFitResult;
}

const MINIMAL_DECK_URL = new URL(
  "../../../examples/minimal-deck.vector180.html",
  import.meta.url,
);
const KITCHEN_SINK_URL = new URL(
  "../test-fixtures/c6/kitchen-sink.vector180.svg",
  import.meta.url,
);
const INVALID_PROFILE_URL = new URL(
  "../test-fixtures/c6/invalid-profile.vector180.svg",
  import.meta.url,
);
const FONT_MANIFEST_URL = new URL(
  "../test-fixtures/fonts/manifest.json",
  import.meta.url,
);
const FONT_URL = new URL(
  "../test-fixtures/fonts/ABeeZee-Regular.ttf",
  import.meta.url,
);
const CALIBRATION_URL = new URL(
  "../test-fixtures/c8/browser-calibration.json",
  import.meta.url,
);
const BROWSER_KERNEL_URL = new URL(
  "../assets/vector180-browser-kernel-0.1.iife.js",
  import.meta.url,
);

const fixtures = [
  {
    name: "minimal-deck.vector180.html",
    url: MINIMAL_DECK_URL,
  },
  {
    name: "kitchen-sink.vector180.svg",
    url: KITCHEN_SINK_URL,
  },
  {
    name: "invalid-profile.vector180.svg",
    url: INVALID_PROFILE_URL,
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/harness.html");
  await expect(page.locator("#status")).toHaveText(
    "Vector180 browser kernel harness",
  );
});

for (const fixture of fixtures) {
  test(`C4/C6 normalized parity: ${fixture.name}`, async ({ page }) => {
    const source = await readFile(fixture.url, "utf8");
    const nodeResult = await inspectVector180Conformance({
      kind: "text",
      text: source,
      name: fixture.name,
    });
    const browserResult = await page.evaluate(
      async ({ name, text }) => {
        const kernel = (
          globalThis as unknown as { Vector180BrowserKernel: BrowserKernel }
        ).Vector180BrowserKernel;
        return kernel.inspectVector180Conformance({ kind: "text", text, name });
      },
      { name: fixture.name, text: source },
    );

    expect(browserResult).toEqual(nodeResult);
  });
}

test("C8 loads exact bytes, labels the environment, and fails closed on missing glyphs", async ({
  page,
}, testInfo) => {
  const [
    manifestBytes,
    calibrationBytes,
    fontBytes,
    diagramBytes,
    browserKernelBytes,
    testSourceBytes,
  ] = await Promise.all([
    readFile(FONT_MANIFEST_URL),
    readFile(CALIBRATION_URL),
    readFile(FONT_URL),
    readFile(KITCHEN_SINK_URL),
    readFile(BROWSER_KERNEL_URL),
    readFile(fileURLToPath(import.meta.url)),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    font: {
      family: string;
      weight: 400;
      style: "normal";
      sha256: string;
    };
    coverage: {
      method: string;
      checkedCodepoints: number[];
      missingCodepoints: number[];
    };
    samples: {
      measured: string;
      missing: string;
    };
  };
  const calibration = JSON.parse(calibrationBytes.toString("utf8")) as {
    fontSize: number;
    nearLimit: number;
    tolerance: {
      absoluteSvgUnits: number;
      relative: number;
      acceptance: "absolute-or-relative";
      primaryOracle: string;
      diagnosticAlternate: string;
    };
    platformGridFittingCapture: {
      engine: "chromium";
      engineVersion: string;
      platform: string;
      devicePixelRatio: number;
      widths: Record<string, number>;
      behavior: string;
    };
    samples: {
      id: string;
      text: string;
      nodeUtilization: number;
      expectedBand: "clear" | "near-limit" | "boundary" | "overflow";
    }[];
  };
  const nodeMeasurer = await createFontkitTextMeasurer([
    {
      family: manifest.font.family,
      weight: manifest.font.weight,
      style: manifest.font.style,
      path: fileURLToPath(FONT_URL),
      postscriptName: "ABeeZee-Regular",
    },
  ]);
  const diagramSource = diagramBytes.toString("utf8");
  const inputIdentity = {
    browserKernel: fileIdentity(browserKernelBytes),
    calibration: fileIdentity(calibrationBytes),
    font: fileIdentity(fontBytes),
    fontManifest: fileIdentity(manifestBytes),
    testSource: fileIdentity(testSourceBytes),
    diagramFixture: fileIdentity(diagramBytes),
  };
  const calibrationFont = createFont(fontBytes);
  if ("fonts" in calibrationFont) {
    throw new Error("Calibration fixture must remain one static font face.");
  }
  const nodeRows = calibration.samples.map((sample, lineIndex) => {
    const measurement = nodeMeasurer({
      slideId: "calibration",
      objectId: sample.id,
      lineIndex,
      text: sample.text,
      font: {
        family: manifest.font.family,
        size: calibration.fontSize,
        weight: manifest.font.weight,
        style: manifest.font.style,
      },
    });
    if (measurement.kind !== "measured") {
      throw new Error(
        `Node calibration sample "${sample.id}" was not measured: ${measurement.reason}`,
      );
    }
    const kernedRun = calibrationFont.layout(sample.text);
    const unkernedRun = calibrationFont.layout(sample.text, { kern: false });
    const scaledKernedAdvances = kernedRun.positions.map(
      ({ xAdvance }) =>
        (xAdvance * calibration.fontSize) / calibrationFont.unitsPerEm,
    );
    const unkernedWidth =
      (unkernedRun.positions.reduce(
        (sum, position) => sum + position.xAdvance,
        0,
      ) *
        calibration.fontSize) /
      calibrationFont.unitsPerEm;
    return {
      ...sample,
      nodeWidth: measurement.width,
      nodeUnkernedWidth: unkernedWidth,
      shapedGlyphCount: kernedRun.glyphs.length,
      nearestPixelAdvanceEnvelope: scaledKernedAdvances.reduce(
        (sum, advance) => sum + Math.abs(Math.round(advance) - advance),
        0,
      ),
      availableWidth: measurement.width / sample.nodeUtilization,
    };
  });

  const result = await page.evaluate(
    async (fixture) => {
      const kernel = (
        globalThis as unknown as { Vector180BrowserKernel: BrowserKernel }
      ).Vector180BrowserKernel;
      const response = await fetch("/fixtures/fonts/ABeeZee-Regular.ttf");
      if (!response.ok)
        throw new Error(`font fetch failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const prepared = await kernel.prepareVector180BrowserTextMeasurer([
        {
          family: fixture.font.family,
          weight: fixture.font.weight,
          style: fixture.font.style,
          bytes,
          coverage: fixture.coverage,
        },
      ]);
      const browserRows = fixture.nodeRows.map((sample, lineIndex) => {
        const measurement = prepared.measure({
          atomId: "conformance",
          objectId: sample.id,
          lineIndex,
          text: sample.text,
          font: {
            family: fixture.font.family,
            size: fixture.fontSize,
            weight: fixture.font.weight,
            style: fixture.font.style,
          },
        } satisfies Vector180BrowserTextMeasureRequest);
        return { id: sample.id, measurement };
      });
      const missing = prepared.measure({
        atomId: "conformance",
        objectId: "missing-glyph",
        lineIndex: 0,
        text: fixture.samples.missing,
        font: {
          family: fixture.font.family,
          size: fixture.fontSize,
          weight: fixture.font.weight,
          style: fixture.font.style,
        },
      });
      const unmapped = prepared.measure({
        atomId: "conformance",
        objectId: "unmapped-face",
        lineIndex: 0,
        text: fixture.samples.measured,
        font: {
          family: "Not Mapped",
          size: fixture.fontSize,
          weight: fixture.font.weight,
          style: fixture.font.style,
        },
      });
      const diagram = await kernel.loadAtom({
        kind: "text",
        text: fixture.diagramSource,
        name: "kitchen-sink.vector180.svg",
      });
      const resolvedAtom = kernel.resolveVector180Atom(diagram);
      if (resolvedAtom.model === undefined) {
        throw new Error(
          `diagram resolution failed: ${JSON.stringify(resolvedAtom.diagnostics)}`,
        );
      }
      const diagramFit = kernel.preflightAtomTextFit(
        resolvedAtom.model,
        prepared.measure,
      );
      const result = {
        environment: prepared.environment,
        fonts: prepared.fonts,
        browserRows,
        missing,
        unmapped,
        diagramFit,
      };
      prepared.dispose();
      return result;
    },
    {
      ...manifest,
      diagramSource,
      fontSize: calibration.fontSize,
      nodeRows,
    },
  );

  expect(result.environment.userAgent.length).toBeGreaterThan(20);
  expect(result.environment.engine).toBe(testInfo.project.name);
  expect(result.environment.platform.length).toBeGreaterThan(0);
  expect(result.environment.devicePixelRatio).toBeGreaterThan(0);
  expect(result.fonts).toEqual([
    expect.objectContaining({
      family: "ABeeZee",
      sha256: manifest.font.sha256,
      coverageMethod: manifest.coverage.method,
    }),
  ]);

  const evidenceRows = result.browserRows.map((browserRow, index) => {
    const nodeRow = nodeRows[index];
    if (nodeRow === undefined || browserRow.measurement.kind !== "measured") {
      throw new Error(
        `Browser calibration sample "${browserRow.id}" was not measured.`,
      );
    }
    const browserWidth = browserRow.measurement.width;
    const absoluteDelta = Math.abs(browserWidth - nodeRow.nodeWidth);
    const relativeDelta =
      nodeRow.nodeWidth === 0 ? 0 : absoluteDelta / nodeRow.nodeWidth;
    const absoluteUnkernedDelta = Math.abs(
      browserWidth - nodeRow.nodeUnkernedWidth,
    );
    const relativeUnkernedDelta =
      nodeRow.nodeUnkernedWidth === 0
        ? 0
        : absoluteUnkernedDelta / nodeRow.nodeUnkernedWidth;
    const matchesKerned =
      absoluteDelta <= calibration.tolerance.absoluteSvgUnits ||
      relativeDelta <= calibration.tolerance.relative;
    const matchesUnkerned =
      absoluteUnkernedDelta <= calibration.tolerance.absoluteSvgUnits ||
      relativeUnkernedDelta <= calibration.tolerance.relative;
    const withinNearestPixelAdvanceEnvelope =
      absoluteDelta <= nodeRow.nearestPixelAdvanceEnvelope + 1e-9;
    return {
      id: nodeRow.id,
      text: nodeRow.text,
      expectedBand: nodeRow.expectedBand,
      availableWidth: nodeRow.availableWidth,
      nodeWidth: nodeRow.nodeWidth,
      nodeUnkernedWidth: nodeRow.nodeUnkernedWidth,
      browserWidth,
      absoluteDelta,
      relativeDelta,
      absoluteUnkernedDelta,
      relativeUnkernedDelta,
      nodeStatus: classify(
        nodeRow.nodeWidth,
        nodeRow.availableWidth,
        calibration.nearLimit,
      ),
      browserStatus: classify(
        browserWidth,
        nodeRow.availableWidth,
        calibration.nearLimit,
      ),
      method: browserRow.measurement.method,
      fontIdentity: browserRow.measurement.fontIdentity,
      matchesKerned,
      matchesUnkerned,
      shapedGlyphCount: nodeRow.shapedGlyphCount,
      nearestPixelAdvanceEnvelope: nodeRow.nearestPixelAdvanceEnvelope,
      withinNearestPixelAdvanceEnvelope,
    };
  });
  const allKerned = evidenceRows.every(({ matchesKerned }) => matchesKerned);
  const allUnkerned = evidenceRows.every(
    ({ matchesUnkerned }) => matchesUnkerned,
  );
  const semanticBandsMatch = evidenceRows.every(
    ({ browserStatus, expectedBand }) =>
      expectedBand === "boundary" || browserStatus === expectedBand,
  );
  const gridCapture = calibration.platformGridFittingCapture;
  const gridCaptureEnvironmentMatches =
    result.environment.engine === gridCapture.engine &&
    result.environment.engineVersion === gridCapture.engineVersion &&
    result.environment.platform === gridCapture.platform &&
    result.environment.devicePixelRatio === gridCapture.devicePixelRatio;
  const gridCaptureWidthsMatch = evidenceRows.every(({ id, browserWidth }) => {
    const capturedWidth = gridCapture.widths[id];
    return (
      capturedWidth !== undefined &&
      Math.abs(browserWidth - capturedWidth) <= 1e-9
    );
  });
  const allWidthsIntegral = evidenceRows.every(
    ({ browserWidth }) =>
      Math.abs(browserWidth - Math.round(browserWidth)) <= 1e-9,
  );
  const allWithinNearestPixelAdvanceEnvelope = evidenceRows.every(
    ({ withinNearestPixelAdvanceEnvelope }) =>
      withinNearestPixelAdvanceEnvelope,
  );
  const gridCapturePass =
    gridCaptureEnvironmentMatches &&
    gridCaptureWidthsMatch &&
    allWidthsIntegral &&
    allWithinNearestPixelAdvanceEnvelope &&
    semanticBandsMatch;
  const evidence = {
    schema: "vector180-browser-text-calibration-evidence/0.1",
    status: allKerned
      ? "pass-kerned"
      : allUnkerned
        ? "pass-with-unkerned-browser-variance"
        : gridCapturePass
          ? "pass-with-platform-grid-fitting-variance"
          : "fail",
    engine: result.environment.engine,
    engineVersion: result.environment.engineVersion,
    userAgent: result.environment.userAgent,
    platform: result.environment.platform,
    devicePixelRatio: result.environment.devicePixelRatio,
    fontSha256: manifest.font.sha256,
    nodeMethod: "fontkit/2.0.4",
    browserMethod: `browser-svg-getComputedTextLength/${result.environment.engine}@${result.environment.engineVersion}`,
    tolerance: calibration.tolerance,
    platformGridFittingCapture: {
      behavior: gridCapture.behavior,
      environmentMatches: gridCaptureEnvironmentMatches,
      widthsMatch: gridCaptureWidthsMatch,
      allWidthsIntegral,
      allWithinNearestPixelAdvanceEnvelope,
      semanticBandsMatch,
    },
    maxAbsoluteDelta: Math.max(
      ...evidenceRows.map(({ absoluteDelta }) => absoluteDelta),
    ),
    maxRelativeDelta: Math.max(
      ...evidenceRows.map(({ relativeDelta }) => relativeDelta),
    ),
    maxAbsoluteUnkernedDelta: Math.max(
      ...evidenceRows.map(({ absoluteUnkernedDelta }) => absoluteUnkernedDelta),
    ),
    maxRelativeUnkernedDelta: Math.max(
      ...evidenceRows.map(({ relativeUnkernedDelta }) => relativeUnkernedDelta),
    ),
    rows: evidenceRows,
  };
  if (evidence.status === "pass-with-platform-grid-fitting-variance") {
    console.info(
      `Vector180_C8_PLATFORM_CAPTURE ${JSON.stringify({
        engine: evidence.engine,
        engineVersion: evidence.engineVersion,
        userAgent: evidence.userAgent,
        platform: evidence.platform,
        devicePixelRatio: evidence.devicePixelRatio,
        status: evidence.status,
        maxAbsoluteDelta: evidence.maxAbsoluteDelta,
        maxRelativeDelta: evidence.maxRelativeDelta,
        widths: Object.fromEntries(
          evidence.rows.map(({ id, browserWidth }) => [id, browserWidth]),
        ),
        nearestPixelAdvanceEnvelopes: Object.fromEntries(
          evidence.rows.map(({ id, nearestPixelAdvanceEnvelope }) => [
            id,
            nearestPixelAdvanceEnvelope,
          ]),
        ),
      })}`,
    );
  }

  expect(evidence.status, JSON.stringify(evidence, null, 2)).not.toBe("fail");
  for (const row of evidence.rows) {
    expect(row.method).toContain(testInfo.project.name);
    expect(row.fontIdentity).toContain(manifest.font.sha256);
    expect(row.fontIdentity).toContain("userAgent=");
    expect(row.fontIdentity).toContain(
      `platform=${encodeURIComponent(result.environment.platform)}`,
    );
    expect(row.fontIdentity).toContain(
      `dpr=${result.environment.devicePixelRatio}`,
    );
    if (row.expectedBand !== "boundary") {
      expect(row.nodeStatus).toBe(row.expectedBand);
      expect(row.browserStatus).toBe(row.expectedBand);
    }
  }
  expect(result.missing).toMatchObject({
    kind: "unverified",
    missingCodepoints: [129514],
  });
  expect(result.unmapped).toMatchObject({
    kind: "unverified",
    reason: expect.stringContaining("No exact browser font bytes"),
  });
  expect(result.diagramFit).toMatchObject({
    schema: "vector180-text-fit-atom/0.1",
    atomId: "conformance",
    summary: {
      total: 4,
      unverified: 0,
    },
  });
  expect(JSON.stringify(result.diagramFit)).not.toContain("slideId");

  const capture = {
    schema: "vector180-browser-text-calibration-capture/0.1",
    inputIdentity,
    environment: {
      engine: result.environment.engine,
      engineVersion: result.environment.engineVersion,
      userAgent: result.environment.userAgent,
      platform: result.environment.platform,
      devicePixelRatio: result.environment.devicePixelRatio,
    },
    rows: evidence.rows.map(({ id, browserWidth, method, fontIdentity }) => ({
      id,
      browserWidth,
      method,
      fontIdentity,
    })),
  };
  await testInfo.attach("c8-browser-calibration.json", {
    body: Buffer.from(`${JSON.stringify(capture, null, 2)}\n`),
    contentType: "application/json",
  });
});

function classify(
  width: number,
  availableWidth: number,
  nearLimit: number,
): "clear" | "near-limit" | "overflow" {
  if (width > availableWidth) return "overflow";
  if (width / availableWidth >= nearLimit) return "near-limit";
  return "clear";
}

function fileIdentity(bytes: Buffer): { sha256: string; bytes: number } {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}
