// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.2

import { describe, expect, it } from "vitest";

import { EditorSession } from "../browser/session.js";
import { readMinimalDeck } from "./test-helpers.js";

describe("exact-source editor session", () => {
  it("commits through C5 and restores exact source snapshots on undo", async () => {
    const source = await readMinimalDeck();
    const session = await EditorSession.open(
      { kind: "text", text: source, name: "minimal-deck.pptv.html" },
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
    expect(result.diagnostics[0]?.code).toBe("PPTV-EDITOR-TARGET");
    expect(session.state.sourceText).toBe(original);
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
    expect(session.state.diagnostics[0]?.code).toBe("PPTV-EDITOR-INTEGRITY");

    const result = await session.dispatch({
      kind: "set-active-theme",
      theme: "dark",
    });
    expect(result.applied).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("PPTV-EDITOR-READ-ONLY");
    expect(session.state.canUndo).toBe(false);
  });
});
