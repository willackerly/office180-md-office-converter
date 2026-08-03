/**
 * UTF-8 source materialization, hashing, and dual-coordinate mapping.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 */

import type {
  Diagnostic,
  Vector180Input,
  Vector180SourceDocument,
  SourceRange,
} from "./types.js";

const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export interface MaterializeSourceOptions {
  maxSourceBytes?: number;
}

export interface MaterializeSourceResult {
  document: Vector180SourceDocument;
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
  input: Vector180Input,
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
        code: "VECTOR180-SCAN-INVALID-UTF8",
        severity: "fatal",
        message: "Vector180 byte input must be valid UTF-8.",
      });
    }
  } else {
    text = input.text;
    if (!isWellFormedUtf16(text)) {
      diagnostics.push({
        code: "VECTOR180-SCAN-INVALID-UTF8",
        severity: "fatal",
        message:
          "Vector180 text input must not contain unpaired UTF-16 surrogates.",
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
): Promise<Vector180SourceDocument> {
  const sha256 = await sha256Hex(bytes);
  const retainedBytes = bytes.slice();
  const document: Vector180SourceDocument = Object.freeze({
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
    code: "VECTOR180-SCAN-SOURCE-LIMIT",
    severity: "fatal",
    message: `Vector180 source is ${byteLength} bytes; the configured limit is ${maxSourceBytes} bytes.`,
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
  source: Vector180SourceDocument,
  range: SourceRange,
): string {
  return source.text.slice(range.charStart, range.charEnd);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return sha256HexSync(bytes);
}

/**
 * Portable, allocation-bounded SHA-256 used by synchronous semantic
 * projections. The source scanner retains the async facade above so existing
 * callers do not gain timing-dependent behavior.
 */
export function sha256HexSync(bytes: Uint8Array): string {
  const initial = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;
  const bitLength = BigInt(bytes.byteLength) * 8n;
  for (let offset = 0; offset < 8; offset += 1) {
    padded[paddedLength - 1 - offset] = Number(
      (bitLength >> BigInt(offset * 8)) & 0xffn,
    );
  }

  const hash = initial.slice();
  const words = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] =
        (((padded[offset] ?? 0) << 24) |
          ((padded[offset + 1] ?? 0) << 16) |
          ((padded[offset + 2] ?? 0) << 8) |
          (padded[offset + 3] ?? 0)) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) +
          sigma0 +
          (words[index - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + (constants[index] ?? 0) + (words[index] ?? 0)) >>>
        0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }
  return [...hash].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
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
