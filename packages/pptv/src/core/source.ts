/**
 * UTF-8 source materialization, hashing, and dual-coordinate mapping.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 */

import type {
  Diagnostic,
  PptvInput,
  PptvSourceDocument,
  SourceRange,
} from "./types.js";

const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export interface MaterializeSourceOptions {
  maxSourceBytes?: number;
}

export interface MaterializeSourceResult {
  document: PptvSourceDocument;
  diagnostics: Diagnostic[];
}

export class SourceMapper {
  readonly text: string;
  readonly bytes: Uint8Array<ArrayBufferLike>;

  private readonly byteOffsets: Uint32Array;
  private readonly lineStarts: number[];

  constructor(
    text: string,
    bytes: Uint8Array<ArrayBufferLike> = new TextEncoder().encode(text),
  ) {
    this.text = text;
    this.bytes = bytes;
    this.byteOffsets = buildByteOffsets(text);
    this.lineStarts = buildLineStarts(text);
  }

  range(charStart: number, charEnd: number): SourceRange {
    if (
      !Number.isInteger(charStart) ||
      !Number.isInteger(charEnd) ||
      charStart < 0 ||
      charEnd < charStart ||
      charEnd > this.text.length
    ) {
      throw new RangeError(`Invalid source range ${charStart}..${charEnd}`);
    }
    if (
      !isUnicodeScalarBoundary(this.text, charStart) ||
      !isUnicodeScalarBoundary(this.text, charEnd)
    ) {
      throw new RangeError(
        `Source range ${charStart}..${charEnd} splits a UTF-16 surrogate pair`,
      );
    }

    const start = this.position(charStart);
    const end = this.position(charEnd);
    return {
      byteStart: this.byteOffsets[charStart] ?? this.bytes.length,
      byteEnd: this.byteOffsets[charEnd] ?? this.bytes.length,
      charStart,
      charEnd,
      lineStart: start.line,
      columnStart: start.column,
      lineEnd: end.line,
      columnEnd: end.column,
    };
  }

  private position(offset: number): { line: number; column: number } {
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle;
      }
    }

    const lineStart = this.lineStarts[low] ?? 0;
    return { line: low + 1, column: offset - lineStart + 1 };
  }
}

export async function materializeSource(
  input: PptvInput,
  options: MaterializeSourceOptions = {},
): Promise<MaterializeSourceResult> {
  const diagnostics: Diagnostic[] = [];
  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  let text = "";
  let bytes: Uint8Array;

  if (input.kind === "bytes") {
    bytes = input.bytes.slice();
    if (bytes.length > maxSourceBytes) {
      diagnostics.push(sourceLimitDiagnostic(bytes.length, maxSourceBytes));
      return {
        document: await createSourceDocument(input.name, "", bytes),
        diagnostics,
      };
    }
    try {
      // `ignoreBOM: true` means "do not consume it": the decoded string
      // retains U+FEFF so hashing, coordinates, and preserve edits cover the
      // exact source bytes.
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      diagnostics.push({
        code: "PPTV-SCAN-INVALID-UTF8",
        severity: "fatal",
        message: "PPTV byte input must be valid UTF-8.",
      });
    }
  } else {
    text = input.text;
    if (!isWellFormedUtf16(text)) {
      diagnostics.push({
        code: "PPTV-SCAN-INVALID-UTF8",
        severity: "fatal",
        message: "PPTV text input must not contain unpaired UTF-16 surrogates.",
      });
    }
    bytes = new TextEncoder().encode(text);
  }

  if (bytes.length > maxSourceBytes) {
    diagnostics.push(sourceLimitDiagnostic(bytes.length, maxSourceBytes));
  }

  const document = await createSourceDocument(input.name, text, bytes);

  return { document, diagnostics };
}

async function createSourceDocument(
  name: string | undefined,
  text: string,
  bytes: Uint8Array,
): Promise<PptvSourceDocument> {
  const sha256 = await sha256Hex(bytes);
  const retainedBytes = bytes.slice();
  const document: PptvSourceDocument = Object.freeze({
    ...(name === undefined ? {} : { name }),
    text,
    get bytes(): Uint8Array {
      return retainedBytes.slice();
    },
    charLength: text.length,
    byteLength: retainedBytes.length,
    sha256,
  });
  return document;
}

function sourceLimitDiagnostic(
  byteLength: number,
  maxSourceBytes: number,
): Diagnostic {
  return {
    code: "PPTV-SCAN-SOURCE-LIMIT",
    severity: "fatal",
    message: `PPTV source is ${byteLength} bytes; the configured limit is ${maxSourceBytes} bytes.`,
  };
}

function isWellFormedUtf16(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

export function sliceRange(
  source: PptvSourceDocument,
  range: SourceRange,
): string {
  return source.text.slice(range.charStart, range.charEnd);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.slice().buffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function buildByteOffsets(text: string): Uint32Array {
  const offsets = new Uint32Array(text.length + 1);
  let byteOffset = 0;

  for (let index = 0; index < text.length; index += 1) {
    offsets[index] = byteOffset;
    const codePoint = text.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) {
      // No parser location can validly end between a surrogate pair, but
      // retaining the preceding byte offset makes that invalid position safe.
      offsets[index + 1] = byteOffset;
      byteOffset += 4;
      index += 1;
      offsets[index] = byteOffset;
      continue;
    }

    if (codePoint <= 0x7f) byteOffset += 1;
    else if (codePoint <= 0x7ff) byteOffset += 2;
    else byteOffset += 3;
  }

  offsets[text.length] = byteOffset;
  return offsets;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) index += 1;
      starts.push(index + 1);
    } else if (codeUnit === 0x0a) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function isUnicodeScalarBoundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true;
  const previous = text.charCodeAt(offset - 1);
  const current = text.charCodeAt(offset);
  return !(
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    current >= 0xdc00 &&
    current <= 0xdfff
  );
}
