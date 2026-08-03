/**
 * Deterministic fresh-PPTX compiler canary for the strict C6 primitive subset.
 *
 * CONTRACT:C6-PPTV-RESOLVED.2.0
 * CONTRACT:C7-PPTX-CANARY.2.0
 * CONTRACT:C9-PPTV-PPTX-BASELINE.2.0
 */

import { createHash } from "node:crypto";

import JSZip from "jszip";

import type {
  Vector180Bounds,
  Vector180ResolvedDeck,
  Vector180ResolvedGroup,
  Vector180ResolvedLine,
  Vector180ResolvedObject,
  Vector180ResolvedRect,
  Vector180ResolvedDeckResult,
  Vector180ResolvedSlide,
  Vector180ResolvedStyle,
  Vector180ResolvedText,
} from "../core/resolved.js";

const FIXED_DATE_ISO = "2000-01-01T00:00:00Z";
const EMU_PER_UNIT = 7_620;
// 7,620 EMU/unit ÷ 127 EMU/hundredth-point. Text and frame geometry must use
// one physical scale or native PowerPoint can overflow a line that fits SVG.
const HUNDREDTH_POINTS_PER_UNIT = 60;
const MAX_SIGNED_INT_31 = 0x7fffffff;
const MASTER_ID = 0x80000000;
const MAX_CANARY_ZIP_BYTES = 128 * 1024 * 1024;
const MIN_COORDINATE_EMU = -27_273_042_329_600;
const MAX_COORDINATE_EMU = 27_273_042_316_900;
const MAX_LINE_WIDTH_EMU = 20_116_800;
const MAX_FONT_HUNDREDTH_POINTS = 400_000;
const MAX_SPACING_HUNDREDTH_POINTS = 158_400;
const MAX_TEXT_MARGIN_EMU = 51_206_400;
const PACKAGE_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const CANARY_SCHEMA = "vector180-pptx-canary/0.1" as const;
const CANARY_COMPILER = "office180-vector180-pptx-canary/0.1" as const;

const CONTENT_TYPES = {
  app: "application/vnd.openxmlformats-officedocument.extended-properties+xml",
  core: "application/vnd.openxmlformats-package.core-properties+xml",
  custom: "application/vnd.openxmlformats-officedocument.custom-properties+xml",
  layout:
    "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
  master:
    "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
  presProps:
    "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml",
  presentation:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  slide:
    "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
} as const;

const RELATIONSHIP_TYPES = {
  core: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  custom:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
  extended:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  layout:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
  master:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
  office:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  presProps:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps",
  slide:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  theme:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
} as const;

export type PptxCanaryErrorCode =
  | "VECTOR180-PPTX-FAMILY"
  | "VECTOR180-PPTX-UNRESOLVED"
  | "VECTOR180-PPTX-INVALID-MODEL"
  | "VECTOR180-PPTX-UNSUPPORTED-OBJECT"
  | "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY"
  | "VECTOR180-PPTX-NON-INTEGRAL-EMU"
  | "VECTOR180-PPTX-NON-INTEGRAL-FONT"
  | "VECTOR180-PPTX-ID-COLLISION"
  | "VECTOR180-PPTX-OPC-GRAPH"
  | "VECTOR180-PPTX-ZIP-LIMIT";

export class PptxCanaryCompileError extends Error {
  readonly code: PptxCanaryErrorCode;

  constructor(code: PptxCanaryErrorCode, message: string) {
    super(message);
    this.name = "PptxCanaryCompileError";
    this.code = code;
  }
}

