/**
 * Fail-closed PPTX inspection for baseline-aware reconciliation.
 *
 * CONTRACT:C7-PPTX-CANARY.1.1
 * CONTRACT:C9-PPTV-PPTX-BASELINE.1.0
 * CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";

import JSZip, { type JSZipObject } from "jszip";
import { SaxesParser, type SaxesTagNS } from "saxes";

import type { Diagnostic } from "../core/types.js";
import type {
  PptvPptxMap,
  PptvPptxMapObject,
  PptvPptxMapSlide,
} from "./pptx-baseline.js";
import {
  normalizePptxPackage,
  type PptxNormalizationEvidence,
} from "./pptx-normalization.js";

const MAX_PPTX_BYTES = 128 * 1024 * 1024;
const MAX_PART_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PART_BYTES = 128 * 1024 * 1024;
const MAX_PARTS = 256;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP16_SENTINEL = 0xffff;
const ZIP32_SENTINEL = 0xffffffff;
const ZIP_UNICODE_PATH_EXTRA_FIELD = 0x7075;
const PRESENTATION =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const CUSTOM_PROPERTIES =
  "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties";
const VALUE_TYPES =
  "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const XML = "http://www.w3.org/XML/1998/namespace";
const SLIDE_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const DRAWING_2014 = "http://schemas.microsoft.com/office/drawing/2014/main";
const VISIBLE_OBJECT_NAMES = new Set([
  expanded(PRESENTATION, "sp"),
  expanded(PRESENTATION, "cxnSp"),
  expanded(PRESENTATION, "grpSp"),
  expanded(PRESENTATION, "pic"),
  expanded(PRESENTATION, "graphicFrame"),
  expanded(PRESENTATION, "contentPart"),
]);
const SUPPORTED_OBJECT_NAMES = new Map([
  [expanded(PRESENTATION, "sp"), "p:sp" as const],
  [expanded(PRESENTATION, "cxnSp"), "p:cxnSp" as const],
  [expanded(PRESENTATION, "grpSp"), "p:grpSp" as const],
]);
const SIGNIFICANT_TEXT_NAMES = new Set([
  expanded(DRAWING, "t"),
  expanded(VALUE_TYPES, "lpwstr"),
]);

export type SupportedOfficeElement = "p:sp" | "p:cxnSp" | "p:grpSp";

interface XmlText {
  readonly kind: "text";
  readonly value: string;
}

interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

type XmlNode = XmlElement | XmlText;

interface MutableXmlElement {
  kind: "element";
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export interface PptxInspectedObject {
  readonly id: string;
  readonly partName: string;
  readonly element: SupportedOfficeElement;
  readonly parentId: string | null;
  readonly order: number;
  readonly numericId: number;
  readonly structureSignature: string;
  /**
   * Canonical object structure with only the cNvPr stable-name value and
   * Office numeric-ID value masked. All other XML remains visible.
   */
  readonly identityNormalizedStructureSignature: string;
  readonly geometry?: PptxInspectedGeometry;
  readonly style?: PptxInspectedStyle;
  readonly text?: string;
  readonly textNodeCount: number;
  readonly normalizations: readonly PptxObjectNormalizationEvidence[];
}

export interface PptxObjectNormalizationEvidence {
  readonly ruleId: "pptv-c10/end-paragraph-style-marker-omitted/1";
  readonly partName: string;
  readonly objectId: string;
  readonly occurrenceCount: number;
  readonly semanticScope: "existing-rendered-content";
  readonly message: string;
}

export interface PptxIdentityOccurrence {
  readonly element?: SupportedOfficeElement;
  readonly numericId?: number;
  readonly parentId: string | null;
  readonly order: number;
  /**
   * Canonical object structure with only the cNvPr stable-name value and
   * Office numeric-ID value masked. This is evidence, not identity authority.
   */
  readonly identityNormalizedStructureSignature?: string;
  readonly geometry?: PptxInspectedGeometry;
  readonly style?: PptxInspectedStyle;
  readonly connections: readonly {
    readonly end: "start" | "end";
    readonly targetNumericId: number;
    readonly targetObjectId?: string;
    readonly siteIndex: number;
  }[];
  readonly hasCreationId: boolean;
  readonly semanticError?: string;
}

export interface PptxIdentityMatch {
  readonly id: string;
  readonly status: "unique" | "missing" | "duplicate";
  readonly occurrences: readonly PptxIdentityOccurrence[];
}

export type PptxInspectedGeometry =
  | {
      readonly kind: "rect" | "ellipse" | "text";
      readonly offXEmu: number;
      readonly offYEmu: number;
      readonly extCxEmu: number;
      readonly extCyEmu: number;
      readonly anchorXEmu?: number;
    }
  | {
      readonly kind: "line";
      readonly x1Emu: number;
      readonly y1Emu: number;
      readonly x2Emu: number;
      readonly y2Emu: number;
    }
  | {
      readonly kind: "group";
      readonly offXEmu: number;
      readonly offYEmu: number;
      readonly extCxEmu: number;
      readonly extCyEmu: number;
      readonly childOffXEmu: number;
      readonly childOffYEmu: number;
      readonly childExtCxEmu: number;
      readonly childExtCyEmu: number;
    };

export interface PptxInspectedStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidthEmu: number;
  readonly opacity: 1;
  readonly fontFamily?: string;
  readonly fontSizeHundredthPoints?: number;
  readonly fontWeight: 400 | 700;
  readonly fontStyle: "normal" | "italic";
  readonly textAnchor: "start" | "middle" | "end";
}

export interface PptxInspectedSlide {
  readonly order: number;
  readonly relationshipId: string;
  readonly partName: string;
  readonly skeletonSignature: string;
  /**
   * Slide structure with visible object inventory and XML-only whitespace
   * removed. All non-object elements and attributes remain exact.
   */
  readonly inventoryNormalizedSkeletonSignature: string;
  readonly objects: readonly PptxInspectedObject[];
  readonly identities: readonly PptxIdentityMatch[];
}

export interface PptxInspection {
  readonly schema: "pptv-pptx-inspection/0.2";
  readonly pptxSha256: string;
  readonly partNames: readonly string[];
  readonly semanticPartNames: readonly string[];
  readonly rawPartSignatures: Readonly<Record<string, string>>;
  readonly partSignatures: Readonly<Record<string, string>>;
  readonly partSha256: Readonly<Record<string, string>>;
  readonly customProperties: Readonly<Record<string, string>>;
  readonly slides: readonly PptxInspectedSlide[];
  readonly normalizations: readonly PptxNormalizationEvidence[];
}

export interface PptxInspectionResult {
  readonly inspection?: PptxInspection;
  readonly diagnostics: readonly Diagnostic[];
}

