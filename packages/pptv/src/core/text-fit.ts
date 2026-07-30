/**
 * Pure non-mutating text-fit preflight for explicit PPTV hard lines.
 *
 * CONTRACT:C8-PPTV-TEXT-FIT.1.0
 */

import type {
  PptvResolvedDeck,
  PptvResolvedObject,
  PptvResolvedText,
  PptvResolvedTextLine,
} from "./resolved.js";

export type PptvTextFitStatus =
  "clear" | "near-limit" | "overflow" | "unverified";

export interface PptvTextFont {
  readonly family: string;
  readonly size: number;
  readonly weight: 400 | 700;
  readonly style: "normal" | "italic";
}

export interface PptvTextMeasureRequest {
  readonly slideId: string;
  readonly objectId: string;
  readonly lineIndex: number;
  readonly text: string;
  readonly font: PptvTextFont;
}

export interface PptvMeasuredText {
  readonly kind: "measured";
  readonly width: number;
  readonly method: string;
  readonly fontIdentity: string;
  readonly missingCodepoints?: readonly number[];
}

export interface PptvUnverifiedText {
  readonly kind: "unverified";
  readonly method: string;
  readonly reason: string;
  readonly fontIdentity?: string;
  readonly missingCodepoints?: readonly number[];
}

export type PptvTextMeasurement = PptvMeasuredText | PptvUnverifiedText;

export type PptvTextMeasurer = (
  request: PptvTextMeasureRequest,
) => PptvTextMeasurement;

export interface PptvTextFitOptions {
  /** Utilization at or above this value warns before an actual overrun. */
  readonly nearLimit?: number;
}

export interface PptvTextFitLine {
  readonly slideId: string;
  readonly objectId: string;
  readonly lineIndex: number;
  readonly text: string;
  readonly anchor: "start" | "middle" | "end";
  readonly anchorX: number;
  readonly frameX: number;
  readonly frameWidth: number;
  readonly availableWidth: number;
  readonly font: PptvTextFont;
  readonly status: PptvTextFitStatus;
  readonly measuredWidth: number | null;
  readonly utilization: number | null;
  readonly overrun: number | null;
  readonly method: string;
  readonly fontIdentity?: string;
  readonly missingCodepoints: readonly number[];
  readonly reason?: string;
}

export interface PptvTextFitSummary {
  readonly total: number;
  readonly clear: number;
  readonly nearLimit: number;
  readonly overflow: number;
  readonly unverified: number;
}

export interface PptvTextFitResult {
  readonly schema: "pptv-text-fit/0.1";
  readonly sourceSha256: string;
  readonly nearLimit: number;
  readonly summary: PptvTextFitSummary;
  readonly lines: readonly PptvTextFitLine[];
}

const DEFAULT_NEAR_LIMIT = 0.9;
const INVALID_MEASURER_METHOD = "invalid-measurer-result";
const MEASURER_ERROR_METHOD = "measurer-error";

/**
 * Measure every resolved hard line without modifying source, text, or geometry.
 *
 * The injected measurer owns font selection and shaping evidence. Invalid,
 * missing, or throwing measurement adapters become per-line `unverified`
 * results so one face cannot hide the rest of the deck.
 */