export interface PptxCanaryPart {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface PptxCanaryRelationship {
  /** `null` is the package root. */
  readonly source: string | null;
  readonly id: string;
  readonly type: string;
  readonly target: string;
}

export interface PptxCanaryGraph {
  readonly parts: readonly PptxCanaryPart[];
  readonly relationships: readonly PptxCanaryRelationship[];
}

export interface Vector180PptxPart {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface Vector180PptxCanaryArtifact {
  readonly schema: typeof CANARY_SCHEMA;
  readonly compiler: typeof CANARY_COMPILER;
  readonly sourceSha256: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly parts: readonly Vector180PptxPart[];
}

/** Compatibility type name; the canonical public shape is Vector180-named. */
export type PptxCanaryArtifact = Vector180PptxCanaryArtifact;

interface PptxPackageArtifact extends Omit<
  Vector180PptxCanaryArtifact,
  "compiler"
> {
  readonly compiler: string;
}

/** @internal C9 package lineage; not re-exported from the public Node entry. */
export interface PptxCanaryPackageLineage {
  /**
   * Optional package lineage used by C9. Omitting every field preserves the
   * byte-exact C7 canary package.
   */
  readonly compiler?: string;
  readonly coreTitle?: string;
  readonly customProperties?: Readonly<Record<string, string>>;
}

interface SlideInfo {
  readonly slide: Vector180ResolvedSlide;
  readonly partNumber: number;
  readonly partName: string;
  readonly relationshipId: string;
  readonly numericId: number;
}

interface RenderContext {
  readonly slideId: string;
  readonly numericIds: ReadonlyMap<string, number>;
}

export async function compileVector180PptxCanary(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
): Promise<Vector180PptxCanaryArtifact> {
  const artifact = await compilePptxCanaryPackage(input, {});
  return Object.freeze({
    ...artifact,
    compiler: CANARY_COMPILER,
  });
}

/** Compatibility function name for the canonical C7 compiler. */
export async function compilePptxCanary(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
): Promise<PptxCanaryArtifact> {
  return compileVector180PptxCanary(input);
}

/** @internal C9 assembly hook; the public C7 canary remains byte-exact. */
export async function compilePptxCanaryWithLineage(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
  lineage: PptxCanaryPackageLineage,
): Promise<PptxPackageArtifact> {
  return compilePptxCanaryPackage(input, lineage);
}

async function compilePptxCanaryPackage(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
  lineage: PptxCanaryPackageLineage,
): Promise<PptxPackageArtifact> {
  const model = resolvedModel(input);
  const graph = createPptxCanaryGraphWithLineage(model, lineage);
  validatePptxCanaryGraph(graph);
  const packageParts = materializePackageParts(graph);
  if (packageParts.length > 65_535) {
    fail(
      "VECTOR180-PPTX-ZIP-LIMIT",
      "The canary package exceeds ZIP32 entries.",
    );
  }
  const estimatedZipBytes = packageParts.reduce(
    (total, part) =>
      total +
      part.bytes.byteLength +
      30 +
      part.name.length +
      46 +
      part.name.length,
    22,
  );
  if (
    !Number.isSafeInteger(estimatedZipBytes) ||
    estimatedZipBytes > 0xffffffff ||
    estimatedZipBytes > MAX_CANARY_ZIP_BYTES
  ) {
    fail(
      "VECTOR180-PPTX-ZIP-LIMIT",
      `The STORE package estimate (${estimatedZipBytes} bytes) exceeds the C7/ZIP32 budget.`,
    );
  }

  const zip = new JSZip();
  for (const part of packageParts) {
    zip.file(part.name, part.bytes, {
      binary: true,
      comment: "",
      compression: "STORE",
      createFolders: false,
      date: fixedZipDate(),
      dosPermissions: 0,
    });
  }
  const bytes = await zip.generateAsync({
    type: "uint8array",
    comment: "",
    compression: "STORE",
    mimeType: PACKAGE_MIME,
    platform: "DOS",
    streamFiles: false,
  });
  const compiler = lineage.compiler ?? CANARY_COMPILER;
  return Object.freeze({
    schema: CANARY_SCHEMA,
    compiler,
    sourceSha256: model.sourceSha256,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    parts: Object.freeze(
      packageParts.map((part) =>
        Object.freeze({ name: part.name, bytes: part.bytes }),
      ),
    ),
  });
}

export function createPptxCanaryGraph(
  model: Vector180ResolvedDeck,
): PptxCanaryGraph {
  return createPptxCanaryGraphWithLineage(model, {});
}

function createPptxCanaryGraphWithLineage(
  model: Vector180ResolvedDeck,
  lineage: PptxCanaryPackageLineage,
): PptxCanaryGraph {
  validateResolvedDeck(model);
  validatePackageLineage(lineage);
  const slideInfos = createSlideInfos(model.slides);
  const parts: PptxCanaryPart[] = [];
  const relationships: PptxCanaryRelationship[] = [];
  const addXml = (name: string, contentType: string, xml: string): void => {
    parts.push({
      name,
      contentType,
      bytes: new TextEncoder().encode(xml),
    });
  };

  addXml("docProps/app.xml", CONTENT_TYPES.app, renderAppProperties(model));
  addXml(
    "docProps/core.xml",
    CONTENT_TYPES.core,
    renderCoreProperties(lineage.coreTitle),
  );
  addXml(
    "docProps/custom.xml",
    CONTENT_TYPES.custom,
    renderCustomProperties(model, lineage),
  );
  addXml(
    "ppt/presentation.xml",
    CONTENT_TYPES.presentation,
    renderPresentation(model, slideInfos),
  );
  addXml(
    "ppt/presProps.xml",
    CONTENT_TYPES.presProps,
    renderPresentationProperties(),
  );
  addXml(
    "ppt/slideLayouts/slideLayout1.xml",
    CONTENT_TYPES.layout,
    renderBlankLayout(),
  );
  addXml(
    "ppt/slideMasters/slideMaster1.xml",
    CONTENT_TYPES.master,
    renderSlideMaster(),
  );
  addXml("ppt/theme/theme1.xml", CONTENT_TYPES.theme, renderTheme());

  for (const info of slideInfos) {
    addXml(info.partName, CONTENT_TYPES.slide, renderSlide(info.slide));
  }

  relationships.push(
    {
      source: null,
      id: "rId1",
      type: RELATIONSHIP_TYPES.office,
      target: "ppt/presentation.xml",
    },
    {
      source: null,
      id: "rId2",
      type: RELATIONSHIP_TYPES.core,
      target: "docProps/core.xml",
    },
    {
      source: null,
      id: "rId3",
      type: RELATIONSHIP_TYPES.extended,
      target: "docProps/app.xml",
    },
    {
      source: null,
      id: "rId4",
      type: RELATIONSHIP_TYPES.custom,
      target: "docProps/custom.xml",
    },
  );

  for (const info of slideInfos) {
    relationships.push({
      source: "ppt/presentation.xml",
      id: info.relationshipId,
      type: RELATIONSHIP_TYPES.slide,
      target: `slides/slide${info.partNumber}.xml`,
    });
  }
  relationships.push({
    source: "ppt/presentation.xml",
    id: `rId${slideInfos.length + 1}`,
    type: RELATIONSHIP_TYPES.master,
    target: "slideMasters/slideMaster1.xml",
  });
  relationships.push(
    {
      source: "ppt/presentation.xml",
      id: `rId${slideInfos.length + 2}`,
      type: RELATIONSHIP_TYPES.theme,
      target: "theme/theme1.xml",
    },
    {
      source: "ppt/presentation.xml",
      id: `rId${slideInfos.length + 3}`,
      type: RELATIONSHIP_TYPES.presProps,
      target: "presProps.xml",
    },
  );
  relationships.push(
    {
      source: "ppt/slideMasters/slideMaster1.xml",
      id: "rId1",
      type: RELATIONSHIP_TYPES.theme,
      target: "../theme/theme1.xml",
    },
    {
      source: "ppt/slideMasters/slideMaster1.xml",
      id: "rId2",
      type: RELATIONSHIP_TYPES.layout,
      target: "../slideLayouts/slideLayout1.xml",
    },
    {
      source: "ppt/slideLayouts/slideLayout1.xml",
      id: "rId1",
      type: RELATIONSHIP_TYPES.master,
      target: "../slideMasters/slideMaster1.xml",
    },
  );
  for (const info of slideInfos) {
    relationships.push({
      source: info.partName,
      id: "rId1",
      type: RELATIONSHIP_TYPES.layout,
      target: "../slideLayouts/slideLayout1.xml",
    });
  }

  return Object.freeze({
    parts: Object.freeze(parts),
    relationships: Object.freeze(relationships),
  });
}

export function validatePptxCanaryGraph(graph: PptxCanaryGraph): void {
  const parts = new Map<string, PptxCanaryPart>();
  const caseFoldedNames = new Set<string>();
  for (const part of graph.parts) {
    validatePartName(part.name);
    const folded = part.name.toLowerCase();
    if (caseFoldedNames.has(folded)) {
      graphFail(`Duplicate or case-colliding OPC part "${part.name}".`);
    }
    caseFoldedNames.add(folded);
    const expected = expectedContentType(part.name);
    if (expected === undefined || part.contentType !== expected) {
      graphFail(
        `Part "${part.name}" has content type "${part.contentType}", expected "${expected ?? "no canary part"}".`,
      );
    }
    if (!(part.bytes instanceof Uint8Array) || part.bytes.byteLength === 0) {
      graphFail(`Part "${part.name}" must contain non-empty bytes.`);
    }
    parts.set(part.name, part);
  }

  const slidePartNames = [...parts.keys()]
    .filter((name) => /^ppt\/slides\/slide[1-9]\d*\.xml$/u.test(name))
    .sort(partNameOrder);
  for (const [index, name] of slidePartNames.entries()) {
    if (name !== `ppt/slides/slide${index + 1}.xml`) {
      graphFail("Slide part numbers must be contiguous from slide1.xml.");
    }
  }
  if (slidePartNames.length === 0) {
    graphFail("The canary package requires at least one slide.");
  }
  const expectedParts = new Set([
    "docProps/app.xml",
    "docProps/core.xml",
    "docProps/custom.xml",
    "ppt/presentation.xml",
    "ppt/presProps.xml",
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/theme/theme1.xml",
    ...slidePartNames,
  ]);
  if (
    parts.size !== expectedParts.size ||
    [...parts.keys()].some((name) => !expectedParts.has(name))
  ) {
    graphFail("The content-part set differs from the exact C7 canary graph.");
  }

  const relationshipsBySource = new Map<
    string | null,
    PptxCanaryRelationship[]
  >();
  const relationshipKeys = new Set<string>();
  for (const relationship of graph.relationships) {
    if (relationship.source !== null && !parts.has(relationship.source)) {
      graphFail(
        `Relationship source "${relationship.source}" is not a content part.`,
      );
    }
    if (!/^rId[1-9]\d*$/u.test(relationship.id)) {
      graphFail(`Relationship ID "${relationship.id}" is not canonical.`);
    }
    const key = `${relationship.source ?? "<root>"}\0${relationship.id}`;
    if (relationshipKeys.has(key)) {
      graphFail(
        `Relationship ID "${relationship.id}" is duplicated for "${relationship.source ?? "<root>"}".`,
      );
    }
    relationshipKeys.add(key);
    const target = resolveRelationshipTarget(
      relationship.source,
      relationship.target,
    );
    if (!parts.has(target)) {
      graphFail(
        `Relationship "${relationship.id}" from "${relationship.source ?? "<root>"}" targets missing part "${target}".`,
      );
    }
    const siblings = relationshipsBySource.get(relationship.source) ?? [];
    siblings.push(relationship);
    relationshipsBySource.set(relationship.source, siblings);
  }

  const expectedRelationships: PptxCanaryRelationship[] = [
    {
      source: null,
      id: "rId1",
      type: RELATIONSHIP_TYPES.office,
      target: "ppt/presentation.xml",
    },
    {
      source: null,
      id: "rId2",
      type: RELATIONSHIP_TYPES.core,
      target: "docProps/core.xml",
    },
    {
      source: null,
      id: "rId3",
      type: RELATIONSHIP_TYPES.extended,
      target: "docProps/app.xml",
    },
    {
      source: null,
      id: "rId4",
      type: RELATIONSHIP_TYPES.custom,
      target: "docProps/custom.xml",
    },
    ...slidePartNames.map((name, index) => ({
      source: "ppt/presentation.xml",
      id: `rId${index + 1}`,
      type: RELATIONSHIP_TYPES.slide,
      target: `slides/${name.slice("ppt/slides/".length)}`,
    })),
    {
      source: "ppt/presentation.xml",
      id: `rId${slidePartNames.length + 1}`,
      type: RELATIONSHIP_TYPES.master,
      target: "slideMasters/slideMaster1.xml",
    },
    {
      source: "ppt/presentation.xml",
      id: `rId${slidePartNames.length + 2}`,
      type: RELATIONSHIP_TYPES.theme,
      target: "theme/theme1.xml",
    },
    {
      source: "ppt/presentation.xml",
      id: `rId${slidePartNames.length + 3}`,
      type: RELATIONSHIP_TYPES.presProps,
      target: "presProps.xml",
    },
    {
      source: "ppt/slideMasters/slideMaster1.xml",
      id: "rId1",
      type: RELATIONSHIP_TYPES.theme,
      target: "../theme/theme1.xml",
    },
    {
      source: "ppt/slideMasters/slideMaster1.xml",
      id: "rId2",
      type: RELATIONSHIP_TYPES.layout,
      target: "../slideLayouts/slideLayout1.xml",
    },
    {
      source: "ppt/slideLayouts/slideLayout1.xml",
      id: "rId1",
      type: RELATIONSHIP_TYPES.master,
      target: "../slideMasters/slideMaster1.xml",
    },
    ...slidePartNames.map((name) => ({
      source: name,
      id: "rId1",
      type: RELATIONSHIP_TYPES.layout,
      target: "../slideLayouts/slideLayout1.xml",
    })),
  ];
  const actualRelationSet = new Set(graph.relationships.map(relationshipKey));
  const expectedRelationSet = new Set(
    expectedRelationships.map(relationshipKey),
  );
  if (
    actualRelationSet.size !== expectedRelationSet.size ||
    [...actualRelationSet].some((key) => !expectedRelationSet.has(key))
  ) {
    graphFail("The relationship set differs from the exact C7 canary graph.");
  }

  const reachable = new Set<string>();
  const queue = [...(relationshipsBySource.get(null) ?? [])].map(
    (relationship) => resolveRelationshipTarget(null, relationship.target),
  );
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || reachable.has(name)) continue;
    reachable.add(name);
    for (const relationship of relationshipsBySource.get(name) ?? []) {
      queue.push(resolveRelationshipTarget(name, relationship.target));
    }
  }
  for (const name of parts.keys()) {
    if (!reachable.has(name)) {
      graphFail(`Content part "${name}" is unreachable from package root.`);
    }
  }
}

