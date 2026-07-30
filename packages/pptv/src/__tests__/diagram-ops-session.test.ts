// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.1

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { EditorSession } from "../browser/session.js";
import { loadDiagram } from "../core/deck.js";
import {
  addPptvDiagramDiscoveryComment,
  PPTV_DIAGRAM_DISCOVERY_COMMENT,
} from "../core/extract.js";
import { applyPatch, validatePatch } from "../ops/patch.js";
import {
  extractDiagramText,
  getDiagram,
  getDiagramObject,
  inventoryDiagram,
  outlineDiagram,
  queryDiagramObjects,
} from "../ops/projections.js";
import { errorCodes } from "./test-helpers.js";

async function readMinimalDiagram(): Promise<string> {
  return readFile(
    new URL("../../../../examples/minimal-diagram.pptv.svg", import.meta.url),
    "utf8",
  );
}

describe("standalone diagram projections", () => {
  it("returns diagram-specific JSON-safe envelopes without synthetic slides", async () => {
    const diagram = await loadDiagram({
      kind: "text",
      text: await readMinimalDiagram(),
      name: "minimal-diagram.pptv.svg",
    });

    expect(outlineDiagram(diagram)).toEqual({
      schema: "pptv-diagram-outline/0.1",
      version: "0.1",
      diagramId: "system-overview",
      viewBox: [-100, -50, 1200, 800],
    });
    expect(
      inventoryDiagram(diagram).objects.map((object) => object.id),
    ).toEqual([
      "system-overview.background",
      "system-overview.title",
      "system-overview.flow",
      "system-overview.client",
      "system-overview.service",
    ]);
    expect(getDiagram(diagram).schema).toBe("pptv-diagram/0.1");
    expect(
      getDiagramObject(diagram, "system-overview.service.label", "editing"),
    ).toMatchObject({
      schema: "pptv-diagram-object/0.1",
      diagramId: "system-overview",
      object: {
        id: "system-overview.service.label",
        role: "text",
        text: "Policy service",
        attributes: {
          x: "700",
          y: "326",
        },
      },
    });
    expect(
      queryDiagramObjects(diagram, {
        descendantOf: "system-overview.service",
      }),
    ).toEqual({
      schema: "pptv-diagram-query/0.1",
      diagramId: "system-overview",
      objects: [
        expect.objectContaining({ id: "system-overview.service.panel" }),
        expect.objectContaining({ id: "system-overview.service.label" }),
      ],
    });

    const text = extractDiagramText(diagram);
    expect(text.schema).toBe("pptv-diagram-text/0.1");
    expect(text.entries.map((entry) => entry.text)).toEqual([
      "Standalone PPTV diagram",
      "Client",
      "Policy service",
    ]);
    expect(
      text.entries.every((entry) => entry.diagramId === "system-overview"),
    ).toBe(true);

    const serialized = JSON.stringify({
      outline: outlineDiagram(diagram),
      inventory: inventoryDiagram(diagram),
      diagram: getDiagram(diagram),
      object: getDiagramObject(diagram, "system-overview.title"),
      query: queryDiagramObjects(diagram, { role: "text" }),
      text,
    });
    expect(serialized).not.toContain("slideId");
    expect(serialized).not.toContain('"slides"');
  });

  it("suppresses ambiguous diagram object IDs in direct and query projections", async () => {
    const source = (await readMinimalDiagram()).replace(
      'id="system-overview.client.label"',
      'id="system-overview.title"',
    );
    const diagram = await loadDiagram({ kind: "text", text: source });

    expect(errorCodes(diagram.diagnostics)).toContain("PPTV-ID-DUPLICATE");
    expect(getDiagramObject(diagram, "system-overview.title")).toBeUndefined();
    expect(
      queryDiagramObjects(diagram, { ids: ["system-overview.title"] }).objects,
    ).toEqual([]);
  });
});

