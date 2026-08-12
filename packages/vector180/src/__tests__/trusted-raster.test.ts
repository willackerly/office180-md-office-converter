// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C6-PPTV-RESOLVED.2.0

import { describe, expect, it } from "vitest";

import { EditorSession } from "../browser/session.js";
import { recoverTrustedInlinePng } from "../browser/trusted-raster.js";
import { loadAtom } from "../core/deck.js";
import { resolveVector180Atom } from "../core/resolved.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function source(attribute = "href"): string {
  return `<svg id="trusted-raster" data-vector180-version="0.1"
  viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink">
  <image id="trusted-raster.background" data-vector180-role="asset"
    data-vector180-export="raster" data-vector180-bounds="0 0 1 1"
    x="0" y="0" width="1" height="1"
    ${attribute}="data:image/png;base64,${PNG_BASE64}"/>
</svg>`;
}

describe("trusted editor raster recovery", () => {
  it.each(["href", "xlink:href"])(
    "recovers and revalidates exact bytes from one source-located %s",
    async (attribute) => {
      const atom = await loadAtom({ kind: "text", text: source(attribute) });
      const resolved = resolveVector180Atom(atom).model;
      const object = resolved?.objects[0];
      expect(object?.kind).toBe("raster-asset");
      if (object?.kind !== "raster-asset") return;

      const recovered = recoverTrustedInlinePng(
        atom,
        object.id,
        object.resource,
        true,
      );
      expect(recovered).toMatchObject({
        ok: true,
        descriptor: object.resource,
      });
      if (!recovered.ok) return;
      expect(recovered.bytes).toHaveLength(68);
      expect(JSON.stringify(resolved)).not.toContain("data:image/png");
      expect(JSON.stringify(object.resource)).not.toContain(PNG_BASE64);
    },
  );

  it("fails closed without integrity or on a descriptor mismatch and redacts bytes", async () => {
    const atom = await loadAtom({ kind: "text", text: source() });
    const resolved = resolveVector180Atom(atom).model;
    const object = resolved?.objects[0];
    expect(object?.kind).toBe("raster-asset");
    if (object?.kind !== "raster-asset") return;

    const untrusted = recoverTrustedInlinePng(
      atom,
      object.id,
      object.resource,
      false,
    );
    const mismatched = recoverTrustedInlinePng(
      atom,
      object.id,
      { ...object.resource, sha256: "0".repeat(64) },
      true,
    );
    for (const result of [untrusted, mismatched]) {
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PNG_BASE64);
      expect(JSON.stringify(result)).not.toContain("data:image/png");
    }
  });

  it("keeps raster deletion and painter-order movement outside native editor intents", async () => {
    const exactSource = source().replace(
      "</svg>",
      `  <rect id="native-shape" data-vector180-role="shape"
    data-vector180-export="native" x="0" y="0" width="1" height="1"/>
</svg>`,
    );
    const session = await EditorSession.open({
      kind: "text",
      text: exactSource,
    });
    const deletion = await session.dispatch({
      kind: "delete-object",
      id: "trusted-raster.background",
    });
    const reorder = await session.dispatch({
      kind: "set-child-order",
      parentId: "trusted-raster",
      order: ["native-shape", "trusted-raster.background"],
    });

    expect(deletion.applied).toBe(false);
    expect(reorder.applied).toBe(false);
    expect(session.state.sourceText).toBe(exactSource);
    expect(session.state.canUndo).toBe(false);
    expect(JSON.stringify([deletion, reorder])).not.toContain(PNG_BASE64);
  });
});
