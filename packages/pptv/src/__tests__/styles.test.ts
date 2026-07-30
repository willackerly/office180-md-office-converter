// Tests: CONTRACT:C6-PPTV-RESOLVED.1.1

import { describe, expect, it } from "vitest";

import { loadDeck } from "../core/deck.js";
import { resolvePptvStyles, type PptvStyleResolution } from "../core/styles.js";
import { errorCodes, readMinimalDeck } from "./test-helpers.js";

async function resolveSource(
  mutate: (source: string) => string = (source) => source,
): Promise<PptvStyleResolution> {
  const source = mutate(await readMinimalDeck());
  const deck = await loadDeck({
    kind: "text",
    text: source,
    name: "styles.pptv.html",
  });
  return resolvePptvStyles(deck);
}

function replaceRequired(
  source: string,
  before: string,
  after: string,
): string {
  expect(source).toContain(before);
  return source.replace(before, after);
}

function replaceBaseEnd(source: string, insertion: string): string {
  return replaceRequired(
    source,
    '</script>\n\n<script type="text/css" data-pptv-theme="light">',
    `${insertion}\n</script>\n\n<script type="text/css" data-pptv-theme="light">`,
  );
}

describe("C6 constrained style resolution", () => {
  it("resolves complete theme tokens, fixed defaults, and provenance", async () => {
    const result = await resolveSource();
    expect(result.diagnostics).toEqual([]);

    expect(result.styles.get("cover.title")).toEqual({
      style: {
        fill: "#17211e",
        stroke: "none",
        strokeWidth: 1,
        opacity: 1,
        fontFamily: "Arial",
        fontSize: 96,
        fontWeight: 700,
        fontStyle: "normal",
        textAnchor: "start",
      },
      styleProvenance: {
        fill: expect.objectContaining({
          origin: "base-rule",
          expression: "var(--pptv-text-primary)",
          selector: ".cover-title",
          sourceOrder: 1,
          token: "--pptv-text-primary",
        }),
        stroke: { origin: "default", expression: "none" },
        strokeWidth: { origin: "default", expression: "1" },
        opacity: { origin: "default", expression: "1" },
        fontFamily: expect.objectContaining({
          origin: "base-rule",
          token: "--pptv-font-major",
        }),
        fontSize: expect.objectContaining({
          origin: "base-rule",
          expression: "96px",
        }),
        fontWeight: expect.objectContaining({
          origin: "base-rule",
          expression: "700",
        }),
        fontStyle: { origin: "default", expression: "normal" },
        textAnchor: { origin: "default", expression: "start" },
      },
    });
  });

  it("validates every theme but substitutes only the selected theme", async () => {
    const dark = await resolveSource((source) =>
      replaceRequired(source, '"theme": "light"', '"theme": "dark"'),
    );
    expect(dark.diagnostics).toEqual([]);
    expect(dark.styles.get("cover.title")?.style.fill).toBe("#f5f7f6");

    const incompleteInactive = await resolveSource((source) =>
      replaceRequired(source, "  --pptv-accent-1: #9a8cff;\n", ""),
    );
    expect(errorCodes(incompleteInactive.diagnostics)).toContain(
      "PPTV-PROFILE-THEME-TOKENS",
    );

    const extraInactive = await resolveSource((source) =>
      replaceRequired(
        source,
        "  --pptv-font-major: Arial;\n}\n</script>\n\n<script data-pptv-runtime",
        "  --pptv-font-major: Arial;\n  --pptv-extra: #010203;\n}\n</script>\n\n<script data-pptv-runtime",
      ),
    );
    expect(errorCodes(extraInactive.diagnostics)).toContain(
      "PPTV-PROFILE-THEME-TOKENS",
    );
  });

  it("applies presentation attributes, base rules, and inline style in order", async () => {
    const result = await resolveSource((source) =>
      replaceRequired(
        source,
        'id="cover.title" class="cover-title"',
        'id="cover.title" class="cover-title" fill="#abcdef" font-size="20px" stroke-width="2px" style="fill:#112233; opacity:.5"',
      ),
    );
    expect(result.diagnostics).toEqual([]);

    const title = result.styles.get("cover.title");
    expect(title?.style).toMatchObject({
      fill: "#112233",
      fontSize: 96,
      strokeWidth: 2,
      opacity: 0.5,
    });
    expect(title?.styleProvenance.fill.origin).toBe("inline-style");
    expect(title?.styleProvenance.fontSize?.origin).toBe("base-rule");
    expect(title?.styleProvenance.strokeWidth.origin).toBe(
      "presentation-attribute",
    );
  });

  it("gives equal-specificity class rules deterministic source-order behavior", async () => {
    const result = await resolveSource((source) =>
      replaceBaseEnd(
        source,
        "\n.cover-title {\n  fill: #ABCDEF;\n  font-size: 88;\n}",
      ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.styles.get("cover.title")?.style).toMatchObject({
      fill: "#abcdef",
      fontSize: 88,
    });
    expect(result.styles.get("cover.title")?.styleProvenance.fill).toEqual(
      expect.objectContaining({
        selector: ".cover-title",
        sourceOrder: 7,
        expression: "#ABCDEF",
      }),
    );
  });

  it("accepts one quoted concrete font and normalizes numeric px values", async () => {
    const result = await resolveSource((source) =>
      source.replaceAll(
        "--pptv-font-major: Arial;",
        '--pptv-font-major: "Aptos Display";',
      ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.styles.get("cover.title")?.style).toMatchObject({
      fontFamily: "Aptos Display",
      fontSize: 96,
    });
  });

  it.each([
    {
      name: "selector lists",
      mutate: (source: string) =>
        replaceRequired(
          source,
          ".cover-title {",
          ".cover-title, .slide-title {",
        ),
      code: "PPTV-PROFILE-CSS-SELECTOR",
    },
    {
      name: "unsupported declarations",
      mutate: (source: string) =>
        replaceRequired(
          source,
          ".cover-title {\n  fill:",
          ".cover-title {\n  transition: all 1s;\n  fill:",
        ),
      code: "PPTV-PROFILE-CSS-PROPERTY",
    },
    {
      name: "calc",
      mutate: (source: string) =>
        replaceRequired(
          source,
          "  font-size: 96px;",
          "  font-size: calc(90px + 6px);",
        ),
      code: "PPTV-PROFILE-CSS-VALUE",
    },
    {
      name: "important",
      mutate: (source: string) =>
        replaceRequired(
          source,
          "  font-weight: 700;",
          "  font-weight: 700 !important;",
        ),
      code: "PPTV-PROFILE-CSS-VALUE",
    },
    {
      name: "font fallback lists",
      mutate: (source: string) =>
        source.replaceAll(
          "--pptv-font-major: Arial;",
          "--pptv-font-major: Arial, sans-serif;",
        ),
      code: "PPTV-PROFILE-FONT",
    },
    {
      name: "theme token references",
      mutate: (source: string) =>
        replaceRequired(
          source,
          "--pptv-background: #ffffff;",
          "--pptv-background: var(--pptv-text-primary);",
        ),
      code: "PPTV-PROFILE-CSS-VALUE",
    },
  ])("fails closed for prohibited CSS: $name", async ({ mutate, code }) => {
    const result = await resolveSource(mutate);
    expect(errorCodes(result.diagnostics)).toContain(code);
  });

  it("rejects duplicate base properties and duplicate theme tokens", async () => {
    const duplicateBase = await resolveSource((source) =>
      replaceRequired(
        source,
        ".slide-background {\n  fill: var(--pptv-background);",
        ".slide-background {\n  fill: #ffffff;\n  fill: var(--pptv-background);",
      ),
    );
    expect(errorCodes(duplicateBase.diagnostics)).toContain(
      "PPTV-PROFILE-CSS-PROPERTY",
    );

    const duplicateTheme = await resolveSource((source) =>
      replaceRequired(
        source,
        "--pptv-background: #ffffff;",
        "--pptv-background: #ffffff;\n  --pptv-background: #eeeeee;",
      ),
    );
    expect(errorCodes(duplicateTheme.diagnostics)).toContain(
      "PPTV-PROFILE-THEME-TOKENS",
    );
  });

  it("rejects unsupported local presentation and inline properties", async () => {
    const presentation = await resolveSource((source) =>
      replaceRequired(
        source,
        'id="cover.title" class="cover-title"',
        'id="cover.title" class="cover-title" filter="none"',
      ),
    );
    expect(errorCodes(presentation.diagnostics)).toContain(
      "PPTV-PROFILE-CSS-PROPERTY",
    );
    expect(
      presentation.diagnostics.find(
        (diagnostic) =>
          diagnostic.code === "PPTV-PROFILE-CSS-PROPERTY" &&
          diagnostic.objectId === "cover.title",
      )?.slideId,
    ).toBe("cover");

    const inline = await resolveSource((source) =>
      replaceRequired(
        source,
        'id="cover.title" class="cover-title"',
        'id="cover.title" class="cover-title" style="fill:#123456; animation:none"',
      ),
    );
    expect(errorCodes(inline.diagnostics)).toContain(
      "PPTV-PROFILE-CSS-PROPERTY",
    );
  });

  it("requires explicit resolved family and size for text only", async () => {
    const result = await resolveSource((source) =>
      replaceRequired(
        source,
        ".cover-subtitle {\n  fill: var(--pptv-text-secondary);\n  font-family: var(--pptv-font-major);\n  font-size: 34px;",
        ".cover-subtitle {\n  fill: var(--pptv-text-secondary);",
      ),
    );
    const missingFont = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "PPTV-PROFILE-FONT" &&
        diagnostic.objectId === "cover.subtitle",
    );
    expect(missingFont?.message).toContain("font-family");
    expect(missingFont?.message).toContain("font-size");
    expect(
      result.styles.get("cover.background")?.style.fontFamily,
    ).toBeUndefined();
  });

  it("is deterministic and omits ignored objects from its lookup", async () => {
    const mutate = (source: string): string =>
      replaceRequired(
        source,
        'id="architecture.edge.client-policy" class="diagram-edge"\n          data-pptv-role="connector" data-pptv-export="native"',
        'id="architecture.edge.client-policy" class="diagram-edge"\n          data-pptv-role="connector" data-pptv-export="ignore"',
      );
    const first = await resolveSource(mutate);
    const second = await resolveSource(mutate);

    expect(first.styles.has("architecture.edge.client-policy")).toBe(false);
    expect(
      JSON.stringify({
        styles: [...first.styles],
        diagnostics: first.diagnostics,
      }),
    ).toBe(
      JSON.stringify({
        styles: [...second.styles],
        diagnostics: second.diagnostics,
      }),
    );
  });
});