function resolvedModel(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
): Vector180ResolvedDeck {
  if ("schema" in input) return input;
  if (input.model !== undefined) {
    assertCanonicalSourceFamily(input.model);
  }
  if (
    input.model === undefined ||
    input.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "fatal",
    )
  ) {
    fail(
      "VECTOR180-PPTX-UNRESOLVED",
      "C7 requires a complete C6 model with no error diagnostics.",
    );
  }
  return input.model;
}

function validateResolvedDeck(model: Vector180ResolvedDeck): void {
  assertCanonicalSourceFamily(model);
  if (
    model.schema !== "vector180-resolved-deck/0.1" ||
    !/^[0-9a-f]{64}$/u.test(model.sourceSha256) ||
    model.activeTheme.length === 0 ||
    model.canvas.widthEmu !== 12_192_000 ||
    model.canvas.heightEmu !== 6_858_000 ||
    model.canvas.emuPerUnit !== EMU_PER_UNIT ||
    model.canvas.viewBox.length !== 4 ||
    model.canvas.viewBox.some(
      (value, index) => value !== ([0, 0, 1600, 900] as const)[index],
    )
  ) {
    fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      "Resolved deck does not carry the exact C6 schema, hash, theme, and 16:9 canvas.",
    );
  }
  if (model.slides.length === 0) {
    fail("VECTOR180-PPTX-INVALID-MODEL", "A PPTX requires at least one slide.");
  }

  const slideIds = new Set<string>();
  for (const [slideIndex, slide] of model.slides.entries()) {
    if (
      slide.id.length === 0 ||
      slide.order !== slideIndex ||
      slideIds.has(slide.id)
    ) {
      fail(
        "VECTOR180-PPTX-INVALID-MODEL",
        `Slide identity/order is inconsistent at position ${slideIndex}.`,
      );
    }
    slideIds.add(slide.id);
    const objectIds = new Set<string>();
    validateSiblings(slide.objects, slide.id, null, { x: 0, y: 0 }, objectIds);
    allocateNumericIds([...objectIds], `slide "${slide.id}"`);
  }
  allocateSlideNumericIds(model.slides.map((slide) => slide.id));
}

function assertCanonicalSourceFamily(model: {
  readonly sourceWireFamily?: unknown;
}): void {
  if (model.sourceWireFamily !== "vector180") {
    fail(
      "VECTOR180-PPTX-FAMILY",
      "C7 accepts only resolved source whose wire family is exactly vector180.",
    );
  }
}

function validateSiblings(
  objects: readonly Vector180ResolvedObject[],
  slideId: string,
  parentId: string | null,
  parentWorldOffset: { readonly x: number; readonly y: number },
  objectIds: Set<string>,
): void {
  for (const [index, object] of objects.entries()) {
    if (
      object.id.length === 0 ||
      objectIds.has(object.id) ||
      object.slideId !== slideId ||
      object.parentId !== parentId ||
      object.order !== index
    ) {
      fail(
        "VECTOR180-PPTX-INVALID-MODEL",
        `Object identity/parent/order is inconsistent for "${object.id}".`,
      );
    }
    objectIds.add(object.id);
    validateStyle(object.style, object.id);
    validateBounds(object.localBounds, `${object.id} local bounds`);
    validateBounds(object.worldBounds, `${object.id} world bounds`);

    const expectedOffset =
      object.kind === "group"
        ? {
            x: parentWorldOffset.x + object.translateX,
            y: parentWorldOffset.y + object.translateY,
          }
        : parentWorldOffset;
    if (
      !sameNumber(object.worldOffset.x, expectedOffset.x) ||
      !sameNumber(object.worldOffset.y, expectedOffset.y) ||
      !sameNumber(
        object.worldBounds.x,
        object.localBounds.x + expectedOffset.x,
      ) ||
      !sameNumber(
        object.worldBounds.y,
        object.localBounds.y + expectedOffset.y,
      ) ||
      !sameNumber(object.worldBounds.width, object.localBounds.width) ||
      !sameNumber(object.worldBounds.height, object.localBounds.height)
    ) {
      fail(
        "VECTOR180-PPTX-INVALID-MODEL",
        `World geometry is inconsistent for object "${object.id}".`,
      );
    }

    validateObjectGeometry(object);
    if (object.kind === "group") {
      validateSiblings(
        object.children,
        slideId,
        object.id,
        object.worldOffset,
        objectIds,
      );
      validateGroupBounds(object);
    }
  }
}

