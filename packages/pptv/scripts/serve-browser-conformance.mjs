/**
 * Minimal fixed-route HTTP harness for real-browser PPTV conformance tests.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.1
 * CONTRACT:C6-PPTV-RESOLVED.1.1
 * CONTRACT:C8-PPTV-TEXT-FIT.1.1
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number.parseInt(
  process.env["PPTV_CONFORMANCE_PORT"] ?? "4178",
  10,
);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PPTV_CONFORMANCE_PORT must be a valid TCP port.");
}

const testResultsRoot = new URL("../test-results/", import.meta.url);
const generatedEditorPack = new URL("editor-pack.html", testResultsRoot);
assertContained(testResultsRoot, generatedEditorPack);

const routes = new Map([
  [
    "/assets/pptv-browser-kernel-0.1.iife.js",
    {
      url: new URL(
        "../assets/pptv-browser-kernel-0.1.iife.js",
        import.meta.url,
      ),
      type: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/fixtures/fonts/ABeeZee-Regular.ttf",
    {
      url: new URL(
        "../test-fixtures/fonts/ABeeZee-Regular.ttf",
        import.meta.url,
      ),
      type: "font/ttf",
    },
  ],
  [
    "/generated/editor-pack.html",
    {
      url: generatedEditorPack,
      type: "text/html; charset=utf-8",
    },
  ],
]);

const harness = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'self'; connect-src 'self'; font-src 'self'; style-src 'unsafe-inline'">
  <title>PPTV browser conformance</title>
</head>
<body>
  <p id="status">PPTV browser kernel harness</p>
  <script src="/assets/pptv-browser-kernel-0.1.iife.js"></script>
</body>
</html>
`;

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (path === "/health") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("ok\n");
      return;
    }
    if (path === "/" || path === "/harness.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(harness);
      return;
    }
    const route = routes.get(path);
    if (route === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found\n");
      return;
    }
    let bytes;
    try {
      bytes = await readFile(route.url);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        response.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("not found\n");
        return;
      }
      throw error;
    }
    response.writeHead(200, { "Content-Type": route.type });
    response.end(bytes);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(
      error instanceof Error ? `${error.message}\n` : "internal error\n",
    );
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `PPTV browser conformance server listening on http://${host}:${port}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function assertContained(rootUrl, targetUrl) {
  const root = fileURLToPath(rootUrl);
  const target = fileURLToPath(targetUrl);
  const pathFromRoot = relative(root, target);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    pathFromRoot.includes("\u0000")
  ) {
    throw new Error("Generated editor-pack route escaped test-results.");
  }
}
