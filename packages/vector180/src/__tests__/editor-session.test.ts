// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C5-PPTV-PATCH.2.0

import { describe, expect, it } from "vitest";

import { EditorSession } from "../browser/session.js";
import { readMinimalDeck } from "./test-helpers.js";

function nativeEditorAtom(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-vector180-version="0.1"
  id="editor-atom" viewBox="0 0 800 600">
  <rect id="rect" data-vector180-role="shape" data-vector180-export="native"
    x="20" y="30" width="100" height="60" fill="#112233"
    stroke="#445566" stroke-width="2" opacity="0.8" font-weight="400"
    font-style="normal" text-anchor="start"/>
  <ellipse id="ellipse" data-vector180-role="shape" data-vector180-export="native"
    cx="300" cy="100" rx="50" ry="35" fill="#abcdef"
    stroke="none" stroke-width="0" opacity="1" font-weight="400"
    font-style="normal" text-anchor="start"/>
  <line id="connector" data-vector180-role="connector" data-vector180-export="native"
    x1="120" y1="60" x2="250" y2="100"
    data-vector180-from="rect" data-vector180-to="ellipse"
    fill="none" stroke="#334455" stroke-width="3" opacity="1"
    font-weight="400" font-style="normal" text-anchor="start"/>
  <g id="group" data-vector180-role="group" data-vector180-export="native"
    transform="translate(10 20)">
    <rect id="group-box" data-vector180-role="shape" data-vector180-export="native"
      x="400" y="250" width="180" height="100" fill="#eeeeee"/>
    <text id="group-label" data-vector180-role="text" data-vector180-export="native"
      data-vector180-frame="420 270 140 50" data-vector180-line-step="24"
      x="420" y="300" fill="#111111" stroke="none" stroke-width="0"
      opacity="1" font-family="Aptos" font-size="20" font-weight="400"
      font-style="normal" text-anchor="start">Group label</text>
  </g>
  <rect id="orphan" data-vector180-role="shape" data-vector180-export="native"
    x="40" y="500" width="60" height="40" fill="#eeeeee"/>
</svg>`;
}

describe("exact-source editor session", () => {
  it("commits through C5 and restores exact source snapshots on undo", async () => {
    const source = await readMinimalDeck();
    const session = await EditorSession.open(
      { kind: "text", text: source, name: "minimal-deck.vector180.html" },
      { author: "browser-test" },
    );

    expect(session.state.editable).toBe(true);
    expect(session.state.dirty).toBe(false);
    expect(session.select("cover.title")).toBe(true);

    const result = await session.dispatch({
      kind: "set-text",
      id: "cover.title",
      value: "Edited & exact",
    });

    expect(result.applied).toBe(true);
    expect(session.state.sourceText).toContain("Edited &amp; exact");
    expect(session.state.dirty).toBe(true);
    expect(session.state.canUndo).toBe(true);
    expect(session.state.selectedId).toBe("cover.title");

    expect(session.undo()).toBe(true);
    expect(session.state.sourceText).toBe(source);
    expect(session.state.sourceSha256).toBe(session.originalSha256);
    expect(session.state.dirty).toBe(false);
    expect(session.state.canRedo).toBe(true);

    expect(session.redo()).toBe(true);
    expect(session.state.sourceText).toBe(result.sourceText);
    expect(session.state.sourceSha256).toBe(result.sourceSha256);
  });

  it("does not add history for a failed intent", async () => {
    const session = await EditorSession.open({
      kind: "text",
      text: await readMinimalDeck(),
    });
    const original = session.state.sourceText;

    const result = await session.dispatch({
      kind: "set-text",
      id: "cover.background",
      value: "not text",
    });

    expect(result.applied).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("VECTOR180-EDITOR-TARGET");
    expect(session.state.sourceText).toBe(original);
    expect(session.state.canUndo).toBe(false);
  });

  it("refuses direct text mutation across an opaque or non-native boundary", async () => {
    const source = nativeEditorAtom().replace(
      "</svg>",
      `  <text id="ignored-text" data-vector180-role="text"
    data-vector180-export="ignore">Protected text</text>
</svg>`,
    );
    const session = await EditorSession.open({ kind: "text", text: source });

    const result = await session.dispatch({
      kind: "set-text",
      id: "ignored-text",
      value: "Unexpected mutation",
    });

    expect(result.applied).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("VECTOR180-EDITOR-TARGET");
    expect(session.state.sourceText).toBe(source);
    expect(session.state.canUndo).toBe(false);
  });

  it("truncates redo after a new commit and bounds exact history", async () => {
    const session = await EditorSession.open(
      { kind: "text", text: await readMinimalDeck() },
      { historyLimit: 2 },
    );

    await session.dispatch({
      kind: "set-text",
      id: "cover.title",
      value: "First",
    });
    expect(session.undo()).toBe(true);
    await session.dispatch({
      kind: "set-text",
      id: "cover.title",
      value: "Second",
    });

    expect(session.state.canRedo).toBe(false);
    expect(session.state.sourceText).toContain(">Second</text>");

    await session.dispatch({
      kind: "set-text",
      id: "cover.title",
      value: "Third",
    });
    expect(session.undo()).toBe(true);
    expect(session.state.sourceText).toContain(">Second</text>");
    expect(session.undo()).toBe(false);
  });

  it("is read-only when the expected source hash does not match", async () => {
    const session = await EditorSession.open(
      { kind: "text", text: await readMinimalDeck() },
      { expectedSha256: "0".repeat(64) },
    );

    expect(session.state.editable).toBe(false);
    expect(session.state.diagnostics[0]?.code).toBe(
      "VECTOR180-EDITOR-INTEGRITY",
    );

    const result = await session.dispatch({
      kind: "set-active-theme",
      theme: "dark",
    });
    expect(result.applied).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("VECTOR180-EDITOR-READ-ONLY");
    expect(session.state.canUndo).toBe(false);
  });

  it("derives every typed native old-value precondition from fresh resolved source", async () => {
    const session = await EditorSession.open({
      kind: "text",
      text: nativeEditorAtom(),
      name: "native-editor.vector180.svg",
    });

    expect(
      (
        await session.dispatch({
          kind: "set-object-geometry",
          id: "rect",
          geometry: { kind: "rect", x: 25, y: 35, width: 110, height: 65 },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-object-geometry",
          id: "ellipse",
          geometry: {
            kind: "ellipse",
            cx: 310,
            cy: 105,
            rx: 55,
            ry: 40,
          },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-connector-endpoints",
          id: "connector",
          endpoints: { x1: 125, y1: 65, x2: 260, y2: 110 },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-group-translation",
          id: "group",
          translation: { x: 15, y: 25 },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-text-frame",
          id: "group-label",
          frame: { x: 430, y: 280, width: 150, height: 55 },
          lineAnchor: { x: 430, y: 312 },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-native-style",
          id: "rect",
          style: {
            fill: "#abcdef",
            stroke: "#445566",
            strokeWidth: 4,
            opacity: 0.8,
            fontWeight: 400,
            fontStyle: "normal",
            textAnchor: "start",
          },
        })
      ).applied,
    ).toBe(true);
    expect(
      (
        await session.dispatch({
          kind: "set-child-order",
          parentId: "editor-atom",
          order: ["ellipse", "rect", "connector", "group", "orphan"],
        })
      ).applied,
    ).toBe(true);
    expect(
      (await session.dispatch({ kind: "delete-object", id: "orphan" })).applied,
    ).toBe(true);

    expect(session.state.sourceText).toContain(
      'x="25" y="35" width="110" height="65"',
    );
    expect(session.state.sourceText).toContain(
      'cx="310" cy="105" rx="55" ry="40"',
    );
    expect(session.state.sourceText).toContain(
      'x1="125" y1="65" x2="260" y2="110"',
    );
    expect(session.state.sourceText).toContain('transform="translate(15 25)"');
    expect(session.state.sourceText).toContain(
      'data-vector180-frame="430 280 150 55"',
    );
    expect(session.state.sourceText).toContain('fill="#abcdef"');
    expect(session.state.sourceText).not.toContain('id="orphan"');
    const finalState = session.state;
    expect(finalState.sourceKind).toBe("svg");
    if (finalState.sourceKind !== "svg")
      throw new Error("Expected atom state.");
    expect(finalState.atom.children.map(({ id }) => id)).toEqual([
      "ellipse",
      "rect",
      "connector",
      "group",
    ]);
  });

  it("keeps failed typed intents byte-neutral and out of exact history", async () => {
    const source = nativeEditorAtom();
    const session = await EditorSession.open({ kind: "text", text: source });
    const result = await session.dispatch({
      kind: "set-object-geometry",
      id: "rect",
      geometry: { kind: "rect", x: 20, y: 30, width: 0, height: 60 },
    });

    expect(result.applied).toBe(false);
    expect(session.state.sourceText).toBe(source);
    expect(session.state.sourceSha256).toBe(session.originalSha256);
    expect(session.state.canUndo).toBe(false);
    expect(session.state.canRedo).toBe(false);
  });
});
