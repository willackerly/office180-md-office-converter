#!/usr/bin/env node
/**
 * Reference Node CLI for the PPTV 0.1 source kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 * CONTRACT:C6-PPTV-RESOLVED.1.0
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.0
 */

import { dirname, resolve } from "node:path";

import { loadDeck, PptvLoadError } from "./core/deck.js";
import { parseManifest, validateManifest } from "./core/manifest.js";
import { resolvePptvDeck } from "./core/resolved.js";
import { scanPptvSource } from "./core/scan.js";
import { hasErrors } from "./core/source.js";
import { preflightTextFit, type PptvTextFitLine } from "./core/text-fit.js";
import type {
  Diagnostic,
  ProjectionView,
  PptvQuery,
  PptvRole,
} from "./core/types.js";
import { createEditorPack } from "./node/editor-pack.js";
import {
  createFontkitTextMeasurer,
  parseFontMap,
} from "./node/fontkit-text-measurer.js";
import { readJsonPath, readPptvPath, writeFileAtomic } from "./node/io.js";
import {
  compilePptxCanary,
  PptxCanaryCompileError,
} from "./node/pptx-canary.js";
import { applyPatch } from "./ops/patch.js";
import {
  extractText,
  getObject,
  getSlide,
  outlineManifest,
  queryObjects,
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
    if (command === "editor-pack")
      return await runEditorPack(argv.slice(1), environment);
    if (command === "pptx-canary")
      return await runPptxCanary(argv.slice(1), environment);
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
  const scan = await scanPptvSource(await readPptvPath(path));
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
  const deck = await loadDeck(await readPptvPath(path));
  if (format === "json") {
    writeJson(
      {
        schema: "pptv-validation/0.1",
        valid: !hasErrors(deck.diagnostics),
        sourceSha256: deck.source.sha256,
        diagnostics: deck.diagnostics,
      },
      environment,
    );
  } else if (deck.diagnostics.length === 0) {
    environment.stdout(`valid ${path} (${deck.slideOrder.length} slides)\n`);
  } else {
    writeDiagnostics(deck.diagnostics, format, environment);
  }
  return hasErrors(deck.diagnostics) ? 1 : 0;
}

async function runEditorPack(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const parsedArgs = parseArguments(
    args,
    { "--output": "value", "--format": "value" },
    1,
    "editor-pack requires exactly one PPTV path",
  );
  const path = parsedArgs.positionals[0]!;
  const output = readOption(parsedArgs, "--output");
  const format = readFormat(parsedArgs, ["text", "json"]);
  if (output === undefined) {
    throw new InvocationError("editor-pack requires an explicit --output PATH");
  }

  const result = await createEditorPack(await readPptvPath(path));
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
  const deck = await loadDeck(await readPptvPath(path));
  const result = resolvePptvDeck(deck);
  if (result.model === undefined) {
    writeDiagnostics(result.diagnostics, format, environment);
    return 1;
  }
  if (format === "json") {
    writeJson(result.model, environment);
  } else {
    environment.stdout(
      `resolved ${path} (${result.model.slides.length} slides, ${result.model.sourceSha256})\n`,
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

  const deck = await loadDeck(await readPptvPath(path));
  const resolvedDeck = resolvePptvDeck(deck);
  if (resolvedDeck.model === undefined) {
    writeDiagnostics(resolvedDeck.diagnostics, format, environment);
    return 1;
  }

  let fontMapInput: unknown;
  try {
    fontMapInput = await readJsonPath(fontMapPath);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvocationError(`Invalid font map JSON: ${error.message}`);
    }
    throw error;
  }
  let fontMap;
  try {
    fontMap = parseFontMap(fontMapInput, dirname(resolve(fontMapPath)));
  } catch (error) {
    throw new InvocationError(
      `Invalid font map: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const measurer = await createFontkitTextMeasurer(fontMap.faces);
  const result = preflightTextFit(resolvedDeck.model, measurer, {
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
  const deck = await loadDeck(await readPptvPath(path), {
    ...(slide === undefined ? {} : { slides: [slide] }),
  });
  if (hasErrors(deck.diagnostics)) {
    writeDiagnostics(deck.diagnostics, format, environment);
    return 1;
  }
  const projection = extractText(deck, {
    ...(slide === undefined ? {} : { slideId: slide }),
    includeHidden: hasFlag(parsedArgs, "--include-hidden"),
  });
  if (format === "json") writeJson(projection, environment);
  else if (format === "jsonl") {
    for (const entry of projection.entries)
      environment.stdout(`${JSON.stringify(entry)}\n`);
  } else {
    for (const entry of projection.entries) {
      environment.stdout(
        `${entry.slideId}\t${entry.objectId}\t${entry.text}\n`,
      );
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
  const deck = await loadDeck(await readPptvPath(path));
  if (hasErrors(deck.diagnostics)) {
    writeDiagnostics(deck.diagnostics, format, environment);
    return 1;
  }
  const projection = getSlide(deck, id, view) ?? getObject(deck, id, view);
  if (projection === undefined) {
    writeDiagnostics(
      [
        {
          code: "PPTV-QUERY-NOT-FOUND",
          severity: "error",
          message: `No slide or object has stable ID "${id}".`,
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
  const deck = await loadDeck(await readPptvPath(path));
  if (hasErrors(deck.diagnostics)) {
    writeDiagnostics(deck.diagnostics, format, environment);
    return 1;
  }
  const slideId = readOption(parsedArgs, "--slide");
  const role = readRole(parsedArgs);
  const className = readOption(parsedArgs, "--class");
  const textContains = readOption(parsedArgs, "--text");
  const query: PptvQuery = {
    ...(slideId === undefined ? {} : { slideId }),
    ...(role === undefined ? {} : { role }),
    ...(className === undefined ? {} : { className }),
    ...(textContains === undefined ? {} : { textContains }),
  };
  const objects = queryObjects(deck, query, readView(parsedArgs));
  if (format === "json")
    writeJson({ schema: "pptv-list/0.1", objects }, environment);
  else if (format === "jsonl") {
    for (const object of objects)
      environment.stdout(`${JSON.stringify(object)}\n`);
  } else {
    for (const object of objects) {
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

  const deck = await loadDeck(await readPptvPath(path));
  const patch = await readJsonPath(patchPath);
  const result = await applyPatch(deck, patch);
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
  lines: readonly PptvTextFitLine[],
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
    const location = `${line.slideId}/${line.objectId}#${line.lineIndex + 1}`;
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
  pptv outline <file> [--format text|json]
  pptv validate <file> [--format text|json]
  pptv resolve <file> [--format text|json]
  pptv editor-pack <file> --output PATH [--format text|json]
  pptv pptx-canary <file> --output PATH [--format text|json]
  pptv text-fit <file> --font-map PATH [--near-limit N] [--format text|json]
  pptv text <file> [--slide ID] [--format text|json|jsonl]
  pptv show <file> <id> [--view semantic|editing] [--format json]
  pptv list <file> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT]
  pptv patch <file> <patch.json> (--check | --output PATH) [--format text|json]
`;
}

class InvocationError extends Error {}
