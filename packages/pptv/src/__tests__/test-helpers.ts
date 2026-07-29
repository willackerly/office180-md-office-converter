import { readFile } from "node:fs/promises";

import type { Diagnostic } from "../core/types.js";

const MINIMAL_DECK_URL = new URL(
  "../../../../examples/minimal-deck.pptv.html",
  import.meta.url,
);

export async function readMinimalDeck(): Promise<string> {
  return readFile(MINIMAL_DECK_URL, "utf8");
}

export function errorCodes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    )
    .map((diagnostic) => diagnostic.code);
}

export function runtimeSource(source: string): string {
  const start = source.indexOf("<script data-pptv-runtime=");
  const end = source.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("Fixture has no runtime script");
  return source.slice(start, end + "</script>".length);
}

export function themeSource(source: string, id: string): string {
  const marker = `data-pptv-theme="${id}"`;
  const markerOffset = source.indexOf(marker);
  const start = source.lastIndexOf("<script", markerOffset);
  const end = source.indexOf("</script>", markerOffset);
  if (markerOffset < 0 || start < 0 || end < 0)
    throw new Error(`Fixture has no ${id} theme`);
  return source.slice(start, end + "</script>".length);
}
