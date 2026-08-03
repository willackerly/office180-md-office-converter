// Tests: CONTRACT:C5-PPTV-PATCH.1.3

import { describe, expect, it } from "vitest";

import { loadDiagram } from "../core/deck.js";
import { resolvePptvDiagram } from "../core/resolved.js";
import type { PptvConcreteNativeStyle } from "../core/types.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import { errorCodes } from "./test-helpers.js";

const RECT_STYLE: PptvConcreteNativeStyle = {
  fill: "#112233",
  stroke: "#445566",
  strokeWidth: 2,
  opacity: 0.8,
  fontWeight: 400,
  fontStyle: "normal",
  textAnchor: "start",
};

function diagramSource(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-pptv-version="0.1"
  id="diagram" viewBox="0 0 800 600">
  <rect id="rect-a" data-pptv-role="shape" data-pptv-export="native"
    x="20" y="30" width="100" height="60"
    fill = '#112233' stroke="#445566" stroke-width="2" opacity=".8"/>
  <ellipse id="ellipse-b" data-pptv-role="shape" data-pptv-export="native"
    cx="300" cy="100" rx="50" ry="35" fill="#abcdef"/>
  <line id="connector" data-pptv-role="connector" data-pptv-export="native"
    x1="120" y1="60" x2="250" y2="100"
    data-pptv-from="rect-a" data-pptv-to="ellipse-b"
    fill="none" stroke="#334455" stroke-width="3"/>
  <g id="group" data-pptv-role="group" data-pptv-export="native"
    transform="translate(10, 20)">
    <rect id="group-box" data-pptv-role="shape" data-pptv-export="native"
      x="400" y="250" width="180" height="100" fill="#eeeeee"/>
    <text id="group-label" data-pptv-role="text" data-pptv-export="native"
      data-pptv-frame="420 270 140 50" data-pptv-line-step="24"
      x="420" y="300" fill="#111111" font-family="Aptos"
      font-size="20">Group label</text>
  </g>
</svg>`;
}

async function loadFixture() {
  const source = diagramSource();
  const diagram = await loadDiagram({ kind: "text", text: source });
  expect(resolvePptvDiagram(diagram).model).toBeDefined();
  return { source, diagram };
}

function patch(baseSha256: string, ops: unknown[]) {
  return {
    schema: "pptv-patch/0.2",
    baseSha256,
    ops,
  };
}

describe("PPTV typed patch 0.2", () => {
  it("keeps 0.1 compatible and rejects new operations in a 0.1 envelope", async () => {
    const { diagram } = await loadFixture();
    const legacy = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "group-label",
          oldText: "Group label",
          value: "Legacy works",
        },
      ],
    });
    const wrongEnvelope = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-object-geometry",
          id: "rect-a",
          oldGeometry: {
            kind: "rect",
            x: 20,
            y: 30,
            width: 100,
            height: 60,
          },
          geometry: {
            kind: "rect",
            x: 25,
            y: 30,
            width: 100,
            height: 60,
          },
        },
      ],
    });

    expect(legacy.applied).toBe(true);
    expect(errorCodes(wrongEnvelope.diagnostics)).toContain(
      "PPTV-PATCH-UNSUPPORTED",
    );
    expect(wrongEnvelope.sourceText).toBeUndefined();
  });

  it("patches rect and true ellipse geometry through existing attributes", async () => {
    const { source, diagram } = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-object-geometry",
          id: "rect-a",
          oldGeometry: {
            kind: "rect",
            x: 20,
            y: 30,
            width: 100,
            height: 60,
          },
          geometry: {
            kind: "rect",
            x: 25,
            y: 35,
            width: 110,
            height: 65,
          },
        },
        {
          op: "set-object-geometry",
          id: "ellipse-b",
          oldGeometry: {
            kind: "ellipse",
            cx: 300,
            cy: 100,
            rx: 50,
            ry: 35,
          },
          geometry: {
            kind: "ellipse",
            cx: 310,
            cy: 105,
            rx: 55,
            ry: 40,
          },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain(
      'x="25" y="35" width="110" height="65"',
    );
    expect(result.sourceText).toContain('cx="310" cy="105" rx="55" ry="40"');
    expect(result.sourceText).toContain('data-pptv-from="rect-a"');
    expect(result.sourceText).not.toBe(source);
    expect(resolvePptvDiagram(result.diagram!).model).toBeDefined();
  });

  it("patches connector endpoints without touching stable references", async () => {
    const { diagram } = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 130, y1: 65, x2: 260, y2: 110 },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain('x1="130" y1="65" x2="260" y2="110"');
    expect(result.sourceText).toContain('data-pptv-to="ellipse-b"');
  });

  it("patches only an explicitly represented group translation", async () => {
    const { diagram } = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-group-translation",
          id: "group",
          oldTranslation: { x: 10, y: 20 },
          translation: { x: 15, y: 25 },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain('transform="translate(15 25)"');

    const implicitSource = diagramSource().replace(
      '\n    transform="translate(10, 20)"',
      "",
    );
    const implicit = await loadDiagram({
      kind: "text",
      text: implicitSource,
    });
    const rejected = await applyPatch(
      implicit,
      patch(implicit.source.sha256, [
        {
          op: "set-group-translation",
          id: "group",
          oldTranslation: { x: 0, y: 0 },
          translation: { x: 5, y: 5 },
        },
      ]),
    );
    expect(errorCodes(rejected.diagnostics)).toContain(
      "PPTV-PATCH-UNSAFE-RANGE",
    );
  });

  it("moves a direct text frame and its explicit hard-line anchor together", async () => {
    const { diagram } = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-text-frame",
          id: "group-label",
          oldFrame: { x: 420, y: 270, width: 140, height: 50 },
          frame: { x: 430, y: 280, width: 150, height: 55 },
          oldLineAnchor: { x: 420, y: 300 },
          lineAnchor: { x: 430, y: 312 },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain('data-pptv-frame="430 280 150 55"');
    expect(result.sourceText).toContain('x="430" y="312"');

    const mixedSource = diagramSource()
      .replace(
        '\n      x="420" y="300" fill="#111111"',
        '\n      fill="#111111"',
      )
      .replace(
        ">Group label</text>",
        '><tspan x="420" y="300">Group label</tspan></text>',
      );
    const mixed = await loadDiagram({ kind: "text", text: mixedSource });
    const rejected = await applyPatch(
      mixed,
      patch(mixed.source.sha256, [
        {
          op: "set-text-frame",
          id: "group-label",
          oldFrame: { x: 420, y: 270, width: 140, height: 50 },
          frame: { x: 430, y: 280, width: 150, height: 55 },
          oldLineAnchor: { x: 420, y: 300 },
          lineAnchor: { x: 430, y: 312 },
        },
      ]),
    );
    expect(errorCodes(rejected.diagnostics)).toContain(
      "PPTV-PATCH-UNSAFE-RANGE",
    );
  });

  it("reorders exact child element slots within a root or group", async () => {
    const { diagram } = await loadFixture();
    const rootResult = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-child-order",
          parentId: "diagram",
          oldOrder: ["rect-a", "ellipse-b", "connector", "group"],
          order: ["ellipse-b", "rect-a", "connector", "group"],
        },
      ]),
    );

    expect(rootResult.applied).toBe(true);
    expect(rootResult.diagram?.children.map((node) => node.id)).toEqual([
      "ellipse-b",
      "rect-a",
      "connector",
      "group",
    ]);

    const groupResult = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-child-order",
          parentId: "group",
          oldOrder: ["group-box", "group-label"],
          order: ["group-label", "group-box"],
        },
      ]),
    );
    expect(groupResult.applied).toBe(true);
    expect(
      groupResult.diagram?.children
        .find((node) => node.id === "group")
        ?.children.map((node) => node.id),
    ).toEqual(["group-label", "group-box"]);
  });

  it("deletes safe native objects and accounts for same-transaction connector deletion", async () => {
    const { diagram } = await loadFixture();
    const blocked = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "delete-object",
          id: "ellipse-b",
          oldParentId: null,
          oldOrder: 1,
        },
      ]),
    );
    expect(errorCodes(blocked.diagnostics)).toContain("PPTV-PATCH-REFERENCE");
    expect(blocked.sourceText).toBeUndefined();

    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "delete-object",
          id: "connector",
          oldParentId: null,
          oldOrder: 2,
        },
        {
          op: "delete-object",
          id: "ellipse-b",
          oldParentId: null,
          oldOrder: 1,
        },
      ]),
    );
    expect(result.applied).toBe(true);
    expect(result.diagram?.index.objects.has("connector")).toBe(false);
    expect(result.diagram?.index.objects.has("ellipse-b")).toBe(false);

    const root = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "delete-object",
          id: "diagram",
          oldParentId: null,
          oldOrder: 0,
        },
      ]),
    );
    expect(errorCodes(root.diagnostics)).toContain("PPTV-PATCH-UNSUPPORTED");
  });

  it("patches concrete style only through direct presentation attributes", async () => {
    const { diagram } = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-native-style",
          id: "rect-a",
          oldStyle: RECT_STYLE,
          style: { ...RECT_STYLE, fill: "#abcdef", strokeWidth: 4 },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain("fill = '#abcdef'");
    expect(result.sourceText).toContain('stroke-width="4"');

    const inheritedSource = diagramSource().replace(
      "    fill = '#112233' ",
      "    ",
    );
    const inherited = await loadDiagram({
      kind: "text",
      text: inheritedSource,
    });
    const inheritedModel = resolvePptvDiagram(inherited).model;
    const inheritedRect = inheritedModel?.objects.find(
      (object) => object.id === "rect-a",
    );
    expect(inheritedRect).toBeDefined();
    const rejected = await applyPatch(
      inherited,
      patch(inherited.source.sha256, [
        {
          op: "set-native-style",
          id: "rect-a",
          oldStyle: inheritedRect!.style,
          style: { ...inheritedRect!.style, fill: "#abcdef" },
        },
      ]),
    );
    expect(errorCodes(rejected.diagnostics)).toContain(
      "PPTV-PATCH-UNSAFE-RANGE",
    );
  });

  it("rejects stale old values, invalid numbers, and overlapping typed edits atomically", async () => {
    const { diagram } = await loadFixture();
    const stale = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-object-geometry",
          id: "rect-a",
          oldGeometry: {
            kind: "rect",
            x: 21,
            y: 30,
            width: 100,
            height: 60,
          },
          geometry: {
            kind: "rect",
            x: 25,
            y: 30,
            width: 100,
            height: 60,
          },
        },
      ]),
    );
    expect(errorCodes(stale.diagnostics)).toContain("PPTV-PATCH-PRECONDITION");
    expect(stale.sourceText).toBeUndefined();

    const invalid = await validatePatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 1, y1: 1, x2: 1, y2: 1 },
        },
      ]),
    );
    expect(errorCodes(invalid)).toContain("PPTV-PATCH-SCHEMA");

    const overlap = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-object-geometry",
          id: "group-box",
          oldGeometry: {
            kind: "rect",
            x: 400,
            y: 250,
            width: 180,
            height: 100,
          },
          geometry: {
            kind: "rect",
            x: 405,
            y: 250,
            width: 180,
            height: 100,
          },
        },
        {
          op: "delete-object",
          id: "group-box",
          oldParentId: "group",
          oldOrder: 0,
        },
      ]),
    );
    expect(errorCodes(overlap.diagnostics)).toContain("PPTV-PATCH-OVERLAP");
    expect(overlap.sourceText).toBeUndefined();
    expect(overlap.edits).toEqual([]);
  });

  it("rejects circle representation and C6-invalid candidate text placement", async () => {
    const circleSource = diagramSource()
      .replace('<ellipse id="ellipse-b"', '<circle id="ellipse-b"')
      .replace(' rx="50" ry="35"', ' r="50"');
    const circle = await loadDiagram({ kind: "text", text: circleSource });
    expect(resolvePptvDiagram(circle).model).toBeDefined();
    const circleResult = await applyPatch(
      circle,
      patch(circle.source.sha256, [
        {
          op: "set-object-geometry",
          id: "ellipse-b",
          oldGeometry: {
            kind: "ellipse",
            cx: 300,
            cy: 100,
            rx: 50,
            ry: 50,
          },
          geometry: {
            kind: "ellipse",
            cx: 310,
            cy: 100,
            rx: 55,
            ry: 45,
          },
        },
      ]),
    );
    expect(errorCodes(circleResult.diagnostics)).toContain(
      "PPTV-PATCH-UNSAFE-RANGE",
    );

    const { diagram } = await loadFixture();
    const invalidResult = await applyPatch(
      diagram,
      patch(diagram.source.sha256, [
        {
          op: "set-text-frame",
          id: "group-label",
          oldFrame: { x: 420, y: 270, width: 140, height: 50 },
          frame: { x: 430, y: 280, width: 150, height: 55 },
          oldLineAnchor: { x: 420, y: 300 },
          lineAnchor: { x: 700, y: 500 },
        },
      ]),
    );
    expect(errorCodes(invalidResult.diagnostics)).toContain(
      "PPTV-PATCH-INVALID-RESULT",
    );
    expect(invalidResult.sourceText).toBeUndefined();
  });
});
