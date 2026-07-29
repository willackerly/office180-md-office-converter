/**
 * Explicit Node filesystem boundary for the portable PPTV kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 * CONTRACT:C5-PPTV-PATCH.1.0
 * CONTRACT:C7-PPTX-CANARY.1.0
 */

import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { PptvInput } from "../core/types.js";

export async function readPptvPath(path: string): Promise<PptvInput> {
  const bytes = await readFile(path);
  return { kind: "bytes", bytes, name: basename(path) };
}

export async function readJsonPath(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function writeFileAtomic(
  path: string,
  contents: string | Uint8Array,
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.pptv-${process.pid}-${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  let renamed = false;
  try {
    if (typeof contents === "string") {
      await handle.writeFile(contents, "utf8");
    } else {
      await handle.writeFile(contents);
    }
    await handle.sync();
    await handle.close();
    await rename(temporaryPath, path);
    renamed = true;
  } finally {
    await handle.close().catch(() => undefined);
    if (!renamed) await unlink(temporaryPath).catch(() => undefined);
  }
}
