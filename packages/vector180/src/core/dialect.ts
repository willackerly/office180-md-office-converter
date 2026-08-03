/**
 * Whole-document Vector180/PPTV wire-family selection.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 */

import type { Vector180SourceKind, VisualWireFamily } from "./types.js";

export interface VisualDialect {
  readonly wireFamily: VisualWireFamily;
  readonly prefix: "vector180" | "pptv";
  readonly versionAttribute: "data-vector180-version" | "data-pptv-version";
  readonly manifestField: "vector180" | "pptv";
  readonly manifestId: "vector180-manifest" | "pptv-manifest";
  readonly manifestType:
    "application/vnd.office180.vector180+json" | "application/pptv+json";
  readonly browserRuntime: "vector180-browser/0.1" | "pptv-browser/0.1";
  readonly editorRuntime: "vector180-editor/0.1" | "pptv-editor/0.1";
  readonly agentProfile: "vector180-agent/1" | "pptv-agent/1";
  readonly agentProfileMeta: "vector180-agent-profile" | "pptv-agent-profile";
}

export const VECTOR180_DIALECT: VisualDialect = Object.freeze({
  wireFamily: "vector180",
  prefix: "vector180",
  versionAttribute: "data-vector180-version",
  manifestField: "vector180",
  manifestId: "vector180-manifest",
  manifestType: "application/vnd.office180.vector180+json",
  browserRuntime: "vector180-browser/0.1",
  editorRuntime: "vector180-editor/0.1",
  agentProfile: "vector180-agent/1",
  agentProfileMeta: "vector180-agent-profile",
});

export const PPTV_LEGACY_DIALECT: VisualDialect = Object.freeze({
  wireFamily: "pptv-legacy",
  prefix: "pptv",
  versionAttribute: "data-pptv-version",
  manifestField: "pptv",
  manifestId: "pptv-manifest",
  manifestType: "application/pptv+json",
  browserRuntime: "pptv-browser/0.1",
  editorRuntime: "pptv-editor/0.1",
  agentProfile: "pptv-agent/1",
  agentProfileMeta: "pptv-agent-profile",
});

const RESERVED_ATTRIBUTE_SUFFIXES = [
  "version",
  "role",
  "export",
  "from",
  "to",
  "frame",
  "line-step",
  "bounds",
  "layout",
  "slide",
  "library",
  "style",
  "theme",
  "output",
  "runtime",
  "editor-runtime",
  "object-id",
  "metadata",
] as const;

const RESERVED_ATTRIBUTE_PATTERN = new RegExp(
  String.raw`\bdata-(vector180|pptv)-(?:${RESERVED_ATTRIBUTE_SUFFIXES.join("|")})\b`,
  "giu",
);

export interface WireDialectDetection {
  readonly dialect?: VisualDialect;
  readonly vector180Evidence: readonly string[];
  readonly legacyEvidence: readonly string[];
  readonly mixed: boolean;
}

export function dialectFor(family: VisualWireFamily): VisualDialect {
  return family === "vector180" ? VECTOR180_DIALECT : PPTV_LEGACY_DIALECT;
}

export function wireAttribute(
  family: VisualWireFamily,
  suffix: (typeof RESERVED_ATTRIBUTE_SUFFIXES)[number],
): string {
  return `data-${dialectFor(family).prefix}-${suffix}`;
}

export function wireCssTokenPrefix(family: VisualWireFamily): string {
  return `--${dialectFor(family).prefix}-`;
}

/**
 * Select a dialect from recognized syntactic control surfaces only.
 * Comments and visible prose are deliberately excluded from evidence.
 */
