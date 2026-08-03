/**
 * Browser-independent Vector180 style and theme resolution.
 *
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 */

import { wireAttribute, wireCssTokenPrefix } from "./dialect.js";
import type {
  Diagnostic,
  Vector180Deck,
  Vector180Atom,
  Vector180Node,
  SourceRange,
  VisualWireFamily,
} from "./types.js";

type Vector180StyleDocument = Vector180Deck | Vector180Atom;

export type Vector180StyleOrigin =
  "default" | "presentation-attribute" | "base-rule" | "inline-style";

export interface Vector180ResolvedStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight: 400 | 700;
  readonly fontStyle: "normal" | "italic";
  readonly textAnchor: "start" | "middle" | "end";
}

export interface Vector180ResolvedPropertyProvenance {
  readonly origin: Vector180StyleOrigin;
  /** The declaration before token substitution, or the fixed default literal. */
  readonly expression: string;
  /** Present only for a matching base rule. */
  readonly selector?: string;
  /** Zero-based rule order in the base stylesheet. */
  readonly sourceOrder?: number;
  /** Exact custom-property name when a base declaration used var(). */
  readonly token?: string;
  readonly sourceRange?: SourceRange;
}

export interface Vector180StyleProvenance {
  readonly fill: Vector180ResolvedPropertyProvenance;
  readonly stroke: Vector180ResolvedPropertyProvenance;
  readonly strokeWidth: Vector180ResolvedPropertyProvenance;
  readonly opacity: Vector180ResolvedPropertyProvenance;
  readonly fontFamily?: Vector180ResolvedPropertyProvenance;
  readonly fontSize?: Vector180ResolvedPropertyProvenance;
  readonly fontWeight: Vector180ResolvedPropertyProvenance;
  readonly fontStyle: Vector180ResolvedPropertyProvenance;
  readonly textAnchor: Vector180ResolvedPropertyProvenance;
}

export interface Vector180ResolvedObjectStyle {
  readonly style: Vector180ResolvedStyle;
  readonly styleProvenance: Vector180StyleProvenance;
}

export interface Vector180StyleResolution {
  /** Deterministic manifest/DOM-order insertion, keyed by globally stable ID. */
  readonly styles: ReadonlyMap<string, Vector180ResolvedObjectStyle>;
  readonly diagnostics: readonly Diagnostic[];
}

type CssProperty =
  | "fill"
  | "stroke"
  | "stroke-width"
  | "opacity"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "font-style"
  | "text-anchor";

type StyleValue = string | number;

interface RawDeclaration {
  readonly property: string;
  readonly expression: string;
}

interface RawRule {
  readonly selector: string;
  readonly declarations: readonly RawDeclaration[];
}

interface ParsedStylesheet {
  readonly rules: readonly RawRule[];
  readonly diagnostics: readonly Diagnostic[];
}

interface BaseDeclaration {
  readonly property: CssProperty;
  readonly expression: string;
  readonly literal?: StyleValue;
  readonly token?: string;
}

interface BaseRule {
  readonly selector: string;
  readonly className: string;
  readonly sourceOrder: number;
  readonly declarations: readonly BaseDeclaration[];
}

interface ParsedBase {
  readonly rules: readonly BaseRule[];
  readonly tokenUses: ReadonlyMap<string, ReadonlySet<CssProperty>>;
  readonly diagnostics: readonly Diagnostic[];
}

interface ParsedTheme {
  readonly id: string;
  readonly tokens: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}

interface StyleCandidate {
  readonly value: StyleValue;
  readonly provenance: Vector180ResolvedPropertyProvenance;
}

const CSS_PROPERTIES: readonly CssProperty[] = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
];

const CSS_PROPERTY_SET = new Set<string>(CSS_PROPERTIES);
const CLASS_SELECTOR_PATTERN = /^\.-?[_A-Za-z][_A-Za-z0-9-]*$/u;
const CSS_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const CSS_DIMENSION_PATTERN =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(px)?$/iu;
const HEX_PAINT_PATTERN = /^#[0-9a-f]{6}$/iu;

const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
]);

const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "emoji",
  "fangsong",
  "fantasy",
  "math",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

/**
 * SVG presentation properties outside C6. Geometry, identity, source-control,
 * and application data attributes are deliberately not treated as CSS.
 */
