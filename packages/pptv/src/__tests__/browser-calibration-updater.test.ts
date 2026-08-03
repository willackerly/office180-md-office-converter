// Tests: CONTRACT:C8-PPTV-TEXT-FIT.1.1

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { create as createFont } from "fontkit";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(
  new URL(
    "../../scripts/update-browser-calibration-evidence.mjs",
    import.meta.url,
  ),
);
const EVIDENCE_PATH = fileURLToPath(
  new URL(
    "../../test-fixtures/c8/browser-calibration-evidence.json",
    import.meta.url,
  ),
);
const CALIBRATION_PATH = fileURLToPath(
  new URL("../../test-fixtures/c8/browser-calibration.json", import.meta.url),
);
const FONT_PATH = fileURLToPath(
  new URL("../../test-fixtures/fonts/ABeeZee-Regular.ttf", import.meta.url),
);
const FONT_MANIFEST_PATH = fileURLToPath(
  new URL("../../test-fixtures/fonts/manifest.json", import.meta.url),
);
const KERNEL_PATH = fileURLToPath(
  new URL("../../assets/pptv-browser-kernel-0.1.iife.js", import.meta.url),
);
const SPEC_PATH = fileURLToPath(
  new URL("../../e2e/browser-conformance.spec.ts", import.meta.url),
);
const DIAGRAM_PATH = fileURLToPath(
  new URL("../../test-fixtures/c6/kitchen-sink.pptv.svg", import.meta.url),
);
const PLAYWRIGHT_CONFIG_PATH = fileURLToPath(
  new URL("../../playwright.config.ts", import.meta.url),
);
const E2E_DIRECTORY = fileURLToPath(new URL("../../e2e/", import.meta.url));
const ROOT_PACKAGE_PATH = fileURLToPath(
  new URL("../../../../package.json", import.meta.url),
);
const ENGINE_ORDER = ["chromium", "firefox", "webkit"] as const;
const SPEC_TITLE =
  "C8 loads exact bytes, labels the environment, and fails closed on missing glyphs";
