/**
 * Browser-only derivative rendering for one already authenticated C6 SVG view.
 *
 * The returned PNG is renderer-bound output, never canonical source or C11
 * native evidence. Callers must provide exact authenticated raster data URIs
 * because object URLs are editor-lifecycle details and cannot enter exports.
 *
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C8-PPTV-TEXT-FIT.2.0
 * CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_EXPORT_PIXELS = 16 * 1024 * 1024;
const MAX_EXPORT_AXIS = 8192;

export interface Vector180DerivativeFont {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
  readonly sourceBase64: string;
}

export interface Vector180PngDerivativeOptions {
  readonly fonts?: readonly Vector180DerivativeFont[];
  readonly rasterDataUris?: ReadonlyMap<string, string>;
  readonly pixelScale?: number;
}

export interface Vector180PngDerivative {
  readonly blob: Blob;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly renderer: {
    readonly kind: "browser-svg-canvas";
    readonly userAgent: string;
    readonly pixelScale: number;
  };
}

export class Vector180DerivativeExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Vector180DerivativeExportError";
  }
}

/**
 * Rasterize the current literal C6 preview without serializing editor chrome,
 * selection state, fit diagnostics, or ephemeral object URLs.
 */
export async function renderVector180PreviewPng(
  preview: SVGSVGElement,
  options: Vector180PngDerivativeOptions = {},
): Promise<Vector180PngDerivative> {
  const viewBox = parseViewBox(preview.getAttribute("viewBox"));
  const pixelScale = options.pixelScale ?? 1;
  if (!Number.isFinite(pixelScale) || pixelScale <= 0 || pixelScale > 4) {
    throw new Vector180DerivativeExportError(
      "PNG pixelScale must be finite, greater than zero, and at most 4.",
    );
  }
  const widthPixels = Math.round(viewBox.width * pixelScale);
  const heightPixels = Math.round(viewBox.height * pixelScale);
  if (
    widthPixels <= 0 ||
    heightPixels <= 0 ||
    widthPixels > MAX_EXPORT_AXIS ||
    heightPixels > MAX_EXPORT_AXIS ||
    widthPixels > Math.floor(MAX_EXPORT_PIXELS / heightPixels)
  ) {
    throw new Vector180DerivativeExportError(
      `PNG dimensions ${widthPixels} × ${heightPixels} exceed the bounded browser export profile.`,
    );
  }

  const clone = preview.cloneNode(true) as SVGSVGElement;
  cleanEditorProjection(clone, options.rasterDataUris ?? new Map());
  clone.setAttribute("xmlns", SVG_NAMESPACE);
  clone.setAttribute("width", String(widthPixels));
  clone.setAttribute("height", String(heightPixels));
  clone.removeAttribute("class");
  embedFonts(clone, options.fonts ?? []);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = widthPixels;
    canvas.height = heightPixels;
    const context = canvas.getContext("2d", { alpha: true });
    if (context === null) {
      throw new Vector180DerivativeExportError(
        "The browser did not provide a 2D canvas context.",
      );
    }
    context.drawImage(image, 0, 0, widthPixels, heightPixels);
    const blob = await canvasPng(canvas);
    return Object.freeze({
      blob,
      widthPixels,
      heightPixels,
      renderer: Object.freeze({
        kind: "browser-svg-canvas" as const,
        userAgent: navigator.userAgent,
        pixelScale,
      }),
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function cleanEditorProjection(
  svg: SVGSVGElement,
  rasterDataUris: ReadonlyMap<string, string>,
): void {
  for (const overlay of svg.querySelectorAll(
    ".fit-overlay, .selection-overlay",
  )) {
    overlay.remove();
  }
  for (const element of [svg, ...svg.querySelectorAll<SVGElement>("*")]) {
    const objectId = element.dataset.vector180ObjectId;
    if (element.localName === "image" && objectId !== undefined) {
      const dataUri = rasterDataUris.get(objectId);
      if (dataUri === undefined) {
        throw new Vector180DerivativeExportError(
          `Raster object "${objectId}" lacks exact authenticated bytes for PNG export.`,
        );
      }
      element.setAttribute("href", dataUri);
    }
    element.removeAttribute("data-selected");
    element.removeAttribute("data-fit-status");
    element.removeAttribute("data-vector180-object-id");
    element.removeAttribute("data-selection-overlay");
  }
}

function embedFonts(
  svg: SVGSVGElement,
  fonts: readonly Vector180DerivativeFont[],
): void {
  if (fonts.length === 0) return;
  const definitions = document.createElementNS(SVG_NAMESPACE, "defs");
  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = fonts
    .map((font) => {
      const data = fontDataDescriptor(font.sourceBase64);
      return `@font-face{font-family:${cssString(font.family)};font-style:${font.style};font-weight:${font.weight};src:url("data:${data.mediaType};base64,${font.sourceBase64}") format("${data.format}");}`;
    })
    .join("");
  definitions.append(style);
  svg.prepend(definitions);
}

function parseViewBox(value: string | null): {
  readonly width: number;
  readonly height: number;
} {
  const values = (value ?? "")
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    values.length !== 4 ||
    values.some((entry) => !Number.isFinite(entry)) ||
    values[2]! <= 0 ||
    values[3]! <= 0
  ) {
    throw new Vector180DerivativeExportError(
      "The selected preview does not have one finite positive SVG viewBox.",
    );
  }
  return { width: values[2]!, height: values[3]! };
}

function cssString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function fontDataDescriptor(sourceBase64: string): {
  readonly mediaType: string;
  readonly format: string;
} {
  let signature = "";
  try {
    signature = atob(sourceBase64.slice(0, 8)).slice(0, 4);
  } catch {
    throw new Vector180DerivativeExportError(
      "An embedded exact font has invalid base64 bytes.",
    );
  }
  if (signature === "OTTO") {
    return { mediaType: "font/otf", format: "opentype" };
  }
  if (signature === "ttcf") {
    return { mediaType: "font/collection", format: "collection" };
  }
  if (signature === "wOFF") {
    return { mediaType: "font/woff", format: "woff" };
  }
  if (signature === "wOF2") {
    return { mediaType: "font/woff2", format: "woff2" };
  }
  return { mediaType: "font/ttf", format: "truetype" };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () =>
        reject(
          new Vector180DerivativeExportError(
            "The browser could not decode the authenticated SVG derivative.",
          ),
        ),
      { once: true },
    );
    image.src = url;
  });
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null || blob.size === 0 || blob.type !== "image/png") {
        reject(
          new Vector180DerivativeExportError(
            "The browser did not produce one non-empty PNG derivative.",
          ),
        );
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