const UNSUPPORTED_PRESENTATION_ATTRIBUTES = new Set([
  "alignment-baseline",
  "baseline-shift",
  "clip",
  "clip-path",
  "clip-rule",
  "color",
  "color-interpolation",
  "color-interpolation-filters",
  "color-rendering",
  "cursor",
  "direction",
  "display",
  "dominant-baseline",
  "enable-background",
  "fill-opacity",
  "fill-rule",
  "filter",
  "flood-color",
  "flood-opacity",
  "font",
  "font-feature-settings",
  "font-kerning",
  "font-size-adjust",
  "font-stretch",
  "font-variant",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-ligatures",
  "font-variant-numeric",
  "glyph-orientation-horizontal",
  "glyph-orientation-vertical",
  "image-rendering",
  "letter-spacing",
  "lighting-color",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "mix-blend-mode",
  "overflow",
  "paint-order",
  "pointer-events",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "text-decoration",
  "text-overflow",
  "text-rendering",
  "unicode-bidi",
  "vector-effect",
  "visibility",
  "white-space",
  "word-spacing",
  "writing-mode",
]);

const DEFAULTS: Readonly<
  Record<Exclude<CssProperty, "font-family" | "font-size">, StyleCandidate>
> = {
  fill: defaultCandidate("#000000"),
  stroke: defaultCandidate("none"),
  "stroke-width": defaultCandidate(1),
  opacity: defaultCandidate(1),
  "font-weight": defaultCandidate(400),
  "font-style": defaultCandidate("normal"),
  "text-anchor": defaultCandidate("start"),
};

/**
 * Resolve the complete C6 author cascade without CSSOM, layout, I/O, or source
 * mutation. Every theme is checked before the active theme is applied.
 */
export function resolveVector180Styles(
  deck: Vector180Deck,
): Vector180StyleResolution {
  const diagnostics: Diagnostic[] = [];
  const styles = new Map<string, Vector180ResolvedObjectStyle>();
  const base = parseBase(deck, diagnostics);
  const themes = new Map<string, ParsedTheme>();

  for (const theme of deck.themes.values()) {
    const parsed = parseTheme(
      theme.id,
      theme.cssText,
      theme.contentRange,
      deck.wireFamily,
    );
    themes.set(theme.id, parsed);
    diagnostics.push(...parsed.diagnostics);
  }

  validateThemeParity(deck, base, themes, diagnostics);
  validateThemeValues(deck, base, themes, diagnostics);

  const activeTheme =
    deck.activeTheme === undefined ? undefined : themes.get(deck.activeTheme);
  if (deck.activeTheme === undefined || activeTheme === undefined) {
    diagnostics.push(
      makeDiagnostic(
        "VECTOR180-PROFILE-UNRESOLVED-TOKEN",
        deck.activeTheme === undefined
          ? "Vector180 style resolution requires one active theme."
          : `Active theme "${deck.activeTheme}" is not available for style resolution.`,
        deck.index.manifestFields.get("theme") ?? deck.index.manifest,
      ),
    );
  }

  for (const slideId of deck.slideOrder) {
    const slide = deck.slides.get(slideId);
    if (slide === undefined) continue;
    resolveNodes(
      deck,
      slideId,
      slide.children,
      base.rules,
      activeTheme,
      styles,
      diagnostics,
    );
  }

  return { styles, diagnostics };
}

/**
 * Resolve standalone diagram styles from SVG initial defaults plus local
 * presentation attributes and inline declarations. Standalone diagrams have
 * no base stylesheet, theme, active-theme, or inherited browser CSS authority.
 */
export function resolveVector180AtomStyles(
  diagram: Vector180Atom,
): Vector180StyleResolution {
  const diagnostics: Diagnostic[] = [];
  const styles = new Map<string, Vector180ResolvedObjectStyle>();
  resolveNodes(
    diagram,
    diagram.id,
    diagram.children,
    [],
    undefined,
    styles,
    diagnostics,
  );
  return { styles, diagnostics };
}