function validateObjectGeometry(object: Vector180ResolvedObject): void {
  switch (object.kind) {
    case "rect":
      positive(object.width, `${object.id} width`);
      positive(object.height, `${object.id} height`);
      if (
        !sameBounds(object.localBounds, {
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
        })
      ) {
        invalidModel(
          `Rectangle geometry differs from bounds for "${object.id}".`,
        );
      }
      return;
    case "ellipse": {
      positive(object.rx, `${object.id} rx`);
      positive(object.ry, `${object.id} ry`);
      if (
        !sameBounds(object.localBounds, {
          x: object.cx - object.rx,
          y: object.cy - object.ry,
          width: object.rx * 2,
          height: object.ry * 2,
        })
      ) {
        invalidModel(
          `Ellipse geometry differs from bounds for "${object.id}".`,
        );
      }
      return;
    }
    case "line": {
      finite(object.x1, `${object.id} x1`);
      finite(object.y1, `${object.id} y1`);
      finite(object.x2, `${object.id} x2`);
      finite(object.y2, `${object.id} y2`);
      if (object.x1 === object.x2 && object.y1 === object.y2) {
        invalidModel(`Line "${object.id}" has identical endpoints.`);
      }
      if (
        !sameBounds(object.localBounds, {
          x: Math.min(object.x1, object.x2),
          y: Math.min(object.y1, object.y2),
          width: Math.abs(object.x2 - object.x1),
          height: Math.abs(object.y2 - object.y1),
        })
      ) {
        invalidModel(`Line geometry differs from bounds for "${object.id}".`);
      }
      return;
    }
    case "text": {
      if (object.lines.length !== 1) {
        fail(
          "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
          `Text "${object.id}" has ${object.lines.length} hard lines; C7 accepts exactly one.`,
        );
      }
      if (
        object.wrap !== "none" ||
        object.autofit !== "none" ||
        Object.values(object.margins).some((value) => value !== 0)
      ) {
        invalidModel(`Text intent is inconsistent for "${object.id}".`);
      }
      if (
        object.style.fontFamily === undefined ||
        object.style.fontSize === undefined
      ) {
        invalidModel(`Text "${object.id}" lacks a concrete font.`);
      }
      positive(object.frame.width, `${object.id} frame width`);
      positive(object.frame.height, `${object.id} frame height`);
      positive(object.lineStep, `${object.id} line step`);
      if (!sameBounds(object.localBounds, object.frame)) {
        invalidModel(`Text frame differs from bounds for "${object.id}".`);
      }
      const line = object.lines[0];
      if (
        line === undefined ||
        line.x < object.frame.x ||
        line.x > object.frame.x + object.frame.width ||
        line.y < object.frame.y ||
        line.y > object.frame.y + object.frame.height
      ) {
        invalidModel(`Text line lies outside frame for "${object.id}".`);
      }
      return;
    }
    case "group":
      if (object.children.length === 0) {
        invalidModel(`Group "${object.id}" has no emitted children.`);
      }
      return;
    case "svg-asset":
    case "raster-asset":
      return;
    default:
      return assertNever(object);
  }
}

function validateGroupBounds(object: Vector180ResolvedGroup): void {
  const first = object.children[0];
  if (first === undefined) {
    invalidModel(`Group "${object.id}" has no emitted children.`);
  }
  let minX = first.worldBounds.x;
  let minY = first.worldBounds.y;
  let maxX = first.worldBounds.x + first.worldBounds.width;
  let maxY = first.worldBounds.y + first.worldBounds.height;
  for (const child of object.children.slice(1)) {
    minX = Math.min(minX, child.worldBounds.x);
    minY = Math.min(minY, child.worldBounds.y);
    maxX = Math.max(maxX, child.worldBounds.x + child.worldBounds.width);
    maxY = Math.max(maxY, child.worldBounds.y + child.worldBounds.height);
  }
  const worldBounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
  const localBounds = {
    x: minX - object.worldOffset.x,
    y: minY - object.worldOffset.y,
    width: worldBounds.width,
    height: worldBounds.height,
  };
  if (
    !sameBounds(object.worldBounds, worldBounds) ||
    !sameBounds(object.localBounds, localBounds)
  ) {
    invalidModel(
      `Group bounds are not the union of children for "${object.id}".`,
    );
  }
}

function validateStyle(style: Vector180ResolvedStyle, objectId: string): void {
  if (
    !validPaint(style.fill) ||
    !validPaint(style.stroke) ||
    !Number.isFinite(style.strokeWidth) ||
    style.strokeWidth < 0 ||
    !Number.isFinite(style.opacity) ||
    style.opacity !== 1 ||
    (style.fontSize !== undefined &&
      (!Number.isFinite(style.fontSize) || style.fontSize <= 0)) ||
    ![400, 700].includes(style.fontWeight) ||
    !["normal", "italic"].includes(style.fontStyle) ||
    !["start", "middle", "end"].includes(style.textAnchor)
  ) {
    if (style.opacity !== 1) {
      fail(
        "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
        `Object "${objectId}" opacity must be exactly 1 in C7.`,
      );
    }
    invalidModel(`Resolved style is inconsistent for "${objectId}".`);
  }
}

function createSlideInfos(
  slides: readonly Vector180ResolvedSlide[],
): readonly SlideInfo[] {
  const sortedIds = slides.map((slide) => slide.id).sort(compareText);
  const partNumberById = new Map(
    sortedIds.map((id, index) => [id, index + 1] as const),
  );
  const numericIds = allocateSlideNumericIds(sortedIds);
  return Object.freeze(
    slides.map((slide) => {
      const partNumber = requiredMap(partNumberById, slide.id);
      return Object.freeze({
        slide,
        partNumber,
        partName: `ppt/slides/slide${partNumber}.xml`,
        relationshipId: `rId${partNumber}`,
        numericId: requiredMap(numericIds, slide.id),
      });
    }),
  );
}

function renderAppProperties(model: Vector180ResolvedDeck): string {
  const titles = model.slides
    .map((slide) => `      <vt:lpstr>${xmlText(slide.id)}</vt:lpstr>`)
    .join("\n");
  const hidden = model.slides.filter((slide) => slide.hidden).length;
  return xmlDocument(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>office180 Vector180</Application>
  <PresentationFormat>On-screen Show (16:9)</PresentationFormat>
  <Slides>${model.slides.length}</Slides>
  <Notes>0</Notes>
  <HiddenSlides>${hidden}</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <TitlesOfParts>
    <vt:vector size="${model.slides.length}" baseType="lpstr">
${titles}
    </vt:vector>
  </TitlesOfParts>
  <Company>Office180</Company>
  <AppVersion>0.1</AppVersion>
</Properties>`);
}

function renderCoreProperties(
  title = "Vector180 deterministic compiler canary",
): string {
  return xmlDocument(`<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlText(title)}</dc:title>
  <dc:creator>office180</dc:creator>
  <cp:lastModifiedBy>office180</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_DATE_ISO}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_DATE_ISO}</dcterms:modified>
</cp:coreProperties>`);
}

function renderCustomProperties(
  model: Vector180ResolvedDeck,
  lineage: PptxCanaryPackageLineage,
): string {
  const values = [
    ["vector180.compiler", lineage.compiler ?? CANARY_COMPILER],
    ["vector180.resolvedSchema", model.schema],
    ["vector180.activeTheme", model.activeTheme],
    ["vector180.sourceSha256", model.sourceSha256],
    ...Object.entries(lineage.customProperties ?? {}).sort(([left], [right]) =>
      compareText(left, right),
    ),
  ] as const;
  return xmlDocument(`<Properties
  xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
${values
  .map(
    ([name, value], index) =>
      `  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${xmlAttribute(name)}"><vt:lpwstr>${xmlText(value)}</vt:lpwstr></property>`,
  )
  .join("\n")}