export function preflightTextFit(
  deck: PptvResolvedDeck,
  measurer: PptvTextMeasurer,
  options: PptvTextFitOptions = {},
): PptvTextFitResult {
  const nearLimit = options.nearLimit ?? DEFAULT_NEAR_LIMIT;
  if (
    typeof nearLimit !== "number" ||
    !Number.isFinite(nearLimit) ||
    nearLimit <= 0 ||
    nearLimit >= 1
  ) {
    throw new RangeError(
      "nearLimit must be a finite number greater than 0 and less than 1.",
    );
  }
  if (typeof measurer !== "function") {
    throw new TypeError("text-fit preflight requires a callable measurer.");
  }

  const lines: PptvTextFitLine[] = [];
  for (const slide of deck.slides) {
    visitTextObjects(slide.objects, (object) => {
      for (const [lineIndex, line] of object.lines.entries()) {
        lines.push(preflightLine(object, line, lineIndex, nearLimit, measurer));
      }
    });
  }

  const summary: PptvTextFitSummary = {
    total: lines.length,
    clear: lines.filter(({ status }) => status === "clear").length,
    nearLimit: lines.filter(({ status }) => status === "near-limit").length,
    overflow: lines.filter(({ status }) => status === "overflow").length,
    unverified: lines.filter(({ status }) => status === "unverified").length,
  };
  return Object.freeze({
    schema: "pptv-text-fit/0.1",
    sourceSha256: deck.sourceSha256,
    nearLimit,
    summary: Object.freeze(summary),
    lines: Object.freeze(lines),
  });
}

export function textLineAvailableWidth(
  object: Pick<PptvResolvedText, "anchor" | "frame">,
  line: Pick<PptvResolvedTextLine, "x">,
): number {
  const left = object.frame.x;
  const right = left + object.frame.width;
  if (object.anchor === "start") return right - line.x;
  if (object.anchor === "end") return line.x - left;
  return 2 * Math.min(line.x - left, right - line.x);
}

function preflightLine(
  object: PptvResolvedText,
  line: PptvResolvedTextLine,
  lineIndex: number,
  nearLimit: number,
  measurer: PptvTextMeasurer,
): PptvTextFitLine {
  const family = object.style.fontFamily;
  const size = object.style.fontSize;
  const base = {
    slideId: object.slideId,
    objectId: object.id,
    lineIndex,
    text: line.text,
    anchor: object.anchor,
    anchorX: line.x,
    frameX: object.frame.x,
    frameWidth: object.frame.width,
    availableWidth: textLineAvailableWidth(object, line),
  };
  if (
    family === undefined ||
    family.trim().length === 0 ||
    size === undefined ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(base.availableWidth) ||
    base.availableWidth < 0
  ) {
    return freezeLine({
      ...base,
      font: {
        family: family ?? "",
        size: size ?? 0,
        weight: object.style.fontWeight,
        style: object.style.fontStyle,
      },
      status: "unverified",
      measuredWidth: null,
      utilization: null,
      overrun: null,
      method: "resolved-model",
      missingCodepoints: [],
      reason: "Resolved text has invalid font or anchor-aware frame geometry.",
    });
  }

  const font: PptvTextFont = Object.freeze({
    family,
    size,
    weight: object.style.fontWeight,
    style: object.style.fontStyle,
  });
  const request: PptvTextMeasureRequest = Object.freeze({
    slideId: object.slideId,
    objectId: object.id,
    lineIndex,
    text: line.text,
    font,
  });
  let normalized: PptvTextMeasurement;
  try {
    normalized = normalizeMeasurement(measurer(request));
  } catch (error) {
    return unverifiedLine(
      base,
      font,
      MEASURER_ERROR_METHOD,
      error instanceof Error ? error.message : String(error),
    );
  }
  if (normalized.kind === "unverified") {
    return unverifiedLine(
      base,
      font,
      normalized.method,
      normalized.reason,
      normalized.fontIdentity,
      normalized.missingCodepoints,
    );
  }

  const measuredWidth = normalized.width;
  const availableWidth = base.availableWidth;
  const rawUtilization =
    availableWidth === 0
      ? measuredWidth === 0
        ? 0
        : null
      : measuredWidth / availableWidth;
  const utilization =
    rawUtilization !== null && Number.isFinite(rawUtilization)
      ? rawUtilization
      : null;
  const overrun = Math.max(0, measuredWidth - availableWidth);
  const status: PptvTextFitStatus =
    measuredWidth > availableWidth
      ? "overflow"
      : utilization !== null && utilization >= nearLimit
        ? "near-limit"
        : "clear";
  return freezeLine({
    ...base,
    font,
    status,
    measuredWidth,
    utilization,
    overrun,
    method: normalized.method,
    fontIdentity: normalized.fontIdentity,
    missingCodepoints: [],
  });
}

