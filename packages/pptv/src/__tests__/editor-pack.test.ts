import { describe, expect, it } from "vitest";

import { createEditorPack } from "../node/editor-pack.js";
import { readMinimalDeck } from "./test-helpers.js";

describe("deterministic trusted editor pack", () => {
  it("embeds exact inert bytes, a strict CSP, and semantic projections", async () => {
    const text = `\uFEFF${await readMinimalDeck()}`;
    const bytes = new TextEncoder().encode(text);
    const input = {
      kind: "bytes" as const,
      bytes,
      name: "minimal-deck.pptv.html",
    };

    const first = await createEditorPack(input);
    const second = await createEditorPack(input);

    expect(first.diagnostics).toEqual([]);
    expect(first.html).toBe(second.html);
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.html).toContain("default-src 'none'");
    expect(first.html).toContain("connect-src 'none'");
    expect(first.html).toContain("pptv-editor/0.1");
    expect(first.html).not.toContain('data-pptv-runtime="pptv-browser/0.1"');
    expect(first.html).not.toMatch(/\b(?:src|href)=["']https?:\/\//u);
    expect(first.html).not.toContain("fetch(");
    expect(first.html).not.toContain("XMLHttpRequest");

    const payload = editorPayload(first.html!);
    expect(payload.schema).toBe("pptv-editor-pack/0.1");
    expect(payload.sourceSha256).toBe(first.sourceSha256);
    expect(payload.outline.slides.map((slide) => slide.id)).toEqual([
      "cover",
      "architecture",
    ]);
    expect(payload.inventory.slides[0]?.objects[1]?.id).toBe("cover.title");
    expect(payload.resolved.schema).toBe("pptv-resolved/0.1");
    expect(payload.resolved.slides[0]?.objects[1]).toMatchObject({
      id: "cover.title",
      kind: "text",
      wrap: "none",
      autofit: "none",
    });
    expect(new Uint8Array(Buffer.from(payload.sourceBase64, "base64"))).toEqual(
      bytes,
    );
  });

  it("returns diagnostics and no wrapper for invalid source", async () => {
    const text = (await readMinimalDeck()).replace(
      ' data-pptv-style="base"',
      "",
    );
    const result = await createEditorPack({ kind: "text", text });

    expect(result.html).toBeUndefined();
    expect(result.sourceSha256).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "PPTV-SCAN-SECTION-COUNT",
    );
  });
});

interface TestPayload {
  schema: string;
  sourceSha256: string;
  sourceBase64: string;
  outline: { slides: Array<{ id: string }> };
  inventory: {
    slides: Array<{ objects: Array<{ id: string }> }>;
  };
  resolved: {
    schema: string;
    slides: Array<{
      objects: Array<{
        id: string;
        kind: string;
        wrap?: string;
        autofit?: string;
      }>;
    }>;
  };
}

function editorPayload(html: string): TestPayload {
  const match = html.match(
    /<script id="pptv-editor-payload" type="application\/json">([\s\S]*?)<\/script>/u,
  );
  if (match?.[1] === undefined) throw new Error("Missing editor payload");
  return JSON.parse(match[1]) as TestPayload;
}