const CAPTURE_NAME = "c8-browser-calibration.json";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("browser calibration evidence updater", () => {
  it("checks the canonical aggregate against exact local input identities", () => {
    const result = runUpdater(["--check"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("browser calibration evidence is current");
    expect(result.stderr).toBe("");
  });

  it("rebuilds deterministically from one exact passed C8 result per engine", async () => {
    const fixture = await prepareUpdateFixture();
    const argumentsForUpdate = updateArguments(fixture);

    expect(runUpdater(argumentsForUpdate).status).toBe(0);
    const first = await readFile(fixture.evidencePath, "utf8");
    const rebuilt = JSON.parse(first) as CalibrationEvidence;
    expect(rebuilt.capturedOn).toBe("2026-08-02");
    expect(rebuilt.engines.map(({ engine }) => engine)).toEqual(ENGINE_ORDER);
    expect(rebuilt.captureInputs).toEqual(fixture.inputIdentity);
    expect(first).not.toContain(fixture.reporterPath);
    expect(
      runUpdater(["--check", "--evidence", fixture.evidencePath]).status,
    ).toBe(0);

    expect(runUpdater(argumentsForUpdate).status).toBe(0);
    expect(await readFile(fixture.evidencePath, "utf8")).toBe(first);
  });

  it("rejects synthetic browser widths and redundant derived row fields", async () => {
    const fixture = await prepareUpdateFixture();
    const wrongWidth = structuredClone(fixture.reporter);
    mutateCapture(wrongWidth, "chromium", (capture) => {
      const row = capture.rows[0];
      if (row === undefined) throw new Error("missing synthetic row");
      row.browserWidth = 0;
    });
    await writeJson(fixture.reporterPath, wrongWidth);
    await expectRefusal(fixture, "calibration attachment failed");

    const redundant = structuredClone(fixture.reporter);
    mutateCapture(redundant, "chromium", (capture) => {
      const row = capture.rows[0] as CaptureRow & { nodeWidth?: number };
      if (row === undefined) throw new Error("missing synthetic row");
      row.nodeWidth = 123;
    });
    await writeJson(fixture.reporterPath, redundant);
    await expectRefusal(fixture, "unexpected keys");

    const nonCanonicalIdentity = structuredClone(fixture.reporter);
    mutateCapture(nonCanonicalIdentity, "chromium", (capture) => {
      const row = capture.rows[0];
      if (row === undefined) throw new Error("missing synthetic row");
      row.fontIdentity += ";extra=untrusted";
    });
    await writeJson(fixture.reporterPath, nonCanonicalIdentity);
    await expectRefusal(fixture, "fontIdentity");
  });

  it("rejects failed Playwright results and failed reporter stats", async () => {
    const fixture = await prepareUpdateFixture();
    const failedResult = structuredClone(fixture.reporter);
    getResult(failedResult, "firefox").status = "failed";
    await writeJson(fixture.reporterPath, failedResult);
    await expectRefusal(fixture, "C8 result status");

    const failedStats = structuredClone(fixture.reporter);
    failedStats.stats.expected = 2;
    failedStats.stats.unexpected = 1;
    await writeJson(fixture.reporterPath, failedStats);
    await expectRefusal(fixture, "Playwright expected count");
  });

  it("rejects the wrong project mapping and the wrong spec", async () => {
    const fixture = await prepareUpdateFixture();
    const wrongProject = structuredClone(fixture.reporter);
    const firstProject = wrongProject.config.projects[0];
    if (firstProject === undefined) throw new Error("missing project");
    firstProject.id = "chrome";
    await writeJson(fixture.reporterPath, wrongProject);
    await expectRefusal(fixture, "chromium project id");

    const wrongSpec = structuredClone(fixture.reporter);
    const firstSpec = wrongSpec.suites[0]?.specs[0];
    if (firstSpec === undefined) throw new Error("missing spec");
    firstSpec.title = "C8 lookalike";
    await writeJson(fixture.reporterPath, wrongSpec);
    await expectRefusal(fixture, "Playwright C8 spec title");
  });

  it("rejects stale capture identities and stale checked aggregate inputs", async () => {
    const fixture = await prepareUpdateFixture();
    const staleCapture = structuredClone(fixture.reporter);
    mutateCapture(staleCapture, "webkit", (capture) => {
      capture.inputIdentity.testSource.sha256 = "0".repeat(64);
    });
    await writeJson(fixture.reporterPath, staleCapture);
    await expectRefusal(fixture, "inputIdentity is stale");

    const staleAggregate = await readJson<CalibrationEvidence>(EVIDENCE_PATH);
    staleAggregate.captureInputs.diagramFixture.sha256 = "f".repeat(64);
    await writeJson(fixture.evidencePath, staleAggregate);
    await expectRefusal(fixture, "captureInputs are stale", [
      "--check",
      "--evidence",
      fixture.evidencePath,
    ]);
  });

  it("rejects private attachment identity data", async () => {
    const fixture = await prepareUpdateFixture();
    const privateCapture = structuredClone(fixture.reporter);
    mutateCapture(privateCapture, "chromium", (capture) => {
      capture.environment.userAgent = "/Users/alice/private/browser";
    });
    await writeJson(fixture.reporterPath, privateCapture);
    await expectRefusal(fixture, "private or local identity");

    if (process.platform !== "win32") {
      const reporterSymlink = `${fixture.reporterPath}.link`;
      await symlink(fixture.reporterPath, reporterSymlink);
      const symlinkArguments = updateArguments(fixture);
      symlinkArguments[1] = reporterSymlink;
      await expectRefusal(fixture, "regular, non-symlink", symlinkArguments);
    }

    await writeFile(`${fixture.evidencePath}.lock`, "");
    await expectRefusal(fixture, "holds the lock");
  });
});

async function prepareUpdateFixture(): Promise<UpdateFixture> {
  const directory = await makeTemporaryDirectory();
  const evidencePath = join(directory, "evidence.json");
  const reporterPath = join(directory, "reporter.json");
  const [evidence, calibration, inputIdentity] = await Promise.all([
    readJson<CalibrationEvidence>(EVIDENCE_PATH),
    readJson<Calibration>(CALIBRATION_PATH),
    readInputIdentity(),
  ]);
  const reporter = await makeReporter(evidence, calibration, inputIdentity);
  await copyFile(EVIDENCE_PATH, evidencePath);
  await writeJson(reporterPath, reporter);
  return {
    evidencePath,
    reporterPath,
    reporter,
    inputIdentity,
  };
}

function updateArguments(fixture: UpdateFixture): string[] {
  return [
    "--reporter-json",
    fixture.reporterPath,
    "--captured-on",
    "2026-08-02",
    "--evidence",
    fixture.evidencePath,
  ];
}

async function makeReporter(
  evidence: CalibrationEvidence,
  calibration: Calibration,
  inputIdentity: InputIdentity,
): Promise<Reporter> {
  const [rootPackage, fontManifest] = await Promise.all([
    readJson<{
      devDependencies: { "@playwright/test": string };
    }>(ROOT_PACKAGE_PATH),
    readJson<{
      font: {
        family: string;
        weight: 400 | 700;
        style: "normal" | "italic";
      };
    }>(FONT_MANIFEST_PATH),
  ]);
  const font = createFont(await readFile(FONT_PATH));
  if ("fonts" in font) throw new Error("Expected one static font");
  const oracleRows = calibration.samples.map((sample) => {
    const kerned = font.layout(sample.text);
    const unkerned = font.layout(sample.text, { kern: false });
    return {
      id: sample.id,
      nodeWidth:
        (kerned.positions.reduce(
          (sum, position) => sum + position.xAdvance,
          0,
        ) *
          calibration.fontSize) /
        font.unitsPerEm,
      nodeUnkernedWidth:
        (unkerned.positions.reduce(
          (sum, position) => sum + position.xAdvance,
          0,
        ) *
          calibration.fontSize) /
        font.unitsPerEm,
    };
  });
  const specs = evidence.engines.map((environment, index) => {
    const capture: Capture = {
      schema: "pptv-browser-text-calibration-capture/0.1",
      inputIdentity: structuredClone(inputIdentity),
      environment: {
        engine: environment.engine,
        engineVersion: environment.version,
        userAgent: environment.userAgent,
        platform: environment.platform,
        devicePixelRatio: environment.devicePixelRatio,
      },
      rows: oracleRows.map((oracle) => ({
        id: oracle.id,
        browserWidth:
          environment.engine === "webkit"
            ? oracle.nodeUnkernedWidth
            : oracle.nodeWidth,
        method: `browser-svg-getComputedTextLength/${environment.engine}@${environment.version}`,
        fontIdentity: [
          `sha256=${inputIdentity.font.sha256}`,
          `alias=Pptv_${inputIdentity.font.sha256.slice(0, 24)}_${fontManifest.font.weight}_${fontManifest.font.style}_0`,
          `family=${encodeURIComponent(fontManifest.font.family)}`,
          `weight=${fontManifest.font.weight}`,
          `style=${fontManifest.font.style}`,
          `engine=${environment.engine}@${environment.version}`,
          `platform=${encodeURIComponent(environment.platform)}`,
          `dpr=${environment.devicePixelRatio}`,
          `userAgent=${encodeURIComponent(environment.userAgent)}`,
        ].join(";"),
      })),
    };
    return {
      title: SPEC_TITLE,
      ok: true,
      tags: [],
      tests: [
        {
          timeout: 30_000,
          annotations: [],
          expectedStatus: "passed",
          projectId: environment.engine,
          projectName: environment.engine,
          results: [
            {
              workerIndex: index,
              parallelIndex: 0,
              status: "passed",
              duration: 10,
              errors: [],
              stdout: [],
              stderr: [],
              retry: 0,
              startTime: `2026-08-02T12:00:0${index}.000Z`,
              annotations: [],
              attachments: [
                {
                  name: CAPTURE_NAME,
                  contentType: "application/json",
                  body: Buffer.from(JSON.stringify(capture)).toString("base64"),
                },
              ],
            },
          ],
          status: "expected",
        },
      ],
      id: `synthetic-c8-${environment.engine}`,
      file: "browser-conformance.spec.ts",
      line: 118,
      column: 1,
    };
  });
  return {
    config: {
      version: rootPackage.devDependencies["@playwright/test"],
      reporter: [["json"]],
      workers: 1,
      fullyParallel: false,
      shard: null,
      metadata: { actualWorkers: 1 },
      configFile: PLAYWRIGHT_CONFIG_PATH,
      rootDir: E2E_DIRECTORY,
      projects: ENGINE_ORDER.map((engine) => ({
        id: engine,
        name: engine,
        repeatEach: 1,
        retries: 0,
        testDir: E2E_DIRECTORY,
        metadata: { actualWorkers: 1 },
      })),
    },
    suites: [
      {
        title: "browser-conformance.spec.ts",
        file: "browser-conformance.spec.ts",
        line: 0,
        column: 0,
        specs,
      },
    ],
    errors: [],
    stats: {
      startTime: "2026-08-02T12:00:00.000Z",
      duration: 100,
      expected: 3,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
}

async function readInputIdentity(): Promise<InputIdentity> {
  const [
    browserKernel,
    calibration,
    font,
    fontManifest,
    testSource,
    diagramFixture,
  ] = await Promise.all([
    readFile(KERNEL_PATH),
    readFile(CALIBRATION_PATH),
    readFile(FONT_PATH),
    readFile(FONT_MANIFEST_PATH),
    readFile(SPEC_PATH),
    readFile(DIAGRAM_PATH),
  ]);
  return {
    browserKernel: fileIdentity(browserKernel),
    calibration: fileIdentity(calibration),
    font: fileIdentity(font),
    fontManifest: fileIdentity(fontManifest),
    testSource: fileIdentity(testSource),
    diagramFixture: fileIdentity(diagramFixture),
  };
}

function mutateCapture(
  reporter: Reporter,
  engine: Engine,
  mutate: (capture: Capture) => void,
): void {
  const attachment = getResult(reporter, engine).attachments[0];
  if (attachment === undefined) throw new Error("missing attachment");
  const capture = JSON.parse(
    Buffer.from(attachment.body, "base64").toString("utf8"),
  ) as Capture;
  mutate(capture);
  attachment.body = Buffer.from(JSON.stringify(capture)).toString("base64");
}

function getResult(reporter: Reporter, engine: Engine): ReporterResult {
  for (const spec of reporter.suites[0]?.specs ?? []) {
    const test = spec.tests[0];
    const result = test?.results[0];
    if (test?.projectId === engine && result !== undefined) return result;
  }
  throw new Error(`Missing ${engine} synthetic result`);
}

function runUpdater(arguments_: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...arguments_], {
    encoding: "utf8",
  });
}

async function expectRefusal(
  fixture: UpdateFixture,
  stderrSubstring: string,
  arguments_: string[] = updateArguments(fixture),
): Promise<void> {
  const before = await readFile(fixture.evidencePath);
  const result = runUpdater(arguments_);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(stderrSubstring);
  expect(await readFile(fixture.evidencePath)).toEqual(before);
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), "pptv-browser-calibration-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fileIdentity(bytes: Buffer): FileIdentity {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}

type Engine = (typeof ENGINE_ORDER)[number];

interface FileIdentity {
  sha256: string;
  bytes: number;
}

interface InputIdentity {
  browserKernel: FileIdentity;
  calibration: FileIdentity;
  font: FileIdentity;
  fontManifest: FileIdentity;
  testSource: FileIdentity;
  diagramFixture: FileIdentity;
}

interface UpdateFixture {
  evidencePath: string;
  reporterPath: string;
  reporter: Reporter;
  inputIdentity: InputIdentity;
}

interface CalibrationEvidence {
  capturedOn: string;
  captureInputs: InputIdentity;
  engines: EngineEvidence[];
}

interface EngineEvidence {
  engine: Engine;
  version: string;
  userAgent: string;
  platform: string;
  devicePixelRatio: number;
}

interface Calibration {
  fontSize: number;
  samples: Array<{
    id: string;
    text: string;
    nodeUtilization: number;
    expectedBand: "clear" | "near-limit" | "boundary" | "overflow";
  }>;
}

interface Capture {
  schema: string;
  inputIdentity: InputIdentity;
  environment: {
    engine: Engine;
    engineVersion: string;
    userAgent: string;
    platform: string;
    devicePixelRatio: number;
  };
  rows: CaptureRow[];
}

interface CaptureRow {
  id: string;
  browserWidth: number;
  method: string;
  fontIdentity: string;
}

interface Reporter {
  config: {
    version: string;
    reporter: string[][];
    workers: number;
    fullyParallel: boolean;
    shard: null;
    metadata: { actualWorkers: number };
    configFile: string;
    rootDir: string;
    projects: Array<{
      id: string;
      name: string;
      repeatEach: number;
      retries: number;
      testDir: string;
      metadata: { actualWorkers: number };
    }>;
  };
  suites: Array<{
    title: string;
    file: string;
    line: number;
    column: number;
    specs: Array<{
      title: string;
      ok: boolean;
      tags: unknown[];
      tests: Array<{
        timeout: number;
        annotations: unknown[];
        expectedStatus: string;
        projectId: Engine;
        projectName: Engine;
        results: ReporterResult[];
        status: string;
      }>;
      id: string;
      file: string;
      line: number;
      column: number;
    }>;
  }>;
  errors: unknown[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    skipped: number;
    unexpected: number;
    flaky: number;
  };
}

interface ReporterResult {
  workerIndex: number;
  parallelIndex: number;
  status: string;
  duration: number;
  errors: unknown[];
  stdout: unknown[];
  stderr: unknown[];
  retry: number;
  startTime: string;
  annotations: unknown[];
  attachments: Array<{
    name: string;
    contentType: string;
    body: string;
  }>;
}
