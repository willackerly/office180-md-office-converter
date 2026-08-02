// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.2

import { describe, expect, it } from "vitest";

import { runCli } from "../cli.js";
import { loadDeck } from "../core/deck.js";
import { parseManifest } from "../core/manifest.js";
import { scanPptvSource } from "../core/scan.js";
import { applyPatch } from "../ops/patch.js";
import { queryObjects } from "../ops/projections.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("PPTV conformance hardening", () => {
  it("keeps the manifest type predicate aligned with optional field schemas", async () => {
    const source = (await readMinimalDeck()).replace(
      '    "architecture"',
      '    {"id": "architecture", "namespace": "../bad", "src": 42}',
    );
    const parsed = parseManifest(
      await scanPptvSource({ kind: "text", text: source }),
    );

    expect(parsed.manifest).toBeUndefined();
    expect(errorCodes(parsed.diagnostics)).toContain("PPTV-MANIFEST-INVALID");
    expect(errorCodes(parsed.diagnostics)).toContain("PPTV-ID-INVALID");
    expect(errorCodes(parsed.diagnostics)).toContain(
      "PPTV-MANIFEST-UNSUPPORTED-EXTERNAL",
    );
  });

  it("requires a declared editor profile to resolve to an editor runtime", async () => {
    const source = (await readMinimalDeck()).replace(
      '  "runtime": "pptv-browser/0.1",',
      '  "runtime": "pptv-browser/0.1",\n  "editor": "pptv-editor/0.1",',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain(
      "PPTV-MANIFEST-MISSING-REFERENCE",
    );
  });

  it("rejects excessive JSON nesting before semantic materialization", async () => {
    const nesting = 300;
    const source = `{"pptv":"0.1","slides":["one"],"extensions":${'{"x":'.repeat(nesting)}null${"}".repeat(nesting)}}`;
    const parsed = parseManifest(
      await scanPptvSource({ kind: "text", text: source }),
    );

    expect(errorCodes(parsed.diagnostics)).toContain("PPTV-MANIFEST-LIMIT");
    expect(parsed.manifest).toBeUndefined();
  });

  it("does not index duplicate slide or theme declarations ambiguously", async () => {
    const source = (await readMinimalDeck())
      .replace('data-pptv-slide="architecture"', 'data-pptv-slide="cover"')
      .replace('data-pptv-theme="dark"', 'data-pptv-theme="light"');
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain("PPTV-ID-DUPLICATE");
    expect(deck.slides.has("cover")).toBe(false);
    expect(deck.themes.has("light")).toBe(false);
  });

  it("rejects container styling, SVG animation, and comment-obfuscated CSS fetches", async () => {
    const source = (await readMinimalDeck())
      .replace("<body>", '<body style="display:none">')
      .replace(
        '    <text id="cover.title"',
        '    <animate attributeName="href" to="https://example.test/next"></animate>\n    <rect fill="u/**/rl(https://example.test/paint.svg#gradient)"></rect>\n    <text id="cover.title"',
      )
      .replace(
        ":root {",
        ":root { background-image: u/**/rl(https://example.test/image.png);",
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SCAN-HTML-STRUCTURE");
    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SECURITY-EXECUTABLE");
    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "PPTV-SECURITY-URL",
      ),
    ).toHaveLength(2);
  });

  it("requires exact control-block attributes around fixed runtime content", async () => {
    const source = (await readMinimalDeck()).replace(
      '<script data-pptv-runtime="pptv-browser/0.1">',
      '<script type="module" data-pptv-runtime="pptv-browser/0.1">',
    );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain(
      "PPTV-SCAN-SECTION-ATTRIBUTES",
    );
  });

  it("rejects non-SVG number spellings in viewBox", async () => {
    const source = (await readMinimalDeck()).replace(
      'viewBox="0 0 1600 900"',
      'viewBox="0x0 0 1600 900"',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(errorCodes(deck.diagnostics)).toContain("PPTV-SVG-VIEWBOX");
  });

  it("does not resolve descendants through an ambiguous ancestor ID", async () => {
    const source = (await readMinimalDeck()).replace(
      'id="architecture.node.policy" class="diagram-node"',
      'id="architecture.node.client" class="diagram-node"',
    );
    const deck = await loadDeck({ kind: "text", text: source });

    expect(
      queryObjects(deck, {
        descendantOf: "architecture.node.client",
      }),
    ).toEqual([]);
  });

  it("keeps show output JSON-only instead of labeling JSON as text", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      ["show", "deck.pptv.html", "cover", "--format", "text"],
      {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    );

    expect(exitCode).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain('Unknown output format "text"');
  });

  it("rejects a planned patch when candidate-source revalidation fails", async () => {
    const deck = await loadDeck({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const result = await applyPatch(deck, {
      schema: "pptv-patch/0.1",
      baseSha256: deck.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "cover.title",
          value: "x".repeat(8 * 1024 * 1024),
        },
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.sourceText).toBeUndefined();
    expect(result.edits).toEqual([]);
    expect(errorCodes(result.diagnostics)).toContain(
      "PPTV-PATCH-INVALID-RESULT",
    );
  });
});
