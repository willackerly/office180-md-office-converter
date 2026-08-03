// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C5-PPTV-PATCH.2.0
// Tests: CONTRACT:C6-PPTV-RESOLVED.2.0, CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createEditorPack } from "../node/editor-pack.js";
import { readMinimalDeck } from "./test-helpers.js";

const execFileAsync = promisify(execFile);
const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const FONT_URL = new URL(
  "../../test-fixtures/fonts/ABeeZee-Regular.ttf",
  import.meta.url,
);
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("deterministic trusted editor pack", () => {
  it("embeds an exact inert deck, strict CSP, and fresh source-kind projections", async () => {
    const text = `\uFEFF${await readMinimalDeck()}`;
    const bytes = new TextEncoder().encode(text);
    const input = {
      kind: "bytes" as const,
      bytes,
      name: "minimal-deck.vector180.html",
    };

    const first = await createEditorPack(input);
    const second = await createEditorPack(input);

    expect(first.diagnostics).toEqual([]);
    expect(first.documentKind).toBe("deck");
    expect(first.html).toBe(second.html);
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.html).toContain("default-src 'none'");
    expect(first.html).toContain("connect-src 'none'");
    expect(first.html).toContain("font-src 'none'");
    expect(first.html).toContain("vector180-editor/0.1");
    expect(first.html).toContain("data-text-apply");
    expect(first.html).toContain("data-extract");
    expect(first.html).not.toContain(
      'data-vector180-runtime="vector180-browser/0.1"',
    );
    expect(first.html).not.toMatch(/\b(?:src|href)=["']https?:\/\//u);
    expect(first.html).not.toContain("fetch(");
    expect(first.html).not.toContain("XMLHttpRequest");

    const payload = editorPayload(first.html!);
    expect(payload.schema).toBe("vector180-editor-pack/0.1");
    expect(payload.documentKind).toBe("deck");
    expect(payload.downloadName).toBe("minimal-deck.vector180.html");
    expect(payload.downloadMime).toBe("text/html;charset=utf-8");
    expect(payload.sourceSha256).toBe(first.sourceSha256);
    expect(payload.outline.slides.map((slide) => slide.id)).toEqual([
      "cover",
      "architecture",
    ]);
    expect(payload.inventory.slides[0]?.objects[1]?.id).toBe("cover.title");
    expect(payload.resolved.schema).toBe("vector180-resolved-deck/0.1");
    expect(payload.resolved.slides[0]?.objects[1]).toMatchObject({
      id: "cover.title",
      kind: "text",
      wrap: "none",
      autofit: "none",
    });
    expect(payload.nodeTextFit.schema).toBe("vector180-text-fit-deck/0.1");
    expect(payload.nodeTextFit.summary.unverified).toBe(0);
    expect(payload.fonts).toHaveLength(1);
    expect(payload.fontEnvironment).toMatchObject({
      schema: "office180-vector180-default-font-map/0.1",
      font: { postscriptName: "ABeeZee-Regular" },
      license: { id: "OFL-1.1" },
    });
    expect(new Uint8Array(Buffer.from(payload.sourceBase64, "base64"))).toEqual(
      bytes,
    );
  });

  it("generates a first-class atom editor without synthetic deck state", async () => {
    const text = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
    const result = await createEditorPack({
      kind: "text",
      text,
      name: "system.vector180.svg",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.documentKind).toBe("atom");
    const payload = editorPayload(result.html!);
    expect(payload.documentKind).toBe("atom");
    expect(payload.downloadName).toBe("system.vector180.svg");
    expect(payload.downloadMime).toBe("image/svg+xml;charset=utf-8");
    expect(payload.outline).toMatchObject({
      schema: "vector180-atom-outline/0.1",
      atomId: "system-overview",
      viewBox: [-100, -50, 1200, 800],
    });
    expect(payload.inventory).toMatchObject({
      schema: "vector180-atom-inventory/0.1",
      atomId: "system-overview",
    });
    expect(payload.resolved).toMatchObject({
      schema: "vector180-resolved-atom/0.1",
      atomId: "system-overview",
    });
    expect(payload.nodeTextFit).toMatchObject({
      schema: "vector180-text-fit-atom/0.1",
      atomId: "system-overview",
    });
    expect(JSON.stringify(payload.outline)).not.toContain("slide");
    expect(JSON.stringify(payload.resolved)).not.toContain("activeTheme");
    expect(JSON.stringify(payload.resolved)).not.toContain("widthEmu");
  });

  it("embeds only explicitly mapped exact font bytes and Fontkit coverage", async () => {
    const text = (await readFile(MINIMAL_DIAGRAM_URL, "utf8"))
      .replaceAll("Arial", "ABeeZee")
      .replaceAll("font-weight: 700", "font-weight: 400")
      .replaceAll('font-weight="700"', 'font-weight="400"');
    const result = await createEditorPack(
      { kind: "text", text, name: "font-evidence.vector180.svg" },
      {
        fontFaces: [
          {
            family: "ABeeZee",
            weight: 400,
            style: "normal",
            path: fileURLToPath(FONT_URL),
            postscriptName: "ABeeZee-Regular",
          },
        ],
        nearLimit: 0.85,
      },
    );

    expect(result.diagnostics).toEqual([]);
    const payload = editorPayload(result.html!);
    expect(payload.nearLimit).toBe(0.85);
    expect(payload.fonts).toHaveLength(1);
    expect(payload.fonts[0]).toMatchObject({
      family: "ABeeZee",
      weight: 400,
      style: "normal",
      postscriptName: "ABeeZee-Regular",
      coverage: {
        method: "fontkit/2.0.4-cmap",
        missingCodepoints: [],
      },
    });
    expect(payload.fonts[0]?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(payload.fonts[0]?.coverage.checkedCodepoints).toContain(
      "S".codePointAt(0),
    );
    expect(Buffer.from(payload.fonts[0]!.sourceBase64, "base64")).toEqual(
      await readFile(FONT_URL),
    );
    expect(payload.nodeTextFit.summary.unverified).toBe(0);
    expect(
      payload.nodeTextFit.lines.every(
        (line) => line.method === "fontkit/2.0.4",
      ),
    ).toBe(true);
  });

  it("rejects invalid input and invalid editor-pack C8 thresholds", async () => {
    const text = (await readMinimalDeck()).replace(
      ' data-vector180-style="base"',
      "",
    );
    const result = await createEditorPack({ kind: "text", text });

    expect(result.html).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "VECTOR180-SCAN-SECTION-COUNT",
    );
    await expect(
      createEditorPack(
        {
          kind: "text",
          text: await readFile(MINIMAL_DIAGRAM_URL, "utf8"),
        },
        { nearLimit: 1 },
      ),
    ).rejects.toThrow(/must be greater than 0 and less than 1/u);
  });

  it("keeps the generated editor IIFE byte-locked to its TypeScript entry", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ["scripts/build-editor-app.mjs", "--check"],
        { cwd: PACKAGE_ROOT },
      ),
    ).resolves.toMatchObject({ stderr: "" });
  });
});