</Properties>`);
}

function validatePackageLineage(lineage: PptxCanaryPackageLineage): void {
  if (
    lineage.compiler?.toLowerCase().includes("pptv") === true ||
    Object.keys(lineage.customProperties ?? {}).some((name) =>
      name.toLowerCase().startsWith("pptv."),
    )
  ) {
    fail(
      "VECTOR180-PPTX-FAMILY",
      "Legacy PPTV package lineage cannot enter the canonical Vector180 compiler.",
    );
  }
  for (const [label, value] of [
    ["compiler", lineage.compiler],
    ["core title", lineage.coreTitle],
  ] as const) {
    if (value !== undefined && value.length === 0) {
      fail(
        "VECTOR180-PPTX-INVALID-MODEL",
        `The ${label} option cannot be empty.`,
      );
    }
  }
  const reserved = new Set([
    "vector180.compiler",
    "vector180.resolvedSchema",
    "vector180.activeTheme",
    "vector180.sourceSha256",
  ]);
  for (const [name, value] of Object.entries(lineage.customProperties ?? {})) {
    if (
      name.length === 0 ||
      value.length === 0 ||
      reserved.has(name) ||
      /[\u0000-\u001f\u007f]/u.test(name) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    ) {
      fail(
        "VECTOR180-PPTX-INVALID-MODEL",
        `Invalid or reserved custom package property "${name}".`,
      );
    }
  }
}

function renderPresentation(
  model: Vector180ResolvedDeck,
  slideInfos: readonly SlideInfo[],
): string {
  const infoById = new Map(
    slideInfos.map((info) => [info.slide.id, info] as const),
  );
  const slideIds = model.slides
    .map((slide) => {
      const info = requiredMap(infoById, slide.id);
      return `    <p:sldId id="${info.numericId}" r:id="${info.relationshipId}"/>`;
    })
    .join("\n");
  return xmlDocument(`<p:presentation
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="${MASTER_ID}" r:id="rId${slideInfos.length + 1}"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideIds}
  </p:sldIdLst>
  <p:sldSz cx="${model.canvas.widthEmu}" cy="${model.canvas.heightEmu}" type="screen16x9"/>
  <p:notesSz cx="${model.canvas.heightEmu}" cy="${model.canvas.widthEmu}"/>
  <p:defaultTextStyle/>
</p:presentation>`);
}

function renderPresentationProperties(): string {
  return xmlDocument(
    `<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`,
  );
}

function renderBlankLayout(): string {
  return xmlDocument(`<p:sldLayout
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);
}

function renderSlideMaster(): string {
  return xmlDocument(`<p:sldMaster
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Vector180 Blank Master">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
    accent1="accent1" accent2="accent2" accent3="accent3"
    accent4="accent4" accent5="accent5" accent6="accent6"
    hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId2"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle/>
    <p:bodyStyle/>
    <p:otherStyle/>
  </p:txStyles>
</p:sldMaster>`);
}

function renderTheme(): string {
  return xmlDocument(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Vector180 Canary">
  <a:themeElements>
    <a:clrScheme name="Vector180 Canary">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="17211E"/></a:dk2>
      <a:lt2><a:srgbClr val="F4F6F5"/></a:lt2>
      <a:accent1><a:srgbClr val="3D7A6A"/></a:accent1>
      <a:accent2><a:srgbClr val="D06B47"/></a:accent2>
      <a:accent3><a:srgbClr val="7297A7"/></a:accent3>
      <a:accent4><a:srgbClr val="D8A93E"/></a:accent4>
      <a:accent5><a:srgbClr val="7566A8"/></a:accent5>
      <a:accent6><a:srgbClr val="7A9854"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Vector180 Canary">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Vector180 Canary">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="7620"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="15240"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="22860"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`);
}

function renderSlide(slide: Vector180ResolvedSlide): string {
  const objectIds = collectObjectIds(slide.objects);
  const context: RenderContext = {
    slideId: slide.id,
    numericIds: allocateNumericIds(objectIds, `slide "${slide.id}"`),
  };
  const shapes = slide.objects
    .map((object) => renderObject(object, context, "    "))
    .join("");
  return xmlDocument(`<p:sld
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${slide.hidden ? ' show="0"' : ""}>
  <p:cSld name="${xmlAttribute(`src.${slide.id}`)}">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${shapes}    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);
}

function renderObject(
  object: Vector180ResolvedObject,
  context: RenderContext,
  indent: string,
): string {
  switch (object.kind) {
    case "rect":
      return renderRect(object, context, indent);
    case "ellipse":
      return renderEllipse(object, context, indent);
    case "line":
      return renderLine(object, context, indent);
    case "text":
      return renderText(object, context, indent);
    case "group":
      return renderGroup(object, context, indent);
    case "svg-asset":
    case "raster-asset":
      return fail(
        "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
        `C7 cannot compile ${object.kind} object "${object.id}".`,
      );
    default:
      return assertNever(object);
  }
}

function renderRect(
  object: Vector180ResolvedRect,
  context: RenderContext,
  indent: string,
): string {
  if (object.rx !== undefined || object.ry !== undefined) {
    return fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `Rounded rectangle "${object.id}" is outside the C7 canary.`,
    );
  }
  return renderPrimitiveShape(
    object.id,
    "rect",
    {
      x: coordinateEmu(object.x, `${object.id}.x`),
      y: coordinateEmu(object.y, `${object.id}.y`),
      width: positiveExtentEmu(object.width, `${object.id}.width`),
      height: positiveExtentEmu(object.height, `${object.id}.height`),
    },
    object.style,
    context,
    indent,
  );
}

function renderEllipse(
  object: Extract<Vector180ResolvedObject, { readonly kind: "ellipse" }>,
  context: RenderContext,
  indent: string,
): string {
  const radiusX = positiveExtentEmu(object.rx, `${object.id}.rx`);
  const radiusY = positiveExtentEmu(object.ry, `${object.id}.ry`);
  const centerX = coordinateEmu(object.cx, `${object.id}.cx`);
  const centerY = coordinateEmu(object.cy, `${object.id}.cy`);
  const x = centerX - radiusX;
  const y = centerY - radiusY;
  const width = radiusX * 2;
  const height = radiusY * 2;
  assertCoordinateRange(x, `${object.id}.ellipse.x`);
  assertCoordinateRange(y, `${object.id}.ellipse.y`);
  assertExtentRange(width, `${object.id}.ellipse.width`, true);
  assertExtentRange(height, `${object.id}.ellipse.height`, true);
  return renderPrimitiveShape(
    object.id,
    "ellipse",
    {
      x,
      y,
      width,
      height,
    },
    object.style,
    context,
    indent,
  );
}

function renderPrimitiveShape(
  id: string,
  preset: "rect" | "ellipse",
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  style: Vector180ResolvedStyle,
  context: RenderContext,
  indent: string,
): string {
  const numericId = requiredMap(context.numericIds, id);
  return `${indent}<p:sp>
${indent}  <p:nvSpPr>
${indent}    <p:cNvPr id="${numericId}" name="${xmlAttribute(`src.${id}`)}"/>
${indent}    <p:cNvSpPr/>
${indent}    <p:nvPr/>
${indent}  </p:nvSpPr>
${indent}  <p:spPr>
${renderTransform(bounds, `${indent}    `)}
${indent}    <a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>
${renderFill(style, `${indent}    `)}
${renderLineStyle(style, `${indent}    `)}
${indent}  </p:spPr>
${indent}</p:sp>
`;
}

