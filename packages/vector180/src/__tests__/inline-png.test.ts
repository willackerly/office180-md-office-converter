// Tests: CONTRACT:C4-PPTV-SOURCE.2.0
// Tests: CONTRACT:C6-PPTV-RESOLVED.2.0

import { describe, expect, it } from "vitest";

import { inspectVector180Conformance } from "../browser/runtime.js";
import { loadAtom } from "../core/deck.js";
import {
  MAX_VECTOR180_INLINE_PNG_BYTES,
  parseVector180InlinePngDataUri,
} from "../core/inline-png.js";
import { resolveVector180Atom } from "../core/resolved.js";
import { scanVector180Source } from "../core/scan.js";
import { sha256HexSync } from "../core/source.js";
import { getAtomObject } from "../ops/projections.js";
import { errorCodes } from "./test-helpers.js";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const ONE_PIXEL_PNG_DATA_URI = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;

function atomSource(
  attributes = `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
  element = "image",
  controls = `data-vector180-role="asset" data-vector180-export="raster"`,
): string {
  return `<svg id="inline-png" data-vector180-version="0.1"
     viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <${element} id="inline-png.background" ${controls}
       ${attributes}/>
</svg>
`;
}

describe("strict inline PNG resource", () => {
  it("decodes one canonical static PNG to a frozen digest descriptor", () => {
    const parsed = parseVector180InlinePngDataUri(ONE_PIXEL_PNG_DATA_URI);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.descriptor).toEqual({
      mediaType: "image/png",
      sha256: sha256HexSync(parsed.bytes),
      byteLength: 68,
      widthPixels: 1,
      heightPixels: 1,
    });
    expect(Object.isFrozen(parsed.descriptor)).toBe(true);
    expect(new TextDecoder().decode(parsed.bytes.slice(1, 4))).toBe("PNG");
  });

  it.each([
    {
      name: "non-canonical MIME spelling",
      value: ONE_PIXEL_PNG_DATA_URI.replace("image/png", "image/PNG"),
      code: "VECTOR180-INLINE-PNG-DATA-URI",
    },
    {
      name: "whitespace",
      value: ONE_PIXEL_PNG_DATA_URI.replace("base64,", "base64,\n"),
      code: "VECTOR180-INLINE-PNG-DATA-URI",
    },
    {
      name: "non-canonical padding bits",
      value: "data:image/png;base64,AB==",
      code: "VECTOR180-INLINE-PNG-DATA-URI",
    },
    {
      name: "decoded resource limit",
      value: `data:image/png;base64,${"AAAA".repeat(
        Math.floor(MAX_VECTOR180_INLINE_PNG_BYTES / 3) + 2,
      )}`,
      code: "VECTOR180-INLINE-PNG-LIMIT",
    },
    {
      name: "invalid PNG signature",
      value: pngDataUri(
        mutatePng((bytes) => {
          bytes[0] = 0;
        }),
      ),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "invalid chunk CRC",
      value: pngDataUri(
        mutatePng((bytes) => {
          bytes[32] = bytes[32]! ^ 1;
        }),
      ),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "zero dimension",
      value: pngDataUri(
        mutateIhdr((bytes) => {
          writeUint32(bytes, 16, 0);
        }),
      ),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "pixel limit",
      value: pngDataUri(
        mutateIhdr((bytes) => {
          writeUint32(bytes, 16, 4096);
          writeUint32(bytes, 20, 4097);
        }),
      ),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "interlacing",
      value: pngDataUri(
        mutateIhdr((bytes) => {
          bytes[28] = 1;
        }),
      ),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "APNG animation",
      value: pngDataUri(withChunkBeforeIdat("acTL", new Uint8Array(8))),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "empty IDAT chunk",
      value: pngDataUri(withChunkBeforeIdat("IDAT", new Uint8Array(0))),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
    {
      name: "trailing bytes",
      value: pngDataUri(Uint8Array.from([...onePixelPngBytes(), 0])),
      code: "VECTOR180-INLINE-PNG-FORMAT",
    },
  ])("rejects $name without throwing", ({ value, code }) => {
    const parsed = parseVector180InlinePngDataUri(value);
    expect(parsed).toMatchObject({ ok: false, code });
  });

  it("admits the data URI only on an explicit canonical raster image", async () => {
    const valid = await scanVector180Source({
      kind: "text",
      text: atomSource(),
      name: "inline-png.vector180.svg",
    });
    const validXlink = await scanVector180Source({
      kind: "text",
      text: atomSource(
        `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       xlink:href="${ONE_PIXEL_PNG_DATA_URI}"`,
      ),
    });
    const invalid = await Promise.all([
      scanVector180Source({
        kind: "text",
        text: atomSource(
          `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
          "image",
          `data-vector180-role="asset" data-vector180-export="native"`,
        ),
      }),
      scanVector180Source({
        kind: "text",
        text: atomSource(
          `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
          "g",
          `data-vector180-role="asset" data-vector180-export="svg"`,
        ),
      }),
      scanVector180Source({
        kind: "text",
        text: atomSource().replaceAll("data-vector180-", "data-pptv-"),
      }),
      scanVector180Source({
        kind: "text",
        text: atomSource(
          `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"
       xlink:href="${ONE_PIXEL_PNG_DATA_URI}"`,
        ),
      }),
      scanVector180Source({
        kind: "text",
        text: atomSource(
          `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="#local"`,
        ),
      }),
      scanVector180Source({
        kind: "text",
        text: atomSource(
          `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="asset.png"`,
        ),
      }),
    ]);

    expect(errorCodes(valid.diagnostics)).toEqual([]);
    expect(errorCodes(validXlink.diagnostics)).toEqual([]);
    expect(errorCodes(invalid[0]!.diagnostics)).toContain(
      "VECTOR180-SECURITY-URL",
    );
    expect(errorCodes(invalid[1]!.diagnostics)).toContain(
      "VECTOR180-SECURITY-URL",
    );
    expect(errorCodes(invalid[2]!.diagnostics)).toContain(
      "VECTOR180-SECURITY-URL",
    );
    expect(errorCodes(invalid[3]!.diagnostics)).toContain(
      "VECTOR180-SECURITY-URL",
    );
    // Same-document fragments remain non-fetching at C4 but are refused by C6.
    expect(errorCodes(invalid[4]!.diagnostics)).not.toContain(
      "VECTOR180-SECURITY-URL",
    );
    expect(errorCodes(invalid[5]!.diagnostics)).toContain(
      "VECTOR180-SECURITY-URL",
    );
  });

  it("never echoes malformed inline bytes into scan or browser diagnostics", async () => {
    const payload = "A".repeat(128);
    const source = atomSource(
      `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="data:image/png;base64,${payload}"`,
    );
    const scan = await scanVector180Source({
      kind: "text",
      text: source,
      name: "malformed-inline-png.vector180.svg",
    });
    const atom = await loadAtom({
      kind: "text",
      text: source,
      name: "malformed-inline-png.vector180.svg",
    });
    const editing = getAtomObject(atom, "inline-png.background", "editing");
    const browser = await inspectVector180Conformance({
      kind: "text",
      text: source,
      name: "malformed-inline-png.vector180.svg",
    });

    for (const projection of [scan.diagnostics, editing, browser]) {
      const json = JSON.stringify(projection);
      expect(json).not.toContain(payload);
      expect(json).not.toContain("data:image/png");
    }
    expect(JSON.stringify(scan.diagnostics)).toContain(
      "<inline-data-uri:redacted>",
    );
    expect(JSON.stringify(browser)).toContain("<inline-data-uri:redacted>");
    expect(editing?.object.attributes).not.toHaveProperty("href");
  });

  it("resolves exact geometry and aspect to descriptor-only JSON", async () => {
    const source = atomSource();
    const atom = await loadAtom({ kind: "text", text: source });
    const resolved = resolveVector180Atom(atom);
    const object = resolved.model?.objects[0];

    expect(resolved.diagnostics).toEqual([]);
    expect(object).toMatchObject({
      kind: "raster-asset",
      localBounds: { x: 0, y: 0, width: 1, height: 1 },
      resource: {
        mediaType: "image/png",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        byteLength: 68,
        widthPixels: 1,
        heightPixels: 1,
      },
    });
    expect(JSON.stringify(resolved.model)).not.toContain("data:image/png");
    expect(JSON.parse(JSON.stringify(resolved.model))).toEqual(resolved.model);
  });

  it.each([
    {
      name: "fragment reference",
      attributes: `x="0" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1" href="#local"`,
      code: "VECTOR180-PROFILE-RESOURCE",
    },
    {
      name: "missing explicit image geometry",
      attributes: `data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
      code: "VECTOR180-PROFILE-NUMBER",
    },
    {
      name: "geometry differing from bounds",
      attributes: `x="1" y="0" width="1" height="1"
       data-vector180-bounds="0 0 1 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
      code: "VECTOR180-PROFILE-GEOMETRY",
    },
    {
      name: "intrinsic aspect mismatch",
      attributes: `x="0" y="0" width="2" height="1"
       data-vector180-bounds="0 0 2 1"
       href="${ONE_PIXEL_PNG_DATA_URI}"`,
      code: "VECTOR180-PROFILE-RESOURCE",
    },
  ])("refuses $name during resolution", async ({ attributes, code }) => {
    const atom = await loadAtom({ kind: "text", text: atomSource(attributes) });
    const resolved = resolveVector180Atom(atom);
    expect(resolved.model).toBeUndefined();
    expect(errorCodes(resolved.diagnostics)).toContain(code);
  });

  it("redacts embedded bytes from semantic, editing, and browser projections", async () => {
    const source = atomSource();
    const atom = await loadAtom({ kind: "text", text: source });
    const semantic = getAtomObject(atom, "inline-png.background", "semantic");
    const editing = getAtomObject(atom, "inline-png.background", "editing");
    const browser = await inspectVector180Conformance({
      kind: "text",
      text: source,
      name: "inline-png.vector180.svg",
    });

    for (const projection of [semantic, editing, browser]) {
      const json = JSON.stringify(projection);
      expect(json).not.toContain("data:image/png");
      expect(json).not.toContain(ONE_PIXEL_PNG_BASE64);
      expect(json).toContain('"mediaType":"image/png"');
      expect(json).toMatch(/"sha256":"[0-9a-f]{64}"/u);
    }
    expect(editing?.object.attributes).not.toHaveProperty("href");
    expect(atom.source.text).toBe(source);
    expect(atom.source.text).toContain(ONE_PIXEL_PNG_DATA_URI);
  });
});

function onePixelPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
}

function pngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function mutatePng(mutate: (bytes: Uint8Array) => void): Uint8Array {
  const bytes = onePixelPngBytes();
  mutate(bytes);
  return bytes;
}

function mutateIhdr(mutate: (bytes: Uint8Array) => void): Uint8Array {
  const bytes = mutatePng(mutate);
  writeUint32(bytes, 29, crc32(bytes, 12, 29));
  return bytes;
}

function withChunkBeforeIdat(type: string, data: Uint8Array): Uint8Array {
  const source = onePixelPngBytes();
  const insertionOffset = 33;
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  for (let index = 0; index < 4; index += 1) {
    chunk[4 + index] = type.charCodeAt(index);
  }
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.byteLength, crc32(chunk, 4, 8 + data.byteLength));
  return Uint8Array.from([
    ...source.slice(0, insertionOffset),
    ...chunk,
    ...source.slice(insertionOffset),
  ]);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
