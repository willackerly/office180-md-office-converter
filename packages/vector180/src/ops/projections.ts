/**
 * JSON-safe, ordered Vector180 projections and queries.
 *
 * CONTRACT:C4-PPTV-SOURCE.2.0
 */

import { slideId } from "../core/manifest.js";
import type {
  DeckInventory,
  DeckInventoryObject,
  DeckOutline,
  AtomInventory,
  AtomInventoryObject,
  AtomObjectProjection,
  AtomOutline,
  AtomProjection,
  AtomQueryProjection,
  AtomTextProjection,
  ObjectProjection,
  ProjectionView,
  Vector180Deck,
  Vector180Atom,
  Vector180Manifest,
  Vector180Node,
  Vector180Query,
  SlideProjection,
  TextProjection,
  VisualWireFamily,
} from "../core/types.js";

export type Vector180AtomQuery = Omit<Vector180Query, "slideId">;

export function outlineManifest(
  manifest: Vector180Manifest,
  wireFamily: VisualWireFamily,
): DeckOutline {
  return {
    schema: "vector180-deck-outline/0.1",
    wireFamily,
    version: manifest.vector180,
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

export function outlineDeck(deck: Vector180Deck): DeckOutline {
  return outlineManifest(deck.manifest, deck.wireFamily);
}

export function outlineAtom(diagram: Vector180Atom): AtomOutline {
  return {
    schema: "vector180-atom-outline/0.1",
    wireFamily: diagram.wireFamily,
    version: diagram.version,
    atomId: diagram.id,
    viewBox: [...diagram.viewBox],
  };
}

export function inventoryDeck(deck: Vector180Deck): DeckInventory {
  return {
    schema: "vector180-deck-inventory/0.1",
    wireFamily: deck.wireFamily,
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

export function inventoryAtom(diagram: Vector180Atom): AtomInventory {
  return {
    schema: "vector180-atom-inventory/0.1",
    wireFamily: diagram.wireFamily,
    atomId: diagram.id,
    viewBox: [...diagram.viewBox],
    objects: diagram.children.map(inventoryAtomObject),
  };
}

export function getSlide(
  deck: Vector180Deck,
  id: string,
  view: ProjectionView = "semantic",
): SlideProjection | undefined {
  const slide = deck.slides.get(id);
  if (slide === undefined) return undefined;
  return {
    schema: "vector180-slide/0.1",
    wireFamily: deck.wireFamily,
    id: slide.id,
    ...(slide.layout === undefined ? {} : { layout: slide.layout }),
    hidden: slide.hidden,
    ...(view === "editing"
      ? { viewBox: [...slide.viewBox] as [number, number, number, number] }
      : {}),
    objects: slide.children.map((node) =>
      projectObject(node, view, deck.wireFamily),
    ),
  };
}

export function getAtom(
  diagram: Vector180Atom,
  view: ProjectionView = "semantic",
): AtomProjection {
  return {
    schema: "vector180-atom/0.1",
    wireFamily: diagram.wireFamily,
    atomId: diagram.id,
    viewBox: [...diagram.viewBox],
    objects: diagram.children.map((node) =>
      projectObject(node, view, diagram.wireFamily),
    ),
  };
}

export function getObject(
  deck: Vector180Deck,
  id: string,
  view: ProjectionView = "semantic",
): ObjectProjection | undefined {
  if (ambiguousObjectIds(deck).has(id)) return undefined;
  for (const slideIdValue of deck.slideOrder) {
    const slide = deck.slides.get(slideIdValue);
    if (slide === undefined) continue;
    const found = findNode(slide.children, id);
    if (found !== undefined) return projectObject(found, view, deck.wireFamily);
  }
  return undefined;
}

export function getAtomObject(
  diagram: Vector180Atom,
  id: string,
  view: ProjectionView = "semantic",
): AtomObjectProjection | undefined {
  if (ambiguousAtomObjectIds(diagram).has(id)) return undefined;
  const found = findNode(diagram.children, id);
  if (found === undefined) return undefined;
  return {
    schema: "vector180-atom-object/0.1",
    wireFamily: diagram.wireFamily,
    atomId: diagram.id,
    object: projectObject(found, view, diagram.wireFamily),
  };
}

export function queryObjects(
  deck: Vector180Deck,
  query: Vector180Query,
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
      result.push(projectObject(node, view, deck.wireFamily));
    });
  }
  return result;
}

export function queryAtomObjects(
  diagram: Vector180Atom,
  query: Vector180AtomQuery,
  view: ProjectionView = "semantic",
): AtomQueryProjection {
  const result: ObjectProjection[] = [];
  const idSet = query.ids === undefined ? undefined : new Set(query.ids);
  const ambiguousIds = ambiguousAtomObjectIds(diagram);
  if (
    query.descendantOf !== undefined &&
    ambiguousIds.has(query.descendantOf)
  ) {
    return {
      schema: "vector180-atom-query/0.1",
      wireFamily: diagram.wireFamily,
      atomId: diagram.id,
      objects: result,
    };
  }
  const nodesById =
    query.descendantOf === undefined ? undefined : indexNodes(diagram.children);
  visitNodes(diagram.children, (node) => {
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
    result.push(projectObject(node, view, diagram.wireFamily));
  });
  return {
    schema: "vector180-atom-query/0.1",
    wireFamily: diagram.wireFamily,
    atomId: diagram.id,
    objects: result,
  };
}

function ambiguousObjectIds(deck: Vector180Deck): Set<string> {
  return new Set(
    deck.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "VECTOR180-ID-DUPLICATE" &&
      diagnostic.objectId !== undefined
        ? [diagnostic.objectId]
        : [],
    ),
  );
}

