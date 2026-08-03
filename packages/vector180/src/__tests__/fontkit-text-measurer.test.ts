// Tests: CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { createHash } from "node:crypto";
import { mkdtemp, rm, truncate, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Font, FontCollection, GlyphRun } from "fontkit";
import { afterEach, describe, expect, it, vi } from "vitest";

const fontkitMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("fontkit", () => ({
  create: fontkitMocks.create,
}));

import {
  createDefaultFontkitTextMeasurer,
  createFontkitTextMeasurer,
  parseFontMap,
} from "../node/fontkit-text-measurer.js";

interface FakeFontOptions {
  readonly family?: string;
  readonly weight?: number;
  readonly italic?: boolean;
  readonly unitsPerEm?: number;
  readonly advances?: readonly number[];
  readonly missingCodepoints?: ReadonlySet<number>;
  readonly postscriptName?: string;
  readonly fullName?: string;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("fontkit text measurer", () => {
  it("loads the pinned packaged default with privacy-bounded evidence", async () => {
    fontkitMocks.create.mockReturnValue(
      fakeFont({
        family: "ABeeZee",
        postscriptName: "ABeeZee-Regular",
        fullName: "ABeeZee Regular",
      }),
    );

    const measurer = await createDefaultFontkitTextMeasurer();
    expect(measurer.faces).toHaveLength(1);
    expect(measurer.defaultEnvironment).toMatchObject({
      schema: "office180-vector180-default-font-map/0.1",
      selection: "packaged-default",
      mapSha256:
        "dc012dc7e13d15138e46147fd37724acffc1e0d2afb3e7554d6af821f479ae36",
      font: {
        family: "ABeeZee",
        weight: 400,
        style: "normal",
        postscriptName: "ABeeZee-Regular",
        bytes: 46_016,
        sha256:
          "2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9",
      },
      license: {
        id: "OFL-1.1",
        bytes: 4_516,
        sha256:
          "f0376d04eb58fb19e9f1690a99a1eb37380ad0246f7d503f2abd8e8a74ed12be",
      },
      adapter: "fontkit/2.0.4",
      runtime: {
        nodeVersion: process.version,
      },
    });
    const serialized = JSON.stringify(measurer.defaultEnvironment);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("hostname");
    expect(serialized).not.toContain("environment");
  });

  it("hashes, verifies, caches, and shapes one explicitly mapped face", async () => {
    const bytes = Buffer.from("deterministic fake font bytes");
    const font = fakeFont({
      advances: [600, 475],
    });
    fontkitMocks.create.mockReturnValue(font);

    await withFontFile(bytes, async (path) => {
      const mutableEntry = {
        family: "Demo Sans",
        weight: 400 as const,
        style: "normal" as const,
        path,
      };
      const measurer = await createFontkitTextMeasurer([mutableEntry]);
      mutableEntry.path = "/does/not/exist.ttf";
      await unlink(path);

      const request = {
        slideId: "cover",
        objectId: "cover.title",
        lineIndex: 0,
        text: "AV",
        font: {
          family: "demo sans",
          size: 20,
          weight: 400 as const,
          style: "normal" as const,
        },
      };
      const first = measurer(request);
      const second = measurer(request);
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      expect(first).toEqual({
        kind: "measured",
        width: 21.5,
        method: "fontkit/2.0.4",
        fontIdentity: `${sha256}#DemoSans-Regular`,
        unsupportedShapingFeatures: [],
        evidence: {
          method: "fontkit/2.0.4",
          requestedFace: {
            family: "demo sans",
            weight: 400,
            style: "normal",
          },
          loadedFace: {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
            sha256,
            postscriptName: "DemoSans-Regular",
            fullName: "Demo Sans Regular",
            unitsPerEm: 1000,
          },
        },
      });
      expect(second).toEqual(first);
      expect(font.layout).toHaveBeenCalledTimes(2);
      expect(fontkitMocks.create).toHaveBeenCalledTimes(1);
      expect(fontkitMocks.create).toHaveBeenCalledWith(bytes);
      expect(measurer.faces).toEqual([
        expect.objectContaining({ path, sha256 }),
      ]);
      expect(Object.isFrozen(measurer)).toBe(true);
      expect(Object.isFrozen(measurer.faces)).toBe(true);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.evidence)).toBe(true);
    });
  });

