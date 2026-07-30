// Tests: CONTRACT:C4-PPTV-SOURCE.1.0

import { describe, expect, it } from "vitest";

import { scanPptvSource } from "../core/scan.js";
import { sha256Hex, SourceMapper } from "../core/source.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

describe("PPTV source materialization and scan", () => {
  it("inventories the strict example without executing its runtime", async () => {
    const source = await readMinimalDeck();
    const scan = await scanPptvSource({
      kind: "text",
      text: source,
      name: "minimal-deck.pptv.html",
    });

    expect(errorCodes(scan.diagnostics)).toEqual([]);
    expect(scan.kind).toBe("html");
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

    const scan = await scanPptvSource({
      kind: "bytes",
      bytes,
      name: "minimal-deck.pptv.html",
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
    const scan = await scanPptvSource({
      kind: "bytes",
      bytes: new Uint8Array([0xc3, 0x28]),
      name: "invalid.pptv.html",
    });

    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SCAN-INVALID-UTF8");
    expect(scan.sections).toEqual([]);
  });

  it("enforces byte-size, nesting-depth, and Unicode-scalar limits", async () => {
    const oversized = await scanPptvSource(
      {
        kind: "bytes",
        bytes: new TextEncoder().encode("<svg></svg>"),
        name: "oversized.pptv.svg",
      },
      { maxSourceBytes: 4 },
    );
    const tooDeep = await scanPptvSource(
      {
        kind: "text",
        text: `<svg>${"<g>".repeat(8)}${"</g>".repeat(8)}</svg>`,
      },
      { maxDepth: 4 },
    );
    const unpairedSurrogate = await scanPptvSource({
      kind: "text",
      text: "<svg>\ud800</svg>",
      name: "unpaired.pptv.svg",
    });

    expect(errorCodes(oversized.diagnostics)).toContain(
      "PPTV-SCAN-SOURCE-LIMIT",
    );
    expect(errorCodes(tooDeep.diagnostics)).toContain(
      "PPTV-SCAN-STRUCTURE-LIMIT",
    );
    expect(errorCodes(unpairedSurrogate.diagnostics)).toContain(
      "PPTV-SCAN-INVALID-UTF8",
    );
  });

  it("sniffs BOMs, leading comments, and XML declarations without filenames", async () => {
    const html = await scanPptvSource({
      kind: "text",
      text: `\uFEFF \n<!-- leading inventory note -->\n${await readMinimalDeck()}`,
    });
    const svg = await scanPptvSource({
      kind: "text",
      text: '\uFEFF\n<!-- source note -->\n<?xml version="1.0"?>\n<svg id="recognized"></svg>',
    });

    expect(html.kind).toBe("html");
    expect(errorCodes(html.diagnostics)).not.toContain(
      "PPTV-SCAN-UNRECOGNIZED",
    );
    expect(svg.kind).toBe("svg");
    expect(svg.sections[0]).toMatchObject({
      kind: "slide",
      id: "recognized",
    });
    expect(errorCodes(svg.diagnostics)).not.toContain("PPTV-SCAN-UNRECOGNIZED");
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
        "<main data-pptv-output>",
        '<main data-pptv-output onclick="steal()">',
      )
      .replace(
        '<script data-pptv-runtime="pptv-browser/0.1">',
        '<script>globalThis.__pptvExecuted = true</script>\n\n<script data-pptv-runtime="pptv-browser/0.1">',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SECURITY-EXECUTABLE");
    expect(
      (globalThis as Record<string, unknown>).__pptvExecuted,
    ).toBeUndefined();
  });

  it("rejects scripts hidden inside inert slide templates", async () => {
    const source = (await readMinimalDeck()).replace(
      '    <text id="cover.title"',
      '    <script>globalThis.__pptvNestedExecuted = true</script>\n    <text id="cover.title"',
    );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SECURITY-EXECUTABLE");
    expect(
      (globalThis as Record<string, unknown>).__pptvNestedExecuted,
    ).toBeUndefined();
  });

  it("rejects spoofed output/runtime scripts and external script sources", async () => {
    const source = (await readMinimalDeck())
      .replace(
        "<main data-pptv-output></main>",
        "<script data-pptv-output>globalThis.outputSpoof = true</script>",
      )
      .replace(
        '<script data-pptv-runtime="pptv-browser/0.1">',
        '<script data-pptv-runtime="pptv-browser/0.1" src="evil.js">',
      )
      .replace('"use strict";', '"runtime was replaced";');
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SECURITY-EXECUTABLE");
    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SECURITY-RUNTIME");
    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SCAN-SECTION-COUNT");
  });

  it("rejects CSS resource loads and absolute resource paths", async () => {
    const source = (await readMinimalDeck())
      .replace(
        ":root {",
        ":root { background-image: url(https://example.test/tracker.png);",
      )
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.file" data-pptv-role="asset" data-pptv-export="svg" href="/etc/passwd"></image>\n    <text id="cover.title"',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "PPTV-SECURITY-URL",
      ),
    ).toHaveLength(2);
  });

  it("requires exactly one fixed base-style control block", async () => {
    const source = await readMinimalDeck();
    const styleStart = source.indexOf(
      '<script type="text/css" data-pptv-style="base">',
    );
    const styleEnd =
      source.indexOf("</script>", styleStart) + "</script>".length;
    const missingStyle = source.slice(0, styleStart) + source.slice(styleEnd);
    const invalidStyleId = source.replace(
      'data-pptv-style="base"',
      'data-pptv-style="components"',
    );
    const fetchingStyle = source.replace(
      ".slide-background {",
      ".slide-background { background-image: url(assets/background.svg);",
    );

    expect(
      errorCodes(
        (
          await scanPptvSource({
            kind: "text",
            text: missingStyle,
          })
        ).diagnostics,
      ),
    ).toContain("PPTV-SCAN-SECTION-COUNT");
    expect(
      errorCodes(
        (
          await scanPptvSource({
            kind: "text",
            text: invalidStyleId,
          })
        ).diagnostics,
      ),
    ).toContain("PPTV-SCAN-STYLE-ID");
    expect(
      errorCodes(
        (
          await scanPptvSource({
            kind: "text",
            text: fetchingStyle,
          })
        ).diagnostics,
      ),
    ).toContain("PPTV-SECURITY-URL");
  });

  it("allows fragment references but rejects every fetching resource form", async () => {
    const source = (await readMinimalDeck())
      .replace('<svg id="cover"', '<svg id="cover" xml:base="assets/"')
      .replace(
        '    <text id="cover.title"',
        '    <image id="cover.fragment" data-pptv-role="asset" data-pptv-export="native" href="#local"></image>\n    <image id="cover.relative" data-pptv-role="asset" data-pptv-export="native" href="assets/pixel.png"></image>\n    <image id="cover.data" data-pptv-role="asset" data-pptv-export="native" href="data:image/png;base64,AA=="></image>\n    <rect id="cover.paint" data-pptv-role="shape" data-pptv-export="native" fill="url(assets/paint.svg#fill)"></rect>\n    <rect id="cover.local-paint" data-pptv-role="shape" data-pptv-export="native" fill="url(#fill)"></rect>\n    <text id="cover.title"',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "PPTV-SECURITY-URL",
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
        '    <image id="cover.xlink" data-pptv-role="asset" data-pptv-export="native" href="#safe" xlink:href="assets/pixel.png"></image>\n    <text id="cover.title"',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });
    const diagnostic = scan.diagnostics.find(
      (candidate) => candidate.code === "PPTV-SECURITY-URL",
    );

    expect(diagnostic?.range).toBeDefined();
    expect(
      source.slice(diagnostic!.range!.charStart, diagnostic!.range!.charEnd),
    ).toBe('xlink:href="assets/pixel.png"');
  });

  it("accepts CRLF spelling while verifying the fixed runtime artifact", async () => {
    const source = (await readMinimalDeck()).replaceAll("\n", "\r\n");
    const scan = await scanPptvSource({ kind: "text", text: source });

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
        '    <image id="cover.remote" data-pptv-role="asset" data-pptv-export="native" href="https://example.test/pixel.png"></image>\n    <image id="cover.traversal" data-pptv-role="asset" data-pptv-export="native" href="../secret.png"></image>\n    <image id="cover.encoded-traversal" data-pptv-role="asset" data-pptv-export="native" href="%2e%2e/secret.png"></image>\n    <a id="cover.obfuscated-script" data-pptv-role="asset" data-pptv-export="svg" href="java&#10;script:alert(1)"></a>\n    <text id="cover.title"',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter(
        (code) => code === "PPTV-SECURITY-URL",
      ),
    ).toHaveLength(4);
  });

  it("reports physical section order independently from manifest slide order", async () => {
    const source = await readMinimalDeck();
    const themeStart = source.indexOf(
      '<script type="text/css" data-pptv-theme="light">',
    );
    const themeEnd =
      source.indexOf("</script>", themeStart) + "</script>".length;
    const theme = source.slice(themeStart, themeEnd);
    const withoutTheme = source.slice(0, themeStart) + source.slice(themeEnd);
    const firstSlide = withoutTheme.indexOf("<template data-pptv-slide=");
    const invalid =
      withoutTheme.slice(0, firstSlide) +
      theme +
      "\n" +
      withoutTheme.slice(firstSlide);

    const scan = await scanPptvSource({ kind: "text", text: invalid });
    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SCAN-PHYSICAL-ORDER");
  });

  it("requires explicit containers and rejects competing head, body, and output content", async () => {
    const implicitContainer = (await readMinimalDeck()).replace(
      '<html lang="en" data-pptv-version="0.1">',
      "",
    );
    const competingContent = (await readMinimalDeck())
      .replace(
        '<meta charset="utf-8">',
        '<meta charset="utf-8" http-equiv="refresh" content="0;url=assets/next.html">',
      )
      .replace(
        "<main data-pptv-output></main>",
        '<main data-pptv-output class="hidden">Rendered output</main>',
      )
      .replace("<body>", "<body>\nVisible competing authority");

    const implicit = await scanPptvSource({
      kind: "text",
      text: implicitContainer,
    });
    const competing = await scanPptvSource({
      kind: "text",
      text: competingContent,
    });

    expect(errorCodes(implicit.diagnostics)).toContain(
      "PPTV-SCAN-HTML-STRUCTURE",
    );
    expect(errorCodes(competing.diagnostics)).toContain("PPTV-SCAN-HTML-HEAD");
    expect(errorCodes(competing.diagnostics)).toContain(
      "PPTV-SCAN-OUTPUT-NONEMPTY",
    );
    expect(errorCodes(competing.diagnostics)).toContain(
      "PPTV-SCAN-UNKNOWN-SECTION",
    );
  });

  it("rejects ambiguous markers and invalid IDs even when sections are unused", async () => {
    const source = (await readMinimalDeck())
      .replace(
        '<script type="text/css" data-pptv-theme="light">',
        '<template data-pptv-slide="../unused"><svg id="../unused"></svg></template>\n\n<template data-pptv-library="../library"></template>\n\n<script type="text/css" data-pptv-theme="light">',
      )
      .replace('data-pptv-theme="dark"', 'data-pptv-theme="../dark"')
      .replace(
        'data-pptv-slide="cover"',
        'data-pptv-slide="cover" data-pptv-library="also-cover"',
      );
    const scan = await scanPptvSource({ kind: "text", text: source });

    expect(
      errorCodes(scan.diagnostics).filter((code) => code === "PPTV-ID-INVALID"),
    ).toHaveLength(3);
    expect(errorCodes(scan.diagnostics)).toContain("PPTV-SCAN-UNKNOWN-SECTION");
  });

  it("requires exactly one direct standalone SVG root", async () => {
    const multiple = await scanPptvSource({
      kind: "text",
      text: '<svg id="one"></svg><svg id="two"></svg>',
    });
    const nested = await scanPptvSource({
      kind: "text",
      text: '<div><svg id="nested"></svg></div>',
      name: "nested.pptv.svg",
    });

    expect(errorCodes(multiple.diagnostics)).toContain(
      "PPTV-SCAN-UNRECOGNIZED",
    );
    expect(errorCodes(nested.diagnostics)).toContain("PPTV-SCAN-UNRECOGNIZED");
    expect(multiple.sections).toEqual([]);
    expect(nested.sections).toEqual([]);
  });

  it("recognizes standalone SVG and external manifests as inventory-only forms", async () => {
    const svg = await scanPptvSource({
      kind: "text",
      text: '<svg id="one" viewBox="0 0 10 10" data-pptv-version="1"></svg>',
      name: "one.pptv.svg",
    });
    const manifest = await scanPptvSource({
      kind: "text",
      text: '{"pptv":"0.1","slides":[]}',
      name: "deck.pptv-manifest.json",
    });

    expect(svg.kind).toBe("svg");
    expect(svg.sections[0]).toMatchObject({ kind: "slide", id: "one" });
    expect(manifest.kind).toBe("manifest");
  });
});