function renderLine(
  object: Vector180ResolvedLine,
  context: RenderContext,
  indent: string,
): string {
  const x1 = coordinateEmu(object.x1, `${object.id}.x1`);
  const y1 = coordinateEmu(object.y1, `${object.id}.y1`);
  const x2 = coordinateEmu(object.x2, `${object.id}.x2`);
  const y2 = coordinateEmu(object.y2, `${object.id}.y2`);
  assertExtentRange(Math.abs(x2 - x1), `${object.id}.line.width`, false);
  assertExtentRange(Math.abs(y2 - y1), `${object.id}.line.height`, false);
  const flipH = x1 > x2 ? ' flipH="1"' : "";
  const flipV = y1 > y2 ? ' flipV="1"' : "";
  const numericId = requiredMap(context.numericIds, object.id);
  return `${indent}<p:cxnSp>
${indent}  <p:nvCxnSpPr>
${indent}    <p:cNvPr id="${numericId}" name="${xmlAttribute(`src.${object.id}`)}"/>
${indent}    <p:cNvCxnSpPr/>
${indent}    <p:nvPr/>
${indent}  </p:nvCxnSpPr>
${indent}  <p:spPr>
${indent}    <a:xfrm${flipH}${flipV}>
${indent}      <a:off x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}"/>
${indent}      <a:ext cx="${Math.abs(x2 - x1)}" cy="${Math.abs(y2 - y1)}"/>
${indent}    </a:xfrm>
${indent}    <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
${renderLineStyle(object.style, `${indent}    `)}
${indent}  </p:spPr>
${indent}</p:cxnSp>
`;
}

function renderText(
  object: Vector180ResolvedText,
  context: RenderContext,
  indent: string,
): string {
  if (object.lines.length !== 1) {
    return fail(
      "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
      `Text "${object.id}" has ${object.lines.length} hard lines; C7 accepts exactly one.`,
    );
  }
  const line = object.lines[0];
  if (line === undefined) {
    return fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      `Text "${object.id}" has no hard line.`,
    );
  }
  const fontFamily = object.style.fontFamily;
  const fontSize = object.style.fontSize;
  if (fontFamily === undefined || fontSize === undefined) {
    return fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      `Text "${object.id}" lacks a concrete font family and size.`,
    );
  }
  const frame = {
    x: coordinateEmu(object.frame.x, `${object.id}.frame.x`),
    y: coordinateEmu(object.frame.y, `${object.id}.frame.y`),
    width: positiveExtentEmu(object.frame.width, `${object.id}.frame.width`),
    height: positiveExtentEmu(object.frame.height, `${object.id}.frame.height`),
  };
  const anchorX = coordinateEmu(line.x, `${object.id}.line.x`);
  coordinateEmu(line.y, `${object.id}.line.y`);
  const lineStep = spacingHundredthPoints(
    object.lineStep,
    `${object.id}.lineStep`,
  );
  const fontSizePoints = fontHundredthPoints(fontSize, `${object.id}.fontSize`);
  const relativeX = anchorX - frame.x;
  if (relativeX < 0 || relativeX > frame.width) {
    return fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      `Text anchor for "${object.id}" lies outside its frame.`,
    );
  }
  const margins = paragraphMargins(object.anchor, relativeX, frame.width);
  const alignment =
    object.anchor === "start" ? "l" : object.anchor === "middle" ? "ctr" : "r";
  const numericId = requiredMap(context.numericIds, object.id);
  return `${indent}<p:sp>
${indent}  <p:nvSpPr>
${indent}    <p:cNvPr id="${numericId}" name="${xmlAttribute(`src.${object.id}`)}"/>
${indent}    <p:cNvSpPr txBox="1"/>
${indent}    <p:nvPr/>
${indent}  </p:nvSpPr>
${indent}  <p:spPr>
${renderTransform(frame, `${indent}    `)}
${indent}    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
${indent}    <a:noFill/>
${indent}    <a:ln><a:noFill/></a:ln>
${indent}  </p:spPr>
${indent}  <p:txBody>
${indent}    <a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr>
${indent}    <a:lstStyle/>
${indent}    <a:p>
${indent}      <a:pPr algn="${alignment}" marL="${margins.left}" marR="${margins.right}" indent="0">
${indent}        <a:lnSpc><a:spcPts val="${lineStep}"/></a:lnSpc>
${indent}        <a:spcBef><a:spcPts val="0"/></a:spcBef>
${indent}        <a:spcAft><a:spcPts val="0"/></a:spcAft>
${indent}        <a:buNone/>
${indent}      </a:pPr>
${indent}      <a:r>
${indent}        <a:rPr lang="en-US" sz="${fontSizePoints}" b="${object.style.fontWeight === 700 ? 1 : 0}" i="${object.style.fontStyle === "italic" ? 1 : 0}" dirty="0">
${renderTextOutline(object.style, `${indent}          `)}
${renderFill(object.style, `${indent}          `)}
${indent}          <a:latin typeface="${xmlAttribute(fontFamily)}"/>
${indent}          <a:ea typeface="${xmlAttribute(fontFamily)}"/>
${indent}          <a:cs typeface="${xmlAttribute(fontFamily)}"/>
${indent}        </a:rPr>
${indent}        <a:t${drawingTextSpaceAttribute(line.text)}>${xmlText(line.text)}</a:t>
${indent}      </a:r>
${indent}      <a:endParaRPr lang="en-US" sz="${fontSizePoints}" b="${object.style.fontWeight === 700 ? 1 : 0}" i="${object.style.fontStyle === "italic" ? 1 : 0}" dirty="0">
${renderTextOutline(object.style, `${indent}        `)}
${renderFill(object.style, `${indent}        `)}
${indent}        <a:latin typeface="${xmlAttribute(fontFamily)}"/>
${indent}        <a:ea typeface="${xmlAttribute(fontFamily)}"/>
${indent}        <a:cs typeface="${xmlAttribute(fontFamily)}"/>
${indent}      </a:endParaRPr>
${indent}    </a:p>
${indent}  </p:txBody>
${indent}</p:sp>
`;
}

function renderGroup(
  object: Vector180ResolvedGroup,
  context: RenderContext,
  indent: string,
): string {
  if (object.style.opacity !== 1) {
    return fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `Group "${object.id}" opacity cannot be represented by the C7 canary.`,
    );
  }
  if (object.localBounds.width <= 0 || object.localBounds.height <= 0) {
    return fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `Group "${object.id}" requires positive two-dimensional bounds.`,
    );
  }
  const localX = coordinateEmu(object.localBounds.x, `${object.id}.bounds.x`);
  const localY = coordinateEmu(object.localBounds.y, `${object.id}.bounds.y`);
  const translateX = coordinateEmu(
    object.translateX,
    `${object.id}.translateX`,
  );
  const translateY = coordinateEmu(
    object.translateY,
    `${object.id}.translateY`,
  );
  const width = positiveExtentEmu(
    object.localBounds.width,
    `${object.id}.bounds.width`,
  );
  const height = positiveExtentEmu(
    object.localBounds.height,
    `${object.id}.bounds.height`,
  );
  const numericId = requiredMap(context.numericIds, object.id);
  assertCoordinateRange(localX + translateX, `${object.id}.group.x`);
  assertCoordinateRange(localY + translateY, `${object.id}.group.y`);
  const children = object.children
    .map((child) => renderObject(child, context, `${indent}  `))
    .join("");
  return `${indent}<p:grpSp>
${indent}  <p:nvGrpSpPr>
${indent}    <p:cNvPr id="${numericId}" name="${xmlAttribute(`src.${object.id}`)}"/>
${indent}    <p:cNvGrpSpPr/>
${indent}    <p:nvPr/>
${indent}  </p:nvGrpSpPr>
${indent}  <p:grpSpPr>
${indent}    <a:xfrm>
${indent}      <a:off x="${localX + translateX}" y="${localY + translateY}"/>
${indent}      <a:ext cx="${width}" cy="${height}"/>
${indent}      <a:chOff x="${localX}" y="${localY}"/>
${indent}      <a:chExt cx="${width}" cy="${height}"/>
${indent}    </a:xfrm>
${indent}  </p:grpSpPr>
${children}${indent}</p:grpSp>
`;
}