export async function inspectPptxForReconciliation(
  bytes: Uint8Array,
  map: PptvPptxMap,
): Promise<PptxInspectionResult> {
  const diagnostics: Diagnostic[] = [];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return failedInspection(
      "PPTV-RECONCILE-INVALID-PPTX",
      "Edited PPTX bytes must be a non-empty Uint8Array.",
    );
  }
  if (bytes.byteLength > MAX_PPTX_BYTES) {
    return failedInspection(
      "PPTV-RECONCILE-INVALID-PPTX",
      `Edited PPTX exceeds the ${MAX_PPTX_BYTES}-byte inspection limit.`,
    );
  }
  // JSZip exposes a filename-keyed inventory and can overwrite colliding
  // central-directory records before callers can inspect them.
  try {
    validateRawZipInventory(bytes);
  } catch (error) {
    return failedInspection(
      "PPTV-RECONCILE-INVALID-PPTX",
      `Edited PPTX has an invalid raw ZIP inventory: ${errorMessage(error)}`,
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, {
      checkCRC32: true,
      createFolders: false,
    });
  } catch (error) {
    return failedInspection(
      "PPTV-RECONCILE-INVALID-PPTX",
      `Edited PPTX is not a valid CRC-checked ZIP package: ${errorMessage(error)}`,
    );
  }

  const entries = Object.values(zip.files);
  if (
    entries.length === 0 ||
    entries.length > MAX_PARTS ||
    entries.some((entry) =>
      entry.unsafeOriginalName !== undefined &&
      entry.unsafeOriginalName !== entry.name
        ? true
        : entry.dir
          ? !safeDirectoryName(entry.name)
          : !safePartName(entry.name),
    )
  ) {
    return failedInspection(
      "PPTV-RECONCILE-INVALID-PPTX",
      "Edited PPTX has an empty, excessive, or unsafe ZIP inventory.",
    );
  }
  const fileEntries = entries.filter((entry) => !entry.dir);
  let announcedTotalSize = 0;
  for (const entry of fileEntries) {
    const announcedSize = internalUncompressedSize(entry);
    if (announcedSize === undefined) {
      return failedInspection(
        "PPTV-RECONCILE-INVALID-PPTX",
        `PPTX part "${entry.name}" lacks a bounded decoded size.`,
      );
    }
    announcedTotalSize += announcedSize;
    if (
      announcedSize > MAX_PART_BYTES ||
      announcedTotalSize > MAX_TOTAL_PART_BYTES
    ) {
      return failedInspection(
        "PPTV-RECONCILE-INVALID-PPTX",
        `PPTX part "${entry.name}" or the decoded package exceeds the inspection size limit.`,
      );
    }
  }

  const partNames = fileEntries.map((entry) => entry.name).sort(compareText);
  const expectedPartNames = [...map.pptx.partNames].sort(compareText);

  const requiredParts = [
    "docProps/custom.xml",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
    ...map.slides.map((slide) => slide.partName),
  ];
  if (requiredParts.some((name) => zip.file(name) === null)) {
    return {
      diagnostics: Object.freeze([
        ...diagnostics,
        invalidPptxDiagnostic(
          "Edited PPTX lacks a required lineage, presentation, relationship, or mapped slide part.",
        ),
      ]),
    };
  }

  const roots = new Map<string, XmlElement>();
  const partTexts: Record<string, string> = {};
  try {
    for (const name of partNames) {
      if (!xmlPartName(name)) {
        diagnostics.push({
          code: "PPTV-RECONCILE-UNSUPPORTED",
          severity: "error",
          message: `Unsupported non-XML package part "${name}" is present.`,
        });
        continue;
      }
      const text = await readXmlPart(zip, name);
      partTexts[name] = text;
      roots.set(name, parseXml(text, name));
    }
  } catch (error) {
    return {
      diagnostics: Object.freeze([
        ...diagnostics,
        invalidPptxDiagnostic(errorMessage(error)),
      ]),
    };
  }

  const customRoot = roots.get("docProps/custom.xml");
  const presentationRoot = roots.get("ppt/presentation.xml");
  const presentationRelsRoot = roots.get("ppt/_rels/presentation.xml.rels");
  if (
    customRoot === undefined ||
    presentationRoot === undefined ||
    presentationRelsRoot === undefined
  ) {
    return {
      diagnostics: Object.freeze([
        ...diagnostics,
        invalidPptxDiagnostic("Required parsed package roots are missing."),
      ]),
    };
  }

  try {
    const packageNormalization = normalizePptxPackage({
      parts: partTexts,
      expectedPartNames,
    });
    const missingParts = expectedPartNames.filter(
      (name) => !packageNormalization.semanticPartNames.includes(name),
    );
    const newParts = packageNormalization.semanticPartNames.filter(
      (name) => !expectedPartNames.includes(name),
    );
    if (missingParts.length > 0 || newParts.length > 0) {
      diagnostics.push({
        code: "PPTV-RECONCILE-UNSUPPORTED",
        severity: "error",
        message: `PPTX part inventory changed (missing: ${listOrNone(missingParts)}; new: ${listOrNone(newParts)}).`,
      });
    }
    const custom = inspectCustomProperties(customRoot, diagnostics);
    validateLineage(custom, map, diagnostics);
    const bindings = inspectSlideBindings(
      presentationRoot,
      presentationRelsRoot,
      map,
      diagnostics,
    );
    const inspectedSlides: PptxInspectedSlide[] = [];
    for (const [order, mapSlide] of map.slides.entries()) {
      const root = roots.get(mapSlide.partName);
      const binding = bindings[order];
      if (root === undefined || binding === undefined) continue;
      inspectedSlides.push(
        inspectSlide(
          root,
          mapSlide,
          order,
          binding.relationshipId,
          diagnostics,
        ),
      );
    }

    return {
      inspection: Object.freeze({
        schema: "pptv-pptx-inspection/0.2",
        pptxSha256: sha256(bytes),
        partNames: Object.freeze(partNames),
        semanticPartNames: packageNormalization.semanticPartNames,
        rawPartSignatures: packageNormalization.rawPartSignatures,
        partSignatures: packageNormalization.semanticPartSignatures,
        partSha256: packageNormalization.partSha256,
        customProperties: Object.freeze(custom),
        slides: Object.freeze(inspectedSlides),
        normalizations: packageNormalization.normalizations,
      }),
      diagnostics: Object.freeze(diagnostics),
    };
  } catch (error) {
    return {
      diagnostics: Object.freeze([
        ...diagnostics,
        invalidPptxDiagnostic(errorMessage(error)),
      ]),
    };
  }
}

function inspectCustomProperties(
  root: XmlElement,
  diagnostics: Diagnostic[],
): Readonly<Record<string, string>> {
  if (root.name !== expanded(CUSTOM_PROPERTIES, "Properties")) {
    throw new Error("Custom-properties part has the wrong root element.");
  }
  const result: Record<string, string> = {};
  for (const property of directElements(root, CUSTOM_PROPERTIES, "property")) {
    const name = attribute(property, "", "name");
    if (name === undefined || name.length === 0) {
      throw new Error("Custom property lacks a non-empty name.");
    }
    if (Object.hasOwn(result, name)) {
      diagnostics.push({
        code: "PPTV-RECONCILE-LINEAGE",
        severity: "error",
        message: `Custom lineage property "${name}" is duplicated.`,
      });
      continue;
    }
    const values = property.children.filter(
      (child): child is XmlElement => child.kind === "element",
    );
    if (
      values.length !== 1 ||
      values[0]?.name !== expanded(VALUE_TYPES, "lpwstr")
    ) {
      throw new Error(
        `Custom property "${name}" does not contain one string value.`,
      );
    }
    result[name] = elementText(values[0]);
  }
  return result;
}

function validateLineage(
  custom: Readonly<Record<string, string>>,
  map: PptvPptxMap,
  diagnostics: Diagnostic[],
): void {
  const placement = map.composition.placement;
  const expected = {
    "pptv.activeTheme": "diagram-local",
    "pptv.compiler": map.compiler,
    "pptv.mapSchema": map.schema,
    "pptv.placement": JSON.stringify([
      placement.slideId,
      placement.policy,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
    ]),
    "pptv.resolvedSchema": map.resolvedSchema,
    "pptv.atomSha256": map.source.sha256,
    "pptv.sourceId": map.source.id,
    "pptv.sourceKind": map.source.kind,
    "pptv.sourceResolvedSchema": map.sourceResolvedSchema,
    "pptv.sourceSha256": map.composition.composedDeckSha256,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (custom[name] !== value) {
      diagnostics.push({
        code: "PPTV-RECONCILE-LINEAGE",
        severity: "error",
        message: `PPTX lineage property "${name}" does not match the authenticated baseline.`,
      });
    }
  }
}

