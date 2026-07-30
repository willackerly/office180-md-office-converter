/**
 * Explicit Node filesystem boundary for the portable PPTV kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C5-PPTV-PATCH.1.1
 * CONTRACT:C7-PPTX-CANARY.1.1
 */

import { randomUUID } from "node:crypto";
import { link, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { PptvInput } from "../core/types.js";

export async function readPptvPath(path: string): Promise<PptvInput> {
  const bytes = await readFile(path);
  return { kind: "bytes", bytes, name: basename(path) };
}

export async function readJsonPath(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export interface AtomicWriteOptions {
  /**
   * Existing callers retain atomic replacement. Set false for an exclusive
   * same-filesystem publication that fails race-safely when `path` exists.
   */
  readonly overwrite?: boolean;
}

export async function writeFileAtomic(
  path: string,
  contents: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.pptv-${process.pid}-${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    if (typeof contents === "string") {
      await handle.writeFile(contents, "utf8");
    } else {
      await handle.writeFile(contents);
    }
    await handle.sync();
    await handle.close();
    if (options.overwrite === false) {
      await link(temporaryPath, path);
    } else {
      await rename(temporaryPath, path);
    }
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}