function renderTransform(
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  indent: string,
): string {
  return `${indent}<a:xfrm>
${indent}  <a:off x="${bounds.x}" y="${bounds.y}"/>
${indent}  <a:ext cx="${bounds.width}" cy="${bounds.height}"/>
${indent}</a:xfrm>`;
}

function renderFill(style: Vector180ResolvedStyle, indent: string): string {
  return renderPaint(style.fill, style.opacity, "fill", indent);
}

function renderLineStyle(
  style: Vector180ResolvedStyle,
  indent: string,
): string {
  const width = lineWidthEmu(style.strokeWidth, "stroke-width");
  if (style.stroke === "none") {
    return `${indent}<a:ln w="${width}"><a:noFill/></a:ln>`;
  }
  return `${indent}<a:ln w="${width}">
${renderPaint(style.stroke, style.opacity, "stroke", `${indent}  `)}
${indent}</a:ln>`;
}

function renderTextOutline(
  style: Vector180ResolvedStyle,
  indent: string,
): string {
  const width = lineWidthEmu(style.strokeWidth, "text stroke-width");
  if (style.stroke === "none") {
    return `${indent}<a:ln w="${width}"><a:noFill/></a:ln>`;
  }
  return `${indent}<a:ln w="${width}">
${renderPaint(style.stroke, style.opacity, "text stroke", `${indent}  `)}
${indent}</a:ln>`;
}

function renderPaint(
  paint: string,
  opacity: number,
  label: string,
  indent: string,
): string {
  if (paint === "none") return `${indent}<a:noFill/>`;
  if (opacity !== 1) {
    return fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `${label} opacity must be exactly 1 in C7.`,
    );
  }
  if (!/^#[0-9a-f]{6}$/u.test(paint)) {
    return fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      `Unsupported ${label} paint "${paint}".`,
    );
  }
  const color = paint.slice(1).toUpperCase();
  return `${indent}<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
}

function paragraphMargins(
  anchor: "start" | "middle" | "end",
  relativeX: number,
  frameWidth: number,
): { readonly left: number; readonly right: number } {
  let result: { left: number; right: number };
  if (anchor === "start") {
    result = { left: relativeX, right: 0 };
  } else if (anchor === "end") {
    result = { left: 0, right: frameWidth - relativeX };
  } else {
    const halfSpan = Math.min(relativeX, frameWidth - relativeX);
    result = {
      left: relativeX - halfSpan,
      right: frameWidth - relativeX - halfSpan,
    };
  }
  for (const [side, value] of Object.entries(result)) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_TEXT_MARGIN_EMU) {
      fail(
        "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
        `Paragraph ${side} margin ${value} is outside DrawingML range.`,
      );
    }
  }
  return result;
}

function materializePackageParts(
  graph: PptxCanaryGraph,
): readonly { readonly name: string; readonly bytes: Uint8Array }[] {
  const encoder = new TextEncoder();
  const packageParts: { name: string; bytes: Uint8Array }[] = graph.parts.map(
    (part) => ({ name: part.name, bytes: part.bytes }),
  );
  packageParts.push({
    name: "[Content_Types].xml",
    bytes: encoder.encode(renderContentTypes(graph.parts)),
  });

  const relationshipsBySource = new Map<
    string | null,
    PptxCanaryRelationship[]
  >();
  for (const relationship of graph.relationships) {
    const siblings = relationshipsBySource.get(relationship.source) ?? [];
    siblings.push(relationship);
    relationshipsBySource.set(relationship.source, siblings);
  }
  for (const [source, relationships] of relationshipsBySource) {
    packageParts.push({
      name: relationshipPartName(source),
      bytes: encoder.encode(renderRelationships(relationships)),
    });
  }

  const names = new Set<string>();
  for (const part of packageParts) {
    if (names.has(part.name)) {
      graphFail(`Materialized package part "${part.name}" is duplicated.`);
    }
    names.add(part.name);
    if (part.bytes.byteLength > 0xffffffff) {
      fail(
        "VECTOR180-PPTX-ZIP-LIMIT",
        `Part "${part.name}" exceeds ZIP32 size limits.`,
      );
    }
  }
  packageParts.sort((left, right) => compareText(left.name, right.name));
  return Object.freeze(packageParts);
}

function renderContentTypes(parts: readonly PptxCanaryPart[]): string {
  const overrides = [...parts]
    .sort((left, right) => compareText(left.name, right.name))
    .map(
      (part) =>
        `  <Override PartName="/${xmlAttribute(part.name)}" ContentType="${xmlAttribute(part.contentType)}"/>`,
    )
    .join("\n");
  return xmlDocument(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${overrides}
</Types>`);
}

