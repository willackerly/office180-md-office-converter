/**
 * Check or deterministically update the checked C8 browser-calibration
 * aggregate.
 *
 * Update mode consumes an explicit Playwright JSON reporter file. It never
 * searches test-results, discovers browsers/fonts, or publishes input paths.
 *
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 */

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { create as createFont } from "fontkit";

const ATTACHMENT_NAME = "c8-browser-calibration.json";
const ENGINE_ORDER = ["chromium", "firefox", "webkit"];
const EVIDENCE_SCHEMA = "vector180-browser-text-calibration-evidence/0.1";
const CAPTURE_SCHEMA = "vector180-browser-text-calibration-capture/0.1";
const C8_SPEC_FILE = "browser-conformance.spec.ts";
const C8_SPEC_TITLE =
  "C8 loads exact bytes, labels the environment, and fails closed on missing glyphs";
const OVERALL_STATUS = "pass-with-explicit-engine-and-platform-variance";
const BROWSER_METHOD =
  "SVG getComputedTextLength after exact FontFace load and document.fonts.ready";
const PRIVACY = {
  status: "safe",
  note: "User-agent strings are Playwright browser identities only; no local paths, usernames, hostnames, or source text are retained.",
};
const SAMPLE_INCLUDES = new Map([
  ["kerning-av", "AV kerning"],
  ["spaces", "spaces"],
  ["representative", "representative mixed text"],
  ["near-limit", "near-limit"],
  ["exact-boundary", "exact boundary"],
  ["overflow", "overflow"],
]);
const DIAGRAM_TEXT_FIT_COVERAGE = {
  schema: "vector180-text-fit-atom/0.1",
  lines: 4,
  unverified: 0,
};
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightConfigPath = fileURLToPath(
  new URL("../playwright.config.ts", import.meta.url),
);
const browserTestSourcePath = fileURLToPath(
  new URL("../e2e/browser-conformance.spec.ts", import.meta.url),
);
const diagramFixturePath = fileURLToPath(
  new URL("../test-fixtures/c6/kitchen-sink.vector180.svg", import.meta.url),
);
const calibrationPath = fileURLToPath(
  new URL("../test-fixtures/c8/browser-calibration.json", import.meta.url),
);
const fontManifestPath = fileURLToPath(
  new URL("../test-fixtures/fonts/manifest.json", import.meta.url),
);
const kernelAssetPath = fileURLToPath(
  new URL("../assets/vector180-browser-kernel-0.1.iife.js", import.meta.url),
);
const fontAssetPath = fileURLToPath(
  new URL("../test-fixtures/fonts/ABeeZee-Regular.ttf", import.meta.url),
);
const canonicalEvidencePath = fileURLToPath(
  new URL(
    "../test-fixtures/c8/browser-calibration-evidence.json",
    import.meta.url,
  ),
);

try {
  await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`browser calibration evidence: ${message}\n`);
  process.exitCode = 1;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const context = await loadContext();
  const evidencePath =
    options.evidence === undefined
      ? canonicalEvidencePath
      : resolve(process.cwd(), options.evidence);

  if (options.check) {
    const checked = await readJsonFile(
      evidencePath,
      MAX_EVIDENCE_BYTES,
      "checked evidence",
    );
    const normalized = validateAggregate(checked.value, context);
    const expectedBytes = serializeJson(normalized);
    if (!checked.bytes.equals(expectedBytes)) {
      throw new Error(
        "checked evidence is not in deterministic canonical form; run the updater with an explicit Playwright JSON report",
      );
    }
    process.stdout.write(
      `browser calibration evidence is current (${displayPath(evidencePath)})\n`,
    );
    return;
  }

  if (options.reporterJson === undefined) {
    throw new Error(
      "update mode requires --reporter-json FILE; implicit test-results discovery is forbidden",
    );
  }
  if (options.capturedOn === undefined) {
    throw new Error("update mode requires --captured-on YYYY-MM-DD");
  }
  assertIsoDate(options.capturedOn, "--captured-on");

  const lock = await acquireEvidenceLock(evidencePath);
  try {
    const existing = await readJsonFile(
      evidencePath,
      MAX_EVIDENCE_BYTES,
      "existing checked evidence",
    );
    const existingRecord = asRecord(
      existing.value,
      "existing checked evidence",
    );
    const preservedGrid = validatePlatformGridCapture(
      existingRecord.platformGridFittingCapture,
      context,
    );
    const reporterPath = resolve(process.cwd(), options.reporterJson);
    const reporter = await readJsonFile(
      reporterPath,
      MAX_JSON_BYTES,
      "Playwright JSON reporter",
    );
    const engines = decodeReporterEngines(
      reporter.value,
      context,
      options.capturedOn,
    );
    const aggregate = buildAggregate(
      options.capturedOn,
      engines,
      preservedGrid,
      context,
    );
    validateAggregate(aggregate, context);
    await writeAtomically(
      evidencePath,
      serializeJson(aggregate),
      existing.bytes,
    );
  } finally {
    await releaseEvidenceLock(lock);
  }
  process.stdout.write(
    `updated browser calibration evidence (${displayPath(evidencePath)})\n`,
  );
}