function inspectSlideBindings(
  presentation: XmlElement,
  relationships: XmlElement,
  map: PptvPptxMap,
  diagnostics: Diagnostic[],
): readonly {
  readonly relationshipId: string;
  readonly partName: string;
}[] {
  if (presentation.name !== expanded(PRESENTATION, "presentation")) {
    throw new Error("Presentation part has the wrong root element.");
  }
  if (relationships.name !== expanded(PACKAGE_RELATIONSHIPS, "Relationships")) {
    throw new Error("Presentation relationships have the wrong root element.");
  }
  const relationshipById = new Map<
    string,
    {
      readonly type: string;
      readonly target: string;
      readonly external: boolean;
    }
  >();
  for (const relation of directElements(
    relationships,
    PACKAGE_RELATIONSHIPS,
    "Relationship",
  )) {
    const id = attribute(relation, "", "Id");
    const type = attribute(relation, "", "Type");
    const target = attribute(relation, "", "Target");
    if (
      id === undefined ||
      type === undefined ||
      target === undefined ||
      relationshipById.has(id)
    ) {
      throw new Error(
        "Presentation relationships contain an incomplete or duplicate entry.",
      );
    }
    relationshipById.set(id, {
      type,
      target,
      external: attribute(relation, "", "TargetMode") === "External",
    });
  }

  const slideIds = descendants(presentation, PRESENTATION, "sldId");
  if (slideIds.length !== map.slides.length) {
    diagnostics.push({
      code: "PPTV-RECONCILE-UNSUPPORTED",
      severity: "error",
      message: `Presentation slide inventory changed from ${map.slides.length} to ${slideIds.length}.`,
    });
  }
  const result: Array<{ relationshipId: string; partName: string }> = [];
  for (const [order, slideId] of slideIds.entries()) {
    const relationshipId = attribute(slideId, OFFICE_RELATIONSHIPS, "id");
    if (relationshipId === undefined) {
      throw new Error(`Presentation slide ${order} lacks r:id.`);
    }
    const relationship = relationshipById.get(relationshipId);
    if (
      relationship === undefined ||
      relationship.external ||
      relationship.type !== SLIDE_RELATIONSHIP_TYPE
    ) {
      throw new Error(
        `Presentation slide ${order} has no safe internal slide relationship.`,
      );
    }
    const partName = resolveRelationshipTarget(
      "ppt/presentation.xml",
      relationship.target,
    );
    result.push({ relationshipId, partName });
    const expected = map.slides[order];
    if (expected === undefined || partName !== expected.partName) {
      diagnostics.push({
        code: "PPTV-RECONCILE-AMBIGUOUS",
        severity: "error",
        message: `Presentation order ${order} resolves through "${relationshipId}" to unexpected part "${partName}".`,
      });
    }
  }
  return result;
}

function inspectSlide(
  root: XmlElement,
  mapSlide: PptvPptxMapSlide,
  order: number,
  relationshipId: string,
  diagnostics: Diagnostic[],
): PptxInspectedSlide {
  if (root.name !== expanded(PRESENTATION, "sld")) {
    throw new Error(`Mapped slide part "${mapSlide.partName}" has wrong root.`);
  }
  const trees = descendants(root, PRESENTATION, "spTree");
  if (trees.length !== 1) {
    throw new Error(
      `Mapped slide part "${mapSlide.partName}" requires one shape tree.`,
    );
  }
  const tree = trees[0]!;
  const expectedById = new Map(
    mapSlide.objects.map((object) => [object.id, object] as const),
  );
  const discovered: Array<{
    id?: string;
    numericId?: number;
    element?: SupportedOfficeElement;
    parentId: string | null;
    order: number;
    node: XmlElement;
  }> = [];

  const visitContainer = (
    container: XmlElement,
    parentId: string | null,
  ): void => {
    let objectOrder = 0;
    for (const child of container.children) {
      if (child.kind !== "element" || !VISIBLE_OBJECT_NAMES.has(child.name)) {
        continue;
      }
      const currentOrder = objectOrder;
      objectOrder += 1;
      const element = SUPPORTED_OBJECT_NAMES.get(child.name);
      const identity = inspectObjectIdentity(child, element);
      discovered.push({
        ...(identity.id === undefined ? {} : { id: identity.id }),
        ...(identity.numericId === undefined
          ? {}
          : { numericId: identity.numericId }),
        ...(element === undefined ? {} : { element }),
        parentId,
        order: currentOrder,
        node: child,
      });
      if (
        element === "p:grpSp" &&
        child.name === expanded(PRESENTATION, "grpSp")
      ) {
        visitContainer(child, identity.id ?? null);
      }
    }
  };
  visitContainer(tree, null);

  const occurrences = new Map<string, Array<(typeof discovered)[number]>>();
  for (const object of discovered) {
    if (object.id === undefined) {
      diagnostics.push({
        code: "PPTV-RECONCILE-MISSING-ID",
        severity: "error",
        message: `Visible Office object at ${mapSlide.partName} parent ${object.parentId ?? "<slide>"} order ${object.order} lacks a src.<stable-id> name.`,
      });
      continue;
    }
    const siblings = occurrences.get(object.id) ?? [];
    siblings.push(object);
    occurrences.set(object.id, siblings);
  }
  for (const [id, objects] of occurrences) {
    if (objects.length > 1) {
      diagnostics.push({
        code: "PPTV-RECONCILE-DUPLICATE-ID",
        severity: "error",
        message: `Office identity "src.${id}" occurs ${objects.length} times in mapped slide "${mapSlide.id}".`,
        objectId: id,
      });
    }
    if (!expectedById.has(id)) {
      diagnostics.push({
        code: "PPTV-RECONCILE-UNSUPPORTED",
        severity: "error",
        message: `Office object "src.${id}" is not present in the authenticated baseline map.`,
        objectId: id,
      });
    }
  }

  const numericOccurrences = new Map<
    number,
    Array<(typeof discovered)[number]>
  >();
  for (const object of discovered) {
    if (object.numericId === undefined) continue;
    const values = numericOccurrences.get(object.numericId) ?? [];
    values.push(object);
    numericOccurrences.set(object.numericId, values);
  }
  const numericObjectIds = new Map<number, string>();
  for (const [numericId, objects] of numericOccurrences) {
    if (objects.length === 1 && objects[0]?.id !== undefined) {
      numericObjectIds.set(numericId, objects[0].id);
    }
  }
  const identities: PptxIdentityMatch[] = mapSlide.objects.map((expected) => {
    const matches = occurrences.get(expected.id) ?? [];
    const status =
      matches.length === 0
        ? "missing"
        : matches.length === 1
          ? "unique"
          : "duplicate";
    return Object.freeze({
      id: expected.id,
      status,
      occurrences: Object.freeze(
        matches.map((object) =>
          inspectIdentityOccurrence(object, expected, numericObjectIds),
        ),
      ),
    });
  });

  const rootIdentities = new WeakMap<XmlElement, string>();
  for (const [index, object] of discovered.entries()) {
    rootIdentities.set(
      object.node,
      object.id === undefined ? `<missing:${index}>` : object.id,
    );
  }
  const inspected: PptxInspectedObject[] = [];
  for (const expected of mapSlide.objects) {
    const matches = occurrences.get(expected.id) ?? [];
    if (matches.length === 0) continue;
    if (matches.length !== 1) continue;
    const object = matches[0]!;
    if (
      object.element === undefined ||
      object.numericId === undefined ||
      object.element !== expected.emitted.element
    ) {
      diagnostics.push({
        code: "PPTV-RECONCILE-UNSUPPORTED",
        severity: "error",
        message: `Mapped object "src.${expected.id}" changed its supported Office element kind.`,
        objectId: expected.id,
      });
      continue;
    }
    if (object.parentId !== expected.parentId) {
      diagnostics.push({
        code: "PPTV-RECONCILE-AMBIGUOUS",
        severity: "error",
        message: `Mapped object "src.${expected.id}" changed parent from "${expected.parentId ?? "<slide>"}" to "${object.parentId ?? "<slide>"}".`,
        objectId: expected.id,
      });
    }

    const textElements = descendants(object.node, DRAWING, "t");
    if (
      expected.kind === "text" &&
      (textElements.length !== 1 ||
        /[\r\n\u2028\u2029]/u.test(
          textElements[0] === undefined ? "" : elementText(textElements[0]),
        ))
    ) {
      diagnostics.push({
        code: "PPTV-RECONCILE-UNSUPPORTED",
        severity: "error",
        message: `Text object "src.${expected.id}" is no longer one native single-line a:t value.`,
        objectId: expected.id,
      });
    }
    const semantics = inspectObjectSemantics(
      object.node,
      expected,
      diagnostics,
    );
    inspected.push({
      id: expected.id,
      partName: mapSlide.partName,
      element: object.element,
      parentId: object.parentId,
      order: object.order,
      numericId: object.numericId,
      structureSignature: objectStructureSignature(
        object.node,
        expected,
        rootIdentities,
        semantics.maskedAttributes,
        semantics.maskedElements,
        semantics.canonicalEndParagraphs,
      ),
      identityNormalizedStructureSignature:
        identityNormalizedObjectStructureSignature(object.node),
      ...(semantics.geometry === undefined
        ? {}
        : { geometry: semantics.geometry }),
      ...(semantics.style === undefined ? {} : { style: semantics.style }),
      ...(expected.kind === "text" && textElements.length === 1
        ? { text: elementText(textElements[0]!) }
        : {}),
      textNodeCount: textElements.length,
      normalizations: semantics.normalizations,
    });
  }

  return Object.freeze({
    order,
    relationshipId,
    partName: mapSlide.partName,
    skeletonSignature: skeletonSignature(root, rootIdentities),
    inventoryNormalizedSkeletonSignature: inventoryNormalizedSkeletonSignature(
      root,
      rootIdentities,
    ),
    objects: Object.freeze(inspected),
    identities: Object.freeze(identities),
  });
}