function parseBase(deck: Vector180Deck, diagnostics: Diagnostic[]): ParsedBase {
  const varPattern = tokenVarPattern(deck.wireFamily);
  if (deck.baseStyle === undefined) {
    const result: ParsedBase = {
      rules: [],
      tokenUses: new Map(),
      diagnostics: [
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          "Vector180 style resolution requires exactly one base stylesheet.",
          deck.index.manifest,
        ),
      ],
    };
    diagnostics.push(...result.diagnostics);
    return result;
  }

  const parsed = parseStylesheet(
    deck.baseStyle.cssText,
    deck.baseStyle.contentRange,
    "base stylesheet",
  );
  const ownDiagnostics: Diagnostic[] = [...parsed.diagnostics];
  const rules: BaseRule[] = [];
  const tokenUses = new Map<string, Set<CssProperty>>();

  parsed.rules.forEach((rawRule, sourceOrder) => {
    if (!CLASS_SELECTOR_PATTERN.test(rawRule.selector)) {
      ownDiagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SELECTOR",
          `Base selector "${rawRule.selector}" is not a simple single-class selector.`,
          deck.baseStyle?.contentRange,
        ),
      );
      return;
    }

    const seen = new Set<CssProperty>();
    const declarations: BaseDeclaration[] = [];
    for (const declaration of rawRule.declarations) {
      const property = normalizeSupportedProperty(declaration.property);
      if (property === undefined) {
        ownDiagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-PROPERTY",
            `Base rule "${rawRule.selector}" uses unsupported property "${declaration.property}".`,
            deck.baseStyle?.contentRange,
          ),
        );
        continue;
      }
      if (seen.has(property)) {
        ownDiagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-PROPERTY",
            `Base rule "${rawRule.selector}" repeats property "${property}".`,
            deck.baseStyle?.contentRange,
          ),
        );
        continue;
      }
      seen.add(property);

      const tokenMatch = varPattern.exec(declaration.expression);
      if (tokenMatch !== null) {
        const token = tokenMatch[1];
        if (token === undefined) continue;
        declarations.push({
          property,
          expression: declaration.expression,
          token,
        });
        const uses = tokenUses.get(token) ?? new Set<CssProperty>();
        uses.add(property);
        tokenUses.set(token, uses);
        continue;
      }

      if (/var\s*\(/iu.test(declaration.expression)) {
        ownDiagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-VALUE",
            `Base property "${property}" must use exactly var(${wireCssTokenPrefix(deck.wireFamily)}token) with no fallback.`,
            deck.baseStyle?.contentRange,
          ),
        );
        continue;
      }

      const literal = parseStyleValue(property, declaration.expression);
      if (!literal.ok) {
        ownDiagnostics.push(
          makeDiagnostic(
            literal.code,
            `Base property "${property}" ${literal.message}.`,
            deck.baseStyle?.contentRange,
          ),
        );
        continue;
      }
      declarations.push({
        property,
        expression: declaration.expression,
        literal: literal.value,
      });
    }

    rules.push({
      selector: rawRule.selector,
      className: rawRule.selector.slice(1),
      sourceOrder,
      declarations,
    });
  });

  const result: ParsedBase = { rules, tokenUses, diagnostics: ownDiagnostics };
  diagnostics.push(...ownDiagnostics);
  return result;
}

function parseTheme(
  id: string,
  cssText: string,
  range: SourceRange,
  wireFamily: VisualWireFamily,
): ParsedTheme {
  const parsed = parseStylesheet(cssText, range, `theme "${id}"`);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const tokens = new Map<string, string>();

  if (parsed.rules.length !== 1 || parsed.rules[0]?.selector !== ":root") {
    diagnostics.push(
      makeDiagnostic(
        "VECTOR180-PROFILE-CSS-SELECTOR",
        `Theme "${id}" must contain exactly one :root rule and no other rules.`,
        range,
      ),
    );
  }

  for (const rule of parsed.rules) {
    if (rule.selector !== ":root") continue;
    for (const declaration of rule.declarations) {
      if (!tokenPattern(wireFamily).test(declaration.property)) {
        diagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-PROPERTY",
            `Theme "${id}" may declare only unique ${wireCssTokenPrefix(wireFamily)}* tokens; found "${declaration.property}".`,
            range,
          ),
        );
        continue;
      }
      if (tokens.has(declaration.property)) {
        diagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-THEME-TOKENS",
            `Theme "${id}" repeats token "${declaration.property}".`,
            range,
          ),
        );
        continue;
      }
      const prohibited = prohibitedThemeTokenReason(declaration.expression);
      if (prohibited !== undefined) {
        diagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-VALUE",
            `Theme token "${declaration.property}" ${prohibited}.`,
            range,
          ),
        );
        continue;
      }
      tokens.set(declaration.property, declaration.expression);
    }
  }

  return { id, tokens, diagnostics };
}

function validateThemeParity(
  deck: Vector180Deck,
  base: ParsedBase,
  themes: ReadonlyMap<string, ParsedTheme>,
  diagnostics: Diagnostic[],
): void {
  const required = [...base.tokenUses.keys()].sort();
  const requiredSet = new Set(required);

  for (const theme of themes.values()) {
    const missing = required.filter((token) => !theme.tokens.has(token));
    const extra = [...theme.tokens.keys()]
      .filter((token) => !requiredSet.has(token))
      .sort();
    if (missing.length === 0 && extra.length === 0) continue;
    diagnostics.push(
      makeDiagnostic(
        "VECTOR180-PROFILE-THEME-TOKENS",
        `Theme "${theme.id}" token set does not match base CSS` +
          `${missing.length === 0 ? "" : `; missing ${missing.join(", ")}`}` +
          `${extra.length === 0 ? "" : `; extra ${extra.join(", ")}`}.`,
        deck.themes.get(theme.id)?.contentRange,
      ),
    );
  }
}