function parseArguments(argv) {
  const options = {
    check: false,
    help: false,
    reporterJson: undefined,
    capturedOn: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      if (options.check) throw new Error("duplicate --check");
      options.check = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (
      argument === "--reporter-json" ||
      argument === "--captured-on" ||
      argument === "--evidence"
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      const key =
        argument === "--reporter-json"
          ? "reporterJson"
          : argument === "--captured-on"
            ? "capturedOn"
            : "evidence";
      if (options[key] !== undefined) {
        throw new Error(`duplicate ${argument}`);
      }
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument "${argument}"`);
  }
  if (
    options.check &&
    (options.reporterJson !== undefined || options.capturedOn !== undefined)
  ) {
    throw new Error(
      "--check cannot be combined with --reporter-json or --captured-on",
    );
  }
  if (options.help && argv.length > 1) {
    throw new Error("--help cannot be combined with other arguments");
  }
  return options;
}

function helpText() {
  return `Usage:
  node scripts/update-browser-calibration-evidence.mjs --check [--evidence FILE]
  node scripts/update-browser-calibration-evidence.mjs \\
    --reporter-json FILE --captured-on YYYY-MM-DD [--evidence FILE]

Update input must be an explicit Playwright JSON reporter file containing
exactly one passed ${C8_SPEC_TITLE} result and one ${ATTACHMENT_NAME} body for
each of chromium, firefox, and webkit. The report date must equal --captured-on.
The checked Linux grid-fitting record is preserved only while it still matches
browser-calibration.json and a locally recomputed Fontkit oracle. No reporter
path or local identity is published.
`;
}

async function loadContext() {
  const [
    rootPackage,
    vector180Package,
    kernelMetadata,
    calibrationFile,
    fontManifestFile,
    kernelAsset,
    fontAsset,
    browserTestSource,
    diagramFixture,
  ] = await Promise.all([
    readJsonUrl(
      new URL("../../../package.json", import.meta.url),
      "root package.json",
    ),
    readJsonUrl(
      new URL("../package.json", import.meta.url),
      "Vector180 package.json",
    ),
    readJsonUrl(
      new URL(
        "../assets/vector180-browser-kernel-0.1.meta.json",
        import.meta.url,
      ),
      "browser kernel metadata",
    ),
    readJsonFile(
      calibrationPath,
      MAX_EVIDENCE_BYTES,
      "browser calibration fixture",
    ),
    readJsonFile(fontManifestPath, MAX_EVIDENCE_BYTES, "browser font manifest"),
    readBoundedFile(kernelAssetPath, 16 * 1024 * 1024, "browser kernel asset"),
    readBoundedFile(fontAssetPath, 64 * 1024 * 1024, "browser font asset"),
    readBoundedFile(
      browserTestSourcePath,
      2 * 1024 * 1024,
      "C8 Playwright test source",
    ),
    readBoundedFile(
      diagramFixturePath,
      8 * 1024 * 1024,
      "C8 kitchen-sink diagram fixture",
    ),
  ]);

  const root = asRecord(rootPackage, "root package.json");
  const vector180 = asRecord(vector180Package, "Vector180 package.json");
  const rootDevDependencies = asRecord(
    root.devDependencies,
    "root devDependencies",
  );
  const vector180Dependencies = asRecord(
    vector180.dependencies,
    "Vector180 dependencies",
  );
  const playwright = exactPackageVersion(
    rootDevDependencies["@playwright/test"],
    "@playwright/test",
  );
  const esbuild = exactPackageVersion(rootDevDependencies.esbuild, "esbuild");
  const fontkit = exactPackageVersion(vector180Dependencies.fontkit, "fontkit");
  const kernel = validateKernelMetadata(kernelMetadata, kernelAsset, esbuild);
  const font = validateFontManifest(fontManifestFile.value, fontAsset);
  const checkedCalibration = validateCalibration(calibrationFile.value);
  const oracleRows = computeFontkitOracle(fontAsset, checkedCalibration);
  const inputIdentity = {
    browserKernel: {
      sha256: kernel.sha256,
      bytes: kernel.bytes,
    },
    calibration: fileIdentity(calibrationFile.bytes),
    font: fileIdentity(fontAsset),
    fontManifest: fileIdentity(fontManifestFile.bytes),
    testSource: fileIdentity(browserTestSource),
    diagramFixture: fileIdentity(diagramFixture),
  };

  return {
    playwright,
    esbuild,
    fontkit,
    kernel,
    font,
    calibration: checkedCalibration,
    oracleRows,
    inputIdentity,
  };
}

function validateKernelMetadata(value, asset, esbuild) {
  const metadata = asRecord(value, "browser kernel metadata");
  assertExactKeys(
    metadata,
    [
      "schema",
      "generator",
      "entry",
      "output",
      "globalName",
      "target",
      "sha256",
      "bytes",
      "inputs",
    ],
    "browser kernel metadata",
  );
  assertEqual(
    metadata.schema,
    "vector180-browser-kernel-build/0.1",
    "browser kernel metadata schema",
  );
  const generator = asRecord(metadata.generator, "kernel generator");
  assertExactKeys(generator, ["name", "version"], "kernel generator");
  assertEqual(generator.name, "esbuild", "kernel generator name");
  assertEqual(generator.version, esbuild, "kernel generator version");
  const sha256 = assertSha256(metadata.sha256, "kernel sha256");
  const bytes = positiveInteger(metadata.bytes, "kernel bytes");
  if (bytes !== asset.byteLength) {
    throw new Error(
      `kernel metadata bytes ${bytes} do not match asset bytes ${asset.byteLength}`,
    );
  }
  const actualSha256 = sha256Hex(asset);
  if (sha256 !== actualSha256) {
    throw new Error(
      `kernel metadata sha256 ${sha256} does not match asset sha256 ${actualSha256}`,
    );
  }
  return { sha256, bytes };
}

function validateFontManifest(value, asset) {
  const manifest = asRecord(value, "browser font manifest");
  assertEqual(
    manifest.schema,
    "vector180-browser-font-fixture/0.1",
    "font manifest schema",
  );
  const font = asRecord(manifest.font, "font manifest font");
  const family = nonEmptyString(font.family, "font family");
  const weight = font.weight;
  if (weight !== 400 && weight !== 700) {
    throw new Error("font weight must be 400 or 700");
  }
  const style = font.style;
  if (style !== "normal" && style !== "italic") {
    throw new Error('font style must be "normal" or "italic"');
  }
  const sha256 = assertSha256(font.sha256, "font sha256");
  const bytes = positiveInteger(font.bytes, "font bytes");
  if (bytes !== asset.byteLength) {
    throw new Error(
      `font manifest bytes ${bytes} do not match asset bytes ${asset.byteLength}`,
    );
  }
  const actualSha256 = sha256Hex(asset);
  if (sha256 !== actualSha256) {
    throw new Error(
      `font manifest sha256 ${sha256} does not match asset sha256 ${actualSha256}`,
    );
  }
  const coverage = asRecord(manifest.coverage, "font manifest coverage");
  const missingCodepoints = integerArray(
    coverage.missingCodepoints,
    "missing codepoints",
  );
  if (missingCodepoints.length !== 1) {
    throw new Error("font manifest must retain exactly one missing codepoint");
  }
  return {
    family,
    weight,
    style,
    alias: `Vector180_${sha256.slice(0, 24)}_${weight}_${style}_0`,
    sha256,
    missingCodepoint: missingCodepoints[0],
  };
}

function validateCalibration(value) {
  const calibration = asRecord(value, "browser calibration fixture");
  assertExactKeys(
    calibration,
    [
      "schema",
      "fontManifest",
      "fontSize",
      "nearLimit",
      "tolerance",
      "platformGridFittingCapture",
      "samples",
    ],
    "browser calibration fixture",
  );
  assertEqual(
    calibration.schema,
    "vector180-browser-text-calibration/0.1",
    "calibration schema",
  );
  assertEqual(
    calibration.fontManifest,
    "../fonts/manifest.json",
    "calibration font manifest",
  );
  const fontSize = positiveNumber(calibration.fontSize, "calibration fontSize");
  const nearLimit = positiveNumber(
    calibration.nearLimit,
    "calibration nearLimit",
  );
  if (nearLimit > 1) throw new Error("calibration nearLimit must be at most 1");
  const tolerance = validateTolerance(calibration.tolerance);
  const samples = arrayValue(calibration.samples, "calibration samples").map(
    (value, index) => {
      const sample = asRecord(value, `calibration sample ${index}`);
      assertExactKeys(
        sample,
        ["id", "text", "nodeUtilization", "expectedBand"],
        `calibration sample ${index}`,
      );
      const id = nonEmptyString(sample.id, `calibration sample ${index} id`);
      const expectedInclude = SAMPLE_INCLUDES.get(id);
      if (expectedInclude === undefined) {
        throw new Error(`unsupported calibration sample id "${id}"`);
      }
      const expectedBand = nonEmptyString(
        sample.expectedBand,
        `calibration sample ${id} expectedBand`,
      );
      if (
        !["clear", "near-limit", "boundary", "overflow"].includes(expectedBand)
      ) {
        throw new Error(
          `calibration sample "${id}" has unsupported band "${expectedBand}"`,
        );
      }
      positiveNumber(
        sample.nodeUtilization,
        `calibration sample ${id} nodeUtilization`,
      );
      return {
        id,
        text: nonEmptyString(sample.text, `calibration sample ${id} text`),
        nodeUtilization: sample.nodeUtilization,
        expectedBand,
      };
    },
  );
  if (
    samples.length !== SAMPLE_INCLUDES.size ||
    samples.some(({ id }, index) => id !== [...SAMPLE_INCLUDES.keys()][index])
  ) {
    throw new Error(
      "calibration samples must retain the complete canonical sample order",
    );
  }
  const grid = validateCalibrationGrid(calibration.platformGridFittingCapture);
  return { fontSize, tolerance, samples, nearLimit, grid };
}

function validateTolerance(value) {
  const tolerance = asRecord(value, "calibration tolerance");
  assertExactKeys(
    tolerance,
    [
      "absoluteSvgUnits",
      "relative",
      "acceptance",
      "primaryOracle",
      "diagnosticAlternate",
    ],
    "calibration tolerance",
  );
  const absoluteSvgUnits = positiveNumber(
    tolerance.absoluteSvgUnits,
    "absolute tolerance",
  );
  const relativeTolerance = positiveNumber(
    tolerance.relative,
    "relative tolerance",
  );
  assertEqual(
    tolerance.acceptance,
    "absolute-or-relative",
    "tolerance acceptance",
  );
  nonEmptyString(tolerance.primaryOracle, "primary oracle");
  nonEmptyString(tolerance.diagnosticAlternate, "diagnostic alternate");
  return {
    absoluteSvgUnits,
    relative: relativeTolerance,
    acceptance: "absolute-or-relative",
    primaryOracle: tolerance.primaryOracle,
    diagnosticAlternate: tolerance.diagnosticAlternate,
  };
}

function validateCalibrationGrid(value) {
  const grid = asRecord(value, "calibration grid capture");
  assertExactKeys(
    grid,
    [
      "engine",
      "engineVersion",
      "platform",
      "devicePixelRatio",
      "source",
      "widths",
      "behavior",
    ],
    "calibration grid capture",
  );
  const engine = nonEmptyString(grid.engine, "grid engine");
  if (!ENGINE_ORDER.includes(engine)) {
    throw new Error(`unsupported grid engine "${engine}"`);
  }
  const widths = numberRecord(grid.widths, "grid widths");
  if (
    Object.keys(widths).length !== SAMPLE_INCLUDES.size ||
    [...SAMPLE_INCLUDES.keys()].some((id) => widths[id] === undefined)
  ) {
    throw new Error("grid widths must cover every calibration sample");
  }
  return {
    engine,
    engineVersion: nonEmptyString(grid.engineVersion, "grid engine version"),
    platform: nonEmptyString(grid.platform, "grid platform"),
    devicePixelRatio: positiveNumber(grid.devicePixelRatio, "grid DPR"),
    source: nonEmptyString(grid.source, "grid source"),
    widths,
    behavior: nonEmptyString(grid.behavior, "grid behavior"),
  };
}

function computeFontkitOracle(fontBytes, calibration) {
  const font = createFont(fontBytes);
  if ("fonts" in font) {
    throw new Error("browser calibration font must be one static face");
  }
  const unitsPerEm = positiveNumber(
    font.unitsPerEm,
    "browser calibration font unitsPerEm",
  );
  return calibration.samples.map((sample) => {
    const kernedRun = font.layout(sample.text);
    const unkernedRun = font.layout(sample.text, { kern: false });
    const scaledKernedAdvances = kernedRun.positions.map(
      ({ xAdvance }) => (xAdvance * calibration.fontSize) / unitsPerEm,
    );
    const nodeWidth =
      (kernedRun.positions.reduce(
        (sum, position) => sum + position.xAdvance,
        0,
      ) *
        calibration.fontSize) /
      unitsPerEm;
    const nodeUnkernedWidth =
      (unkernedRun.positions.reduce(
        (sum, position) => sum + position.xAdvance,
        0,
      ) *
        calibration.fontSize) /
      unitsPerEm;
    const availableWidth = nodeWidth / sample.nodeUtilization;
    const shapedGlyphCount = positiveInteger(
      kernedRun.glyphs.length,
      `Fontkit ${sample.id} shaped glyph count`,
    );
    const nearestPixelAdvanceEnvelope = scaledKernedAdvances.reduce(
      (sum, advance) => sum + Math.abs(Math.round(advance) - advance),
      0,
    );
    const nodeStatus = classify(
      nodeWidth,
      availableWidth,
      calibration.nearLimit,
    );
    if (!matchesExpectedBand(nodeStatus, sample.expectedBand)) {
      throw new Error(
        `Fontkit ${sample.id} status ${nodeStatus} does not match fixture band ${sample.expectedBand}`,
      );
    }
    return {
      id: sample.id,
      text: sample.text,
      expectedBand: sample.expectedBand,
      nodeWidth,
      nodeUnkernedWidth,
      availableWidth,
      shapedGlyphCount,
      nearestPixelAdvanceEnvelope,
      nodeStatus,
    };
  });
}

function decodeReporterEngines(value, context, capturedOn) {
  const report = asRecord(value, "Playwright JSON reporter");
  assertExactKeys(
    report,
    ["config", "suites", "errors", "stats"],
    "Playwright JSON reporter",
  );
  validateReporterConfig(report.config, context);
  const reportErrors = arrayValue(report.errors, "Playwright report errors");
  if (reportErrors.length !== 0) {
    throw new Error("Playwright report must not contain suite errors");
  }
  validateReporterStats(report.stats, capturedOn);
  const suite = exactlyOne(
    arrayValue(report.suites, "Playwright suites"),
    "Playwright C8 suite",
  );
  validateReporterSuiteIdentity(suite);
  const specs = arrayValue(suite.specs, "Playwright C8 specs");
  if (specs.length !== ENGINE_ORDER.length) {
    throw new Error(
      `Playwright report must contain exactly ${ENGINE_ORDER.length} C8 specs; found ${specs.length}`,
    );
  }
  const byEngine = new Map();
  let expectedLine;
  let expectedColumn;
  for (const specValue of specs) {
    const {
      engine: projectEngine,
      attachment,
      line,
      column,
    } = validateReporterSpec(specValue, capturedOn);
    if (expectedLine === undefined) {
      expectedLine = line;
      expectedColumn = column;
    } else if (line !== expectedLine || column !== expectedColumn) {
      throw new Error("Playwright C8 specs disagree on source location");
    }
    const decoded = decodeAttachment(attachment);
    assertNoPrivateData(decoded, `${ATTACHMENT_NAME} attachment`);
    const engine = validateCapture(decoded, context);
    assertEqual(engine.engine, projectEngine, "capture engine/project mapping");
    if (byEngine.has(engine.engine)) {
      throw new Error(`duplicate ${engine.engine} calibration attachment`);
    }
    byEngine.set(engine.engine, engine);
  }
  for (const engine of ENGINE_ORDER) {
    if (!byEngine.has(engine)) {
      throw new Error(`missing ${engine} calibration attachment`);
    }
  }
  return ENGINE_ORDER.map((engine) => byEngine.get(engine));
}

function validateReporterConfig(value, context) {
  const config = asRecord(value, "Playwright reporter config");
  assertEqual(
    config.version,
    context.playwright,
    "Playwright reporter version",
  );
  if (!isDeepStrictEqual(config.reporter, [["json"]])) {
    throw new Error("Playwright report must use only the JSON reporter");
  }
  assertEqual(config.workers, 1, "Playwright workers");
  assertEqual(config.fullyParallel, false, "Playwright fullyParallel");
  assertEqual(config.shard, null, "Playwright shard");
  const metadata = asRecord(config.metadata, "Playwright config metadata");
  assertEqual(metadata.actualWorkers, 1, "Playwright actual worker count");
  assertResolvedPathEqual(
    config.configFile,
    playwrightConfigPath,
    "Playwright config file",
  );
  assertResolvedPathEqual(
    config.rootDir,
    resolve(packageRoot, "e2e"),
    "Playwright rootDir",
  );
  const projects = arrayValue(config.projects, "Playwright projects");
  if (projects.length !== ENGINE_ORDER.length) {
    throw new Error("Playwright report must contain exactly three projects");
  }
  for (const [index, engine] of ENGINE_ORDER.entries()) {
    const project = asRecord(projects[index], `Playwright ${engine} project`);
    assertEqual(project.id, engine, `${engine} project id`);
    assertEqual(project.name, engine, `${engine} project name`);
    assertEqual(project.repeatEach, 1, `${engine} repeatEach`);
    assertEqual(project.retries, 0, `${engine} retries`);
    assertResolvedPathEqual(
      project.testDir,
      resolve(packageRoot, "e2e"),
      `${engine} testDir`,
    );
    const projectMetadata = asRecord(
      project.metadata,
      `${engine} project metadata`,
    );
    assertEqual(projectMetadata.actualWorkers, 1, `${engine} actual workers`);
  }
}

function validateReporterStats(value, capturedOn) {
  const stats = asRecord(value, "Playwright reporter stats");
  assertExactKeys(
    stats,
    ["startTime", "duration", "expected", "skipped", "unexpected", "flaky"],
    "Playwright reporter stats",
  );
  assertUtcDate(stats.startTime, capturedOn, "Playwright report startTime");
  nonNegativeNumber(stats.duration, "Playwright report duration");
  assertEqual(stats.expected, ENGINE_ORDER.length, "Playwright expected count");
  assertEqual(stats.skipped, 0, "Playwright skipped count");
  assertEqual(stats.unexpected, 0, "Playwright unexpected count");
  assertEqual(stats.flaky, 0, "Playwright flaky count");
}

function validateReporterSuiteIdentity(value) {
  const suite = asRecord(value, "Playwright C8 suite");
  assertExactKeys(
    suite,
    ["title", "file", "line", "column", "specs"],
    "Playwright C8 suite",
  );
  assertEqual(suite.title, C8_SPEC_FILE, "Playwright C8 suite title");
  assertEqual(suite.file, C8_SPEC_FILE, "Playwright C8 suite file");
  assertEqual(suite.line, 0, "Playwright C8 suite line");
  assertEqual(suite.column, 0, "Playwright C8 suite column");
}

function validateReporterSpec(value, capturedOn) {
  const spec = asRecord(value, "Playwright C8 spec");
  assertExactKeys(
    spec,
    ["title", "ok", "tags", "tests", "id", "file", "line", "column"],
    "Playwright C8 spec",
  );
  assertEqual(spec.title, C8_SPEC_TITLE, "Playwright C8 spec title");
  assertEqual(spec.file, C8_SPEC_FILE, "Playwright C8 spec file");
  assertEqual(spec.ok, true, "Playwright C8 spec ok");
  if (arrayValue(spec.tags, "Playwright C8 spec tags").length !== 0) {
    throw new Error("Playwright C8 spec must not have tags");
  }
  nonEmptyString(spec.id, "Playwright C8 spec id");
  const line = positiveInteger(spec.line, "Playwright C8 spec line");
  const column = positiveInteger(spec.column, "Playwright C8 spec column");
  const test = exactlyOne(
    arrayValue(spec.tests, "Playwright C8 tests"),
    "Playwright C8 test",
  );
  const testRecord = asRecord(test, "Playwright C8 test");
  assertExactKeys(
    testRecord,
    [
      "timeout",
      "annotations",
      "expectedStatus",
      "projectId",
      "projectName",
      "results",
      "status",
    ],
    "Playwright C8 test",
  );
  const engine = nonEmptyString(testRecord.projectId, "C8 project id");
  if (!ENGINE_ORDER.includes(engine)) {
    throw new Error(`unsupported C8 project "${engine}"`);
  }
  assertEqual(testRecord.projectName, engine, "C8 project name");
  assertEqual(testRecord.expectedStatus, "passed", "C8 expected status");
  assertEqual(testRecord.status, "expected", "C8 test status");
  if (arrayValue(testRecord.annotations, "C8 test annotations").length !== 0) {
    throw new Error("Playwright C8 test must not have annotations");
  }
  const result = exactlyOne(
    arrayValue(testRecord.results, "Playwright C8 results"),
    "Playwright C8 result",
  );
  const resultRecord = asRecord(result, "Playwright C8 result");
  assertExactKeys(
    resultRecord,
    [
      "workerIndex",
      "parallelIndex",
      "status",
      "duration",
      "errors",
      "stdout",
      "stderr",
      "retry",
      "startTime",
      "annotations",
      "attachments",
    ],
    "Playwright C8 result",
  );
  assertEqual(resultRecord.status, "passed", "C8 result status");
  assertEqual(resultRecord.retry, 0, "C8 result retry");
  nonNegativeInteger(resultRecord.workerIndex, "C8 result workerIndex");
  nonNegativeInteger(resultRecord.parallelIndex, "C8 result parallelIndex");
  nonNegativeNumber(resultRecord.duration, "C8 result duration");
  assertUtcDate(resultRecord.startTime, capturedOn, "C8 result startTime");
  for (const [key, label] of [
    ["errors", "errors"],
    ["annotations", "annotations"],
  ]) {
    if (arrayValue(resultRecord[key], `C8 result ${label}`).length !== 0) {
      throw new Error(`Playwright C8 result must not contain ${label}`);
    }
  }
  arrayValue(resultRecord.stdout, "C8 result stdout");
  arrayValue(resultRecord.stderr, "C8 result stderr");
  const attachment = exactlyOne(
    arrayValue(resultRecord.attachments, "C8 result attachments"),
    "C8 result attachment",
  );
  return { engine, attachment, line, column };
}

function decodeAttachment(value) {
  const attachment = asRecord(value, ATTACHMENT_NAME);
  assertExactKeys(attachment, ["name", "contentType", "body"], ATTACHMENT_NAME);
  assertEqual(attachment.name, ATTACHMENT_NAME, "attachment name");
  assertEqual(
    attachment.contentType,
    "application/json",
    "attachment content type",
  );
  const body = nonEmptyString(attachment.body, "attachment body");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      body,
    )
  ) {
    throw new Error(`${ATTACHMENT_NAME} body is not canonical base64`);
  }
  const bytes = Buffer.from(body, "base64");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${ATTACHMENT_NAME} exceeds the decoded size limit`);
  }
  if (bytes.toString("base64") !== body) {
    throw new Error(`${ATTACHMENT_NAME} body is not canonical base64`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${ATTACHMENT_NAME} body is not valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${ATTACHMENT_NAME} body is not valid JSON`);
  }
}

function validateCapture(value, context) {
  const capture = asRecord(value, "browser calibration attachment");
  assertExactKeys(
    capture,
    ["schema", "inputIdentity", "environment", "rows"],
    "browser calibration attachment",
  );
  assertEqual(capture.schema, CAPTURE_SCHEMA, "capture schema");
  if (!isDeepStrictEqual(capture.inputIdentity, context.inputIdentity)) {
    throw new Error(
      "browser calibration attachment inputIdentity is stale or invalid",
    );
  }
  const environment = asRecord(
    capture.environment,
    "browser calibration environment",
  );
  assertExactKeys(
    environment,
    ["engine", "engineVersion", "userAgent", "platform", "devicePixelRatio"],
    "browser calibration environment",
  );
  const engine = nonEmptyString(environment.engine, "capture engine");
  if (!ENGINE_ORDER.includes(engine)) {
    throw new Error(`unsupported capture engine "${engine}"`);
  }
  const version = nonEmptyString(
    environment.engineVersion,
    `${engine} version`,
  );
  const userAgent = nonEmptyString(
    environment.userAgent,
    `${engine} userAgent`,
  );
  const platform = nonEmptyString(environment.platform, `${engine} platform`);
  const devicePixelRatio = positiveNumber(
    environment.devicePixelRatio,
    `${engine} DPR`,
  );
  const userAgentIdentity = browserIdentityFromUserAgent(userAgent);
  assertEqual(userAgentIdentity.engine, engine, `${engine} userAgent engine`);
  assertEqual(
    userAgentIdentity.version,
    version,
    `${engine} userAgent version`,
  );

  const rows = arrayValue(capture.rows, `${engine} rows`);
  if (rows.length !== context.oracleRows.length) {
    throw new Error(`${engine} capture has the wrong sample count`);
  }
  const validatedRows = rows.map((row, index) =>
    validateCaptureRow(
      row,
      context.oracleRows[index],
      engine,
      version,
      userAgent,
      platform,
      devicePixelRatio,
      context,
    ),
  );
  const maxima = {
    maxAbsoluteDelta: Math.max(
      ...validatedRows.map(({ absoluteDelta }) => absoluteDelta),
    ),
    maxRelativeDelta: Math.max(
      ...validatedRows.map(({ relativeDelta }) => relativeDelta),
    ),
    maxAbsoluteUnkernedDelta: Math.max(
      ...validatedRows.map(
        ({ absoluteUnkernedDelta }) => absoluteUnkernedDelta,
      ),
    ),
    maxRelativeUnkernedDelta: Math.max(
      ...validatedRows.map(
        ({ relativeUnkernedDelta }) => relativeUnkernedDelta,
      ),
    ),
  };
  const gridEvidence = validateCaptureGridEvidence(
    validatedRows,
    { engine, version, platform, devicePixelRatio },
    context,
  );
  const allKerned = validatedRows.every(({ matchesKerned }) => matchesKerned);
  const allUnkerned = validatedRows.every(
    ({ matchesUnkerned }) => matchesUnkerned,
  );
  const derivedStatus = allKerned
    ? "pass-kerned"
    : allUnkerned
      ? "pass-with-unkerned-browser-variance"
      : gridEvidence.pass
        ? "pass-with-platform-grid-fitting-variance"
        : "fail";
  if (derivedStatus === "fail") {
    throw new Error(`${engine} calibration attachment failed`);
  }

  return {
    engine,
    version,
    userAgent,
    platform,
    devicePixelRatio,
    status: derivedStatus,
    kernedOracle: oracleFromMaxima(
      maxima.maxAbsoluteDelta,
      maxima.maxRelativeDelta,
      context.calibration.tolerance,
    ),
    unkernedOracle: oracleFromMaxima(
      maxima.maxAbsoluteUnkernedDelta,
      maxima.maxRelativeUnkernedDelta,
      context.calibration.tolerance,
    ),
  };
}

function validateCaptureRow(
  value,
  oracle,
  engine,
  version,
  userAgent,
  platform,
  devicePixelRatio,
  context,
) {
  const label = `${engine} row ${oracle.id}`;
  const row = asRecord(value, label);
  assertExactKeys(row, ["id", "browserWidth", "method", "fontIdentity"], label);
  assertEqual(row.id, oracle.id, `${label} id`);
  const browserWidth = nonNegativeNumber(
    row.browserWidth,
    `${label} browserWidth`,
  );
  const absoluteDelta = Math.abs(browserWidth - oracle.nodeWidth);
  const relativeDelta =
    oracle.nodeWidth === 0 ? 0 : absoluteDelta / oracle.nodeWidth;
  const absoluteUnkernedDelta = Math.abs(
    browserWidth - oracle.nodeUnkernedWidth,
  );
  const relativeUnkernedDelta =
    oracle.nodeUnkernedWidth === 0
      ? 0
      : absoluteUnkernedDelta / oracle.nodeUnkernedWidth;
  const matchesKerned = withinTolerance(
    absoluteDelta,
    relativeDelta,
    context.calibration.tolerance,
  );
  const matchesUnkerned = withinTolerance(
    absoluteUnkernedDelta,
    relativeUnkernedDelta,
    context.calibration.tolerance,
  );
  const browserStatus = classify(
    browserWidth,
    oracle.availableWidth,
    context.calibration.nearLimit,
  );
  const method = nonEmptyString(row.method, `${label} method`);
  assertEqual(
    method,
    `browser-svg-getComputedTextLength/${engine}@${version}`,
    `${label} method`,
  );
  const fontIdentity = nonEmptyString(
    row.fontIdentity,
    `${label} fontIdentity`,
  );
  const expectedFontIdentity = [
    `sha256=${context.font.sha256}`,
    `alias=${context.font.alias}`,
    `family=${encodeURIComponent(context.font.family)}`,
    `weight=${context.font.weight}`,
    `style=${context.font.style}`,
    `engine=${engine}@${version}`,
    `platform=${encodeURIComponent(platform)}`,
    `dpr=${devicePixelRatio}`,
    `userAgent=${encodeURIComponent(userAgent)}`,
  ].join(";");
  assertEqual(fontIdentity, expectedFontIdentity, `${label} fontIdentity`);
  const withinNearestPixelAdvanceEnvelope =
    absoluteDelta <= oracle.nearestPixelAdvanceEnvelope + 1e-9;
  return {
    id: oracle.id,
    absoluteDelta,
    relativeDelta,
    absoluteUnkernedDelta,
    relativeUnkernedDelta,
    browserWidth,
    browserStatus,
    matchesKerned,
    matchesUnkerned,
    withinNearestPixelAdvanceEnvelope,
  };
}

function validateCaptureGridEvidence(rows, environment, context) {
  const environmentMatches =
    environment.engine === context.calibration.grid.engine &&
    environment.version === context.calibration.grid.engineVersion &&
    environment.platform === context.calibration.grid.platform &&
    environment.devicePixelRatio === context.calibration.grid.devicePixelRatio;
  const widthsMatch = rows.every(
    ({ id, browserWidth }) =>
      browserWidth === context.calibration.grid.widths[id],
  );
  const allWidthsIntegral = rows.every(({ browserWidth }) =>
    Number.isInteger(browserWidth),
  );
  const allWithinNearestPixelAdvanceEnvelope = rows.every(
    ({ withinNearestPixelAdvanceEnvelope }) =>
      withinNearestPixelAdvanceEnvelope,
  );
  const semanticBandsMatch = rows.every(({ id, browserStatus }) => {
    const sample = context.calibration.samples.find(
      (candidate) => candidate.id === id,
    );
    return (
      sample !== undefined &&
      matchesExpectedBand(browserStatus, sample.expectedBand)
    );
  });
  const derived = {
    environmentMatches,
    widthsMatch,
    allWidthsIntegral,
    allWithinNearestPixelAdvanceEnvelope,
    semanticBandsMatch,
  };
  return {
    pass: Object.values(derived).every(Boolean),
  };
}

function validateAggregate(value, context) {
  const evidence = asRecord(value, "checked evidence");
  assertNoPrivateData(evidence, "checked evidence");
  assertExactKeys(
    evidence,
    [
      "schema",
      "capturedOn",
      "overallStatus",
      "fixture",
      "method",
      "toolchain",
      "captureInputs",
      "privacy",
      "engines",
      "platformGridFittingCapture",
      "coverage",
    ],
    "checked evidence",
  );
  assertEqual(evidence.schema, EVIDENCE_SCHEMA, "evidence schema");
  const capturedOn = nonEmptyString(evidence.capturedOn, "capturedOn");
  assertIsoDate(capturedOn, "capturedOn");
  assertEqual(evidence.overallStatus, OVERALL_STATUS, "overallStatus");
  assertEqual(evidence.fixture, "browser-calibration.json", "evidence fixture");
  const expectedMethod = buildMethod(context);
  if (!isDeepStrictEqual(evidence.method, expectedMethod)) {
    throw new Error("checked evidence method does not match calibration");
  }
  const expectedToolchain = buildToolchain(context);
  if (!isDeepStrictEqual(evidence.toolchain, expectedToolchain)) {
    throw new Error("checked evidence toolchain is stale");
  }
  if (!isDeepStrictEqual(evidence.captureInputs, context.inputIdentity)) {
    throw new Error("checked evidence captureInputs are stale");
  }
  if (!isDeepStrictEqual(evidence.privacy, PRIVACY)) {
    throw new Error("checked evidence privacy declaration is not canonical");
  }
  const grid = validatePlatformGridCapture(
    evidence.platformGridFittingCapture,
    context,
  );
  const engines = validateAggregateEngines(evidence.engines, grid, context);
  const expectedCoverage = buildCoverage(context);
  if (!isDeepStrictEqual(evidence.coverage, expectedCoverage)) {
    throw new Error("checked evidence coverage is not canonical");
  }
  return buildAggregate(capturedOn, engines, grid, context);
}

function validateAggregateEngines(value, grid, context) {
  const engines = arrayValue(value, "checked engines");
  if (engines.length !== ENGINE_ORDER.length) {
    throw new Error("checked evidence must contain exactly three engines");
  }
  return engines.map((value, index) => {
    const expectedEngine = ENGINE_ORDER[index];
    const engine = asRecord(value, `${expectedEngine} aggregate`);
    assertExactKeys(
      engine,
      [
        "engine",
        "version",
        "userAgent",
        "platform",
        "devicePixelRatio",
        "status",
        "kernedOracle",
        "unkernedOracle",
      ],
      `${expectedEngine} aggregate`,
    );
    assertEqual(engine.engine, expectedEngine, "aggregate engine order");
    const normalized = {
      engine: expectedEngine,
      version: nonEmptyString(engine.version, `${expectedEngine} version`),
      userAgent: nonEmptyString(
        engine.userAgent,
        `${expectedEngine} userAgent`,
      ),
      platform: nonEmptyString(engine.platform, `${expectedEngine} platform`),
      devicePixelRatio: positiveNumber(
        engine.devicePixelRatio,
        `${expectedEngine} DPR`,
      ),
      status: nonEmptyString(engine.status, `${expectedEngine} status`),
      kernedOracle: validateAggregateOracle(
        engine.kernedOracle,
        `${expectedEngine} kerned oracle`,
        context.calibration.tolerance,
      ),
      unkernedOracle: validateAggregateOracle(
        engine.unkernedOracle,
        `${expectedEngine} unkerned oracle`,
        context.calibration.tolerance,
      ),
    };
    const derivedStatus = normalized.kernedOracle.withinTolerance
      ? "pass-kerned"
      : normalized.unkernedOracle.withinTolerance
        ? "pass-with-unkerned-browser-variance"
        : matchesGridIdentity(normalized, grid)
          ? "pass-with-platform-grid-fitting-variance"
          : "fail";
    assertEqual(
      normalized.status,
      derivedStatus,
      `${expectedEngine} aggregate status`,
    );
    if (derivedStatus === "fail") {
      throw new Error(`${expectedEngine} aggregate is failed`);
    }
    return normalized;
  });
}

function validateAggregateOracle(value, label, tolerance) {
  const oracle = asRecord(value, label);
  assertExactKeys(
    oracle,
    ["maxAbsoluteDelta", "maxRelativeDelta", "withinTolerance"],
    label,
  );
  const maxAbsoluteDelta = nonNegativeNumber(
    oracle.maxAbsoluteDelta,
    `${label} maxAbsoluteDelta`,
  );
  const maxRelativeDelta = nonNegativeNumber(
    oracle.maxRelativeDelta,
    `${label} maxRelativeDelta`,
  );
  const expected = withinTolerance(
    maxAbsoluteDelta,
    maxRelativeDelta,
    tolerance,
  );
  assertEqual(oracle.withinTolerance, expected, `${label} withinTolerance`);
  return {
    maxAbsoluteDelta,
    maxRelativeDelta,
    withinTolerance: expected,
  };
}

function validatePlatformGridCapture(value, context) {
  const grid = asRecord(value, "checked platform grid capture");
  assertNoPrivateData(grid, "checked platform grid capture");
  assertExactKeys(
    grid,
    [
      "engine",
      "version",
      "platform",
      "devicePixelRatio",
      "status",
      "source",
      "maxAbsoluteDelta",
      "maxRelativeDelta",
      "widths",
      "behavior",
    ],
    "checked platform grid capture",
  );
  const expected = context.calibration.grid;
  assertEqual(grid.engine, expected.engine, "grid engine");
  assertEqual(grid.version, expected.engineVersion, "grid version");
  assertEqual(grid.platform, expected.platform, "grid platform");
  assertEqual(
    grid.devicePixelRatio,
    expected.devicePixelRatio,
    "grid devicePixelRatio",
  );
  assertEqual(
    grid.status,
    "pass-with-platform-grid-fitting-variance",
    "grid status",
  );
  assertEqual(grid.source, expected.source, "grid source");
  const recordedMaxAbsoluteDelta = nonNegativeNumber(
    grid.maxAbsoluteDelta,
    "grid maxAbsoluteDelta",
  );
  const recordedMaxRelativeDelta = nonNegativeNumber(
    grid.maxRelativeDelta,
    "grid maxRelativeDelta",
  );
  const widths = numberRecord(grid.widths, "checked grid widths");
  if (!isDeepStrictEqual(widths, expected.widths)) {
    throw new Error("checked grid widths do not match calibration fixture");
  }
  assertEqual(grid.behavior, expected.behavior, "grid behavior");
  const derived = derivePlatformGridCapture(context);
  assertApproximate(
    recordedMaxAbsoluteDelta,
    derived.maxAbsoluteDelta,
    "grid maxAbsoluteDelta",
  );
  assertApproximate(
    recordedMaxRelativeDelta,
    derived.maxRelativeDelta,
    "grid maxRelativeDelta",
  );
  return {
    engine: expected.engine,
    version: expected.engineVersion,
    platform: expected.platform,
    devicePixelRatio: expected.devicePixelRatio,
    status: "pass-with-platform-grid-fitting-variance",
    source: expected.source,
    maxAbsoluteDelta: derived.maxAbsoluteDelta,
    maxRelativeDelta: derived.maxRelativeDelta,
    widths: { ...expected.widths },
    behavior: expected.behavior,
  };
}

function derivePlatformGridCapture(context) {
  const rows = context.oracleRows.map((oracle) => {
    const browserWidth = context.calibration.grid.widths[oracle.id];
    if (browserWidth === undefined) {
      throw new Error(`grid capture is missing width for "${oracle.id}"`);
    }
    if (!Number.isInteger(browserWidth)) {
      throw new Error(`grid capture width for "${oracle.id}" is not integral`);
    }
    const absoluteDelta = Math.abs(browserWidth - oracle.nodeWidth);
    const relativeDelta =
      oracle.nodeWidth === 0 ? 0 : absoluteDelta / oracle.nodeWidth;
    const browserStatus = classify(
      browserWidth,
      oracle.availableWidth,
      context.calibration.nearLimit,
    );
    if (!matchesExpectedBand(browserStatus, oracle.expectedBand)) {
      throw new Error(
        `grid capture ${oracle.id} status ${browserStatus} does not match ${oracle.expectedBand}`,
      );
    }
    if (absoluteDelta > oracle.nearestPixelAdvanceEnvelope + 1e-9) {
      throw new Error(
        `grid capture ${oracle.id} exceeds the nearest-pixel Fontkit advance envelope`,
      );
    }
    return { absoluteDelta, relativeDelta };
  });
  const maxAbsoluteDelta = Math.max(
    ...rows.map(({ absoluteDelta }) => absoluteDelta),
  );
  const maxRelativeDelta = Math.max(
    ...rows.map(({ relativeDelta }) => relativeDelta),
  );
  if (
    withinTolerance(
      maxAbsoluteDelta,
      maxRelativeDelta,
      context.calibration.tolerance,
    )
  ) {
    throw new Error("grid capture does not record a distinct variance");
  }
  return { maxAbsoluteDelta, maxRelativeDelta };
}

function buildAggregate(capturedOn, engines, grid, context) {
  return {
    schema: EVIDENCE_SCHEMA,
    capturedOn,
    overallStatus: OVERALL_STATUS,
    fixture: "browser-calibration.json",
    method: buildMethod(context),
    toolchain: buildToolchain(context),
    captureInputs: copyInputIdentity(context.inputIdentity),
    privacy: { ...PRIVACY },
    engines: engines.map((engine) => ({
      engine: engine.engine,
      version: engine.version,
      userAgent: engine.userAgent,
      platform: engine.platform,
      devicePixelRatio: engine.devicePixelRatio,
      status: engine.status,
      kernedOracle: { ...engine.kernedOracle },
      unkernedOracle: { ...engine.unkernedOracle },
    })),
    platformGridFittingCapture: {
      engine: grid.engine,
      version: grid.version,
      platform: grid.platform,
      devicePixelRatio: grid.devicePixelRatio,
      status: grid.status,
      source: grid.source,
      maxAbsoluteDelta: grid.maxAbsoluteDelta,
      maxRelativeDelta: grid.maxRelativeDelta,
      widths: { ...grid.widths },
      behavior: grid.behavior,
    },
    coverage: buildCoverage(context),
  };
}

function buildMethod(context) {
  return {
    node: `fontkit/${context.fontkit}`,
    browser: BROWSER_METHOD,
    tolerance: {
      absoluteSvgUnits: context.calibration.tolerance.absoluteSvgUnits,
      relative: context.calibration.tolerance.relative,
      acceptance: context.calibration.tolerance.acceptance,
    },
  };
}

function buildToolchain(context) {
  return {
    playwright: context.playwright,
    esbuild: context.esbuild,
    browserKernelSha256: context.kernel.sha256,
    browserKernelBytes: context.kernel.bytes,
    font: {
      family: context.font.family,
      sha256: context.font.sha256,
    },
  };
}

function copyInputIdentity(identity) {
  return Object.fromEntries(
    Object.entries(identity).map(([name, value]) => [name, { ...value }]),
  );
}

function buildCoverage(context) {
  return {
    samples: context.calibration.samples.length,
    includes: context.calibration.samples.map(({ id }) =>
      SAMPLE_INCLUDES.get(id),
    ),
    missingGlyphCodepoint: context.font.missingCodepoint,
    missingGlyphStatus: "unverified",
    diagramTextFit: { ...DIAGRAM_TEXT_FIT_COVERAGE },
  };
}

function oracleFromMaxima(maxAbsoluteDelta, maxRelativeDelta, tolerance) {
  return {
    maxAbsoluteDelta,
    maxRelativeDelta,
    withinTolerance: withinTolerance(
      maxAbsoluteDelta,
      maxRelativeDelta,
      tolerance,
    ),
  };
}

function withinTolerance(absoluteDelta, relativeDelta, tolerance) {
  return (
    absoluteDelta <= tolerance.absoluteSvgUnits ||
    relativeDelta <= tolerance.relative
  );
}

function matchesGridIdentity(engine, grid) {
  return (
    engine.engine === grid.engine &&
    engine.version === grid.version &&
    engine.platform === grid.platform &&
    engine.devicePixelRatio === grid.devicePixelRatio &&
    approximatelyEqual(
      engine.kernedOracle.maxAbsoluteDelta,
      grid.maxAbsoluteDelta,
    ) &&
    approximatelyEqual(
      engine.kernedOracle.maxRelativeDelta,
      grid.maxRelativeDelta,
    )
  );
}

function classify(width, availableWidth, nearLimit) {
  if (width > availableWidth) return "overflow";
  if (width / availableWidth >= nearLimit) return "near-limit";
  return "clear";
}

function matchesExpectedBand(status, expectedBand) {
  return expectedBand === "boundary"
    ? status === "near-limit" || status === "overflow"
    : status === expectedBand;
}

function browserIdentityFromUserAgent(userAgent) {
  const chromium = /\b(?:Chrome|HeadlessChrome)\/([0-9.]+)/u.exec(userAgent);
  const firefox = /\bFirefox\/([0-9.]+)/u.exec(userAgent);
  const webkit = /\bVersion\/([0-9.]+)\s+Safari\/[0-9.]+/u.exec(userAgent);
  const matches = [
    chromium === null
      ? undefined
      : { engine: "chromium", version: chromium[1] },
    firefox === null ? undefined : { engine: "firefox", version: firefox[1] },
    webkit === null ? undefined : { engine: "webkit", version: webkit[1] },
  ].filter((value) => value !== undefined);
  if (matches.length !== 1) {
    throw new Error(
      "browser calibration userAgent must identify exactly one supported engine",
    );
  }
  return matches[0];
}

function assertNoPrivateData(value, label) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current !== null && typeof current === "object") {
      for (const [key, item] of Object.entries(current)) {
        pending.push(key, item);
      }
    } else if (typeof current === "string") {
      const candidates = [current];
      let decoded = current;
      for (let pass = 0; pass < 2 && decoded.includes("%"); pass += 1) {
        try {
          const next = decodeURIComponent(decoded);
          if (next === decoded) break;
          candidates.push(next);
          decoded = next;
        } catch {
          throw new Error(`${label} contains invalid percent encoding`);
        }
      }
      for (const candidate of candidates) {
        if (
          /(?:^|[\s"'(=])(?:file:\/\/|\/(?:Users|Volumes|home|private|var\/folders|tmp)\/)/iu.test(
            candidate,
          ) ||
          /[A-Za-z]:\\/u.test(candidate) ||
          /\\\\[A-Za-z0-9._-]+\\/u.test(candidate) ||
          /\b(?:https?|s?ftp):\/\//iu.test(candidate) ||
          /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(candidate) ||
          /\bwillackerly\b/iu.test(candidate) ||
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(candidate) ||
          /(?:^|[=;])(?:host|hostname)=[^;]+/iu.test(candidate) ||
          /(?:^|[/:])(?:localhost|[A-Za-z0-9._-]+\.local)(?:$|[/:;])/iu.test(
            candidate,
          )
        ) {
          throw new Error(`${label} contains private or local identity data`);
        }
      }
    }
  }
}

async function readJsonUrl(url, label) {
  const { value } = await readJsonFile(
    fileURLToPath(url),
    MAX_EVIDENCE_BYTES,
    label,
  );
  return value;
}

async function readJsonFile(path, maxBytes, label) {
  const bytes = await readBoundedFile(path, maxBytes, label);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  try {
    return { value: JSON.parse(text), text, bytes };
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function readBoundedFile(path, maxBytes, label) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") throw new Error(`${label} is missing`);
    if (code === "ELOOP") {
      throw new Error(`${label} must be a regular, non-symlink file`);
    }
    throw new Error(`${label} could not be opened safely`);
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error(`${label} must be a regular, non-symlink file`);
    }
    if (before.size > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      bytes.byteLength !== after.size ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw new Error(`${label} changed while it was being read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function acquireEvidenceLock(path) {
  const lockPath = `${path}.lock`;
  try {
    const handle = await open(lockPath, "wx", 0o600);
    return { handle, path: lockPath };
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    if (code === "EEXIST") {
      throw new Error("another browser calibration update holds the lock");
    }
    throw new Error("browser calibration evidence lock could not be created");
  }
}

async function releaseEvidenceLock(lock) {
  try {
    await lock.handle.close();
  } finally {
    await unlink(lock.path).catch(() => {});
  }
}

async function writeAtomically(path, bytes, expectedBytes) {
  const current = await readBoundedFile(
    path,
    MAX_EVIDENCE_BYTES,
    "existing checked evidence",
  );
  if (!current.equals(expectedBytes)) {
    throw new Error("checked evidence changed during the update");
  }
  const temporary = resolve(
    dirname(path),
    `.browser-calibration-${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o666);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function serializeJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileIdentity(bytes) {
  return {
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
  };
}

function displayPath(path) {
  const result = relative(packageRoot, path);
  return result === "" ? "." : result;
}

function exactPackageVersion(value, name) {
  const version = nonEmptyString(value, `${name} version`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(
      `${name} must use an exact package version; found "${version}"`,
    );
  }
  return version;
}

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is not a real calendar date`);
  }
}

function assertUtcDate(value, expectedDate, label) {
  const timestamp = nonEmptyString(value, label);
  const parsed = new Date(timestamp);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString() !== timestamp ||
    timestamp.slice(0, 10) !== expectedDate
  ) {
    throw new Error(
      `${label} must be an exact UTC timestamp on ${expectedDate}`,
    );
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (!isDeepStrictEqual(actual, sortedExpected)) {
    throw new Error(
      `${label} has unexpected keys; expected ${sortedExpected.join(", ")}, found ${actual.join(", ")}`,
    );
  }
}

function asRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function arrayValue(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function exactlyOne(value, label) {
  if (value.length !== 1) {
    throw new Error(`${label} must contain exactly one item`);
  }
  return value[0];
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertSha256(value, label) {
  const sha256 = nonEmptyString(value, label);
  if (!/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return sha256;
}

function positiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function nonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function positiveInteger(value, label) {
  const number = positiveNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return number;
}

function nonNegativeInteger(value, label) {
  const number = nonNegativeNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function integerArray(value, label) {
  const array = arrayValue(value, label);
  return array.map((item, index) => {
    if (!Number.isSafeInteger(item) || item < 0) {
      throw new Error(`${label}[${index}] must be a non-negative integer`);
    }
    return item;
  });
}

function numberRecord(value, label) {
  const record = asRecord(value, label);
  const result = {};
  for (const [key, item] of Object.entries(record)) {
    result[key] = nonNegativeNumber(item, `${label}.${key}`);
  }
  return result;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}`,
    );
  }
}

function assertResolvedPathEqual(actual, expected, label) {
  const value = nonEmptyString(actual, label);
  if (resolve(value) !== resolve(expected)) {
    throw new Error(`${label} does not match the checked local configuration`);
  }
}

function assertApproximate(actual, expected, label) {
  if (!approximatelyEqual(actual, expected)) {
    throw new Error(
      `${label} must be derivable from widths; expected ${expected}, found ${actual}`,
    );
  }
}

function approximatelyEqual(left, right) {
  if (left === right) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-9 * scale;
}