function inspectIdentityOccurrence(
  object: {
    readonly numericId?: number;
    readonly element?: SupportedOfficeElement;
    readonly parentId: string | null;
    readonly order: number;
    readonly node: XmlElement;
  },
  expected: PptvPptxMapObject,
  numericObjectIds: ReadonlyMap<number, string>,
): PptxIdentityOccurrence {
  const localDiagnostics: Diagnostic[] = [];
  const semantics =
    object.element === expected.emitted.element
      ? inspectObjectSemantics(object.node, expected, localDiagnostics)
      : undefined;
  const connections = [
    ...connectionEvidence(object.node, "stCxn", "start", numericObjectIds),
    ...connectionEvidence(object.node, "endCxn", "end", numericObjectIds),
  ];
  return Object.freeze({
    ...(object.element === undefined ? {} : { element: object.element }),
    ...(object.numericId === undefined ? {} : { numericId: object.numericId }),
    parentId: object.parentId,
    order: object.order,
    ...(object.element === undefined
      ? {}
      : {
          identityNormalizedStructureSignature:
            identityNormalizedObjectStructureSignature(object.node),
        }),
    ...(semantics?.geometry === undefined
      ? {}
      : { geometry: semantics.geometry }),
    ...(semantics?.style === undefined ? {} : { style: semantics.style }),
    connections: Object.freeze(connections),
    hasCreationId:
      descendants(object.node, DRAWING_2014, "creationId").length > 0,
    ...(localDiagnostics.length === 0
      ? {}
      : {
          semanticError: localDiagnostics
            .map((diagnostic) => diagnostic.message)
            .join(" "),
        }),
  });
}

function connectionEvidence(
  root: XmlElement,
  localName: "stCxn" | "endCxn",
  end: "start" | "end",
  numericObjectIds: ReadonlyMap<number, string>,
): readonly PptxIdentityOccurrence["connections"][number][] {
  return descendants(root, DRAWING, localName).flatMap((connection) => {
    const target = attribute(connection, "", "id");
    const site = attribute(connection, "", "idx");
    if (
      target === undefined ||
      site === undefined ||
      !/^[1-9]\d*$/u.test(target) ||
      !/^(?:0|[1-9]\d*)$/u.test(site)
    ) {
      return [];
    }
    const targetNumericId = Number(target);
    const siteIndex = Number(site);
    if (
      !Number.isSafeInteger(targetNumericId) ||
      !Number.isSafeInteger(siteIndex)
    ) {
      return [];
    }
    const targetObjectId = numericObjectIds.get(targetNumericId);
    return [
      Object.freeze({
        end,
        targetNumericId,
        ...(targetObjectId === undefined ? {} : { targetObjectId }),
        siteIndex,
      }),
    ];
  });
}

function inspectObjectIdentity(
  object: XmlElement,
  element: SupportedOfficeElement | undefined,
): { readonly id?: string; readonly numericId?: number } {
  if (element === undefined) return {};
  const nonVisualName =
    element === "p:sp"
      ? "nvSpPr"
      : element === "p:cxnSp"
        ? "nvCxnSpPr"
        : "nvGrpSpPr";
  const nonVisual = directElements(object, PRESENTATION, nonVisualName)[0];
  const cNvPr =
    nonVisual === undefined
      ? undefined
      : directElements(nonVisual, PRESENTATION, "cNvPr")[0];
  if (cNvPr === undefined) return {};
  const name = attribute(cNvPr, "", "name");
  const numeric = attribute(cNvPr, "", "id");
  const numericId =
    numeric !== undefined && /^[1-9]\d*$/u.test(numeric)
      ? Number(numeric)
      : undefined;
  const id =
    name !== undefined && name.startsWith("src.") && name.length > 4
      ? name.slice(4)
      : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(numericId === undefined || !Number.isSafeInteger(numericId)
      ? {}
      : { numericId }),
  };
}

interface InspectedObjectSemantics {
  readonly geometry?: PptxInspectedGeometry;
  readonly style?: PptxInspectedStyle;
  readonly normalizations: readonly PptxObjectNormalizationEvidence[];
  readonly maskedAttributes: WeakMap<XmlElement, ReadonlySet<string>>;
  readonly maskedElements: WeakMap<XmlElement, string>;
  readonly canonicalEndParagraphs: WeakSet<XmlElement>;
}

interface SemanticMasks {
  readonly attributes: WeakMap<XmlElement, ReadonlySet<string>>;
  readonly elements: WeakMap<XmlElement, string>;
  readonly canonicalEndParagraphs: WeakSet<XmlElement>;
}

function inspectObjectSemantics(
  root: XmlElement,
  expected: PptvPptxMapObject,
  diagnostics: Diagnostic[],
): InspectedObjectSemantics {
  const masks: SemanticMasks = {
    attributes: new WeakMap(),
    elements: new WeakMap(),
    canonicalEndParagraphs: new WeakSet(),
  };
  try {
    const baselineStyle = mapStyle(expected);
    if (expected.kind === "group") {
      const properties = requireDirectElement(root, PRESENTATION, "grpSpPr");
      const transform = inspectTransform(properties, true, masks);
      return {
        geometry: {
          kind: "group",
          offXEmu: transform.offX,
          offYEmu: transform.offY,
          extCxEmu: transform.extCx,
          extCyEmu: transform.extCy,
          childOffXEmu: transform.childOffX!,
          childOffYEmu: transform.childOffY!,
          childExtCxEmu: transform.childExtCx!,
          childExtCyEmu: transform.childExtCy!,
        },
        style: baselineStyle,
        normalizations: Object.freeze([]),
        maskedAttributes: masks.attributes,
        maskedElements: masks.elements,
        canonicalEndParagraphs: masks.canonicalEndParagraphs,
      };
    }

    const properties = requireDirectElement(root, PRESENTATION, "spPr");
    const transform = inspectTransform(properties, false, masks);
    const preset = requireDirectElement(properties, DRAWING, "prstGeom");
    const expectedPreset =
      expected.kind === "line"
        ? "line"
        : expected.kind === "ellipse"
          ? "ellipse"
          : "rect";
    if (attribute(preset, "", "prst") !== expectedPreset) {
      throw new Error(
        `preset geometry is not the mapped "${expectedPreset}" value`,
      );
    }
    if (
      expected.kind !== "line" &&
      (transform.flipH ||
        transform.flipV ||
        transform.extCx <= 0 ||
        transform.extCy <= 0)
    ) {
      throw new Error(
        "non-connector transform is flipped or has a nonpositive extent",
      );
    }

    if (expected.kind === "line") {
      const lineStyle = inspectLineStyle(properties, masks, "shape-line");
      const x1 = transform.flipH
        ? transform.offX + transform.extCx
        : transform.offX;
      const x2 = transform.flipH
        ? transform.offX
        : transform.offX + transform.extCx;
      const y1 = transform.flipV
        ? transform.offY + transform.extCy
        : transform.offY;
      const y2 = transform.flipV
        ? transform.offY
        : transform.offY + transform.extCy;
      if (x1 === x2 && y1 === y2) {
        throw new Error("connector endpoints are degenerate");
      }
      return {
        geometry: {
          kind: "line",
          x1Emu: x1,
          y1Emu: y1,
          x2Emu: x2,
          y2Emu: y2,
        },
        style: {
          ...baselineStyle,
          stroke: lineStyle.paint,
          strokeWidthEmu: lineStyle.width,
        },
        normalizations: Object.freeze([]),
        maskedAttributes: masks.attributes,
        maskedElements: masks.elements,
        canonicalEndParagraphs: masks.canonicalEndParagraphs,
      };
    }

    if (expected.kind === "text") {
      const text = inspectTextSemantics(root, transform, masks);
      return {
        geometry: {
          kind: "text",
          offXEmu: transform.offX,
          offYEmu: transform.offY,
          extCxEmu: transform.extCx,
          extCyEmu: transform.extCy,
          anchorXEmu: text.anchorX,
        },
        style: text.style,
        normalizations: Object.freeze(
          text.endMarkerOmitted
            ? [
                {
                  ruleId:
                    "pptv-c10/end-paragraph-style-marker-omitted/1" as const,
                  partName: expected.emitted.partName,
                  objectId: expected.id,
                  occurrenceCount: 1,
                  semanticScope: "existing-rendered-content" as const,
                  message:
                    "The omitted end-paragraph style marker affects future insertion defaults, not this complete existing run.",
                },
              ]
            : [],
        ),
        maskedAttributes: masks.attributes,
        maskedElements: masks.elements,
        canonicalEndParagraphs: masks.canonicalEndParagraphs,
      };
    }

    if (expected.kind !== "rect" && expected.kind !== "ellipse") {
      throw new Error(`mapped kind "${expected.kind}" is not inspectable`);
    }
    const fill = inspectPaint(properties, masks, "shape-fill");
    const line = inspectLineStyle(properties, masks, "shape-line");
    return {
      geometry: {
        kind: expected.kind,
        offXEmu: transform.offX,
        offYEmu: transform.offY,
        extCxEmu: transform.extCx,
        extCyEmu: transform.extCy,
      },
      style: {
        ...baselineStyle,
        fill,
        stroke: line.paint,
        strokeWidthEmu: line.width,
      },
      normalizations: Object.freeze([]),
      maskedAttributes: masks.attributes,
      maskedElements: masks.elements,
      canonicalEndParagraphs: masks.canonicalEndParagraphs,
    };
  } catch (error) {
    diagnostics.push({
      code: "PPTV-RECONCILE-UNSUPPORTED",
      severity: "error",
      message: `Object "src.${expected.id}" has unsupported or ambiguous DrawingML: ${errorMessage(error)}.`,
      objectId: expected.id,
    });
    return {
      normalizations: Object.freeze([]),
      maskedAttributes: masks.attributes,
      maskedElements: masks.elements,
      canonicalEndParagraphs: masks.canonicalEndParagraphs,
    };
  }
}

