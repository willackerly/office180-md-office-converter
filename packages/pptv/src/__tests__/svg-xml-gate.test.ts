// Tests: CONTRACT:C4-PPTV-SOURCE.1.1

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadDiagram, PptvLoadError } from "../core/deck.js";
import {
  addPptvDiagramDiscoveryComment,
  PPTV_DIAGRAM_DISCOVERY_COMMENT,
} from "../core/extract.js";
import { scanPptvSource } from "../core/scan.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.pptv.svg",
  import.meta.url,
);

async function readMinimalDiagram(): Promise<string> {
  return readFile(MINIMAL_DIAGRAM_URL, "utf8");
}

describe("standalone SVG XML gate", () => {
  it("places non-normative discovery after a BOM and XML declaration without making it required", async () => {
    const source = await readMinimalDiagram();
    const legacy = source.replace(`${PPTV_DIAGRAM_DISCOVERY_COMMENT}\n`, "");
    const discovered = addPptvDiagramDiscoveryComment(`\uFEFF${legacy}`);
    const declarationEnd = discovered.indexOf("?>") + 2;
    const commentOffset = discovered.indexOf(PPTV_DIAGRAM_DISCOVERY_COMMENT);
    const rootOffset = discovered.indexOf("<svg");

    expect(discovered.codePointAt(0)).toBe(0xfeff);
    expect(declarationEnd).toBeGreaterThan(1);
    expect(commentOffset).toBeGreaterThan(declarationEnd);
    expect(rootOffset).toBeGreaterThan(commentOffset);
    expect(addPptvDiagramDiscoveryComment(discovered)).toBe(discovered);

    const withoutDeclaration = legacy.replace(/^<\?xml[^?]*\?>\n/u, "");
    expect(
      addPptvDiagramDiscoveryComment(`\uFEFF${withoutDeclaration}`).startsWith(
        `\uFEFF${PPTV_DIAGRAM_DISCOVERY_COMMENT}\n<svg`,
      ),
    ).toBe(true);
    const withCrLf = addPptvDiagramDiscoveryComment(
      legacy.replaceAll("\n", "\r\n"),
    );
    const crLfComment = PPTV_DIAGRAM_DISCOVERY_COMMENT.replaceAll("\n", "\r\n");
    expect(withCrLf).toContain(`encoding="UTF-8"?>\r\n${crLfComment}\r\n<svg`);
    expect(withCrLf.replaceAll("\r\n", "")).not.toContain("\n");
    expect(addPptvDiagramDiscoveryComment(withCrLf)).toBe(withCrLf);

    const withDiscovery = await loadDiagram({
      kind: "text",
      text: discovered,
      name: "discovered.pptv.svg",
    });
    const withoutDiscovery = await loadDiagram({
      kind: "text",
      text: legacy,
      name: "legacy.pptv.svg",
    });
    expect(withDiscovery.diagnostics).toEqual([]);
    expect(withoutDiscovery.diagnostics).toEqual([]);
  });

  it("accepts optional XML declarations, predefined entities, and declared prefixes", async () => {
    const source = await readMinimalDiagram();
    const withEntitiesAndPrefix = source
      .replace(
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns="http://www.w3.org/2000/svg"\n     xmlns:xlink="http://www.w3.org/1999/xlink"',
      )
      .replace(
        "<title>Minimal PPTV diagram</title>",
        '<title xlink:title="PPTV">&lt;&gt;&amp;&quot;&apos;</title>',
      );
    const withoutDeclaration = source.replace(/^<\?xml[^?]*\?>\n/u, "");

    for (const [name, candidate] of [
      ["declared-prefix.pptv.svg", withEntitiesAndPrefix],
      ["no-declaration.pptv.svg", withoutDeclaration],
    ] as const) {
      const scan = await scanPptvSource({
        kind: "text",
        text: candidate,
        name,
      });
      const diagram = await loadDiagram({
        kind: "text",
        text: candidate,
        name,
      });

      expect(
        scan.diagnostics.map((diagnostic) => diagnostic.code),
        name,
      ).not.toContain("PPTV-SCAN-SVG-XML");
      expect(scan.sections, name).toHaveLength(1);
      expect(diagram.sourceKind, name).toBe("svg");
    }
  });

  it("fails closed before semantic loading for browser-tolerated XML violations", async () => {
    const source = await readMinimalDiagram();
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        "duplicate-attribute",
        source.replace(
          'viewBox="-100 -50 1200 800"',
          'viewBox="-100 -50 1200 800" viewBox="0 0 1 1"',
        ),
      ],
      ["mismatched-end-tag", source.replace(/<\/svg>\s*$/u, "</g>\n")],
      ["omitted-end-tag", source.replace(/<\/svg>\s*$/u, "")],
      [
        "undeclared-prefix",
        source.replace(
          "<title>Minimal PPTV diagram</title>",
          '<title demo:label="PPTV">Minimal PPTV diagram</title>',
        ),
      ],
      [
        "invalid-xml-character",
        source.replace("Minimal PPTV diagram", "Minimal\u0001 PPTV diagram"),
      ],
      [
        "multiple-roots",
        `${source}<svg xmlns="http://www.w3.org/2000/svg"/>\n`,
      ],
      [
        "undefined-custom-entity",
        source.replace("Minimal PPTV diagram", "Minimal &custom; diagram"),
      ],
      ["xml-1.1", source.replace('version="1.0"', 'version="1.1"')],
    ];

    for (const [name, candidate] of cases) {
      const input = {
        kind: "text" as const,
        text: candidate,
        name: `${name}.pptv.svg`,
      };
      const scan = await scanPptvSource(input);

      expect(scan.kind, name).toBe("svg");
      expect(scan.sections, name).toEqual([]);
      expect(scan.diagnostics, name).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "PPTV-SCAN-SVG-XML",
            severity: "fatal",
          }),
        ]),
      );
      await expect(loadDiagram(input), name).rejects.toMatchObject({
        name: PptvLoadError.name,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "PPTV-SCAN-SVG-XML",
            severity: "fatal",
          }),
        ]),
      });
    }
  });

  it("rejects DOCTYPE and custom entity declarations even without filename hints", async () => {
    const source = await readMinimalDiagram();
    const withoutDeclaration = source.replace(/^<\?xml[^?]*\?>\n/u, "");
    const cases = [
      `<!DOCTYPE svg>\n${withoutDeclaration}`,
      `<!DOCTYPE svg [<!ENTITY custom "PPTV">]>\n${withoutDeclaration.replace(
        "Minimal PPTV diagram",
        "Minimal &custom; diagram",
      )}`,
    ];

    for (const candidate of cases) {
      const scan = await scanPptvSource({ kind: "text", text: candidate });

      expect(scan.kind).toBe("svg");
      expect(scan.sections).toEqual([]);
      expect(scan.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "PPTV-SCAN-SVG-XML",
            severity: "fatal",
            message:
              "Standalone PPTV SVG forbids DOCTYPE, DTD, and custom entity declarations.",
          }),
        ]),
      );
    }
  });
});
