// Tests: CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const EVIDENCE_URL = new URL(
  "../../test-fixtures/c8/browser-calibration-evidence.json",
  import.meta.url,
);
const FONT_MANIFEST_URL = new URL(
  "../../test-fixtures/fonts/manifest.json",
  import.meta.url,
);
const KERNEL_META_URL = new URL(
  "../../assets/pptv-browser-kernel-0.1.meta.json",
  import.meta.url,
);
const CALIBRATION_URL = new URL(
  "../../test-fixtures/c8/browser-calibration.json",
  import.meta.url,
);
const ROOT_PACKAGE_URL = new URL("../../../../package.json", import.meta.url);
const FONT_URL = new URL(
  "../../test-fixtures/fonts/ABeeZee-Regular.ttf",
  import.meta.url,
);
const KERNEL_URL = new URL(
  "../../assets/pptv-browser-kernel-0.1.iife.js",
  import.meta.url,
);
const SPEC_URL = new URL(
  "../../e2e/browser-conformance.spec.ts",
  import.meta.url,
);
const DIAGRAM_URL = new URL(
  "../../test-fixtures/c6/kitchen-sink.pptv.svg",
  import.meta.url,
);

interface FileIdentity {
  sha256: string;
  bytes: number;
}

interface OracleEvidence {
  maxAbsoluteDelta: number;
  maxRelativeDelta: number;
  withinTolerance: boolean;
}

interface EngineEvidence {
  engine: "chromium" | "firefox" | "webkit";
  version: string;
  userAgent: string;
  platform: string;
  devicePixelRatio: number;
  status: string;
  kernedOracle: OracleEvidence;
  unkernedOracle: OracleEvidence;
}

interface CalibrationEvidence {
  schema: "pptv-browser-text-calibration-evidence/0.1";
  capturedOn: string;
  overallStatus: string;
  method: {
    tolerance: {
      absoluteSvgUnits: number;
      relative: number;
      acceptance: "absolute-or-relative";
    };
  };
  toolchain: {
    playwright: string;
    esbuild: string;
    browserKernelSha256: string;
    browserKernelBytes: number;
    font: { family: string; sha256: string };
  };
  captureInputs: {
    browserKernel: FileIdentity;
    calibration: FileIdentity;
    font: FileIdentity;
    fontManifest: FileIdentity;
    testSource: FileIdentity;
    diagramFixture: FileIdentity;
  };
  privacy: { status: string; note: string };
  engines: EngineEvidence[];
  platformGridFittingCapture: {
    engine: "chromium";
    version: string;
    platform: string;
    devicePixelRatio: number;
    status: "pass-with-platform-grid-fitting-variance";
    source: string;
    maxAbsoluteDelta: number;
    maxRelativeDelta: number;
    widths: Record<string, number>;
    behavior: string;
  };
  coverage: {
    samples: number;
    missingGlyphCodepoint: number;
    missingGlyphStatus: string;
    diagramTextFit: {
      schema: string;
      lines: number;
      unverified: number;
    };
  };
}