function inspectTransform(
  properties: XmlElement,
  group: boolean,
  masks: SemanticMasks,
): {
  readonly offX: number;
  readonly offY: number;
  readonly extCx: number;
  readonly extCy: number;
  readonly childOffX?: number;
  readonly childOffY?: number;
  readonly childExtCx?: number;
  readonly childExtCy?: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
} {
  const transform = requireDirectElement(properties, DRAWING, "xfrm");
  const allowedTransformAttributes = group ? [] : ["flipH", "flipV"];
  requireOnlyAttributes(transform, allowedTransformAttributes);
  const flipH = group ? false : booleanAttribute(transform, "flipH");
  const flipV = group ? false : booleanAttribute(transform, "flipV");
  if (!group) {
    maskAttributes(transform, ["flipH", "flipV"], masks);
  }
  const off = requireDirectElement(transform, DRAWING, "off");
  const ext = requireDirectElement(transform, DRAWING, "ext");
  requireOnlyAttributes(off, ["x", "y"]);
  requireOnlyAttributes(ext, ["cx", "cy"]);
  const offX = integerAttribute(off, "x");
  const offY = integerAttribute(off, "y");
  const extCx = nonnegativeIntegerAttribute(ext, "cx");
  const extCy = nonnegativeIntegerAttribute(ext, "cy");
  if (!group && extCx === 0 && extCy === 0) {
    throw new Error("shape transform has two zero extents");
  }
  maskAttributes(off, ["x", "y"], masks);
  maskAttributes(ext, ["cx", "cy"], masks);
  if (!group) {
    return { offX, offY, extCx, extCy, flipH, flipV };
  }
  if (extCx <= 0 || extCy <= 0) {
    throw new Error("group transform extents must be positive");
  }
  const childOff = requireDirectElement(transform, DRAWING, "chOff");
  const childExt = requireDirectElement(transform, DRAWING, "chExt");
  requireOnlyAttributes(childOff, ["x", "y"]);
  requireOnlyAttributes(childExt, ["cx", "cy"]);
  const childOffX = integerAttribute(childOff, "x");
  const childOffY = integerAttribute(childOff, "y");
  const childExtCx = positiveIntegerAttribute(childExt, "cx");
  const childExtCy = positiveIntegerAttribute(childExt, "cy");
  maskAttributes(childOff, ["x", "y"], masks);
  maskAttributes(childExt, ["cx", "cy"], masks);
  return {
    offX,
    offY,
    extCx,
    extCy,
    childOffX,
    childOffY,
    childExtCx,
    childExtCy,
    flipH,
    flipV,
  };
}

function inspectTextSemantics(
  root: XmlElement,
  transform: ReturnType<typeof inspectTransform>,
  masks: SemanticMasks,
): {
  readonly anchorX: number;
  readonly style: PptxInspectedStyle;
  readonly endMarkerOmitted: boolean;
} {
  const body = requireDirectElement(root, PRESENTATION, "txBody");
  const paragraph = requireDirectElement(body, DRAWING, "p");
  const paragraphProperties = requireDirectElement(paragraph, DRAWING, "pPr");
  const alignment = attribute(paragraphProperties, "", "algn");
  const marginLeft = nonnegativeIntegerAttribute(paragraphProperties, "marL");
  const marginRight = nonnegativeIntegerAttribute(paragraphProperties, "marR");
  if (attribute(paragraphProperties, "", "indent") !== "0") {
    throw new Error("text paragraph indent is not the C9 zero value");
  }
  const textAnchor =
    alignment === "l"
      ? "start"
      : alignment === "ctr"
        ? "middle"
        : alignment === "r"
          ? "end"
          : undefined;
  if (textAnchor === undefined) {
    throw new Error("text paragraph alignment is not left/center/right");
  }
  maskAttributes(paragraphProperties, ["algn", "marL", "marR"], masks);
  const relativeAnchor =
    textAnchor === "start"
      ? marginLeft
      : textAnchor === "end"
        ? transform.extCx - marginRight
        : (transform.extCx + marginLeft - marginRight) / 2;
  const anchorX = transform.offX + relativeAnchor;
  if (
    !Number.isSafeInteger(anchorX) ||
    relativeAnchor < 0 ||
    relativeAnchor > transform.extCx
  ) {
    throw new Error("text paragraph margins do not encode one exact anchor");
  }

  const run = requireDirectElement(paragraph, DRAWING, "r");
  const runProperties = requireDirectElement(run, DRAWING, "rPr");
  const runStyle = inspectRunStyle(runProperties, textAnchor, masks, "run");
  const endProperties = directElements(paragraph, DRAWING, "endParaRPr");
  if (endProperties.length > 1) {
    throw new Error("text paragraph has multiple end-paragraph style markers");
  }
  if (endProperties.length === 1) {
    const endStyle = inspectRunStyle(
      endProperties[0]!,
      textAnchor,
      masks,
      "end-paragraph",
    );
    if (JSON.stringify(runStyle) !== JSON.stringify(endStyle)) {
      throw new Error("run and end-paragraph styles differ");
    }
  }
  masks.canonicalEndParagraphs.add(paragraph);
  return {
    anchorX,
    style: runStyle,
    endMarkerOmitted: endProperties.length === 0,
  };
}

