import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const schemaNames = [
  "pptv-manifest-0.1.schema.json",
  "pptv-patch-0.1.schema.json",
  "pptv-patch-0.2.schema.json",
  "pptv-patch-0.3.schema.json",
  "pptv-pptx-reconciliation-0.2.schema.json",
  "pptv-reconcile-resolution-0.1.schema.json",
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
