#!/usr/bin/env node
/**
 * Bounded Playwright/Chromium capture for one validated PPTV SVG atom.
 *
 * CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.1
 */

import { createHash, randomBytes } from "node:crypto";
import { readFile, stat, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_777_216;
const FIT_MODE = "contain";
const DEVICE_SCALE_FACTOR = 1;
const CHROMIUM_FLAGS = [
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-features=MediaRouter",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-first-run",
  "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1",
];

class CaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isTimeoutError(error) {
  return (
    error &&
    typeof error === "object" &&
    (error.name === "TimeoutError" ||
      error.constructor?.name === "TimeoutError")
  );
}

function parsePositiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      `${label} must be a positive integer`,
    );
  }
  return Number.parseInt(value, 10);
}

function parseArguments(argv) {
  const known = new Set([
    "--artifact",
    "--artifact-sha256",
    "--output",
    "--width",
    "--height",
    "--background",
    "--timeout-ms",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!known.has(key) || value === undefined || values.has(key)) {
      throw new CaptureError(
        "OFFICE-VISUAL-EVIDENCE-INVALID",
        "capture helper received invalid arguments",
      );
    }
    values.set(key, value);
  }
  if (values.size !== known.size) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "capture helper is missing required arguments",
    );
  }

  const width = parsePositiveInteger(values.get("--width"), "width");
  const height = parsePositiveInteger(values.get("--height"), "height");
  const timeoutMs = parsePositiveInteger(
    values.get("--timeout-ms"),
    "timeout-ms",
  );
  const background = values.get("--background");
  const expectedSha256 = values.get("--artifact-sha256");
  if (
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  ) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "capture dimensions exceed the bounded browser profile",
    );
  }
  if (timeoutMs > 600_000) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "capture timeout exceeds the bounded browser profile",
    );
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(background ?? "")) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "background must be an opaque six-digit hex color",
    );
  }
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "artifact-sha256 must be a lowercase SHA-256 digest",
    );
  }
  if (
    !values.get("--artifact").endsWith(".pptv.svg") ||
    !values.get("--output").toLowerCase().endsWith(".png")
  ) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "capture helper requires a .pptv.svg artifact and .png output",
    );
  }
  return {
    artifactPath: resolve(values.get("--artifact")),
    outputPath: resolve(values.get("--output")),
    expectedSha256,
    width,
    height,
    background: background.toLowerCase(),
    timeoutMs,
  };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function htmlWrapper(width, height, background, artifactRoute) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; connect-src 'none'; font-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'">
  <title>PPTV SVG visual capture</title>
  <style>
    html, body, main {
      box-sizing: border-box;
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: ${background};
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: ${FIT_MODE};
      object-position: center center;
    }
  </style>
</head>
<body>
  <main><img id="artifact" src="${artifactRoute}" alt=""></main>
