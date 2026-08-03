// Tests: CONTRACT:C4-PPTV-SOURCE.2.0, CONTRACT:C6-PPTV-RESOLVED.2.0

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { sha256Hex } from "../core/source.js";
import { readMinimalDeck, runtimeSource } from "./test-helpers.js";

const RUNTIME_ARTIFACT_URL = new URL(
  "../../assets/vector180-browser-0.1.script.html",
  import.meta.url,
);
const AUTHORING_STARTER_URL = new URL(
  "../../../../.agents/skills/vector180-authoring/assets/starter.vector180.html",
  import.meta.url,
);
const RUNTIME_DIGEST =
  "8732b69a203a3382f9037f30085c347bd2f2bddfd1713d4959b20dbd3d2c9293";

describe("fixed Vector180 browser runtime artifact", () => {
  it("is exactly the snippet embedded by the example and accepted by digest", async () => {
    const artifact = await readFile(RUNTIME_ARTIFACT_URL, "utf8");
    const example = await readMinimalDeck();
    const authoringStarter = await readFile(AUTHORING_STARTER_URL, "utf8");
    const snippet = runtimeSource(example);
    const openTagEnd = artifact.indexOf(">") + 1;
    const closeTagStart = artifact.lastIndexOf("</script>");
    const body = artifact.slice(openTagEnd, closeTagStart);

    expect(artifact).toBe(`${snippet}\n`);
    expect(authoringStarter).toBe(example);
    expect(await sha256Hex(new TextEncoder().encode(body))).toBe(
      RUNTIME_DIGEST,
    );
  });
});
