/**
 * JSON-safe, ordered PPTV projections and queries.
 *
 * CONTRACT:C4-PPTV-SOURCE.1.0
 */

import { slideId } from "../core/manifest.js";
import type {
  DeckInventory,
  DeckInventoryObject,
  DeckOutline,
  ObjectProjection,
  ProjectionView,
  PptvDeck,
  PptvManifest,
  PptvNode,
  PptvQuery,
  SlideProjection,
  TextProjection,
} from "../core/types.js";

export function outlineManifest(manifest: PptvManifest): DeckOutline {
  return {
    schema: "pptv-outline/0.1",
    version: manifest.pptv,
    ...(manifest.title === undefined ? {} : { title: manifest.title }),
    ...(manifest.theme === undefined ? {} : { activeTheme: manifest.theme }),
    slides: manifest.slides.map((slide) => ({
      id: slideId(slide),
      ...(typeof slide === "string" || slide.layout === undefined
        ? {}
        : { layout: slide.layout }),
      hidden: typeof slide === "string" ? false : (slide.hidden ?? false),
    })),
  };
}

export function outlineDeck(deck: PptvDeck): DeckOutline {
  return outlineManifest(deck.manifest);
}

export function inventoryDeck(deck: PptvDeck): DeckInventory {
  return {
    schema: "pptv-inventory/0.1",
    slides: deck.slideOrder.flatMap((id) => {
      const slide = deck.slides.get(id);
      if (slide === undefined) return [];
      return [
        {
          id: slide.id,
          ...(slide.layout === undefined ? {} : { layout: slide.layout }),
          hidden: slide.hidden,
          objects: slide.children.map(inventoryObject),
        },
      ];
    }),
  };
}

export function getSlide(
  deck: PptvDeck,
  id: string,
  view: ProjectionView = "semantic",
): SlideProjection | undefined {
  const slide = deck.slides.get(id);
  if (slide === undefined) return undefined;
  return {
    schema: "pptv-slide/0.1",
    id: slide.id,
    ...(slide.layout === undefined ? {} : { layout: slide.layout }),
    hidden: slide.hidden,
    ...(view === "editing"
      ? { viewBox: [...slide.viewBox] as [number, number, number, number] }
      : {}),
    objects: slide.children.map((node) => projectObject(node, view)),
  };
}

export function getObject(
  deck: PptvDeck,
  id: string,
  view: ProjectionView = "semantic",
): ObjectProjection | undefined {
  if (ambiguousObjectIds(deck).has(id)) return undefined;
  for (const slideIdValue of deck.slideOrder) {
    const slide = deck.slides.get(slideIdValue);
    if (slide === undefined) continue;
    const found = findNode(slide.children, id);
    if (found !== undefined) return projectObject(found, view);
  }
  return undefined;
}

export function queryObjects(
  deck: PptvDeck,
  query: PptvQuery,
  view: ProjectionView = "semantic",
): ObjectProjection[] {
  const result: ObjectProjection[] = [];
  const idSet = query.ids === undefined ? undefined : new Set(query.ids);
  const ambiguousIds = ambiguousObjectIds(deck);
  if (
    query.descendantOf !== undefined &&
    ambiguousIds.has(query.descendantOf)
  ) {
    return result;
  }
  for (const slideIdValue of deck.slideOrder) {
    if (query.slideId !== undefined && query.slideId !== slideIdValue) continue;
    const slide = deck.slides.get(slideIdValue);
    if (slide === undefined) continue;
    const nodesById =
      query.descendantOf === undefined ? undefined : indexNodes(slide.children);
    visitNodes(slide.children, (node) => {
      if (ambiguousIds.has(node.id)) return;
      if (idSet !== undefined && !idSet.has(node.id)) return;
      if (query.role !== undefined && node.role !== query.role) return;
      if (
        query.className !== undefined &&
        !node.classes.includes(query.className)
      )
        return;
      if (
        query.elementName !== undefined &&
        node.elementName !== query.elementName
      )
        return;
      if (
        query.textContains !== undefined &&
        !node.text?.toLowerCase().includes(query.textContains.toLowerCase())
      ) {
        return;
      }
      if (
        query.descendantOf !== undefined &&
        (nodesById === undefined ||
          !isDescendantOf(node, query.descendantOf, nodesById))
      ) {
        return;
      }
      result.push(projectObject(node, view));
    });
  }
  return result;
}

function ambiguousObjectIds(deck: PptvDeck): Set<string> {
  return new Set(
    deck.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "PPTV-ID-DUPLICATE" &&
      diagnostic.objectId !== undefined
        ? [diagnostic.objectId]
        : [],
    ),
  );
}

export function extractText(
  deck: PptvDeck,
  options: { slideId?: string; includeHidden?: boolean } = {},
): TextProjection {
  const entries: TextProjection["entries"] = [];
  for (const slideIdValue of deck.slideOrder) {
    if (options.slideId !== undefined && options.slideId !== slideIdValue)
      continue;
    const slide = deck.slides.get(slideIdValue);
    if (slide === undefined || (slide.hidden && options.includeHidden !== true))
      continue;
    visitNodes(slide.children, (node) => {
      if (node.role === "text" && node.text !== undefined) {
        entries.push({
          slideId: slideIdValue,
          objectId: node.id,
          text: node.text,
        });
      }
    });
  }
  return { schema: "pptv-text/0.1", entries };
}

function projectObject(node: PptvNode, view: ProjectionView): ObjectProjection {
  return {
    id: node.id,
    role: node.role,
    export: node.exportMode,
    element: node.elementName,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.map((child) => projectObject(child, view)),
    ...(view === "editing"
      ? {
          classes: [...node.classes],
          attributes: { ...node.attributes },
          sourceRange: { ...node.sourceRange },
        }
      : {}),
  };
}

function inventoryObject(node: PptvNode): DeckInventoryObject {
  return {
    id: node.id,
    role: node.role,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.map(inventoryObject),
  };
}

function findNode(
  nodes: readonly PptvNode[],
  id: string,
): PptvNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function visitNodes(
  nodes: readonly PptvNode[],
  visitor: (node: PptvNode) => void,
): void {
  for (const node of nodes) {
    visitor(node);
    visitNodes(node.children, visitor);
  }
}

function isDescendantOf(
  node: PptvNode,
  ancestorId: string,
  nodesById: ReadonlyMap<string, PptvNode>,
): boolean {
  let current = node.parentId;
  while (current !== null) {
    if (current === ancestorId) return true;
    current = nodesById.get(current)?.parentId ?? null;
  }
  return false;
}

function indexNodes(roots: readonly PptvNode[]): Map<string, PptvNode> {
  const result = new Map<string, PptvNode>();
  visitNodes(roots, (node) => {
    if (!result.has(node.id)) result.set(node.id, node);
  });
  return result;
}