  it("returns unverified for an unmapped face without discovery or substitution", async () => {
    const font = fakeFont({});
    fontkitMocks.create.mockReturnValue(font);

    await withFontFile(Buffer.from("regular"), async (path) => {
      const measurer = await createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path,
        },
      ]);
      const result = measurer({
        slideId: "cover",
        objectId: "cover.subtitle",
        lineIndex: 0,
        text: "Do not substitute",
        font: {
          family: "Demo Sans",
          size: 16,
          weight: 700,
          style: "normal",
        },
      });

      expect(result).toEqual({
        kind: "unverified",
        method: "fontkit/2.0.4",
        reason: "unmapped-face",
        unsupportedShapingFeatures: [],
        evidence: {
          method: "fontkit/2.0.4",
          requestedFace: {
            family: "Demo Sans",
            weight: 700,
            style: "normal",
          },
          loadedFace: null,
        },
      });
      expect(font.layout).not.toHaveBeenCalled();
    });
  });

  it("uses the same exact mapped face for standalone-diagram requests", async () => {
    const font = fakeFont({ advances: [500] });
    fontkitMocks.create.mockReturnValue(font);

    await withFontFile(Buffer.from("diagram face"), async (path) => {
      const measurer = await createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path,
        },
      ]);

      const result = measurer({
        atomId: "system-overview",
        objectId: "system-overview.title",
        lineIndex: 0,
        text: "A",
        font: {
          family: "Demo Sans",
          size: 20,
          weight: 400,
          style: "normal",
        },
      });

      expect(result).toMatchObject({
        kind: "measured",
        width: 10,
        method: "fontkit/2.0.4",
      });
      expect(font.layout).toHaveBeenCalledWith("A");
    });
  });

  it("reports unique missing Unicode codepoints and does not call them exact", async () => {
    const rocket = 0x1f680;
    const font = fakeFont({
      advances: [500, 700, 700],
      missingCodepoints: new Set([rocket]),
    });
    fontkitMocks.create.mockReturnValue(font);

    await withFontFile(Buffer.from("glyph coverage"), async (path) => {
      const measurer = await createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path,
        },
      ]);
      const result = measurer({
        slideId: "cover",
        objectId: "cover.emoji",
        lineIndex: 0,
        text: "A🚀🚀",
        font: {
          family: "Demo Sans",
          size: 10,
          weight: 400,
          style: "normal",
        },
      });

      expect(result.kind).toBe("unverified");
      if (result.kind !== "unverified") {
        throw new Error("Expected an unverified result");
      }
      expect(result.reason).toBe("missing-glyphs");
      expect(result.missingCodepoints).toEqual([rocket]);
      expect(Object.isFrozen(result.missingCodepoints)).toBe(true);
      expect(font.hasGlyphForCodePoint).toHaveBeenCalledWith(rocket);
      expect(font.layout).not.toHaveBeenCalled();
    });
  });

  it("selects collection faces but only verifies PostScript names on static fonts", async () => {
    const bytes = Buffer.from("collection bytes");
    const font = fakeFont({ advances: [500] });
    const getFont = vi.fn().mockReturnValue(font);
    fontkitMocks.create.mockReturnValue({
      type: "TTC",
      fonts: [font],
      getFont,
    } satisfies FontCollection);

    await withFontFile(bytes, async (path) => {
      const measurer = await createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path,
          postscriptName: "DemoSans-Regular",
        },
      ]);
      const result = measurer({
        slideId: "cover",
        objectId: "cover.title",
        lineIndex: 0,
        text: "A",
        font: {
          family: "Demo Sans",
          size: 10,
          weight: 400,
          style: "normal",
        },
      });
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      expect(fontkitMocks.create).toHaveBeenCalledWith(bytes);
      expect(getFont).toHaveBeenCalledWith("DemoSans-Regular");
      expect(result).toEqual(
        expect.objectContaining({
          kind: "measured",
          fontIdentity: `${sha256}#DemoSans-Regular`,
        }),
      );
    });

    vi.clearAllMocks();
    const staticBytes = Buffer.from("static font bytes");
    fontkitMocks.create.mockReturnValue(font);
    await withFontFile(staticBytes, async (path) => {
      await createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path,
          postscriptName: "DemoSans-Regular",
        },
      ]);

      expect(fontkitMocks.create).toHaveBeenCalledWith(staticBytes);
    });
  });

  it("rejects ambiguous maps, font collections, and mismatched face metadata", async () => {
    await expect(
      createFontkitTextMeasurer(
        Array.from({ length: 33 }, (_, index) => ({
          family: `Demo Sans ${index}`,
          weight: 400 as const,
          style: "normal" as const,
          path: `/face-${index}.ttf`,
        })),
      ),
    ).rejects.toThrow(/32-face capability limit/u);
    expect(fontkitMocks.create).not.toHaveBeenCalled();

    await expect(
      createFontkitTextMeasurer([
        {
          family: "Demo Sans",
          weight: 400,
          style: "normal",
          path: "/one.ttf",
        },
        {
          family: " demo sans ",
          weight: 400,
          style: "normal",
          path: "/two.ttf",
        },
      ]),
    ).rejects.toThrow(/duplicate face/u);
    expect(fontkitMocks.create).not.toHaveBeenCalled();

    fontkitMocks.create.mockReturnValue({
      type: "TTC",
      fonts: [],
      getFont: vi.fn(),
    } satisfies FontCollection);
    await withFontFile(Buffer.from("collection"), async (path) => {
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
          },
        ]),
      ).rejects.toThrow(/requires an explicit PostScript face/u);
    });

    fontkitMocks.create.mockReturnValue(
      fakeFont({ family: "Different Family" }),
    );
    await withFontFile(Buffer.from("wrong face"), async (path) => {
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
          },
        ]),
      ).rejects.toThrow(/reports family "Different Family"/u);
    });

    fontkitMocks.create.mockReturnValue(fakeFont({ weight: 700 }));
    await withFontFile(Buffer.from("wrong weight"), async (path) => {
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
          },
        ]),
      ).rejects.toThrow(/reports weight 700/u);
    });

    fontkitMocks.create.mockReturnValue(fakeFont({ italic: true }));
    await withFontFile(Buffer.from("wrong style"), async (path) => {
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
          },
        ]),
      ).rejects.toThrow(/reports style "italic"/u);
    });

    const directory = await mkdtemp(
      join(tmpdir(), "vector180-fontkit-directory-"),
    );
    try {
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path: directory,
          },
        ]),
      ).rejects.toThrow(/not a regular file/u);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }

    await withFontFile(Buffer.alloc(0), async (path) => {
      await truncate(path, 64 * 1024 * 1024 + 1);
      await expect(
        createFontkitTextMeasurer([
          {
            family: "Demo Sans",
            weight: 400,
            style: "normal",
            path,
          },
        ]),
      ).rejects.toThrow(/67108864-byte file limit/u);
    });

    vi.clearAllMocks();
    const aggregateDirectory = await mkdtemp(
      join(tmpdir(), "vector180-fontkit-aggregate-"),
    );
    try {
      const sizes = [
        64 * 1024 * 1024,
        64 * 1024 * 1024,
        64 * 1024 * 1024,
        64 * 1024 * 1024,
        1,
      ];
      const faces = [];
      for (const [index, size] of sizes.entries()) {
        const path = join(aggregateDirectory, `face-${index}.ttf`);
        await writeFile(path, "");
        await truncate(path, size);
        faces.push({
          family: `Demo Sans ${index}`,
          weight: 400 as const,
          style: "normal" as const,
          path,
        });
      }

      await expect(createFontkitTextMeasurer(faces)).rejects.toThrow(
        /268435456-byte aggregate font limit/u,
      );
      expect(fontkitMocks.create).not.toHaveBeenCalled();
    } finally {
      await rm(aggregateDirectory, { force: true, recursive: true });
    }
  });

  it("strictly parses a versioned font map and resolves relative paths", () => {
    const parsed = parseFontMap(
      {
        schema: "vector180-font-map/0.1",
        faces: [
          {
            family: "Demo Sans",
            weight: 700,
            style: "italic",
            path: "fonts/demo-bold-italic.ttc",
            postscriptName: "DemoSans-BoldItalic",
          },
        ],
      },
      "/deck",
    );

    expect(parsed).toEqual({
      schema: "vector180-font-map/0.1",
      faces: [
        {
          family: "Demo Sans",
          weight: 700,
          style: "italic",
          path: "/deck/fonts/demo-bold-italic.ttc",
          postscriptName: "DemoSans-BoldItalic",
        },
      ],
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.faces)).toBe(true);
    expect(Object.isFrozen(parsed.faces[0])).toBe(true);

    expect(() =>
      parseFontMap(
        {
          schema: "vector180-font-map/0.1",
          faces: [],
          fallback: "Arial",
        },
        "/deck",
      ),
    ).toThrow(/unknown key "fallback"/u);
    expect(() =>
      parseFontMap(
        {
          schema: "vector180-font-map/0.1",
          faces: [
            {
              family: "Demo Sans",
              weight: 400,
              style: "normal",
              path: "one.ttf",
            },
            {
              family: " demo sans ",
              weight: 400,
              style: "normal",
              path: "two.ttf",
            },
          ],
        },
        "/deck",
      ),
    ).toThrow(/duplicate face/u);
  });
});