describe("checked browser C8 calibration evidence", () => {
  it("locks the three-engine inventory to exact tool and font identities", async () => {
    const [evidence, calibration, fontManifest, kernelMetadata, rootPackage] =
      await Promise.all([
        readJson<CalibrationEvidence>(EVIDENCE_URL),
        readJson<{
          platformGridFittingCapture: {
            engine: "chromium";
            engineVersion: string;
            platform: string;
            devicePixelRatio: number;
            source: string;
            widths: Record<string, number>;
            behavior: string;
          };
        }>(CALIBRATION_URL),
        readJson<{ font: { family: string; sha256: string } }>(
          FONT_MANIFEST_URL,
        ),
        readJson<{
          generator: { version: string };
          sha256: string;
          bytes: number;
        }>(KERNEL_META_URL),
        readJson<{
          devDependencies: Record<string, string>;
        }>(ROOT_PACKAGE_URL),
      ]);

    expect(evidence).toMatchObject({
      schema: "pptv-browser-text-calibration-evidence/0.1",
      capturedOn: "2026-08-02",
      overallStatus: "pass-with-explicit-engine-and-platform-variance",
      privacy: { status: "safe" },
      coverage: {
        samples: 6,
        missingGlyphCodepoint: 129514,
        missingGlyphStatus: "unverified",
        diagramTextFit: {
          schema: "pptv-diagram-text-fit/0.1",
          lines: 4,
          unverified: 0,
        },
      },
    });
    expect(evidence.toolchain).toMatchObject({
      playwright: rootPackage.devDependencies["@playwright/test"],
      esbuild: rootPackage.devDependencies["esbuild"],
      browserKernelSha256: kernelMetadata.sha256,
      browserKernelBytes: kernelMetadata.bytes,
      font: {
        family: fontManifest.font.family,
        sha256: fontManifest.font.sha256,
      },
    });
    expect(evidence.toolchain.esbuild).toBe(kernelMetadata.generator.version);
    const [
      browserKernel,
      calibrationBytes,
      font,
      fontManifestBytes,
      testSource,
      diagramFixture,
    ] = await Promise.all([
      readFile(KERNEL_URL),
      readFile(CALIBRATION_URL),
      readFile(FONT_URL),
      readFile(FONT_MANIFEST_URL),
      readFile(SPEC_URL),
      readFile(DIAGRAM_URL),
    ]);
    expect(evidence.captureInputs).toEqual({
      browserKernel: fileIdentity(browserKernel),
      calibration: fileIdentity(calibrationBytes),
      font: fileIdentity(font),
      fontManifest: fileIdentity(fontManifestBytes),
      testSource: fileIdentity(testSource),
      diagramFixture: fileIdentity(diagramFixture),
    });
    expect(evidence.platformGridFittingCapture).toMatchObject({
      engine: calibration.platformGridFittingCapture.engine,
      version: calibration.platformGridFittingCapture.engineVersion,
      platform: calibration.platformGridFittingCapture.platform,
      devicePixelRatio: calibration.platformGridFittingCapture.devicePixelRatio,
      status: "pass-with-platform-grid-fitting-variance",
      source: calibration.platformGridFittingCapture.source,
      widths: calibration.platformGridFittingCapture.widths,
      behavior: calibration.platformGridFittingCapture.behavior,
    });
    expect(
      evidence.platformGridFittingCapture.maxAbsoluteDelta,
    ).toBeGreaterThan(evidence.method.tolerance.absoluteSvgUnits);
    expect(
      evidence.platformGridFittingCapture.maxRelativeDelta,
    ).toBeGreaterThan(evidence.method.tolerance.relative);
    expect(evidence.engines.map(({ engine }) => engine)).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
    expect(evidence.engines).toMatchObject([
      {
        engine: "chromium",
        version: "151.0.7922.34",
        platform: "MacIntel",
        devicePixelRatio: 1,
        status: "pass-kerned",
        kernedOracle: {
          maxAbsoluteDelta: 0.01387500000001296,
          maxRelativeDelta: 0.00015973513011159903,
          withinTolerance: true,
        },
      },
      {
        engine: "firefox",
        version: "153.0",
        platform: "MacIntel",
        devicePixelRatio: 1,
        status: "pass-kerned",
        kernedOracle: {
          maxAbsoluteDelta: 0.021332824707030795,
          maxRelativeDelta: 0.0001896048839859819,
          withinTolerance: true,
        },
      },
      {
        engine: "webkit",
        version: "26.5",
        platform: "MacIntel",
        devicePixelRatio: 2,
        status: "pass-with-unkerned-browser-variance",
        kernedOracle: {
          maxAbsoluteDelta: 6.2399979858398495,
          maxRelativeDelta: 0.08054520324555775,
          withinTolerance: false,
        },
        unkernedOracle: {
          maxAbsoluteDelta: 0.000007080078120225153,
          maxRelativeDelta: 5.858750067063733e-8,
          withinTolerance: true,
        },
      },
    ]);
    expect(JSON.parse(JSON.stringify(evidence))).toEqual(evidence);
  });

  it("keeps each tolerance flag derivable and the record free of local identity", async () => {
    const source = await readFile(EVIDENCE_URL, "utf8");
    const evidence = JSON.parse(source) as CalibrationEvidence;
    const tolerance = evidence.method.tolerance;

    for (const engine of evidence.engines) {
      expect(engine.version.length).toBeGreaterThan(0);
      expect(engine.userAgent.length).toBeGreaterThan(20);
      expect(engine.platform.length).toBeGreaterThan(0);
      expect(engine.devicePixelRatio).toBeGreaterThan(0);
      for (const oracle of [engine.kernedOracle, engine.unkernedOracle]) {
        const withinTolerance =
          oracle.maxAbsoluteDelta <= tolerance.absoluteSvgUnits ||
          oracle.maxRelativeDelta <= tolerance.relative;
        expect(oracle.withinTolerance).toBe(withinTolerance);
      }
    }
    expect(source).not.toMatch(
      /(?:\/Users\/|[A-Za-z]:\\Users\\|file:\/\/|willackerly|\/home\/)/u,
    );
  });
});

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

function fileIdentity(bytes: Buffer): FileIdentity {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}