</body>
</html>
`;
}

function setCommonHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

async function closeServer(server) {
  if (server === undefined) {
    return;
  }
  await new Promise((resolveClose) => {
    server.close(() => resolveClose());
    server.closeIdleConnections?.();
  });
}

async function capture(options) {
  const deadline = Date.now() + options.timeoutMs;
  const remainingTimeout = () => {
    const remaining = deadline - Date.now();
    if (remaining < 1) {
      throw new CaptureError(
        "OFFICE-VISUAL-TIMEOUT",
        "Playwright Chromium exceeded the bounded capture timeout",
      );
    }
    return remaining;
  };
  if (await pathExists(options.outputPath)) {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "capture helper refuses to overwrite its output",
    );
  }
  let artifactBytes;
  try {
    artifactBytes = await readFile(options.artifactPath);
  } catch {
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "validated capture artifact is unreadable",
    );
  }
  const artifactSha256 = createHash("sha256")
    .update(artifactBytes)
    .digest("hex");
  if (artifactSha256 !== options.expectedSha256) {
    throw new CaptureError(
      "OFFICE-VISUAL-UNSAFE-INPUT",
      "artifact changed after PPTV validation",
    );
  }

  let playwright;
  let packageVersion;
  try {
    playwright = await import("@playwright/test");
    const require = createRequire(import.meta.url);
    const packageJson = JSON.parse(
      await readFile(require.resolve("@playwright/test/package.json"), "utf8"),
    );
    packageVersion = packageJson.version;
  } catch {
    throw new CaptureError(
      "OFFICE-VISUAL-UNAVAILABLE",
      "the pinned Playwright package is unavailable",
    );
  }
  if (
    typeof packageVersion !== "string" ||
    packageVersion.length === 0 ||
    playwright.chromium === undefined
  ) {
    throw new CaptureError(
      "OFFICE-VISUAL-UNAVAILABLE",
      "the pinned Playwright Chromium API is unavailable",
    );
  }

  const routeToken = randomBytes(16).toString("hex");
  const wrapperRoute = `/${routeToken}/capture.html`;
  const artifactRoute = `/${routeToken}/artifact.pptv.svg`;
  const wrapper = Buffer.from(
    htmlWrapper(
      options.width,
      options.height,
      options.background,
      artifactRoute,
    ),
    "utf8",
  );
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${HOST}`);
    const method = request.method ?? "GET";
    setCommonHeaders(response);
    if (!["GET", "HEAD"].includes(method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    if (requestUrl.pathname === wrapperRoute && requestUrl.search === "") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": wrapper.length,
      });
      response.end(method === "HEAD" ? undefined : wrapper);
      return;
    }
    if (requestUrl.pathname === artifactRoute && requestUrl.search === "") {
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
      );
      response.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Content-Length": artifactBytes.length,
      });
      response.end(method === "HEAD" ? undefined : artifactBytes);
      return;
    }
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("not found\n");
  });

  let browser;
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, HOST, resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new CaptureError(
        "OFFICE-VISUAL-UNAVAILABLE",
        "loopback capture server did not acquire a TCP port",
      );
    }
    const origin = `http://${HOST}:${address.port}`;
    const allowedUrls = new Set([
      `${origin}${wrapperRoute}`,
      `${origin}${artifactRoute}`,
    ]);
    const blockedRequests = [];

    try {
      browser = await playwright.chromium.launch({
        headless: true,
        timeout: remainingTimeout(),
        args: CHROMIUM_FLAGS,
      });
    } catch (error) {
      if (error instanceof CaptureError || isTimeoutError(error)) {
        throw new CaptureError(
          "OFFICE-VISUAL-TIMEOUT",
          "Playwright Chromium exceeded the bounded capture timeout",
        );
      }
      throw new CaptureError(
        "OFFICE-VISUAL-UNAVAILABLE",
        "the pinned Playwright Chromium executable could not launch",
      );
    }
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      screen: { width: options.width, height: options.height },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      colorScheme: "light",
      reducedMotion: "reduce",
      forcedColors: "none",
      locale: "en-US",
      timezoneId: "UTC",
      javaScriptEnabled: false,
      serviceWorkers: "block",
      acceptDownloads: false,
      hasTouch: false,
      isMobile: false,
      offline: false,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(remainingTimeout());
    page.setDefaultNavigationTimeout(remainingTimeout());
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (allowedUrls.has(url)) {
        await route.continue();
        return;
      }
      blockedRequests.push(route.request().resourceType());
      await route.abort("blockedbyclient");
    });

    let artifactResponseStatus = null;
    page.on("response", (response) => {
      if (response.url() === `${origin}${artifactRoute}`) {
        artifactResponseStatus = response.status();
      }
    });
    const wrapperResponse = await page.goto(`${origin}${wrapperRoute}`, {
      waitUntil: "load",
      timeout: remainingTimeout(),
    });
    if (
      wrapperResponse === null ||
      wrapperResponse.status() !== 200 ||
      artifactResponseStatus !== 200
    ) {
      throw new CaptureError(
        "OFFICE-VISUAL-EVIDENCE-INVALID",
        "browser did not load the fixed wrapper and validated SVG",
      );
    }
    page.setDefaultTimeout(remainingTimeout());
    const imageState = await page.locator("#artifact").evaluate((element) => ({
      complete: element.complete,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    }));
    if (
      imageState.complete !== true ||
      imageState.naturalWidth < 1 ||
      imageState.naturalHeight < 1
    ) {
      throw new CaptureError(
        "OFFICE-VISUAL-EVIDENCE-INVALID",
        "browser could not decode the validated SVG",
      );
    }
    if (blockedRequests.length !== 0) {
      throw new CaptureError(
        "OFFICE-VISUAL-UNSAFE-INPUT",
        "browser blocked a request outside the fixed loopback capture routes",
      );
    }

    await page.screenshot({
      path: options.outputPath,
      type: "png",
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      omitBackground: false,
      timeout: remainingTimeout(),
    });
    const outputStat = await stat(options.outputPath);
    if (!outputStat.isFile() || outputStat.size === 0) {
      throw new CaptureError(
        "OFFICE-VISUAL-EMPTY",
        "browser did not produce one non-empty PNG",
      );
    }
    return {
      ok: true,
      renderer: {
        product: "Playwright Chromium",
        playwrightVersion: packageVersion,
        chromiumVersion: browser.version(),
        executablePath: playwright.chromium.executablePath(),
      },
      profile: {
        widthPx: options.width,
        heightPx: options.height,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        background: options.background,
        fit: FIT_MODE,
        locale: "en-US",
        timezone: "UTC",
        javaScriptEnabled: false,
        loopbackOrigin: "http://127.0.0.1:<ephemeral>",
        renderingFlags: CHROMIUM_FLAGS,
      },
    };
  } catch (error) {
    await unlink(options.outputPath).catch(() => {});
    if (error instanceof CaptureError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new CaptureError(
        "OFFICE-VISUAL-TIMEOUT",
        "Playwright Chromium exceeded the bounded capture timeout",
      );
    }
    throw new CaptureError(
      "OFFICE-VISUAL-EVIDENCE-INVALID",
      "Playwright Chromium capture failed closed",
    );
  } finally {
    await browser?.close().catch(() => {});
    await closeServer(server);
  }
}

async function main() {
  let result;
  try {
    result = await capture(parseArguments(process.argv.slice(2)));
  } catch (error) {
    const code =
      error instanceof CaptureError
        ? error.code
        : "OFFICE-VISUAL-EVIDENCE-INVALID";
    const message =
      error instanceof CaptureError
        ? error.message
        : "browser capture helper failed closed";
    result = { ok: false, code, message };
    process.exitCode =
      code === "OFFICE-VISUAL-UNAVAILABLE" || code === "OFFICE-VISUAL-TIMEOUT"
        ? 3
        : 1;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main();