function inspectRunStyle(
  properties: XmlElement,
  textAnchor: "start" | "middle" | "end",
  masks: SemanticMasks,
  label: string,
): PptxInspectedStyle {
  requireOnlyAttributes(properties, ["lang", "sz", "b", "i", "dirty"]);
  if (
    attribute(properties, "", "lang") !== "en-US" ||
    attribute(properties, "", "dirty") !== "0"
  ) {
    throw new Error(`${label} language or dirty state changed`);
  }
  requireOnlyDirectElementNames(
    properties,
    [
      expanded(DRAWING, "ln"),
      expanded(DRAWING, "noFill"),
      expanded(DRAWING, "solidFill"),
      expanded(DRAWING, "latin"),
      expanded(DRAWING, "ea"),
      expanded(DRAWING, "cs"),
    ],
    5,
  );
  const fontSize = positiveIntegerAttribute(properties, "sz");
  const bold = binaryAttribute(properties, "b");
  const italic = binaryAttribute(properties, "i");
  const latin = requireDirectElement(properties, DRAWING, "latin");
  const eastAsian = requireDirectElement(properties, DRAWING, "ea");
  const complex = requireDirectElement(properties, DRAWING, "cs");
  const fontFamily = attribute(latin, "", "typeface");
  if (
    fontFamily === undefined ||
    fontFamily.length === 0 ||
    attribute(eastAsian, "", "typeface") !== fontFamily ||
    attribute(complex, "", "typeface") !== fontFamily
  ) {
    throw new Error(`${label} font identities are absent or inconsistent`);
  }
  const fill = inspectPaint(properties, masks, `${label}-fill`);
  const outline = inspectLineStyle(properties, masks, `${label}-outline`);
  masks.elements.set(properties, `text-${label}-style`);
  return {
    fill,
    stroke: outline.paint,
    strokeWidthEmu: outline.width,
    opacity: 1,
    fontFamily,
    fontSizeHundredthPoints: fontSize,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? "italic" : "normal",
    textAnchor,
  };
}

function inspectPaint(
  parent: XmlElement,
  masks: SemanticMasks,
  label: string,
): string {
  const noFill = directElements(parent, DRAWING, "noFill");
  const solidFill = directElements(parent, DRAWING, "solidFill");
  if (noFill.length + solidFill.length !== 1) {
    throw new Error(`${label} is not one noFill or solidFill`);
  }
  if (noFill.length === 1) {
    const node = noFill[0]!;
    requireOnlyAttributes(node, []);
    if (node.children.length !== 0) {
      throw new Error(`${label} noFill contains unsupported content`);
    }
    masks.elements.set(node, label);
    return "none";
  }
  const node = solidFill[0]!;
  requireOnlyAttributes(node, []);
  const color = requireDirectElement(node, DRAWING, "srgbClr");
  requireOnlyAttributes(color, ["val"]);
  const value = attribute(color, "", "val");
  if (
    value === undefined ||
    !/^[0-9a-f]{6}$/iu.test(value) ||
    color.children.length !== 0 ||
    node.children.length !== 1
  ) {
    throw new Error(`${label} is not one literal sRGB color`);
  }
  masks.elements.set(node, label);
  return `#${value.toLowerCase()}`;
}

function inspectLineStyle(
  parent: XmlElement,
  masks: SemanticMasks,
  label: string,
): { readonly width: number; readonly paint: string } {
  const line = requireDirectElement(parent, DRAWING, "ln");
  requireOnlyAttributes(line, ["w"]);
  const width = nonnegativeIntegerAttribute(line, "w");
  const paint = inspectPaint(line, masks, `${label}-paint`);
  if (line.children.length !== 1) {
    throw new Error(`${label} contains unsupported line content`);
  }
  masks.elements.set(line, label);
  return { width, paint };
}

function mapStyle(expected: PptvPptxMapObject): PptxInspectedStyle {
  const style = expected.composed.style;
  const fill = style["fill"];
  const stroke = style["stroke"];
  const strokeWidth = style["strokeWidth"];
  const opacity = style["opacity"];
  const fontFamily = style["fontFamily"];
  const fontSize = style["fontSize"];
  const fontWeight = style["fontWeight"];
  const fontStyle = style["fontStyle"];
  const textAnchor = style["textAnchor"];
  if (
    typeof fill !== "string" ||
    typeof stroke !== "string" ||
    typeof strokeWidth !== "number" ||
    !Number.isFinite(strokeWidth) ||
    opacity !== 1 ||
    (fontFamily !== undefined && typeof fontFamily !== "string") ||
    (fontSize !== undefined &&
      (typeof fontSize !== "number" || !Number.isFinite(fontSize))) ||
    (fontWeight !== 400 && fontWeight !== 700) ||
    (fontStyle !== "normal" && fontStyle !== "italic") ||
    (textAnchor !== "start" && textAnchor !== "middle" && textAnchor !== "end")
  ) {
    throw new Error("authenticated map style snapshot is invalid");
  }
  return {
    fill,
    stroke,
    strokeWidthEmu: exactInteger(strokeWidth * 7_620, "mapped stroke width"),
    opacity: 1,
    ...(typeof fontFamily === "string" ? { fontFamily } : {}),
    ...(typeof fontSize === "number"
      ? {
          fontSizeHundredthPoints: exactInteger(
            fontSize * 60,
            "mapped font size",
          ),
        }
      : {}),
    fontWeight,
    fontStyle,
    textAnchor,
  };
}

function requireDirectElement(
  parent: XmlElement,
  namespace: string,
  local: string,
): XmlElement {
  const values = directElements(parent, namespace, local);
  if (values.length !== 1) {
    throw new Error(`expected exactly one ${local} element`);
  }
  return values[0]!;
}

function requireOnlyAttributes(
  element: XmlElement,
  names: readonly string[],
): void {
  const allowed = new Set(names.map((name) => expanded("", name)));
  const unexpected = Object.keys(element.attributes).filter(
    (name) => !allowed.has(name),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `element ${element.name} has unsupported attributes ${unexpected.join(", ")}`,
    );
  }
}

function requireOnlyDirectElementNames(
  element: XmlElement,
  allowedNames: readonly string[],
  expectedCount = allowedNames.length,
): void {
  const allowed = new Set(allowedNames);
  const children = element.children.filter(
    (child): child is XmlElement => child.kind === "element",
  );
  if (
    children.length !== expectedCount ||
    children.some((child) => !allowed.has(child.name)) ||
    new Set(children.map((child) => child.name)).size !== children.length
  ) {
    throw new Error(`${element.name} has unsupported child structure`);
  }
}