function validateThemeValues(
  deck: Vector180Deck,
  base: ParsedBase,
  themes: ReadonlyMap<string, ParsedTheme>,
  diagnostics: Diagnostic[],
): void {
  for (const theme of themes.values()) {
    for (const [token, properties] of base.tokenUses) {
      const expression = theme.tokens.get(token);
      if (expression === undefined) continue;
      for (const property of properties) {
        const result = parseStyleValue(property, expression);
        if (result.ok) continue;
        diagnostics.push(
          makeDiagnostic(
            result.code,
            `Theme "${theme.id}" token "${token}" used by "${property}" ${result.message}.`,
            deck.themes.get(theme.id)?.contentRange,
          ),
        );
      }
    }
  }
}

function resolveNodes(
  document: Vector180StyleDocument,
  scopeId: string,
  nodes: readonly Vector180Node[],
  rules: readonly BaseRule[],
  activeTheme: ParsedTheme | undefined,
  styles: Map<string, Vector180ResolvedObjectStyle>,
  diagnostics: Diagnostic[],
): void {
  for (const node of nodes) {
    if (node.exportMode === "ignore") continue;
    if (styles.has(node.id)) {
      diagnostics.push({
        ...makeDiagnostic(
          "VECTOR180-PROFILE-INVALID-BASE",
          `Ambiguous object ID "${node.id}" cannot have one resolved style.`,
          node.sourceRange,
        ),
        ...diagnosticScope(document, scopeId),
        objectId: node.id,
      });
      continue;
    }

    styles.set(
      node.id,
      resolveNodeStyle(
        document,
        scopeId,
        node,
        rules,
        activeTheme,
        diagnostics,
      ),
    );
    if (!node.opaque) {
      resolveNodes(
        document,
        scopeId,
        node.children,
        rules,
        activeTheme,
        styles,
        diagnostics,
      );
    }
  }
}

