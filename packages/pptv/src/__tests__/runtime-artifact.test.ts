import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { sha256Hex } from "../core/source.js";
import { readMinimalDeck, runtimeSource } from "./test-helpers.js";

const RUNTIME_ARTIFACT_URL = new URL(
  "../../assets/pptv-browser-0.1.script.html",
  import.meta.url,
);
const RUNTIME_DIGEST =
  "373b44a1b3779bc9373d9e96222891b2c4886dc07f88cfd271f319ba341e75a5";

describe("fixed PPTV browser runtime artifact", () => {
  it("is exactly the snippet embedded by the example and accepted by digest", async () => {
    const artifact = await readFile(RUNTIME_ARTIFACT_URL, "utf8");
    const example = await readMinimalDeck();
    const snippet = runtimeSource(example);
    const openTagEnd = artifact.indexOf(">") + 1;
    const closeTagStart = artifact.lastIndexOf("</script>");
    const body = artifact.slice(openTagEnd, closeTagStart);

    expect(artifact).toBe(`${snippet}\n`);
    expect(await sha256Hex(new TextEncoder().encode(body))).toBe(
      RUNTIME_DIGEST,
    );
  });
});
