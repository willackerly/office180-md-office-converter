import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const schemaNames = [
  "vector180-manifest-0.1.schema.json",
  "vector180-atom-metadata-0.1.schema.json",
  "vector180-patch-0.1.schema.json",
  "vector180-migration-report-0.1.schema.json",
  "vector180-source-diff-0.1.schema.json",
  "vector180-pptx-reconciliation-0.1.schema.json",
  "vector180-reconcile-resolution-0.1.schema.json",
];
const sourceDirectory = new URL("../../../schemas/", import.meta.url);
const destinationDirectory = new URL("../dist/schemas/", import.meta.url);

await mkdir(fileURLToPath(destinationDirectory), { recursive: true });
await Promise.all(
  schemaNames.map((name) =>
    copyFile(
      fileURLToPath(new URL(name, sourceDirectory)),
      fileURLToPath(new URL(name, destinationDirectory)),
    ),
  ),
);