function renderRelationships(
  relationships: readonly PptxCanaryRelationship[],
): string {
  const body = [...relationships]
    .sort(
      (left, right) =>
        relationshipIdNumber(left.id) - relationshipIdNumber(right.id),
    )
    .map(
      (relationship) =>
        `  <Relationship Id="${relationship.id}" Type="${xmlAttribute(relationship.type)}" Target="${xmlAttribute(relationship.target)}"/>`,
    )
    .join("\n");
  return xmlDocument(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${body}
</Relationships>`);
}

function relationshipPartName(source: string | null): string {
  if (source === null) return "_rels/.rels";
  const separator = source.lastIndexOf("/");
  const directory = separator < 0 ? "" : source.slice(0, separator + 1);
  const basename = source.slice(separator + 1);
  return `${directory}_rels/${basename}.rels`;
}

function relationshipIdNumber(id: string): number {
  return Number(id.slice(3));
}

function expectedContentType(name: string): string | undefined {
  switch (name) {
    case "docProps/app.xml":
      return CONTENT_TYPES.app;
    case "docProps/core.xml":
      return CONTENT_TYPES.core;
    case "docProps/custom.xml":
      return CONTENT_TYPES.custom;
    case "ppt/presentation.xml":
      return CONTENT_TYPES.presentation;
    case "ppt/presProps.xml":
      return CONTENT_TYPES.presProps;
    case "ppt/slideLayouts/slideLayout1.xml":
      return CONTENT_TYPES.layout;
    case "ppt/slideMasters/slideMaster1.xml":
      return CONTENT_TYPES.master;
    case "ppt/theme/theme1.xml":
      return CONTENT_TYPES.theme;
    default:
      return /^ppt\/slides\/slide[1-9]\d*\.xml$/u.test(name)
        ? CONTENT_TYPES.slide
        : undefined;
  }
}

function validatePartName(name: string): void {
  if (
    name.length === 0 ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.includes("\\") ||
    name.includes("%") ||
    name.includes("?") ||
    name.includes("#") ||
    !/^[\x21-\x7e]+$/u.test(name)
  ) {
    graphFail(`OPC part name "${name}" is not canonical ASCII.`);
  }
  const segments = name.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9_.\-[\]]+$/u.test(segment),
    )
  ) {
    graphFail(`OPC part name "${name}" has a forbidden path segment.`);
  }
}

function resolveRelationshipTarget(
  source: string | null,
  target: string,
): string {
  if (
    target.length === 0 ||
    target.startsWith("/") ||
    target.includes("\\") ||
    target.includes("%") ||
    target.includes("?") ||
    target.includes("#") ||
    target.includes(":") ||
    !/^[\x21-\x7e]+$/u.test(target)
  ) {
    graphFail(
      `Relationship target "${target}" is not a canonical relative URI.`,
    );
  }
  const sourceDirectory =
    source === null || !source.includes("/")
      ? []
      : source.slice(0, source.lastIndexOf("/")).split("/");
  const resolved = [...sourceDirectory];
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") {
      graphFail(`Relationship target "${target}" has an empty/dot segment.`);
    }
    if (segment === "..") {
      if (resolved.length === 0) {
        graphFail(`Relationship target "${target}" escapes the package root.`);
      }
      resolved.pop();
      continue;
    }
    if (!/^[A-Za-z0-9_.\-[\]]+$/u.test(segment)) {
      graphFail(`Relationship target "${target}" has a forbidden segment.`);
    }
    resolved.push(segment);
  }
  const name = resolved.join("/");
  validatePartName(name);
  return name;
}

function relationshipKey(relationship: PptxCanaryRelationship): string {
  return [
    relationship.source ?? "<root>",
    relationship.id,
    relationship.type,
    relationship.target,
  ].join("\0");
}

function collectObjectIds(
  objects: readonly Vector180ResolvedObject[],
): readonly string[] {
  const ids: string[] = [];
  const visit = (siblings: readonly Vector180ResolvedObject[]): void => {
    for (const object of siblings) {
      ids.push(object.id);
      if (object.kind === "group") visit(object.children);
    }
  };
  visit(objects);
  return ids;
}

function allocateNumericIds(
  ids: readonly string[],
  scope: string,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const reverse = new Map<number, string>();
  for (const id of [...ids].sort(compareText)) {
    const numeric = 2 + (stableHash(id) % (MAX_SIGNED_INT_31 - 1));
    const collision = reverse.get(numeric);
    if (collision !== undefined && collision !== id) {
      fail(
        "VECTOR180-PPTX-ID-COLLISION",
        `Stable IDs "${collision}" and "${id}" collide at numeric ID ${numeric} in ${scope}.`,
      );
    }
    reverse.set(numeric, id);
    result.set(id, numeric);
  }
  return result;
}

function allocateSlideNumericIds(
  ids: readonly string[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const reverse = new Map<number, string>();
  for (const id of [...ids].sort(compareText)) {
    const numeric = 256 + (stableHash(id) % (MAX_SIGNED_INT_31 - 255));
    const collision = reverse.get(numeric);
    if (collision !== undefined && collision !== id) {
      fail(
        "VECTOR180-PPTX-ID-COLLISION",
        `Slides "${collision}" and "${id}" collide at numeric ID ${numeric}.`,
      );
    }
    reverse.set(numeric, id);
    result.set(id, numeric);
  }
  return result;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function scaledEmu(value: number, label: string): number {
  return scaledInteger(
    value,
    EMU_PER_UNIT,
    "VECTOR180-PPTX-NON-INTEGRAL-EMU",
    label,
  );
}

function coordinateEmu(value: number, label: string): number {
  const result = scaledEmu(value, label);
  assertCoordinateRange(result, label);
  return result;
}

function positiveExtentEmu(value: number, label: string): number {
  const result = scaledEmu(value, label);
  assertExtentRange(result, label, true);
  return result;
}

function lineWidthEmu(value: number, label: string): number {
  const result = scaledEmu(value, label);
  if (result < 0 || result > MAX_LINE_WIDTH_EMU) {
    fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `${label}=${result} is outside DrawingML line-width range.`,
    );
  }
  return result;
}

function fontHundredthPoints(value: number, label: string): number {
  const result = scaledInteger(
    value,
    HUNDREDTH_POINTS_PER_UNIT,
    "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    label,
  );
  if (result < 100 || result > MAX_FONT_HUNDREDTH_POINTS) {
    fail(
      "VECTOR180-PPTX-NON-INTEGRAL-FONT",
      `${label}=${result} is outside DrawingML font-size range.`,
    );
  }
  return result;
}

function spacingHundredthPoints(value: number, label: string): number {
  const result = scaledInteger(
    value,
    HUNDREDTH_POINTS_PER_UNIT,
    "VECTOR180-PPTX-NON-INTEGRAL-FONT",
    label,
  );
  if (result <= 0 || result > MAX_SPACING_HUNDREDTH_POINTS) {
    fail(
      "VECTOR180-PPTX-NON-INTEGRAL-FONT",
      `${label}=${result} is outside DrawingML point-spacing range.`,
    );
  }
  return result;
}

function assertCoordinateRange(value: number, label: string): void {
  if (value < MIN_COORDINATE_EMU || value > MAX_COORDINATE_EMU) {
    fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `${label}=${value} is outside DrawingML coordinate range.`,
    );
  }
}

function assertExtentRange(
  value: number,
  label: string,
  strictlyPositive: boolean,
): void {
  if (
    (strictlyPositive ? value <= 0 : value < 0) ||
    value > MAX_COORDINATE_EMU
  ) {
    fail(
      "VECTOR180-PPTX-UNSUPPORTED-GEOMETRY",
      `${label}=${value} is outside DrawingML extent range.`,
    );
  }
}

function scaledInteger(
  value: number,
  factor: number,
  code: PptxCanaryErrorCode,
  label: string,
): number {
  if (!Number.isFinite(value)) {
    fail("VECTOR180-PPTX-INVALID-MODEL", `${label} must be finite.`);
  }
  const result = value * factor;
  if (!Number.isSafeInteger(result)) {
    fail(
      code,
      `${label}=${canonicalNumber(value)} does not map exactly by factor ${factor}.`,
    );
  }
  return Object.is(result, -0) ? 0 : result;
}

function validateBounds(bounds: Vector180Bounds, label: string): void {
  finite(bounds.x, `${label}.x`);
  finite(bounds.y, `${label}.y`);
  finite(bounds.width, `${label}.width`);
  finite(bounds.height, `${label}.height`);
  if (bounds.width < 0 || bounds.height < 0) {
    invalidModel(`${label} has a negative extent.`);
  }
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) invalidModel(`${label} must be finite.`);
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    invalidModel(`${label} must be positive and finite.`);
  }
}

function validPaint(value: string): boolean {
  return value === "none" || /^#[0-9a-f]{6}$/u.test(value);
}

function sameBounds(left: Vector180Bounds, right: Vector180Bounds): boolean {
  return (
    sameNumber(left.x, right.x) &&
    sameNumber(left.y, right.y) &&
    sameNumber(left.width, right.width) &&
    sameNumber(left.height, right.height)
  );
}

function sameNumber(left: number, right: number): boolean {
  if (Object.is(left, right) || left === right) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 8;
}

function xmlDocument(root: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${root}\n`;
}

function xmlText(value: string): string {
  validateXmlCharacters(value);
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function drawingTextSpaceAttribute(value: string): string {
  return /^[\t\r\n ]|[\t\r\n ]$/u.test(value) ? ' xml:space="preserve"' : "";
}

function xmlAttribute(value: string): string {
  return xmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\t", "&#9;");
}

function validateXmlCharacters(value: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      !(
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      )
    ) {
      invalidModel("Source text contains a character forbidden by XML 1.0.");
    }
  }
}

function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function fixedZipDate(): Date {
  // JSZip 3.10.1 serializes UTC fields into timezone-free DOS fields.
  return new Date(FIXED_DATE_ISO);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function partNameOrder(left: string, right: string): number {
  const leftNumber = Number(left.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
  const rightNumber = Number(right.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
  return leftNumber - rightNumber;
}

function requiredMap<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    return fail(
      "VECTOR180-PPTX-INVALID-MODEL",
      "A required deterministic identity mapping is missing.",
    );
  }
  return value;
}

function invalidModel(message: string): never {
  return fail("VECTOR180-PPTX-INVALID-MODEL", message);
}

function graphFail(message: string): never {
  return fail("VECTOR180-PPTX-OPC-GRAPH", message);
}

function fail(code: PptxCanaryErrorCode, message: string): never {
  throw new PptxCanaryCompileError(code, message);
}

function assertNever(value: never): never {
  return fail(
    "VECTOR180-PPTX-UNSUPPORTED-OBJECT",
    `Unknown resolved object kind ${String(value)}.`,
  );
}
