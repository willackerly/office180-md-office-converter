/**
 * Strict, browser-safe decoding and structural validation for one embedded PNG.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import { sha256HexSync } from "./source.js";
import type {
  Vector180InlinePngParseFailureCode,
  Vector180InlinePngParseResult,
  Vector180InlinePngResourceDescriptor,
} from "./types.js";

export const MAX_VECTOR180_INLINE_PNG_BYTES = 4 * 1024 * 1024;
export const MAX_VECTOR180_INLINE_PNG_PIXELS = 16 * 1024 * 1024;

const DATA_URI_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_PNG_DIMENSION = 0x7fffffff;
const BASE64_VALUES = base64Values();
const CRC32_TABLE = crc32Table();
const VALID_DEPTHS_BY_COLOR_TYPE = new Map<number, ReadonlySet<number>>([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);
const KNOWN_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
const APNG_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);

export function parseVector180InlinePngDataUri(
  value: string,
): Vector180InlinePngParseResult {
  if (
    !value.startsWith(DATA_URI_PREFIX) ||
    /[\u0000-\u0020\u007f]/u.test(value)
  ) {
    return failure(
      "VECTOR180-INLINE-PNG-DATA-URI",
      "Inline raster data must use the exact whitespace-free data:image/png;base64 form.",
    );
  }

  const encoded = value.slice(DATA_URI_PREFIX.length);
  const decoded = decodeCanonicalBase64(encoded);
  if (!decoded.ok) return decoded;

  const png = inspectStaticPng(decoded.bytes);
  if (!png.ok) return png;

  const descriptor: Vector180InlinePngResourceDescriptor = Object.freeze({
    mediaType: "image/png",
    sha256: sha256HexSync(decoded.bytes),
    byteLength: decoded.bytes.byteLength,
    widthPixels: png.widthPixels,
    heightPixels: png.heightPixels,
  });
  return Object.freeze({
    ok: true,
    descriptor,
    bytes: decoded.bytes,
  });
}

function decodeCanonicalBase64(
  encoded: string,
):
  | { readonly ok: true; readonly bytes: Uint8Array }
  | Extract<Vector180InlinePngParseResult, { readonly ok: false }> {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
  ) {
    return failure(
      "VECTOR180-INLINE-PNG-DATA-URI",
      "Inline PNG bytes must use canonical padded RFC 4648 base64.",
    );
  }

  const firstPadding = encoded.indexOf("=");
  if (
    firstPadding >= 0 &&
    firstPadding < encoded.length - (encoded.endsWith("==") ? 2 : 1)
  ) {
    return failure(
      "VECTOR180-INLINE-PNG-DATA-URI",
      "Inline PNG base64 padding is not canonical.",
    );
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const byteLength = (encoded.length / 4) * 3 - padding;
  if (byteLength <= 0 || byteLength > MAX_VECTOR180_INLINE_PNG_BYTES) {
    return failure(
      "VECTOR180-INLINE-PNG-LIMIT",
      `Inline PNG decoded length must be between 1 and ${MAX_VECTOR180_INLINE_PNG_BYTES} bytes.`,
    );
  }

  const bytes = new Uint8Array(byteLength);
  let outputOffset = 0;
  for (let inputOffset = 0; inputOffset < encoded.length; inputOffset += 4) {
    const first = base64Value(encoded.charCodeAt(inputOffset));
    const second = base64Value(encoded.charCodeAt(inputOffset + 1));
    const thirdCharacter = encoded[inputOffset + 2]!;
    const fourthCharacter = encoded[inputOffset + 3]!;
    const third =
      thirdCharacter === "=" ? 0 : base64Value(thirdCharacter.charCodeAt(0));
    const fourth =
      fourthCharacter === "=" ? 0 : base64Value(fourthCharacter.charCodeAt(0));
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      return failure(
        "VECTOR180-INLINE-PNG-DATA-URI",
        "Inline PNG base64 contains an invalid alphabet character.",
      );
    }
    const finalQuartet = inputOffset + 4 === encoded.length;
    if (
      (!finalQuartet && (thirdCharacter === "=" || fourthCharacter === "=")) ||
      (thirdCharacter === "=" && fourthCharacter !== "=") ||
      (finalQuartet &&
        ((padding === 2 && (second & 0x0f) !== 0) ||
          (padding === 1 && (third & 0x03) !== 0)))
    ) {
      return failure(
        "VECTOR180-INLINE-PNG-DATA-URI",
        "Inline PNG base64 has non-canonical padding bits.",
      );
    }

    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (outputOffset < byteLength) bytes[outputOffset++] = combined >>> 16;
    if (outputOffset < byteLength) bytes[outputOffset++] = combined >>> 8;
    if (outputOffset < byteLength) bytes[outputOffset++] = combined;
  }
  return { ok: true, bytes };
}

function inspectStaticPng(bytes: Uint8Array):
  | {
      readonly ok: true;
      readonly widthPixels: number;
      readonly heightPixels: number;
    }
  | Extract<Vector180InlinePngParseResult, { readonly ok: false }> {
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength + 12 ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    return pngFailure(
      "Inline raster bytes do not have the exact PNG signature.",
    );
  }

  let offset = PNG_SIGNATURE.byteLength;
  let chunkIndex = 0;
  let widthPixels = 0;
  let heightPixels = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let sawNonImageDataAfterImageData = false;
  let imageDataBytes = 0;

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) {
      return pngFailure("Inline PNG ends inside a chunk frame.");
    }
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    if (
      !Number.isSafeInteger(nextOffset) ||
      nextOffset > bytes.byteLength ||
      length > MAX_VECTOR180_INLINE_PNG_BYTES
    ) {
      return pngFailure("Inline PNG declares an out-of-bounds chunk.");
    }
    const type = chunkType(bytes, typeOffset);
    if (type === undefined) {
      return pngFailure(
        "Inline PNG chunk types must contain four ASCII letters.",
      );
    }
    const expectedCrc = readUint32(bytes, crcOffset);
    const actualCrc = pngCrc32(bytes, typeOffset, crcOffset);
    if (expectedCrc !== actualCrc) {
      return pngFailure(`Inline PNG chunk ${type} has an invalid CRC.`);
    }
    if (APNG_CHUNKS.has(type)) {
      return pngFailure(
        "Animated PNG chunks are outside the static asset profile.",
      );
    }
    if (type.charCodeAt(0) >= 0x41 && type.charCodeAt(0) <= 0x5a) {
      if (!KNOWN_CRITICAL_CHUNKS.has(type)) {
        return pngFailure(
          `Inline PNG uses unsupported critical chunk ${type}.`,
        );
      }
    }

    if (chunkIndex === 0 && type !== "IHDR") {
      return pngFailure("Inline PNG must begin with one IHDR chunk.");
    }
    if (type === "IHDR") {
      if (sawHeader || chunkIndex !== 0 || length !== 13) {
        return pngFailure(
          "Inline PNG must contain exactly one 13-byte IHDR first.",
        );
      }
      widthPixels = readUint32(bytes, dataOffset);
      heightPixels = readUint32(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8]!;
      colorType = bytes[dataOffset + 9]!;
      const compression = bytes[dataOffset + 10]!;
      const filter = bytes[dataOffset + 11]!;
      const interlace = bytes[dataOffset + 12]!;
      if (
        widthPixels <= 0 ||
        heightPixels <= 0 ||
        widthPixels > MAX_PNG_DIMENSION ||
        heightPixels > MAX_PNG_DIMENSION ||
        widthPixels > Math.floor(MAX_VECTOR180_INLINE_PNG_PIXELS / heightPixels)
      ) {
        return pngFailure(
          `Inline PNG dimensions must be positive and contain at most ${MAX_VECTOR180_INLINE_PNG_PIXELS} pixels.`,
        );
      }
      if (!VALID_DEPTHS_BY_COLOR_TYPE.get(colorType)?.has(bitDepth)) {
        return pngFailure(
          `Inline PNG bit depth ${bitDepth} is invalid for color type ${colorType}.`,
        );
      }
      if (compression !== 0 || filter !== 0 || interlace !== 0) {
        return pngFailure(
          "Inline PNG requires compression method 0, filter method 0, and non-interlaced storage.",
        );
      }
      sawHeader = true;
    } else if (!sawHeader) {
      return pngFailure("Inline PNG data appears before IHDR.");
    } else if (type === "PLTE") {
      if (
        sawPalette ||
        sawImageData ||
        length === 0 ||
        length % 3 !== 0 ||
        length > 768 ||
        (colorType === 3 && length / 3 > 2 ** bitDepth) ||
        colorType === 0 ||
        colorType === 4
      ) {
        return pngFailure("Inline PNG has an invalid or misplaced PLTE chunk.");
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (sawNonImageDataAfterImageData || length === 0) {
        return pngFailure(
          "Inline PNG IDAT chunks must be consecutive and non-empty.",
        );
      }
      sawImageData = true;
      imageDataBytes += length;
      if (
        !Number.isSafeInteger(imageDataBytes) ||
        imageDataBytes > MAX_VECTOR180_INLINE_PNG_BYTES
      ) {
        return pngFailure("Inline PNG image data exceeds the resource limit.");
      }
    } else if (type === "IEND") {
      if (
        length !== 0 ||
        !sawImageData ||
        imageDataBytes === 0 ||
        (colorType === 3 && !sawPalette)
      ) {
        return pngFailure("Inline PNG has an invalid terminal IEND state.");
      }
      if (nextOffset !== bytes.byteLength) {
        return pngFailure("Inline PNG contains trailing bytes after IEND.");
      }
      return {
        ok: true,
        widthPixels,
        heightPixels,
      };
    } else if (sawImageData) {
      sawNonImageDataAfterImageData = true;
    }

    offset = nextOffset;
    chunkIndex += 1;
  }
  return pngFailure("Inline PNG is missing its terminal IEND chunk.");
}

function base64Values(): Int16Array {
  const values = new Int16Array(128);
  values.fill(-1);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let index = 0; index < alphabet.length; index += 1) {
    values[alphabet.charCodeAt(index)] = index;
  }
  return values;
}

function base64Value(codePoint: number): number {
  return codePoint >= 0 && codePoint < BASE64_VALUES.length
    ? (BASE64_VALUES[codePoint] ?? -1)
    : -1;
}

function chunkType(bytes: Uint8Array, offset: number): string | undefined {
  let result = "";
  for (let index = 0; index < 4; index += 1) {
    const value = bytes[offset + index]!;
    if (!(
      (value >= 0x41 && value <= 0x5a) ||
      (value >= 0x61 && value <= 0x7a)
    )) {
      return undefined;
    }
    result += String.fromCharCode(value);
  }
  return result;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = (CRC32_TABLE[(crc ^ bytes[offset]!) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngFailure(
  message: string,
): Extract<Vector180InlinePngParseResult, { readonly ok: false }> {
  return failure("VECTOR180-INLINE-PNG-FORMAT", message);
}

function failure(
  code: Vector180InlinePngParseFailureCode,
  message: string,
): Extract<Vector180InlinePngParseResult, { readonly ok: false }> {
  return Object.freeze({ ok: false, code, message });
}