interface TestPayload {
  schema: string;
  documentKind: "deck" | "atom";
  downloadName: string;
  downloadMime: string;
  sourceSha256: string;
  sourceBase64: string;
  nearLimit: number;
  outline: {
    schema: string;
    atomId?: string;
    viewBox?: number[];
    slides: Array<{ id: string }>;
  };
  inventory: {
    schema: string;
    atomId?: string;
    slides: Array<{ objects: Array<{ id: string }> }>;
  };
  resolved: {
    schema: string;
    atomId?: string;
    activeTheme?: string;
    widthEmu?: number;
    slides: Array<{
      objects: Array<{
        id: string;
        kind: string;
        wrap?: string;
        autofit?: string;
      }>;
    }>;
  };
  nodeTextFit: {
    schema: string;
    atomId?: string;
    summary: { unverified: number };
    lines: Array<{ method: string }>;
  };
  fonts: Array<{
    family: string;
    weight: number;
    style: string;
    sourceBase64: string;
    sha256: string;
    postscriptName: string;
    coverage: {
      method: string;
      checkedCodepoints: number[];
      missingCodepoints: number[];
    };
  }>;
  fontEnvironment?: {
    schema: string;
    font: { postscriptName: string };
    license: { id: string };
  };
}

function editorPayload(html: string): TestPayload {
  const match = html.match(
    /<script id="vector180-editor-payload" type="application\/json">([\s\S]*?)<\/script>/u,
  );
  if (match?.[1] === undefined) throw new Error("Missing editor payload");
  return JSON.parse(match[1]) as TestPayload;
}