function resolveNodeStyle(
  document: Vector180StyleDocument,
  scopeId: string,
  node: Vector180Node,
  rules: readonly BaseRule[],
  activeTheme: ParsedTheme | undefined,
  diagnostics: Diagnostic[],
): Vector180ResolvedObjectStyle {
  const candidates = defaultCandidates();

  if (document.sourceKind === "svg") {
    const styleAttribute = wireAttribute(document.wireFamily, "style");
    const themeAttribute = wireAttribute(document.wireFamily, "theme");
    const tokenPrefix = wireCssTokenPrefix(document.wireFamily);
    for (const [authoredName, value] of Object.entries(node.attributes)) {
      const name = authoredName.toLowerCase();
      const prohibited =
        name === "class" ||
        name === styleAttribute ||
        name === themeAttribute ||
        name.startsWith("--") ||
        /var\s*\(/iu.test(value) ||
        value.includes(tokenPrefix) ||
        (name === "style" && /(?:^|;)\s*--[-_A-Za-z0-9]+\s*:/u.test(value));
      if (!prohibited) continue;
      diagnostics.push(
        objectDiagnostic(
          "VECTOR180-PROFILE-STYLE",
          `Standalone diagram object "${node.id}" uses unsupported stylesheet, class, theme, token, custom-property, or var() authority in "${authoredName}".`,
          document,
          scopeId,
          node,
          authoredName,
        ),
      );
    }
  }

  for (const attributeName of Object.keys(node.attributes)) {
    if (!UNSUPPORTED_PRESENTATION_ATTRIBUTES.has(attributeName.toLowerCase()))
      continue;
    diagnostics.push(
      objectDiagnostic(
        "VECTOR180-PROFILE-CSS-PROPERTY",
        `Object "${node.id}" uses unsupported presentation attribute "${attributeName}".`,
        document,
        scopeId,
        node,
        attributeName,
      ),
    );
  }

  for (const property of CSS_PROPERTIES) {
    const expression = getAttribute(node, property);
    if (expression === undefined) continue;
    const result = parseStyleValue(property, expression);
    if (!result.ok) {
      diagnostics.push(
        objectDiagnostic(
          result.code,
          `Object "${node.id}" presentation attribute "${property}" ${result.message}.`,
          document,
          scopeId,
          node,
          property,
        ),
      );
      continue;
    }
    const sourceRange = attributeRange(document, node, property);
    candidates.set(property, {
      value: result.value,
      provenance: {
        origin: "presentation-attribute",
        expression: expression.trim(),
        ...(sourceRange === undefined ? {} : { sourceRange }),
      },
    });
  }

  for (const rule of rules) {
    if (!node.classes.includes(rule.className)) continue;
    for (const declaration of rule.declarations) {
      let value = declaration.literal;
      if (declaration.token !== undefined) {
        const tokenExpression = activeTheme?.tokens.get(declaration.token);
        if (tokenExpression === undefined) {
          diagnostics.push(
            objectDiagnostic(
              "VECTOR180-PROFILE-UNRESOLVED-TOKEN",
              `Object "${node.id}" cannot resolve token "${declaration.token}" for "${declaration.property}".`,
              document,
              scopeId,
              node,
            ),
          );
          continue;
        }
        const result = parseStyleValue(declaration.property, tokenExpression);
        if (!result.ok) continue;
        value = result.value;
      }
      if (value === undefined) continue;
      candidates.set(declaration.property, {
        value,
        provenance: {
          origin: "base-rule",
          expression: declaration.expression,
          selector: rule.selector,
          sourceOrder: rule.sourceOrder,
          ...(declaration.token === undefined
            ? {}
            : { token: declaration.token }),
          ...(document.sourceKind !== "html" || document.baseStyle === undefined
            ? {}
            : { sourceRange: document.baseStyle.contentRange }),
        },
      });
    }
  }

  const inline = getAttribute(node, "style");
  if (inline !== undefined) {
    const range = attributeRange(document, node, "style") ?? node.openTagRange;
    const parsed = parseDeclarationList(inline, range, `style on "${node.id}"`);
    diagnostics.push(
      ...parsed.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        ...diagnosticScope(document, scopeId),
        objectId: node.id,
      })),
    );
    for (const declaration of parsed.declarations) {
      const property = normalizeSupportedProperty(declaration.property);
      if (property === undefined) {
        diagnostics.push(
          objectDiagnostic(
            "VECTOR180-PROFILE-CSS-PROPERTY",
            `Object "${node.id}" inline style uses unsupported property "${declaration.property}".`,
            document,
            scopeId,
            node,
            "style",
          ),
        );
        continue;
      }
      const result = parseStyleValue(property, declaration.expression);
      if (!result.ok) {
        diagnostics.push(
          objectDiagnostic(
            result.code,
            `Object "${node.id}" inline property "${property}" ${result.message}.`,
            document,
            scopeId,
            node,
            "style",
          ),
        );
        continue;
      }
      candidates.set(property, {
        value: result.value,
        provenance: {
          origin: "inline-style",
          expression: declaration.expression,
          sourceRange: range,
        },
      });
    }
  }

  if (
    node.role === "text" &&
    (!candidates.has("font-family") || !candidates.has("font-size"))
  ) {
    const missing = [
      ...(candidates.has("font-family") ? [] : ["font-family"]),
      ...(candidates.has("font-size") ? [] : ["font-size"]),
    ];
    diagnostics.push(
      objectDiagnostic(
        "VECTOR180-PROFILE-FONT",
        `Text object "${node.id}" has no explicit resolved ${missing.join(" or ")}.`,
        document,
        scopeId,
        node,
      ),
    );
  }

  return candidatesToPublic(candidates);
}

function tokenPattern(wireFamily: VisualWireFamily): RegExp {
  const escaped = escapeRegExp(wireCssTokenPrefix(wireFamily));
  return new RegExp(`^${escaped}[A-Za-z0-9_-]+$`, "u");
}