export function detectWireDialect(
  kind: Vector180SourceKind,
  sourceText: string,
): WireDialectDetection {
  const vector180Evidence = new Set<string>();
  const legacyEvidence = new Set<string>();
  const withoutComments = stripMarkupComments(sourceText);

  for (const tag of withoutComments.matchAll(/<[^!?][^>]*>/gu)) {
    const tagText = tag[0];
    for (const marker of tagText.matchAll(RESERVED_ATTRIBUTE_PATTERN)) {
      addEvidence(marker[1], marker[0], vector180Evidence, legacyEvidence);
    }
    if (/\bid\s*=\s*["']vector180-manifest["']/iu.test(tagText)) {
      vector180Evidence.add("vector180-manifest");
    }
    if (/\bid\s*=\s*["']pptv-manifest["']/iu.test(tagText)) {
      legacyEvidence.add("pptv-manifest");
    }
    if (
      /\btype\s*=\s*["']application\/vnd\.office180\.vector180\+json["']/iu.test(
        tagText,
      )
    ) {
      vector180Evidence.add("application/vnd.office180.vector180+json");
    }
    if (/\btype\s*=\s*["']application\/pptv\+json["']/iu.test(tagText)) {
      legacyEvidence.add("application/pptv+json");
    }
    if (
      /\bname\s*=\s*["']vector180-agent-profile["']/iu.test(tagText) ||
      /\bcontent\s*=\s*["']vector180-agent\/1["']/iu.test(tagText)
    ) {
      vector180Evidence.add("vector180-agent/1");
    }
    if (
      /\bname\s*=\s*["']pptv-agent-profile["']/iu.test(tagText) ||
      /\bcontent\s*=\s*["']pptv-agent\/1["']/iu.test(tagText)
    ) {
      legacyEvidence.add("pptv-agent/1");
    }
  }

  for (const cssBlock of withoutComments.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']text\/css["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
  )) {
    const css = (cssBlock[1] ?? "").replace(/\/\*[\s\S]*?\*\//gu, "");
    if (/--vector180-[A-Za-z0-9_-]+/u.test(css)) {
      vector180Evidence.add("--vector180-*");
    }
    if (/--pptv-[A-Za-z0-9_-]+/u.test(css)) {
      legacyEvidence.add("--pptv-*");
    }
  }

  if (kind === "manifest") {
    const json = withoutComments.trimStart();
    if (/^\{\s*"vector180"\s*:/u.test(json)) {
      vector180Evidence.add('"vector180"');
    }
    if (/^\{\s*"pptv"\s*:/u.test(json)) {
      legacyEvidence.add('"pptv"');
    }
    addProfileEvidence(json, vector180Evidence, legacyEvidence);
  } else {
    for (const manifestBody of withoutComments.matchAll(
      /<script\b[^>]*\bid\s*=\s*["'](?:vector180|pptv)-manifest["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
    )) {
      const json = manifestBody[1] ?? "";
      if (/"vector180"\s*:/u.test(json)) {
        vector180Evidence.add('"vector180"');
      }
      if (/"pptv"\s*:/u.test(json)) {
        legacyEvidence.add('"pptv"');
      }
      addProfileEvidence(json, vector180Evidence, legacyEvidence);
    }
  }

  const mixed = vector180Evidence.size > 0 && legacyEvidence.size > 0;
  const dialect =
    mixed || (vector180Evidence.size === 0 && legacyEvidence.size === 0)
      ? undefined
      : vector180Evidence.size > 0
        ? VECTOR180_DIALECT
        : PPTV_LEGACY_DIALECT;
  return {
    ...(dialect === undefined ? {} : { dialect }),
    vector180Evidence: [...vector180Evidence].sort(),
    legacyEvidence: [...legacyEvidence].sort(),
    mixed,
  };
}

function addProfileEvidence(
  json: string,
  vector180Evidence: Set<string>,
  legacyEvidence: Set<string>,
): void {
  if (
    /"(?:runtime|editor|agentProfile)"\s*:\s*"vector180-(?:browser|editor|agent)\/[0-9.]+"/u.test(
      json,
    )
  ) {
    vector180Evidence.add("vector180 profile");
  }
  if (
    /"(?:runtime|editor|agentProfile)"\s*:\s*"pptv-(?:browser|editor|agent)\/[0-9.]+"/u.test(
      json,
    )
  ) {
    legacyEvidence.add("pptv profile");
  }
}

function stripMarkupComments(sourceText: string): string {
  return sourceText.replace(/<!--[\s\S]*?-->/gu, "");
}

function addEvidence(
  family: string | undefined,
  marker: string,
  vector180Evidence: Set<string>,
  legacyEvidence: Set<string>,
): void {
  if (family?.toLowerCase() === "vector180") {
    vector180Evidence.add(marker.toLowerCase());
  } else if (family?.toLowerCase() === "pptv") {
    legacyEvidence.add(marker.toLowerCase());
  }
}
