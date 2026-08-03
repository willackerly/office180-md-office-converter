/**
 * Explicit Node filesystem boundary for the portable Vector180 kernel.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 * CONTRACT:C5-PPTV-PATCH.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 */

import { randomUUID } from "node:crypto";
import { link, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { Vector180Input } from "../core/types.js";

export async function readVector180Path(path: string): Promise<Vector180Input> {
  const bytes = await readFile(path);
  return { kind: "bytes", bytes, name: basename(path) };
}

export async function readBytesPath(path: string): Promise<Uint8Array> {
  return readFile(path);
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

export interface AtomicWriteEntry {
  readonly path: string;
  readonly contents: string | Uint8Array;
}

export async function writeFileAtomic(
  path: string,
  contents: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.vector180-${process.pid}-${randomUUID()}.tmp`,
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

/**
 * Publishes a related set without overwriting. A failed publication rolls back
 * every destination linked by this call, so a normal error cannot leave only
 * the PPTX or only its C9 sidecar map.
 */
export async function writeFilesAtomicExclusive(
  entries: readonly AtomicWriteEntry[],
): Promise<void> {
  if (entries.length === 0) {
    throw new TypeError("Atomic publication requires at least one file.");
  }
  const targetPaths = entries.map((entry) => resolve(entry.path));
  if (new Set(targetPaths).size !== targetPaths.length) {
    throw new TypeError("Atomic publication destinations must be distinct.");
  }

  const staged: Array<{ temporaryPath: string; targetPath: string }> = [];
  const published: string[] = [];
  try {
    for (const [index, entry] of entries.entries()) {
      const targetPath = targetPaths[index]!;
      const temporaryPath = join(
        dirname(targetPath),
        `.${basename(targetPath)}.vector180-${process.pid}-${randomUUID()}.tmp`,
      );
      const handle = await open(temporaryPath, "wx");
      staged.push({ temporaryPath, targetPath });
      try {
        if (typeof entry.contents === "string") {
          await handle.writeFile(entry.contents, "utf8");
        } else {
          await handle.writeFile(entry.contents);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
    }

    for (const entry of staged) {
      await link(entry.temporaryPath, entry.targetPath);
      published.push(entry.targetPath);
    }
  } catch (error) {
    await Promise.allSettled(published.map((path) => unlink(path)));
    throw error;
  } finally {
    await Promise.allSettled(
      staged.map((entry) => unlink(entry.temporaryPath)),
    );
  }
}
