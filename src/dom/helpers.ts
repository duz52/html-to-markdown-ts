/**
 * Port of github.com/JohannesKaufmann/dom — the traversal helpers the
 * converter is built on.
 *
 * "Node" functions return every node; "Element" functions skip anything that
 * is not an element (e.g. #text).
 */

import { Node, NodeType } from "./node.js";

// - - - - - - - - - - - - - Tag names - - - - - - - - - - - - - //

/**
 * Returns the goquery-style name of a node, e.g. "#text", "#comment", "div".
 */
export function nodeName(node: Node | null): string {
  if (node === null) {
    return "";
  }

  switch (node.type) {
    case NodeType.Error:
      return "#error";
    case NodeType.Text:
      return "#text";
    case NodeType.Document:
      return "#document";
    case NodeType.Comment:
      return "#comment";
    case NodeType.Doctype:
      // e.g. for `<!DOCTYPE html>` it would be "html"
      return node.data;
    case NodeType.Element:
      return node.data;
    default:
      return "";
  }
}

const inlineNodeNames = new Set([
  "#text", "a", "abbr", "acronym", "audio", "b", "bdi", "bdo", "big", "br",
  "button", "canvas", "cite", "code", "data", "datalist", "del", "dfn", "em",
  "embed", "i", "iframe", "img", "input", "ins", "kbd", "label", "map", "mark",
  "meter", "noscript", "object", "output", "picture", "progress", "q", "ruby",
  "s", "samp", "script", "select", "slot", "small", "span", "strong", "sub",
  "sup", "svg", "template", "textarea", "time", "u", "tt", "var", "video", "wbr",
]);

const blockNodeNames = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog", "dd",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main",
  "nav", "ol", "p", "pre", "section", "table", "ul",
]);

const headingNames = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export function nameIsInlineNode(name: string): boolean {
  return inlineNodeNames.has(name);
}

export function nameIsBlockNode(name: string): boolean {
  return blockNodeNames.has(name);
}

export function nameIsHeading(name: string): boolean {
  return headingNames.has(name);
}

// - - - - - - - - - - - - - Attributes - - - - - - - - - - - - - //

export function getAttribute(node: Node, key: string): string | undefined {
  for (const attr of node.attr) {
    if (attr.key === key) {
      return attr.val;
    }
  }
  return undefined;
}

export function getAttributeOr(node: Node, key: string, fallback: string): string {
  const val = getAttribute(node, key);
  return val === undefined ? fallback : val;
}

export function getClasses(node: Node): string[] {
  const val = getAttribute(node, "class");
  if (val === undefined) {
    return [];
  }
  // Go's strings.Fields splits around any run of whitespace.
  return val.split(/\s+/).filter((s) => s !== "");
}

export function hasClass(node: Node, expectedClass: string): boolean {
  return getClasses(node).includes(expectedClass);
}

export function hasID(node: Node, expectedID: string): boolean {
  const val = getAttribute(node, "id");
  if (val === undefined) {
    return false;
  }
  return val.trim() === expectedID;
}

export function collectText(node: Node): string {
  const parts: string[] = [];
  const walk = (n: Node): void => {
    if (n.type === NodeType.Text) {
      parts.push(n.data);
    }
    for (let c = n.firstChild; c !== null; c = c.nextSibling) {
      walk(c);
    }
  };
  walk(node);
  return parts.join("");
}

// - - - - - - - - - - - - - Traversal - - - - - - - - - - - - - //

/** Recursively collects every node in the tree, including the start node. */
export function allNodes(startNode: Node): Node[] {
  const collected: Node[] = [];
  const walk = (node: Node): void => {
    collected.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      walk(child);
    }
  };
  walk(startNode);
  return collected;
}

export function allChildNodes(node: Node): Node[] {
  const children: Node[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

export function allChildElements(node: Node): Node[] {
  const children: Node[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === NodeType.Element) {
      children.push(child);
    }
  }
  return children;
}

export function firstChildNode(node: Node): Node | null {
  return node.firstChild;
}

export function firstChildElement(node: Node): Node | null {
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.type === NodeType.Element) {
      return child;
    }
  }
  return null;
}

export function prevSiblingNode(node: Node): Node | null {
  return node.prevSibling;
}

export function prevSiblingElement(node: Node): Node | null {
  for (let sibling = node.prevSibling; sibling !== null; sibling = sibling.prevSibling) {
    if (sibling.type === NodeType.Element) {
      return sibling;
    }
  }
  return null;
}

export function nextSiblingNode(node: Node): Node | null {
  return node.nextSibling;
}

export function nextSiblingElement(node: Node): Node | null {
  for (let sibling = node.nextSibling; sibling !== null; sibling = sibling.nextSibling) {
    if (sibling.type === NodeType.Element) {
      return sibling;
    }
  }
  return null;
}

