// Tests: CONTRACT:C4-PPTV-SOURCE.2.0

import { describe, expect, it } from "vitest";

import { scanVector180Source } from "../core/scan.js";
import { sha256Hex, SourceMapper } from "../core/source.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("Vector180 source materialization and scan", () => {
  it("inventories the strict example without executing its runtime", async () => {
    const source = await readMinimalDeck();
    const scan = await scanVector180Source({
      kind: "text",
      text: source,
      name: "minimal-deck.vector180.html",
    });

    expect(errorCodes(scan.diagnostics)).toEqual([]);
    expect(scan.kind).toBe("html");
    expect(scan.source.wireFamily).toBe("vector180");
    expect(scan.versionHint).toBe("0.1");
    expect(scan.sections.map((section) => section.kind)).toEqual([
      "html-head",
      "manifest",
      "output-mount",
      "slide",
      "slide",
      "style",
      "theme",
      "theme",
      "viewer-runtime",
    ]);
    expect(
      scan.sections
        .filter((section) => section.kind === "slide")
        .map((section) => section.id),
    ).toEqual(["architecture", "cover"]);
  });

  it("retains a UTF-8 BOM in text, bytes, coordinates, and hashing", async () => {
    const source = await readMinimalDeck();
    const withoutBom = new TextEncoder().encode(source);
    const bytes = new Uint8Array(withoutBom.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(withoutBom, 3);

    const scan = await scanVector180Source({
      kind: "bytes",
      bytes,
      name: "minimal-deck.vector180.html",
    });

    expect(scan.source.text.codePointAt(0)).toBe(0xfeff);
    expect(scan.source.bytes).toEqual(bytes);
    expect(scan.source.sha256).toBe(await sha256Hex(bytes));
    expect(
      scan.sections.find((section) => section.kind === "manifest")?.range
        .byteStart,
    ).toBeGreaterThan(
      scan.sections.find((section) => section.kind === "manifest")?.range
        .charStart ?? 0,
    );
  });

  it("rejects malformed UTF-8 byte input", async () => {
    const scan = await scanVector180Source({
      kind: "bytes",
      bytes: new Uint8Array([0xc3, 0x28]),
      name: "invalid.vector180.html",
    });

    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SCAN-INVALID-UTF8",
    );
    expect(scan.sections).toEqual([]);
  });

  it("enforces byte-size, nesting-depth, and Unicode-scalar limits", async () => {
    const oversized = await scanVector180Source(
      {
        kind: "bytes",
        bytes: new TextEncoder().encode("<svg></svg>"),
        name: "oversized.vector180.svg",
      },
      { maxSourceBytes: 4 },
    );
    const tooDeep = await scanVector180Source(
      {
        kind: "text",
        text: `<svg id="deep" data-vector180-version="0.1" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(8)}${"</g>".repeat(8)}</svg>`,
      },
      { maxDepth: 4 },
    );
    const unpairedSurrogate = await scanVector180Source({
      kind: "text",
      text: "<svg>\ud800</svg>",
      name: "unpaired.vector180.svg",
    });

    expect(errorCodes(oversized.diagnostics)).toContain(
      "VECTOR180-SCAN-SOURCE-LIMIT",
    );
    expect(errorCodes(tooDeep.diagnostics)).toContain(
      "VECTOR180-SCAN-STRUCTURE-LIMIT",
    );
    expect(errorCodes(unpairedSurrogate.diagnostics)).toContain(
      "VECTOR180-SCAN-INVALID-UTF8",
    );
  });

  it("sniffs BOMs, leading comments, and XML declarations without filenames", async () => {
    const html = await scanVector180Source({
      kind: "text",
      text: `\uFEFF \n<!-- leading inventory note -->\n${await readMinimalDeck()}`,
    });
    const svg = await scanVector180Source({
      kind: "text",
      text: '\uFEFF<?xml version="1.0"?>\n<!-- source note -->\n<svg id="recognized" data-vector180-version="0.1" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg>',
    });

    expect(html.kind).toBe("html");
    expect(errorCodes(html.diagnostics)).not.toContain(
      "VECTOR180-SCAN-UNRECOGNIZED",
    );
    expect(svg.kind).toBe("svg");
    expect(svg.source.wireFamily).toBe("vector180");
    expect(svg.sections[0]).toMatchObject({
      kind: "slide",
      id: "recognized",
    });
    expect(errorCodes(svg.diagnostics)).not.toContain(
      "VECTOR180-SCAN-UNRECOGNIZED",
    );
  });

  it("maps non-BMP UTF-16 offsets to exact UTF-8 offsets", () => {
    const mapper = new SourceMapper("A😀B\r\nC");
    const range = mapper.range(3, 4);

    expect(range).toMatchObject({
      charStart: 3,
      charEnd: 4,
      byteStart: 5,
      byteEnd: 6,
      lineStart: 1,
      columnStart: 4,
      lineEnd: 1,
      columnEnd: 5,
    });
    expect(mapper.range(6, 7)).toMatchObject({ lineStart: 2, columnStart: 1 });
    expect(() => mapper.range(1, 2)).toThrow(/surrogate pair/);
  });

  it("rejects arbitrary scripts and event handlers without running them", async () => {
    const source = (await readMinimalDeck())
      .replace(
        "<main data-vector180-output>",
        '<main data-vector180-output onclick="steal()">',
      )
      .replace(
        '<script data-vector180-runtime="vector180-browser/0.1">',
        '<script>globalThis.__vector180Executed = true</script>\n\n<script data-vector180-runtime="vector180-browser/0.1">',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SECURITY-EXECUTABLE",
    );
    expect(
      (globalThis as Record<string, unknown>).__vector180Executed,
    ).toBeUndefined();
  });

  it("rejects scripts hidden inside inert slide templates", async () => {
    const source = (await readMinimalDeck()).replace(
      '    <text id="cover.title"',
      '    <script>globalThis.__vector180NestedExecuted = true</script>\n    <text id="cover.title"',
    );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SECURITY-EXECUTABLE",
    );
    expect(
      (globalThis as Record<string, unknown>).__vector180NestedExecuted,
    ).toBeUndefined();
  });

  it("rejects spoofed output/runtime scripts and external script sources", async () => {
    const source = (await readMinimalDeck())
      .replace(
        "<main data-vector180-output></main>",
        "<script data-vector180-output>globalThis.outputSpoof = true</script>",
      )
      .replace(
        '<script data-vector180-runtime="vector180-browser/0.1">',
        '<script data-vector180-runtime="vector180-browser/0.1" src="evil.js">',
      )
      .replace('"use strict";', '"runtime was replaced";');
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SECURITY-EXECUTABLE",
    );
    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SECURITY-RUNTIME",
    );
    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SCAN-SECTION-COUNT",
    );
  });

  it("rejects CSS resource loads and absolute resource paths", async () => {
    const source = (await readMinimalDeck())
      .replace(
        ":root {",
        ":root { background-image: url(https://example.test/tracker.png);",
      )
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.file" data-vector180-role="asset" data-vector180-export="svg" href="/etc/passwd"></image>\n    <text id="cover.title"',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "VECTOR180-SECURITY-URL",
      ),
    ).toHaveLength(2);
  });

  it("requires exactly one fixed base-style control block", async () => {
    const source = await readMinimalDeck();
    const styleStart = source.indexOf(
      '<script type="text/css" data-vector180-style="base">',
    );
    const styleEnd =
      source.indexOf("</script>", styleStart) + "</script>".length;
    const missingStyle = source.slice(0, styleStart) + source.slice(styleEnd);
    const invalidStyleId = source.replace(
      'data-vector180-style="base"',
      'data-vector180-style="components"',
    );
    const fetchingStyle = source.replace(
      ".slide-background {",
      ".slide-background { background-image: url(assets/background.svg);",
    );

    expect(
      errorCodes(
        (
          await scanVector180Source({
            kind: "text",
            text: missingStyle,
          })
        ).diagnostics,
      ),
    ).toContain("VECTOR180-SCAN-SECTION-COUNT");
    expect(
      errorCodes(
        (
          await scanVector180Source({
            kind: "text",
            text: invalidStyleId,
          })
        ).diagnostics,
      ),
    ).toContain("VECTOR180-SCAN-STYLE-ID");
    expect(
      errorCodes(
        (
          await scanVector180Source({
            kind: "text",
            text: fetchingStyle,
          })
        ).diagnostics,
      ),
    ).toContain("VECTOR180-SECURITY-URL");
  });

  it("allows fragment references but rejects every fetching resource form", async () => {
    const source = (await readMinimalDeck())
      .replace('<svg id="cover"', '<svg id="cover" xml:base="assets/"')
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.fragment" data-vector180-role="asset" data-vector180-export="native" href="#local"></image>\n    <image id="cover.relative" data-vector180-role="asset" data-vector180-export="native" href="assets/pixel.png"></image>\n    <image id="cover.data" data-vector180-role="asset" data-vector180-export="native" href="data:image/png;base64,AA=="></image>\n    <rect id="cover.paint" data-vector180-role="shape" data-vector180-export="native" fill="url(assets/paint.svg#fill)"></rect>\n    <rect id="cover.local-paint" data-vector180-role="shape" data-vector180-export="native" fill="url(#fill)"></rect>\n    <text id="cover.title"',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "VECTOR180-SECURITY-URL",
      ),
    ).toHaveLength(4);
  });

  it("reports the exact qualified xlink attribute range", async () => {
    const source = (await readMinimalDeck())
      .replace(
        '<svg id="cover"',
        '<svg id="cover" xmlns:xlink="http://www.w3.org/1999/xlink"',
      )
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.xlink" data-vector180-role="asset" data-vector180-export="native" href="#safe" xlink:href="assets/pixel.png"></image>\n    <text id="cover.title"',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });
    const diagnostic = scan.diagnostics.find(
      (candidate) => candidate.code === "VECTOR180-SECURITY-URL",
    );

    expect(diagnostic?.range).toBeDefined();
    expect(
      source.slice(diagnostic!.range!.charStart, diagnostic!.range!.charEnd),
    ).toBe('xlink:href="assets/pixel.png"');
  });

  it("accepts CRLF spelling while verifying the fixed runtime artifact", async () => {
    const source = (await readMinimalDeck()).replaceAll("\n", "\r\n");
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toEqual([]);
  });

  it("rejects remote and traversing resource references", async () => {
    const source = (await readMinimalDeck())
      .replace(
        '<svg id="cover"',
        '<svg id="cover" xmlns:xlink="http://www.w3.org/1999/xlink"',
      )
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.remote" data-vector180-role="asset" data-vector180-export="native" href="https://example.test/pixel.png"></image>\n    <image id="cover.traversal" data-vector180-role="asset" data-vector180-export="native" href="../secret.png"></image>\n    <image id="cover.encoded-traversal" data-vector180-role="asset" data-vector180-export="native" href="%2e%2e/secret.png"></image>\n    <a id="cover.obfuscated-script" data-vector180-role="asset" data-vector180-export="svg" href="java&#10;script:alert(1)"></a>\n    <text id="cover.title"',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "VECTOR180-SECURITY-URL",
      ),
    ).toHaveLength(4);
  });

  it("reports physical section order independently from manifest slide order", async () => {
    const source = await readMinimalDeck();
    const themeStart = source.indexOf(
      '<script type="text/css" data-vector180-theme="light">',
    );
    const themeEnd =
      source.indexOf("</script>", themeStart) + "</script>".length;
    const theme = source.slice(themeStart, themeEnd);
    const withoutTheme = source.slice(0, themeStart) + source.slice(themeEnd);
    const firstSlide = withoutTheme.indexOf("<template data-vector180-slide=");
    const invalid =
      withoutTheme.slice(0, firstSlide) +
      theme +
      "\n" +
      withoutTheme.slice(firstSlide);

    const scan = await scanVector180Source({ kind: "text", text: invalid });
    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SCAN-PHYSICAL-ORDER",
    );
  });

  it("requires explicit containers and rejects competing head, body, and output content", async () => {
    const implicitContainer = (await readMinimalDeck()).replace(
      '<html lang="en" data-vector180-version="0.1">',
      "",
    );
    const competingContent = (await readMinimalDeck())
      .replace(
        '<meta charset="utf-8">',
        '<meta charset="utf-8" http-equiv="refresh" content="0;url=assets/next.html">',
      )
      .replace(
        "<main data-vector180-output></main>",
        '<main data-vector180-output class="hidden">Rendered output</main>',
      )
      .replace("<body>", "<body>\nVisible competing authority");

    const implicit = await scanVector180Source({
      kind: "text",
      text: implicitContainer,
    });
    const competing = await scanVector180Source({
      kind: "text",
      text: competingContent,
    });

    expect(errorCodes(implicit.diagnostics)).toContain(
      "VECTOR180-SCAN-HTML-STRUCTURE",
    );
    expect(errorCodes(competing.diagnostics)).toContain(
      "VECTOR180-SCAN-HTML-HEAD",
    );
    expect(errorCodes(competing.diagnostics)).toContain(
      "VECTOR180-SCAN-OUTPUT-NONEMPTY",
    );
    expect(errorCodes(competing.diagnostics)).toContain(
      "VECTOR180-SCAN-UNKNOWN-SECTION",
    );
  });

  it("rejects ambiguous markers and invalid IDs even when sections are unused", async () => {
    const source = (await readMinimalDeck())
      .replace(
        '<script type="text/css" data-vector180-theme="light">',
        '<template data-vector180-slide="../unused"><svg id="../unused"></svg></template>\n\n<template data-vector180-library="../library"></template>\n\n<script type="text/css" data-vector180-theme="light">',
      )
      .replace('data-vector180-theme="dark"', 'data-vector180-theme="../dark"')
      .replace(
        'data-vector180-slide="cover"',
        'data-vector180-slide="cover" data-vector180-library="also-cover"',
      );
    const scan = await scanVector180Source({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "VECTOR180-ID-INVALID",
      ),
    ).toHaveLength(3);
    expect(errorCodes(scan.diagnostics)).toContain(
      "VECTOR180-SCAN-UNKNOWN-SECTION",
    );
  });

  it("requires exactly one direct standalone SVG root", async () => {
    const multiple = await scanVector180Source({
      kind: "text",
      text: '<svg id="one" data-vector180-version="0.1" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg><svg id="two" data-vector180-version="0.1" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    const nested = await scanVector180Source({
      kind: "text",
      text: '<div><svg id="nested"></svg></div>',
      name: "nested.vector180.svg",
    });

    expect(errorCodes(multiple.diagnostics)).toContain(
      "VECTOR180-SCAN-SVG-XML",
    );
    expect(errorCodes(nested.diagnostics)).toContain(
      "VECTOR180-SCAN-UNRECOGNIZED",
    );
    expect(multiple.sections).toEqual([]);
    expect(nested.sections).toEqual([]);
  });

  it("recognizes standalone SVG and external manifest source forms without execution", async () => {
    const svg = await scanVector180Source({
      kind: "text",
      text: '<svg id="one" viewBox="0 0 10 10" data-vector180-version="1"></svg>',
      name: "one.vector180.svg",
    });
    const manifest = await scanVector180Source({
      kind: "text",
      text: '{"vector180":"0.1","slides":[]}',
      name: "deck.vector180-manifest.json",
    });

    expect(svg.kind).toBe("svg");
    expect(svg.source.wireFamily).toBe("vector180");
    expect(svg.sections[0]).toMatchObject({ kind: "slide", id: "one" });
    expect(manifest.kind).toBe("manifest");
  });
});
