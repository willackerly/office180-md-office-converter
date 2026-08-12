// Verification: CONTRACT:C4-PPTV-SOURCE.2.0
// Verification: CONTRACT:C5-PPTV-PATCH.2.0
// Verification: CONTRACT:C6-PPTV-RESOLVED.2.0
// Verification: CONTRACT:C8-PPTV-TEXT-FIT.2.0
// Verification: CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

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
const INLINE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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
  await expect(
    page.locator('[data-vector180-object-id="cover.title"] text'),
  ).toHaveAttribute("font-family", /^Vector180_/u);
  await expect(page.locator("[data-mode-view]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-mode-edit]").click();
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

  await page.locator(".export-menu > summary").click();
  const [menuSvgDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export-svg]").click(),
  ]);
  expect(menuSvgDownload.suggestedFilename()).toBe("cover.vector180.svg");

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.locator(".vector180-preview").evaluate((preview) => {
        preview.setAttribute("viewBox", "0 0 1 1");
      });
      await page.locator("[data-export-png]").click();
    })(),
  ]);
  expect(pngDownload.suggestedFilename()).toBe("cover.png");
  const pngPath = await pngDownload.path();
  if (pngPath === null) throw new Error("Missing PNG download path.");
  const png = await readFile(pngPath);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1600, 900]);
  expect(png.byteLength).toBeGreaterThan(1_000);

  const [pptxDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export-pptx]").click(),
  ]);
  expect(pptxDownload.suggestedFilename()).toBe("minimal-deck.pptx");
  const pptxPath = await pptxDownload.path();
  if (pptxPath === null) throw new Error("Missing PPTX download path.");
  const pptx = await readFile(pptxPath);
  const zip = await JSZip.loadAsync(pptx, { checkCRC32: true });
  expect(
    Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/u.test(name),
    ),
  ).toHaveLength(2);
  await expect(page.locator("[data-export-map]")).toBeVisible();

  const [mapDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export-map]").click(),
  ]);
  expect(mapDownload.suggestedFilename()).toBe(
    "minimal-deck.vector180.deck.map.json",
  );
  const mapPath = await mapDownload.path();
  if (mapPath === null) throw new Error("Missing deck-map download path.");
  const mapText = await readFile(mapPath, "utf8");
  const map = JSON.parse(mapText) as {
    schema: string;
    source: { slideOrder: string[] };
    slides: { id: string }[];
  };
  expect(map.schema).toBe("vector180-pptx-deck-map/0.1");
  expect(map.source.slideOrder).toEqual(["architecture", "cover"]);
  expect(map.slides.map(({ id }) => id)).toEqual(["architecture", "cover"]);
  expect(mapText).not.toContain("data:image/png");
  expect(mapText).not.toContain("sourceBase64");

  await page.locator(".export-menu > summary").click();
  await page.locator('[data-object-id="cover.title"]').click();
  await page.locator("[data-text-edit]").fill("Map invalidated title");
  await page.locator("[data-text-apply]").click();
  await expect(page.locator("[data-export-map]")).toBeHidden();
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
  await page.locator("[data-mode-edit]").click();

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