function integerAttribute(element: XmlElement, name: string): number {
  const raw = attribute(element, "", name);
  if (raw === undefined || !/^-?(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new Error(`${element.name} ${name} is not an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${element.name} ${name} is outside the safe range`);
  }
  return value;
}

function nonnegativeIntegerAttribute(
  element: XmlElement,
  name: string,
): number {
  const value = integerAttribute(element, name);
  if (value < 0) {
    throw new Error(`${element.name} ${name} must be nonnegative`);
  }
  return value;
}

function positiveIntegerAttribute(element: XmlElement, name: string): number {
  const value = integerAttribute(element, name);
  if (value <= 0) {
    throw new Error(`${element.name} ${name} must be positive`);
  }
  return value;
}

function binaryAttribute(element: XmlElement, name: string): boolean {
  const raw = attribute(element, "", name);
  if (raw !== "0" && raw !== "1") {
    throw new Error(`${element.name} ${name} must be 0 or 1`);
  }
  return raw === "1";
}

function booleanAttribute(element: XmlElement, name: string): boolean {
  const raw = attribute(element, "", name);
  if (raw === undefined || raw === "0") return false;
  if (raw === "1") return true;
  throw new Error(`${element.name} ${name} must be absent, 0, or 1`);
}

function maskAttributes(
  element: XmlElement,
  names: readonly string[],
  masks: SemanticMasks,
): void {
  masks.attributes.set(
    element,
    new Set(names.map((name) => expanded("", name))),
  );
}

function exactInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} does not have an exact integer encoding`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function objectStructureSignature(
  root: XmlElement,
  expected: PptvPptxMapObject,
  objectRoots: WeakMap<XmlElement, string>,
  maskedAttributes: WeakMap<XmlElement, ReadonlySet<string>>,
  maskedElements: WeakMap<XmlElement, string>,
  canonicalEndParagraphs: WeakSet<XmlElement>,
): string {
  return JSON.stringify(
    normalizeXml(root, {
      currentObjectRoot: root,
      objectRoots,
      maskedAttributes,
      maskedElements,
      canonicalEndParagraphs,
      maskObjectInventory: expected.kind === "group",
      maskDrawingText: expected.kind === "text",
      maskOfficeObjectNumericId: true,
      maskOfficeObjectIdentity: false,
    }),
  );
}

function identityNormalizedObjectStructureSignature(root: XmlElement): string {
  const identityElement = officeObjectIdentityElement(root);
  return JSON.stringify(
    normalizeXml(root, {
      currentObjectRoot: root,
      ...(identityElement === undefined
        ? {}
        : { officeObjectIdentityElement: identityElement }),
      maskObjectInventory: false,
      maskDrawingText: false,
      maskOfficeObjectNumericId: true,
      maskOfficeObjectIdentity: true,
    }),
  );
}

function officeObjectIdentityElement(root: XmlElement): XmlElement | undefined {
  const nonVisualName =
    root.name === expanded(PRESENTATION, "sp")
      ? "nvSpPr"
      : root.name === expanded(PRESENTATION, "cxnSp")
        ? "nvCxnSpPr"
        : root.name === expanded(PRESENTATION, "grpSp")
          ? "nvGrpSpPr"
          : undefined;
  if (nonVisualName === undefined) return undefined;
  const nonVisual = directElements(root, PRESENTATION, nonVisualName);
  if (nonVisual.length !== 1) return undefined;
  const identities = directElements(nonVisual[0]!, PRESENTATION, "cNvPr");
  return identities.length === 1 ? identities[0] : undefined;
}

function skeletonSignature(
  root: XmlElement,
  objectRoots: WeakMap<XmlElement, string>,
): string {
  return JSON.stringify(
    normalizeXml(root, {
      objectRoots,
      maskObjectInventory: true,
      maskDrawingText: false,
      maskOfficeObjectNumericId: false,
      maskOfficeObjectIdentity: false,
    }),
  );
}

function inventoryNormalizedSkeletonSignature(
  root: XmlElement,
  objectRoots: WeakMap<XmlElement, string>,
): string {
  return JSON.stringify(
    normalizeXml(root, {
      objectRoots,
      maskObjectInventory: true,
      maskDrawingText: false,
      maskOfficeObjectNumericId: false,
      maskOfficeObjectIdentity: false,
      ignoreXmlWhitespace: true,
    }),
  );
}

function normalizeXml(
  node: XmlNode,
  options: {
    readonly currentObjectRoot?: XmlElement;
    readonly officeObjectIdentityElement?: XmlElement;
    readonly objectRoots?: WeakMap<XmlElement, string>;
    readonly maskedAttributes?: WeakMap<XmlElement, ReadonlySet<string>>;
    readonly maskedElements?: WeakMap<XmlElement, string>;
    readonly canonicalEndParagraphs?: WeakSet<XmlElement>;
    readonly maskObjectInventory?: boolean;
    readonly maskDrawingText: boolean;
    readonly maskOfficeObjectNumericId: boolean;
    readonly maskOfficeObjectIdentity: boolean;
    readonly ignoreXmlWhitespace?: boolean;
  },
): unknown {
  if (node.kind === "text") return ["text", node.value];
  const objectId = options.objectRoots?.get(node);
  if (objectId !== undefined && node !== options.currentObjectRoot) {
    return ["object", objectId];
  }
  const maskedElement = options.maskedElements?.get(node);
  if (maskedElement !== undefined) {
    return ["pptv-semantic", maskedElement];
  }
  const normalizedChildren = node.children
    .filter(
      (child) =>
        !(
          options.ignoreXmlWhitespace === true &&
          child.kind === "text" &&
          /^[\t\n\r ]*$/u.test(child.value)
        ),
    )
    .filter(
      (child) =>
        !(
          options.maskObjectInventory === true &&
          child.kind === "element" &&
          options.objectRoots?.has(child) === true
        ),
    )
    .filter(
      (child) =>
        !(
          options.canonicalEndParagraphs?.has(node) === true &&
          child.kind === "element" &&
          child.name === expanded(DRAWING, "endParaRPr")
        ),
    )
    .map((child) => normalizeXml(child, options));
  if (options.canonicalEndParagraphs?.has(node) === true) {
    normalizedChildren.push([
      "pptv-semantic",
      "text-end-paragraph-style-marker",
    ]);
  }
  const structuralChildren =
    node.name === expanded(PRESENTATION, "grpSpPr") &&
    exactZeroShapeTreeTransform(node)
      ? []
      : normalizedChildren;
  if (options.maskDrawingText && node.name === expanded(DRAWING, "t")) {
    return [
      "element",
      node.name,
      withoutAttribute(node.attributes, expanded(XML, "space")),
      [["text", "<pptv-text>"]],
    ];
  }
  let attributes =
    options.maskOfficeObjectNumericId &&
    node.name === expanded(PRESENTATION, "cNvPr") &&
    (options.officeObjectIdentityElement === undefined ||
      node === options.officeObjectIdentityElement)
      ? {
          ...node.attributes,
          [expanded("", "id")]: "<office-numeric-id>",
        }
      : node.attributes;
  if (
    options.maskOfficeObjectIdentity &&
    node.name === expanded(PRESENTATION, "cNvPr") &&
    node === options.officeObjectIdentityElement &&
    Object.hasOwn(attributes, expanded("", "name"))
  ) {
    attributes = {
      ...attributes,
      [expanded("", "name")]: "<office-stable-name>",
    };
  }
  const maskedAttributes = options.maskedAttributes?.get(node);
  if (maskedAttributes !== undefined) {
    attributes = {
      ...attributes,
      ...Object.fromEntries(
        [...maskedAttributes].map((name) => [name, "<pptv-value>"]),
      ),
    };
  }
  return ["element", node.name, attributes, structuralChildren];
}

function exactZeroShapeTreeTransform(element: XmlElement): boolean {
  const children = element.children.filter(
    (child): child is XmlElement => child.kind === "element",
  );
  if (
    Object.keys(element.attributes).length !== 0 ||
    children.length !== 1 ||
    children[0]?.name !== expanded(DRAWING, "xfrm") ||
    Object.keys(children[0].attributes).length !== 0
  ) {
    return false;
  }
  const transformChildren = children[0].children.filter(
    (child): child is XmlElement => child.kind === "element",
  );
  const expected = [
    ["off", ["x", "y"]],
    ["ext", ["cx", "cy"]],
    ["chOff", ["x", "y"]],
    ["chExt", ["cx", "cy"]],
  ] as const;
  return (
    transformChildren.length === expected.length &&
    transformChildren.every((child, index) => {
      const [local, attributes] = expected[index]!;
      return (
        child.name === expanded(DRAWING, local) &&
        Object.keys(child.attributes).length === attributes.length &&
        attributes.every(
          (attributeName) => attribute(child, "", attributeName) === "0",
        ) &&
        child.children.length === 0
      );
    })
  );
}

function xmlSignature(root: XmlElement): string {
  return JSON.stringify(
    normalizeXml(root, {
      maskDrawingText: false,
      maskOfficeObjectNumericId: false,
      maskOfficeObjectIdentity: false,
    }),
  );
}

function withoutAttribute(
  attributes: Readonly<Record<string, string>>,
  name: string,
): Readonly<Record<string, string>> {
  if (!Object.hasOwn(attributes, name)) return attributes;
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([attributeName]) => attributeName !== name,
    ),
  );
}

async function readXmlPart(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (entry === null) throw new Error(`PPTX part "${name}" is missing.`);
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PART_BYTES) {
    throw new Error(`PPTX part "${name}" has an invalid decoded size.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `PPTX part "${name}" is not strict UTF-8: ${errorMessage(error)}`,
    );
  }
}