function ambiguousAtomObjectIds(diagram: Vector180Atom): Set<string> {
  return new Set(
    diagram.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "VECTOR180-ID-DUPLICATE" &&
      diagnostic.objectId !== undefined
        ? [diagnostic.objectId]
        : [],
    ),
  );
}

export function extractText(
  deck: Vector180Deck,
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
          wireFamily: deck.wireFamily,
          slideId: slideIdValue,
          objectId: node.id,
          text: node.text,
        });
      }
    });
  }
  return {
    schema: "vector180-deck-text/0.1",
    wireFamily: deck.wireFamily,
    entries,
  };
}

export function extractAtomText(diagram: Vector180Atom): AtomTextProjection {
  const entries: AtomTextProjection["entries"] = [];
  visitNodes(diagram.children, (node) => {
    if (node.role === "text" && node.text !== undefined) {
      entries.push({
        wireFamily: diagram.wireFamily,
        atomId: diagram.id,
        objectId: node.id,
        text: node.text,
      });
    }
  });
  return {
    schema: "vector180-atom-text/0.1",
    wireFamily: diagram.wireFamily,
    atomId: diagram.id,
    entries,
  };
}

function projectObject(
  node: Vector180Node,
  view: ProjectionView,
  wireFamily: VisualWireFamily,
): ObjectProjection {
  return {
    wireFamily,
    id: node.id,
    role: node.role,
    export: node.exportMode,
    element: node.elementName,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.map((child) =>
      projectObject(child, view, wireFamily),
    ),
    ...(view === "editing"
      ? {
          classes: [...node.classes],
          attributes: { ...node.attributes },
          sourceRange: { ...node.sourceRange },
        }
      : {}),
  };
}

function inventoryObject(node: Vector180Node): DeckInventoryObject {
  return {
    id: node.id,
    role: node.role,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.map(inventoryObject),
  };
}

function inventoryAtomObject(node: Vector180Node): AtomInventoryObject {
  return {
    id: node.id,
    role: node.role,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.map(inventoryAtomObject),
  };
}

function findNode(
  nodes: readonly Vector180Node[],
  id: string,
): Vector180Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function visitNodes(
  nodes: readonly Vector180Node[],
  visitor: (node: Vector180Node) => void,
): void {
  for (const node of nodes) {
    visitor(node);
    visitNodes(node.children, visitor);
  }
}

function isDescendantOf(
  node: Vector180Node,
  ancestorId: string,
  nodesById: ReadonlyMap<string, Vector180Node>,
): boolean {
  let current = node.parentId;
  while (current !== null) {
    if (current === ancestorId) return true;
    current = nodesById.get(current)?.parentId ?? null;
  }
  return false;
}

function indexNodes(
  roots: readonly Vector180Node[],
): Map<string, Vector180Node> {
  const result = new Map<string, Vector180Node>();
  visitNodes(roots, (node) => {
    if (!result.has(node.id)) result.set(node.id, node);
  });
  return result;
}
