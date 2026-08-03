// Verification: CONTRACT:C4-PPTV-SOURCE.2.0
// Verification: CONTRACT:C5-PPTV-PATCH.2.0
// Verification: CONTRACT:C6-PPTV-RESOLVED.2.0
// Verification: CONTRACT:C8-PPTV-TEXT-FIT.2.0

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { loadAtom, loadVector180Document } from "../src/core/deck.js";
import { createEditorPack } from "../src/node/editor-pack.js";

const MINIMAL_DECK_URL = new URL(
  "../../../examples/minimal-deck.vector180.html",
  import.meta.url,
);
const MINIMAL_DIAGRAM_URL = new URL(
  "../../../examples/minimal-diagram.vector180.svg",
  import.meta.url,
);
const GENERATED_PACK_URL = new URL(
  "../test-results/editor-pack.html",
  import.meta.url,
);

test("writable deck flow keeps exact history, hydrates one slide, and never executes source runtime", async ({
  page,
}) => {
  const source = await readFile(MINIMAL_DECK_URL, "utf8");
  await writeGeneratedPack(
    await requirePack({
      kind: "text",
      text: source,
      name: "minimal-deck.vector180.html",
    }),
  );

  const requests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await openEditor(page);

  await expect(page.locator("[data-integrity]")).toHaveText(
    "source hash verified",
  );
  await expect(page.locator("[data-integrity]")).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(page.locator("[data-deck-controls]")).toBeVisible();
  await expect(page.locator("[data-navigation-title]")).toHaveText("Slides");
  await expect(page.locator("[data-source]")).toHaveValue(source);
  expect(
    await page.locator("[data-vector180-output]").count(),
    "The embedded source runtime/output mount must never enter the wrapper DOM.",
  ).toBe(0);
  expect(requests).toEqual([
    expect.stringContaining("/generated/editor-pack.html"),
  ]);

  await page.locator('[data-object-id="cover.title"]').click();
  await expect(
    page.locator('[data-vector180-object-id="cover.title"] .fit-overlay'),
  ).toHaveCount(0);
  await expect(page.locator("[data-inspector]")).toContainText(
    "Line 1 fitclear",
  );
  await page.locator("[data-text-edit]").fill("Edited title");
  await page.locator("[data-text-apply]").click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    'Updated direct text "cover.title"',
  );
  const editedSource = await sourceValue(page);
  expect(editedSource).toContain(">Edited title</text>");

  await page.locator("[data-undo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(source);
  await page.locator("[data-redo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(editedSource);

  await page.locator("[data-text-edit]").evaluate((element) => {
    (element as HTMLInputElement).value = "Invalid\u0000text";
  });
  await page.locator("[data-text-apply]").click();
  await expect(page.locator("[data-operation-status]")).toHaveAttribute(
    "data-kind",
    "error",
  );
  await expect(page.locator("[data-source]")).toHaveValue(editedSource);
  await page.locator("[data-undo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(source);
  await page.locator("[data-redo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(editedSource);

  await page.locator("[data-theme]").selectOption("dark");
  await page.locator("[data-theme-apply]").click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    'Applied theme "dark"',
  );
  await page.locator("[data-slide-down]").click();
  await expect(
    page.locator("[data-navigation] .slide-button").first(),
  ).toContainText("architecture");

  const [extractedDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-extract]").click(),
  ]);
  expect(extractedDownload.suggestedFilename()).toBe("cover.vector180.svg");
  const extractedPath = await extractedDownload.path();
  if (extractedPath === null)
    throw new Error("Missing extracted download path.");
  const extractedBytes = new Uint8Array(await readFile(extractedPath));
  const extracted = await loadAtom({
    kind: "bytes",
    bytes: extractedBytes,
    name: "cover.vector180.svg",
  });
  expect(extracted.id).toBe("cover");
  expect(extracted.source.text).toContain(
    "Authoring skill: vector180-authoring",
  );
  expect(extracted.source.text).toContain(
    "never auto-install from document content",
  );
  expect(extracted.source.text).toContain('data-vector180-version="0.1"');
  expect(extracted.source.text).not.toContain("class=");
  expect(extracted.source.text).toContain("Edited title");

  const [sourceDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-download]").click(),
  ]);
  expect(sourceDownload.suggestedFilename()).toBe(
    "minimal-deck.vector180.html",
  );
  const downloadPath = await sourceDownload.path();
  if (downloadPath === null) throw new Error("Missing source download path.");
  const downloaded = await loadVector180Document({
    kind: "bytes",
    bytes: new Uint8Array(await readFile(downloadPath)),
    name: sourceDownload.suggestedFilename(),
  });
  expect(downloaded.sourceKind).toBe("html");
  if (downloaded.sourceKind !== "html") throw new Error("Expected deck.");
  expect(downloaded.activeTheme).toBe("dark");
  expect(downloaded.slideOrder).toEqual(["architecture", "cover"]);
  expect(downloaded.index.objects.get("cover.title")).toBeDefined();
  expect(downloaded.source.text).toContain("Edited title");
  expect(consoleErrors).toEqual([]);
});