function parseXml(text: string, partName: string): XmlElement {
  const parser = new SaxesParser({
    xmlns: true,
    fragment: false,
    defaultXMLVersion: "1.0",
  });
  const stack: MutableXmlElement[] = [];
  let root: MutableXmlElement | undefined;
  parser.on("doctype", () => {
    throw new Error(`PPTX XML part "${partName}" contains a forbidden DTD.`);
  });
  parser.on("opentag", (tag) => {
    const node: MutableXmlElement = {
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
  parser.on("text", (value) => appendXmlText(stack.at(-1), value));
  parser.on("cdata", (value) => appendXmlText(stack.at(-1), value));
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

function appendXmlText(
  parent: MutableXmlElement | undefined,
  value: string,
): void {
  if (
    parent === undefined ||
    (value.trim().length === 0 && !SIGNIFICANT_TEXT_NAMES.has(parent.name))
  ) {
    return;
  }
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

function normalizedAttributes(
  tag: SaxesTagNS,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.values(tag.attributes)
      .filter((attributeValue) => attributeValue.uri !== XMLNS)
      .map(
        (attributeValue) =>
          [
            expanded(attributeValue.uri, attributeValue.local),
            attributeValue.value,
          ] as const,
      )
      .sort(([left], [right]) => compareText(left, right)),
  );
}

function directElements(
  parent: XmlElement,
  namespace: string,
  local: string,
): readonly XmlElement[] {
  const name = expanded(namespace, local);
  return parent.children.filter(
    (child): child is XmlElement =>
      child.kind === "element" && child.name === name,
  );
}

function descendants(
  parent: XmlElement,
  namespace: string,
  local: string,
): readonly XmlElement[] {
  const name = expanded(namespace, local);
  const result: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    for (const child of node.children) {
      if (child.kind !== "element") continue;
      if (child.name === name) result.push(child);
      visit(child);
    }
  };
  visit(parent);
  return result;
}

function attribute(
  element: XmlElement,
  namespace: string,
  local: string,
): string | undefined {
  return element.attributes[expanded(namespace, local)];
}

function elementText(element: XmlElement): string {
  return element.children
    .filter((child): child is XmlText => child.kind === "text")
    .map((child) => child.value)
    .join("");
}

function resolveRelationshipTarget(source: string, target: string): string {
  if (
    target.length === 0 ||
    target.startsWith("/") ||
    target.includes("\\") ||
    target.includes("?") ||
    target.includes("#")
  ) {
    throw new Error(`Unsafe relationship target "${target}".`);
  }
  const resolved = posix.normalize(posix.join(posix.dirname(source), target));
  if (
    resolved.startsWith("../") ||
    resolved === ".." ||
    !safePartName(resolved)
  ) {
    throw new Error(`Relationship target "${target}" escapes the package.`);
  }
  return resolved;
}

function internalUncompressedSize(entry: JSZipObject): number | undefined {
  const value = (
    entry as JSZipObject & {
      readonly _data?: { readonly uncompressedSize?: unknown };
    }
  )._data?.uncompressedSize;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

interface RawZipEntry {
  readonly name: string;
  readonly nameBytes: Uint8Array;
  readonly centralExtraStart: number;
  readonly centralExtraEnd: number;
  readonly localHeaderOffset: number;
}

function validateRawZipInventory(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findZipEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntryCount !== entryCount
  ) {
    throw new Error("Multi-disk ZIP packages are not supported.");
  }
  if (
    diskEntryCount === ZIP16_SENTINEL ||
    entryCount === ZIP16_SENTINEL ||
    centralDirectorySize === ZIP32_SENTINEL ||
    centralDirectoryOffset === ZIP32_SENTINEL
  ) {
    throw new Error("ZIP64 packages are outside the inspection profile.");
  }
  if (entryCount === 0 || entryCount > MAX_PARTS) {
    throw new Error(
      "ZIP entry count is empty or exceeds the inspection limit.",
    );
  }
  if (
    centralDirectoryOffset > eocdOffset ||
    centralDirectorySize !== eocdOffset - centralDirectoryOffset
  ) {
    throw new Error("ZIP central-directory bounds are inconsistent.");
  }

  const entries: RawZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset > eocdOffset - 46 ||
      view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error("ZIP central-directory entry is truncated or malformed.");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const centralExtraStart = nameStart + nameLength;
    const centralExtraEnd = centralExtraStart + extraLength;
    const nextOffset = centralExtraEnd + commentLength;
    if (nextOffset > eocdOffset) {
      throw new Error("ZIP central-directory entry exceeds its bounds.");
    }
    const nameBytes = bytes.subarray(nameStart, centralExtraStart);
    entries.push({
      name: decodeRawZipName(nameBytes),
      nameBytes,
      centralExtraStart,
      centralExtraEnd,
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) {
    throw new Error(
      "ZIP central-directory size does not match its declared entries.",
    );
  }

  const normalizedNames = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizedZipPathKey(entry.name);
    if (normalizedNames.has(normalized)) {
      throw new Error(
        "ZIP central directory contains duplicate, case-colliding, or path-equivalent entry names.",
      );
    }
    normalizedNames.add(normalized);
  }

  for (const entry of entries) {
    if (
      !canonicalZipEntryName(entry.name) ||
      entry.localHeaderOffset > centralDirectoryOffset - 30 ||
      view.getUint32(entry.localHeaderOffset, true) !==
        ZIP_LOCAL_FILE_HEADER_SIGNATURE
    ) {
      throw new Error("ZIP entry name or local-header reference is unsafe.");
    }
    validateZipNameExtraFields(
      view,
      entry.centralExtraStart,
      entry.centralExtraEnd,
    );

    const localNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const localNameStart = entry.localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const localExtraEnd = localNameEnd + localExtraLength;
    if (
      localExtraEnd > centralDirectoryOffset ||
      !equalBytes(entry.nameBytes, bytes.subarray(localNameStart, localNameEnd))
    ) {
      throw new Error(
        "ZIP central-directory and local-header entry names do not match.",
      );
    }
    validateZipNameExtraFields(view, localNameEnd, localExtraEnd);
  }
}

function findZipEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(
    0,
    view.byteLength -
      ZIP_END_OF_CENTRAL_DIRECTORY_BYTES -
      ZIP_MAX_COMMENT_BYTES,
  );
  for (
    let offset = view.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset +
        ZIP_END_OF_CENTRAL_DIRECTORY_BYTES +
        view.getUint16(offset + 20, true) ===
        view.byteLength
    ) {
      return offset;
    }
  }
  throw new Error("ZIP end-of-central-directory record is missing.");
}

function decodeRawZipName(bytes: Uint8Array): string {
  if (
    bytes.byteLength === 0 ||
    bytes.some((byte) => byte < 0x21 || byte > 0x7e)
  ) {
    throw new Error("ZIP entry names must use canonical printable ASCII.");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function normalizedZipPathKey(name: string): string {
  const segments: string[] = [];
  for (const segment of name.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/").toLowerCase();
}

function canonicalZipEntryName(name: string): boolean {
  const path = name.endsWith("/") ? name.slice(0, -1) : name;
  return (
    (name.endsWith("/") ? safeDirectoryName(name) : safePartName(name)) &&
    !name.includes("%") &&
    !name.includes("?") &&
    !name.includes("#") &&
    path.split("/").every((segment) => /^[A-Za-z0-9_.\-[\]]+$/u.test(segment))
  );
}

function validateZipNameExtraFields(
  view: DataView,
  start: number,
  end: number,
): void {
  let offset = start;
  while (offset < end) {
    if (offset > end - 4) {
      throw new Error("ZIP entry extra fields are malformed.");
    }
    const id = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    offset += 4;
    if (length > end - offset) {
      throw new Error("ZIP entry extra field exceeds its declared bounds.");
    }
    if (id === ZIP_UNICODE_PATH_EXTRA_FIELD) {
      throw new Error(
        "ZIP Unicode-path indirection is outside the inspection profile.",
      );
    }
    offset += length;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}

function safePartName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    name
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function safeDirectoryName(name: string): boolean {
  return name.endsWith("/") && safePartName(name.slice(0, -1));
}

function xmlPartName(name: string): boolean {
  return (
    name === "[Content_Types].xml" ||
    name.endsWith(".xml") ||
    name.endsWith(".rels")
  );
}

function expanded(namespace: string, local: string): string {
  return `{${namespace}}${local}`;
}

function failedInspection(code: string, message: string): PptxInspectionResult {
  return {
    diagnostics: Object.freeze([
      { code, severity: "error", message } satisfies Diagnostic,
    ]),
  };
}

function invalidPptxDiagnostic(message: string): Diagnostic {
  return {
    code: "PPTV-RECONCILE-INVALID-PPTX",
    severity: "error",
    message,
  };
}

function listOrNone(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
