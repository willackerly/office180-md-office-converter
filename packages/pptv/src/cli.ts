#!/usr/bin/env node
/**
 * Reference Node CLI for the PPTV 0.1 source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.3
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2
 */

import { dirname, resolve } from "node:path";

import { loadDeck, loadPptvDocument, PptvLoadError } from "./core/deck.js";
import { extractPptvDiagram } from "./core/extract.js";
import { parseManifest, validateManifest } from "./core/manifest.js";
import { resolvePptvDeck, resolvePptvDiagram } from "./core/resolved.js";
import { scanPptvSource } from "./core/scan.js";
import { hasErrors } from "./core/source.js";
import {
  preflightDiagramTextFit,
  preflightTextFit,
  type PptvDiagramTextFitLine,
  type PptvTextFitLine,
} from "./core/text-fit.js";
import type { Diagnostic, ProjectionView, PptvRole } from "./core/types.js";
import { createEditorPack } from "./node/editor-pack.js";
import {
  createFontkitTextMeasurer,
  parseFontMap,
  type FontkitFontMap,
} from "./node/fontkit-text-measurer.js";
import {
  readBytesPath,
  readJsonPath,
  readPptvPath,
  writeFileAtomic,
  writeFilesAtomicExclusive,
} from "./node/io.js";
import {
  composePptvDiagramDeck,
  compilePptxBaseline,
  PptvPptxBaselineCompileError,
  type PptvPlacement,
  type PptvPptxMap,
} from "./node/pptx-baseline.js";
import {
  compilePptxCanary,
  PptxCanaryCompileError,
} from "./node/pptx-canary.js";
import {
  parsePptvReconcileResolution,
  PptvReconcileResolutionError,
  type PptvReconcileResolution,
} from "./node/reconcile-resolution.js";
import { reconcilePptx } from "./node/reconcile.js";
import { applyPatch } from "./ops/patch.js";
import {
  extractDiagramText,
  extractText,
  getDiagram,
  getDiagramObject,
  getObject,
  getSlide,
  outlineDiagram,
  outlineManifest,
  queryDiagramObjects,
  queryObjects,
  type PptvDiagramQuery,
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

  try {
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
    if (error instanceof PptvLoadError) {
      writeDiagnostics(error.diagnostics, readErrorFormat(argv), environment);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    environment.stderr(`PPTV environment failure: ${message}\n`);
    return 3;
  }
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
  let resolutionInput: PptvReconcileResolution | undefined;
  if (resolutionPath !== undefined) {
    try {
      resolutionInput = parsePptvReconcileResolution(
        await readJsonPath(resolutionPath),
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new InvocationError(
          `Invalid reconciliation resolution JSON: ${error.message}`,
        );
      }
      if (error instanceof PptvReconcileResolutionError) {
        throw new InvocationError(
          `Invalid reconciliation resolution: ${error.message}`,
        );
      }
      throw error;
    }
  }
  const [source, editedPptxBytes, nativeBaselinePptxBytes] = await Promise.all([
    loadPptvDocument(await readPptvPath(sourcePath)),
    readBytesPath(editedPath),
    nativeBaselinePath === undefined
      ? Promise.resolve(undefined)
      : readBytesPath(nativeBaselinePath),
  ]);
  const result = await reconcilePptx(
    source,
    baselineInput as PptvPptxMap,
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
          code: "PPTV-RECONCILE-EXISTS",
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
        schema: "pptv-reconcile-result/0.1",
        reportSchema: result.schema,
        status: result.status,
        report: reportOutput,
        ...(patchPublished ? { patch: patchOutput } : {}),
        resolutionProvided: resolutionInput !== undefined,
        resolutionAccepted:
          resolutionInput !== undefined &&
          patchPublished &&
          result.patch?.schema === "pptv-patch/0.3",
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
    "outline requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"]);
  const input = await readPptvPath(path);
  const scan = await scanPptvSource(input);
  if (scan.kind === "svg") {
    const document = await loadPptvDocument(input);
    if (document.sourceKind !== "svg") {
      throw new Error("SVG scan did not load as a standalone diagram.");
    }
    if (hasErrors(document.diagnostics)) {
      writeDiagnostics(document.diagnostics, format, environment);
      return 1;
    }
    const outline = outlineDiagram(document);
    if (format === "json") writeJson(outline, environment);
    else {
      environment.stdout(
        `${outline.diagramId}\nviewBox: ${outline.viewBox.join(" ")}\n`,
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
  const outline = outlineManifest(parsed.manifest);
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
    "validate requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"]);
  const document = await loadPptvDocument(await readPptvPath(path));
  if (format === "json") {
    if (document.sourceKind === "html") {
      writeJson(
        {
          schema: "pptv-validation/0.1",
          valid: !hasErrors(document.diagnostics),
          sourceSha256: document.source.sha256,
          diagnostics: document.diagnostics,
        },
        environment,
      );
    } else {
      writeJson(
        {
          schema: "pptv-diagram-validation/0.1",
          valid: !hasErrors(document.diagnostics),
          sourceSha256: document.source.sha256,
          diagramId: document.id,
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
    "editor-pack requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const fontMapPath = readOption(parsedArgs, "--font-map");
  const nearLimit = readNearLimit(parsedArgs);
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined) {
    throw new InvocationError("editor-pack requires an explicit --output PATH");
  }
  if (nearLimit !== undefined && fontMapPath === undefined) {
    throw new InvocationError(
      "editor-pack --near-limit requires an explicit --font-map PATH",
    );
  }
  const fontMap =
    fontMapPath === undefined ? undefined : await loadFontMap(fontMapPath);

  const result = await createEditorPack(await readPptvPath(path), {
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
        schema: "pptv-editor-pack-result/0.1",
        output,
        ...(result.documentKind === undefined
          ? {}
          : { documentKind: result.documentKind }),
        sourceSha256: result.sourceSha256,
        diagnostics: result.diagnostics,
      },
      environment,
    );
  } else {
    environment.stdout(
      `wrote ${output} (trusted editor wrapper for ${result.sourceSha256})\n`,
    );
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
    "resolve requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json"], "json");
  const document = await loadPptvDocument(await readPptvPath(path));
  const result =
    document.sourceKind === "html"
      ? resolvePptvDeck(document)
      : resolvePptvDiagram(document);
  if (result.model === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  if (format === "json") {
    writeJson(result.model, environment);
  } else {
    environment.stdout(
      result.model.schema === "pptv-resolved/0.1"
        ? `resolved ${path} (${result.model.slides.length} slides, ${result.model.sourceSha256})\n`
        : `resolved ${path} (diagram ${result.model.diagramId}, ${result.model.sourceSha256})\n`,
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
    "extract requires exactly one PPTV deck path",
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

  const deck = await loadDeck(await readPptvPath(path));
  const result = await extractPptvDiagram(deck, slideId);
  if (result.sourceText === undefined || result.sourceSha256 === undefined) {
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
        schema: "pptv-diagram-extraction-result/0.1",
        output,
        sourceSha256: result.sourceSha256,
        provenance: result.provenance,
        diagnostics: result.diagnostics,
      },
      environment,
    );
  } else {
    environment.stdout(
      `wrote ${output} (diagram ${result.sourceSha256}, hydrated ${result.provenance.sourceSlideId} from ${result.provenance.sourceDeckSha256})\n`,
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
    "pptx-canary requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined) {
    throw new InvocationError("pptx-canary requires an explicit --output PATH");
  }

  const deck = await loadDeck(await readPptvPath(path));
  const resolved = resolvePptvDeck(deck);
  try {
    const artifact = await compilePptxCanary(resolved);
    await writeFileAtomic(output, artifact.bytes);
    if (format === "json") {
      writeJson(
        {
          schema: "pptv-pptx-canary-result/0.1",
          output,
          sourceSha256: artifact.sourceSha256,
          partCount: artifact.partNames.length,
          diagnostics: resolved.diagnostics,
        },
        environment,
      );
    } else {
      environment.stdout(
        `wrote ${output} (${artifact.partNames.length} deterministic PPTX parts, ${artifact.sourceSha256})\n`,
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
    "compile requires exactly one PPTV path",
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

  const document = await loadPptvDocument(await readPptvPath(path));
  const policy = readPlacementPolicy(parsedArgs);
  const placement = parsePlacement(
    placementText,
    readOption(parsedArgs, "--slide-id") ??
      (document.sourceKind === "svg" ? document.id : "slide"),
    policy,
  );
  try {
    const artifact = await compilePptxBaseline(document, { placement });
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
            code: "PPTV-BASELINE-EXISTS",
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
          schema: "pptv-pptx-baseline-result/0.1",
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
    if (!(error instanceof PptvPptxBaselineCompileError)) throw error;
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
    "compose requires exactly one standalone PPTV atom path",
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
  const document = await loadPptvDocument(await readPptvPath(path));
  if (document.sourceKind !== "svg") {
    writeDiagnostics(
      [
        ...document.diagnostics,
        {
          code: "PPTV-BASELINE-UNSUPPORTED",
          severity: "error",
          message: "compose accepts one standalone .pptv.svg atom only.",
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
    const artifact = await composePptvDiagramDeck(document, placement);
    try {
      await writeFileAtomic(output, artifact.sourceText, { overwrite: false });
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      writeDiagnostics(
        [
          {
            code: "PPTV-BASELINE-EXISTS",
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
          schema: "pptv-compose-result/0.1",
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
    if (!(error instanceof PptvPptxBaselineCompileError)) throw error;
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
  policy: PptvPlacement["policy"],
): PptvPlacement {
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
): PptvPlacement["policy"] {
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
    "text-fit requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const fontMapPath = readOption(parsedArgs, "--font-map");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (fontMapPath === undefined) {
    throw new InvocationError("text-fit requires an explicit --font-map PATH");
  }
  const nearLimit = readNearLimit(parsedArgs);

  const document = await loadPptvDocument(await readPptvPath(path));
  const resolved =
    document.sourceKind === "html"
      ? resolvePptvDeck(document)
      : resolvePptvDiagram(document);
  if (resolved.model === undefined) {
    writeDiagnostics(resolved.diagnostics, format, environment);
    return 1;
  }

  const fontMap = await loadFontMap(fontMapPath);
  const measurer = await createFontkitTextMeasurer(fontMap.faces);
  const result =
    resolved.model.schema === "pptv-resolved/0.1"
      ? preflightTextFit(resolved.model, measurer, {
          ...(nearLimit === undefined ? {} : { nearLimit }),
        })
      : preflightDiagramTextFit(resolved.model, measurer, {
          ...(nearLimit === undefined ? {} : { nearLimit }),
        });

  if (format === "json") writeJson(result, environment);
  else writeTextFit(result.lines, result.summary, environment);
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
    "text requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const slide = readOption(parsedArgs, "--slide");
  const format = readFormat(parsedArgs, ["text", "json", "jsonl"]);
  const document = await loadPptvDocument(await readPptvPath(path));
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
      : extractDiagramText(document);
  if (format === "json") writeJson(projection, environment);
  else if (format === "jsonl") {
    for (const entry of projection.entries)
      environment.stdout(`${JSON.stringify(entry)}\n`);
  } else {
    for (const entry of projection.entries) {
      const scopeId = "slideId" in entry ? entry.slideId : entry.diagramId;
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
    "show requires exactly one PPTV path and one stable ID",
  );
  const path = parsedArgs.positionals[0]!;
  const id = parsedArgs.positionals[1]!;
  const format = readFormat(parsedArgs, ["json"], "json");
  const view = readView(parsedArgs);
  const document = await loadPptvDocument(await readPptvPath(path));
  if (hasErrors(document.diagnostics)) {
    writeDiagnostics(document.diagnostics, format, environment);
    return 1;
  }
  const projection =
    document.sourceKind === "html"
      ? (getSlide(document, id, view) ?? getObject(document, id, view))
      : id === document.id
        ? getDiagram(document, view)
        : getDiagramObject(document, id, view);
  if (projection === undefined) {
    writeDiagnostics(
      [
        {
          code: "PPTV-QUERY-NOT-FOUND",
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
    "list requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const format = readFormat(parsedArgs, ["text", "json", "jsonl"]);
  const document = await loadPptvDocument(await readPptvPath(path));
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
  const query: PptvDiagramQuery = {
    ...(role === undefined ? {} : { role }),
    ...(className === undefined ? {} : { className }),
    ...(textContains === undefined ? {} : { textContains }),
  };
  const projection =
    document.sourceKind === "html"
      ? {
          schema: "pptv-list/0.1" as const,
          objects: queryObjects(
            document,
            {
              ...query,
              ...(slideId === undefined ? {} : { slideId }),
            },
            readView(parsedArgs),
          ),
        }
      : queryDiagramObjects(document, query, readView(parsedArgs));
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
    "patch requires exactly one PPTV path and one patch JSON path",
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

  const document = await loadPptvDocument(await readPptvPath(path));
  const patch = await readJsonPath(patchPath);
  const result = await applyPatch(document, patch);
  if (!result.applied || result.sourceText === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  if (!check && output !== undefined)
    await writeFileAtomic(output, result.sourceText);

  const summary = {
    schema: "pptv-patch-result/0.1",
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
    writeJson({ schema: "pptv-diagnostics/0.1", diagnostics }, environment);
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

function readRole(args: ParsedArguments): PptvRole | undefined {
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
  throw new InvocationError(`Unknown PPTV role "${value}".`);
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

function hasFlag(args: ParsedArguments, name: string): boolean {
  return args.options.get(name) === true;
}

function writeTextFit(
  lines: readonly (PptvTextFitLine | PptvDiagramTextFitLine)[],
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
    const scopeId = "slideId" in line ? line.slideId : line.diagramId;
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
  return `pptv — source-preserving PPTV 0.1 tools

Usage:
  pptv outline <file.pptv.html|file.pptv.svg> [--format text|json]
  pptv validate <file.pptv.html|file.pptv.svg> [--format text|json]
  pptv resolve <file.pptv.html|file.pptv.svg> [--format text|json]
  pptv extract <deck.pptv.html> --slide ID --output file.pptv.svg [--format text|json]
  pptv editor-pack <file.pptv.html|file.pptv.svg> --output PATH [--font-map PATH] [--near-limit N] [--format text|json]
  pptv pptx-canary <deck.pptv.html> --output PATH [--format text|json]
  pptv compose <atom.pptv.svg> --placement X,Y,W,H --output PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]
  pptv compile <atom.pptv.svg> --placement X,Y,W,H --output PATH --map PATH [--slide-id ID] [--policy identity|uniform-scale-translate] [--format text|json]
  pptv reconcile <edited.pptx> --source atom.pptv.svg --baseline atom.pptv.map.json [--native-baseline native-save.pptx] [--resolution reviewed-copy.json] --patch PATH --report PATH [--format text|json]
  pptv text-fit <file.pptv.html|file.pptv.svg> --font-map PATH [--near-limit N] [--format text|json]
  pptv text <file.pptv.html|file.pptv.svg> [--slide ID] [--include-hidden] [--format text|json|jsonl]
  pptv show <file.pptv.html|file.pptv.svg> <id> [--view semantic|editing] [--format json]
  pptv list <file.pptv.html|file.pptv.svg> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT] [--view semantic|editing] [--format text|json|jsonl]
  pptv patch <file.pptv.html|file.pptv.svg> <patch.json> (--check | --output PATH) [--format text|json]
`;
}

class InvocationError extends Error {}
