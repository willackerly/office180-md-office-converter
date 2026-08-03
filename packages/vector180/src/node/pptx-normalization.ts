/**
 * Narrow, proof-carrying PowerPoint package-save normalization.
 *
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0
 *
 * These rules are structural predicates. Producer metadata is evidence only
 * and never selects or weakens a rule.
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";

import { SaxesParser, type SaxesTagNS } from "saxes";

const CONTENT_TYPES =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const PACKAGE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PRESENTATION =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const POWERPOINT_2010 =
  "http://schemas.microsoft.com/office/powerpoint/2010/main";
const POWERPOINT_2012 =
  "http://schemas.microsoft.com/office/powerpoint/2012/main";
const XMLNS = "http://www.w3.org/2000/xmlns/";

const VIEW_PROPERTIES_PART = "ppt/viewProps.xml";
const TABLE_STYLES_PART = "ppt/tableStyles.xml";
const VIEW_PROPERTIES_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";
const TABLE_STYLES_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml";
const VIEW_PROPERTIES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps";
const TABLE_STYLES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles";
const DEFAULT_TABLE_STYLE = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";

export type PptxNormalizationRuleId =
  | "vector180-c10/content-type-set/1"
  | "vector180-c10/relationship-graph/1"
  | "vector180-c10/relationship-reference/1"
  | "vector180-c10/view-properties-inert/1"
  | "vector180-c10/table-styles-inert/1"
  | "vector180-c10/slide-size-preset-omitted/1"
  | "vector180-c10/root-zero-group-transform/1"
  | "vector180-c10/theme-empty-defaults/1"
  | "vector180-c10/presentation-property-defaults/1"
  | "vector180-c10/generated-metadata/1";

export interface PptxNormalizationPredicate {
  readonly name: string;
  readonly passed: true;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface PptxNormalizationEvidence {
  readonly ruleId: PptxNormalizationRuleId;
  readonly partName: string;
  readonly occurrenceCount: number;
  readonly semanticScope:
    | "package-graph"
    | "current-slide-content"
    | "current-rendered-content"
    | "non-authoritative-metadata";
  readonly message: string;
  readonly predicates: readonly PptxNormalizationPredicate[];
}

export interface PptxPackageNormalizationInput {
  readonly parts: Readonly<Record<string, string>>;
  readonly expectedPartNames: readonly string[];
}

export interface PptxPackageNormalizationResult {
  readonly semanticPartNames: readonly string[];
  readonly rawPartSignatures: Readonly<Record<string, string>>;
  readonly semanticPartSignatures: Readonly<Record<string, string>>;
  readonly partSha256: Readonly<Record<string, string>>;
  readonly normalizations: readonly PptxNormalizationEvidence[];
}

interface XmlText {
  readonly kind: "text";
  readonly value: string;
}

interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

type XmlNode = XmlElement | XmlText;

interface Relationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly targetMode: "Internal" | "External";
  readonly resolvedTarget: string;
}

interface OptionalPart {
  readonly partName: string;
  readonly contentType: string;
  readonly relationshipType: string;
  readonly ruleId:
    | "vector180-c10/view-properties-inert/1"
    | "vector180-c10/table-styles-inert/1";
}

const OPTIONAL_PARTS: readonly OptionalPart[] = [
  {
    partName: VIEW_PROPERTIES_PART,
    contentType: VIEW_PROPERTIES_CONTENT_TYPE,
    relationshipType: VIEW_PROPERTIES_RELATIONSHIP,
    ruleId: "vector180-c10/view-properties-inert/1",
  },
  {
    partName: TABLE_STYLES_PART,
    contentType: TABLE_STYLES_CONTENT_TYPE,
    relationshipType: TABLE_STYLES_RELATIONSHIP,
    ruleId: "vector180-c10/table-styles-inert/1",
  },
];

export function normalizePptxPackage(
  input: PptxPackageNormalizationInput,
): PptxPackageNormalizationResult {
  const roots = new Map<string, XmlElement>();
  const rawPartSignatures: Record<string, string> = {};
  const partSha256: Record<string, string> = {};
  for (const [name, text] of Object.entries(input.parts)) {
    const root = parseXml(text, name);
    roots.set(name, root);
    rawPartSignatures[name] = signature(root);
    partSha256[name] = sha256Text(text);
  }

  const relationshipParts = new Map<string, readonly Relationship[]>();
  for (const [name, root] of roots) {
    if (!name.endsWith(".rels")) continue;
    relationshipParts.set(name, inspectRelationships(name, root));
  }

  const contentTypesRoot = roots.get("[Content_Types].xml");
  if (contentTypesRoot === undefined) {
    throw new Error('PPTX package lacks "[Content_Types].xml".');
  }
  const contentTypes = inspectContentTypes(contentTypesRoot);
  const presentationRelationships =
    relationshipParts.get("ppt/_rels/presentation.xml.rels") ?? [];
  const hasAffectedContent = [...roots.entries()].some(
    ([name, root]) =>
      name.startsWith("ppt/media/") ||
      name.startsWith("ppt/charts/") ||
      containsElement(root, PRESENTATION, "pic") ||
      containsElement(root, PRESENTATION, "graphicFrame") ||
      containsElement(root, DRAWING, "tbl"),
  );

  const acceptedOptionalParts = new Set<string>();
  const normalizations: PptxNormalizationEvidence[] = [];
  for (const candidate of OPTIONAL_PARTS) {
    const root = roots.get(candidate.partName);
    if (root === undefined) continue;
    if (
      contentTypes.overrides.get(`/${candidate.partName}`) !==
        candidate.contentType ||
      presentationRelationships.filter(
        (relationship) =>
          relationship.type === candidate.relationshipType &&
          relationship.targetMode === "Internal" &&
          relationship.resolvedTarget === candidate.partName,
      ).length !== 1
    ) {
      continue;
    }
    const valid =
      candidate.partName === VIEW_PROPERTIES_PART
        ? validViewProperties(root)
        : !hasAffectedContent && validTableStyles(root);
    if (!valid) continue;
    acceptedOptionalParts.add(candidate.partName);
    normalizations.push({
      ruleId: candidate.ruleId,
      partName: candidate.partName,
      occurrenceCount: 1,
      semanticScope: "current-slide-content",
      message:
        candidate.partName === VIEW_PROPERTIES_PART
          ? "Strictly bounded PowerPoint view state does not change slide content."
          : "The exact empty default table-style list is inert because the package contains no tables or graphic frames.",
      predicates: Object.freeze([
        {
          name: "content-type",
          passed: true,
          expected: candidate.contentType,
          actual: candidate.contentType,
        },
        {
          name: "internal-relationship",
          passed: true,
          expected: candidate.relationshipType,
          actual: candidate.relationshipType,
        },
        ...(candidate.partName === TABLE_STYLES_PART
          ? [
              {
                name: "no-table-or-graphic-frame-content",
                passed: true as const,
                expected: false,
                actual: false,
              },
            ]
          : []),
      ]),
    });
  }

  const semanticPartNames = Object.keys(input.parts)
    .filter((name) => !acceptedOptionalParts.has(name))
    .sort(compareText);
  const semanticPartSignatures: Record<string, string> = {};
  for (const name of semanticPartNames) {
    const root = cloneElement(roots.get(name)!);
    const applied: PptxNormalizationEvidence[] = [];
    let normalized: unknown;

    if (name === "[Content_Types].xml") {
      normalized = normalizedContentTypes(root, acceptedOptionalParts, applied);
    } else if (name.endsWith(".rels")) {
      normalized = normalizedRelationships(
        name,
        root,
        acceptedOptionalParts,
        applied,
      );
    } else {
      replaceRelationshipReferences(name, root, relationshipParts, applied);
      normalizeSlideSize(name, root, applied);
      normalizeRootZeroGroupTransform(name, root, applied);
      normalizeThemeDefaults(name, root, applied);
      normalizePresentationDefaults(name, root, hasAffectedContent, applied);
      if (name === "docProps/app.xml" || name === "docProps/core.xml") {
        applied.push({
          ruleId: "vector180-c10/generated-metadata/1",
          partName: name,
          occurrenceCount: 1,
          semanticScope: "non-authoritative-metadata",
          message:
            "Generated Office metadata is recorded but is not canonical Vector180 source authority.",
          predicates: Object.freeze([
            {
              name: "known-generated-metadata-part",
              passed: true,
              expected: name,
              actual: name,
            },
          ]),
        });
      }
      normalized = normalizedNode(root);
    }
    semanticPartSignatures[name] = JSON.stringify(normalized);
    normalizations.push(...applied);
  }

  return {
    semanticPartNames: Object.freeze(semanticPartNames),
    rawPartSignatures: Object.freeze(rawPartSignatures),
    semanticPartSignatures: Object.freeze(semanticPartSignatures),
    partSha256: Object.freeze(partSha256),
    normalizations: Object.freeze(
      normalizations.sort((left, right) =>
        compareText(
          `${left.partName}\0${left.ruleId}`,
          `${right.partName}\0${right.ruleId}`,
        ),
      ),
    ),
  };
}

function inspectContentTypes(root: XmlElement): {
  readonly defaults: ReadonlyMap<string, string>;
  readonly overrides: ReadonlyMap<string, string>;
} {
  if (root.name !== expanded(CONTENT_TYPES, "Types")) {
    throw new Error("Content-types part has the wrong root element.");
  }
  requireOnlyAttributes(root, []);
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();
  for (const child of elementChildren(root)) {
    if (child.name === expanded(CONTENT_TYPES, "Default")) {
      requireOnlyAttributes(child, ["Extension", "ContentType"]);
      const extension = requiredAttribute(child, "Extension");
      const contentType = requiredAttribute(child, "ContentType");
      if (child.children.length !== 0 || defaults.has(extension)) {
        throw new Error(
          "Content-types part has a duplicate or non-empty Default.",
        );
      }
      defaults.set(extension, contentType);
      continue;
    }
    if (child.name === expanded(CONTENT_TYPES, "Override")) {
      requireOnlyAttributes(child, ["PartName", "ContentType"]);
      const partName = requiredAttribute(child, "PartName");
      const contentType = requiredAttribute(child, "ContentType");
      if (
        child.children.length !== 0 ||
        !partName.startsWith("/") ||
        overrides.has(partName)
      ) {
        throw new Error(
          "Content-types part has an unsafe, duplicate, or non-empty Override.",
        );
      }
      overrides.set(partName, contentType);
      continue;
    }
    throw new Error("Content-types part has an unsupported child.");
  }
  return { defaults, overrides };
}

function normalizedContentTypes(
  root: XmlElement,
  acceptedOptionalParts: ReadonlySet<string>,
  applied: PptxNormalizationEvidence[],
): unknown {
  const inspected = inspectContentTypes(root);
  const defaults = [...inspected.defaults.entries()].sort(entryCompare);
  const overrides = [...inspected.overrides.entries()]
    .filter(([partName]) => !acceptedOptionalParts.has(partName.slice(1)))
    .sort(entryCompare);
  applied.push({
    ruleId: "vector180-c10/content-type-set/1",
    partName: "[Content_Types].xml",
    occurrenceCount: defaults.length + overrides.length,
    semanticScope: "package-graph",
    message:
      "Content type declarations are a duplicate-free semantic set; declaration order is incidental.",
    predicates: Object.freeze([
      {
        name: "duplicate-free-declarations",
        passed: true,
        expected: true,
        actual: true,
      },
    ]),
  });
  return ["content-types", defaults, overrides];
}

function inspectRelationships(
  relationshipPartName: string,
  root: XmlElement,
): readonly Relationship[] {
  if (root.name !== expanded(PACKAGE_RELATIONSHIPS, "Relationships")) {
    throw new Error(
      `Relationship part "${relationshipPartName}" has the wrong root.`,
    );
  }
  requireOnlyAttributes(root, []);
  const source = sourcePartForRelationships(relationshipPartName);
  const ids = new Set<string>();
  return Object.freeze(
    elementChildren(root).map((child) => {
      if (child.name !== expanded(PACKAGE_RELATIONSHIPS, "Relationship")) {
        throw new Error(
          `Relationship part "${relationshipPartName}" has an unsupported child.`,
        );
      }
      requireOnlyAttributes(child, ["Id", "Type", "Target", "TargetMode"]);
      if (child.children.length !== 0) {
        throw new Error(
          `Relationship part "${relationshipPartName}" has a non-empty relationship.`,
        );
      }
      const id = requiredAttribute(child, "Id");
      const type = requiredAttribute(child, "Type");
      const target = requiredAttribute(child, "Target");
      const rawMode = attribute(child, "TargetMode");
      const targetMode: Relationship["targetMode"] | undefined =
        rawMode === undefined || rawMode === "Internal"
          ? "Internal"
          : rawMode === "External"
            ? "External"
            : undefined;
      if (targetMode === undefined || ids.has(id)) {
        throw new Error(
          `Relationship part "${relationshipPartName}" has a duplicate ID or invalid target mode.`,
        );
      }
      ids.add(id);
      return {
        id,
        type,
        target,
        targetMode,
        resolvedTarget:
          targetMode === "External"
            ? target
            : resolveRelationshipTarget(source, target),
      };
    }),
  );
}

function normalizedRelationships(
  relationshipPartName: string,
  root: XmlElement,
  acceptedOptionalParts: ReadonlySet<string>,
  applied: PptxNormalizationEvidence[],
): unknown {
  const relationships = inspectRelationships(relationshipPartName, root)
    .filter(
      (relationship) =>
        !(
          relationshipPartName === "ppt/_rels/presentation.xml.rels" &&
          acceptedOptionalParts.has(relationship.resolvedTarget)
        ),
    )
    .map(relationshipKey)
    .sort(compareText);
  applied.push({
    ruleId: "vector180-c10/relationship-graph/1",
    partName: relationshipPartName,
    occurrenceCount: relationships.length,
    semanticScope: "package-graph",
    message:
      "Relationship IDs and declaration order are incidental after every internal target is safely resolved.",
    predicates: Object.freeze([
      {
        name: "unique-relationship-ids",
        passed: true,
        expected: true,
        actual: true,
      },
      {
        name: "resolved-internal-targets",
        passed: true,
        expected: true,
        actual: true,
      },
    ]),
  });
  return ["relationships", relationships];
}

function replaceRelationshipReferences(
  partName: string,
  root: XmlElement,
  relationshipParts: ReadonlyMap<string, readonly Relationship[]>,
  applied: PptxNormalizationEvidence[],
): void {
  const relationships =
    relationshipParts.get(relationshipsPartForSource(partName)) ?? [];
  const byId = new Map(
    relationships.map((relationship) => [relationship.id, relationship]),
  );
  let count = 0;
  visitElements(root, (element) => {
    const key = expanded(OFFICE_RELATIONSHIPS, "id");
    const id = element.attributes[key];
    if (id === undefined) return;
    const relationship = byId.get(id);
    if (relationship === undefined) return;
    element.attributes[key] = relationshipKey(relationship);
    count += 1;
  });
  if (count === 0) return;
  applied.push({
    ruleId: "vector180-c10/relationship-reference/1",
    partName,
    occurrenceCount: count,
    semanticScope: "package-graph",
    message:
      "Relationship references are canonicalized to their type, mode, and resolved target rather than incidental rId values.",
    predicates: Object.freeze([
      {
        name: "every-canonicalized-reference-resolves",
        passed: true,
        expected: true,
        actual: true,
      },
    ]),
  });
}

function normalizeSlideSize(
  partName: string,
  root: XmlElement,
  applied: PptxNormalizationEvidence[],
): void {
  if (partName !== "ppt/presentation.xml") return;
  const sizes = directElements(root, PRESENTATION, "sldSz");
  if (sizes.length !== 1) return;
  const size = sizes[0]!;
  if (
    attribute(size, "cx") !== "12192000" ||
    attribute(size, "cy") !== "6858000"
  ) {
    return;
  }
  const type = attribute(size, "type");
  if (type === "screen16x9") return;
  if (type !== undefined) return;
  size.attributes[expanded("", "type")] = "screen16x9";
  applied.push({
    ruleId: "vector180-c10/slide-size-preset-omitted/1",
    partName,
    occurrenceCount: 1,
    semanticScope: "current-slide-content",
    message:
      "The optional 16:9 preset label was omitted while the exact C9 slide extents remained unchanged.",
    predicates: Object.freeze([
      {
        name: "slide-width-emu",
        passed: true,
        expected: 12_192_000,
        actual: 12_192_000,
      },
      {
        name: "slide-height-emu",
        passed: true,
        expected: 6_858_000,
        actual: 6_858_000,
      },
    ]),
  });
}

function normalizeRootZeroGroupTransform(
  partName: string,
  root: XmlElement,
  applied: PptxNormalizationEvidence[],
): void {
  if (
    partName !== "ppt/slides/slide1.xml" &&
    partName !== "ppt/slideLayouts/slideLayout1.xml" &&
    partName !== "ppt/slideMasters/slideMaster1.xml"
  ) {
    return;
  }
  const commonSlideData = directElements(root, PRESENTATION, "cSld");
  if (commonSlideData.length !== 1) return;
  const shapeTrees = directElements(
    commonSlideData[0]!,
    PRESENTATION,
    "spTree",
  );
  if (shapeTrees.length !== 1) return;
  const groupProperties = directElements(
    shapeTrees[0]!,
    PRESENTATION,
    "grpSpPr",
  );
  if (groupProperties.length !== 1) return;
  const properties = groupProperties[0]!;
  const transforms = directElements(properties, DRAWING, "xfrm");
  if (
    transforms.length !== 1 ||
    properties.children.length !== 1 ||
    !exactZeroRootTransform(transforms[0]!)
  ) {
    return;
  }
  properties.children = [];
  applied.push({
    ruleId: "vector180-c10/root-zero-group-transform/1",
    partName,
    occurrenceCount: 1,
    semanticScope: "current-slide-content",
    message:
      "An exact all-zero root shape-tree transform is equivalent to the absent C9 root transform.",
    predicates: Object.freeze([
      {
        name: "all-root-transform-values-zero",
        passed: true,
        expected: true,
        actual: true,
      },
      {
        name: "no-rotation-flip-or-extra-content",
        passed: true,
        expected: true,
        actual: true,
      },
    ]),
  });
}

function normalizeThemeDefaults(
  partName: string,
  root: XmlElement,
  applied: PptxNormalizationEvidence[],
): void {
  if (partName !== "ppt/theme/theme1.xml") return;
  const removable = new Set([
    expanded(DRAWING, "objectDefaults"),
    expanded(DRAWING, "extraClrSchemeLst"),
  ]);
  const matches = elementChildren(root).filter(
    (child) =>
      removable.has(child.name) &&
      Object.keys(child.attributes).length === 0 &&
      child.children.length === 0,
  );
  if (matches.length === 0) return;
  root.children = root.children.filter(
    (child) => child.kind !== "element" || !matches.includes(child),
  );
  applied.push({
    ruleId: "vector180-c10/theme-empty-defaults/1",
    partName,
    occurrenceCount: matches.length,
    semanticScope: "current-rendered-content",
    message:
      "Exact empty theme default containers add no current theme behavior.",
    predicates: Object.freeze([
      {
        name: "empty-attribute-free-containers",
        passed: true,
        expected: matches.length,
        actual: matches.length,
      },
    ]),
  });
}

function normalizePresentationDefaults(
  partName: string,
  root: XmlElement,
  hasAffectedContent: boolean,
  applied: PptxNormalizationEvidence[],
): void {
  if (
    partName !== "ppt/presProps.xml" ||
    hasAffectedContent ||
    !exactPresentationDefaults(root)
  ) {
    return;
  }
  root.children = [];
  applied.push({
    ruleId: "vector180-c10/presentation-property-defaults/1",
    partName,
    occurrenceCount: 3,
    semanticScope: "current-slide-content",
    message:
      "The exact Office image/chart defaults are inert because the current package contains no image, chart, table, or graphic-frame content.",
    predicates: Object.freeze([
      {
        name: "exact-known-defaults",
        passed: true,
        expected: 3,
        actual: 3,
      },
      {
        name: "no-affected-content",
        passed: true,
        expected: false,
        actual: false,
      },
    ]),
  });
}

function validTableStyles(root: XmlElement): boolean {
  return (
    root.name === expanded(DRAWING, "tblStyleLst") &&
    Object.keys(root.attributes).length === 1 &&
    attribute(root, "def") === DEFAULT_TABLE_STYLE &&
    root.children.length === 0
  );
}

function validViewProperties(root: XmlElement): boolean {
  if (
    root.name !== expanded(PRESENTATION, "viewPr") ||
    Object.keys(root.attributes).length !== 0
  ) {
    return false;
  }
  const children = elementChildren(root);
  if (
    children.length !== 4 ||
    children[0]?.name !== expanded(PRESENTATION, "normalViewPr") ||
    children[1]?.name !== expanded(PRESENTATION, "slideViewPr") ||
    children[2]?.name !== expanded(PRESENTATION, "notesTextViewPr") ||
    children[3]?.name !== expanded(PRESENTATION, "gridSpacing")
  ) {
    return false;
  }
  const normal = children[0]!;
  const normalChildren = elementChildren(normal);
  if (
    Object.keys(normal.attributes).length !== 0 ||
    normalChildren.length !== 2 ||
    normalChildren[0]?.name !== expanded(PRESENTATION, "restoredLeft") ||
    normalChildren[1]?.name !== expanded(PRESENTATION, "restoredTop") ||
    !normalChildren.every(
      (child) =>
        onlyAttributes(child, ["sz"]) &&
        boundedInteger(attribute(child, "sz"), 0, 100_000) &&
        child.children.length === 0,
    )
  ) {
    return false;
  }
  const slide = children[1]!;
  const slideChildren = elementChildren(slide);
  if (
    Object.keys(slide.attributes).length !== 0 ||
    slideChildren.length !== 1 ||
    slideChildren[0]?.name !== expanded(PRESENTATION, "cSldViewPr")
  ) {
    return false;
  }
  const common = slideChildren[0]!;
  const commonChildren = elementChildren(common);
  if (
    !onlyAttributes(common, ["snapToGrid"]) ||
    !binaryOrAbsent(attribute(common, "snapToGrid")) ||
    commonChildren.length !== 2 ||
    commonChildren[0]?.name !== expanded(PRESENTATION, "cViewPr") ||
    commonChildren[1]?.name !== expanded(PRESENTATION, "guideLst") ||
    commonChildren[1]!.children.length !== 0 ||
    !validCommonView(commonChildren[0]!, true)
  ) {
    return false;
  }
  const notes = children[2]!;
  const noteChildren = elementChildren(notes);
  if (
    Object.keys(notes.attributes).length !== 0 ||
    noteChildren.length !== 1 ||
    noteChildren[0]?.name !== expanded(PRESENTATION, "cViewPr") ||
    !validCommonView(noteChildren[0]!, false)
  ) {
    return false;
  }
  const grid = children[3]!;
  return (
    onlyAttributes(grid, ["cx", "cy"]) &&
    positiveInteger(attribute(grid, "cx")) &&
    positiveInteger(attribute(grid, "cy")) &&
    grid.children.length === 0
  );
}

function validCommonView(
  root: XmlElement,
  allowVariableScale: boolean,
): boolean {
  if (
    !onlyAttributes(root, allowVariableScale ? ["varScale"] : []) ||
    (allowVariableScale && !binaryOrAbsent(attribute(root, "varScale")))
  ) {
    return false;
  }
  const children = elementChildren(root);
  if (
    children.length !== 2 ||
    children[0]?.name !== expanded(PRESENTATION, "scale") ||
    children[1]?.name !== expanded(PRESENTATION, "origin")
  ) {
    return false;
  }
  const scaleChildren = elementChildren(children[0]!);
  if (
    Object.keys(children[0]!.attributes).length !== 0 ||
    scaleChildren.length !== 2 ||
    scaleChildren[0]?.name !== expanded(DRAWING, "sx") ||
    scaleChildren[1]?.name !== expanded(DRAWING, "sy") ||
    !scaleChildren.every(
      (child) =>
        onlyAttributes(child, ["n", "d"]) &&
        positiveInteger(attribute(child, "n")) &&
        positiveInteger(attribute(child, "d")) &&
        child.children.length === 0,
    )
  ) {
    return false;
  }
  const origin = children[1]!;
  return (
    onlyAttributes(origin, ["x", "y"]) &&
    integer(attribute(origin, "x")) &&
    integer(attribute(origin, "y")) &&
    origin.children.length === 0
  );
}

function exactPresentationDefaults(root: XmlElement): boolean {
  if (
    root.name !== expanded(PRESENTATION, "presentationPr") ||
    Object.keys(root.attributes).length !== 0
  ) {
    return false;
  }
  const lists = directElements(root, PRESENTATION, "extLst");
  if (lists.length !== 1 || root.children.length !== 1) return false;
  const extensions = elementChildren(lists[0]!);
  const expected = [
    {
      uri: "{E76CE94A-603C-4142-B9EB-6D1370010A27}",
      child: expanded(POWERPOINT_2010, "discardImageEditData"),
      value: "0",
    },
    {
      uri: "{D31A062A-798A-4329-ABDD-BBA856620510}",
      child: expanded(POWERPOINT_2010, "defaultImageDpi"),
      value: "220",
    },
    {
      uri: "{FD5EFAAD-0ECE-453E-9831-46B23BE46B34}",
      child: expanded(POWERPOINT_2012, "chartTrackingRefBased"),
      value: "0",
    },
  ];
  return (
    extensions.length === expected.length &&
    extensions.every((extension, index) => {
      const specification = expected[index]!;
      const values = elementChildren(extension);
      return (
        extension.name === expanded(PRESENTATION, "ext") &&
        onlyAttributes(extension, ["uri"]) &&
        attribute(extension, "uri") === specification.uri &&
        values.length === 1 &&
        values[0]?.name === specification.child &&
        onlyAttributes(values[0], ["val"]) &&
        attribute(values[0], "val") === specification.value &&
        values[0]!.children.length === 0
      );
    })
  );
}

function exactZeroRootTransform(transform: XmlElement): boolean {
  if (Object.keys(transform.attributes).length !== 0) return false;
  const children = elementChildren(transform);
  const specification = [
    ["off", ["x", "y"]],
    ["ext", ["cx", "cy"]],
    ["chOff", ["x", "y"]],
    ["chExt", ["cx", "cy"]],
  ] as const;
  return (
    children.length === specification.length &&
    children.every((child, index) => {
      const [local, attributes] = specification[index]!;
      return (
        child.name === expanded(DRAWING, local) &&
        onlyAttributes(child, attributes) &&
        attributes.every((name) => attribute(child, name) === "0") &&
        child.children.length === 0
      );
    })
  );
}

function relationshipKey(relationship: Relationship): string {
  return [
    relationship.type,
    relationship.targetMode,
    relationship.resolvedTarget,
  ].join("\0");
}

function sourcePartForRelationships(relationshipPartName: string): string {
  if (relationshipPartName === "_rels/.rels") return "";
  const match = /^(.*)\/_rels\/([^/]+)\.rels$/u.exec(relationshipPartName);
  if (match === null) {
    throw new Error(
      `Relationship part "${relationshipPartName}" has no safe source part.`,
    );
  }
  return `${match[1]}/${match[2]}`;
}

function relationshipsPartForSource(sourcePartName: string): string {
  const directory = posix.dirname(sourcePartName);
  const base = posix.basename(sourcePartName);
  return `${directory}/_rels/${base}.rels`;
}

function resolveRelationshipTarget(source: string, target: string): string {
  if (
    target.length === 0 ||
    target.includes("\\") ||
    target.includes("?") ||
    target.includes("#")
  ) {
    throw new Error(`Unsafe relationship target "${target}".`);
  }
  const base = source.length === 0 ? "" : posix.dirname(source);
  const resolved = posix.normalize(
    target.startsWith("/") ? target.slice(1) : posix.join(base, target),
  );
  if (
    resolved.startsWith("../") ||
    resolved === ".." ||
    !safePartName(resolved)
  ) {
    throw new Error(`Relationship target "${target}" escapes the package.`);
  }
  return resolved;
}

function normalizedNode(node: XmlNode): unknown {
  return node.kind === "text"
    ? ["text", node.value]
    : [
        "element",
        node.name,
        Object.fromEntries(
          Object.entries(node.attributes).sort(([left], [right]) =>
            compareText(left, right),
          ),
        ),
        node.children.map(normalizedNode),
      ];
}

function signature(root: XmlElement): string {
  return JSON.stringify(normalizedNode(root));
}

function parseXml(text: string, partName: string): XmlElement {
  const parser = new SaxesParser({
    xmlns: true,
    fragment: false,
    defaultXMLVersion: "1.0",
  });
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  parser.on("doctype", () => {
    throw new Error(`PPTX XML part "${partName}" contains a forbidden DTD.`);
  });
  parser.on("opentag", (tag) => {
    const node: XmlElement = {
      kind: "element",
      name: expanded(tag.uri, tag.local),
      attributes: normalizedAttributes(tag),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent === undefined) {
      if (root !== undefined) {
        throw new Error(`PPTX XML part "${partName}" has multiple roots.`);
      }
      root = node;
    } else {
      parent.children.push(node);
    }
    stack.push(node);
  });
  parser.on("text", (value) => appendText(stack.at(-1), value));
  parser.on("cdata", (value) => appendText(stack.at(-1), value));
  parser.on("closetag", () => {
    stack.pop();
  });
  try {
    parser.write(text).close();
  } catch (error) {
    throw new Error(
      `PPTX XML part "${partName}" is invalid: ${errorMessage(error)}`,
    );
  }
  if (root === undefined || stack.length !== 0) {
    throw new Error(`PPTX XML part "${partName}" has no complete root.`);
  }
  return root;
}

function normalizedAttributes(tag: SaxesTagNS): Record<string, string> {
  return Object.fromEntries(
    Object.values(tag.attributes)
      .filter((value) => value.uri !== XMLNS)
      .map((value) => [expanded(value.uri, value.local), value.value] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
}

function appendText(parent: XmlElement | undefined, value: string): void {
  if (parent === undefined || value.trim().length === 0) return;
  const previous = parent.children.at(-1);
  if (previous?.kind === "text") {
    parent.children[parent.children.length - 1] = {
      kind: "text",
      value: previous.value + value,
    };
  } else {
    parent.children.push({ kind: "text", value });
  }
}

function cloneElement(element: XmlElement): XmlElement {
  return {
    kind: "element",
    name: element.name,
    attributes: { ...element.attributes },
    children: element.children.map((child) =>
      child.kind === "text" ? { ...child } : cloneElement(child),
    ),
  };
}

function visitElements(
  root: XmlElement,
  visit: (node: XmlElement) => void,
): void {
  visit(root);
  for (const child of root.children) {
    if (child.kind === "element") visitElements(child, visit);
  }
}

function containsElement(
  root: XmlElement,
  namespace: string,
  local: string,
): boolean {
  const name = expanded(namespace, local);
  let found = false;
  visitElements(root, (element) => {
    if (element.name === name) found = true;
  });
  return found;
}

function directElements(
  root: XmlElement,
  namespace: string,
  local: string,
): readonly XmlElement[] {
  const name = expanded(namespace, local);
  return root.children.filter(
    (child): child is XmlElement =>
      child.kind === "element" && child.name === name,
  );
}

function elementChildren(root: XmlElement): readonly XmlElement[] {
  return root.children.filter(
    (child): child is XmlElement => child.kind === "element",
  );
}

function requireOnlyAttributes(
  element: XmlElement,
  names: readonly string[],
): void {
  if (!onlyAttributes(element, names)) {
    throw new Error(`${element.name} has unsupported attributes.`);
  }
}

function onlyAttributes(
  element: XmlElement,
  names: readonly string[],
): boolean {
  const allowed = new Set(names.map((name) => expanded("", name)));
  const actual = Object.keys(element.attributes);
  return actual.every((name) => allowed.has(name));
}

function requiredAttribute(element: XmlElement, name: string): string {
  const value = attribute(element, name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${element.name} lacks required ${name}.`);
  }
  return value;
}

function attribute(element: XmlElement, name: string): string | undefined {
  return element.attributes[expanded("", name)];
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): boolean {
  return integer(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function positiveInteger(value: string | undefined): boolean {
  return integer(value) && Number(value) > 0;
}

function integer(value: string | undefined): boolean {
  return (
    value !== undefined &&
    /^-?(?:0|[1-9]\d*)$/u.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

function binaryOrAbsent(value: string | undefined): boolean {
  return value === undefined || value === "0" || value === "1";
}

function safePartName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    name
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function expanded(namespace: string, local: string): string {
  return `{${namespace}}${local}`;
}

function entryCompare(
  left: readonly [string, string],
  right: readonly [string, string],
): number {
  return compareText(`${left[0]}\0${left[1]}`, `${right[0]}\0${right[1]}`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