function normalizeMeasurement(value: PptvTextMeasurement): PptvTextMeasurement {
  if (typeof value !== "object" || value === null) {
    return invalidMeasurement("Measurer returned a non-object value.");
  }
  const method = nonempty(value.method);
  if (method === undefined) {
    return invalidMeasurement("Measurer returned an empty method.");
  }
  const missingCodepoints = normalizeCodepoints(value.missingCodepoints);
  if (missingCodepoints === undefined) {
    return invalidMeasurement("Measurer returned invalid missing codepoints.");
  }
  if (value.kind === "unverified") {
    const reason = nonempty(value.reason);
    if (reason === undefined) {
      return invalidMeasurement("Unverified measurement has no reason.");
    }
    const fontIdentity =
      value.fontIdentity === undefined
        ? undefined
        : nonempty(value.fontIdentity);
    if (value.fontIdentity !== undefined && fontIdentity === undefined) {
      return invalidMeasurement("Measurer returned an empty font identity.");
    }
    return {
      kind: "unverified",
      method,
      reason,
      ...(fontIdentity === undefined ? {} : { fontIdentity }),
      missingCodepoints,
    };
  }
  if (value.kind !== "measured") {
    return invalidMeasurement("Measurer returned an unknown result kind.");
  }
  const fontIdentity = nonempty(value.fontIdentity);
  if (
    !Number.isFinite(value.width) ||
    value.width < 0 ||
    fontIdentity === undefined
  ) {
    return invalidMeasurement(
      "Measurer returned an invalid width or font identity.",
    );
  }
  if (missingCodepoints.length > 0) {
    return {
      kind: "unverified",
      method,
      reason: "The selected font does not cover every source codepoint.",
      fontIdentity,
      missingCodepoints,
    };
  }
  return {
    kind: "measured",
    width: value.width,
    method,
    fontIdentity,
    missingCodepoints,
  };
}

function invalidMeasurement(reason: string): PptvUnverifiedText {
  return {
    kind: "unverified",
    method: INVALID_MEASURER_METHOD,
    reason,
    missingCodepoints: [],
  };
}

function unverifiedLine(
  base: Omit<
    PptvTextFitLine,
    | "font"
    | "status"
    | "measuredWidth"
    | "utilization"
    | "overrun"
    | "method"
    | "missingCodepoints"
  >,
  font: PptvTextFont,
  method: string,
  reason: string,
  fontIdentity?: string,
  missingCodepoints: readonly number[] = [],
): PptvTextFitLine {
  return freezeLine({
    ...base,
    font,
    status: "unverified",
    measuredWidth: null,
    utilization: null,
    overrun: null,
    method,
    ...(fontIdentity === undefined ? {} : { fontIdentity }),
    missingCodepoints,
    reason,
  });
}

function freezeLine(line: PptvTextFitLine): PptvTextFitLine {
  return Object.freeze({
    ...line,
    font: Object.freeze({ ...line.font }),
    missingCodepoints: Object.freeze([...line.missingCodepoints]),
  });
}

function normalizeCodepoints(
  values: readonly number[] | undefined,
): readonly number[] | undefined {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values)) return undefined;
  const unique = new Set<number>();
  for (const value of values) {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff)
    ) {
      return undefined;
    }
    unique.add(value);
  }
  return Object.freeze([...unique].sort((left, right) => left - right));
}

function nonempty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function visitTextObjects(
  objects: readonly PptvResolvedObject[],
  visit: (object: PptvResolvedText) => void,
): void {
  for (const object of objects) {
    if (object.kind === "text") visit(object);
    else if (object.kind === "group") visitTextObjects(object.children, visit);
  }
}
