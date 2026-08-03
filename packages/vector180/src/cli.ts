#!/usr/bin/env node
/**
 * Reference Node CLI for the Vector180 0.1 source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  loadAtom,
  loadDeck,
  loadVector180Document,
  Vector180LoadError,
} from "./core/deck.js";
import {
  extractVector180Atom,
  VECTOR180_ATOM_DISCOVERY_COMMENT,
} from "./core/extract.js";
import {
  parseManifest,
  STABLE_ID_PATTERN,
  validateManifest,
} from "./core/manifest.js";
import { resolveVector180Deck, resolveVector180Atom } from "./core/resolved.js";
import { scanVector180Source } from "./core/scan.js";
import { hasErrors } from "./core/source.js";
import {
  preflightAtomTextFit,
  preflightDeckTextFit,
  type Vector180AtomTextFitLine,
  type Vector180DeckTextFitLine,
} from "./core/text-fit.js";
import type {
  Diagnostic,
  ProjectionView,
  Vector180Role,
} from "./core/types.js";
import { createEditorPack } from "./node/editor-pack.js";
import {
  createDefaultFontkitTextMeasurer,
  createFontkitTextMeasurer,
  parseFontMap,
  type FontkitFontMap,
  type Vector180DefaultFontEnvironmentEvidence,
} from "./node/fontkit-text-measurer.js";
import {
  readBytesPath,
  readJsonPath,
  readVector180Path,
  writeFileAtomic,
  writeFilesAtomicExclusive,
} from "./node/io.js";
import {
  composeVector180AtomDeck,
  compileVector180PptxBaseline,
  Vector180PptxBaselineCompileError,
  type Vector180Placement,
  type Vector180PptxMap,
} from "./node/pptx-baseline.js";
import {
  compilePptxCanary,
  PptxCanaryCompileError,
} from "./node/pptx-canary.js";
import {
  parseVector180ReconcileResolution,
  Vector180ReconcileResolutionError,
  type Vector180ReconcileResolution,
} from "./node/reconcile-resolution.js";
import { reconcileVector180Pptx } from "./node/reconcile.js";
import { applyPatch } from "./ops/patch.js";
import { compareAtomMetadata, projectAtomMetadata } from "./ops/metadata.js";
import { migratePptvAtom } from "./ops/migrate.js";
import { diffVector180Inputs } from "./ops/source-diff.js";
import {
  extractAtomText,
  extractText,
  getAtom,
  getAtomObject,
  getObject,
  getSlide,
  outlineAtom,
  outlineManifest,
  queryAtomObjects,
  queryObjects,
  type Vector180AtomQuery,
} from "./ops/projections.js";

type OutputFormat = "text" | "json" | "jsonl";
type OptionKind = "flag" | "value";

interface ParsedArguments {
  positionals: string[];
  options: Map<string, string | true>;
}

export interface CliEnvironment {
  stdout(text: string): void;
  stderr(text: string): void;
}

const DEFAULT_ENVIRONMENT: CliEnvironment = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export async function runCli(
  argv: readonly string[],
  environment: CliEnvironment = DEFAULT_ENVIRONMENT,
): Promise<number> {
  const command = argv[0];
  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    environment.stdout(helpText());
    return 0;
  }
  const scopedHelp = commandHelpText(argv);
  if (scopedHelp !== undefined) {
    environment.stdout(scopedHelp);
    return 0;
  }

  try {
    if (command === "new") return await runNew(argv.slice(1), environment);
    if (command === "metadata")
      return await runMetadata(argv.slice(1), environment);
    if (command === "metadata-compare")
      return await runMetadataCompare(argv.slice(1), environment);
    if (command === "diff") return await runDiff(argv.slice(1), environment);
    if (command === "migrate")
      return await runMigrate(argv.slice(1), environment);
    if (command === "outline")
      return await runOutline(argv.slice(1), environment);
    if (command === "validate")
      return await runValidate(argv.slice(1), environment);
    if (command === "resolve")
      return await runResolve(argv.slice(1), environment);
    if (command === "extract")
      return await runExtract(argv.slice(1), environment);
    if (command === "editor-pack")
      return await runEditorPack(argv.slice(1), environment);
    if (command === "pptx-canary")
      return await runPptxCanary(argv.slice(1), environment);
    if (command === "compose")
      return await runCompose(argv.slice(1), environment);
    if (command === "compile")
      return await runCompile(argv.slice(1), environment);
    if (command === "reconcile")
      return await runReconcile(argv.slice(1), environment);
    if (command === "text-fit")
      return await runTextFit(argv.slice(1), environment);
    if (command === "text") return await runText(argv.slice(1), environment);
    if (command === "show") return await runShow(argv.slice(1), environment);
    if (command === "list") return await runList(argv.slice(1), environment);
    if (command === "patch") return await runPatch(argv.slice(1), environment);
    environment.stderr(`Unknown command "${command}".\n\n${helpText()}`);
    return 2;
  } catch (error) {
    if (error instanceof InvocationError) {
      environment.stderr(`${error.message}\n`);
      return 2;
    }
    if (error instanceof Vector180LoadError) {
      writeDiagnostics(error.diagnostics, readErrorFormat(argv), environment);
      return 1;
    }
    if (isDefaultFontIntegrityError(error)) {
      writeDiagnostics(
        [
          {
            code: error.code,
            severity: "error",
            message: error.message,
          },
        ],
        readErrorFormat(argv),
        environment,
      );
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    environment.stderr(`Vector180 environment failure: ${message}\n`);
    return 3;
  }
}

async function runNew(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const kind = args[0];
  if (kind === "atom") {
    const parsedArgs = parseArguments(
      args.slice(1),
      {
        "--output": "value",
        "--id": "value",
        "--title": "value",
        "--width": "value",
        "--height": "value",
      },
      0,
      "new atom accepts options only",
    );
    const output = requiredOption(parsedArgs, "--output", "new atom");
    const id = requiredOption(parsedArgs, "--id", "new atom");
    const title = requiredOption(parsedArgs, "--title", "new atom");
    if (
      !STABLE_ID_PATTERN.test(id) ||
      !STABLE_ID_PATTERN.test(`${id}.background`) ||
      !STABLE_ID_PATTERN.test(`${id}.title`)
    ) {
      throw new InvocationError(
        "--id must be a stable ID whose derived .background and .title IDs remain valid",
      );
    }
    const widthOption = readOption(parsedArgs, "--width");
    const heightOption = readOption(parsedArgs, "--height");
    if ((widthOption === undefined) !== (heightOption === undefined)) {
      throw new InvocationError(
        "new atom requires --width and --height to be supplied together",
      );
    }
    const width = readPositiveDimension(parsedArgs, "--width", 1600);
    const height = readPositiveDimension(parsedArgs, "--height", 900);
    const sourceText = renderNewAtom(id, title, width, height);
    const atom = await loadAtom({
      kind: "text",
      text: sourceText,
      name: output,
    });
    if (hasErrors(atom.diagnostics)) {
      throw new Error(
        "Internal new-atom scaffold failed canonical validation.",
      );
    }
    await writeExclusive(output, sourceText, "new atom");
    environment.stdout(`wrote ${output} (${atom.source.sha256})\n`);
    return 0;
  }
  if (kind === "deck") {
    const parsedArgs = parseArguments(
      args.slice(1),
      { "--output": "value", "--title": "value" },
      0,
      "new deck accepts options only",
    );
    const output = requiredOption(parsedArgs, "--output", "new deck");
    const title = requiredOption(parsedArgs, "--title", "new deck");
    const runtime = await readFile(
      new URL("../assets/vector180-browser-0.1.script.html", import.meta.url),
      "utf8",
    );
    const sourceText = renderNewDeck(title, runtime);
    const deck = await loadDeck({
      kind: "text",
      text: sourceText,
      name: output,
    });
    if (hasErrors(deck.diagnostics)) {
      throw new Error(
        `Internal new-deck scaffold failed canonical validation: ${deck.diagnostics
          .map((diagnostic) => diagnostic.code)
          .join(", ")}`,
      );
    }
    await writeExclusive(output, sourceText, "new deck");
    environment.stdout(`wrote ${output} (${deck.source.sha256})\n`);
    return 0;
  }
  throw new InvocationError('new requires subcommand "atom" or "deck"');
}

async function runMetadata(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--format": "value" },
    1,
    "metadata requires exactly one atom path",
  );
  const format = readFormat(parsedArgs, ["text", "json"]);
  const atom = await loadAtom(
    await readVector180Path(parsedArgs.positionals[0]!),
  );
  const inspection = await projectAtomMetadata(atom);
  if (format === "json") writeJson(inspection, environment);
  else {
    environment.stdout(
      `${inspection.atomId}\t${inspection.metadataStatus}\t${inspection.templateLineageStatus}` +
        `${inspection.stylePaletteSha256 === undefined ? "" : `\t${inspection.stylePaletteSha256}`}\n`,
    );
  }
  return hasErrors(inspection.diagnostics) ? 1 : 0;
}

async function runMetadataCompare(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--template-basis": "value", "--format": "value" },
    2,
    "metadata-compare requires exactly two atom paths",
  );
  const format = readFormat(parsedArgs, ["text", "json"]);
  const basisPath = readOption(parsedArgs, "--template-basis");
  const [left, right, templateBasisBytes] = await Promise.all([
    loadAtom(await readVector180Path(parsedArgs.positionals[0]!)),
    loadAtom(await readVector180Path(parsedArgs.positionals[1]!)),
    basisPath === undefined
      ? Promise.resolve(undefined)
      : readBytesPath(basisPath),
  ]);
  const comparison = await compareAtomMetadata(left, right, {
    ...(templateBasisBytes === undefined ? {} : { templateBasisBytes }),
  });
  if (format === "json") writeJson(comparison, environment);
  else environment.stdout(`${comparison.classification}\n`);
  return hasErrors(comparison.diagnostics) ? 1 : 0;
}

async function runDiff(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--output": "value", "--format": "value" },
    2,
    "diff requires exactly two atom paths",
  );
  const format = readFormat(parsedArgs, ["text", "json"]);
  const [left, right] = await Promise.all([
    readVector180Path(parsedArgs.positionals[0]!),
    readVector180Path(parsedArgs.positionals[1]!),
  ]);
  const report = await diffVector180Inputs(left, right);
  const output = readOption(parsedArgs, "--output");
  if (output !== undefined) {
    await writeExclusive(
      output,
      `${JSON.stringify(report, null, 2)}\n`,
      "diff",
    );
  }
  if (format === "json") writeJson(report, environment);
  else {
    environment.stdout(
      `${report.classification}: ${report.summary.total} changes` +
        `${output === undefined ? "" : `; wrote ${output}`}\n`,
    );
  }
  return report.classification === "incomparable" ? 1 : 0;
}

async function runMigrate(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--output": "value", "--report": "value", "--format": "value" },
    1,
    "migrate requires exactly one legacy PPTV atom path",
  );
  const format = readFormat(parsedArgs, ["text", "json"]);
  const output = requiredOption(parsedArgs, "--output", "migrate");
  const reportPath = readOption(parsedArgs, "--report");
  if (reportPath !== undefined && resolve(reportPath) === resolve(output)) {
    throw new InvocationError(
      "migrate --output and --report destinations must be distinct",
    );
  }
  const result = await migratePptvAtom(
    await readVector180Path(parsedArgs.positionals[0]!),
  );
  if (
    result.status !== "migrated" ||
    result.sourceText === undefined ||
    result.report === undefined
  ) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  const entries = [
    { path: output, contents: result.sourceText },
    ...(reportPath === undefined
      ? []
      : [
          {
            path: reportPath,
            contents: `${JSON.stringify(result.report, null, 2)}\n`,
          },
        ]),
  ];
  try {
    await writeFilesAtomicExclusive(entries);
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new InvocationError(
        "migrate refuses to overwrite an existing output or report",
      );
    }
    throw error;
  }
  if (format === "json") {
    writeJson(
      {
        schema: "vector180-migrate-result/0.1",
        output,
        ...(reportPath === undefined ? {} : { report: reportPath }),
        sourceSha256: result.sourceSha256,
        semanticComparison: result.report.semanticComparison,
      },
      environment,
    );
  } else {
    environment.stdout(
      `wrote ${output}${reportPath === undefined ? "" : ` and ${reportPath}`}\n`,
    );
  }
  return 0;
}

function renderNewAtom(
  id: string,
  title: string,
  width: number,
  height: number,
): string {
  const margin = width / 16;
  const titleHeight = Math.min(height / 4, 160);
  const titleY = margin + titleHeight * 0.7;
  const lineStep = Math.max(1, titleHeight * 0.6);
  const fontSize = Math.max(1, Math.min(64, titleHeight * 0.5));
  return [
    VECTOR180_ATOM_DISCOVERY_COMMENT,
    `<svg xmlns="http://www.w3.org/2000/svg" data-vector180-version="0.1"`,
    `  id="${xmlAttribute(id)}" viewBox="0 0 ${canonicalNumber(width)} ${canonicalNumber(height)}">`,
    '  <metadata data-vector180-metadata="vector180-atom-metadata/0.1">{"styleFamily":{"id":"office180.vector180.default","version":"1.0"}}</metadata>',
    `  <rect id="${xmlAttribute(`${id}.background`)}" data-vector180-role="shape" data-vector180-export="native"`,
    `    x="0" y="0" width="${canonicalNumber(width)}" height="${canonicalNumber(height)}"`,
    '    fill="#ffffff" stroke="none"/>',
    `  <text id="${xmlAttribute(`${id}.title`)}" data-vector180-role="text" data-vector180-export="native"`,
    `    data-vector180-frame="${canonicalNumber(margin)} ${canonicalNumber(margin)} ${canonicalNumber(width - 2 * margin)} ${canonicalNumber(titleHeight)}"`,
    `    data-vector180-line-step="${canonicalNumber(lineStep)}"`,
    `    x="${canonicalNumber(margin)}" y="${canonicalNumber(titleY)}"`,
    `    fill="#17211e" stroke="none" font-family="ABeeZee" font-size="${canonicalNumber(fontSize)}"`,
    `    font-weight="400" font-style="normal" text-anchor="start">${xmlText(title)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

function renderNewDeck(title: string, runtime: string): string {
  const manifest = safeJsonScriptText({
    vector180: "0.1",
    title,
    runtime: "vector180-browser/0.1",
    theme: "default",
    slides: ["cover"],
    agentProfile: "vector180-agent/1",
  });
  return [
    "<!doctype html>",
    '<html lang="en" data-vector180-version="0.1">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="vector180-agent-profile" content="vector180-agent/1">',
    `  <title>${htmlText(title)}</title>`,
    "</head>",
    "<body>",
    "",
    '<script id="vector180-manifest" type="application/vnd.office180.vector180+json">',
    manifest,
    "</script>",
    "",
    "<main data-vector180-output></main>",
    "",
    '<template data-vector180-slide="cover">',
    '  <svg id="cover" viewBox="0 0 1600 900" data-vector180-layout="title" xmlns="http://www.w3.org/2000/svg">',
    '    <rect id="cover.background" class="slide-background" data-vector180-role="shape" data-vector180-export="native" x="0" y="0" width="1600" height="900"/>',
    '    <text id="cover.title" class="cover-title" data-vector180-role="text" data-vector180-export="native"',
    '      data-vector180-frame="120 280 1360 160" data-vector180-line-step="80"',
    `      x="120" y="390">${xmlText(title)}</text>`,
    "  </svg>",
    "</template>",
    "",
    '<script type="text/css" data-vector180-style="base">',
    ".slide-background { fill: var(--vector180-background); }",
    ".cover-title {",
    "  fill: var(--vector180-text-primary);",
    "  font-family: var(--vector180-font-major);",
    "  font-size: 64px;",
    "  font-weight: 400;",
    "}",
    "</script>",
    "",
    '<script type="text/css" data-vector180-theme="default">',
    ":root {",
    "  --vector180-background: #ffffff;",
    "  --vector180-text-primary: #17211e;",
    "  --vector180-font-major: ABeeZee;",
    "}",
    "</script>",
    "",
    runtime.trimEnd(),
    "",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

async function runReconcile(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--source": "value",
      "--baseline": "value",
      "--native-baseline": "value",
      "--resolution": "value",
      "--patch": "value",
      "--report": "value",
      "--format": "value",
    },
    1,
    "reconcile requires exactly one edited PPTX path",
  );
  const editedPath = parsedArgs.positionals[0]!;
  const sourcePath = readOption(parsedArgs, "--source");
  const baselinePath = readOption(parsedArgs, "--baseline");
  const nativeBaselinePath = readOption(parsedArgs, "--native-baseline");
  const resolutionPath = readOption(parsedArgs, "--resolution");
  const patchOutput = readOption(parsedArgs, "--patch");
  const reportOutput = readOption(parsedArgs, "--report");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (
    sourcePath === undefined ||
    baselinePath === undefined ||
    patchOutput === undefined ||
    reportOutput === undefined
  ) {
    throw new InvocationError(
      "reconcile requires explicit --source, --baseline, --patch, and --report paths",
    );
  }
  if (resolve(patchOutput) === resolve(reportOutput)) {
    throw new InvocationError(
      "reconcile --patch and --report destinations must be distinct",
    );
  }
  if (
    resolutionPath !== undefined &&
    (resolve(resolutionPath) === resolve(patchOutput) ||
      resolve(resolutionPath) === resolve(reportOutput))
  ) {
    throw new InvocationError(
      "reconcile --resolution input must be distinct from --patch and --report destinations",
    );
  }

  let baselineInput: unknown;
  try {
    baselineInput = await readJsonPath(baselinePath);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvocationError(`Invalid baseline map JSON: ${error.message}`);
    }
    throw error;
  }
  let resolutionInput: Vector180ReconcileResolution | undefined;
  if (resolutionPath !== undefined) {
    try {
      resolutionInput = parseVector180ReconcileResolution(
        await readJsonPath(resolutionPath),
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new InvocationError(
          `Invalid reconciliation resolution JSON: ${error.message}`,
        );
      }
      if (error instanceof Vector180ReconcileResolutionError) {
        throw new InvocationError(
          `Invalid reconciliation resolution: ${error.message}`,
        );
      }
      throw error;
    }
  }
  const [source, editedPptxBytes, nativeBaselinePptxBytes] = await Promise.all([
    loadVector180Document(await readVector180Path(sourcePath)),
    readBytesPath(editedPath),
    nativeBaselinePath === undefined
      ? Promise.resolve(undefined)
      : readBytesPath(nativeBaselinePath),
  ]);
  const result = await reconcileVector180Pptx(
    source,
    baselineInput as Vector180PptxMap,
    editedPptxBytes,
    {
      ...(nativeBaselinePptxBytes === undefined
        ? {}
        : { nativeBaselinePptxBytes }),
      ...(resolutionInput === undefined ? {} : { resolution: resolutionInput }),
    },
  );
  const patchPublished =
    result.status === "patchable" && result.patch !== undefined;
  const entries = [
    {
      path: reportOutput,
      contents: `${JSON.stringify(result, null, 2)}\n`,
    },
    ...(patchPublished
      ? [
          {
            path: patchOutput,
            contents: `${JSON.stringify(result.patch, null, 2)}\n`,
          },
        ]
      : []),
  ];
  try {
    await writeFilesAtomicExclusive(entries);
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
    writeDiagnostics(
      [
        {
          code: "VECTOR180-RECONCILE-EXISTS",
          severity: "error",
          message:
            "reconcile refuses to overwrite an existing report or patch destination.",
        },
      ],
      format,
      environment,
    );
    return 1;
  }

  if (format === "json") {
    writeJson(
      {
        schema: "vector180-reconcile-result/0.1",
        reportSchema: result.schema,
        status: result.status,
        report: reportOutput,
        ...(patchPublished ? { patch: patchOutput } : {}),
        resolutionProvided: resolutionInput !== undefined,
        resolutionAccepted:
          resolutionInput !== undefined &&
          patchPublished &&
          result.patch?.schema === "vector180-patch/0.1",
        sourceSha256: result.sourceSha256,
        baselineMapSha256: result.baselineMapSha256,
        editedPptxSha256: result.editedPptxSha256,
        ...(result.nativeBaselinePptxSha256 === undefined
          ? {}
          : {
              nativeBaselinePptxSha256: result.nativeBaselinePptxSha256,
            }),
        changeCount: result.changes.length,
        findingCount: result.findings.length,
        candidateOperationCount: result.candidateOperations.length,
        summary: result.summary,
        diagnostics: result.diagnostics,
      },
      environment,
    );
  } else {
    environment.stdout(
      `reconciliation ${result.status}: wrote ${reportOutput}${patchPublished ? ` and ${patchOutput}` : ""} (${result.changes.length} changes, ${result.findings.length} findings, ${result.summary.candidateOperationCount} candidates, ${result.summary.blockedOperationCount} blocked)\n`,
    );
  }
  return result.status === "unchanged" || patchPublished ? 0 : 1;
}

async function runOutline(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--format": "value" },
    1,
    "outline requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"]);
  const input = await readVector180Path(path);
  const scan = await scanVector180Source(input);
  if (scan.kind === "svg") {
    const document = await loadVector180Document(input);
    if (document.sourceKind !== "svg") {
      throw new Error("SVG scan did not load as a standalone diagram.");
    }
    if (hasErrors(document.diagnostics)) {
      writeDiagnostics(document.diagnostics, format, environment);
      return 1;
    }
    const outline = outlineAtom(document);
    if (format === "json") writeJson(outline, environment);
    else {
      environment.stdout(
        `${outline.atomId}\nviewBox: ${outline.viewBox.join(" ")}\n`,
      );
    }
    return 0;
  }
  const parsed = parseManifest(scan);
  const diagnostics = [
    ...scan.diagnostics,
    ...parsed.diagnostics,
    ...(parsed.manifest === undefined
      ? []
      : validateManifest(parsed.manifest, scan)),
  ];
  if (parsed.manifest === undefined || hasErrors(diagnostics)) {
    writeDiagnostics(diagnostics, format, environment);
    return 1;
  }
  const outline = outlineManifest(parsed.manifest, scan.wireFamily!);
  if (format === "json") {
    writeJson(outline, environment);
  } else {
    const lines = [
      outline.title ?? path,
      ...(outline.activeTheme === undefined
        ? []
        : [`theme: ${outline.activeTheme}`]),
      "",
      ...outline.slides.map(
        (slide, index) =>
          `${index + 1} ${slide.id}${slide.hidden ? " (hidden)" : ""}`,
      ),
    ];
    environment.stdout(`${lines.join("\n")}\n`);
  }
  return 0;
}

async function runValidate(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--format": "value" },
    1,
    "validate requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"]);
  const document = await loadVector180Document(await readVector180Path(path));
  if (format === "json") {
    if (document.sourceKind === "html") {
      writeJson(
        {
          schema: "vector180-validation/0.1",
          wireFamily: document.wireFamily,
          valid: !hasErrors(document.diagnostics),
          sourceSha256: document.source.sha256,
          diagnostics: document.diagnostics,
        },
        environment,
      );
    } else {
      writeJson(
        {
          schema: "vector180-atom-validation/0.1",
          wireFamily: document.wireFamily,
          valid: !hasErrors(document.diagnostics),
          sourceSha256: document.source.sha256,
          atomId: document.id,
          diagnostics: document.diagnostics,
        },
        environment,
      );
    }
  } else if (document.diagnostics.length === 0) {
    environment.stdout(
      document.sourceKind === "html"
        ? `valid ${path} (${document.slideOrder.length} slides)\n`
        : `valid ${path} (diagram ${document.id})\n`,
    );
  } else {
    writeDiagnostics(document.diagnostics, format, environment);
  }
  return hasErrors(document.diagnostics) ? 1 : 0;
}

async function runEditorPack(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--output": "value",
      "--font-map": "value",
      "--near-limit": "value",
      "--format": "value",
    },
    1,
    "editor-pack requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const fontMapPath = readOption(parsedArgs, "--font-map");
  const nearLimit = readNearLimit(parsedArgs);
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined) {
    throw new InvocationError("editor-pack requires an explicit --output PATH");
  }
  const fontMap =
    fontMapPath === undefined || fontMapPath === "default"
      ? undefined
      : await loadFontMap(fontMapPath);

  const result = await createEditorPack(await readVector180Path(path), {
    ...(fontMap === undefined ? {} : { fontFaces: fontMap.faces }),
    ...(nearLimit === undefined ? {} : { nearLimit }),
  });
  if (result.html === undefined || result.sourceSha256 === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  await writeFileAtomic(output, result.html);

  if (format === "json") {
    writeJson(
      {
        schema: "vector180-editor-pack-result/0.1",
        output,
        ...(result.documentKind === undefined
          ? {}
          : { documentKind: result.documentKind }),
        sourceSha256: result.sourceSha256,
        ...(result.fontEnvironment === undefined
          ? {}
          : { fontEnvironment: result.fontEnvironment }),
        diagnostics: result.diagnostics,
      },
      environment,
    );
  } else {
    environment.stdout(
      `wrote ${output} (trusted editor wrapper for ${result.sourceSha256})\n`,
    );
    if (result.fontEnvironment !== undefined) {
      writeDefaultFontEnvironment(result.fontEnvironment, environment);
    }
  }
  return 0;
}

async function runResolve(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--format": "value" },
    1,
    "resolve requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"], "json");
  const document = await loadVector180Document(await readVector180Path(path));
  const result =
    document.sourceKind === "html"
      ? resolveVector180Deck(document)
      : resolveVector180Atom(document);
  if (result.model === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  if (format === "json") {
    writeJson(result.model, environment);
  } else {
    environment.stdout(
      result.model.schema === "vector180-resolved-deck/0.1"
        ? `resolved ${path} (${result.model.slides.length} slides, ${result.model.sourceSha256})\n`
        : `resolved ${path} (diagram ${result.model.atomId}, ${result.model.sourceSha256})\n`,
    );
  }
  return 0;
}

async function runExtract(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--slide": "value", "--output": "value", "--format": "value" },
    1,
    "extract requires exactly one Vector180 deck path",
  );
  const path = parsedArgs.positionals[0]!;
  const slideId = readOption(parsedArgs, "--slide");
  const output = readOption(parsedArgs, "--output");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (slideId === undefined) {
    throw new InvocationError("extract requires an explicit --slide ID");
  }
  if (output === undefined) {
    throw new InvocationError("extract requires an explicit --output PATH");
  }

  const deck = await loadDeck(await readVector180Path(path));
  const result = await extractVector180Atom(deck, slideId);
  if (
    result.sourceText === undefined ||
    result.sourceSha256 === undefined ||
    result.provenance === undefined
  ) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  try {
    await writeFileAtomic(output, result.sourceText, { overwrite: false });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new InvocationError(
        `extract refuses to overwrite existing output "${output}".`,
      );
    }
    throw error;
  }

  if (format === "json") {
    writeJson(
      {
        schema: "vector180-atom-extraction-result/0.1",
        output,
        sourceSha256: result.sourceSha256,
        provenance: result.provenance,
        diagnostics: result.diagnostics,
      },
      environment,
    );
  } else {
    environment.stdout(
      `wrote ${output} (atom ${result.sourceSha256}, hydrated ${result.provenance.sourceObjectId} from ${result.provenance.sourceSha256})\n`,
    );
  }
  return 0;
}

async function runPptxCanary(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--output": "value", "--format": "value" },
    1,
    "pptx-canary requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined) {
    throw new InvocationError("pptx-canary requires an explicit --output PATH");
  }

  const deck = await loadDeck(await readVector180Path(path));
  const resolved = resolveVector180Deck(deck);
  try {
    const artifact = await compilePptxCanary(resolved);
    await writeFileAtomic(output, artifact.bytes);
    if (format === "json") {
      writeJson(
        {
          schema: "vector180-pptx-canary-result/0.1",
          output,
          sourceSha256: artifact.sourceSha256,
          partCount: artifact.parts.length,
          diagnostics: resolved.diagnostics,
        },
        environment,
      );
    } else {
      environment.stdout(
        `wrote ${output} (${artifact.parts.length} deterministic PPTX parts, ${artifact.sourceSha256})\n`,
      );
    }
    return 0;
  } catch (error) {
    if (!(error instanceof PptxCanaryCompileError)) throw error;
    writeDiagnostics(
      [
        ...resolved.diagnostics,
        {
          code: error.code,
          severity: "error",
          message: error.message,
        },
      ],
      format,
      environment,
    );
    return 1;
  }
}

async function runCompile(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--output": "value",
      "--map": "value",
      "--placement": "value",
      "--slide-id": "value",
      "--policy": "value",
      "--format": "value",
    },
    1,
    "compile requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const mapOutput = readOption(parsedArgs, "--map");
  const placementText = readOption(parsedArgs, "--placement");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (
    output === undefined ||
    mapOutput === undefined ||
    placementText === undefined
  ) {
    throw new InvocationError(
      "compile requires explicit --placement X,Y,W,H, --output PATH, and --map PATH",
    );
  }
  if (resolve(output) === resolve(mapOutput)) {
    throw new InvocationError(
      "compile --output and --map destinations must be distinct",
    );
  }

  const document = await loadVector180Document(await readVector180Path(path));
  const policy = readPlacementPolicy(parsedArgs);
  const placement = parsePlacement(
    placementText,
    readOption(parsedArgs, "--slide-id") ??
      (document.sourceKind === "svg" ? document.id : "slide"),
    policy,
  );
  try {
    const artifact = await compileVector180PptxBaseline(document, {
      placement,
    });
    try {
      await writeFilesAtomicExclusive([
        { path: output, contents: artifact.pptxBytes },
        { path: mapOutput, contents: artifact.mapText },
      ]);
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      writeDiagnostics(
        [
          {
            code: "VECTOR180-BASELINE-EXISTS",
            severity: "error",
            message:
              "compile refuses to overwrite an existing PPTX or sidecar-map destination.",
          },
        ],
        format,
        environment,
      );
      return 1;
    }

    if (format === "json") {
      writeJson(
        {
          schema: "vector180-pptx-baseline-result/0.1",
          output,
          map: mapOutput,
          atomSha256: artifact.map.source.sha256,
          composedDeckSha256: artifact.map.composition.composedDeckSha256,
          pptxSha256: artifact.pptxSha256,
          mapSha256: artifact.mapSha256,
          partCount: artifact.map.pptx.partNames.length,
          objectCount: artifact.map.slides[0]?.objects.length ?? 0,
          placement: artifact.map.composition.placement,
          diagnostics: artifact.diagnostics,
        },
        environment,
      );
    } else {
      environment.stdout(
        `wrote ${output} and ${mapOutput} (${artifact.map.slides[0]?.objects.length ?? 0} native objects, ${artifact.pptxSha256})\n`,
      );
    }
    return 0;
  } catch (error) {
    if (!(error instanceof Vector180PptxBaselineCompileError)) throw error;
    writeDiagnostics(
      [
        ...document.diagnostics,
        {
          code: error.code,
          severity: "error",
          message: error.message,
        },
      ],
      format,
      environment,
    );
    return 1;
  }
}

async function runCompose(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--output": "value",
      "--placement": "value",
      "--slide-id": "value",
      "--policy": "value",
      "--format": "value",
    },
    1,
    "compose requires exactly one standalone Vector180 atom path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const placementText = readOption(parsedArgs, "--placement");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined || placementText === undefined) {
    throw new InvocationError(
      "compose requires explicit --placement X,Y,W,H and --output PATH",
    );
  }
  const document = await loadVector180Document(await readVector180Path(path));
  if (document.sourceKind !== "svg") {
    writeDiagnostics(
      [
        ...document.diagnostics,
        {
          code: "VECTOR180-BASELINE-UNSUPPORTED",
          severity: "error",
          message: "compose accepts one standalone .vector180.svg atom only.",
        },
      ],
      format,
      environment,
    );
    return 1;
  }
  const placement = parsePlacement(
    placementText,
    readOption(parsedArgs, "--slide-id") ?? document.id,
    readPlacementPolicy(parsedArgs),
  );
  try {
    const artifact = await composeVector180AtomDeck(document, placement);
    try {
      await writeFileAtomic(output, artifact.sourceText, { overwrite: false });
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      writeDiagnostics(
        [
          {
            code: "VECTOR180-BASELINE-EXISTS",
            severity: "error",
            message:
              "compose refuses to overwrite an existing deck destination.",
          },
        ],
        format,
        environment,
      );
      return 1;
    }

    if (format === "json") {
      writeJson(
        {
          schema: "vector180-compose-result/0.1",
          output,
          atomSha256: document.source.sha256,
          composedDeckSha256: artifact.sourceSha256,
          placement: artifact.placement,
          transform: {
            scale: artifact.scale,
            translateX: artifact.translateX,
            translateY: artifact.translateY,
          },
          diagnostics: artifact.diagnostics,
        },
        environment,
      );
    } else {
      environment.stdout(
        `wrote ${output} (one-slide deck ${artifact.sourceSha256}, scale ${artifact.scale})\n`,
      );
    }
    return 0;
  } catch (error) {
    if (!(error instanceof Vector180PptxBaselineCompileError)) throw error;
    writeDiagnostics(
      [
        ...document.diagnostics,
        {
          code: error.code,
          severity: "error",
          message: error.message,
        },
      ],
      format,
      environment,
    );
    return 1;
  }
}

function parsePlacement(
  value: string,
  slideId: string,
  policy: Vector180Placement["policy"],
): Vector180Placement {
  const fields = value.split(",");
  if (
    fields.length !== 4 ||
    fields.some((field) => field.trim().length === 0)
  ) {
    throw new InvocationError(
      "--placement requires exactly four comma-separated numbers: X,Y,W,H",
    );
  }
  const [x, y, width, height] = fields.map((field) => Number(field.trim())) as [
    number,
    number,
    number,
    number,
  ];
  if (![x, y, width, height].every(Number.isFinite)) {
    throw new InvocationError(
      "--placement requires four finite comma-separated numbers",
    );
  }
  return { slideId, x, y, width, height, policy };
}

function readPlacementPolicy(
  parsedArgs: ParsedArguments,
): Vector180Placement["policy"] {
  const policy = readOption(parsedArgs, "--policy") ?? "identity";
  if (policy !== "identity" && policy !== "uniform-scale-translate") {
    throw new InvocationError(
      '--policy must be "identity" or "uniform-scale-translate"',
    );
  }
  return policy;
}

async function runTextFit(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--font-map": "value",
      "--near-limit": "value",
      "--format": "value",
    },
    1,
    "text-fit requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const fontMapPath = readOption(parsedArgs, "--font-map");
  const format = readFormat(parsedArgs, ["text", "json"]);
  const nearLimit = readNearLimit(parsedArgs);

  const document = await loadVector180Document(await readVector180Path(path));
  const resolved =
    document.sourceKind === "html"
      ? resolveVector180Deck(document)
      : resolveVector180Atom(document);
  if (resolved.model === undefined) {
    writeDiagnostics(resolved.diagnostics, format, environment);
    return 1;
  }

  const measurer =
    fontMapPath === undefined || fontMapPath === "default"
      ? await createDefaultFontkitTextMeasurer()
      : await createFontkitTextMeasurer((await loadFontMap(fontMapPath)).faces);
  const result =
    resolved.model.schema === "vector180-resolved-deck/0.1"
      ? preflightDeckTextFit(resolved.model, measurer, {
          ...(nearLimit === undefined ? {} : { nearLimit }),
        })
      : preflightAtomTextFit(resolved.model, measurer, {
          ...(nearLimit === undefined ? {} : { nearLimit }),
        });

  if (format === "json") {
    writeJson(
      {
        ...result,
        ...(measurer.defaultEnvironment === undefined
          ? {}
          : { fontEnvironment: measurer.defaultEnvironment }),
      },
      environment,
    );
  } else {
    if (measurer.defaultEnvironment !== undefined) {
      writeDefaultFontEnvironment(measurer.defaultEnvironment, environment);
    }
    writeTextFit(result.lines, result.summary, environment);
  }
  return result.summary.overflow > 0 || result.summary.unverified > 0 ? 1 : 0;
}

async function runText(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--slide": "value",
      "--format": "value",
      "--include-hidden": "flag",
    },
    1,
    "text requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const slide = readOption(parsedArgs, "--slide");
  const format = readFormat(parsedArgs, ["text", "json", "jsonl"]);
  const document = await loadVector180Document(await readVector180Path(path));
  if (hasErrors(document.diagnostics)) {
    writeDiagnostics(document.diagnostics, format, environment);
    return 1;
  }
  if (document.sourceKind === "svg" && slide !== undefined) {
    throw new InvocationError(
      'text option "--slide" is deck-only; standalone diagrams have no slides.',
    );
  }
  if (
    document.sourceKind === "svg" &&
    hasFlag(parsedArgs, "--include-hidden")
  ) {
    throw new InvocationError(
      'text option "--include-hidden" is deck-only; standalone diagrams have no hidden slides.',
    );
  }
  const projection =
    document.sourceKind === "html"
      ? extractText(document, {
          ...(slide === undefined ? {} : { slideId: slide }),
          includeHidden: hasFlag(parsedArgs, "--include-hidden"),
        })
      : extractAtomText(document);
  if (format === "json") writeJson(projection, environment);
  else if (format === "jsonl") {
    for (const entry of projection.entries)
      environment.stdout(`${JSON.stringify(entry)}\n`);
  } else {
    for (const entry of projection.entries) {
      const scopeId = "slideId" in entry ? entry.slideId : entry.atomId;
      environment.stdout(`${scopeId}\t${entry.objectId}\t${entry.text}\n`);
    }
  }
  return 0;
}

async function runShow(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--view": "value", "--format": "value" },
    2,
    "show requires exactly one Vector180 path and one stable ID",
  );
  const path = parsedArgs.positionals[0]!;
  const id = parsedArgs.positionals[1]!;
  const format = readFormat(parsedArgs, ["json"], "json");
  const view = readView(parsedArgs);
  const document = await loadVector180Document(await readVector180Path(path));
  if (hasErrors(document.diagnostics)) {
    writeDiagnostics(document.diagnostics, format, environment);
    return 1;
  }
  const projection =
    document.sourceKind === "html"
      ? (getSlide(document, id, view) ?? getObject(document, id, view))
      : id === document.id
        ? getAtom(document, view)
        : getAtomObject(document, id, view);
  if (projection === undefined) {
    writeDiagnostics(
      [
        {
          code: "VECTOR180-QUERY-NOT-FOUND",
          severity: "error",
          message:
            document.sourceKind === "html"
              ? `No slide or object has stable ID "${id}".`
              : `No diagram or object has stable ID "${id}".`,
        },
      ],
      format,
      environment,
    );
    return 1;
  }
  writeJson(projection, environment);
  return 0;
}

async function runList(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    {
      "--slide": "value",
      "--role": "value",
      "--class": "value",
      "--text": "value",
      "--view": "value",
      "--format": "value",
    },
    1,
    "list requires exactly one Vector180 path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json", "jsonl"]);
  const document = await loadVector180Document(await readVector180Path(path));
  if (hasErrors(document.diagnostics)) {
    writeDiagnostics(document.diagnostics, format, environment);
    return 1;
  }
  const slideId = readOption(parsedArgs, "--slide");
  if (document.sourceKind === "svg" && slideId !== undefined) {
    throw new InvocationError(
      'list option "--slide" is deck-only; standalone diagrams have no slides.',
    );
  }
  const role = readRole(parsedArgs);
  const className = readOption(parsedArgs, "--class");
  const textContains = readOption(parsedArgs, "--text");
  const query: Vector180AtomQuery = {
    ...(role === undefined ? {} : { role }),
    ...(className === undefined ? {} : { className }),
    ...(textContains === undefined ? {} : { textContains }),
  };
  const projection =
    document.sourceKind === "html"
      ? {
          schema: "vector180-list/0.1" as const,
          wireFamily: document.wireFamily,
          objects: queryObjects(
            document,
            {
              ...query,
              ...(slideId === undefined ? {} : { slideId }),
            },
            readView(parsedArgs),
          ),
        }
      : queryAtomObjects(document, query, readView(parsedArgs));
  if (format === "json") writeJson(projection, environment);
  else if (format === "jsonl") {
    for (const object of projection.objects)
      environment.stdout(`${JSON.stringify(object)}\n`);
  } else {
    for (const object of projection.objects) {
      environment.stdout(
        `${object.id}\t${object.role}\t${object.element}${object.text === undefined ? "" : `\t${object.text}`}\n`,
      );
    }
  }
  return 0;
}

async function runPatch(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--check": "flag", "--output": "value", "--format": "value" },
    2,
    "patch requires exactly one Vector180 path and one patch JSON path",
  );
  const path = parsedArgs.positionals[0]!;
  const patchPath = parsedArgs.positionals[1]!;
  const format = readFormat(parsedArgs, ["text", "json"]);
  const check = hasFlag(parsedArgs, "--check");
  const output = readOption(parsedArgs, "--output");
  if (check && output !== undefined) {
    throw new InvocationError("patch accepts --check or --output, not both");
  }
  if (!check && output === undefined) {
    throw new InvocationError(
      "patch requires --check or an explicit --output PATH",
    );
  }

  const document = await loadVector180Document(await readVector180Path(path));
  const patch = await readJsonPath(patchPath);
  const result = await applyPatch(document, patch);
  if (!result.applied || result.sourceText === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  if (!check && output !== undefined)
    await writeFileAtomic(output, result.sourceText);

  const summary = {
    schema: "vector180-patch-result/0.1",
    applied: result.applied,
    check,
    ...(output === undefined ? {} : { output }),
    originalSha256: result.originalSha256,
    sourceSha256: result.sourceSha256,
    affectedIds: result.affectedIds,
    editCount: result.edits.length,
    diagnostics: result.diagnostics,
  };
  if (format === "json") writeJson(summary, environment);
  else {
    environment.stdout(
      `${check ? "valid patch" : `wrote ${output}`} (${result.edits.length} source edits, ${result.affectedIds.length} affected IDs)\n`,
    );
  }
  return 0;
}

function writeDiagnostics(
  diagnostics: readonly Diagnostic[],
  format: OutputFormat,
  environment: CliEnvironment,
): void {
  if (format === "json") {
    writeJson(
      { schema: "vector180-diagnostics/0.1", diagnostics },
      environment,
    );
    return;
  }
  if (format === "jsonl") {
    for (const diagnostic of diagnostics)
      environment.stdout(`${JSON.stringify(diagnostic)}\n`);
    return;
  }
  for (const diagnostic of diagnostics) {
    const location =
      diagnostic.range === undefined
        ? ""
        : `:${diagnostic.range.lineStart}:${diagnostic.range.columnStart}`;
    environment.stderr(
      `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location} ${diagnostic.message}\n`,
    );
  }
}

function writeJson(value: unknown, environment: CliEnvironment): void {
  environment.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function readFormat(
  args: ParsedArguments,
  allowed: readonly OutputFormat[],
  fallback: OutputFormat = "text",
): OutputFormat {
  const value = readOption(args, "--format") ?? fallback;
  if (
    (value === "text" || value === "json" || value === "jsonl") &&
    allowed.includes(value)
  ) {
    return value;
  }
  throw new InvocationError(`Unknown output format "${value}".`);
}

function readErrorFormat(args: readonly string[]): OutputFormat {
  const index = args.indexOf("--format");
  const value = index < 0 ? undefined : args[index + 1];
  if (value === "json" || value === "jsonl") return value;
  return args[0] === "show" || args[0] === "resolve" ? "json" : "text";
}

function readView(args: ParsedArguments): ProjectionView {
  const value = readOption(args, "--view") ?? "semantic";
  if (value === "semantic" || value === "editing") return value;
  throw new InvocationError(`Unknown projection view "${value}".`);
}

function readRole(args: ParsedArguments): Vector180Role | undefined {
  const value = readOption(args, "--role");
  if (value === undefined) return undefined;
  if (
    value === "shape" ||
    value === "text" ||
    value === "connector" ||
    value === "group" ||
    value === "asset"
  ) {
    return value;
  }
  throw new InvocationError(`Unknown Vector180 role "${value}".`);
}

async function loadFontMap(path: string): Promise<FontkitFontMap> {
  let input: unknown;
  try {
    input = await readJsonPath(path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvocationError(`Invalid font map JSON: ${error.message}`);
    }
    throw error;
  }
  try {
    return parseFontMap(input, dirname(resolve(path)));
  } catch (error) {
    throw new InvocationError(
      `Invalid font map: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readNearLimit(args: ParsedArguments): number | undefined {
  const value = readOption(args, "--near-limit");
  if (value === undefined) return undefined;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new InvocationError(
      "--near-limit must be a finite number greater than 0 and less than 1",
    );
  }
  return threshold;
}

function readOption(args: ParsedArguments, name: string): string | undefined {
  const value = args.options.get(name);
  return typeof value === "string" ? value : undefined;
}

function requiredOption(
  args: ParsedArguments,
  name: string,
  command: string,
): string {
  const value = readOption(args, name);
  if (value === undefined || value.trim().length === 0) {
    throw new InvocationError(`${command} requires ${name} VALUE`);
  }
  return value;
}

function readPositiveDimension(
  args: ParsedArguments,
  name: string,
  fallback: number,
): number {
  const value = readOption(args, name);
  if (value === undefined) return fallback;
  const dimension = Number(value);
  if (!Number.isFinite(dimension) || dimension <= 0) {
    throw new InvocationError(`${name} must be a finite number greater than 0`);
  }
  return dimension;
}

async function writeExclusive(
  path: string,
  contents: string | Uint8Array,
  command: string,
): Promise<void> {
  try {
    await writeFileAtomic(path, contents, { overwrite: false });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new InvocationError(
        `${command} refuses to overwrite existing output "${path}".`,
      );
    }
    throw error;
  }
}

function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function xmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\t", "&#9;");
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function htmlText(value: string): string {
  return xmlText(value);
}

function safeJsonScriptText(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function hasFlag(args: ParsedArguments, name: string): boolean {
  return args.options.get(name) === true;
}

function writeTextFit(
  lines: readonly (Vector180DeckTextFitLine | Vector180AtomTextFitLine)[],
  summary: {
    readonly total: number;
    readonly clear: number;
    readonly nearLimit: number;
    readonly overflow: number;
    readonly unverified: number;
  },
  environment: CliEnvironment,
): void {
  for (const line of lines) {
    if (line.status === "clear") continue;
    const scopeId = "slideId" in line ? line.slideId : line.atomId;
    const location = `${scopeId}/${line.objectId}#${line.lineIndex + 1}`;
    if (line.status === "unverified") {
      environment.stdout(
        `UNVERIFIED ${location} ${line.reason ?? "measurement unavailable"} (${line.method})\n`,
      );
      continue;
    }
    const utilization =
      line.utilization === null
        ? "n/a"
        : `${formatDecimal(line.utilization * 100)}%`;
    const overrun =
      line.status === "overflow"
        ? ` overrun=${formatDecimal(line.overrun ?? 0)}`
        : "";
    environment.stdout(
      `${line.status === "overflow" ? "OVERFLOW" : "NEAR-LIMIT"} ${location} width=${formatDecimal(line.measuredWidth ?? 0)} available=${formatDecimal(line.availableWidth)} utilization=${utilization}${overrun}\n`,
    );
  }
  environment.stdout(
    `text-fit ${summary.total} lines: ${summary.clear} clear, ${summary.nearLimit} near-limit, ${summary.overflow} overflow, ${summary.unverified} unverified\n`,
  );
}

function writeDefaultFontEnvironment(
  evidence: Vector180DefaultFontEnvironmentEvidence,
  environment: CliEnvironment,
): void {
  environment.stdout(
    `font-map ${evidence.schema}: ${evidence.font.postscriptName} ${evidence.font.sha256}; ${evidence.license.id} ${evidence.license.sha256}; ${evidence.adapter}; Node ${evidence.runtime.nodeVersion} ${evidence.runtime.platform}/${evidence.runtime.architecture}\n`,
  );
}

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function isDefaultFontIntegrityError(
  error: unknown,
): error is Error & { readonly code: "VECTOR180-FONT-MAP-DEFAULT-INTEGRITY" } {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "VECTOR180-FONT-MAP-DEFAULT-INTEGRITY"
  );
}

function parseArguments(
  args: readonly string[],
  specification: Readonly<Record<string, OptionKind>>,
  positionalCount: number,
  message: string,
): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const kind = specification[argument];
    if (kind === undefined) {
      throw new InvocationError(`Unknown option "${argument}".`);
    }
    if (options.has(argument)) {
      throw new InvocationError(`Option "${argument}" may be supplied once.`);
    }
    if (kind === "flag") {
      options.set(argument, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new InvocationError(`${argument} requires a value.`);
    }
    options.set(argument, value);
    index += 1;
  }
  if (positionals.length !== positionalCount) {
    throw new InvocationError(message);
  }
  return { positionals, options };
}

function helpText(): string {
  return `vector180 — source-preserving Vector180 0.1 tools

Usage:
  vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]
  vector180 new deck --output PATH --title TITLE
  vector180 metadata <atom.vector180.svg> [--format text|json]
  vector180 metadata-compare <left.vector180.svg> <right.vector180.svg> [--template-basis PATH] [--format text|json]
  vector180 diff <left.vector180.svg> <right.vector180.svg> [--output PATH] [--format text|json]
  vector180 migrate <legacy.pptv.svg> --output PATH [--report PATH] [--format text|json]
  vector180 outline <file.vector180.html|file.vector180.svg> [--format text|json]
  vector180 validate <file.vector180.html|file.vector180.svg> [--format text|json]
  vector180 resolve <file.vector180.html|file.vector180.svg> [--format text|json]
  vector180 extract <deck.vector180.html> --slide ID --output file.vector180.svg [--format text|json]
  vector180 editor-pack <file.vector180.html|file.vector180.svg> --output PATH [--font-map default|PATH] [--near-limit N] [--format text|json]
  vector180 pptx-canary <deck.vector180.html> --output PATH [--format text|json]
  vector180 compose <atom.vector180.svg> --placement X,Y,W,H --output PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]
  vector180 compile <atom.vector180.svg> --placement X,Y,W,H --output PATH --map PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]
  vector180 reconcile <edited.pptx> --source atom.vector180.svg --baseline atom.vector180.map.json [--native-baseline native-save.pptx] [--resolution reviewed-copy.json] --patch PATH --report PATH [--format text|json]
  vector180 text-fit <file.vector180.html|file.vector180.svg> [--font-map default|PATH] [--near-limit N] [--format text|json]
  vector180 text <file.vector180.html|file.vector180.svg> [--slide ID] [--include-hidden] [--format text|json|jsonl]
  vector180 show <file.vector180.html|file.vector180.svg> <id> [--view semantic|editing] [--format json]
  vector180 list <file.vector180.html|file.vector180.svg> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT] [--view semantic|editing] [--format text|json|jsonl]
  vector180 patch <file.vector180.html|file.vector180.svg> <patch.json> (--check | --output PATH) [--format text|json]
`;
}

function commandHelpText(argv: readonly string[]): string | undefined {
  const asksForHelp = argv
    .slice(1)
    .some((value) => value === "--help" || value === "-h");
  if (!asksForHelp) return undefined;

  if (argv[0] === "new" && argv[1] === "atom") {
    return `vector180 new atom — scaffold one canonical hydrated SVG atom

Usage:
  vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]

Defaults:
  --width 1600 --height 900 (common 16:9 canvas)

The output uses stable IDs, ABeeZee Regular 400, explicit hard-line/no-wrap
text, local styles, metadata, and the Vector180 authoring-skill discovery
comment. Existing output is never overwritten.
`;
  }
  if (argv[0] === "new" && argv[1] === "deck") {
    return `vector180 new deck — scaffold one explicit HTML deck/report

Usage:
  vector180 new deck --output PATH --title TITLE

The output starts with one 1600×900 cover slide, the packaged canonical viewer,
ABeeZee Regular 400, and no atom metadata. Existing output is never overwritten.
`;
  }
  if (argv[0] === "new") {
    return `vector180 new — canonical source scaffolds

Usage:
  vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]
  vector180 new deck --output PATH --title TITLE

Use an atom by default. Use a deck only for a real ordered deck/report.
`;
  }
  if (argv[0] === "patch") {
    return `vector180 patch — validate or apply one hash-bound transaction

Usage:
  vector180 patch SOURCE PATCH.json --check [--format text|json]
  vector180 patch SOURCE PATCH.json --output PATH [--format text|json]

Canonical set-text patch:
  {"schema":"vector180-patch/0.1","baseSha256":"<exact 64-hex source hash>","ops":[{"op":"set-text","id":"title","oldText":"Old title","value":"New title"}]}

Every operation requires its complete old value. The command plans exact source
ranges, reloads the full candidate, and never overwrites SOURCE implicitly.
`;
  }
  return undefined;
}

class InvocationError extends Error {}
