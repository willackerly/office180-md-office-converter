// Tests: CONTRACT:C4-PPTV-SOURCE.1.1, CONTRACT:C5-PPTV-PATCH.1.3

import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeFileAtomic } from "../node/io.js";

async function withTempDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "pptv-atomic-io-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("atomic filesystem writes", () => {
  it("retains atomic replacement as the default behavior", async () => {
    await withTempDirectory(async (directory) => {
      const path = join(directory, "artifact.txt");
      await writeFile(path, "old");

      await writeFileAtomic(path, "new");

      expect(await readFile(path, "utf8")).toBe("new");
      expect(await readdir(directory)).toEqual(["artifact.txt"]);
    });
  });

  it("publishes exclusively without changing or leaking beside an existing destination", async () => {
    await withTempDirectory(async (directory) => {
      const path = join(directory, "diagram.pptv.svg");
      await writeFile(path, "existing");

      await expect(
        writeFileAtomic(path, "replacement", { overwrite: false }),
      ).rejects.toMatchObject({ code: "EEXIST" });

      expect(await readFile(path, "utf8")).toBe("existing");
      expect(await readdir(directory)).toEqual(["diagram.pptv.svg"]);
    });
  });

  it("allows exactly one concurrent exclusive publisher and cleans every peer temporary", async () => {
    await withTempDirectory(async (directory) => {
      const path = join(directory, "diagram.pptv.svg");
      const attempts = await Promise.allSettled([
        writeFileAtomic(path, "first", { overwrite: false }),
        writeFileAtomic(path, "second", { overwrite: false }),
      ]);

      expect(
        attempts.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = attempts.filter(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === "rejected",
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({ code: "EEXIST" });
      expect(["first", "second"]).toContain(await readFile(path, "utf8"));
      expect(await readdir(directory)).toEqual(["diagram.pptv.svg"]);
    });
  });
});