test("trusted raster preview and bounded native controls remain source-authoritative", async ({
  page,
}) => {
  const source = nativeEditorAtom();
  await writeGeneratedPack(
    await requirePack({
      kind: "text",
      text: source,
      name: "native-editor.vector180.svg",
    }),
  );
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await openEditor(page);

  const payloadText = await page
    .locator("#vector180-editor-payload")
    .textContent();
  if (payloadText === null) throw new Error("Missing editor payload.");
  const payload = JSON.parse(payloadText) as {
    resolved: unknown;
    inventory: unknown;
  };
  expect(JSON.stringify(payload.resolved)).not.toContain("data:image/png");
  expect(JSON.stringify(payload.inventory)).not.toContain(INLINE_PNG_BASE64);
  const raster = page.locator('[data-vector180-object-id="editor-background"]');
  await expect(raster).toHaveCount(1);
  await expect(raster).toHaveAttribute("href", /^blob:/u);
  await expect(raster).toHaveAttribute("width", "600");

  await page.locator('[data-object-id="rect"]').click();
  await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);
  await expect(page.locator("[data-manipulation]")).toBeHidden();
  await page.locator("[data-mode-edit]").click();
  await expect(page.locator("[data-manipulation]")).toBeVisible();
  await expect(page.locator('[data-selection-overlay="rect"]')).toHaveCount(1);

  const rectGeometry = page.locator('[data-manipulation-form="geometry"]');
  await rectGeometry.locator('input[name="x"]').fill("25");
  await rectGeometry.locator('input[name="y"]').fill("35");
  await rectGeometry.locator('button[type="submit"]').click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    'Updated rectangle geometry "rect"',
  );
  await expect(page.locator("[data-source]")).toHaveValue(
    /x="25" y="35" width="100" height="60"/u,
  );

  const style = page.locator('[data-manipulation-form="style"]');
  await style.locator('input[name="fill"]').fill("#abcdef");
  await style.locator('input[name="strokeWidth"]').fill("4");
  await style.locator('button[type="submit"]').click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    'Updated direct native style "rect"',
  );

  await page.locator('[data-object-id="connector"]').click();
  const endpoints = page.locator('[data-manipulation-form="endpoints"]');
  await endpoints.locator('input[name="x1"]').fill("125");
  await endpoints.locator('input[name="y2"]').fill("110");
  await endpoints.locator('button[type="submit"]').click();
  await expect(page.locator("[data-source]")).toHaveValue(
    /x1="125" y1="60" x2="250" y2="110"/u,
  );

  await page.locator('[data-object-id="group"]').click();
  const translation = page.locator('[data-manipulation-form="translation"]');
  await translation.locator('input[name="x"]').fill("15");
  await translation.locator('input[name="y"]').fill("25");
  await translation.locator('button[type="submit"]').click();
  await expect(page.locator("[data-source]")).toHaveValue(
    /transform="translate\(15 25\)"/u,
  );

  await page.locator('[data-object-id="group-label"]').click();
  const textFrame = page.locator('[data-manipulation-form="text-frame"]');
  await textFrame.locator('input[name="x"]').fill("430");
  await textFrame.locator('input[name="anchorX"]').fill("430");
  await textFrame.locator('input[name="anchorY"]').fill("312");
  await textFrame.locator('button[type="submit"]').click();
  await expect(page.locator("[data-source]")).toHaveValue(
    /data-vector180-frame="430 270 140 50"/u,
  );
  await expect(page.locator("[data-source]")).toHaveValue(/x="430" y="312"/u);

  await page.locator('[data-object-id="group-box"]').click();
  await page.locator("[data-order-forward]").click();
  await expect(page.locator("[data-operation-status]")).toContainText(
    "forward in sibling painter order",
  );

  await page.locator('[data-object-id="orphan"]').click();
  await page.locator("[data-delete-object]").click();
  await expect(page.locator("[data-source]")).not.toHaveValue(/id="orphan"/u);

  const changed = await sourceValue(page);
  await page.locator("[data-undo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(/id="orphan"/u);
  await page.locator("[data-redo]").click();
  await expect(page.locator("[data-source]")).toHaveValue(changed);
  await page.locator("[data-mode-view]").click();
  await expect(page.locator("[data-manipulation]")).toBeHidden();
  await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);

  await page.locator(".export-menu > summary").click();
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-export-png]").click(),
  ]);
  const pngPath = await pngDownload.path();
  if (pngPath === null) throw new Error("Missing raster PNG download path.");
  const png = await readFile(pngPath);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([800, 600]);
  expect(consoleErrors).toEqual([]);
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

function nativeEditorAtom(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" data-vector180-version="0.1"
  id="editor-atom" viewBox="0 0 800 600">
  <image id="editor-background" data-vector180-role="asset" data-vector180-export="raster"
    data-vector180-bounds="0 0 600 600" x="0" y="0" width="600" height="600"
    href="data:image/png;base64,${INLINE_PNG_BASE64}"/>
  <rect id="rect" data-vector180-role="shape" data-vector180-export="native"
    x="20" y="30" width="100" height="60" fill="#112233" stroke="#445566"
    stroke-width="2" opacity="0.8" font-weight="400" font-style="normal"
    text-anchor="start"/>
  <ellipse id="ellipse" data-vector180-role="shape" data-vector180-export="native"
    cx="300" cy="100" rx="50" ry="35" fill="#abcdef" stroke="none"
    stroke-width="0" opacity="1" font-weight="400" font-style="normal"
    text-anchor="start"/>
  <line id="connector" data-vector180-role="connector" data-vector180-export="native"
    x1="120" y1="60" x2="250" y2="100" data-vector180-from="rect"
    data-vector180-to="ellipse" fill="none" stroke="#334455" stroke-width="3"
    opacity="1" font-weight="400" font-style="normal" text-anchor="start"/>
  <g id="group" data-vector180-role="group" data-vector180-export="native"
    transform="translate(10 20)">
    <rect id="group-box" data-vector180-role="shape" data-vector180-export="native"
      x="400" y="250" width="180" height="100" fill="#eeeeee"/>
    <text id="group-label" data-vector180-role="text" data-vector180-export="native"
      data-vector180-frame="420 270 140 50" data-vector180-line-step="24"
      x="420" y="300" fill="#111111" stroke="none" stroke-width="0" opacity="1"
      font-family="ABeeZee" font-size="20" font-weight="400" font-style="normal"
      text-anchor="start">Group label</text>
  </g>
  <rect id="orphan" data-vector180-role="shape" data-vector180-export="native"
    x="40" y="500" width="60" height="40" fill="#eeeeee"/>
</svg>`;
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