function tokenVarPattern(wireFamily: VisualWireFamily): RegExp {
  const escaped = escapeRegExp(wireCssTokenPrefix(wireFamily));
  return new RegExp(String.raw`^var\(\s*(${escaped}[A-Za-z0-9_-]+)\s*\)$`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseStylesheet(
  cssText: string,
  range: SourceRange,
  label: string,
): ParsedStylesheet {
  const cleaned = cleanCss(cssText, range, label);
  if (cleaned.text === undefined) {
    return { rules: [], diagnostics: cleaned.diagnostics };
  }

  const diagnostics: Diagnostic[] = [...cleaned.diagnostics];
  const rules: RawRule[] = [];
  let offset = 0;
  while (offset < cleaned.text.length) {
    offset = skipWhitespace(cleaned.text, offset);
    if (offset >= cleaned.text.length) break;
    const opening = findTopLevel(cleaned.text, offset, "{", "}");
    if (opening.kind !== "found" || opening.character !== "{") {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} has text outside a complete rule.`,
          range,
        ),
      );
      break;
    }
    const selector = cleaned.text.slice(offset, opening.offset).trim();
    if (selector === "") {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains an empty selector.`,
          range,
        ),
      );
    }

    const closing = findRuleClose(cleaned.text, opening.offset + 1);
    if (closing.kind !== "found") {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains an unterminated or nested rule block.`,
          range,
        ),
      );
      break;
    }
    const declarationText = cleaned.text.slice(
      opening.offset + 1,
      closing.offset,
    );
    const parsed = parseDeclarationList(declarationText, range, label);
    diagnostics.push(...parsed.diagnostics);
    rules.push({ selector, declarations: parsed.declarations });
    offset = closing.offset + 1;
  }

  return { rules, diagnostics };
}

function parseDeclarationList(
  text: string,
  range: SourceRange,
  label: string,
): {
  declarations: RawDeclaration[];
  diagnostics: Diagnostic[];
} {
  const cleaned = cleanCss(text, range, label);
  if (cleaned.text === undefined) {
    return { declarations: [], diagnostics: cleaned.diagnostics };
  }
  const diagnostics = [...cleaned.diagnostics];
  const split = splitTopLevel(cleaned.text, ";");
  if (!split.ok) {
    diagnostics.push(
      makeDiagnostic(
        "VECTOR180-PROFILE-CSS-SYNTAX",
        `${capitalize(label)} contains unbalanced CSS syntax.`,
        range,
      ),
    );
    return { declarations: [], diagnostics };
  }

  const declarations: RawDeclaration[] = [];
  for (const segment of split.parts) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;
    if (trimmed.includes("{") || trimmed.includes("}")) {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains a nested rule.`,
          range,
        ),
      );
      continue;
    }
    const colon = findDelimiter(trimmed, ":");
    if (colon < 0) {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains a declaration without a colon.`,
          range,
        ),
      );
      continue;
    }
    const property = trimmed.slice(0, colon).trim();
    const expression = trimmed.slice(colon + 1).trim();
    if (property === "" || expression === "") {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains an empty property or value.`,
          range,
        ),
      );
      continue;
    }
    if (/\s/u.test(property)) {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} contains malformed property "${property}".`,
          range,
        ),
      );
      continue;
    }
    declarations.push({ property, expression });
  }
  return { declarations, diagnostics };
}

function cleanCss(
  input: string,
  range: SourceRange,
  label: string,
): { text?: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let output = "";
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === "\\") {
      diagnostics.push(
        makeDiagnostic(
          "VECTOR180-PROFILE-CSS-SYNTAX",
          `${capitalize(label)} uses a CSS escape, which is outside the C6 grammar.`,
          range,
        ),
      );
      return { diagnostics };
    }
    if (quote !== undefined) {
      output += character;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = input.indexOf("*/", index + 2);
      if (end < 0) {
        diagnostics.push(
          makeDiagnostic(
            "VECTOR180-PROFILE-CSS-SYNTAX",
            `${capitalize(label)} contains an unterminated comment.`,
            range,
          ),
        );
        return { diagnostics };
      }
      output += " ";
      index = end + 1;
      continue;
    }
    output += character;
  }

  if (quote !== undefined) {
    diagnostics.push(
      makeDiagnostic(
        "VECTOR180-PROFILE-CSS-SYNTAX",
        `${capitalize(label)} contains an unterminated string.`,
        range,
      ),
    );
    return { diagnostics };
  }
  return { text: output, diagnostics };
}

function findTopLevel(
  text: string,
  start: number,
  wanted: string,
  competing: string,
): { kind: "found"; offset: number; character: string } | { kind: "missing" } {
  let quote: "'" | '"' | undefined;
  let parentheses = 0;
  for (let offset = start; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    if (
      parentheses === 0 &&
      (character === wanted || character === competing)
    ) {
      return { kind: "found", offset, character };
    }
    if (parentheses < 0) return { kind: "missing" };
  }
  return { kind: "missing" };
}

function findRuleClose(
  text: string,
  start: number,
): { kind: "found"; offset: number } | { kind: "missing" } {
  let quote: "'" | '"' | undefined;
  let parentheses = 0;
  for (let offset = start; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "{" && parentheses === 0) return { kind: "missing" };
    else if (character === "}" && parentheses === 0)
      return { kind: "found", offset };
    if (parentheses < 0) return { kind: "missing" };
  }
  return { kind: "missing" };
}

function splitTopLevel(
  text: string,
  delimiter: string,
): { ok: true; parts: string[] } | { ok: false } {
  const parts: string[] = [];
  let start = 0;
  let quote: "'" | '"' | undefined;
  let parentheses = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === delimiter && parentheses === 0) {
      parts.push(text.slice(start, offset));
      start = offset + 1;
    }
    if (parentheses < 0) return { ok: false };
  }
  if (quote !== undefined || parentheses !== 0) return { ok: false };
  parts.push(text.slice(start));
  return { ok: true, parts };
}

function findDelimiter(text: string, delimiter: string): number {
  let quote: "'" | '"' | undefined;
  let parentheses = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === delimiter && parentheses === 0) return offset;
  }
  return -1;
}

function parseStyleValue(
  property: CssProperty,
  rawExpression: string,
):
  | { ok: true; value: StyleValue }
  | { ok: false; code: string; message: string } {
  const expression = rawExpression.trim();
  if (expression === "") {
    return invalidValue("has an empty value");
  }
  if (/!\s*important\b/iu.test(expression)) {
    return invalidValue("uses !important");
  }
  if (
    CSS_WIDE_KEYWORDS.has(expression.toLowerCase()) ||
    /\b(?:calc|url|var)\s*\(/iu.test(expression)
  ) {
    return invalidValue(`uses unsupported value "${expression}"`);
  }

  if (property === "fill" || property === "stroke") {
    if (expression.toLowerCase() === "none") return { ok: true, value: "none" };
    if (HEX_PAINT_PATTERN.test(expression)) {
      return { ok: true, value: expression.toLowerCase() };
    }
    return invalidValue(
      `must be none or one opaque #RRGGBB color, found "${expression}"`,
    );
  }

  if (property === "stroke-width" || property === "font-size") {
    const match = CSS_DIMENSION_PATTERN.exec(expression);
    const numeric = match?.[1];
    if (numeric === undefined) {
      return invalidValue(
        `must be a finite ${property === "font-size" ? "positive" : "nonnegative"} number with no unit or px`,
      );
    }
    const parsed = Number(numeric);
    if (
      !Number.isFinite(parsed) ||
      (property === "font-size" ? parsed <= 0 : parsed < 0)
    ) {
      return invalidValue(
        `must be a finite ${property === "font-size" ? "positive" : "nonnegative"} number`,
      );
    }
    return { ok: true, value: normalizeZero(parsed) };
  }

  if (property === "opacity") {
    if (!CSS_NUMBER_PATTERN.test(expression)) {
      return invalidValue("must be a unitless number in [0,1]");
    }
    const parsed = Number(expression);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      return invalidValue("must be a finite number in [0,1]");
    }
    return { ok: true, value: normalizeZero(parsed) };
  }

  if (property === "font-family") {
    const family = parseConcreteFontFamily(expression);
    if (family === undefined) {
      return {
        ok: false,
        code: "VECTOR180-PROFILE-FONT",
        message: `must be one concrete family with no fallback list, found "${expression}"`,
      };
    }
    return { ok: true, value: family };
  }

  if (property === "font-weight") {
    if (expression === "400") return { ok: true, value: 400 };
    if (expression === "700") return { ok: true, value: 700 };
    return {
      ok: false,
      code: "VECTOR180-PROFILE-FONT",
      message: `must be exactly 400 or 700, found "${expression}"`,
    };
  }

  if (property === "font-style") {
    const normalized = expression.toLowerCase();
    if (normalized === "normal" || normalized === "italic") {
      return { ok: true, value: normalized };
    }
    return {
      ok: false,
      code: "VECTOR180-PROFILE-FONT",
      message: `must be normal or italic, found "${expression}"`,
    };
  }

  const normalized = expression.toLowerCase();
  if (
    normalized === "start" ||
    normalized === "middle" ||
    normalized === "end"
  ) {
    return { ok: true, value: normalized };
  }
  return invalidValue(`must be start, middle, or end, found "${expression}"`);
}