describe("standalone diagram preserve patches", () => {
  it("changes one direct-text range and reloads the same artifact kind", async () => {
    const source = await readMinimalDiagram();
    const diagram = await loadDiagram({ kind: "text", text: source });
    const result = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "system-overview.service.label",
          oldText: "Policy service",
          value: "Policy & trust",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.deck).toBeUndefined();
    expect(result.diagram?.sourceKind).toBe("svg");
    expect(result.diagram?.id).toBe("system-overview");
    expect(result.sourceText).toBe(
      source.replace(">Policy service</text>", ">Policy &amp; trust</text>"),
    );
    expect(
      getDiagramObject(result.diagram!, "system-overview.service.label")?.object
        .text,
    ).toBe("Policy & trust");
  });

  it("preserves a BOM, XML declaration, and every byte outside the text edit", async () => {
    const source = `\uFEFF${await readMinimalDiagram()}`;
    const diagram = await loadDiagram({ kind: "text", text: source });
    const result = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "system-overview.client.label",
          oldText: "Client",
          value: "Caller",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.sourceText).toBe(
      source.replace(">Client</text>", ">Caller</text>"),
    );
    expect(result.sourceText?.startsWith('\uFEFF<?xml version="1.0"')).toBe(
      true,
    );
    expect(result.diagram?.source.bytes.slice(0, 3)).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    );
  });

  it("rejects stale and failed text preconditions", async () => {
    const diagram = await loadDiagram({
      kind: "text",
      text: await readMinimalDiagram(),
    });
    const stale = await validatePatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: "0".repeat(64),
      ops: [
        {
          op: "set-text",
          id: "system-overview.title",
          value: "Changed",
        },
      ],
    });
    const precondition = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "system-overview.title",
          oldText: "Wrong",
          value: "Changed",
        },
      ],
    });

    expect(errorCodes(stale)).toContain("PPTV-PATCH-STALE");
    expect(errorCodes(precondition.diagnostics)).toContain(
      "PPTV-PATCH-PRECONDITION",
    );
    expect(precondition.sourceText).toBeUndefined();
    expect(precondition.diagram).toBeUndefined();
  });

  it("reconstructs a trusted diagram instead of accepting forged source ranges", async () => {
    const diagram = await loadDiagram({
      kind: "text",
      text: await readMinimalDiagram(),
    });
    const forgedObjects = new Map(diagram.index.objects);
    const title = forgedObjects.get("system-overview.title")!;
    const client = forgedObjects.get("system-overview.client.label")!;
    forgedObjects.set(title.id, {
      ...title,
      directTextRange: client.directTextRange!,
    });
    const forgedDiagram = {
      ...diagram,
      index: { ...diagram.index, objects: forgedObjects },
    };

    const result = await applyPatch(forgedDiagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "system-overview.title",
          oldText: "Standalone PPTV diagram",
          value: "Trusted range",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.sourceText).toContain(">Trusted range</text>");
    expect(result.sourceText).toContain(">Client</text>");
  });

  it("rejects deck-only operations before source ranges and remains atomic", async () => {
    const diagram = await loadDiagram({
      kind: "text",
      text: await readMinimalDiagram(),
    });
    for (const operation of [
      { op: "set-active-theme", theme: "dark" },
      { op: "set-slide-order", order: ["system-overview"] },
    ] as const) {
      const result = await applyPatch(diagram, {
        schema: "pptv-patch/0.1",
        baseSha256: diagram.source.sha256,
        ops: [operation],
      });
      expect(errorCodes(result.diagnostics)).toEqual([
        "PPTV-PATCH-UNSUPPORTED",
      ]);
      expect(result.sourceText).toBeUndefined();
      expect(result.diagram).toBeUndefined();
    }

    const mixed = await applyPatch(diagram, {
      schema: "pptv-patch/0.1",
      baseSha256: diagram.source.sha256,
      ops: [
        {
          op: "set-text",
          id: "system-overview.title",
          oldText: "Standalone PPTV diagram",
          value: "Would otherwise work",
        },
        { op: "set-active-theme", theme: "dark" },
      ],
    });
    expect(mixed.applied).toBe(false);
    expect(mixed.sourceText).toBeUndefined();
    expect(mixed.affectedIds).toEqual([]);
    expect(mixed.edits).toEqual([]);
    expect(errorCodes(mixed.diagnostics)).toContain("PPTV-PATCH-UNSUPPORTED");
  });
});

describe("standalone diagram editor session", () => {
  it("commits text, preserves exact undo/redo, and rejects deck-only intents", async () => {
    const source = `\uFEFF${addPptvDiagramDiscoveryComment(
      await readMinimalDiagram(),
    )}`;
    const session = await EditorSession.open({
      kind: "text",
      text: source,
      name: "minimal-diagram.pptv.svg",
    });

    expect(session.state.sourceKind).toBe("svg");
    expect(session.state.document.sourceKind).toBe("svg");
    expect(session.state.deck).toBeUndefined();
    expect(session.state.diagram?.id).toBe("system-overview");
    expect(session.select("system-overview")).toBe(true);
    expect(session.select("system-overview.service.label")).toBe(true);

    const result = await session.dispatch({
      kind: "set-text",
      id: "system-overview.service.label",
      value: "Authorization",
    });
    expect(result.applied).toBe(true);
    expect(result.diagram).toBeDefined();
    expect(session.state.sourceText).toContain(">Authorization</text>");
    expect(session.state.sourceText).toContain(PPTV_DIAGRAM_DISCOVERY_COMMENT);

    const changedSource = session.state.sourceText;
    const changedHash = session.state.sourceSha256;
    expect(session.undo()).toBe(true);
    expect(session.state.sourceText).toBe(source);
    expect(session.state.sourceSha256).toBe(session.originalSha256);
    expect(session.redo()).toBe(true);
    expect(session.state.sourceText).toBe(changedSource);
    expect(session.state.sourceSha256).toBe(changedHash);

    const historySource = session.state.sourceText;
    const unsupported = await session.dispatch({
      kind: "set-active-theme",
      theme: "dark",
    });
    expect(errorCodes(unsupported.diagnostics)).toEqual([
      "PPTV-PATCH-UNSUPPORTED",
    ]);
    expect(session.state.sourceText).toBe(historySource);
  });

  it("fails closed on an integrity mismatch without changing history", async () => {
    const session = await EditorSession.open(
      { kind: "text", text: await readMinimalDiagram() },
      { expectedSha256: "0".repeat(64) },
    );
    const result = await session.dispatch({
      kind: "set-text",
      id: "system-overview.title",
      value: "Blocked",
    });

    expect(session.state.editable).toBe(false);
    expect(errorCodes(result.diagnostics)).toEqual(["PPTV-EDITOR-READ-ONLY"]);
    expect(session.state.canUndo).toBe(false);
  });
});