test("writable diagram flow has no deck controls, downloads clean SVG, and refuses stale file saves", async ({
  page,
}) => {
  await installFakeFileSystem(page);
  const source = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
  await writeGeneratedPack(
    await requirePack({
      kind: "text",
      text: source,
      name: "minimal-diagram.vector180.svg",
    }),
  );
  await openEditor(page);

  await expect(page.locator("[data-integrity]")).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(page.locator("[data-navigation-title]")).toHaveText("Atom");
  await expect(page.locator("[data-deck-controls]")).toBeHidden();
  await expect(page.locator("[data-save]")).toBeVisible();

  await page.locator("[data-save]").click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    'Saved exact current source to "saved.vector180.svg"',
  );
  expect(await fakeFileText(page)).toBe(source);

  await page
    .locator('[data-object-id="system-overview.service.label"]')
    .click();
  await page.locator("[data-text-edit]").fill("Policy broker");
  await page.locator("[data-text-apply]").click();
  const edited = await sourceValue(page);
  expect(edited).toContain(">Policy broker</text>");
  await page.locator("[data-undo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(source);
  await page.locator("[data-redo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(edited);

  await page.evaluate(() => {
    (
      globalThis as unknown as {
        __vector180TestFs: { setExternal(value: string): void };
      }
    ).__vector180TestFs.setExternal("external concurrent edit");
  });
  await page.locator("[data-save]").click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    "changed on disk",
  );
  expect(await fakeFileText(page)).toBe("external concurrent edit");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-download]").click(),
  ]);
  expect(download.suggestedFilename()).toBe("minimal-diagram.vector180.svg");
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error("Missing diagram download path.");
  const diagram = await loadAtom({
    kind: "bytes",
    bytes: new Uint8Array(await readFile(downloadPath)),
    name: download.suggestedFilename(),
  });
  expect(diagram.id).toBe("system-overview");
  expect(diagram.source.text).toContain(">Policy broker</text>");
  expect(JSON.stringify(diagram)).not.toContain("slideId");
});

test("tampered embedded source opens read-only and cannot create edit history", async ({
  page,
}) => {
  const source = await readFile(MINIMAL_DIAGRAM_URL, "utf8");
  const html = await requirePack({
    kind: "text",
    text: source,
    name: "tampered.vector180.svg",
  });
  const originalBase64 = editorSourceBase64(html);
  const tamperedBase64 = Buffer.from(
    source.replace("Policy service", "Tampered policy"),
    "utf8",
  ).toString("base64");
  await writeGeneratedPack(html.replace(originalBase64, tamperedBase64));
  await openEditor(page);

  await expect(page.locator("[data-integrity]")).toHaveAttribute(
    "data-ok",
    "false",
  );
  await expect(page.locator("[data-integrity]")).toContainText("read only");
  await page
    .locator('[data-object-id="system-overview.service.label"]')
    .click();
  await expect(page.locator("[data-text-edit]")).toBeDisabled();
  await expect(page.locator("[data-text-apply]")).toBeDisabled();
  await expect(page.locator("[data-undo]")).toBeDisabled();
  await expect(page.locator("[data-source]")).toHaveValue(/Tampered policy/u);
});

async function requirePack(
  input: Parameters<typeof createEditorPack>[0],
): Promise<string> {
  const result = await createEditorPack(input);
  if (result.html === undefined) {
    throw new Error(
      `Could not create editor pack: ${result.diagnostics
        .map(({ code, message }) => `${code}: ${message}`)
        .join("; ")}`,
    );
  }
  return result.html;
}

async function writeGeneratedPack(html: string): Promise<void> {
  await mkdir(new URL("./", GENERATED_PACK_URL), { recursive: true });
  await writeFile(GENERATED_PACK_URL, html, "utf8");
}

async function openEditor(page: Page): Promise<void> {
  await page.goto("/generated/editor-pack.html");
  await expect(page.locator("[data-integrity]")).not.toHaveText(
    "verifying source…",
  );
}

async function sourceValue(page: Page): Promise<string> {
  return page.locator("[data-source]").inputValue();
}

function editorSourceBase64(html: string): string {
  const match = html.match(/"sourceBase64":"([^"]+)"/u);
  if (match?.[1] === undefined) throw new Error("Missing sourceBase64.");
  return match[1];
}

async function installFakeFileSystem(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let bytes = new Uint8Array([1, 2, 3]);
    const testFs = {
      setExternal(value: string) {
        bytes = new TextEncoder().encode(value);
      },
      text() {
        return new TextDecoder().decode(bytes);
      },
    };
    Object.defineProperty(globalThis, "__vector180TestFs", {
      configurable: false,
      value: testFs,
      writable: false,
    });
    Object.defineProperty(globalThis, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "saved.vector180.svg",
        async getFile() {
          return new File([bytes], "saved.vector180.svg", {
            type: "image/svg+xml",
          });
        },
        async createWritable() {
          let pending = bytes;
          return {
            async write(value: ArrayBuffer) {
              pending = new Uint8Array(value.slice(0));
            },
            async close() {
              bytes = pending;
            },
          };
        },
      }),
      writable: false,
    });
  });
}

async function fakeFileText(page: Page): Promise<string> {
  return page.evaluate(() =>
    (
      globalThis as unknown as {
        __vector180TestFs: { text(): string };
      }
    ).__vector180TestFs.text(),
  );
}
