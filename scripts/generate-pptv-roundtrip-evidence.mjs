#!/usr/bin/env node

/**
 * Generate a privacy-safe, content-bound PPTV/PPTX round-trip evidence bundle.
 *
 * The workflow uses a synthetic standalone atom, deterministic C9 compilation,
 * an explicit trusted DrawingML edit simulation, C10 reconciliation, separate
 * C5 application, C9 regeneration, C8 text-fit, and C11 browser/Quick Look
 * evidence. It publishes only after exact semantic, visual, hash, and privacy
 * checks pass.
 *
 * CONTRACT:C5-PPTV-PATCH.1.2
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.0
 * CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { userInfo } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requireFromPptv = createRequire(
  new URL("../packages/pptv/package.json", import.meta.url),
);
const JSZip = requireFromPptv("jszip");
const DEFAULT_DESTINATION = join(
  REPO_ROOT,
  "tests",
  "fixtures",
  "roundtrip-evidence",
  "pptv",
);
const VISUAL_SCRIPT = join(REPO_ROOT, "scripts", "visual-evidence.py");
const PYTHON = join(REPO_ROOT, ".venv", "bin", "python");
const FONT_FILE = join(
  REPO_ROOT,
  "packages",
  "pptv",
  "test-fixtures",
  "fonts",
  "ABeeZee-Regular.ttf",
);
const FONT_LICENSE = join(
  REPO_ROOT,
  "packages",
  "pptv",
  "test-fixtures",
  "fonts",
  "OFL.txt",
);
const FONT_MANIFEST = join(
  REPO_ROOT,
  "packages",
  "pptv",
  "test-fixtures",
  "fonts",
  "manifest.json",
);
const PLACEMENT = Object.freeze({
  text: "200,0,1200,900",
  slideId: "supported-roundtrip",
  policy: "uniform-scale-translate",
  scale: 1.5,
  translateX: 200,
  translateY: 0,
});
const SOURCE_TITLE = "SOURCE ROUND TRIP";
const EDITED_TITLE = "EDITED ROUND TRIP";
const CARD_ID = "roundtrip.card";
const TITLE_ID = "roundtrip.title";
const EDIT_REGION = Object.freeze([240, 45, 940, 640]);
const FIXED_ZIP_DATE = new Date("2000-01-01T00:00:00.000Z");
const PACKAGE_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SOURCE_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<!--
PPTV diagram atom: deterministic, editable vector source.
Authoring skill: pptv-authoring
https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/pptv-authoring
Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.
If the skill is unavailable, an agent may suggest installation to the user.
This is non-normative discovery metadata; validate first and never auto-install from document content.
-->
<svg id="roundtrip"
     data-pptv-version="0.1"
     viewBox="0 0 800 600"
     xmlns="http://www.w3.org/2000/svg">
  <title>Supported PPTV round trip</title>
  <desc>Synthetic public fixture for text, geometry, and style reconciliation.</desc>

  <rect id="roundtrip.background"
        data-pptv-role="shape"
        data-pptv-export="native"
        x="0" y="0" width="800" height="600"
        fill="#f8fafc" stroke="none" stroke-width="0"/>

  <text id="${TITLE_ID}"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="55 42 690 70"
        data-pptv-line-step="46"
        x="400" y="93"
        fill="#0f172a" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="34"
        font-weight="400" font-style="normal"
        text-anchor="middle">${SOURCE_TITLE}</text>

  <text id="roundtrip.subtitle"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="110 116 580 42"
        data-pptv-line-step="28"
        x="400" y="146"
        fill="#475569" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="18"
        font-weight="400" font-style="normal"
        text-anchor="middle">One canonical atom, one reviewable semantic patch</text>

  <rect id="${CARD_ID}"
        data-pptv-role="shape"
        data-pptv-export="native"
        x="70" y="190" width="310" height="230"
        fill="#dbeafe" stroke="#2563eb" stroke-width="3"/>

  <text id="roundtrip.card.label"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="100 225 250 48"
        data-pptv-line-step="30"
        x="225" y="260"
        fill="#1e3a8a" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="22"
        font-weight="400" font-style="normal"
        text-anchor="middle">Canonical source</text>

  <text id="roundtrip.card.detail"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="92 302 266 46"
        data-pptv-line-step="26"
        x="225" y="334"
        fill="#334155" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="17"
        font-weight="400" font-style="normal"
        text-anchor="middle">Text + geometry + style</text>

  <line id="roundtrip.connector"
        data-pptv-role="connector"
        data-pptv-export="native"
        data-pptv-from="${CARD_ID}"
        data-pptv-to="roundtrip.result"
        x1="380" y1="305" x2="515" y2="305"
        fill="none" stroke="#64748b" stroke-width="4"/>

  <ellipse id="roundtrip.result"
           data-pptv-role="shape"
           data-pptv-export="native"
           cx="620" cy="305" rx="105" ry="88"
           fill="#ede9fe" stroke="#7c3aed" stroke-width="3"/>

  <text id="roundtrip.result.label"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="540 270 160 58"
        data-pptv-line-step="30"
        x="620" y="309"
        fill="#4c1d95" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="22"
        font-weight="400" font-style="normal"
        text-anchor="middle">Recovered</text>

  <rect id="roundtrip.footer"
        data-pptv-role="shape"
        data-pptv-export="native"
        x="90" y="500" width="620" height="54"
        fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>

  <text id="roundtrip.footer.label"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="120 508 560 38"
        data-pptv-line-step="25"
        x="400" y="536"
        fill="#334155" stroke="none" stroke-width="0"
        font-family="ABeeZee" font-size="16"
        font-weight="400" font-style="normal"
        text-anchor="middle">C9 baseline / C10 patch / C9 regenerate</text>
</svg>
`;

class EvidenceGenerationError extends Error {}

function fail(message) {
  throw new EvidenceGenerationError(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path) {
  return sha256Bytes(await readFile(path));
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function relativePath(root, path) {
  const value = toPosix(relative(root, path));
  if (
    value.length === 0 ||
    value === ".." ||
    value.startsWith("../") ||
    value.startsWith("/")
  ) {
    fail(`path escapes evidence root: ${path}`);
  }
  return value;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function writeNew(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
}

async function writeJson(path, value) {
  await writeNew(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sanitizeOutput(value, stage) {
  return String(value ?? "")
    .replaceAll(stage, "$EVIDENCE")
    .replaceAll(REPO_ROOT, "$ROOT")
    .slice(-4000);
}

function run(command, args, stage, expectedStatuses = [0]) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    fail(
      `command could not start: ${command} ${args.join(" ")} (${result.error.message})`,
    );
  }
  if (!expectedStatuses.includes(result.status)) {
    fail(
      [
        `command failed with ${result.status}: ${command} ${args.join(" ")}`,
        sanitizeOutput(result.stdout, stage),
        sanitizeOutput(result.stderr, stage),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function parseCommandJson(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} did not return JSON: ${error.message}`);
  }
}

function runPptv(args, stage, expectedStatuses = [0]) {
  return run("pnpm", ["--silent", "pptv", ...args], stage, expectedStatuses);
}

function runPptvJson(args, stage, expectedStatuses = [0]) {
  return parseCommandJson(
    runPptv([...args, "--format", "json"], stage, expectedStatuses),
    `pptv ${args[0]}`,
  );
}

function runVisual(args, stage, expectedStatuses = [0]) {
  return parseCommandJson(
    run(PYTHON, [VISUAL_SCRIPT, ...args], stage, expectedStatuses),
    `visual-evidence ${args[0]}`,
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function exactInteger(value, label) {
  assert(Number.isSafeInteger(value), `${label} is not an exact safe integer`);
  return Object.is(value, -0) ? 0 : value;
}

function drawingCoordinate(value, axis) {
  const translation =
    axis === "x" ? PLACEMENT.translateX : PLACEMENT.translateY;
  return exactInteger(
    (value * PLACEMENT.scale + translation) * 7620,
    `${axis} DrawingML coordinate`,
  );
}

function drawingLength(value) {
  return exactInteger(value * PLACEMENT.scale * 7620, "DrawingML length");
}

function replaceExactly(text, before, after, label) {
  const occurrences = text.split(before).length - 1;
  assert(
    occurrences === 1,
    `${label} expected one match, found ${occurrences}`,
  );
  return text.replace(before, after);
}

function mappedObjectBlock(xml, map, id) {
  const object = map.slides[0]?.objects.find(
    (candidate) => candidate.id === id,
  );
  assert(object !== undefined, `baseline map lacks object ${id}`);
  const tag = object.emitted.element;
  const marker = `name="src.${id}"`;
  const markerIndex = xml.indexOf(marker);
  const start = xml.lastIndexOf(`<${tag}>`, markerIndex);
  const closing = `</${tag}>`;
  const closeIndex = xml.indexOf(closing, markerIndex);
  assert(
    markerIndex >= 0 && start >= 0 && closeIndex >= 0,
    `slide XML lacks mapped block ${id}`,
  );
  const end = closeIndex + closing.length;
  return { object, start, end, text: xml.slice(start, end) };
}

function rewriteMappedObject(xml, map, id, rewrite) {
  const block = mappedObjectBlock(xml, map, id);
  const replacement = rewrite(block.text, block.object);
  assert(replacement !== block.text, `edit did not change mapped object ${id}`);
  return xml.slice(0, block.start) + replacement + xml.slice(block.end);
}

function xmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function mutateBaselinePptx(baselinePath, editedPath, map) {
  const baselineBytes = await readFile(baselinePath);
  const input = await JSZip.loadAsync(baselineBytes, { checkCRC32: true });
  const slidePart = map.slides[0]?.partName;
  assert(typeof slidePart === "string", "baseline map lacks one slide part");
  const slideEntry = input.file(slidePart);
  assert(slideEntry !== null, `baseline PPTX lacks ${slidePart}`);
  const baselineSlideXml = await slideEntry.async("string");

  let editedSlideXml = rewriteMappedObject(
    baselineSlideXml,
    map,
    TITLE_ID,
    (block) =>
      replaceExactly(
        block,
        `<a:t>${xmlText(SOURCE_TITLE)}</a:t>`,
        `<a:t>${xmlText(EDITED_TITLE)}</a:t>`,
        "title edit",
      ),
  );

  const desiredGeometry = {
    x: 80,
    y: 200,
    width: 300,
    height: 220,
  };
  const desiredStyle = {
    fill: "#dcfce7",
    stroke: "#16a34a",
    strokeWidth: 4,
  };
  editedSlideXml = rewriteMappedObject(
    editedSlideXml,
    map,
    CARD_ID,
    (block, object) => {
      const transform = object.emitted.drawingMl.transform;
      const fill = object.emitted.drawingMl.fill;
      const line = object.emitted.drawingMl.line;
      assert(
        transform !== null &&
          typeof transform === "object" &&
          fill?.kind === "solid" &&
          typeof fill.srgbColor === "string" &&
          line !== null &&
          typeof line === "object" &&
          line.paint?.kind === "solid" &&
          typeof line.paint.srgbColor === "string" &&
          Number.isSafeInteger(line.widthEmu),
        `${CARD_ID} lacks exact emitted geometry/style`,
      );
      let result = replaceExactly(
        block,
        `<a:off x="${transform.offXEmu}" y="${transform.offYEmu}"/>`,
        `<a:off x="${drawingCoordinate(desiredGeometry.x, "x")}" y="${drawingCoordinate(desiredGeometry.y, "y")}"/>`,
        "card position edit",
      );
      result = replaceExactly(
        result,
        `<a:ext cx="${transform.extCxEmu}" cy="${transform.extCyEmu}"/>`,
        `<a:ext cx="${drawingLength(desiredGeometry.width)}" cy="${drawingLength(desiredGeometry.height)}"/>`,
        "card extent edit",
      );
      result = replaceExactly(
        result,
        `val="${fill.srgbColor}"`,
        `val="${desiredStyle.fill.slice(1).toUpperCase()}"`,
        "card fill edit",
      );
      result = replaceExactly(
        result,
        `val="${line.paint.srgbColor}"`,
        `val="${desiredStyle.stroke.slice(1).toUpperCase()}"`,
        "card stroke edit",
      );
      return replaceExactly(
        result,
        `<a:ln w="${line.widthEmu}">`,
        `<a:ln w="${drawingLength(desiredStyle.strokeWidth)}">`,
        "card stroke-width edit",
      );
    },
  );

  const output = new JSZip();
  for (const entry of Object.values(input.files)) {
    if (entry.dir) continue;
    const bytes =
      entry.name === slidePart
        ? new TextEncoder().encode(editedSlideXml)
        : await entry.async("uint8array");
    output.file(entry.name, bytes, {
      binary: true,
      comment: "",
      compression: "STORE",
      createFolders: false,
      date: FIXED_ZIP_DATE,
      dosPermissions: 0,
    });
  }
  const editedBytes = await output.generateAsync({
    type: "uint8array",
    comment: "",
    compression: "STORE",
    mimeType: PACKAGE_MIME,
    platform: "DOS",
    streamFiles: false,
  });
  await writeNew(editedPath, editedBytes);
  assert(
    sha256Bytes(baselineBytes) !== sha256Bytes(editedBytes),
    "edited PPTX unexpectedly equals its baseline bytes",
  );
  return {
    method: "deterministic trusted DrawingML rewrite",
    slidePart,
    baselineSlideSha256: sha256Bytes(
      new TextEncoder().encode(baselineSlideXml),
    ),
    editedSlideSha256: sha256Bytes(new TextEncoder().encode(editedSlideXml)),
    text: {
      objectId: TITLE_ID,
      oldText: SOURCE_TITLE,
      newText: EDITED_TITLE,
    },
    geometry: {
      objectId: CARD_ID,
      oldValue: { x: 70, y: 190, width: 310, height: 230 },
      newValue: desiredGeometry,
    },
    style: {
      objectId: CARD_ID,
      oldValue: {
        fill: "#dbeafe",
        stroke: "#2563eb",
        strokeWidth: 3,
      },
      newValue: desiredStyle,
    },
  };
}

function assertCompileSummary(
  summary,
  sourcePath,
  composedPath,
  pptxPath,
  mapPath,
) {
  return Promise.all([
    sha256File(sourcePath),
    sha256File(composedPath),
    sha256File(pptxPath),
    sha256File(mapPath),
  ]).then(([sourceSha, composedSha, pptxSha, mapSha]) => {
    assert(summary.atomSha256 === sourceSha, "compile atom hash mismatch");
    assert(
      summary.composedDeckSha256 === composedSha,
      "compile composed-deck hash mismatch",
    );
    assert(summary.pptxSha256 === pptxSha, "compile PPTX hash mismatch");
    assert(summary.mapSha256 === mapSha, "compile map hash mismatch");
    return { sourceSha, composedSha, pptxSha, mapSha };
  });
}

async function assertMap(mapPath, sourcePath, composedPath, pptxPath) {
  const map = await readJson(mapPath);
  const [sourceSha, composedSha, pptxSha] = await Promise.all([
    sha256File(sourcePath),
    sha256File(composedPath),
    sha256File(pptxPath),
  ]);
  assert(map.schema === "pptv-pptx-map/0.1", "unexpected C9 map schema");
  assert(map.source?.sha256 === sourceSha, "C9 map atom hash mismatch");
  assert(
    map.composition?.composedDeckSha256 === composedSha,
    "C9 map composed-deck hash mismatch",
  );
  assert(map.pptx?.sha256 === pptxSha, "C9 map PPTX hash mismatch");
  const placement = map.composition?.placement;
  assert(
    placement?.slideId === PLACEMENT.slideId &&
      placement.policy === PLACEMENT.policy &&
      placement.x === 200 &&
      placement.y === 0 &&
      placement.width === 1200 &&
      placement.height === 900,
    "C9 map placement mismatch",
  );
  assert(map.composition?.scale === PLACEMENT.scale, "C9 map scale mismatch");
  assert(
    map.composition?.translateX === PLACEMENT.translateX &&
      map.composition?.translateY === PLACEMENT.translateY,
    "C9 map translation mismatch",
  );
  return map;
}

async function runTextFit(sourcePath, fontMapPath, outputPath, stage) {
  const result = runPptvJson(
    ["text-fit", sourcePath, "--font-map", fontMapPath],
    stage,
  );
  assert(
    result.schema === "pptv-diagram-text-fit/0.1",
    "unexpected diagram text-fit schema",
  );
  assert(
    result.summary?.overflow === 0 && result.summary?.unverified === 0,
    `text-fit did not fully pass for ${basename(sourcePath)}`,
  );
  await writeJson(outputPath, result);
  return result;
}

async function captureBrowser(sourcePath, stem, stage) {
  const output = join(stage, `${stem}.browser.png`);
  const manifest = join(stage, `${stem}.browser.evidence.json`);
  runVisual(
    [
      "capture-browser-svg",
      sourcePath,
      "--output",
      output,
      "--manifest",
      manifest,
      "--checkpoint",
      stem,
      "--root",
      stage,
      "--trusted",
      "--width-px",
      "1600",
      "--height-px",
      "900",
      "--background",
      "#ffffff",
      "--timeout",
      "45",
    ],
    stage,
  );
  const evidence = await readJson(manifest);
  assert(
    evidence.capture?.status === "passed",
    `${stem} browser capture did not pass`,
  );
  return { manifest, evidence };
}

async function captureQuickLook(pptxPath, stem, checkpoint, stage) {
  const output = join(stage, `${stem}.quicklook.png`);
  const manifest = join(stage, `${stem}.quicklook.evidence.json`);
  runVisual(
    [
      "capture-quicklook",
      pptxPath,
      "--output",
      output,
      "--manifest",
      manifest,
      "--lane",
      "pptv-pptx",
      "--checkpoint",
      checkpoint,
      "--root",
      stage,
      "--trusted",
      "--pixel-size",
      "1600",
      "--timeout",
      "45",
    ],
    stage,
  );
  const evidence = await readJson(manifest);
  assert(
    evidence.capture?.status === "passed",
    `${stem} Quick Look capture did not pass`,
  );
  return { manifest, evidence };
}

function assertSameCaptureProfile(left, right, label) {
  for (const field of ["renderer", "environment", "fonts", "input"]) {
    assert(
      JSON.stringify(left.capture?.[field]) ===
        JSON.stringify(right.capture?.[field]),
      `${label} ${field} identities differ`,
    );
  }
}

async function compareCaptures(left, right, outputName, thresholds, stage) {
  const output = join(stage, outputName);
  runVisual(
    [
      "compare",
      left.manifest,
      right.manifest,
      "--manifest",
      output,
      "--root",
      stage,
      "--antialias-tolerance",
      String(thresholds.antialiasTolerance),
      "--max-changed-fraction",
      String(thresholds.maxChangedFraction),
      "--max-mean-absolute-error",
      String(thresholds.maxMeanAbsoluteError),
      "--max-channel-delta",
      String(thresholds.maxChannelDelta),
    ],
    stage,
  );
  const evidence = await readJson(output);
  assert(
    evidence.comparison?.status === "passed",
    `${outputName} comparison did not pass`,
  );
  return evidence;
}

function boundsWithin(bounds, region) {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(Number.isInteger)
  ) {
    return false;
  }
  const [x, y, width, height] = bounds;
  const [regionX, regionY, regionWidth, regionHeight] = region;
  return (
    width > 0 &&
    height > 0 &&
    x >= regionX &&
    y >= regionY &&
    x + width <= regionX + regionWidth &&
    y + height <= regionY + regionHeight
  );
}

function assertIntentionalComparison(evidence, label) {
  const comparison = evidence.comparison;
  assert(
    comparison?.metrics?.changed_pixels > 0,
    `${label} comparison found no intentional change`,
  );
  assert(
    boundsWithin(comparison.changed_bounds, EDIT_REGION),
    `${label} changed pixels escaped the expected edit region`,
  );
}

function assertExactComparison(evidence, label) {
  const metrics = evidence.comparison?.metrics;
  assert(
    metrics?.changed_pixels === 0 &&
      metrics.changed_fraction === 0 &&
      metrics.mean_absolute_error === 0 &&
      metrics.max_channel_delta === 0 &&
      evidence.comparison?.changed_bounds === null,
    `${label} comparison was not exact`,
  );
}

async function recordNativePowerPointStatus(editedPptx, stage) {
  const app = "/Applications/Microsoft PowerPoint.app";
  const executable = join(app, "Contents", "MacOS", "Microsoft PowerPoint");
  let installed = false;
  try {
    await access(executable);
    installed = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let version = "not-detected";
  if (installed) {
    const result = run(
      "/usr/libexec/PlistBuddy",
      [
        "-c",
        "Print :CFBundleShortVersionString",
        join(app, "Contents", "Info.plist"),
      ],
      stage,
    );
    version = result.stdout.trim();
    assert(version.length > 0, "PowerPoint version identity is empty");
  }
  const status = installed ? "manual-required" : "unavailable";
  const diagnostic = installed
    ? "Native Microsoft PowerPoint open, representative edit, save, and reopen were not automated by this generator; manual lifecycle validation remains required."
    : "Native Microsoft PowerPoint was not detected; open, representative edit, save, and reopen validation remains unavailable.";
  const manifest = join(
    stage,
    "supported-edited.native-powerpoint.evidence.json",
  );
  runVisual(
    [
      "record-status",
      editedPptx,
      "--manifest",
      manifest,
      "--lane",
      "pptv-pptx",
      "--checkpoint",
      "native-powerpoint-lifecycle",
      "--renderer-class",
      "native-powerpoint",
      "--status",
      status,
      "--diagnostic",
      diagnostic,
      "--product",
      "Microsoft PowerPoint",
      "--version",
      version,
      "--executable-path",
      installed ? executable : "manual",
      "--root",
      stage,
    ],
    stage,
    [installed ? 2 : 3],
  );
  const evidence = await readJson(manifest);
  assert(
    evidence.native_lifecycle?.status === status,
    "native PowerPoint status was not recorded exactly",
  );
  return evidence;
}

async function zipPartBytes(path, partName) {
  const zip = await JSZip.loadAsync(await readFile(path), { checkCRC32: true });
  const entry = zip.file(partName);
  assert(entry !== null, `${basename(path)} lacks ${partName}`);
  return entry.async("uint8array");
}

async function walkFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
      else fail(`evidence tree contains a non-regular entry: ${path}`);
    }
  }
  await visit(root);
  return result;
}

function sensitiveEnvironmentValues() {
  return Object.entries(process.env)
    .filter(
      ([name, value]) =>
        /(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/iu.test(
          name,
        ) &&
        typeof value === "string" &&
        value.length >= 12,
    )
    .map(([name, value]) => ({ name, value: Buffer.from(value) }));
}

function privacyFindings(label, payload) {
  const findings = [];
  const text = payload.toString("latin1");
  const account = userInfo().username;
  const home = userInfo().homedir;
  const host = process.env.HOSTNAME ?? "";
  const literalChecks = [
    ["current-home-path", home],
    ["current-hostname", host],
  ];
  for (const [name, token] of literalChecks) {
    if (token && token !== "/" && payload.includes(Buffer.from(token))) {
      findings.push(`${label}: contains ${name}`);
    }
  }
  if (
    /\/Users\/(?!Shared(?:\/|$))[^/\s"'<>]+/iu.test(text) ||
    /\/home\/[^/\s"'<>]+/iu.test(text) ||
    /[A-Z]:\\Users\\[^\\\s"'<>]+/iu.test(text)
  ) {
    findings.push(`${label}: contains a workstation-account path`);
  }
  if (account) {
    const escaped = account.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const accountMetadata = new RegExp(
      `(?:creator|lastModifiedBy|author|username)[^\\r\\n<>]{0,80}(?:>|[=:\"'])\\s*${escaped}(?=[<\\s\"']|$)`,
      "iu",
    );
    if (accountMetadata.test(text)) {
      findings.push(`${label}: contains current-account metadata`);
    }
  }
  const patterns = [
    ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
    ["AWS-access-key", /AKIA[0-9A-Z]{16}/u],
    ["GitHub-token", /gh[pousr]_[A-Za-z0-9]{20,}/u],
    ["OpenAI-key", /sk-[A-Za-z0-9_-]{20,}/u],
    ["public-marking", /(?:CUI\/\/|TOP SECRET|SECRET\/\/|\bFOUO\b)/iu],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${label}: contains ${name} pattern`);
  }
  for (const { name, value } of sensitiveEnvironmentValues()) {
    if (payload.includes(value)) {
      findings.push(`${label}: contains sensitive environment value ${name}`);
    }
  }
  return findings;
}

async function scanPrivacy(stage) {
  const files = await walkFiles(stage);
  const findings = [];
  let pptxMembers = 0;
  for (const path of files) {
    const label = relativePath(stage, path);
    const payload = await readFile(path);
    findings.push(...privacyFindings(label, payload));
    if (path.endsWith(".pptx")) {
      const zip = await JSZip.loadAsync(payload, { checkCRC32: true });
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        pptxMembers += 1;
        findings.push(
          ...privacyFindings(
            `${label}!/${entry.name}`,
            Buffer.from(await entry.async("uint8array")),
          ),
        );
      }
    }
  }
  assert(findings.length === 0, `privacy scan failed:\n${findings.join("\n")}`);
  return { files: files.length, pptxPackageMembers: pptxMembers };
}

async function validateEvidenceManifests(stage) {
  const manifests = (await walkFiles(stage)).filter((path) =>
    path.endsWith(".evidence.json"),
  );
  assert(manifests.length >= 9, "evidence bundle has too few C11 envelopes");
  for (const manifest of manifests) {
    runVisual(["validate", manifest, "--root", stage], stage);
  }
  return manifests.length;
}

async function artifactInventory(stage, excluded = new Set()) {
  const result = [];
  for (const path of await walkFiles(stage)) {
    const name = relativePath(stage, path);
    if (excluded.has(name)) continue;
    result.push({
      path: name,
      sha256: await sha256File(path),
      bytes: (await stat(path)).size,
    });
  }
  return result;
}

async function writeSha256Sums(stage) {
  const path = join(stage, "SHA256SUMS");
  const lines = [];
  for (const candidate of await walkFiles(stage)) {
    if (candidate === path) continue;
    lines.push(
      `${await sha256File(candidate)}  ${relativePath(stage, candidate)}`,
    );
  }
  await writeNew(path, `${lines.join("\n")}\n`);
}

async function verifySha256Sums(stage) {
  const lines = (await readFile(join(stage, "SHA256SUMS"), "utf8"))
    .trim()
    .split("\n");
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    assert(match !== null, `invalid SHA256SUMS line: ${line}`);
    const path = resolve(stage, match[2]);
    assert(
      relativePath(stage, path) === match[2],
      `noncanonical SHA256SUMS path: ${match[2]}`,
    );
    assert(
      (await sha256File(path)) === match[1],
      `SHA256SUMS mismatch: ${match[2]}`,
    );
  }
}

function markdownTable(inventory) {
  return [
    "| Artifact | SHA-256 | Bytes |",
    "|----------|---------|------:|",
    ...inventory.map(
      (entry) => `| \`${entry.path}\` | \`${entry.sha256}\` | ${entry.bytes} |`,
    ),
  ].join("\n");
}

function readmeText({
  inventory,
  browserChange,
  quickLookChange,
  exactComparison,
  semanticComparison,
  native,
  privacy,
}) {
  const browserMetrics = browserChange.comparison.metrics;
  const quickLookMetrics = quickLookChange.comparison.metrics;
  const exactMetrics = exactComparison.comparison.metrics;
  return `# PPTV/PPTX round-trip evidence

This isolated C8/C9/C10/C11 fixture is generated from a synthetic public PPTV
atom using the checked ABeeZee font fixture. The PowerPoint edit is a
deterministic DrawingML simulation of the supported text, rectangle geometry,
and direct native-style surface; it is not presented as a native PowerPoint
edit.

## Reproduce and verify

The generator refuses any existing destination:

\`\`\`bash
node scripts/generate-pptv-roundtrip-evidence.mjs \\
  --destination tests/fixtures/roundtrip-evidence/pptv
\`\`\`

Validate each C11 envelope with:

\`\`\`bash
for manifest in tests/fixtures/roundtrip-evidence/pptv/*.evidence.json; do
  .venv/bin/python scripts/visual-evidence.py validate "$manifest" \\
    --root tests/fixtures/roundtrip-evidence/pptv
done
\`\`\`

From this directory, verify all durable file hashes with:

\`\`\`bash
shasum -a 256 -c SHA256SUMS
\`\`\`

## Automated observations

- C8 exact-font preflight passed for both original and recovered atoms with no
  overflow or unverified line.
- C10 returned \`patchable\` with exactly one \`set-text\`, one
  \`set-object-geometry\`, and one \`set-native-style\` operation. Separate C5
  application produced the recovered atom, and a fresh C9 compile produced the
  regenerated PPTX/map.
- The edited and regenerated slide XML parts are byte-identical at
  \`${semanticComparison.slidePart.editedSha256}\`. A second C10 pass over the
  regenerated branch returned \`unchanged\`.
- Original versus recovered Chromium comparison found
  \`${browserMetrics.changed_pixels}\` changed pixels with exact bounds
  \`${JSON.stringify(browserChange.comparison.changed_bounds)}\`, contained by
  the declared edit region \`${JSON.stringify(EDIT_REGION)}\`.
- Baseline versus edited Quick Look comparison found
  \`${quickLookMetrics.changed_pixels}\` changed pixels with exact bounds
  \`${JSON.stringify(quickLookChange.comparison.changed_bounds)}\`.
- Edited versus regenerated Quick Look comparison passed with
  \`${exactMetrics.changed_pixels}\` changed pixels, changed fraction
  \`${exactMetrics.changed_fraction}\`, mean absolute error
  \`${exactMetrics.mean_absolute_error}\`, and maximum channel delta
  \`${exactMetrics.max_channel_delta}\`.
- Native PowerPoint state is \`${native.native_lifecycle.status}\`:
  ${native.native_lifecycle.diagnostic}
- The final privacy pass covers every durable file, every uncompressed PPTX
  member, workstation paths/account metadata, host identity, high-confidence
  credential patterns, sensitive environment values, and prohibited public
  marking strings. It passed ${privacy.files} files and
  ${privacy.pptxPackageMembers} PPTX members before publication.

## Exact artifact hashes

${markdownTable(inventory)}

## Limitations

- Browser and Quick Look captures rely on host fonts; the separate C8 report
  is the exact-font claim.
- Quick Look is a first-slide automated preview, not native PowerPoint
  lifecycle evidence.
- The edited PPTX is a deterministic trusted-package simulation. Native
  PowerPoint open, representative editability, save, and reopen remain the
  separately recorded gate.
- Exact slide XML and C10 supported-semantic equality do not imply byte-equal
  packages because regenerated lineage properties intentionally bind the
  recovered atom and composed deck.
- No C11 human-review envelope or cross-host rendering equivalence is claimed.
`;
}

function parseArguments(argv) {
  let destination = DEFAULT_DESTINATION;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--destination") {
      const next = argv[index + 1];
      if (next === undefined) fail("--destination requires a path");
      destination = resolve(REPO_ROOT, next);
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") {
      process.stdout.write(
        "Usage: node scripts/generate-pptv-roundtrip-evidence.mjs [--destination PATH]\n",
      );
      process.exit(0);
    }
    fail(`unknown argument: ${value}`);
  }
  const rel = relative(REPO_ROOT, destination);
  assert(
    rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`),
    "destination must remain inside the repository",
  );
  return { destination };
}

async function generate(destination) {
  assert(
    !(await pathExists(destination)),
    `destination exists: ${destination}`,
  );
  await Promise.all([
    access(PYTHON),
    access(VISUAL_SCRIPT),
    access(FONT_FILE),
    access(FONT_LICENSE),
    access(FONT_MANIFEST),
  ]);
  await mkdir(dirname(destination), { recursive: true });
  const prefix = join(dirname(destination), ".pptv-evidence.");
  const stage = await mkdtemp(prefix);
  let published = false;
  try {
    assert(
      dirname(stage) === dirname(destination) &&
        basename(stage).startsWith(".pptv-evidence."),
      "unsafe evidence staging directory",
    );
    const sourcePath = join(stage, "supported-original.pptv.svg");
    const fontMapPath = join(stage, "supported-font-map.json");
    const composedPath = join(stage, "supported-composed.pptv.html");
    const baselinePptx = join(stage, "supported-baseline.pptx");
    const baselineMapPath = join(stage, "supported-baseline.pptv.map.json");
    const editedPptx = join(stage, "supported-edited.pptx");
    const reconcileReportPath = join(stage, "supported-edited.reconcile.json");
    const patchPath = join(stage, "supported-recovered.pptv.patch.json");
    const recoveredPath = join(stage, "supported-recovered.pptv.svg");
    const regeneratedPptx = join(stage, "supported-regenerated.pptx");
    const regeneratedMapPath = join(
      stage,
      "supported-regenerated.pptv.map.json",
    );
    const regeneratedComposedPath = join(
      stage,
      ".supported-regenerated.composed.pptv.html",
    );

    await writeNew(sourcePath, SOURCE_TEXT);
    const fontRelative = toPosix(relative(stage, FONT_FILE));
    assert(
      fontRelative ===
        "../../../../packages/pptv/test-fixtures/fonts/ABeeZee-Regular.ttf",
      "font-map path is not stable from the evidence subtree",
    );
    await writeJson(fontMapPath, {
      schema: "pptv-font-map/0.1",
      faces: [
        {
          family: "ABeeZee",
          weight: 400,
          style: "normal",
          path: fontRelative,
          postscriptName: "ABeeZee-Regular",
        },
      ],
    });

    const originalValidation = runPptvJson(["validate", sourcePath], stage);
    assert(
      originalValidation.valid === true &&
        originalValidation.diagnostics.length === 0,
      "original atom did not validate cleanly",
    );
    const originalTextFit = await runTextFit(
      sourcePath,
      fontMapPath,
      join(stage, "supported-original.text-fit.json"),
      stage,
    );

    const composeSummary = runPptvJson(
      [
        "compose",
        sourcePath,
        "--placement",
        PLACEMENT.text,
        "--slide-id",
        PLACEMENT.slideId,
        "--policy",
        PLACEMENT.policy,
        "--output",
        composedPath,
      ],
      stage,
    );
    assert(
      composeSummary.atomSha256 === (await sha256File(sourcePath)) &&
        composeSummary.composedDeckSha256 === (await sha256File(composedPath)),
      "C9 compose hash identity mismatch",
    );

    const baselineCompile = runPptvJson(
      [
        "compile",
        sourcePath,
        "--placement",
        PLACEMENT.text,
        "--slide-id",
        PLACEMENT.slideId,
        "--policy",
        PLACEMENT.policy,
        "--output",
        baselinePptx,
        "--map",
        baselineMapPath,
      ],
      stage,
    );
    const baselineHashes = await assertCompileSummary(
      baselineCompile,
      sourcePath,
      composedPath,
      baselinePptx,
      baselineMapPath,
    );
    const baselineMap = await assertMap(
      baselineMapPath,
      sourcePath,
      composedPath,
      baselinePptx,
    );

    const edit = await mutateBaselinePptx(
      baselinePptx,
      editedPptx,
      baselineMap,
    );
    runPptvJson(
      [
        "reconcile",
        editedPptx,
        "--source",
        sourcePath,
        "--baseline",
        baselineMapPath,
        "--patch",
        patchPath,
        "--report",
        reconcileReportPath,
      ],
      stage,
    );
    const reconciliation = await readJson(reconcileReportPath);
    const patch = await readJson(patchPath);
    assert(
      reconciliation.status === "patchable" &&
        reconciliation.diagnostics.length === 0,
      "C10 did not produce a clean patchable result",
    );
    assert(
      reconciliation.sourceSha256 === baselineHashes.sourceSha &&
        reconciliation.baselineMapSha256 === baselineHashes.mapSha &&
        reconciliation.editedPptxSha256 === (await sha256File(editedPptx)),
      "C10 result hash binding mismatch",
    );
    assert(
      patch.schema === "pptv-patch/0.2" &&
        patch.baseSha256 === baselineHashes.sourceSha &&
        patch.ops.length === 3,
      "C10 patch envelope is not the expected minimal 0.2 proposal",
    );
    assert(
      JSON.stringify(patch.ops.map((operation) => operation.op).sort()) ===
        JSON.stringify(
          ["set-native-style", "set-object-geometry", "set-text"].sort(),
        ),
      "C10 patch operation set differs from the representative edit",
    );
    const textOperation = patch.ops.find(
      (operation) => operation.op === "set-text",
    );
    const geometryOperation = patch.ops.find(
      (operation) => operation.op === "set-object-geometry",
    );
    const styleOperation = patch.ops.find(
      (operation) => operation.op === "set-native-style",
    );
    assert(
      textOperation?.id === TITLE_ID &&
        textOperation.oldText === SOURCE_TITLE &&
        textOperation.value === EDITED_TITLE,
      "C10 text operation mismatch",
    );
    assert(
      geometryOperation?.id === CARD_ID &&
        JSON.stringify(geometryOperation.geometry) ===
          JSON.stringify({ kind: "rect", ...edit.geometry.newValue }),
      "C10 geometry operation mismatch",
    );
    assert(
      styleOperation?.id === CARD_ID &&
        styleOperation.style.fill === edit.style.newValue.fill &&
        styleOperation.style.stroke === edit.style.newValue.stroke &&
        styleOperation.style.strokeWidth === edit.style.newValue.strokeWidth,
      "C10 style operation mismatch",
    );

    const patchCheck = runPptvJson(
      ["patch", sourcePath, patchPath, "--check"],
      stage,
    );
    assert(
      patchCheck.applied === true &&
        patchCheck.check === true &&
        patchCheck.editCount >= 3,
      "separate C5 patch check did not pass",
    );
    const patchApply = runPptvJson(
      ["patch", sourcePath, patchPath, "--output", recoveredPath],
      stage,
    );
    assert(
      patchApply.applied === true &&
        patchApply.sourceSha256 === (await sha256File(recoveredPath)),
      "separate C5 patch application hash mismatch",
    );
    assert(
      (await sha256File(sourcePath)) === baselineHashes.sourceSha,
      "canonical source mutated during reconciliation/application",
    );
    const recoveredValidation = runPptvJson(["validate", recoveredPath], stage);
    assert(
      recoveredValidation.valid === true &&
        recoveredValidation.diagnostics.length === 0,
      "recovered atom did not independently validate",
    );
    const recoveredTextFit = await runTextFit(
      recoveredPath,
      fontMapPath,
      join(stage, "supported-recovered.text-fit.json"),
      stage,
    );

    const regeneratedCompose = runPptvJson(
      [
        "compose",
        recoveredPath,
        "--placement",
        PLACEMENT.text,
        "--slide-id",
        PLACEMENT.slideId,
        "--policy",
        PLACEMENT.policy,
        "--output",
        regeneratedComposedPath,
      ],
      stage,
    );
    const regeneratedCompile = runPptvJson(
      [
        "compile",
        recoveredPath,
        "--placement",
        PLACEMENT.text,
        "--slide-id",
        PLACEMENT.slideId,
        "--policy",
        PLACEMENT.policy,
        "--output",
        regeneratedPptx,
        "--map",
        regeneratedMapPath,
      ],
      stage,
    );
    const regeneratedHashes = await assertCompileSummary(
      regeneratedCompile,
      recoveredPath,
      regeneratedComposedPath,
      regeneratedPptx,
      regeneratedMapPath,
    );
    assert(
      regeneratedCompose.atomSha256 === regeneratedHashes.sourceSha &&
        regeneratedCompose.composedDeckSha256 === regeneratedHashes.composedSha,
      "recovered C9 composition identity mismatch",
    );
    await assertMap(
      regeneratedMapPath,
      recoveredPath,
      regeneratedComposedPath,
      regeneratedPptx,
    );

    const noOpReportPath = join(stage, "supported-regenerated.reconcile.json");
    const noOpPatchPath = join(stage, ".supported-regenerated.noop.patch.json");
    runPptvJson(
      [
        "reconcile",
        regeneratedPptx,
        "--source",
        recoveredPath,
        "--baseline",
        regeneratedMapPath,
        "--patch",
        noOpPatchPath,
        "--report",
        noOpReportPath,
      ],
      stage,
    );
    assert(
      !(await pathExists(noOpPatchPath)),
      "unchanged regenerated reconciliation unexpectedly wrote a patch",
    );
    const regeneratedReconciliation = await readJson(noOpReportPath);
    assert(
      regeneratedReconciliation.status === "unchanged" &&
        regeneratedReconciliation.changes.length === 0 &&
        regeneratedReconciliation.diagnostics.length === 0,
      "regenerated branch did not independently reconcile unchanged",
    );

    const editedSlide = await zipPartBytes(editedPptx, edit.slidePart);
    const regeneratedSlide = await zipPartBytes(
      regeneratedPptx,
      edit.slidePart,
    );
    assert(
      Buffer.from(editedSlide).equals(Buffer.from(regeneratedSlide)),
      "edited and regenerated slide XML parts are not byte-identical",
    );

    const originalBrowser = await captureBrowser(
      sourcePath,
      "supported-original",
      stage,
    );
    const recoveredBrowser = await captureBrowser(
      recoveredPath,
      "supported-recovered",
      stage,
    );
    assertSameCaptureProfile(
      originalBrowser.evidence,
      recoveredBrowser.evidence,
      "browser",
    );
    const browserChange = await compareCaptures(
      originalBrowser,
      recoveredBrowser,
      "supported-original-vs-recovered.browser.comparison.evidence.json",
      {
        antialiasTolerance: 0,
        maxChangedFraction: 0.2,
        maxMeanAbsoluteError: 32,
        maxChannelDelta: 255,
      },
      stage,
    );
    assertIntentionalComparison(browserChange, "browser");

    const baselineQuickLook = await captureQuickLook(
      baselinePptx,
      "supported-baseline",
      "generated-c9-baseline",
      stage,
    );
    const editedQuickLook = await captureQuickLook(
      editedPptx,
      "supported-edited",
      "trusted-drawingml-supported-edit",
      stage,
    );
    const regeneratedQuickLook = await captureQuickLook(
      regeneratedPptx,
      "supported-regenerated",
      "regenerated-from-recovered-pptv",
      stage,
    );
    assertSameCaptureProfile(
      baselineQuickLook.evidence,
      editedQuickLook.evidence,
      "baseline-to-edited Quick Look",
    );
    assertSameCaptureProfile(
      editedQuickLook.evidence,
      regeneratedQuickLook.evidence,
      "edited-to-regenerated Quick Look",
    );
    const quickLookChange = await compareCaptures(
      baselineQuickLook,
      editedQuickLook,
      "supported-baseline-vs-edited.quicklook.comparison.evidence.json",
      {
        antialiasTolerance: 0,
        maxChangedFraction: 0.2,
        maxMeanAbsoluteError: 32,
        maxChannelDelta: 255,
      },
      stage,
    );
    assertIntentionalComparison(quickLookChange, "Quick Look");
    const exactComparison = await compareCaptures(
      editedQuickLook,
      regeneratedQuickLook,
      "supported-edited-vs-regenerated.quicklook.comparison.evidence.json",
      {
        antialiasTolerance: 0,
        maxChangedFraction: 0,
        maxMeanAbsoluteError: 0,
        maxChannelDelta: 0,
      },
      stage,
    );
    assertExactComparison(exactComparison, "edited-to-regenerated Quick Look");

    const native = await recordNativePowerPointStatus(editedPptx, stage);
    const manifestCount = await validateEvidenceManifests(stage);

    const semanticComparison = {
      schema: "pptv-edited-regenerated-comparison/0.1",
      status: "passed",
      method: [
        "C10 typed apply/C9 regeneration proof",
        "byte-identical mapped slide XML",
        "independent regenerated C10 no-op",
        "same-renderer zero-pixel Quick Look comparison",
      ],
      editedPptxSha256: await sha256File(editedPptx),
      regeneratedPptxSha256: await sha256File(regeneratedPptx),
      packageBytesEqual:
        (await sha256File(editedPptx)) === (await sha256File(regeneratedPptx)),
      slidePart: {
        path: edit.slidePart,
        bytesEqual: true,
        editedSha256: sha256Bytes(editedSlide),
        regeneratedSha256: sha256Bytes(regeneratedSlide),
      },
      reconciliation: {
        editedStatus: reconciliation.status,
        editedReportSha256: await sha256File(reconcileReportPath),
        patchSha256: await sha256File(patchPath),
        regeneratedStatus: regeneratedReconciliation.status,
        regeneratedReportSha256: await sha256File(noOpReportPath),
      },
      quickLook: {
        comparisonEvidenceSha256: exactComparison.evidence_sha256,
        changedPixels: exactComparison.comparison.metrics.changed_pixels,
        changedFraction: exactComparison.comparison.metrics.changed_fraction,
        meanAbsoluteError:
          exactComparison.comparison.metrics.mean_absolute_error,
        maxChannelDelta: exactComparison.comparison.metrics.max_channel_delta,
      },
    };
    await writeJson(
      join(stage, "supported-edited-vs-regenerated.semantic-comparison.json"),
      semanticComparison,
    );

    await rm(regeneratedComposedPath);
    const initialPrivacy = await scanPrivacy(stage);
    const expectedFinalPrivacy = {
      files: initialPrivacy.files + 3,
      pptxPackageMembers: initialPrivacy.pptxPackageMembers,
    };
    const pnpmVersion = run("pnpm", ["--version"], stage).stdout.trim();
    const generationManifest = {
      schema: "office180-pptv-roundtrip-evidence-generation/0.1",
      generatedAt: new Date().toISOString(),
      generator: {
        path: "scripts/generate-pptv-roundtrip-evidence.mjs",
        sha256: await sha256File(
          join(REPO_ROOT, "scripts", "generate-pptv-roundtrip-evidence.mjs"),
        ),
        runtime: {
          node: process.version,
          pnpm: pnpmVersion,
        },
        dependencies: [
          {
            path: "scripts/visual-evidence.py",
            sha256: await sha256File(VISUAL_SCRIPT),
          },
          {
            path: "scripts/capture-browser-svg.mjs",
            sha256: await sha256File(
              join(REPO_ROOT, "scripts", "capture-browser-svg.mjs"),
            ),
          },
          {
            path: "packages/pptv/src/node/pptx-baseline.ts",
            sha256: await sha256File(
              join(REPO_ROOT, "packages/pptv/src/node/pptx-baseline.ts"),
            ),
          },
          {
            path: "packages/pptv/src/node/reconcile.ts",
            sha256: await sha256File(
              join(REPO_ROOT, "packages/pptv/src/node/reconcile.ts"),
            ),
          },
        ],
      },
      source: {
        path: "supported-original.pptv.svg",
        sha256: baselineHashes.sourceSha,
        id: "roundtrip",
        profile: "0.1",
        placement: {
          slideId: PLACEMENT.slideId,
          policy: PLACEMENT.policy,
          x: 200,
          y: 0,
          width: 1200,
          height: 900,
          scale: PLACEMENT.scale,
          translateX: PLACEMENT.translateX,
          translateY: PLACEMENT.translateY,
        },
        font: {
          family: "ABeeZee",
          path: "packages/pptv/test-fixtures/fonts/ABeeZee-Regular.ttf",
          sha256: await sha256File(FONT_FILE),
          licensePath: "packages/pptv/test-fixtures/fonts/OFL.txt",
          licenseSha256: await sha256File(FONT_LICENSE),
          fixtureManifestSha256: await sha256File(FONT_MANIFEST),
        },
      },
      edit,
      c8TextFit: {
        original: originalTextFit.summary,
        recovered: recoveredTextFit.summary,
      },
      c9: {
        baseline: baselineHashes,
        regenerated: regeneratedHashes,
      },
      c10: {
        status: reconciliation.status,
        changeCount: reconciliation.changes.length,
        operationKinds: patch.ops.map((operation) => operation.op),
        regeneratedStatus: regeneratedReconciliation.status,
      },
      comparisons: {
        browserOriginalToRecovered: {
          status: browserChange.comparison.status,
          metrics: browserChange.comparison.metrics,
          changedBounds: browserChange.comparison.changed_bounds,
          expectedEditRegion: EDIT_REGION,
        },
        quickLookBaselineToEdited: {
          status: quickLookChange.comparison.status,
          metrics: quickLookChange.comparison.metrics,
          changedBounds: quickLookChange.comparison.changed_bounds,
          expectedEditRegion: EDIT_REGION,
        },
        quickLookEditedToRegenerated: {
          status: exactComparison.comparison.status,
          metrics: exactComparison.comparison.metrics,
        },
        semantic: semanticComparison,
      },
      nativePowerPoint: {
        status: native.native_lifecycle.status,
        version: native.native_lifecycle.version,
        diagnostic: native.native_lifecycle.diagnostic,
      },
      privacyScan: {
        status: "passed",
        scope:
          "Every durable file, every PPTX member, workstation paths/account metadata, host identity, credential patterns, sensitive environment values, and prohibited public marking strings",
        ...expectedFinalPrivacy,
      },
      c11ManifestCount: manifestCount,
      commands: [
        [
          "node",
          "scripts/generate-pptv-roundtrip-evidence.mjs",
          "--destination",
          "tests/fixtures/roundtrip-evidence/pptv",
        ],
        [
          ".venv/bin/python",
          "scripts/visual-evidence.py",
          "validate",
          "<manifest>",
          "--root",
          "tests/fixtures/roundtrip-evidence/pptv",
        ],
        ["shasum", "-a", "256", "-c", "SHA256SUMS"],
      ],
      limitations: [
        "The representative PPTX edit is a deterministic trusted DrawingML simulation, not a native PowerPoint edit.",
        "Quick Look and browser evidence are renderer-specific and use host fonts.",
        "Native PowerPoint open, edit, save, and reopen remains manual-required or unavailable as recorded.",
        "Package bytes need not match because regenerated lineage binds the recovered source.",
        "No C11 human-review envelope or cross-host fidelity claim is made.",
      ],
      artifacts: await artifactInventory(stage),
    };
    await writeJson(
      join(stage, "generation-manifest.json"),
      generationManifest,
    );

    const readmeInventory = await artifactInventory(
      stage,
      new Set(["README.md", "SHA256SUMS"]),
    );
    await writeNew(
      join(stage, "README.md"),
      readmeText({
        inventory: readmeInventory,
        browserChange,
        quickLookChange,
        exactComparison,
        semanticComparison,
        native,
        privacy: expectedFinalPrivacy,
      }),
    );
    await scanPrivacy(stage);
    await writeSha256Sums(stage);
    const finalPrivacy = await scanPrivacy(stage);
    assert(
      JSON.stringify(finalPrivacy) === JSON.stringify(expectedFinalPrivacy),
      "final privacy scan scope differs from its recorded scope",
    );
    await verifySha256Sums(stage);

    assert(
      !(await pathExists(destination)),
      `destination appeared during generation: ${destination}`,
    );
    await rename(stage, destination);
    published = true;
    return destination;
  } finally {
    if (!published && (await pathExists(stage))) {
      assert(
        dirname(stage) === dirname(destination) &&
          basename(stage).startsWith(".pptv-evidence."),
        "refusing unsafe staging cleanup",
      );
      await rm(stage, { recursive: true });
    }
  }
}

async function main() {
  const { destination } = parseArguments(process.argv.slice(2));
  const published = await generate(destination);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      destination: relativePath(REPO_ROOT, published),
    })}\n`,
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : `unknown error: ${String(error)}`;
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
