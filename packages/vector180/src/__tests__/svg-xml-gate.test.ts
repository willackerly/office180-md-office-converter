// Tests: CONTRACT:C4-PPTV-SOURCE.2.0

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadAtom, Vector180LoadError } from "../core/deck.js";
import {
  addVector180AtomDiscoveryComment,
  VECTOR180_ATOM_DISCOVERY_COMMENT,
} from "../core/extract.js";
import { scanVector180Source } from "../core/scan.js";

const MINIMAL_DIAGRAM_URL = new URL(
  "../../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);

async function readMinimalAtom(): Promise<string> {
  return readFile(MINIMAL_DIAGRAM_URL, "utf8");
}

describe("standalone SVG XML gate", () => {
  it("places non-normative discovery after a BOM and XML declaration without making it required", async () => {
    const source = await readMinimalAtom();
    const legacy = source.replace(`${VECTOR180_ATOM_DISCOVERY_COMMENT}\n`, "");
    const discovered = addVector180AtomDiscoveryComment(`\uFEFF${legacy}`);
    const declarationEnd = discovered.indexOf("?>") + 2;
    const commentOffset = discovered.indexOf(VECTOR180_ATOM_DISCOVERY_COMMENT);
    const rootOffset = discovered.indexOf("<svg");

    expect(discovered.codePointAt(0)).toBe(0xfeff);
    expect(declarationEnd).toBeGreaterThan(1);
    expect(commentOffset).toBeGreaterThan(declarationEnd);
    expect(rootOffset).toBeGreaterThan(commentOffset);
    expect(addVector180AtomDiscoveryComment(discovered)).toBe(discovered);

    const withoutDeclaration = legacy.replace(/^<\?xml[^?]*\?>\n/u, "");
    expect(
      addVector180AtomDiscoveryComment(
        `\uFEFF${withoutDeclaration}`,
      ).startsWith(`\uFEFF${VECTOR180_ATOM_DISCOVERY_COMMENT}\n<svg`),
    ).toBe(true);
    const withCrLf = addVector180AtomDiscoveryComment(
      legacy.replaceAll("\n", "\r\n"),
    );
    const crLfComment = VECTOR180_ATOM_DISCOVERY_COMMENT.replaceAll(
      "\n",
      "\r\n",
    );
    expect(withCrLf).toContain(`encoding="UTF-8"?>\r\n${crLfComment}\r\n<svg`);
    expect(withCrLf.replaceAll("\r\n", "")).not.toContain("\n");
    expect(addVector180AtomDiscoveryComment(withCrLf)).toBe(withCrLf);

    const withDiscovery = await loadAtom({
      kind: "text",
      text: discovered,
      name: "discovered.vector180.svg",
    });
    const withoutDiscovery = await loadAtom({
      kind: "text",
      text: legacy,
      name: "legacy.vector180.svg",
    });
    expect(withDiscovery.diagnostics).toEqual([]);
    expect(withoutDiscovery.diagnostics).toEqual([]);
  });

  it("accepts optional XML declarations, predefined entities, and declared prefixes", async () => {
    const source = await readMinimalAtom();
    const withEntitiesAndPrefix = source
      .replace(
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns="http://www.w3.org/2000/svg"\n     xmlns:xlink="http://www.w3.org/1999/xlink"',
      )
      .replace(
        "<title>Minimal Vector180 diagram</title>",
        '<title xlink:title="Vector180">&lt;&gt;&amp;&quot;&apos;</title>',
      );
    const withoutDeclaration = source.replace(/^<\?xml[^?]*\?>\n/u, "");

    for (const [name, candidate] of [
      ["declared-prefix.vector180.svg", withEntitiesAndPrefix],
      ["no-declaration.vector180.svg", withoutDeclaration],
    ] as const) {
      const scan = await scanVector180Source({
        kind: "text",
        text: candidate,
        name,
      });
      const diagram = await loadAtom({
        kind: "text",
        text: candidate,
        name,
      });

      expect(
        scan.diagnostics.map((diagnostic) => diagnostic.code),
        name,
      ).not.toContain("VECTOR180-SCAN-SVG-XML");
      expect(scan.sections, name).toHaveLength(1);
      expect(diagram.sourceKind, name).toBe("svg");
    }
  });

  it("fails closed before semantic loading for browser-tolerated XML violations", async () => {
    const source = await readMinimalAtom();
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
          "<title>Minimal Vector180 diagram</title>",
          '<title demo:label="Vector180">Minimal Vector180 diagram</title>',
        ),
      ],
      [
        "invalid-xml-character",
        source.replace(
          "Minimal Vector180 diagram",
          "Minimal\u0001 Vector180 diagram",
        ),
      ],
      [
        "multiple-roots",
        `${source}<svg xmlns="http://www.w3.org/2000/svg"/>\n`,
      ],
      [
        "undefined-custom-entity",
        source.replace("Minimal Vector180 diagram", "Minimal &custom; diagram"),
      ],
      ["xml-1.1", source.replace('version="1.0"', 'version="1.1"')],
    ];

    for (const [name, candidate] of cases) {
      const input = {
        kind: "text" as const,
        text: candidate,
        name: `${name}.vector180.svg`,
      };
      const scan = await scanVector180Source(input);

      expect(scan.kind, name).toBe("svg");
      expect(scan.sections, name).toEqual([]);
      expect(scan.diagnostics, name).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "VECTOR180-SCAN-SVG-XML",
            severity: "fatal",
          }),
        ]),
      );
      await expect(loadAtom(input), name).rejects.toMatchObject({
        name: Vector180LoadError.name,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "VECTOR180-SCAN-SVG-XML",
            severity: "fatal",
          }),
        ]),
      });
    }
  });

  it("rejects DOCTYPE and custom entity declarations even without filename hints", async () => {
    const source = await readMinimalAtom();
    const withoutDeclaration = source.replace(/^<\?xml[^?]*\?>\n/u, "");
    const cases = [
      `<!DOCTYPE svg>\n${withoutDeclaration}`,
      `<!DOCTYPE svg [<!ENTITY custom "Vector180">]>\n${withoutDeclaration.replace(
        "Minimal Vector180 diagram",
        "Minimal &custom; diagram",
      )}`,
    ];

    for (const candidate of cases) {
      const scan = await scanVector180Source({ kind: "text", text: candidate });

      expect(scan.kind).toBe("svg");
      expect(scan.sections).toEqual([]);
      expect(scan.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "VECTOR180-SCAN-SVG-XML",
            severity: "fatal",
            message:
              "Standalone Vector180 SVG forbids DOCTYPE, DTD, and custom entity declarations.",
          }),
        ]),
      );
    }
  });
});
