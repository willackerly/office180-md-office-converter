// Tests: CONTRACT:C5-PPTV-PATCH.2.0

import { describe, expect, it } from "vitest";

import { loadAtom } from "../core/deck.js";
import { resolveVector180Atom } from "../core/resolved.js";
import type {
  CloneConnectorOperation,
  Vector180ConcreteNativeStyle,
  Vector180Atom,
} from "../core/types.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import { errorCodes } from "./test-helpers.js";

const CONNECTOR_STYLE: Vector180ConcreteNativeStyle = {
  fill: "none",
  stroke: "#334455",
  strokeWidth: 3,
  opacity: 1,
  fontWeight: 400,
  fontStyle: "normal",
  textAnchor: "start",
};

function diagramSource(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-vector180-version="0.1"
  id="diagram" viewBox="0 0 800 600">
  <rect id="node-a" data-vector180-role="shape" data-vector180-export="native"
    x="20" y="30" width="100" height="60" fill="#ddeeff"/>
  <rect id="node-b" data-vector180-role="shape" data-vector180-export="native"
    x="250" y="70" width="100" height="60" fill="#eeddee"/>
  <line id='connector' data-vector180-role='connector' data-vector180-export='native'
    x1='120.0' y1='60' x2='250' y2='100'
    data-vector180-from='node-a' data-vector180-to='node-b'
    fill = 'none' stroke='#334455' stroke-width='3' opacity='1'
    font-weight='400' font-style='normal' text-anchor='start'/>
  <g id="group" data-vector180-role="group" data-vector180-export="native">
    <rect id="group-a" data-vector180-role="shape" data-vector180-export="native"
      x="400" y="220" width="100" height="60" fill="#eeeeee"/>
    <rect id="group-b" data-vector180-role="shape" data-vector180-export="native"
      x="620" y="220" width="100" height="60" fill="#eeeeee"/>
    <line id="group-connector" data-vector180-role="connector"
      data-vector180-export="native" x1="500" y1="250" x2="620" y2="250"
      data-vector180-from="group-a" data-vector180-to="group-b"
      fill="none" stroke="#334455" stroke-width="3" opacity="1"
      font-weight="400" font-style="normal" text-anchor="start"/>
  </g>
</svg>`;
}

async function loadFixture(source = diagramSource()): Promise<Vector180Atom> {
  const diagram = await loadAtom({ kind: "text", text: source });
  expect(resolveVector180Atom(diagram).model).toBeDefined();
  return diagram;
}

function rootClone(order: string[]): CloneConnectorOperation {
  return {
    op: "clone-connector",
    templateId: "connector",
    newId: "connector-copy",
    parentId: "diagram",
    oldOrder: ["node-a", "node-b", "connector", "group"],
    order,
    oldConnector: {
      fromId: "node-a",
      toId: "node-b",
      endpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
      style: CONNECTOR_STYLE,
    },
    connector: {
      fromId: "node-b",
      toId: "group",
      endpoints: { x1: 350, y1: 100, x2: 400, y2: 250 },
      style: { ...CONNECTOR_STYLE, stroke: "#aa0000", strokeWidth: 4 },
    },
  };
}

function groupClone(): CloneConnectorOperation {
  return {
    op: "clone-connector",
    templateId: "group-connector",
    newId: "group-connector-copy",
    parentId: "group",
    oldOrder: ["group-a", "group-b", "group-connector"],
    order: ["group-a", "group-connector-copy", "group-b", "group-connector"],
    oldConnector: {
      fromId: "group-a",
      toId: "group-b",
      endpoints: { x1: 500, y1: 250, x2: 620, y2: 250 },
      style: CONNECTOR_STYLE,
    },
    connector: {
      fromId: "group-b",
      toId: "group-a",
      endpoints: { x1: 620, y1: 270, x2: 500, y2: 270 },
      style: CONNECTOR_STYLE,
    },
  };
}

function patch(
  diagram: Vector180Atom,
  ops: unknown[],
  schema = "vector180-patch/0.1",
) {
  return {
    schema,
    baseSha256: diagram.source.sha256,
    ops,
  };
}

describe("Vector180 connector clone in unified patch 0.1", () => {
  it.each([
    {
      label: "before the first child",
      order: ["connector-copy", "node-a", "node-b", "connector", "group"],
    },
    {
      label: "between existing children",
      order: ["node-a", "node-b", "connector-copy", "connector", "group"],
    },
    {
      label: "after the last child",
      order: ["node-a", "node-b", "connector", "group", "connector-copy"],
    },
  ])("clones exact connector bytes $label", async ({ order }) => {
    const diagram = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram, [rootClone(order)]),
    );

    expect(result.applied).toBe(true);
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.range.charStart).toBe(
      result.edits[0]?.range.charEnd,
    );
    expect(result.atom?.children.map((child) => child.id)).toEqual(order);
    const clone = resolveVector180Atom(result.atom!).model?.objects.find(
      (object) => object.id === "connector-copy",
    );
    expect(clone).toMatchObject({
      kind: "line",
      fromId: "node-b",
      toId: "group",
      x1: 350,
      y1: 100,
      x2: 400,
      y2: 250,
      style: {
        stroke: "#aa0000",
        strokeWidth: 4,
      },
    });
    expect(result.sourceText).toContain(
      "<line id='connector' data-vector180-role='connector'",
    );
    expect(result.sourceText).toContain(
      "<line id='connector-copy' data-vector180-role='connector'",
    );
    expect(result.sourceText).toContain(
      "data-vector180-from='node-b' data-vector180-to='group'",
    );
    expect(result.sourceText).toContain("stroke='#aa0000' stroke-width='4'");

    const insertion = result.edits[0]!;
    const recovered =
      result.sourceText!.slice(0, insertion.range.charStart) +
      result.sourceText!.slice(
        insertion.range.charStart + insertion.replacement.length,
      );
    expect(recovered).toBe(diagram.source.text);
  });

  it("clones into one native group without reparenting existing children", async () => {
    const diagram = await loadFixture();
    const operation = groupClone();
    const result = await applyPatch(diagram, patch(diagram, [operation]));

    expect(result.applied).toBe(true);
    expect(
      result.atom?.children
        .find((child) => child.id === "group")
        ?.children.map((child) => child.id),
    ).toEqual(operation.order);
    expect(result.affectedIds).toContain("group-connector-copy");
    expect(resolveVector180Atom(result.atom!).model).toBeDefined();
  });

  it("retains unchanged connector spelling inside the exact lexical clone", async () => {
    const diagram = await loadFixture();
    const operation = rootClone([
      "node-a",
      "node-b",
      "connector-copy",
      "connector",
      "group",
    ]);
    operation.connector = operation.oldConnector;
    const result = await applyPatch(diagram, patch(diagram, [operation]));

    expect(result.applied).toBe(true);
    const cloneStart = result.sourceText!.indexOf("<line id='connector-copy'");
    const cloneEnd = result.sourceText!.indexOf("/>", cloneStart);
    expect(result.sourceText!.slice(cloneStart, cloneEnd)).toContain(
      "x1='120.0' y1='60'",
    );
  });

  it.each(["pptv-patch/0.1", "pptv-patch/0.2", "pptv-patch/0.3"])(
    "rejects the frozen legacy %s envelope against canonical source",
    async (schema) => {
      const diagram = await loadFixture();
      const result = await applyPatch(
        diagram,
        patch(
          diagram,
          [
            {
              op: "set-connector-endpoints",
              id: "connector",
              oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
              endpoints: { x1: 125, y1: 60, x2: 250, y2: 100 },
            },
          ],
          schema,
        ),
      );

      expect(errorCodes(result.diagnostics)).toContain(
        "VECTOR180-PATCH-SCHEMA",
      );
      expect(result.sourceText).toBeUndefined();
      expect(result.edits).toEqual([]);
    },
  );

  it("refuses a canonical patch against legacy PPTV source", async () => {
    const legacySource = diagramSource().replaceAll(
      "data-vector180-",
      "data-pptv-",
    );
    const legacy = await loadAtom({ kind: "text", text: legacySource });
    expect(legacy.wireFamily).toBe("pptv-legacy");

    const result = await applyPatch(
      legacy,
      patch(legacy, [
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 125, y1: 60, x2: 250, y2: 100 },
        },
      ]),
    );

    expect(errorCodes(result.diagnostics)).toContain(
      "VECTOR180-LEGACY-WRITE-REQUIRES-MIGRATION",
    );
    expect(result.sourceText).toBeUndefined();
    expect(result.edits).toEqual([]);
  });

  it("uses the canonical envelope for ordinary typed operations", async () => {
    const diagram = await loadFixture();
    const result = await applyPatch(
      diagram,
      patch(diagram, [
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 125, y1: 60, x2: 250, y2: 100 },
        },
      ]),
    );

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain("x1='125' y1='60' x2='250' y2='100'");
  });

  it("permits zero or one clone operation and rejects two", async () => {
    const diagram = await loadFixture();
    const noClone = await validatePatch(
      diagram,
      patch(diagram, [
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 125, y1: 60, x2: 250, y2: 100 },
        },
      ]),
    );
    const operation = rootClone([
      "node-a",
      "node-b",
      "connector-copy",
      "connector",
      "group",
    ]);
    const twoClones = await validatePatch(
      diagram,
      patch(diagram, [operation, { ...operation, newId: "connector-copy-2" }]),
    );

    expect(errorCodes(noClone)).toEqual([]);
    expect(errorCodes(twoClones)).toContain("VECTOR180-PATCH-SCHEMA");
  });

  it("rejects stale state, reused IDs, missing references, and non-insertion order", async () => {
    const diagram = await loadFixture();
    const base = rootClone([
      "node-a",
      "node-b",
      "connector-copy",
      "connector",
      "group",
    ]);
    const stale = await applyPatch(
      diagram,
      patch(diagram, [
        {
          ...base,
          oldConnector: {
            ...base.oldConnector,
            endpoints: { x1: 121, y1: 60, x2: 250, y2: 100 },
          },
        },
      ]),
    );
    const reused = await applyPatch(
      diagram,
      patch(diagram, [
        {
          ...base,
          newId: "node-a",
          order: ["node-a", "node-b", "connector", "group"],
        },
      ]),
    );
    const missingReference = await applyPatch(
      diagram,
      patch(diagram, [
        {
          ...base,
          connector: { ...base.connector, toId: "missing-target" },
        },
      ]),
    );
    const reordered = await applyPatch(
      diagram,
      patch(diagram, [
        {
          ...base,
          order: ["node-b", "node-a", "connector-copy", "connector", "group"],
        },
      ]),
    );

    expect(errorCodes(stale.diagnostics)).toContain(
      "VECTOR180-PATCH-PRECONDITION",
    );
    expect(errorCodes(reused.diagnostics)).toContain(
      "VECTOR180-PATCH-PRECONDITION",
    );
    expect(errorCodes(missingReference.diagnostics)).toContain(
      "VECTOR180-PATCH-REFERENCE",
    );
    expect(errorCodes(reordered.diagnostics)).toContain(
      "VECTOR180-PATCH-PRECONDITION",
    );
    for (const result of [stale, reused, missingReference, reordered]) {
      expect(result.sourceText).toBeUndefined();
      expect(result.edits).toEqual([]);
    }
  });

  it("rejects non-whitespace insertion slots and non-direct style materialization", async () => {
    const order = ["node-a", "node-b", "connector-copy", "connector", "group"];
    const mixed = await loadFixture(
      diagramSource().replace(
        "  <line id='connector'",
        "  <!-- insertion boundary -->\n  <line id='connector'",
      ),
    );
    const mixedResult = await applyPatch(
      mixed,
      patch(mixed, [rootClone(order)]),
    );

    const inline = await loadFixture(
      diagramSource().replace("stroke='#334455'", "style='stroke:#334455'"),
    );
    const inlineResult = await applyPatch(
      inline,
      patch(inline, [rootClone(order)]),
    );
    const missingLiteral = await loadFixture(
      diagramSource().replace(" data-vector180-to='node-b'", ""),
    );
    const missingLiteralResult = await applyPatch(
      missingLiteral,
      patch(missingLiteral, [rootClone(order)]),
    );

    expect(errorCodes(mixedResult.diagnostics)).toContain(
      "VECTOR180-PATCH-UNSAFE-RANGE",
    );
    expect(errorCodes(inlineResult.diagnostics)).toContain(
      "VECTOR180-PATCH-UNSAFE-RANGE",
    );
    expect(errorCodes(missingLiteralResult.diagnostics)).toContain(
      "VECTOR180-PATCH-UNSAFE-RANGE",
    );
    expect(mixedResult.sourceText).toBeUndefined();
    expect(inlineResult.sourceText).toBeUndefined();
    expect(missingLiteralResult.sourceText).toBeUndefined();
  });

  it("rejects same-container order and template-byte conflicts atomically", async () => {
    const diagram = await loadFixture();
    const clone = rootClone([
      "node-a",
      "node-b",
      "connector-copy",
      "connector",
      "group",
    ]);
    const orderConflict = await applyPatch(
      diagram,
      patch(diagram, [
        clone,
        {
          op: "set-child-order",
          parentId: "diagram",
          oldOrder: ["node-a", "node-b", "connector", "group"],
          order: ["node-b", "node-a", "connector", "group"],
        },
      ]),
    );
    const templateConflict = await applyPatch(
      diagram,
      patch(diagram, [
        clone,
        {
          op: "set-connector-endpoints",
          id: "connector",
          oldEndpoints: { x1: 120, y1: 60, x2: 250, y2: 100 },
          endpoints: { x1: 125, y1: 60, x2: 250, y2: 100 },
        },
      ]),
    );
    const deletionConflict = await applyPatch(
      diagram,
      patch(diagram, [
        clone,
        {
          op: "delete-object",
          id: "group",
          oldParentId: null,
          oldOrder: 3,
        },
      ]),
    );

    expect(errorCodes(orderConflict.diagnostics)).toContain(
      "VECTOR180-PATCH-OVERLAP",
    );
    expect(errorCodes(templateConflict.diagnostics)).toContain(
      "VECTOR180-PATCH-OVERLAP",
    );
    expect(errorCodes(deletionConflict.diagnostics)).toContain(
      "VECTOR180-PATCH-REFERENCE",
    );
    expect(orderConflict.sourceText).toBeUndefined();
    expect(templateConflict.sourceText).toBeUndefined();
    expect(deletionConflict.sourceText).toBeUndefined();
  });
});