// - - - - - - - - - - - - - Neighbors - - - - - - - - - - - - - //

type StepFn = (node: Node) => Node | null;

/**
 * Builds a "next neighbor" function: it descends into children first, then
 * moves to the sibling, then walks up until it finds one.
 */
export function initGetNeighbor(
  firstChildFn: StepFn,
  prevNextFn: StepFn,
  goUpUntilFn: (node: Node) => boolean,
): StepFn {
  return (node: Node): Node | null => {
    // First look at the children
    const child = firstChildFn(node);
    if (child !== null) {
      return child;
    }

    // Otherwise my prev/next sibling
    const sibling = prevNextFn(node);
    if (sibling !== null) {
      return sibling;
    }

    let current: Node | null = node;
    for (;;) {
      // Finally, continuously go upwards until we find an element with a sibling
      current = current.parent;
      if (current === null) {
        // We reached the top
        return null;
      }
      if (goUpUntilFn(current)) {
        // Don't go too far up...
        return null;
      }
      const upSibling = prevNextFn(current);
      if (upSibling !== null) {
        return upSibling;
      }
    }
  };
}

const goUpForever = (): boolean => false;
const skipFirstChild = (): Node | null => null;

export function getPrevNeighborNode(node: Node): Node | null {
  return initGetNeighbor(firstChildNode, prevSiblingNode, goUpForever)(node);
}

export function getPrevNeighborElement(node: Node): Node | null {
  return initGetNeighbor(firstChildElement, prevSiblingElement, goUpForever)(node);
}

export function getPrevNeighborNodeExcludingOwnChild(node: Node): Node | null {
  return initGetNeighbor(skipFirstChild, prevSiblingNode, goUpForever)(node);
}

export function getPrevNeighborElementExcludingOwnChild(node: Node): Node | null {
  return initGetNeighbor(skipFirstChild, prevSiblingElement, goUpForever)(node);
}

export function getNextNeighborNode(node: Node): Node | null {
  return initGetNeighbor(firstChildNode, nextSiblingNode, goUpForever)(node);
}

export function getNextNeighborElement(node: Node): Node | null {
  return initGetNeighbor(firstChildElement, nextSiblingElement, goUpForever)(node);
}

export function getNextNeighborNodeExcludingOwnChild(node: Node): Node | null {
  return initGetNeighbor(skipFirstChild, nextSiblingNode, goUpForever)(node);
}

export function getNextNeighborElementExcludingOwnChild(node: Node): Node | null {
  return initGetNeighbor(skipFirstChild, nextSiblingElement, goUpForever)(node);
}

// - - - - - - - - - - - - - Find - - - - - - - - - - - - - //

export function findFirstNode(startNode: Node, matchFn: (node: Node) => boolean): Node | null {
  const nextFn = initGetNeighbor(
    firstChildNode,
    nextSiblingNode,
    // We should not get higher up than the startNode...
    (node) => node === startNode,
  );

  let child = startNode.firstChild;
  while (child !== null) {
    if (matchFn(child)) {
      return child;
    }
    child = nextFn(child);
  }
  return null;
}

export function findAllNodes(startNode: Node, matchFn: (node: Node) => boolean): Node[] {
  const nextFn = initGetNeighbor(
    firstChildNode,
    nextSiblingNode,
    (node) => node === startNode,
  );

  const found: Node[] = [];
  let child = startNode.firstChild;
  while (child !== null) {
    if (matchFn(child)) {
      found.push(child);
    }
    child = nextFn(child);
  }
  return found;
}

export function containsNode(startNode: Node, matchFn: (node: Node) => boolean): boolean {
  return findFirstNode(startNode, matchFn) !== null;
}

// - - - - - - - - - - - - - Mutation - - - - - - - - - - - - - //

export function removeNode(node: Node | null): void {
  if (node === null || node.parent === null) {
    return;
  }
  node.parent.removeChild(node);
}

export function replaceNode(node: Node, newNode: Node): void {
  if (node.parent === null || node === newNode) {
    return;
  }
  node.parent.insertBefore(newNode, node);
  node.parent.removeChild(node);
}

export function unwrapNode(node: Node | null): void {
  if (node === null || node.parent === null) {
    return;
  }

  // In each iteration we once again grab the first child, since
  // the previous first child was just removed.
  for (let child = node.firstChild; child !== null; child = node.firstChild) {
    node.removeChild(child);
    node.parent.insertBefore(child, node);
  }

  node.parent.removeChild(node);
}

/** Wraps newNode around existingNode and returns newNode. */
export function wrapNode(existingNode: Node, newNode: Node): Node {
  if (existingNode.parent === null) {
    return existingNode;
  }

  const parent = existingNode.parent;
  parent.insertBefore(newNode, existingNode);
  parent.removeChild(existingNode);
  newNode.appendChild(existingNode);

  return newNode;
}