function fakeFont(options: FakeFontOptions): Font {
  const missingCodepoints = options.missingCodepoints ?? new Set<number>();
  const advances = options.advances ?? [500];
  return {
    familyName: options.family ?? "Demo Sans",
    fullName: options.fullName ?? "Demo Sans Regular",
    postscriptName: options.postscriptName ?? "DemoSans-Regular",
    unitsPerEm: options.unitsPerEm ?? 1000,
    italicAngle: options.italic === true ? -12 : 0,
    "OS/2": {
      usWeightClass: options.weight ?? 400,
      fsSelection: {
        italic: options.italic === true,
        oblique: false,
      },
    },
    hasGlyphForCodePoint: vi.fn(
      (codepoint: number) => !missingCodepoints.has(codepoint),
    ),
    layout: vi.fn(
      () =>
        ({
          advanceWidth: 999_999,
          positions: advances.map((xAdvance) => ({
            xAdvance,
            yAdvance: 0,
            xOffset: 0,
            yOffset: 0,
          })),
        }) as GlyphRun,
    ),
  } as unknown as Font;
}

async function withFontFile(
  bytes: Buffer,
  action: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "vector180-fontkit-test-"));
  const path = join(directory, "face.ttf");
  try {
    await writeFile(path, bytes);
    await action(path);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