function parseConcreteFontFamily(expression: string): string | undefined {
  let family: string;
  if (
    (expression.startsWith('"') && expression.endsWith('"')) ||
    (expression.startsWith("'") && expression.endsWith("'"))
  ) {
    family = expression.slice(1, -1);
    if (
      family === "" ||
      /[\r\n\\]/u.test(family) ||
      family.includes(expression[0] ?? "")
    ) {
      return undefined;
    }
  } else {
    if (
      expression.includes(",") ||
      !/^-?[_A-Za-z][_A-Za-z0-9-]*(?:\s+-?[_A-Za-z][_A-Za-z0-9-]*)*$/u.test(
        expression,
      )
    ) {
      return undefined;
    }
    family = expression.replace(/\s+/gu, " ");
  }
  if (GENERIC_FONT_FAMILIES.has(family.toLowerCase())) return undefined;
  return family;
}

function prohibitedThemeTokenReason(expression: string): string | undefined {
  const value = expression.trim();
  if (value === "") return "has an empty value";
  if (/!\s*important\b/iu.test(value)) return "uses !important";
  if (/\bvar\s*\(/iu.test(value))
    return "must be a literal and cannot reference another token";
  if (/\b(?:calc|url)\s*\(/iu.test(value))
    return "uses a prohibited CSS function";
  if (CSS_WIDE_KEYWORDS.has(value.toLowerCase()))
    return "uses an inheritance or CSS-wide keyword";
  return undefined;
}

function normalizeSupportedProperty(property: string): CssProperty | undefined {
  const normalized = property.toLowerCase();
  return CSS_PROPERTY_SET.has(normalized)
    ? (normalized as CssProperty)
    : undefined;
}

function defaultCandidate(value: StyleValue): StyleCandidate {
  return {
    value,
    provenance: {
      origin: "default",
      expression: String(value),
    },
  };
}

function defaultCandidates(): Map<CssProperty, StyleCandidate> {
  return new Map<CssProperty, StyleCandidate>(
    Object.entries(DEFAULTS) as Array<[CssProperty, StyleCandidate]>,
  );
}

function candidatesToPublic(
  candidates: ReadonlyMap<CssProperty, StyleCandidate>,
): Vector180ResolvedObjectStyle {
  const fill = requiredCandidate(candidates, "fill");
  const stroke = requiredCandidate(candidates, "stroke");
  const strokeWidth = requiredCandidate(candidates, "stroke-width");
  const opacity = requiredCandidate(candidates, "opacity");
  const fontWeight = requiredCandidate(candidates, "font-weight");
  const fontStyle = requiredCandidate(candidates, "font-style");
  const textAnchor = requiredCandidate(candidates, "text-anchor");
  const fontFamily = candidates.get("font-family");
  const fontSize = candidates.get("font-size");

  return {
    style: {
      fill: fill.value as string,
      stroke: stroke.value as string,
      strokeWidth: strokeWidth.value as number,
      opacity: opacity.value as number,
      ...(fontFamily === undefined
        ? {}
        : { fontFamily: fontFamily.value as string }),
      ...(fontSize === undefined ? {} : { fontSize: fontSize.value as number }),
      fontWeight: fontWeight.value as 400 | 700,
      fontStyle: fontStyle.value as "normal" | "italic",
      textAnchor: textAnchor.value as "start" | "middle" | "end",
    },
    styleProvenance: {
      fill: fill.provenance,
      stroke: stroke.provenance,
      strokeWidth: strokeWidth.provenance,
      opacity: opacity.provenance,
      ...(fontFamily === undefined
        ? {}
        : { fontFamily: fontFamily.provenance }),
      ...(fontSize === undefined ? {} : { fontSize: fontSize.provenance }),
      fontWeight: fontWeight.provenance,
      fontStyle: fontStyle.provenance,
      textAnchor: textAnchor.provenance,
    },
  };
}

function requiredCandidate(
  candidates: ReadonlyMap<CssProperty, StyleCandidate>,
  property: CssProperty,
): StyleCandidate {
  const candidate = candidates.get(property);
  if (candidate === undefined) {
    throw new Error(`Internal Vector180 style default missing for ${property}`);
  }
  return candidate;
}

function getAttribute(node: Vector180Node, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(node.attributes).find(
    ([candidate]) => candidate.toLowerCase() === lowerName,
  );
  return entry?.[1];
}

function attributeRange(
  document: Vector180StyleDocument,
  node: Vector180Node,
  name: string,
): SourceRange | undefined {
  const ranges = document.index.objects.get(node.id)?.attributeRanges;
  if (ranges === undefined) return undefined;
  const lowerName = name.toLowerCase();
  for (const [candidate, range] of ranges) {
    if (candidate.toLowerCase() === lowerName) return range;
  }
  return undefined;
}

function objectDiagnostic(
  code: string,
  message: string,
  document: Vector180StyleDocument,
  scopeId: string,
  node: Vector180Node,
  attribute?: string,
): Diagnostic {
  return {
    ...makeDiagnostic(
      code,
      message,
      attribute === undefined
        ? node.sourceRange
        : (attributeRange(document, node, attribute) ?? node.openTagRange),
    ),
    ...diagnosticScope(document, scopeId),
    objectId: node.id,
  };
}

function diagnosticScope(
  document: Vector180StyleDocument,
  scopeId: string,
): Pick<Diagnostic, "slideId" | "atomId"> {
  return document.sourceKind === "html"
    ? { slideId: scopeId }
    : { atomId: scopeId };
}

function makeDiagnostic(
  code: string,
  message: string,
  range?: SourceRange,
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(range === undefined ? {} : { range }),
  };
}

function invalidValue(message: string): {
  ok: false;
  code: string;
  message: string;
} {
  return { ok: false, code: "VECTOR180-PROFILE-CSS-VALUE", message };
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function skipWhitespace(text: string, offset: number): number {
  let result = offset;
  while (result < text.length && /\s/u.test(text[result] ?? "")) result += 1;
  return result;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
